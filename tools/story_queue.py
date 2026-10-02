#!/usr/bin/env python3
"""story_queue.py - dedup for real-story submissions in inbox/real-stories/ (state/story-queue.json).

Same pattern as media_ledger.py (MAS story_queue.py): a story is used at most once, only this tool writes the
queue, and a story is eligible only with `consent: true` in its frontmatter. Stdlib only.

Usage:
    python tools/story_queue.py eligible                 # list unused stories that have consent: true
    python tools/story_queue.py is-used --file x.md      # exit 0 = used/reserved, 2 = free
    python tools/story_queue.py record --file x.md --post-id ID [--status used|reserved]
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "state" / "story-queue.json"
INBOX = ROOT / "inbox" / "real-stories"


def load():
    return json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {"schema_version": 1, "stories": []}


def save(d):
    tmp = QUEUE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, QUEUE)


def frontmatter(path):
    m = re.match(r"^---\s*\n(.*?)\n---", Path(path).read_text(encoding="utf-8"), re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().strip("'\"")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("eligible")
    u = sub.add_parser("is-used"); u.add_argument("--file", required=True)
    r = sub.add_parser("record"); r.add_argument("--file", required=True); r.add_argument("--post-id", required=True)
    r.add_argument("--status", choices=("used", "reserved"), default="used")
    a = ap.parse_args(argv)
    q = load()
    used = {s["file"] for s in q["stories"]}
    if a.cmd == "eligible":
        for p in sorted(INBOX.glob("*.md")):
            if p.name.lower() == "readme.md" or p.name in used:
                continue
            if frontmatter(p).get("consent", "").lower() == "true":
                print(p.name)
    elif a.cmd == "is-used":
        hit = a.file in used
        print("used" if hit else "free")
        return 0 if hit else 2
    elif a.cmd == "record":
        p = INBOX / a.file
        if not p.exists():
            print(f"no such story: {p}", file=sys.stderr); return 1
        if frontmatter(p).get("consent", "").lower() != "true":
            print("REFUSED: story has no consent: true", file=sys.stderr); return 1
        if a.file in used:
            print("already recorded; nothing written"); return 0
        q["stories"].append({"file": a.file, "status": a.status, "post_id": a.post_id,
                             "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")})
        save(q)
        print(f"recorded {a.file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
