"""object_hero_square: object_hero. Structure derived from single-post reference 02 (object on a flat colour field)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))
from PIL import Image, ImageDraw  # noqa: E402
import render_lib as RL  # noqa: E402

M = 96
ROOT = RL.ROOT


def _hero_image(spec, rep):
    asset_id = spec.get("design_bank_asset_id")
    if asset_id:
        manifest = json.loads((ROOT / "assets/design-bank/manifest.json").read_text(encoding="utf-8"))
        for a in manifest.get("assets", []):
            if a["id"] == asset_id:
                return Image.open(ROOT / a["file"]).convert("RGBA")
        rep.warn(f"design_bank_asset_id '{asset_id}' not found; used the book cover")
    return Image.open(ROOT / "assets/benchmark/book_identity/cover.png").convert("RGBA")  # book cover as the hero object


def render_slide(ctx):
    W, H = ctx["canvas"]
    s, slots, rep = ctx["slide"], ctx["slots"], ctx["report"]
    acc = RL.accent(slots["accent_color"])
    ground = acc["hex"]
    fg = RL.best_text_on(ground)
    if fg is None:  # neither ink nor white is legible on the raw accent: fall back to its tint
        ground, fg = acc["tint"], RL.token("ink")
        rep.warn(f"accent '{acc['id']}' too weak for text; used its tint as the ground")
    img = RL.new_canvas((W, H), ground)
    if slots["background"] == "textured":
        RL.add_grain(img, 5)
    elif slots["background"] == "illustrated":
        RL.glow(img, (W * 0.3, H * 0.4), int(W * 0.7), acc["tint"], 0.45)
    d = ImageDraw.Draw(img)

    if slots["imagery_type"] == "abstract":
        RL.abstract_leaves(img, (W * 0.55, 560, W, H - 80), slots["accent_color"], seed=6, count=3)

    # hero object: the cover with a soft shadow and a spine edge
    hero = _hero_image(ctx["spec"], rep)
    hh = 640
    hw = int(hero.width * hh / hero.height)
    hero = hero.resize((hw, hh), Image.LANCZOS)
    hx, hy = M + 14, 150
    RL.shadow(img, (hx, hy, hx + hw, hy + hh), 4, blur=26, offset=(14, 22), alpha=0.35)
    img.alpha_composite(hero, (hx, hy))
    d.rectangle([hx, hy, hx + 9, hy + hh], fill=(0, 0, 0, 46))

    # oversized light-weight statement, upper case
    col_x = hx + hw + 64
    col_w = W - M - col_x
    stmt = s["headline"].upper()
    sf, lines, size = RL.fit(stmt, "body", d, col_w, 380, 96, 48, line_h=1.06, weight=300, report=rep)
    ids = RL.emphasis_word_ids(lines, s.get("emphasis_text"))
    y = RL.draw_block(img, col_x, 190, lines, sf, size, fg, line_h=1.06, box_w=col_w, emphasis_ids=ids,
                      style=None if slots["emphasis_style"] == "highlight" else slots["emphasis_style"], mark_hex=fg,
                      report=rep, role="headline", bg_hex=ground)
    if slots["emphasis_style"] == "highlight" and ids:
        rep.warn("emphasis_style 'highlight' has no contrast on an accent ground; emphasis skipped (use underline or circle)")
    paras = [p for p in s["text"].split("\n") if p.strip()]
    if paras:
        af, al, asz = RL.fit(paras[0], "body", d, col_w, 120, 32, 24, line_h=1.3, weight=600, report=rep)
        y = RL.draw_block(img, col_x, y + 26, al, af, asz, fg, line_h=1.3, box_w=col_w, report=rep, role="attribution", bg_hex=ground)
    if y > hy + hh:
        raise RL.RenderError(f"statement block ends at y={int(y)}, below the cover (y={hy + hh}); shorten it")

    if slots["imagery_type"] in ("illustration", "photo"):
        if slots["imagery_type"] == "photo":
            rep.warn("imagery_type 'photo' requested but no design-bank photo available; used illustration")
        # sticker badge: the leaf greens vanish on a green ground, so the seedling sits on a paper disc
        bx, by, br = W - M - 96, hy + hh - 70, 96
        RL.shadow(img, (bx - br, by - br, bx + br, by + br), br, blur=14, offset=(0, 8), alpha=0.25)
        RL.rounded_rect(img, (bx - br, by - br, bx + br, by + br), br, RL.with_alpha(RL.token("paper"), 1.0))
        RL.draw_seedling(img, bx, by + 58, 118)

    # footer: mark | divider | note
    fy = H - 150
    mf = RL.font("headline", 40, rep)
    d.text((M, fy + 40), RL.MARK, font=mf, fill=RL.hex2rgb(fg), anchor="lm")
    rep.pair("brand_mark", fg, ground, 40)
    mw = d.textlength(RL.MARK, font=mf)
    dx = M + mw + 44
    d.rectangle([dx, fy - 6, dx + 3, fy + 86], fill=RL.hex2rgb(fg))
    note = s.get("note") or (paras[1] if len(paras) > 1 else "")
    if note:
        nf, nl, nsz = RL.fit(note, "body", d, W - M - (dx + 40), 90, 30, 22, line_h=1.3, weight=600, report=rep)
        RL.draw_block(img, dx + 40, fy + 20 - (len(nl) - 1) * nsz * 0.65, nl, nf, nsz, fg, line_h=1.3, box_w=W - M - (dx + 40), report=rep, role="note", bg_hex=ground)
    return img
