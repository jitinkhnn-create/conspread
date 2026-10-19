#!/usr/bin/env python3
"""postiz_mcp.py - publishing adapter for the Postiz claude.ai connector (MCP).

Python cannot call the Postiz MCP tools, so the work is split: this script does every deterministic part
(media conversion, caption HTML, slot choice, public media URLs, ledger/state writes) and the routine prompt
(routines/routine_02_dispatch_approved/PROMPT.md) makes the Postiz calls in between.

  prepare --post-id ID [--now ISO]     content/approved/ID/ -> upload/slide_NN.jpg + dispatch_plan.json (printed)
  urls --post-id ID --sha SHA          public raw.githubusercontent.com URLs for the uploaded JPEGs (pinned to a commit)
  record --post-id ID --result CHANNEL=POSTIZ_ID [...]
                                       after Postiz confirmed: media ledger, lifecycle 'scheduled', folder -> published/,
                                       dedup embedding added

Exit codes: 0 ok | 1 refused (already dispatched, caption too long, ...) | 2 usage error.
Settings live in config/pipeline.json -> publishing. Stdlib + Pillow.
"""
import argparse
import html
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "config" / "pipeline.json").read_text(encoding="utf-8"))
PUB = CFG["publishing"]
APPROVED = ROOT / "content" / "approved"
LEDGER = ROOT / "state" / "media-ledger.json"
PY = sys.executable


def jload(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def jsave(p, obj):
    Path(p).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run_tool(*args):
    r = subprocess.run([PY, *map(str, args)], cwd=ROOT, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if r.returncode not in (0,):
        raise SystemExit(f"{' '.join(map(str, args))} failed ({r.returncode}): {out}")
    return out


def ledger_used(post_id):
    r = subprocess.run([PY, "tools/media_ledger.py", "is-used", "--post-id", post_id], cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0


def caption_html(copy):
    """Postiz wants HTML with every line in <p>. Returns (html, plain_text)."""
    lines = [ln.strip() for ln in copy["caption"].strip().splitlines()]
    tags = " ".join(copy.get("hashtags", []))
    plain = copy["caption"].strip() + ("\n\n" + tags if tags else "")
    parts = []
    for ln in lines:
        parts.append(f"<p>{html.escape(ln, quote=False)}</p>" if ln else "<p></p>")
    if tags:
        parts += ["<p></p>", f"<p>{html.escape(tags, quote=False)}</p>"]
    return "".join(parts), plain


def taken_dates():
    if not LEDGER.exists():
        return set()
    return {(e.get("scheduled_for") or "")[:10] for e in jload(LEDGER)["entries"]}


def pick_slot(now_utc):
    """Today at publish_time_local if far enough ahead, else the next free day. Returns UTC datetime."""
    tz = ZoneInfo(PUB["timezone"])
    hh, mm = map(int, PUB["publish_time_local"].split(":"))
    local_now = now_utc.astimezone(tz)
    taken = taken_dates()
    day = local_now.date()
    for _ in range(30):
        slot = datetime(day.year, day.month, day.day, hh, mm, tzinfo=tz)
        slot_utc = slot.astimezone(timezone.utc)
        if slot - local_now >= timedelta(minutes=PUB["min_lead_minutes"]) and slot_utc.strftime("%Y-%m-%d") not in taken:
            return slot_utc
        day += timedelta(days=1)
    raise SystemExit("no free publishing slot in the next 30 days")


def prepare(a):
    d = APPROVED / a.post_id
    if not d.exists():
        print(f"REFUSED: {d} not found", file=sys.stderr); return 1
    if ledger_used(a.post_id):
        print(f"REFUSED: {a.post_id} is already in the media ledger (dispatched before)", file=sys.stderr); return 1
    spec = jload(d / "spec.json")
    copy = spec["copywriter"]
    pngs = sorted(d.glob("slide_*.png"))
    if not pngs:
        print(f"REFUSED: no slide PNGs in {d}", file=sys.stderr); return 1
    from PIL import Image
    up = d / "upload"
    up.mkdir(exist_ok=True)
    files = []
    for png in pngs:
        out = up / (png.stem + ".jpg")
        Image.open(png).convert("RGB").save(out, "JPEG", quality=PUB.get("jpeg_quality", 92), optimize=True)
        files.append(out.relative_to(ROOT).as_posix())
    body, plain = caption_html(copy)
    errs = []
    for ch in PUB["channels"]:
        if len(plain) > ch["max_caption_chars"]:
            errs.append(f"{ch['name']}: caption {len(plain)} chars > {ch['max_caption_chars']}")
        if len(files) > ch["max_images"]:
            errs.append(f"{ch['name']}: {len(files)} images > {ch['max_images']}")
    if errs:
        print("REFUSED: " + "; ".join(errs), file=sys.stderr); return 1
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    slot = pick_slot(now)
    plan = {
        "post_id": a.post_id, "atom_id": spec["strategist"]["atom_id"], "format": spec["strategist"]["format"],
        "files": files, "media_urls": None,
        "date_utc": slot.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "date_local": slot.astimezone(ZoneInfo(PUB["timezone"])).strftime("%Y-%m-%d %H:%M %Z"),
        "content_html": body, "caption_plain": plain,
        "channels": [{k: ch[k] for k in ("name", "label", "platform", "integration_id", "settings")} for ch in PUB["channels"]],
        "prepared_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    jsave(d / "dispatch_plan.json", plan)
    print(json.dumps(plan, indent=2, ensure_ascii=False))
    return 0


def urls(a):
    d = APPROVED / a.post_id
    plan = jload(d / "dispatch_plan.json")
    base = PUB["media_base_url"].rstrip("/")
    plan["media_urls"] = [f"{base}/{a.sha}/{f}" for f in plan["files"]]
    plan["media_commit"] = a.sha
    jsave(d / "dispatch_plan.json", plan)
    print("\n".join(plan["media_urls"]))
    return 0


def record(a):
    d = APPROVED / a.post_id
    plan = jload(d / "dispatch_plan.json")
    results = dict(r.split("=", 1) for r in a.result)
    known = {c["name"] for c in plan["channels"]}
    unknown = set(results) - known
    if unknown:
        print(f"REFUSED: unknown channel(s) {sorted(unknown)}; expected {sorted(known)}", file=sys.stderr); return 2
    provider_ids = ",".join(f"{k}:{v}" for k, v in sorted(results.items()))
    print(run_tool("tools/media_ledger.py", "record", "--post-id", a.post_id, "--atom-id", plan["atom_id"],
                   "--files", *plan["files"], "--provider", "postiz", "--provider-post-id", provider_ids,
                   "--scheduled-for", plan["date_utc"].replace(".000Z", "Z"), "--state", "scheduled"))
    missing = sorted(known - set(results))
    note = f"Postiz {provider_ids} for {plan['date_local']}" + (f"; NOT scheduled on {missing}" if missing else "")
    spec = jload(d / "spec.json")
    print(run_tool("tools/pipeline_state.py", "dispatched", "--post-id", a.post_id, "--scheduled-for", plan["date_utc"], "--note", note))
    c = spec["copywriter"]
    print(run_tool("tools/dedup_check.py", "add", "--post-id", a.post_id, "--date", plan["date_utc"][:10],
                   "--hook", c["hook"], "--headline", c["headline"]))
    return 0


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("prepare"); s.add_argument("--post-id", required=True); s.add_argument("--now"); s.set_defaults(fn=prepare)
    s = sub.add_parser("urls"); s.add_argument("--post-id", required=True); s.add_argument("--sha", required=True); s.set_defaults(fn=urls)
    s = sub.add_parser("record"); s.add_argument("--post-id", required=True)
    s.add_argument("--result", action="append", required=True, help="CHANNEL=POSTIZ_POST_ID, once per channel that succeeded")
    s.set_defaults(fn=record)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
