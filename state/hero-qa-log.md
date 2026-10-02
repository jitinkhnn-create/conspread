# QA log

Append-only record of every QA critic decision. Routine 01 appends one entry per critic pass
(so a post that goes through 3 revision cycles gets 3 entries). Routine 03 and the crystallization
pass read this to find recurring problems.

## Entry format

```
## {post_id} — attempt {n} — {YYYY-MM-DD}
- **verdict:** pass | revise | fail
- **score:** {0-100}
- **template:** {template_id}
- **issues:** {layer/slide/route_to/short issue per line, or "none"}
- **summary:** {two or three sentences}
```

## Entries

<!-- Append new entries below this line. Newest last. -->

## post_20260921_01 — attempt 1 — 2026-09-21
- **verdict:** revise
- **score:** 74
- **template:** numbered_notes
- **issues:** design/s7/renderer: The closing takeaway slide carries the number badge '06', but the cover promises 'Five everyday moments' and the numbered examples end at 05. It reads as a sixth moment and contradicts the hook.; design/sNone/renderer: On every content slide the body block hugs the headline and leaves roughly the bottom third of the canvas empty (worst on slides 4, 5 and 7). The slides feel top-heavy and the body text is smaller than it needs to be for a phone.; copy/s4/human: Slides 2, 3 and 6 use the Mind/Heart contrast; slide 4 has none, so the rhythm breaks once. This is faithful to the workbook (that moment has no mind/heart lines), so it is acceptable, not a defect.
- **summary:** Grounded, warm and clearly aimed at 11-15 year olds; the cover hook is strong and the desk-collage cover is the best-looking slide. Two renderer fixes are needed: the closing slide is numbered '06' against a 'Five moments' promise, and the content slides leave the lower third empty. Neither needs new copy or a new template.

## post_20260921_01 — attempt 2 — 2026-09-21
- **verdict:** pass
- **score:** 86
- **template:** numbered_notes
- **issues:** design/sNone/renderer: Body text size differs from slide to slide (about 36px on slide 2 up to 52px on slide 7) because each slide is fitted on its own. Content slides read as slightly inconsistent when swiped in sequence.; design/s7/renderer: The highlight on 'small,' includes the trailing comma, and the seedling appears twice on the closing slide (badge and corner).
- **summary:** Attempt 1's two issues are fixed: the numbering now runs 01-05 and the closing slide uses a seedling badge, and the body block sits well in the canvas. Every situation and every quoted line comes verbatim from Section 4 and is declared. Safe and warm for ages 11-15, no sales language, nothing sensitive. Two cosmetic renderer polish items remain and do not block approval.

## post_20260921_02 — attempt 1 — 2026-09-21
- **verdict:** pass
- **score:** 88
- **template:** quote_glyph
- **issues:** design/s1/art_director: The oversized quote glyph and the growth-ring texture sit in the top-right while the statement starts low on the left, leaving a fairly large empty area top-left. It reads as intentional white space, but the composition is bottom-heavy.
- **summary:** A verbatim two-sentence quote from the workbook's closing letter, set large with the key phrase underlined, the growth-ring texture and seedling rising from the soil band tying it to the book's identity. The attribution is honest and reads as a source credit, not a pitch. The renderer's word-limit guard caught a 31-word draft and the copy was revised once before rendering. Only a cosmetic composition note remains.
