"""quote_glyph: quote_card. Structure derived from single-post reference 03 (big quote glyph card)."""
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
    img = RL.make_ground((W, H), slots, texture_ring_center=(W * 0.78, 250), report=rep)
    d = ImageDraw.Draw(img)

    band_top = H - 170
    # imagery: seedling rising from the band (right), or abstract leaves
    if slots["imagery_type"] == "abstract":
        RL.abstract_leaves(img, (W * 0.5, 700, W, band_top), slots["accent_color"], seed=4, count=4)
    # giant closing-quote glyph in the accent colour (decorative graphic, not copy)
    gf = RL.font("headline", 700, rep)
    l, t, r, b = d.textbbox((0, 0), "”", font=gf)
    gx, gy = W - M + 10 - (r - l) - l, 210 - t
    d.text((gx, gy), "”", font=gf, fill=RL.hex2rgb(acc["hex"]))

    y = 330
    if s.get("kicker"):
        kf = RL.font("body", 26, rep, 800)
        d.text((M, y), s["kicker"].upper(), font=kf, fill=RL.hex2rgb(bark), anchor="ls")
        rep.box("kicker", (M, y - 26, M + d.textlength(s["kicker"].upper(), font=kf), y), 26); rep.pair("kicker", bark, paper, 26)
        y += 46

    col_w = 560
    hf, lines, size = RL.fit(s["headline"], "body", d, col_w, 560, 84, 46, line_h=1.16, weight=700, report=rep)
    ids = RL.emphasis_word_ids(lines, s.get("emphasis_text"))
    y = RL.draw_block(img, M, y, lines, hf, size, ink, line_h=1.16, box_w=col_w, emphasis_ids=ids,
                      style=slots["emphasis_style"], accent_id=slots["accent_color"], report=rep, role="headline", bg_hex=paper)

    # attribution block
    paras = [p for p in s["text"].split("\n") if p.strip()]
    y += 44
    RL.rounded_rect(img, (M, y, M + 64, y + 10), 5, RL.with_alpha(acc["hex"], 1.0))
    y += 34
    if paras:
        af = RL.font("body", 30, rep, 800)
        _, al, asz = RL.fit(paras[0].upper(), "body", d, col_w + 80, 90, 30, 24, line_h=1.25, weight=800, report=rep)
        af = RL.font("body", asz, rep, 800)
        y = RL.draw_block(img, M, y, al, af, asz, ink, line_h=1.25, box_w=col_w + 80, report=rep, role="attribution", bg_hex=paper)
    if len(paras) > 1:
        sf, sl, ss = RL.fit(paras[1], "body", d, col_w + 80, 90, 28, 22, line_h=1.3, weight=500, report=rep)
        y = RL.draw_block(img, M, y + 8, sl, sf, ss, bark, line_h=1.3, box_w=col_w + 80, report=rep, role="subline", bg_hex=paper)
    if y > band_top - 30:
        raise RL.RenderError(f"quote card content ends at y={int(y)} but must end by y={band_top - 30}; shorten the statement")

    # footer band: navy with the white CONSpread logo (left) and the book credit (right)
    band_h = H - band_top
    d.rectangle([0, band_top, W, H], fill=RL.hex2rgb(RL.token("ink")))
    RL.draw_logo(img, M, band_top + band_h / 2, int(band_h * 0.66), on="dark", part="logo", anchor="lm", report=rep)
    cf = RL.font("body", 22, rep, 600)
    d.text((W - M, band_top + band_h / 2), RL.BOOK_CREDIT, font=cf, fill=RL.hex2rgb(RL.token("white")), anchor="rm")
    rep.pair("book_credit", RL.token("white"), RL.token("ink"), 22)
    return img
