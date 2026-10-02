"""numbered_notes: cover_desk + content_numbered. Structure from carousel reference set 01; CONSpread brand."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))
from PIL import Image, ImageDraw  # noqa: E402
from render_lib import *  # noqa: F401,F403,E402
import render_lib as RL  # noqa: E402

M = 96  # safe margin


def render_slide(ctx):
    return {"cover_desk": cover_desk, "content_numbered": content_numbered}[ctx["spec"]["layout"]](ctx)


def _rot_paper(size, fill, angle, shadow_alpha=0.30):
    w, h = size
    pad = 60
    layer = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    RL.shadow(layer, (pad, pad, pad + w, pad + h), 4, blur=18, offset=(0, 10), alpha=shadow_alpha)
    ImageDraw.Draw(layer).rectangle([pad, pad, pad + w, pad + h], fill=RL.hex2rgb(fill) + (255,))
    return layer.rotate(angle, expand=True, resample=Image.BICUBIC)


def cover_desk(ctx):
    W, H = ctx["canvas"]
    s, slots, rep = ctx["slide"], ctx["slots"], ctx["report"]
    acc = RL.accent(slots["accent_color"])
    navy, paper = RL.token("ink"), RL.token("paper")
    img = RL.new_canvas((W, H), navy)                 # navy hero ground (brand anchor)
    RL.grid_lines(img, 54, "#FFFFFF", 0.08, 2)
    d = ImageDraw.Draw(img)

    # paper stack
    px0, py0, pw, ph = 130, 196, 820, 952
    for ang, off, fill in [(-3.6, (-16, 14), "#DEDCE4"), (2.4, (14, 6), "#EAE8EE")]:
        layer = _rot_paper((pw - 30, ph - 40), fill, ang)
        img.alpha_composite(layer, (px0 + off[0] - 45 + 15, py0 + off[1] - 45 + 20))
    RL.shadow(img, (px0, py0, px0 + pw, py0 + ph), 4, blur=24, offset=(0, 16), alpha=0.40)
    ImageDraw.Draw(img).rectangle([px0, py0, px0 + pw, py0 + ph], fill=RL.hex2rgb(paper) + (255,))

    inner_x, inner_w = px0 + 60, pw - 120
    # CONSpread logo, top-centre of the paper (the account identity)
    lb = RL.draw_logo(img, W / 2, py0 + 46, 66, on="light", part="logo", anchor="mt", report=rep)
    top = (lb[3] if lb else py0 + 112) + 34

    # kicker pill
    if s.get("kicker"):
        kf = RL.font("body", 26, rep, 700)
        tw = d.textlength(s["kicker"].upper(), font=kf)
        pill = (W / 2 - (tw + 52) / 2, top, W / 2 + (tw + 52) / 2, top + 54)
        RL.rounded_rect(img, pill, 27, RL.with_alpha(acc["tint"], 1.0))
        d.text((W / 2, top + 27), s["kicker"].upper(), font=kf, fill=RL.hex2rgb(navy), anchor="mm")
        rep.box("kicker", pill, 26); rep.pair("kicker", navy, acc["tint"], 26)
        top += 90

    # headline
    hf, lines, size = RL.fit(s["headline"], "headline", d, inner_w, 400, 132, 80, line_h=1.03, report=rep)
    ids = RL.emphasis_word_ids(lines, s.get("emphasis_text"))
    if s.get("emphasis_text") and not ids:
        rep.warn(f"emphasis_text '{s['emphasis_text']}' not found in the cover headline; emphasis not applied")
    bottom = RL.draw_block(img, inner_x, top + 16, lines, hf, size, navy, line_h=1.03, align="center", box_w=inner_w,
                           emphasis_ids=ids, style=slots["emphasis_style"], accent_id=slots["accent_color"], report=rep,
                           role="headline", handles=False, bg_hex=paper)

    # sub-line
    y = bottom + 34
    if s.get("text"):
        sf, sl, ss = RL.fit(s["text"], "body", d, inner_w - 60, 130, 36, 28, line_h=1.35, weight=500, report=rep)
        y = RL.draw_block(img, inner_x + 30, y, sl, sf, ss, navy, line_h=1.35, align="center", box_w=inner_w - 60, report=rep,
                          role="subline", bg_hex=paper)
    limit = py0 + ph - (150 if s.get("note") else 60)
    if y > limit:
        raise RL.RenderError(f"cover copy is too long: content ends at y={int(y)} but must end by y={int(limit)}; shorten the headline or sub-line")

    # swipe note (small pill, accent)
    if s.get("note"):
        nf = RL.font("body", 26, rep, 700)
        tw = d.textlength(s["note"].upper(), font=nf)
        pill = (W / 2 - (tw + 60) / 2, py0 + ph - 132, W / 2 + (tw + 60) / 2, py0 + ph - 132 + 58)
        RL.rounded_rect(img, pill, 29, RL.with_alpha(acc["hex"], 1.0))
        d.text((W / 2, pill[1] + 29), s["note"].upper(), font=nf, fill=RL.hex2rgb("#FFFFFF"), anchor="mm")
        rep.box("note", pill, 26); rep.pair("note", "#FFFFFF", acc["hex"], 26)

    # binder clip on the right edge
    cx, cy = px0 + pw - 6, py0 + 430
    RL.rounded_rect(img, (cx - 46, cy, cx + 30, cy + 120), 10, RL.with_alpha("#3B3B3B", 1.0))
    RL.rounded_rect(img, (cx - 40, cy + 8, cx + 24, cy + 112), 8, RL.with_alpha("#9A9A9A", 1.0))
    RL.rounded_rect(img, (cx + 20, cy + 22, cx + 84, cy + 98), 30, None, outline=RL.with_alpha("#B5B5B5", 1.0), width=6)
    return img


def _parse_items(text):
    items = []
    for raw in text.split("\n"):
        t = raw.strip()
        if not t:
            items.append(("gap", ""))
        elif t.startswith("→"):
            items.append(("bullet", t.lstrip("→").strip()))
        elif t.startswith(">"):
            items.append(("quote", t.lstrip(">").strip()))
        else:
            items.append(("p", t))
    out = []
    for it in items:
        if it[0] == "gap" and (not out or out[-1][0] == "gap"):
            continue
        out.append(it)
    while out and out[-1][0] == "gap":
        out.pop()
    return out


def _arrow(img, x, y, size, color_hex):
    def paint(d, S, k):
        d.line([S(x, y), S(x + size, y)], fill=RL.with_alpha(color_hex, 1), width=int(size * 0.14 * k))
        d.polygon([S(x + size, y - size * 0.32), S(x + size + size * 0.42, y), S(x + size, y + size * 0.32)], fill=RL.with_alpha(color_hex, 1))
    RL.aa(img, (x - 4, y - size, x + size * 1.6, y + size), paint)


def content_numbered(ctx):
    W, H = ctx["canvas"]
    s, slots, rep = ctx["slide"], ctx["slots"], ctx["report"]
    acc = RL.accent(slots["accent_color"])
    paper, navy = RL.token("paper"), RL.token("ink")
    img = RL.new_canvas((W, H), paper)
    if slots["background"] in ("textured", "illustrated"):
        RL.add_grain(img, 3)
        RL.dot_grid(img, 42, navy, 0.10, 2)
    d = ImageDraw.Draw(img)

    # number badge / emblem at top
    roles = ctx.get("roles") or [""] * ctx["total"]
    numbered = {"setup", "body", "framework_item", "example", "reframe"}
    is_point = roles[ctx["n"] - 1] in numbered
    if is_point:
        RL.rounded_rect(img, (W / 2 - 62, 112, W / 2 + 62, 236), 62, None, outline=RL.with_alpha(acc["hex"], 1.0), width=6)
        num = sum(1 for i, r in enumerate(roles[:ctx["n"]]) if r in numbered)
        bf = RL.font("headline", 64, rep)
        d.text((W / 2, 175), f"{num:02d}", font=bf, fill=RL.hex2rgb(navy), anchor="mm")
    else:
        RL.draw_logo(img, W / 2, 150, 86, on="light", part="emblem", anchor="mt", report=rep)

    # headline (max two lines)
    col_x, col_w = M + 14, W - 2 * (M + 14)
    hf, lines, size = RL.fit(s["headline"], "headline", d, col_w, 270, 132, 78, line_h=1.02, report=rep)
    em = s.get("emphasis_text")
    ids = RL.emphasis_word_ids(lines, em)
    applied = bool(ids)
    y = RL.draw_block(img, col_x, 290, lines, hf, size, navy, line_h=1.02, align="center", box_w=col_w, emphasis_ids=ids,
                      style=slots["emphasis_style"], accent_id=slots["accent_color"], report=rep, role="headline",
                      handles=False, bg_hex=paper)

    # body: paragraphs, arrow bullets, closing pull-quote
    body_top, body_bottom = y + 56, H - 150
    items = _parse_items(s["text"])
    body_x, body_w = 168, W - 168 - M
    chosen = None
    for bsize in range(52, 29, -2):
        bf_ = RL.font("body", bsize, rep, 500)
        bfb = RL.font("body", bsize, rep, 700)
        try:
            total, prepared = 0, []
            for kind, txt in items:
                if kind == "gap":
                    total += bsize * 0.9
                    prepared.append((kind, None)); continue
                fnt = bfb if kind in ("bullet", "quote") else bf_
                w_avail = body_w - (int(bsize * 1.6) if kind == "bullet" else int(bsize * 1.9) if kind == "quote" else 0)
                lines_ = RL.layout(txt, fnt, w_avail, d)
                h = len(lines_) * bsize * 1.32 + (bsize * 0.15 if kind == "bullet" else 0)
                total += h
                prepared.append((kind, lines_, fnt, w_avail))
            if total <= body_bottom - body_top:
                chosen = (bsize, prepared, (body_bottom - body_top) - total)
                break
        except RL.RenderError:
            continue
    if not chosen:
        raise RL.RenderError("body text does not fit at 30px minimum; cut it to about 45 words")
    bsize, prepared, slack = chosen
    cy = body_top + min(140, slack * 0.4)
    for p in prepared:
        if p[0] == "gap":
            cy += bsize * 0.9; continue
        kind, lines_, fnt, w_avail = p
        if kind == "bullet":
            _arrow(img, body_x, cy + bsize * 0.66, bsize * 0.62, acc["hex"])
            cy = RL.draw_block(img, body_x + int(bsize * 1.6), cy, lines_, fnt, bsize, navy, line_h=1.32, report=rep, role="bullet", bg_hex=paper) + bsize * 0.15
        elif kind == "quote":
            qf = RL.font("headline", int(bsize * 2.1), rep)
            d.text((body_x - 6, cy + bsize * 0.55), "“", font=qf, fill=RL.hex2rgb(acc["hex"]), anchor="lm")
            ye = RL.draw_block(img, body_x + int(bsize * 1.9), cy, lines_, fnt, bsize, navy, line_h=1.32, report=rep, role="pullquote", bg_hex=paper)
            last = [l for l in lines_ if not l.spacer][-1]
            d.text((body_x + int(bsize * 1.9) + last.width + 12, ye - bsize * 1.32 * 0.5 + bsize * 0.35), "”", font=qf, fill=RL.hex2rgb(acc["hex"]), anchor="lm")
            cy = ye
        else:
            bids = RL.emphasis_word_ids(lines_, em) if (em and not ids) else set()
            applied = applied or bool(bids)
            cy = RL.draw_block(img, body_x, cy, lines_, fnt, bsize, navy, line_h=1.32, report=rep, role="body", bg_hex=paper,
                               emphasis_ids=bids, style=slots["emphasis_style"], accent_id=slots["accent_color"])
    if em and not applied:
        rep.warn(f"emphasis_text '{em}' not found in a headline or body paragraph; emphasis not applied")

    # footer: CONSpread logo left, book credit right
    RL.draw_logo(img, M, H - 66, 66, on="light", part="logo", anchor="lm", report=rep)
    cf = RL.font("body", 22, rep, 600)
    d.text((W - M, H - 66), RL.BOOK_CREDIT, font=cf, fill=RL.hex2rgb(navy), anchor="rm")
    rep.pair("book_credit", navy, paper, 22)
    return img
