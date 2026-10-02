# Voice — Building Tomorrow

> Status: **structured placeholder.** The principles come from the project brief. Wording examples, banned phrases
> and the sensitive-topics policy are starting positions to be tuned against the real book text (Phase 1) and
> the first rejections. Items marked `TO CONFIRM` need a human decision.
> Read by: copywriter, critic. Updated by the crystallization loop (copy/tone issues).

## The one-line brief
A warm, clear older-sibling voice that helps a young person notice something true about themselves. Value first, book second.

## Principles
1. **Value first.** The post must be worth saving even if the reader never buys the book. The book is a footnote, not the point.
2. **Grounded in the workbook.** Every idea traces to a real passage. No invented quotes, no fake chapter references, no distortion of meaning. A paraphrase must keep the book's meaning.
3. **Never sales-heavy.** No urgency, no scarcity, no "buy now", no "link in bio!!!" pressure. A soft book mention is allowed only when `cta_intent` is `discover_book`.
4. **Respect the reader.** Ages 11 to 15 are not small children and not adults. Never talk down, never lecture, never moralise. Ask, invite, offer. Do not tell them how they should feel.
5. **Plain language.** Short sentences. Everyday words. If a 12-year-old would skim past a word, replace it.
6. **Specific beats generic.** A concrete moment ("your friend leaves you on read") beats an abstraction ("relationships can be hard").

## Two registers

| | `child_teen` | `parent_teacher` |
|---|---|---|
| Person | "you" | "you" (the adult), "your child / your students" |
| Tone | Warm, direct, a little playful, never cringe | Calm, practical, collegial, never guilt-inducing |
| Hook style | A situation they recognise, or a question about themselves | A moment they have lived with a young person, or a small script to try |
| Length | Very short on slides (about 25 words max per slide) | Slightly more room (about 35 words max per slide) |
| Avoid | Slang that dates fast, trying to sound like a teen, "kids these days" | Blame, diagnosing the child, jargon, "you must" |

## Do
- Open with something the reader recognises, not with the book.
- Give one clear idea per slide.
- Use the workbook's own framing and vocabulary where it exists.
- End carousels with something the reader can do or ask themselves in under a minute.
- Write captions that add to the slides, not repeat them.

## Don't
- Don't use fear, shame or comparison to motivate.
- Don't promise outcomes ("this will fix your anxiety").
- Don't diagnose or give clinical advice.
- Don't use emoji as decoration. `TO CONFIRM`: at most 1 to 2 per caption, none on slides.
- Don't stack hashtags in the caption body. Hashtags go in the `hashtags` field only.
- Don't repeat a hook structure from the last few posts (see the dedup check).

## Banned or discouraged phrases (starter list, grows via crystallization)
- "Game changer", "hack", "life-changing", "you won't believe"
- "As a parent, you should…", "Kids need to…"
- "Unlock your potential", "level up" (empty self-help register)
- "Link in bio to buy"

## Sensitive topics — `TO CONFIRM`
Chapter content on emotions can brush against anxiety, anger, sadness, bullying and grief. Until the human decides otherwise:
- Never present the post as therapy, treatment or a substitute for help.
- Never give advice about self-harm, suicide, eating disorders, abuse or medical conditions. If an atom's `sensitivity` is `sensitive`, the critic must set `route_to: human` and the rationale must say why.
- Frame difficult emotions as normal signals, in the workbook's own terms, and encourage talking to a trusted adult where the workbook does.

## Caption shape
1. First line: the hook (visible before "more"). Stands alone.
2. One to three short paragraphs that add context or a concrete example.
3. One line inviting the reader to do or reflect on something, matching `cta_intent`.
4. (Only for `discover_book`) One soft line about the book, e.g. "This comes from Chapter N of Building Tomorrow." Never a hard sell.

## Hook families (used for analytics; pick the closest)
`question` · `myth_bust` · `reframe` · `scenario` · `direct_address` · `list_promise` · `quote` · `contrast` · `invitation`

## Examples
_Deliberately empty. Real examples are added from approved posts after the first cycles, so the rulebook learns from the human's taste, not from guesses._
