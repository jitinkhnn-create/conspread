#!/usr/bin/env python3
"""visual_qa.py - deterministic structural checks on rendered PNGs, before the model-based critic sees them.

Adapted from the MAS visual_qa.py idea: catch the defects that can be proven from files and pixels, and leave taste to
the critic. No OCR, no aesthetic scoring.

Checks (per post directory written by compose_post.py):
  - render_report.json exists and status == ok (overflow is a renderer/copy failure)
  - every slide PNG opens, matches the template canvas, is not blank, and no two slides are pixel-identical
  - every text box the renderer recorded sits inside the canvas, and inside half the safe margin (clip guard)
  - WCAG contrast of every (text, background) pair the renderer recorded: >= 4.5, or >= 3.0 for text >= 72px
  - slide-1 headline is big enough to read at thumbnail size (warning below 60px)
  - renderer warnings are passed through

Usage:
    python tools/visual_qa.py post content/drafts/<post_id>/render [--json]
    python tools/visual_qa.py image FILE.png --size 1080x1350 [--json]
Exit 0 = passed (warnings allowed) | 1 = failed | 2 = usage error.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[1]
DS = json.loads((ROOT / "brand" / "design_system.json").read_text(encoding="utf-8"))


def check_image(path, size=None):
    errs, warns = [], []
    p = Path(path)
    if not p.exists():
        return [f"{p.name}: file missing"], warns
    try:
        im = Image.open(p)
        im.load()
    except Exception as e:  # corrupt PNG
        return [f"{p.name}: cannot open ({e})"], warns
    if im.format != "PNG":
        errs.append(f"{p.name}: format is {im.format}, expected PNG")
    if size and im.size != tuple(size):
        errs.append(f"{p.name}: size {im.size} != expected {tuple(size)}")
    stat = ImageStat.Stat(im.convert("L"))
    if stat.stddev[0] < 6:
        errs.append(f"{p.name}: image is nearly blank (luminance stddev {stat.stddev[0]:.1f})")
    return errs, warns


def check_post(render_dir):
    d = Path(render_dir)
    rp = d / "render_report.json"
    if not rp.exists():
        return {"passed": False, "errors": [f"{rp} missing; run tools/compose_post.py first"], "warnings": []}
    rep = json.loads(rp.read_text(encoding="utf-8"))
    errs, warns = [], []
    if rep.get("status") != "ok":
        errs.append(f"renderer status '{rep.get('status')}': {rep.get('error')}")
    canvas = tuple(rep["canvas"])
    margin = DS["layout"]["safe_margin_px"] // 2
    seen = {}
    for s in rep["slides"]:
        f = d / s["file"]
        e, w = check_image(f, canvas)
        errs += e; warns += w
        if f.exists():
            h = hashlib.sha256(f.read_bytes()).hexdigest()
            if h != s["sha256"]:
                errs.append(f"{s['file']}: file changed since render (sha256 mismatch)")
            if h in seen:
                errs.append(f"{s['file']}: pixel-identical to {seen[h]}")
            seen[h] = s["file"]
        for b in s["boxes"]:
            x0, y0, x1, y1 = b["box"]
            if x0 < 0 or y0 < 0 or x1 > canvas[0] or y1 > canvas[1]:
                errs.append(f"{s['file']}: '{b['role']}' text box {b['box']} is outside the canvas (clipped)")
            elif x0 < margin or x1 > canvas[0] - margin:
                warns.append(f"{s['file']}: '{b['role']}' text box {b['box']} is inside the {margin}px edge band")
        for pr in s["pairs"]:
            need = 3.0 if pr["size"] >= 72 else 4.5
            if pr["ratio"] < need:
                errs.append(f"{s['file']}: '{pr['role']}' contrast {pr['ratio']} < {need} ({pr['fg']} on {pr['bg']}, {pr['size']}px)")
        if s["n"] == 1:
            hl = [b for b in s["boxes"] if b["role"] == "headline"]
            if hl and hl[0]["size"] < 60:
                warns.append(f"{s['file']}: slide-1 headline is {hl[0]['size']}px; may be hard to read at thumbnail size")
        warns += [f"{s['file']}: {w}" for w in s.get("warnings", [])]
    return {"passed": not errs, "errors": errs, "warnings": warns, "slides": len(rep["slides"]), "canvas": list(canvas)}


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("post"); p.add_argument("dir")
    i = sub.add_parser("image"); i.add_argument("file"); i.add_argument("--size")
    a = ap.parse_args(argv)
    if a.cmd == "post":
        res = check_post(a.dir)
    else:
        size = tuple(int(x) for x in a.size.lower().split("x")) if a.size else None
        e, w = check_image(a.file, size)
        res = {"passed": not e, "errors": e, "warnings": w}
    if a.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
    else:
        print(("PASS" if res["passed"] else "FAIL") + f"  visual_qa {a.cmd}")
        for e in res["errors"]:
            print("  ERROR  " + e)
        for w in res["warnings"]:
            print("  warn   " + w)
    return 0 if res["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
