#!/usr/bin/env python3
"""compose_post.py - the deterministic renderer. JSON in, PNGs out. No model calls.

Turns copywriter.json + art_director.json into slide PNGs by calling the chosen template's render.py.
Adapted from the MAS compose_post.py CLI shape (one script, explicit args, prints what it wrote).

Usage:
    python tools/compose_post.py --copy copywriter.json --spec art_director.json --out-dir content/drafts/<id>/render
    python tools/compose_post.py --sample --template numbered_notes --out-dir /tmp/preview \
        [--accent crimson --background textured --emphasis highlight --imagery illustration]

Exit codes: 0 ok | 2 usage/config error | 3 content does not fit the layout (route to copywriter/art_director).
Writes slide_01.png..., and render_report.json (text boxes, contrast pairs, fonts, warnings, sha256) for visual_qa.py.
On-image copy = kicker + headline + text + note, printed verbatim (layouts may upper-case a headline; they never rewrite it).
"""
import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import render_lib as RL  # noqa: E402

SAMPLE_SLIDES = {
    "cover": {"n": 1, "role": "hook", "kicker": "Before you react…", "headline": "Big feelings are messengers, not problems.",
              "text": "Here is how to hear what yours are saying.", "note": "Swipe to see how", "emphasis_text": "messengers"},
    "content": {"n": 2, "role": "body", "headline": "What is this feeling asking for?",
                "text": "Every strong feeling points at something you care about.\n\n"
                        "→ Notice where you feel it\n→ Name it in one word\n→ Ask what it needs\n\n"
                        "> A feeling you listen to gets quieter.",
                "emphasis_text": "asking"},
    "quote": {"n": 1, "role": "hook", "kicker": "Sample layout text", "headline": "Feelings are signals from your inner world, not verdicts.",
              "text": "Sample attribution\nA second sample line for the layout", "note": "Save for later", "emphasis_text": "signals"},
}


def load_meta(template_id, bucket=None):
    for b in ([bucket] if bucket else ["active", "proposed"]):
        p = ROOT / "templates" / b / template_id / "metadata.json"
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8")), p.parent
    raise FileNotFoundError(f"template '{template_id}' not found in templates/active or proposed")


def load_renderer(tdir):
    p = tdir / "render.py"
    if not p.exists():
        raise FileNotFoundError(f"{p} missing (template is spec_only?)")
    spec = importlib.util.spec_from_file_location(f"tpl_{tdir.name}", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def render_post(slides, layout_specs, slots, meta, tdir, out_dir, post_id="sample"):
    mod = load_renderer(tdir)
    fmt = meta["formats"][0] if len(meta["formats"]) == 1 else ("carousel" if len(slides) > 1 else "single_post")
    canvas = tuple(meta.get("canvas") or RL.canvas_size(fmt))
    by_slide = {s["slide"]: s for s in layout_specs}
    layouts = [by_slide[s["n"]]["layout"] for s in slides]
    out = {"post_id": post_id, "template_id": meta["id"], "canvas": list(canvas), "slots": slots, "status": "ok", "slides": []}
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    max_words = {l["id"]: l.get("max_words") for l in meta["layouts"]}
    try:
        for s in slides:
            limit = max_words.get(by_slide[s["n"]]["layout"])
            words = sum(len([w for w in s.get(k, "").split() if w not in ("→", ">")]) for k in ("kicker", "headline", "text", "note"))
            if limit and words > limit:
                raise RL.RenderError(f"copy has {words} words but layout '{by_slide[s['n']]['layout']}' allows {limit}; cut {words - limit}")
            report = RL.RenderReport()
            ctx = {"slide": s, "spec": by_slide[s["n"]], "slots": slots, "n": s["n"], "total": len(slides),
                   "layouts": layouts, "roles": [x["role"] for x in slides], "canvas": canvas, "report": report, "meta": meta}
            img = mod.render_slide(ctx)
            if img.size != canvas:
                raise RL.RenderError(f"slide {s['n']}: template returned {img.size}, expected {canvas}")
            path = out_dir / f"slide_{s['n']:02d}.png"
            RL.save_rgb(img, path)
            out["slides"].append({"n": s["n"], "file": path.name, "layout": by_slide[s["n"]]["layout"],
                                  "sha256": sha256(path), **report.as_dict()})
    except RL.RenderError as e:
        out["status"] = "overflow"
        out["error"] = f"slide {s['n']}: {e}"
    (out_dir / "render_report.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--copy"); ap.add_argument("--spec"); ap.add_argument("--out-dir", required=True)
    ap.add_argument("--sample", action="store_true"); ap.add_argument("--template")
    ap.add_argument("--accent", default="crimson"); ap.add_argument("--background", default="textured")
    ap.add_argument("--emphasis", default="highlight"); ap.add_argument("--imagery", default="illustration")
    ap.add_argument("--slides", type=int, default=3, help="carousel sample length")
    a = ap.parse_args(argv)
    try:
        if a.sample:
            meta, tdir = load_meta(a.template)
            slots = {"background": a.background, "accent_color": a.accent, "emphasis_style": a.emphasis, "imagery_type": a.imagery}
            layouts = meta["layouts"]
            if "carousel" in meta["formats"] and len(layouts) > 1:
                slides = [dict(SAMPLE_SLIDES["cover"])] + [dict(SAMPLE_SLIDES["content"], n=i) for i in range(2, a.slides + 1)]
                lay = [layouts[0]["id"]] + [layouts[1]["id"]] * (a.slides - 1)
            else:
                slides = [dict(SAMPLE_SLIDES["quote"])]
                lay = [layouts[0]["id"]]
            # keep placeholder copy inside each layout's word limit: drop optional extras until it fits
            lim = {l["id"]: l.get("max_words") for l in layouts}
            for s, l in zip(slides, lay):
                count = lambda: sum(len(s.get(k, "").split()) for k in ("kicker", "headline", "text", "note"))
                for drop in ("note", "kicker"):
                    if lim.get(l) and count() > lim[l]:
                        s.pop(drop, None)
                if lim.get(l) and count() > lim[l]:
                    s["text"] = s["text"].split("\n")[0]
            specs = [{"slide": s["n"], "layout": l} for s, l in zip(slides, lay)]
            res = render_post(slides, specs, slots, meta, tdir, a.out_dir, "sample")
        else:
            if not (a.copy and a.spec):
                ap.error("--copy and --spec are required (or use --sample --template)")
            copy = json.loads(Path(a.copy).read_text(encoding="utf-8"))
            spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
            meta, tdir = load_meta(spec["template_id"], "active")
            res = render_post(copy["slides"], spec["per_slide_layout_spec"], spec["slot_choices"], meta, tdir, a.out_dir, copy["post_id"])
    except (FileNotFoundError, KeyError, json.JSONDecodeError) as e:
        print(f"ERROR {type(e).__name__}: {e}", file=sys.stderr)
        return 2
    for s in res["slides"]:
        print(f"saved {Path(a.out_dir) / s['file']} {tuple(res['canvas'])}" + (f"  warnings: {s['warnings']}" if s["warnings"] else ""))
    if res["status"] != "ok":
        print(f"OVERFLOW {res['error']}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
