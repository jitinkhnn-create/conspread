#!/usr/bin/env python3
"""pipeline_state.py - the only writer of post lifecycle, atom state and design memory. Atomic, idempotent, git-visible.

Routine prompts call this instead of hand-editing JSON. Stdlib only.

  new-post [--date YYYY-MM-DD]                 allocate post_YYYYMMDD_NN and create content/drafts/<id>/
  queue-atom --post-id ID --atom-id ATOM       atom unused -> queued; lifecycle entry 'drafting'
  release-atom --post-id ID [--reason TEXT]    atom queued -> unused (aborted run); lifecycle 'failed'
  advance --post-id ID --status S [--note T]   append a lifecycle history step
  finalize --post-id ID                        drafts -> content/pending_approval/<id>/ (spec.json, caption.md, rationale.md, PNGs),
                                               design memory, QA log; status pending_approval (or qa_escalated)
  approve --post-id ID                         pending_approval -> approved (helper for the manual folder move)
  reject --post-id ID --layer L --issue-tag T --action-note N [--free-text X]
                                               pending_approval -> rejected, feedback-log entry, atom back to 'unused'
  reconcile                                    notice folders the human moved by hand and update state to match
  dispatched --post-id ID --scheduled-for ISO [--note T]
                                               after Postiz confirmed: approved/ -> published/, status 'scheduled',
                                               atom 'published' (published_date = scheduled date)
  mark --post-id ID --status published|failed [--note T]
                                               Postiz sync result for a scheduled post

Draft folder contract (content/drafts/<id>/): strategist.json, copywriter.json, art_director.json, critic.json (latest),
critic.a<N>.json (each attempt), render/ (PNGs + render_report.json), optional history/.
"""
import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ST = ROOT / "state"
BANK = ROOT / "books" / "building_tomorrow" / "content_bank.json"
CONTENT = ROOT / "content"
CFG = json.loads((ROOT / "config" / "pipeline.json").read_text(encoding="utf-8"))
NOW = lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
TODAY = lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d")


def jload(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def jsave(p, obj):
    p = Path(p)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, p)


def life():
    return jload(ST / "post-lifecycle.json")


def step(post, status, note=None):
    post["status"] = status
    post["updated_at"] = NOW()
    h = {"status": status, "at": NOW()}
    if note:
        h["note"] = note
    post["history"].append(h)


def atom_of(bank, atom_id):
    for a in bank["atoms"]:
        if a["atom_id"] == atom_id:
            return a
    raise SystemExit(f"unknown atom {atom_id}")


def append_text(path, text):
    p = Path(path)
    old = p.read_text(encoding="utf-8") if p.exists() else ""
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(old + text, encoding="utf-8")
    os.replace(tmp, p)


# ----------------------------------------------------------------- commands
def new_post(a):
    date = (a.date or TODAY()).replace("-", "")
    used = set(life()["posts"]) | {p.name for d in ("drafts", "pending_approval", "approved", "published", "rejected")
                                    for p in (CONTENT / d).glob("post_*")}
    n = 1
    while f"post_{date}_{n:02d}" in used:
        n += 1
    pid = f"post_{date}_{n:02d}"
    (CONTENT / "drafts" / pid / "render").mkdir(parents=True, exist_ok=True)
    print(pid)


def queue_atom(a):
    bank, lf = jload(BANK), life()
    at = atom_of(bank, a.atom_id)
    if at["state"]["status"] != "unused":
        raise SystemExit(f"atom {a.atom_id} is '{at['state']['status']}', not unused")
    at["state"].update(status="queued", post_id=a.post_id)
    if a.post_id not in lf["posts"]:
        lf["posts"][a.post_id] = {"status": "drafting", "atom_id": a.atom_id, "template_id": None, "format": None,
                                  "audience_track": None, "hook_family": None, "qa_attempts": 0, "final_qa_verdict": None,
                                  "created_at": NOW(), "updated_at": NOW(), "history": [{"status": "drafting", "at": NOW(), "note": "atom queued"}]}
    jsave(BANK, bank); jsave(ST / "post-lifecycle.json", lf)
    print(f"queued {a.atom_id} for {a.post_id}")


def release_atom(a):
    bank, lf = jload(BANK), life()
    p = lf["posts"].get(a.post_id)
    if not p:
        raise SystemExit(f"unknown post {a.post_id}")
    at = atom_of(bank, p["atom_id"])
    if at["state"]["status"] == "queued" and at["state"].get("post_id") == a.post_id:
        at["state"].update(status="unused", post_id=None)
    step(p, "failed", a.reason or "run aborted")
    jsave(BANK, bank); jsave(ST / "post-lifecycle.json", lf)
    print(f"released {p['atom_id']}")


def advance(a):
    lf = life()
    p = lf["posts"][a.post_id]
    step(p, a.status, a.note)
    jsave(ST / "post-lifecycle.json", lf)
    print(f"{a.post_id} -> {a.status}")


def finalize(a):
    d = CONTENT / "drafts" / a.post_id
    need = ["strategist.json", "copywriter.json", "art_director.json", "critic.json", "render/render_report.json"]
    missing = [n for n in need if not (d / n).exists()]
    if missing:
        raise SystemExit(f"cannot finalize; missing in {d}: {missing}")
    strat, copy, ad, critic = (jload(d / f) for f in need[:4])
    rr = jload(d / "render" / "render_report.json")
    if rr["status"] != "ok":
        raise SystemExit("cannot finalize: render status is not ok")
    attempts = sorted(d.glob("critic.a*.json"))
    hist = [jload(p) for p in attempts]
    dest = CONTENT / "pending_approval" / a.post_id
    if dest.exists():
        raise SystemExit(f"{dest} already exists")
    dest.mkdir(parents=True)
    for png in sorted((d / "render").glob("slide_*.png")):
        shutil.copy2(png, dest / png.name)
    spec = {"post_id": a.post_id, "finalized_at": NOW(), "strategist": strat, "copywriter": copy, "art_director": ad,
            "critic": critic, "critic_history": hist, "render_report": rr}
    jsave(dest / "spec.json", spec)
    tags = " ".join(copy["hashtags"])
    (dest / "caption.md").write_text(f"{copy['caption']}\n\n{tags}\n\n---\nAlt text: {copy['alt_text']}\n", encoding="utf-8")
    issues = "\n".join(f"- [{i['layer']}/{i.get('severity', '-')}] slide {i['slide']}: {i['issue']} -> {i['route_to']}: {i['action']}"
                       for i in critic["issues"]) or "- none"
    (dest / "rationale.md").write_text(
        f"# {a.post_id}\n\n## Why this atom\n**{strat['atom_id']}** ({strat['audience_track']}, {strat['format']}, CTA: {strat['cta_intent']})\n\n"
        f"{strat['rationale']}\n\nAngle: {strat['angle']}\n\n## Why this template\n**{ad['template_id']}**, slots: `{json.dumps(ad['slot_choices'])}`\n\n"
        f"{ad.get('template_rationale', '')}\n\n## Copy\nHook ({copy['hook_family']}): {copy['hook']}\n\nDedup: {json.dumps(copy.get('dedup', {}))}\n\n"
        f"## What QA said (attempt {critic['attempt']}, {critic['verdict']}, score {critic['score']})\n{critic.get('summary', '')}\n\nIssues:\n{issues}\n\n"
        f"QA history: {', '.join(f'a{h['attempt']}={h['verdict']}({h['score']})' for h in hist) or 'single pass'}\n", encoding="utf-8")
    lf = life(); p = lf["posts"][a.post_id]
    escalated = critic["verdict"] != "pass"
    p.update(template_id=ad["template_id"], format=strat["format"], audience_track=strat["audience_track"],
             hook_family=copy["hook_family"], qa_attempts=critic["attempt"], final_qa_verdict=critic["verdict"])
    step(p, "qa_escalated" if escalated else "pending_approval",
         "QA did not pass after retries; human review with notes" if escalated else "candidate ready")
    jsave(ST / "post-lifecycle.json", lf)
    dm = jload(ST / "design-memory.json")
    dm["recent_template_ids"].append(ad["template_id"]); dm["recent_slot_choices"].append(ad["slot_choices"])
    keep = 50
    dm["recent_template_ids"], dm["recent_slot_choices"] = dm["recent_template_ids"][-keep:], dm["recent_slot_choices"][-keep:]
    t = dm["templates"].setdefault(ad["template_id"], {"last_used_date": None, "use_count": 0, "last_post_id": None})
    t.update(last_used_date=TODAY(), use_count=t["use_count"] + 1, last_post_id=a.post_id)
    jsave(ST / "design-memory.json", dm)
    tm = ROOT / "templates" / "active" / ad["template_id"] / "metadata.json"
    if tm.exists():
        m = jload(tm); m["last_used_date"] = TODAY(); m["use_count"] = m.get("use_count", 0) + 1; jsave(tm, m)
    qa = "".join(f"\n## {a.post_id} — attempt {h['attempt']} — {TODAY()}\n- **verdict:** {h['verdict']}\n- **score:** {h['score']}\n"
                 f"- **template:** {ad['template_id']}\n- **issues:** " + ("; ".join(f"{i['layer']}/s{i['slide']}/{i['route_to']}: {i['issue']}" for i in h["issues"]) or "none")
                 + f"\n- **summary:** {h.get('summary', '')}\n" for h in (hist or [critic]))
    append_text(ST / "hero-qa-log.md", qa)
    shutil.rmtree(d)
    print(f"finalized -> {dest}  ({'ESCALATED: QA did not pass' if escalated else 'ready for human review'})")


def _move(post_id, src, dst):
    s, t = CONTENT / src / post_id, CONTENT / dst / post_id
    if not s.exists():
        raise SystemExit(f"{s} not found")
    shutil.move(str(s), str(t))


def _calibration(post_id, qa_verdict, human):
    if (qa_verdict == "pass") == (human == "approve"):
        return None
    line = {"post_id": post_id, "date": TODAY(), "qa_verdict": qa_verdict, "human_verdict": human,
            "mismatch_type": "over_rejection" if human == "approve" else "under_rejection"}
    append_text(ST / "qa-calibration.jsonl", json.dumps(line) + "\n")
    return line["mismatch_type"]


def approve(a):
    lf = life(); p = lf["posts"][a.post_id]
    if (CONTENT / "pending_approval" / a.post_id).exists():
        _move(a.post_id, "pending_approval", "approved")
    if p["status"] not in ("approved", "scheduled", "published"):
        mm = _calibration(a.post_id, p.get("final_qa_verdict") or "pass", "approve")
        step(p, "approved", f"human approved{'; calibration ' + mm if mm else ''}")
        jsave(ST / "post-lifecycle.json", lf)
    print(f"{a.post_id} approved")


def _release_with_rejection(bank, p, post_id, layer, tag, note):
    at = atom_of(bank, p["atom_id"])
    at["state"].update(status="unused", post_id=None)
    at["state"].setdefault("rejections", []).append({"post_id": post_id, "date": TODAY(), "layer": layer, "issue_tag": tag, "action_note": note})


def reject(a):
    lf, bank = life(), jload(BANK)
    p = lf["posts"][a.post_id]
    if (CONTENT / "pending_approval" / a.post_id).exists():
        _move(a.post_id, "pending_approval", "rejected")
    entry = (f"\n## {a.post_id} — rejected {TODAY()}\n- **layer:** {a.layer}\n- **issue_tag:** {a.issue_tag}\n"
             f"- **action_note:** {a.action_note}\n- **free_text:** {a.free_text or ''}\n")
    append_text(ST / "feedback-log.md", entry)
    mm = _calibration(a.post_id, p.get("final_qa_verdict") or "pass", "reject")
    _release_with_rejection(bank, p, a.post_id, a.layer, a.issue_tag, a.action_note)
    step(p, "rejected", f"{a.layer}/{a.issue_tag}{'; calibration ' + mm if mm else ''}")
    jsave(BANK, bank); jsave(ST / "post-lifecycle.json", lf)
    print(f"{a.post_id} rejected; atom {p['atom_id']} back to unused")


def parse_feedback(post_id):
    text = (ST / "feedback-log.md").read_text(encoding="utf-8")
    m = re.search(rf"## {re.escape(post_id)} — rejected [\d-]+\n((?:- .*\n?)+)", text)
    if not m:
        return None
    g = lambda k: (re.search(rf"\*\*{k}:\*\*\s*(.*)", m.group(1)) or [None, ""])[1].strip()
    return {"layer": g("layer"), "issue_tag": g("issue_tag"), "action_note": g("action_note")}


def reconcile(_a):
    """Human moved folders by hand: bring lifecycle, atoms and calibration in line."""
    lf, bank, changed = life(), jload(BANK), False
    for pid in [p.name for p in (CONTENT / "approved").glob("post_*")]:
        p = lf["posts"].get(pid)
        if p and p["status"] in ("pending_approval", "qa_escalated"):
            mm = _calibration(pid, p.get("final_qa_verdict") or "pass", "approve")
            step(p, "approved", f"moved to approved/ by hand{'; calibration ' + mm if mm else ''}")
            print(f"reconciled {pid}: approved"); changed = True
    for pid in [p.name for p in (CONTENT / "rejected").glob("post_*")]:
        p = lf["posts"].get(pid)
        if p and p["status"] in ("pending_approval", "qa_escalated"):
            fb = parse_feedback(pid)
            if not fb or fb["layer"] not in ("content", "copy", "design", "brand", "tone"):
                print(f"WARNING {pid} is in rejected/ but state/feedback-log.md has no valid entry; add one (see file header). Atom left queued.")
                continue
            mm = _calibration(pid, p.get("final_qa_verdict") or "pass", "reject")
            _release_with_rejection(bank, p, pid, fb["layer"], fb["issue_tag"], fb["action_note"])
            step(p, "rejected", f"moved to rejected/ by hand; {fb['layer']}/{fb['issue_tag']}{'; calibration ' + mm if mm else ''}")
            print(f"reconciled {pid}: rejected, atom released"); changed = True
    if changed:
        jsave(ST / "post-lifecycle.json", lf); jsave(BANK, bank)
    else:
        print("nothing to reconcile")


def dispatched(a):
    lf, bank = life(), jload(BANK)
    p = lf["posts"][a.post_id]
    src, dst = CONTENT / "approved" / a.post_id, CONTENT / "published" / a.post_id
    if src.exists() and not dst.exists():
        _move(a.post_id, "approved", "published")
    if p["status"] in ("scheduled", "published"):
        print(f"{a.post_id} already {p['status']}; nothing written")
        return
    at = atom_of(bank, p["atom_id"])
    at["state"].update(status="published", post_id=a.post_id, published_date=a.scheduled_for[:10])
    step(p, "scheduled", a.note or f"scheduled in Postiz for {a.scheduled_for}")
    jsave(BANK, bank); jsave(ST / "post-lifecycle.json", lf)
    print(f"{a.post_id} scheduled for {a.scheduled_for}")


def mark(a):
    lf = life(); p = lf["posts"][a.post_id]
    if p["status"] == a.status:
        print(f"{a.post_id} already {a.status}")
        return
    step(p, a.status, a.note)
    jsave(ST / "post-lifecycle.json", lf)
    print(f"{a.post_id} -> {a.status}")


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("new-post"); s.add_argument("--date"); s.set_defaults(fn=new_post)
    s = sub.add_parser("queue-atom"); s.add_argument("--post-id", required=True); s.add_argument("--atom-id", required=True); s.set_defaults(fn=queue_atom)
    s = sub.add_parser("release-atom"); s.add_argument("--post-id", required=True); s.add_argument("--reason"); s.set_defaults(fn=release_atom)
    s = sub.add_parser("advance"); s.add_argument("--post-id", required=True); s.add_argument("--status", required=True)
    s.add_argument("--note"); s.set_defaults(fn=advance)
    for n, fn in (("finalize", finalize), ("approve", approve)):
        s = sub.add_parser(n); s.add_argument("--post-id", required=True); s.set_defaults(fn=fn)
    s = sub.add_parser("reject"); s.add_argument("--post-id", required=True)
    s.add_argument("--layer", required=True, choices=("content", "copy", "design", "brand", "tone"))
    s.add_argument("--issue-tag", required=True); s.add_argument("--action-note", required=True); s.add_argument("--free-text")
    s.set_defaults(fn=reject)
    s = sub.add_parser("reconcile"); s.set_defaults(fn=reconcile)
    s = sub.add_parser("dispatched"); s.add_argument("--post-id", required=True); s.add_argument("--scheduled-for", required=True)
    s.add_argument("--note"); s.set_defaults(fn=dispatched)
    s = sub.add_parser("mark"); s.add_argument("--post-id", required=True)
    s.add_argument("--status", required=True, choices=("published", "failed")); s.add_argument("--note"); s.set_defaults(fn=mark)
    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
