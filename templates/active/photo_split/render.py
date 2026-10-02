"""photo_split: split_statement. Structure derived from single-post reference 01 (subject rising from the bottom, text at right)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))
from PIL import ImageDraw  # noqa: E402
import render_lib as RL  # noqa: E402

M = 96


def render_slide(ctx):
    W, H = ctx["canvas"]
    s, slots, rep = ctx["slide"], ctx["slots"], ctx["report"]
    acc = RL.accent(slots["accent_color"])
    paper, ink, bark = RL.token("paper"), RL.token("ink"), RL.token("bark")
    img = RL.new_canvas((W, H), paper)
    if slots["background"] == "illustrated":
        RL.glow(img, (W * 0.3, H * 0.75), int(W * 0.75), acc["tint"], 0.55)
    if slots["background"] in ("textured", "illustrated"):
        RL.add_grain(img, 3)
        RL.grid_lines(img, 40, RL.token("mist"), 0.9, 2)
    d = ImageDraw.Draw(img)

    band_y = H - 70
    # subject, lower left
    if slots["imagery_type"] == "abstract":
        RL.abstract_leaves(img, (60, 640, 640, band_y - 30), slots["accent_color"], seed=8, count=5)
    else:
        if slots["imagery_type"] == "photo":
            rep.warn("imagery_type 'photo' requested but no design-bank photo available; used illustration")
        RL.draw_seedling(img, 300, band_y - 40, 720)

    # header row: mark left, kicker right
    mf = RL.font("headline", 40, rep)
    d.text((M, 100), RL.MARK, font=mf, fill=RL.hex2rgb(bark), anchor="lm")
    rep.pair("brand_mark", bark, paper, 40)
    if s.get("kicker"):
        kf = RL.font("body", 26, rep, 600)
        d.text((W - M, 100), s["kicker"], font=kf, fill=RL.hex2rgb(ink), anchor="rm")
        kw = d.textlength(s["kicker"], font=kf)
        rep.box("kicker", (W - M - kw, 80, W - M, 120), 26); rep.pair("kicker", ink, paper, 26)
        d.line([(W - M - kw, 132), (W - M, 132)], fill=RL.hex2rgb(acc["hex"]), width=3)

    # statement, right column
    col_x, col_w = 520, W - M - 520
    hf, lines, size = RL.fit(s["headline"], "body", d, col_w, 470, 92, 46, line_h=1.1, weight=800, report=rep)
    ids = RL.emphasis_word_ids(lines, s.get("emphasis_text"))
    y = RL.draw_block(img, col_x, 340, lines, hf, size, bark, line_h=1.1, box_w=col_w, emphasis_ids=ids,
                      style=slots["emphasis_style"], accent_id=slots["accent_color"], report=rep, role="headline", bg_hex=paper)
    paras = [p for p in s["text"].split("\n") if p.strip()]
    if paras:
        y += 40
        sf, sl, ss = RL.fit(paras[0], "body", d, col_w, 190, 36, 26, line_h=1.32, weight=500, report=rep)
        y = RL.draw_block(img, col_x, y, sl, sf, ss, ink, line_h=1.32, box_w=col_w, report=rep, role="subline", bg_hex=paper)
        wmax = max(l.width for l in sl if not l.spacer)
        RL.rounded_rect(img, (col_x, y + 14, col_x + wmax * 0.75, y + 24), 5, RL.with_alpha(acc["hex"], 1.0))
        y += 30
    if y > band_y - 150:
        raise RL.RenderError(f"right column ends at y={int(y)} but must end by y={band_y - 150}; shorten the statement or sub-line")

    if s.get("note"):
        nf = RL.font("body", 30, rep, 700)
        d.text((W - M, band_y - 60), s["note"], font=nf, fill=RL.hex2rgb(ink), anchor="rm")
        nw = d.textlength(s["note"], font=nf)
        rep.box("note", (W - M - nw, band_y - 85, W - M, band_y - 35), 30); rep.pair("note", ink, paper, 30)

    # three-colour band (as in the reference)
    seg = [(0, 0.42, bark), (0.42, 0.72, acc["hex"]), (0.72, 1.0, acc["tint"])]
    for a, b, c in seg:
        d.rectangle([M + (W - 2 * M) * a, band_y, M + (W - 2 * M) * b, band_y + 26], fill=RL.hex2rgb(c))
    return img
