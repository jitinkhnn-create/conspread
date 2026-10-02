# Feedback log

Interim human-feedback channel (until Phase 3 builds a real approval channel).
When you reject a candidate, move its folder to `content/rejected/` and **append** one entry below
using exactly this format. Routine 01 reads the **last 20 entries** on every run and prepends them to
the strategist, copywriter and art director prompts. Do not edit or delete old entries; the
crystallization pass reads the whole history.

Also flip the atom back to `unused` in `books/building_tomorrow/content_bank.json` (record the
rejection in `state.rejections`), or ask the routine to do it. Then, if QA had passed this post,
append a line to `state/qa-calibration.jsonl` (`mismatch_type: under_rejection`).

Allowed `layer` values: `content` | `copy` | `design` | `brand` | `tone`.

## Entry format

```
## {post_id} — rejected {YYYY-MM-DD}
- **layer:** content | copy | design | brand | tone
- **issue_tag:** {short slug, e.g. hook-too-generic, off-brand-palette, sounds-preachy}
- **action_note:** {one sentence — what to do differently}
- **free_text:** {optional nuance}
```

## Entries

<!-- Append new entries below this line. Newest last. -->
