#!/usr/bin/env python3
"""validate.py - deterministic contract enforcement for the Building Tomorrow pipeline.

Routines are LLM prompts, so nothing stops a stage from emitting malformed or rule-breaking
JSON except this tool. Every stage output must pass `validate.py stage` before the next stage
runs. Everything here is pure local checking: no network, no writes.

Usage:
    python tools/validate.py all                          # repo health: every JSON/JSONL/schema/template
    python tools/validate.py stage strategist FILE
    python tools/validate.py stage copywriter FILE [--strategist S.json]
    python tools/validate.py stage art_director FILE [--copy C.json] [--strategist S.json]
    python tools/validate.py stage critic FILE
    python tools/validate.py stage template_proposer FILE
    python tools/validate.py grounding COPY.json          # quotes + chapter refs exist in chapters/
    python tools/validate.py bank                         # content bank schema + verbatim grounding of atoms
Add --json to any command for machine-readable output. Exit 0 = valid, 1 = invalid, 2 = usage error.
"""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover
    sys.exit("jsonschema is required: pip install -r requirements.txt")

ROOT = Path(__file__).resolve().parents[1]
ROLES = ["strategist", "copywriter", "art_director", "critic", "template_proposer"]


# --------------------------------------------------------------------------- helpers
def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def config():
    return load_json(ROOT / "config" / "pipeline.json")


def schema_errors(obj, schema):
    v = Draft7Validator(schema)
    out = []
    for e in sorted(v.iter_errors(obj), key=lambda e: list(e.absolute_path)):
        loc = "/".join(str(p) for p in e.absolute_path) or "(root)"
        out.append(f"{loc}: {e.message}")
    return out


def norm(s):
    """Normalise quotes/dashes/whitespace/case so a verbatim check ignores typography only."""
    s = (s.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-").replace("…", "..."))
    s = re.sub(r"\s+", " ", s).strip().strip("\"'").strip()
    return s.casefold()


def chapter_text(n):
    p = ROOT / "books" / "building_tomorrow" / "chapters" / f"ch{n:02d}.md"
    if not p.exists():
        return None
    return norm(re.sub(r"\[\[p\.[^\]]*\]\]", " ", p.read_text(encoding="utf-8")))  # page markers never break a quote


def string_leaves(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from string_leaves(v)
    elif isinstance(x, list):
        for v in x:
            yield from string_leaves(v)


def bank():
    return load_json(ROOT / "books" / "building_tomorrow" / "content_bank.json")


def find_atom(atom_id):
    for a in bank()["atoms"]:
        if a["atom_id"] == atom_id:
            return a
    return None


# --------------------------------------------------------------------------- semantic checks per stage
def sem_strategist(obj, ctx):
    errs = []
    atom = find_atom(obj["atom_id"])
    if atom is None:
        return [f"atom_id: '{obj['atom_id']}' not found in content_bank.json"]
    if atom["state"]["status"] != "unused":
        errs.append(f"atom_id: atom is '{atom['state']['status']}', strategist may only pick 'unused'")
    if obj["format"] not in atom["suitable_formats"]:
        errs.append(f"format: '{obj['format']}' not in atom.suitable_formats {atom['suitable_formats']}")
    want = {"child_teen": "children", "parent_teacher": None}[obj["audience_track"]]
    aud = set(atom["audience"])
    if want and want not in aud:
        errs.append(f"audience_track: child_teen needs atom audience to include 'children' (has {sorted(aud)})")
    if want is None and not (aud & {"parents", "teachers"}):
        errs.append(f"audience_track: parent_teacher needs atom audience to include parents/teachers (has {sorted(aud)})")
    if obj["format"] == "single_post" and obj.get("slide_count", 1) != 1:
        errs.append("slide_count: must be 1 (or omitted) for single_post")
    return errs


def sem_copywriter(obj, ctx):
    errs = []
    slides = obj["slides"]
    if [s["n"] for s in slides] != list(range(1, len(slides) + 1)):
        errs.append("slides: 'n' must run 1..N in order with no gaps")
    for s in slides:
        em = s.get("emphasis_text")
        if em and em not in s.get("headline", "") and em not in s["text"]:
            errs.append(f"slides[{s['n']}].emphasis_text: '{em}' does not appear verbatim in that slide's headline or text")
        if s["n"] == 1 and not s.get("headline"):
            errs.append("slides[1].headline: required on slide 1 (the hook)")
    if slides and slides[0]["role"] != "hook":
        errs.append("slides[1].role: first slide must have role 'hook'")
    if obj["caption"] != re.sub(r"(?m)^\s*#\w+.*$", "", obj["caption"]).strip():
        errs.append("caption: contains hashtags in the body; hashtags belong only in the 'hashtags' field")
    if re.search(r"</?\w+[^>]*>|&amp;|&lt;|&gt;", obj["caption"]):
        errs.append("caption: contains HTML/entities; captions must be plain text")
    strat = ctx.get("strategist")
    if strat:
        if obj["atom_id"] != strat["atom_id"]:
            errs.append(f"atom_id: '{obj['atom_id']}' differs from strategist's '{strat['atom_id']}'")
        want = strat["slide_count"] if strat["format"] == "carousel" else 1
        if len(slides) != want:
            errs.append(f"slides: {len(slides)} slides but strategist asked for {want}")
    return errs


def sem_art_director(obj, ctx):
    errs = []
    cfg = config()
    tdir = ROOT / cfg["paths"]["templates_active"] / obj["template_id"]
    meta_path = tdir / "metadata.json"
    if not meta_path.exists():
        return [f"template_id: '{obj['template_id']}' is not in templates/active/"]
    meta = load_json(meta_path)
    strat = ctx.get("strategist")
    if strat and strat["format"] not in meta.get("formats", []):
        errs.append(f"template_id: template supports {meta.get('formats')} but post is '{strat['format']}'")
    layout_ids = {l["id"] for l in meta.get("layouts", [])}
    for spec in obj["per_slide_layout_spec"]:
        if spec["layout"] not in layout_ids:
            errs.append(f"per_slide_layout_spec[{spec['slide']}].layout: '{spec['layout']}' not in template layouts {sorted(layout_ids)}")
    slots = meta.get("slots", {})
    for key, val in obj["slot_choices"].items():
        allowed = slots.get(key)
        if allowed is not None and val not in allowed:
            errs.append(f"slot_choices.{key}: '{val}' not supported by template (allowed {allowed})")
    ds = load_json(ROOT / "brand" / "design_system.json")
    accents = {a["id"] for a in ds["palette"]["accent_variants"]}
    if obj["slot_choices"]["accent_color"] not in accents:
        errs.append(f"slot_choices.accent_color: '{obj['slot_choices']['accent_color']}' is not an accent id {sorted(accents)}")
    # cooldown
    mem = load_json(ROOT / "state" / "design-memory.json")
    cool = cfg["rotation"]["template_cooldown_posts"]
    recent = mem["recent_template_ids"][-cool:]
    active = [p.name for p in (ROOT / cfg["paths"]["templates_active"]).iterdir() if (p / "metadata.json").exists()]
    if obj["template_id"] in recent and len(active) > cool:
        errs.append(f"template_id: '{obj['template_id']}' was used in the last {cool} posts {recent}; cooldown violated")
    # design bank
    manifest = load_json(ROOT / cfg["paths"]["design_bank_manifest"])
    bank_ids = {a["id"] for a in manifest.get("assets", [])}
    for spec in obj["per_slide_layout_spec"]:
        aid = spec.get("design_bank_asset_id")
        if aid and aid not in bank_ids:
            errs.append(f"per_slide_layout_spec[{spec['slide']}].design_bank_asset_id: '{aid}' not in design bank manifest")
        p = spec.get("image_prompt") or ""
        if re.search(r"\b(text|words?|letters?|typography|logo|caption|title)\b", p, re.I):
            errs.append(f"per_slide_layout_spec[{spec['slide']}].image_prompt: must not ask for text, letters or logos in generated imagery")
    copy = ctx.get("copy")
    if copy:
        by_n = {s["n"]: s for s in copy["slides"]}
        if {s["slide"] for s in obj["per_slide_layout_spec"]} != set(by_n):
            errs.append("per_slide_layout_spec: slide numbers do not match the copy's slides")
        for spec in obj["per_slide_layout_spec"]:
            em, s = spec.get("emphasis_text"), by_n.get(spec["slide"])
            if em and s and em not in s.get("headline", "") and em not in s["text"]:
                errs.append(f"per_slide_layout_spec[{spec['slide']}].emphasis_text: not a substring of the slide's headline or text")
    return errs


def sem_critic(obj, ctx):
    errs = []
    cfg = config()["qa"]
    sev = [i.get("severity") for i in obj["issues"]]
    if obj["verdict"] == "pass":
        if obj["score"] < cfg["pass_score"]:
            errs.append(f"verdict: 'pass' with score {obj['score']} < pass_score {cfg['pass_score']}")
        if any(s in ("blocker", "major") for s in sev):
            errs.append("verdict: 'pass' cannot carry blocker or major issues")
    else:
        if not obj["issues"]:
            errs.append("issues: a 'revise' or 'fail' verdict must list at least one issue")
        if obj["verdict"] == "fail" and not any(i["route_to"] == "human" for i in obj["issues"]):
            errs.append("issues: a 'fail' verdict must include at least one issue routed to 'human'")
    if obj["attempt"] > cfg["max_revision_cycles"]:
        errs.append(f"attempt: {obj['attempt']} exceeds max_revision_cycles {cfg['max_revision_cycles']}; escalate instead")
    for i in obj["issues"]:
        if i["route_to"] == "copywriter" and i["layer"] in ("design",):
            errs.append(f"issue '{i['issue'][:40]}': layer 'design' should not route to the copywriter")
    return errs


def sem_template_proposer(obj, ctx):
    errs = []
    if obj["classification"] != "new_canonical" and not obj.get("matched_template_id"):
        errs.append("matched_template_id: required when classification is not new_canonical")
    if obj["classification"] == "new_canonical" and not obj.get("proposed_template"):
        errs.append("proposed_template: required when classification is new_canonical")
    if obj["classification"] == "duplicate_of_existing" and obj.get("proposed_template"):
        errs.append("proposed_template: must be null for a duplicate")
    return errs


SEMANTIC = {
    "strategist": sem_strategist, "copywriter": sem_copywriter, "art_director": sem_art_director,
    "critic": sem_critic, "template_proposer": sem_template_proposer,
}


# --------------------------------------------------------------------------- grounding
def grounding_errors_for_copy(copy):
    errs = []
    for q in copy.get("verbatim_quotes", []):
        ch = chapter_text(q["chapter"])
        if ch is None:
            errs.append(f"quote '{q['text'][:40]}...': chapters/ch{q['chapter']:02d}.md does not exist")
        elif norm(q["text"]) not in ch:
            errs.append(f"quote '{q['text'][:60]}...': NOT found verbatim in chapter {q['chapter']}")
    for n in copy.get("chapter_references", []):
        if chapter_text(n) is None:
            errs.append(f"chapter_references: chapter {n} has no chapter file, so the reference cannot be verified")
    # every quoted span in the copy must be declared
    declared = [norm(q["text"]) for q in copy.get("verbatim_quotes", [])]
    blobs = [s.get(k, "") for s in copy["slides"] for k in ("kicker", "headline", "text", "note")] + [copy["caption"]]
    for blob in blobs:
        for m in re.finditer(r"[“\"]([^”\"]{12,})[”\"]", blob):
            span = norm(m.group(1))
            if not any(span in d or d in span for d in declared):
                errs.append(f"quoted text '{m.group(1)[:50]}...' appears in copy but is not declared in verbatim_quotes")
    # spelled-out chapter mentions must be declared
    declared_ch = set(copy.get("chapter_references", []))
    for blob in blobs:
        # the manuscript is organised in 'Sections'; both words count as a chapter reference (chapter N == Section N)
        for m in re.finditer(r"\b(chapter|section)\s+(\d{1,2})\b", blob, re.I):
            if int(m.group(2)) not in declared_ch:
                errs.append(f"'{m.group(1).title()} {m.group(2)}' is mentioned in copy but not listed in chapter_references")
    return errs


def bank_errors():
    errs = []
    schema = load_json(ROOT / "books" / "building_tomorrow" / "content_bank.schema.json")
    b = bank()
    errs += schema_errors(b, schema)
    seen = set()
    for a in b["atoms"]:
        if a["atom_id"] in seen:
            errs.append(f"{a['atom_id']}: duplicate atom_id")
        seen.add(a["atom_id"])
        if not a["atom_id"].startswith(f"bt_ch{a['chapter']:02d}_"):
            errs.append(f"{a['atom_id']}: id prefix does not match chapter {a['chapter']}")
        if a["state"]["status"] in ("queued", "published") and not a["state"].get("post_id"):
            errs.append(f"{a['atom_id']}: status '{a['state']['status']}' requires state.post_id")
        if a["source_grounding"] == "workbook_verbatim":
            ch = chapter_text(a["chapter"])
            if ch is None:
                errs.append(f"{a['atom_id']}: chapter file ch{a['chapter']:02d}.md missing, cannot verify verbatim atom")
                continue
            for leaf in string_leaves(a["content"]):
                if len(leaf.strip()) >= 2 and norm(leaf) not in ch:
                    errs.append(f"{a['atom_id']}: content string '{leaf[:50]}' not found verbatim in chapter {a['chapter']}")
    return errs


# --------------------------------------------------------------------------- repo health
def repo_errors():
    errs = []

    def guard(label, fn):
        try:
            errs.extend(f"{label}: {e}" for e in fn())
        except Exception as ex:  # parse errors etc.
            errs.append(f"{label}: {type(ex).__name__}: {ex}")

    for role in ROLES:
        p = ROOT / "agents" / "schemas" / f"{role}.schema.json"
        guard(f"agents/schemas/{role}.schema.json", lambda p=p: _check_schema_valid(p))
    guard("content_bank", bank_errors)
    st = ROOT / "state"
    for name, sch in [("post-lifecycle", "post-lifecycle"), ("design-memory", "design-memory"),
                      ("media-ledger", "media-ledger"), ("story-queue", "story-queue")]:
        guard(f"state/{name}.json", lambda name=name, sch=sch: schema_errors(load_json(st / f"{name}.json"), load_json(st / "schemas" / f"{sch}.schema.json")))
    for name in ("qa-calibration", "published-embeddings"):
        guard(f"state/{name}.jsonl", lambda name=name: _check_jsonl(st / f"{name}.jsonl", st / "schemas" / f"{name}.line.schema.json"))
    for rel in ("config/pipeline.json", "brand/design_system.json", "assets/design-bank/manifest.json",
                "assets/design-bank/templates/manifest.json"):
        guard(rel, lambda rel=rel: (load_json(ROOT / rel), [])[1])
    guard("lifecycle_vs_bank", _cross_check_lifecycle)
    guard("templates", _check_templates)
    return errs


def _check_schema_valid(p):
    Draft7Validator.check_schema(load_json(p))
    return []


def _check_jsonl(path, schema_path):
    schema = load_json(schema_path)
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                out.append(f"line {i}: invalid JSON ({e})")
                continue
            out += [f"line {i}: {e}" for e in schema_errors(obj, schema)]
    return out


def _cross_check_lifecycle():
    out = []
    posts = load_json(ROOT / "state" / "post-lifecycle.json")["posts"]
    atoms = {a["atom_id"]: a for a in bank()["atoms"]}
    for pid, p in posts.items():
        if p["atom_id"] not in atoms:
            out.append(f"{pid}: atom_id '{p['atom_id']}' not in content bank")
    return out


def _check_templates():
    out = []
    schema = load_json(ROOT / "templates" / "metadata.schema.json")
    for bucket in ("active", "proposed", "archived"):
        for meta in (ROOT / "templates" / bucket).glob("*/metadata.json"):
            obj = load_json(meta)
            out += [f"{bucket}/{meta.parent.name}: {e}" for e in schema_errors(obj, schema)]
            if obj.get("id") != meta.parent.name:
                out.append(f"{bucket}/{meta.parent.name}: metadata id '{obj.get('id')}' must equal the folder name")
    return out


# --------------------------------------------------------------------------- CLI
def report(errs, as_json, label):
    if as_json:
        print(json.dumps({"target": label, "valid": not errs, "errors": errs}, indent=2))
    elif errs:
        print(f"INVALID  {label}  ({len(errs)} problem{'s' if len(errs) != 1 else ''})")
        for e in errs:
            print(f"  - {e}")
    else:
        print(f"OK       {label}")
    return 1 if errs else 0


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("all")
    sub.add_parser("bank")
    g = sub.add_parser("grounding"); g.add_argument("file")
    s = sub.add_parser("stage"); s.add_argument("role", choices=ROLES); s.add_argument("file")
    s.add_argument("--strategist"); s.add_argument("--copy")
    args = ap.parse_args(argv)

    if args.cmd == "all":
        return report(repo_errors(), args.json, "repository")
    if args.cmd == "bank":
        return report(bank_errors(), args.json, "content bank")
    if args.cmd == "grounding":
        return report(grounding_errors_for_copy(load_json(args.file)), args.json, f"grounding {args.file}")
    try:
        obj = load_json(args.file)
    except (OSError, json.JSONDecodeError) as e:
        return report([f"cannot read JSON: {e}"], args.json, args.file)
    errs = schema_errors(obj, load_json(ROOT / "agents" / "schemas" / f"{args.role}.schema.json"))
    if not errs:  # semantic checks assume a schema-valid object
        ctx = {}
        if args.strategist:
            ctx["strategist"] = load_json(args.strategist)
        if args.copy:
            ctx["copy"] = load_json(args.copy)
        errs = SEMANTIC[args.role](obj, ctx)
    return report(errs, args.json, f"{args.role} {args.file}")


if __name__ == "__main__":
    sys.exit(main())
