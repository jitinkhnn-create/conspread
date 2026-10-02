# post_20260921_01

## Why this atom
**bt_ch04_heart_moments_daily_life** (child_teen, carousel, CTA: save)

First post in the pipeline, so there is no recent history to rotate against. This atom is the strongest carousel candidate in the bank for the child_teen track: five concrete situations a 11-15 year old recognises, each with a built-in contrast (what the mind says vs what the heart says) and a closing question, all verbatim from the workbook so grounding is safe. The atom is not sensitive. CTA is 'save' (a framework is something to come back to); discover_book is deliberately not used on the very first post, per MASTER-STRATEGY.

Angle: You don't need a big, dramatic moment to hear your heart. It is already speaking in five ordinary situations: a mean group-chat joke, a broken pen, a post that isn't really you, a raised hand, and money on the floor when no one is watching.

## Why this template
**numbered_notes**, slots: `{"background": "textured", "accent_color": "sunrise", "emphasis_style": "highlight", "imagery_type": "illustration"}`

numbered_notes is the only active carousel template, and this is a 7-slide numbered framework with a hook cover, which is exactly the structure it was derived from. cover_desk carries the hook; content_numbered carries the five situations (numbered badges 01-05 double as the progress cue) and the closing takeaway. Slots: sunrise (warm gold from the cover's sun glow) for a friendly, high-contrast cover ground; textured for the dot-grid paper feel; illustration (the cover's seedling) to tie the post to the book without showing it; highlight because the reference's selection-box emphasis is this template's signature. LIBRARY NOTE: only 1 of 4 active templates supports carousels, so carousel posts cannot rotate templates until more carousel references are added.

## Copy
Hook (direct_address): Your heart is already talking.

Dedup: {"threshold": 0.85, "max_similarity": 0.0, "closest_post_id": null, "attempts": 1, "passed": true}

## What QA said (attempt 2, pass, score 86)
Attempt 1's two issues are fixed: the numbering now runs 01-05 and the closing slide uses a seedling badge, and the body block sits well in the canvas. Every situation and every quoted line comes verbatim from Section 4 and is declared. Safe and warm for ages 11-15, no sales language, nothing sensitive. Two cosmetic renderer polish items remain and do not block approval.

Issues:
- [design/minor] slide None: Body text size differs from slide to slide (about 36px on slide 2 up to 52px on slide 7) because each slide is fitted on its own. Content slides read as slightly inconsistent when swiped in sequence. -> renderer: Optional polish: compute one shared body size for the whole carousel (the smallest size any slide needs) so the type stays constant across slides.
- [design/minor] slide 7: The highlight on 'small,' includes the trailing comma, and the seedling appears twice on the closing slide (badge and corner). -> renderer: Optional polish: exclude trailing punctuation from highlight boxes; consider dropping the corner seedling on slides that already use the seedling badge.

QA history: a1=revise(74), a2=pass(86)
