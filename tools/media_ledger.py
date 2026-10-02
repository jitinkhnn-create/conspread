#!/usr/bin/env python3
"""media_ledger.py - idempotent record of posts handed to the publishing provider (state/media-ledger.json).

Adapted from the MAS media_ledger.py pattern: one writer, atomic writes, and a dedup key so a post can never be
dispatched twice. Here the key is post_id (plus the sha256 of every media file, so the same pixels can't be posted
under two ids). Stdlib only.

Usage:
    python tools/media_ledger.py show
    python tools/media_ledger.py is-used --post-id post_20260921_01      # exit 0 = already recorded, 2 = free
    python tools/media_ledger.py is-used --sha256 <hex>
    python tools/media_ledger.py hash --path slide_01.png
    python tools/media_ledger.py record --post-id ID --atom-id ATOM --files a.png b.png --provider postiz \
        --provider-post-id X --scheduled-for 2026-09-24T09:30:00Z --state scheduled
    python tools/media_ledger.py set-state --post-id ID --state published
`record` mutates state; it is called only after the provider confirms.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "state" / "media-ledger.json"
STATES = ("scheduled", "published", "failed_parked")


def load():
    if not LEDGER.exists():
        return {"schema_version": 1, "entries": []}
    return json.loads(LEDGER.read_text(encoding="utf-8"))


def save(data):
    tmp = LEDGER.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, LEDGER)  # atomic on POSIX and Windows


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show")
    sub.add_parser("init")
    u = sub.add_parser("is-used"); u.add_argument("--post-id"); u.add_argument("--sha256")
    h = sub.add_parser("hash"); h.add_argument("--path", required=True)
    r = sub.add_parser("record")
    r.add_argument("--post-id", required=True); r.add_argument("--atom-id", required=True)
    r.add_argument("--files", nargs="+", required=True); r.add_argument("--provider", default="postiz")
    r.add_argument("--provider-post-id"); r.add_argument("--scheduled-for"); r.add_argument("--state", choices=STATES, default="scheduled")
    s = sub.add_parser("set-state"); s.add_argument("--post-id", required=True); s.add_argument("--state", choices=STATES, required=True)
    a = ap.parse_args(argv)
    data = load()

    if a.cmd == "init":
        if not LEDGER.exists():
            save(data)
        print("ok")
    elif a.cmd == "show":
        print(json.dumps(data, indent=2, ensure_ascii=False))
    elif a.cmd == "hash":
        print(sha(a.path))
    elif a.cmd == "is-used":
        if not (a.post_id or a.sha256):
            ap.error("give --post-id or --sha256")
        hit = any((a.post_id and e["post_id"] == a.post_id) or (a.sha256 and a.sha256 in e["media_sha256"]) for e in data["entries"])
        print("used" if hit else "free")
        return 0 if hit else 2
    elif a.cmd == "record":
        hashes = [sha(f) for f in a.files]
        for e in data["entries"]:
            if e["post_id"] == a.post_id:
                print(f"already recorded: {a.post_id} (state {e['state']}); nothing written")
                return 0                                   # idempotent
            clash = set(hashes) & set(e["media_sha256"])
            if clash:
                print(f"REFUSED: media already posted under {e['post_id']}", file=sys.stderr)
                return 1
        data["entries"].append({
            "post_id": a.post_id, "atom_id": a.atom_id, "media_sha256": hashes, "provider": a.provider,
            "provider_post_id": a.provider_post_id, "scheduled_for": a.scheduled_for,
            "recorded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "state": a.state})
        save(data)
        print(f"recorded {a.post_id} ({a.state})")
    elif a.cmd == "set-state":
        for e in data["entries"]:
            if e["post_id"] == a.post_id:
                e["state"] = a.state
                save(data)
                print(f"{a.post_id} -> {a.state}")
                return 0
        print(f"no ledger entry for {a.post_id}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
