# Routine 01: Select + Generate (no publish)

You are the orchestrator of the Building Tomorrow content pipeline. Run from the repo root. Produce **one** finished
candidate in `content/pending_approval/` and stop. **You never publish, message anyone, or touch `content/approved/`.**

Each reasoning stage below is a separate role with its own rulebook. When you act as a stage, **read only that stage's
rulebook and the inputs it lists**; do not carry another stage's reasoning into it. A stage is finished only when its
JSON passes `tools/validate.py`. All state changes go through `tools/pipeline_state.py`. Never hand-edit JSON state.

Rules that hold for the whole run:
- Stage output is JSON written to a file, never prose. Only `tools/compose_post.py` makes pixels.
- Quotes must be verbatim from `books/building_tomorrow/chapters/`. Never invent a quote, chapter/section reference, or statistic.
- The manuscript's parts are "Sections", stored as `chNN.md`. "Chapter N" and "Section N" mean the same thing here.
- On any unrecoverable error: `python tools/pipeline_state.py release-atom --post-id <id> --reason "<why>"`, then stop with a clear message.

## STEP 0: Preflight
1. `python tools/validate.py all` must print `OK`. If not, stop and report.
2. `python tools/pipeline_state.py reconcile` (picks up folders the human moved by hand).
3. Read `config/pipeline.json` for thresholds.

## STEP 1: Short-term feedback
Read the **last 20 entries** of `state/feedback-log.md`. Keep them as `FEEDBACK`. Each stage below gets the entries whose
`layer` is relevant (strategist: all; copywriter: copy/tone/content; art director: design/brand).

## STEP 2: Allocate
`python tools/pipeline_state.py new-post` → `POST_ID`. Work in `content/drafts/$POST_ID/`.

## STEP 3: Strategist stage
Read `agents/strategist.md`. Inputs are listed there. Write `content/drafts/$POST_ID/strategist.json`.
Then `python tools/validate.py stage strategist content/drafts/$POST_ID/strategist.json`.
If no `unused` atom exists, report "no eligible atoms" and exit (nothing has been queued, so nothing to release).
Then `python tools/pipeline_state.py queue-atom --post-id $POST_ID --atom-id <atom_id>`.

## STEP 4: Copywriter stage (with dedup)
Read `agents/copywriter.md`, the atom, its chapter file, `brand/voice.md`, `brand/audience.md`, and `FEEDBACK`.
Write `copywriter.json` (set `revision` 0). Then:
1. `python tools/validate.py stage copywriter copywriter.json --strategist strategist.json`
2. `python tools/validate.py grounding copywriter.json`
3. `python tools/dedup_check.py --json check --hook "<hook>" --headline "<headline>"`
   - Exit 1 (too similar): rewrite with a genuinely different angle or structure (not a synonym swap), increment `revision`,
     keep the earlier file in `history/`, and redo 1 to 3. **Maximum 3 attempts** (`dedup.max_rewrite_attempts`).
     If still too similar, stop and report which post it collides with.
   - Copy the JSON result into `copywriter.json` → `dedup` as `{threshold, max_similarity, closest_post_id, attempts, passed}`.
Fix any validation error yourself (up to 2 self-repairs), then continue.

## STEP 5: Art director stage
Read `agents/art_director.md`. Write `art_director.json`, then
`python tools/validate.py stage art_director art_director.json --strategist strategist.json --copy copywriter.json`.
The template cooldown and slot rules are enforced by the validator.

## STEP 6: Render
`python tools/compose_post.py --copy copywriter.json --spec art_director.json --out-dir render`
- Exit 3 (content does not fit): read the message. Too many words or a too-long headline → back to STEP 4 with that as a
  revision request; layout/slot problem → back to STEP 5. Count it as a QA cycle.
- `python tools/visual_qa.py post render` must PASS. Errors are renderer/structure defects: fix upstream and re-render.

## STEP 7: QA critic stage (up to 3 cycles)
Read `agents/critic.md`. **Open every PNG in `render/` with the Read tool and actually look at it.** Also read the
deterministic results (validate, grounding, dedup, visual_qa). Write `critic.a<N>.json` (N = cycle) and copy it to `critic.json`;
validate with `python tools/validate.py stage critic critic.json`.
- `pass` → STEP 8.
- `revise` → route each issue: `copywriter` → STEP 4 (increment `revision`, re-run dedup and grounding), `art_director` → STEP 5,
  `renderer` → fix upstream and re-render. Re-render, re-run visual_qa, run the critic again with `attempt` + 1.
- `fail`, or `revise` after cycle 3 → go to STEP 8 anyway; the post is escalated to a human with the QA notes.
Keep every superseded stage file in `history/` (`copywriter.r0.json`, `art_director.r0.json`, …).

## STEP 8: Finalize
1. `python tools/pipeline_state.py finalize --post-id $POST_ID` builds `content/pending_approval/$POST_ID/`
   (PNGs, `spec.json`, `caption.md`, `rationale.md`), updates design memory, `state/hero-qa-log.md` and the lifecycle.
2. `python tools/validate.py all` must still print `OK`.
3. Commit state: `git add state books content templates && git commit -m "routine 01: $POST_ID"` (skip if this is not a git checkout).

## STEP 9: Report
Print: `POST_ID`, atom, track, format, template + slots, final QA verdict/score, dedup similarity, whether escalated,
and the path `content/pending_approval/$POST_ID/`. Then stop. The human reviews out-of-band (see README).
