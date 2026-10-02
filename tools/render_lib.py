"""render_lib.py - shared, deterministic drawing primitives for every template renderer.

Nothing here calls a model. Same inputs -> byte-identical pixels (all randomness is seeded).
Tokens (colours, fonts) are read from brand/design_system.json by id, never hard-coded in templates.

A template's render.py exposes:   render_slide(ctx) -> PIL.Image (RGBA)
ctx keys: slide (copy dict), spec (layout spec dict), slots (slot_choices), n, total, canvas (w, h),
          report (RenderReport, collects text boxes / contrast pairs / warnings).
"""
import json
import math
import random
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DS = json.loads((ROOT / "brand" / "design_system.json").read_text(encoding="utf-8"))

# The book's five leaf colours, sampled from the cover. 'morality' is not an accent variant but is used
# in the seedling illustration so the drawing matches the cover.
LEAF_COLORS = {"strength": "#25995C", "identity": "#59B333", "emotions": "#4DB980", "explorer": "#87953A", "morality": "#64934E"}


MARK = DS.get("brand", {}).get("mark_text", "CONSpread")
FOOTER = DS.get("brand", {}).get("footer_text", "From the workbook · Building Tomorrow")
BOOK_CREDIT = DS.get("brand", {}).get("book_credit", "From the workbook Building Tomorrow")
_LOGO = DS.get("logo", {})


@lru_cache(maxsize=None)
def _logo_img(key):
    rel = _LOGO.get(key)
    if not rel:
        return None
    p = ROOT / rel
    return Image.open(p).convert("RGBA") if p.exists() else None


def draw_logo(img, x, y, height, on="light", part="logo", anchor="lm", report=None):
    """Place the CONSpread logo, scaled to `height`, never stretched or recoloured.
    on: 'light' -> full colour, 'dark' -> white version. part: 'logo' (emblem+wordmark) or 'emblem'.
    anchor: two chars, horizontal l/m/r + vertical t/m/b, like PIL. Returns the pasted box.
    """
    key = {("logo", "light"): "primary", ("logo", "dark"): "white",
           ("emblem", "light"): "emblem", ("emblem", "dark"): "emblem_white"}[(part, on)]
    src = _logo_img(key)
    if src is None:
        if report is not None:
            report.warn(f"logo asset '{key}' missing; brand mark skipped")
        return None
    h = int(height)
    w = int(src.width * h / src.height)
    logo = src.resize((w, h), Image.LANCZOS)
    ax = {"l": 0, "m": -w // 2, "r": -w}[anchor[0]]
    ay = {"t": 0, "m": -h // 2, "b": -h}[anchor[1]]
    px, py = int(x + ax), int(y + ay)
    img.alpha_composite(logo, (px, py))
    if report is not None:
        report.box("logo", (px, py, px + w, py + h), h)
    return (px, py, px + w, py + h)


class RenderError(Exception):
    """Content does not fit the layout (copy too long, word too wide...). Routed to copywriter/art_director."""


# ------------------------------------------------------------------ tokens
def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def with_alpha(h, a):
    return hex2rgb(h) + (int(a * 255),)


def token(name):
    n = DS["palette"]["neutrals"]
    if name in n:
        return n[name]
    if name in ("bark", "primary"):
        return DS["palette"]["primary"]["hex"]
    if name == "soil":
        return DS["palette"]["primary"]["soil"]
    if name.startswith("#"):
        return name
    raise KeyError(f"unknown colour token '{name}'")


def accent(accent_id):
    for v in DS["palette"]["accent_variants"]:
        if v["id"] == accent_id:
            return v
    raise KeyError(f"unknown accent variant '{accent_id}'")


def luminance(h):
    def f(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex2rgb(h)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = sorted([luminance(a), luminance(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def best_text_on(bg_hex, minimum=4.5):
    """ink or white, whichever passes; None if neither reaches the minimum."""
    for name in ("ink", "white"):
        if contrast(token(name), bg_hex) >= minimum:
            return token(name)
    return None


def canvas_size(fmt):
    c = DS["canvas"][fmt]
    return c["width"], c["height"]


# ------------------------------------------------------------------ report
class RenderReport:
    """Collected while rendering one slide; consumed by compose_post.py and tools/visual_qa.py."""

    def __init__(self):
        self.boxes = []      # {"role","box":[x0,y0,x1,y1],"size":px}
        self.pairs = []      # {"role","fg","bg","size":px}
        self.warnings = []
        self.fonts = set()

    def box(self, role, box, size):
        self.boxes.append({"role": role, "box": [int(v) for v in box], "size": int(size)})

    def pair(self, role, fg, bg, size):
        self.pairs.append({"role": role, "fg": fg, "bg": bg, "size": int(size), "ratio": round(contrast(fg, bg), 2)})

    def warn(self, msg):
        if msg not in self.warnings:
            self.warnings.append(msg)

    def as_dict(self):
        return {"boxes": self.boxes, "pairs": self.pairs, "warnings": self.warnings, "fonts": sorted(self.fonts)}


# ------------------------------------------------------------------ fonts
def _first_existing(paths):
    for p in paths:
        pp = Path(p)
        if not pp.is_absolute():
            pp = ROOT / pp
        if pp.exists():
            return pp
    return None


@lru_cache(maxsize=None)
def headline_font(size):
    p = _first_existing([ROOT / "assets/fonts/Anton-Regular.ttf"] + DS["typography"]["headline"]["fallback_files"])
    return ImageFont.truetype(str(p), int(size)), p.name


@lru_cache(maxsize=None)
def script_font(size):
    p = _first_existing([ROOT / "assets/fonts/AlexBrush-Regular.ttf"] + DS["typography"]["headline"]["fallback_files"])
    return ImageFont.truetype(str(p), int(size)), p.name


@lru_cache(maxsize=None)
def body_font(size, weight=500):
    p = _first_existing([ROOT / "assets/fonts/Manrope[wght].ttf"])
    if p is None:
        p = _first_existing(DS["typography"]["body"]["fallback_files"])
        return ImageFont.truetype(str(p), int(size)), p.name
    f = ImageFont.truetype(str(p), int(size))
    try:
        f.set_variation_by_axes([max(200, min(800, int(weight)))])
    except Exception:  # variable fonts unsupported: fall back to default instance
        pass
    return f, p.name


def font(kind, size, report=None, weight=500):
    f, name = {"headline": lambda: headline_font(size), "script": lambda: script_font(size),
               "body": lambda: body_font(size, weight)}[kind]()
    if report is not None:
        report.fonts.add(name)
        if name not in ("Anton-Regular.ttf", "AlexBrush-Regular.ttf", "Manrope[wght].ttf"):
            report.warn(f"fallback font '{name}' in use; install assets/fonts/ for on-brand rendering")
    return f


# ------------------------------------------------------------------ anti-aliased shapes
def aa(img, bbox, painter, scale=3):
    """Paint vector-ish shapes smoothly: draw at `scale`x on a local RGBA layer, downsample, composite."""
    x0, y0, x1, y1 = [int(math.floor(v)) for v in bbox[:2]] + [int(math.ceil(v)) for v in bbox[2:]]
    x0, y0 = max(x0, -2000), max(y0, -2000)
    w, h = max(1, x1 - x0), max(1, y1 - y0)
    layer = Image.new("RGBA", (w * scale, h * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def S(x, y):
        return ((x - x0) * scale, (y - y0) * scale)
    painter(d, S, scale)
    layer = layer.resize((w, h), Image.LANCZOS)
    img.alpha_composite(layer, (x0, y0)) if x0 >= 0 and y0 >= 0 else img.alpha_composite(
        layer.crop((max(0, -x0), max(0, -y0), w, h)), (max(0, x0), max(0, y0)))


def rounded_rect(img, box, radius, fill, outline=None, width=0):
    pad = width + 2

    def paint(d, S, k):
        a, b = S(box[0], box[1]), S(box[2], box[3])
        d.rounded_rectangle([a, b], radius=radius * k, fill=fill, outline=outline, width=int(width * k))
    aa(img, (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad), paint)


def shadow(img, box, radius=0, blur=28, offset=(0, 18), alpha=0.28, color="#3F2D26"):
    pad = blur * 3
    x0, y0, x1, y1 = box
    w, h = int(x1 - x0 + 2 * pad), int(y1 - y0 + 2 * pad)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle([pad, pad, pad + (x1 - x0), pad + (y1 - y0)], radius=radius,
                                            fill=hex2rgb(color) + (int(alpha * 255),))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(layer, (int(x0 - pad + offset[0]), int(y0 - pad + offset[1])))


def leaf_outline(length, width, curve=0.15, n=28):
    """Leaf polygon along +x from (0,0) to (length,0). curve bends the midrib (organic asymmetry)."""
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        hw = width * (math.sin(math.pi * t) ** 0.85) * (1 - 0.25 * t)
        bend = curve * length * math.sin(math.pi * t) * 0.5
        top.append((t * length, -hw + bend))
        bot.append((t * length, hw + bend))
    return top + bot[::-1]


def _xform(points, angle_deg, origin, scale=1.0):
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    return [(origin[0] + (x * ca - y * sa) * scale, origin[1] + (x * sa + y * ca) * scale) for x, y in points]


def draw_leaf(img, origin, length, width, angle_deg, fill_hex, alpha=1.0, vein_hex=None, curve=0.15):
    pts = _xform(leaf_outline(length, width, curve), angle_deg, origin)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]

    def paint(d, S, k):
        d.polygon([S(*p) for p in pts], fill=with_alpha(fill_hex, alpha))
        if vein_hex:
            mid = _xform([(length * 0.08, 0), (length * 0.82, curve * length * 0.3)], angle_deg, origin)
            d.line([S(*mid[0]), S(*mid[1])], fill=with_alpha(vein_hex, min(1, alpha)), width=max(1, int(width * 0.06 * k)))
    aa(img, (min(xs) - 4, min(ys) - 4, max(xs) + 4, max(ys) + 4), paint)


def draw_seedling(img, cx, base_y, size, alpha=1.0):
    """The cover's motif: soil mound, stem, five leaves in the book's leaf colours. size ~ total height in px."""
    s = size / 100.0
    soil, soil2 = token("soil"), "#5A3E31"
    rng = random.Random(7)

    def paint_soil(d, S, k):
        for i in range(70):  # pebbly mound
            ang = rng.uniform(math.pi, 2 * math.pi)
            rr = rng.uniform(0, 1) ** 0.6
            px, py = cx + math.cos(ang) * 26 * s * rr * 1.4, base_y + math.sin(ang) * 9 * s * rr * 1.0 + 6 * s
            r = rng.uniform(1.6, 4.2) * s
            d.ellipse([S(px - r, py - r * 0.8), S(px + r, py + r * 0.8)], fill=with_alpha(soil if i % 3 else soil2, alpha))
        d.ellipse([S(cx - 20 * s, base_y - 3 * s), S(cx + 20 * s, base_y + 9 * s)], fill=with_alpha(soil, alpha))
    aa(img, (cx - 40 * s, base_y - 14 * s, cx + 40 * s, base_y + 20 * s), paint_soil)

    top = base_y - 62 * s  # stem tip

    def paint_stem(d, S, k):
        pts = [S(cx + math.sin(t * 2.4) * 3.2 * s, base_y - t * 62 * s) for t in [i / 20 for i in range(21)]]
        d.line(pts, fill=with_alpha("#6E8A3A", alpha), width=int(3.4 * s * k), joint="curve")
    aa(img, (cx - 10 * s, top - 4 * s, cx + 10 * s, base_y + 2 * s), paint_stem)
    tip = (cx + math.sin(2.4) * 3.2 * s, top)
    leaves = [("strength", -92, 34, 12), ("identity", -160, 32, 11), ("emotions", -22, 32, 11),
              ("explorer", 170, 30, 10), ("morality", 8, 30, 10)]
    lo = [(cx, base_y - 28 * s), (cx, base_y - 30 * s)]
    for name, ang, L, W in leaves:
        origin = tip if name == "strength" else (cx + (2 if ang < -90 or ang > 90 else -2) * s, base_y - (42 if name in ("identity", "emotions") else 30) * s)
        draw_leaf(img, origin, L * s, W * s, ang, LEAF_COLORS[name], alpha=alpha, vein_hex="#F6F4DE")


def glow(img, center, radius, color="#FBDB96", strength=0.85):
    x, y = center
    size = int(radius * 2)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = layer.load()
    c = hex2rgb(color)
    for j in range(size):
        for i in range(size):
            d = math.hypot(i - radius, j - radius) / radius
            if d < 1:
                px[i, j] = c + (int(255 * strength * (1 - d) ** 1.6),)
    img.alpha_composite(layer, (int(x - radius), int(y - radius)))


# ------------------------------------------------------------------ backgrounds
def new_canvas(size, hex_color):
    return Image.new("RGBA", size, hex2rgb(hex_color) + (255,))


def add_grain(img, amount=6, seed=3):
    import numpy as np
    rng = np.random.default_rng(seed)
    arr = np.array(img.convert("RGB")).astype("int16")
    noise = rng.normal(0, amount, arr.shape[:2])[..., None]
    arr = np.clip(arr + noise, 0, 255).astype("uint8")
    out = Image.fromarray(arr, "RGB").convert("RGBA")
    img.paste(out)


def grid_lines(img, step, color_hex, alpha, width=2):
    w, h = img.size
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = with_alpha(color_hex, alpha)
    for x in range(0, w, step):
        d.line([(x, 0), (x, h)], fill=c, width=width)
    for y in range(0, h, step):
        d.line([(0, y), (w, y)], fill=c, width=width)
    img.alpha_composite(layer)


def dot_grid(img, step, color_hex, alpha, r=2):
    w, h = img.size
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = with_alpha(color_hex, alpha)
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    img.alpha_composite(layer)


def concentric_rings(img, center, radii, color_hex, alpha, width=10, seed=11):
    """Organic tone-on-tone rings (growth rings / fingerprint feel)."""
    rng = random.Random(seed)
    phases = [rng.uniform(0, math.tau) for _ in range(3)]

    def paint(d, S, k):
        for r in radii:
            pts = []
            for i in range(0, 361, 3):
                a = math.radians(i)
                wob = 1 + 0.035 * math.sin(3 * a + phases[0]) + 0.02 * math.sin(5 * a + phases[1]) + 0.012 * math.sin(9 * a + phases[2])
                pts.append(S(center[0] + math.cos(a) * r * wob * 0.9, center[1] + math.sin(a) * r * wob * 1.1))
            d.line(pts, fill=with_alpha(color_hex, alpha), width=int(width * k), joint="curve")
    m = max(radii) * 1.3
    aa(img, (center[0] - m, center[1] - m, center[0] + m, center[1] + m), paint, scale=2)


def abstract_leaves(img, region, accent_id, seed=5, count=4):
    """Soft, overlapping leaf shapes in the accent tint. imagery_type = abstract."""
    rng = random.Random(seed)
    acc = accent(accent_id)
    x0, y0, x1, y1 = region
    for i in range(count):
        ox, oy = rng.uniform(x0, x1), rng.uniform(y0, y1)
        L = rng.uniform(220, 380)
        draw_leaf(img, (ox, oy), L, L * 0.34, rng.uniform(-170, 10), acc["tint"] if i % 2 == 0 else acc["hex"],
                  alpha=0.55 if i % 2 == 0 else 0.22, vein_hex=None)


def imagery(img, kind, slots, region, report, seedling_size=520, seed=5):
    """Draw the slot's decorative element. 'photo' needs a Design Bank asset, which templates pass separately;
    when none is available we fall back to the illustration and say so in the report."""
    if kind == "photo":
        report.warn("imagery_type 'photo' requested but no design-bank photo available; used illustration")
        kind = "illustration"
    if kind == "illustration":
        cx = (region[0] + region[2]) / 2
        draw_seedling(img, cx, region[3], seedling_size)
    elif kind == "abstract":
        abstract_leaves(img, region, slots["accent_color"], seed=seed)


def make_ground(size, slots, ground_hex=None, texture_ring_center=None, report=None):
    """Background slot: flat | textured | illustrated -> RGBA canvas."""
    bg = ground_hex or token("paper")
    img = new_canvas(size, bg)
    kind = slots["background"]
    acc = accent(slots["accent_color"])
    if kind == "textured":
        add_grain(img, 5)
        if texture_ring_center:
            concentric_rings(img, texture_ring_center, [140, 200, 260, 320, 380, 440, 500], token("mist"), 0.9, width=12)
    elif kind == "illustrated":
        glow(img, (size[0] * 0.72, size[1] * 0.22), int(min(size) * 0.62), acc["tint"], 0.55)
        add_grain(img, 3)
    return img


# ------------------------------------------------------------------ text layout
def _norm_word(w):
    return "".join(ch for ch in w.casefold() if ch.isalnum() or ch in "'’")


class Line:
    __slots__ = ("words", "width", "spacer", "_lx", "_base")

    def __init__(self, words, width, spacer=False):
        self.words, self.width, self.spacer = words, width, spacer   # words: [(text, x_off, w, global_idx)]
        self._lx = self._base = 0.0                                  # set by draw_block


def layout(text, f, max_w, draw):
    """Word-wrap text (respecting \\n as paragraph breaks) -> list[Line]. Raises if a single word overflows."""
    space = draw.textlength(" ", font=f)
    lines, gi = [], 0
    for para in text.split("\n"):
        words = para.split()
        if not words:
            lines.append(Line([], 0, spacer=True))
            continue
        cur, cur_w = [], 0.0
        for w in words:
            ww = draw.textlength(w, font=f)
            if ww > max_w:
                raise RenderError(f"word '{w}' ({int(ww)}px) is wider than the {int(max_w)}px column at this size")
            add = ww if not cur else space + ww
            if cur and cur_w + add > max_w:
                lines.append(Line(cur, cur_w))
                cur, cur_w = [], 0.0
                add = ww
            off = cur_w + (space if cur else 0)
            cur.append((w, off, ww, gi))
            cur_w += add
            gi += 1
        lines.append(Line(cur, cur_w))
    return lines


def block_height(lines, size, line_h, para_gap):
    h = 0
    for ln in lines:
        h += para_gap if ln.spacer else size * line_h
    return h


def fit(text, kind, draw, box_w, box_h, max_size, min_size, line_h=1.1, para_gap=0, weight=500, step=2, report=None):
    """Largest font size in [min,max] where the wrapped block fits in box. RenderError if even min does not."""
    size = max_size
    last = None
    while size >= min_size:
        f = font(kind, size, report, weight)
        try:
            lines = layout(text, f, box_w, draw)
            if block_height(lines, size, line_h, para_gap) <= box_h:
                return f, lines, size
            last = f"needs {int(block_height(lines, size, line_h, para_gap))}px but only {int(box_h)}px available"
        except RenderError as e:
            last = str(e)
        size -= step
    raise RenderError(f"text does not fit at minimum size {min_size}px ({last}); shorten the copy")


def emphasis_word_ids(lines, emphasis_text):
    if not emphasis_text:
        return set()
    target = [_norm_word(w) for w in emphasis_text.split() if _norm_word(w)]
    flat = [(w, gi) for ln in lines for (w, _, _, gi) in ln.words]
    norm = [_norm_word(w) for w, _ in flat]
    n = len(target)
    for i in range(len(norm) - n + 1):
        if norm[i:i + n] == target:
            return {flat[j][1] for j in range(i, i + n)}
    return set()


def draw_block(img, x, y, lines, f, size, fill_hex, *, line_h=1.1, para_gap=0, align="left", box_w=None,
               emphasis_ids=frozenset(), style=None, accent_id=None, report=None, role="text", handles=False,
               bg_hex=None, mark_hex=None):
    """Draw wrapped lines. Emphasis ids are drawn with the slot style. Returns y after the block."""
    d = ImageDraw.Draw(img)
    acc = accent(accent_id) if accent_id else None
    l, t, r, b = f.getbbox("Hg", anchor="ls")
    cy = y
    x_min, x_max = 1e9, -1e9
    runs = []
    for ln in lines:
        if ln.spacer:
            cy += para_gap
            continue
        base = cy + size * line_h * 0.5 - (t + b) / 2  # vertically centre glyph box in the line box
        if align == "center":
            lx = x + (box_w - ln.width) / 2
        elif align == "right":
            lx = x + box_w - ln.width
        else:
            lx = x
        run = None
        for (w, off, ww, gi) in ln.words:
            if gi in emphasis_ids:
                run = [lx + off, lx + off + ww] if run is None else [run[0], lx + off + ww]
            elif run is not None:
                runs.append((run, base)); run = None
        if run is not None:
            runs.append((run, base))
        ln._lx, ln._base = lx, base
        x_min, x_max = min(x_min, lx), max(x_max, lx + ln.width)
        cy += size * line_h
    # emphasis marks under text
    pad = size * 0.12
    for (x0, x1), base in runs:
        top, bot = base + t - pad * 0.6, base + b + pad * 0.6
        if style == "highlight" and acc:
            rounded_rect(img, (x0 - pad, top, x1 + pad, bot), 6, with_alpha(acc["tint"], 1.0))
            if handles:
                for hx_, hy_ in [(x0 - pad, top), (x1 + pad, top), (x0 - pad, bot), (x1 + pad, bot)]:
                    rounded_rect(img, (hx_ - 8, hy_ - 8, hx_ + 8, hy_ + 8), 3, with_alpha(acc["hex"], 1.0))
    for ln in lines:
        if ln.spacer:
            continue
        for (w, off, ww, gi) in ln.words:
            d.text((ln._lx + off, ln._base), w, font=f, fill=hex2rgb(fill_hex), anchor="ls")
    for (x0, x1), base in runs:
        mark = mark_hex or (acc["hex"] if acc else None)   # mark_hex: readable colour when the ground IS the accent
        if style == "underline" and mark:
            uy = base + b * 0.55 + 4
            rounded_rect(img, (x0, uy, x1, uy + max(8, size * 0.11)), 4, with_alpha(mark, 1.0))
        elif style == "circle" and mark:
            _hand_circle(img, (x0 - pad * 1.8, base + t - pad * 1.6, x1 + pad * 1.8, base + b + pad * 1.6), mark, max(6, size * 0.07))
    if report is not None and x_min < 1e9:
        report.box(role, (x_min, y, x_max, cy), size)
        if bg_hex:
            report.pair(role, fill_hex, bg_hex, size)
    return cy


def _hand_circle(img, box, color_hex, width):
    x0, y0, x1, y1 = box
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    rng = random.Random(int(x0 * 7 + y0 * 3))

    def paint(d, S, k):
        pts = []
        start = rng.uniform(-0.3, 0.3)
        for i in range(0, 400):
            a = start + i / 400 * (math.tau * 1.06)
            wob = 1 + 0.03 * math.sin(2.3 * a) + 0.015 * math.sin(5 * a)
            grow = 1 + 0.035 * (i / 400)   # slight spiral so the ends overlap like a pen stroke
            pts.append(S(cx + math.cos(a) * rx * wob * grow, cy + math.sin(a) * ry * wob * grow))
        d.line(pts, fill=with_alpha(color_hex, 1.0), width=int(width * k), joint="curve")
    aa(img, (x0 - width * 2, y0 - width * 2, x1 + width * 2, y1 + width * 2), paint)


def text_size(draw, s, f):
    return draw.textlength(s, font=f)


def save_rgb(img, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, "PNG", optimize=True)
