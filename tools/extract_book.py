#!/usr/bin/env python3
"""extract_book.py - split the workbook PDF into one Markdown file per section (ground truth for grounding checks).

The manuscript is organised in 8 'Sections' (not 16 chapters). Files are named ch01.md..ch08.md so the pipeline's
`chapter` field, atom ids (bt_chNN_*) and the grounding validator keep working; in the pipeline, "chapter N" means "Section N".

Cleaning (nothing is reworded):
  - drops running headers ('Wisdom Ways' / 'Jitin Khanna') and their page numbers, keeping a [[p.N]] marker per page
  - repairs U+FFFD glyphs the PDF lost: a leading one is a bullet '•', an inline one is an em dash '—'
  - joins words hyphen-broken across lines only where the line ends in '-' (real compound hyphens are kept)
Usage: python tools/extract_book.py "path/to/interior.pdf" [--out books/building_tomorrow/chapters]
"""
import argparse
import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
HEADER = re.compile(r"^\s*(Wisdom Ways|Jitin Khanna)\s*$")


def clean_page(text):
    lines = [l.rstrip() for l in text.replace("\r", "").split("\n")]
    page_no, out, i = None, [], 0
    while i < len(lines):
        l = lines[i]
        if HEADER.match(l):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and re.fullmatch(r"\s*\d+\s*", lines[j]):
                page_no = int(lines[j])
                i = j + 1
                continue
        if re.match(r"^\s*�\s*", l):
            l = re.sub(r"^\s*�\s*", "• ", l)
        l = l.replace("�", "—")
        out.append(l)
        i += 1
    return page_no, "\n".join(out).strip("\n")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", default=str(ROOT / "books" / "building_tomorrow" / "chapters"))
    a = ap.parse_args()
    doc = fitz.open(a.pdf)
    toc = [(lvl, title, pg) for lvl, title, pg in doc.get_toc()]
    secs = [(i, t, pg) for i, (lvl, t, pg) in enumerate(toc) if lvl == 2 and toc[i - 1][1].lower().startswith("section-")]
    front = [(t, pg) for lvl, t, pg in toc if lvl == 1 and not t.lower().startswith("section-")]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    bounds = [pg for _, _, pg in secs] + [len(doc) + 1]
    for n, (_, title, pg) in enumerate(secs, 1):
        body = []
        for p in range(pg, bounds[n]):
            no, txt = clean_page(doc[p - 1].get_text())
            body.append(f"[[p.{no if no is not None else '?'}]]\n{txt}")
        text = f"# Section {n}: {title}\n\n" + "\n\n".join(body) + "\n"
        text = re.sub(r"-\n(?=[a-z])", "-", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        (out / f"ch{n:02d}.md").write_text(text, encoding="utf-8")
        print(f"ch{n:02d}.md  Section {n}: {title}  (pdf pages {pg}-{bounds[n] - 1}, {len(text)} chars)")
    # front matter (about, dedication) for reference; not used as atom sources by default
    fm = []
    for t, pg in front:
        no, txt = clean_page(doc[pg - 1].get_text())
        fm.append(f"## {t}\n\n{txt}\n")
    (out / "front_matter.md").write_text("# Front matter\n\n" + "\n".join(fm), encoding="utf-8")
    print("front_matter.md")


if __name__ == "__main__":
    main()
