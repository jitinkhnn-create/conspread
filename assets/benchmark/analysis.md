# Benchmark analysis

Written in Phase 1 from the materials supplied on 2026-09-21. **Structure is what we learn from the
references, never their branding, copy, imagery or third-party logos.** Every reference below is another
brand's or designer's work: use it to understand composition and craft only.

## 1. Book identity (`book_identity/`)

`cover.pdf` (original, 1 page) and `cover.png` (rendered at 200 dpi, 1655×2340) of **Building Tomorrow: A
transformative Workbook for Age 11-15, by Jitin Khanna**.

| Element | Finding |
|---|---|
| Ground | Warm cream `#F6F4DE` with a soft radial gold glow (`#FBDB96` centre, `#F9E6B2` edge) behind the plant |
| Title "BUILDING" | Very heavy condensed sans, cocoa brown `#5A3D2F` |
| Title "TOMORROW" | Wide extended black sans, near-black `#211E1D` |
| Subtitle | Script, Alex Brush (confirmed embedded in the PDF, SIL OFL) |
| Central motif | A seedling in soil with **five leaves labelled Strength, Identity, Emotions, Explorer, Morality**, which look like the book's five themes |
| Leaf colours | Strength `#25995C` · Identity `#59B333` · Explorer `#87953A` · Emotions `#4DB980` · Morality ≈ `#64934E` |
| Soil | `#3F2D26` |
| Mood | Warm, organic, hopeful, uncluttered; nothing corporate or childish |

The palette in `brand/design_system.json` is taken directly from these samples. The five accent variants
map onto four of the five leaves plus the sun-glow gold (Morality dropped: it sits between Strength and Explorer
and would be indistinguishable in rotation).

**Not the same book:** `Book poster.jpeg` in the supplied folder is the front/back cover of *Meeting Myself*
(also Jitin Khanna, Shashwat Publication; navy and yellow palette). It has **not** been copied into this repo
or used for the palette. See open question in the Phase 1 summary.

## 2. Carousel references (`carousel_references/`)

Four images, 736×920 (4:5), one carousel by the designer @alexjoseph.mj on how they start a brand project.
Treated as **one carousel reference with two structurally distinct layouts** (cover + content).

### 2a. Slide 1: cover (`set01_slide1_cover.jpg`)
- **Concept:** "desk collage". A tilted stack of paper with a paperclip and a binder clip sits on a bold
  coloured grid ground. The headline is set as if typed onto a notepad.
- **Regions (canvas fractions):** handle top-centre (y≈0.10) · paper stack centred (x 0.12–0.80, y 0.17–0.87) ·
  headline in the paper's centre (y 0.28–0.66) · pill label upper-left of the paper · sub-line under the
  headline (y≈0.68) · tape strip "swipe" note (y≈0.75).
- **Hierarchy:** headline ≫ pill label ≈ tape note > sub-line > handle.
- **Typography:** condensed heavy grotesque headline, mixed case, tight leading, three lines; small
  geometric sans for secondary text.
- **Emphasis:** two words wear a "selection box" (a filled rectangle with dot handles at the corners, like a
  design-tool selection). One is lavender, one is salmon. Small stickers (folder icon, bookmark).
- **Colour roles:** ground = saturated orange with white grid lines; paper = light grey/cream; ink = near-black;
  emphasis = salmon and lavender.
- **Distinguishing features:** physical-desk metaphor; "selection box with corner handles" emphasis; clips and tape.

### 2b. Slides 2 to 4: content (`set01_slide2..4_content.jpg`)
These three share **one skeleton**; they differ only in which words are emphasised and in the accent colour.
- **Regions:** handle top-centre (y≈0.08) · circled number badge (`01`, `02`, `03`; y 0.12–0.22) ·
  two-line heavy headline (y 0.25–0.45) · body block, left-aligned at x≈0.24 (y 0.49–0.72) ·
  three arrow-bullet lines (`→`) · pull-quote line with quote marks in accent colour (y≈0.79–0.83) ·
  tiny letter-spaced footer line (y≈0.92).
- **Hierarchy:** headline ≫ body ≈ pull-quote > number badge > handle > footer.
- **Typography:** same condensed heavy headline; body in a clean geometric sans, about 30 px at 736 wide;
  pull-quote in the accent colour, set the same size as the body.
- **Emphasis:** one headline word in a "selection box" highlight (salmon in slides 2 and 4, lavender in slide 3;
  slide 3 also highlights "Spoiler:" in the body). Body may carry accent-coloured phrases.
- **Ground:** near-white with a faint dot grid.
- **Carousel logic:** the numbered badge is the progress cue; every content slide repeats the same
  five-part rhythm (headline, plain sentence, 3 arrow bullets, pull-quote), so the reader learns the pattern by slide 2.
- **Distinguishing features:** circled numeral, arrow-bullet trio, accent-coloured pull-quote with
  quote glyphs, selection-box emphasis.

**Template decision:** one canonical carousel template, `numbered_notes` (working name), with layouts
`cover_desk`, `content_numbered`. Slides 2 to 4 are one layout, not three. This follows the rule "N structurally
distinct references = N canonical templates", read as *one carousel = one template with a cover and a body layout*.
If you would rather treat `cover_desk` as its own template, say so.

## 3. Single-post references (`single_post_references/`)

Three structurally distinct designs, so **three canonical templates**. All three are advertisements
for other people's books, with third-party names, URLs and sales calls to action ("Download now", "Out now",
"Order now"). **We copy none of that.** Building Tomorrow posts are value-first and are not sales-heavy
(`brand/voice.md`), so each layout is adapted to carry a workbook idea rather than a purchase prompt.

### 3a. `single01_product_shot_portrait.jpg` (735×919, 4:5)
- **Concept:** a hand holding a fan of book spines up into the frame; a text block sits to the right.
- **Regions:** logo top-left · URL top-right · photo occupying the lower-left ~55% width, rising from the bottom
  edge · headline (3 short lines) right-aligned block at x≈0.54–0.90, y≈0.28–0.38 · sub-line + accent underline ·
  "Download" line and store badges bottom-right · a three-colour band across the very bottom.
- **Ground:** light cream with a fine graph-paper grid.
- **Typography:** medium-weight geometric sans headline in deep green; italic small sans for the CTA.
- **Distinguishing features:** photographic subject breaking out of the bottom edge; asymmetric text/photo split;
  segmented colour footer bar.
- **Fit for us:** photographic or illustrated subject + a short statement. Good when a Design Bank
  photo exists. Working name `photo_split`. Marked `spec_only` if no suitable photo asset is available.

### 3b. `single02_product_shot_square.jpg` (736×736, 1:1)
- **Concept:** a flat-lit hardcover mockup on a solid saturated ground, huge thin uppercase statement on the right.
- **Regions:** book mockup left (x 0.18–0.56, y 0.16–0.73) with drop shadow · giant two-word thin statement right
  (x 0.62–0.88, y 0.22–0.48) · attribution line under it · footer with logo, vertical divider, and URL.
- **Ground:** flat mustard yellow. **Typography:** thin, all-caps, very large statement in white.
- **Distinguishing features:** object-as-hero on a flat colour field; oversized light-weight caps; vertical divider footer.
- **Fit for us:** the only square reference. Best for the rare `discover_book` post where the cover art
  is shown, or a bold one-line statement on a flat accent ground. Working name `object_hero_square`.

### 3c. `single03_quote_card_portrait.jpg` (736×920, 4:5)
- **Concept:** a big-quote-marks card. A short statement on the left, oversized closing-quote glyphs on the
  right, a large low-contrast fingerprint texture behind, an open book photo entering from the bottom-right.
- **Regions:** statement (4 lines) left (x 0.11–0.51, y 0.30–0.45) with **two-weight emphasis** (regular vs bold,
  and one word in accent colour, upper-cased) · attribution block (bold small caps + accent-colour subline) ·
  oversized `”` pair centre-right (x 0.54–0.92, y 0.28–0.57) · fingerprint texture top-right ·
  book photo bottom-right · a footer band bottom.
- **Ground:** cool grey with a tone-on-tone texture. **Typography:** large geometric sans mixing weights.
- **Distinguishing features:** giant quote glyph as graphic; tone-on-tone texture; weight contrast used for emphasis.
- **Fit for us:** the strongest match for `quote_verbatim` and `reframe` atoms, where the
  post is one exact sentence from the workbook plus the chapter as attribution. Working name `quote_glyph`.

## 4. Template plan from these references

| # | Working id | From | Format | Renderer | Notes |
|---|---|---|---|---|---|
| 1 | `numbered_notes` | carousel set 01 | carousel (also usable single) | pillow | layouts `cover_desk`, `content_numbered` |
| 2 | `photo_split` | single01 | single_post | pillow | needs a Design Bank photo; otherwise `spec_only` |
| 3 | `object_hero_square` | single02 | single_post | pillow | 1080×1080 |
| 4 | `quote_glyph` | single03 | single_post | pillow | the quote card; tone-on-tone texture generated in code |

**Library size warning.** The template cooldown is 5 posts, and we have 4 templates, so the art director can never
satisfy the rule and would be forced into "least recently used" from post 2 onward. Recommended: keep the rule in
force but treat it as *advisory until at least 6 active templates exist* (already how `tools/validate.py` behaves,
and the art director must say so in `template_rationale`). More references make rotation real.

## 5. What we are deliberately not taking
- Any brand name, handle, URL, logo, store badge, price or "order now" line.
- Any photo (hands, books, fingerprint, desk objects). Design Bank imagery is our own.
- The orange/lavender/salmon/blue/mustard colours. Everything is recoloured to the Building Tomorrow palette.
- The designer's condensed typeface as a font we cannot identify. We use a licensed OFL equivalent.
