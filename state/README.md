# state/ — persistent pipeline state

The repo is the database. Everything here is plain JSON, JSONL or Markdown, and git-visible.
JSON and JSONL files are validated against the schemas in `state/schemas/` by `python tools/validate.py`.

| File | Format | Written by | Schema |
|---|---|---|---|
| `post-lifecycle.json` | JSON | Routines 01, 02 | `schemas/post-lifecycle.schema.json` |
| `design-memory.json` | JSON | Routine 01 (art director stage) | `schemas/design-memory.schema.json` |
| `media-ledger.json` | JSON | `tools/media_ledger.py` only (Routine 02) | `schemas/media-ledger.schema.json` |
| `story-queue.json` | JSON | `tools/story_queue.py` only | `schemas/story-queue.schema.json` |
| `qa-calibration.jsonl` | JSONL | Human-approval handling | `schemas/qa-calibration.line.schema.json` |
| `published-embeddings.jsonl` | JSONL | Routine 02 on confirmed publish | `schemas/published-embeddings.line.schema.json` |
| `feedback-log.md` | Markdown | Human (interim channel) | format documented in the file |
| `hero-qa-log.md` | Markdown | Routine 01 critic stage | format documented in the file |
| `visual-strategy.md` | Markdown | Routine 03 | none |
| `MASTER-STRATEGY.md` | Markdown | Routine 03 / human | none |
| `analytics-weekly/{week}.md` | Markdown | Weekly analytics step (Phase 3) | none |
| `proposed-rule-updates/{date}/` | diffs + rationale | Crystallization pass (Phase 3) | none |

## Write rules
1. **Atomic.** Write to `<file>.tmp`, then rename over the target. The tools do this; do not hand-edit `media-ledger.json` or `story-queue.json`.
2. **Idempotent.** Re-running any routine on the same input must not duplicate an entry. Keys: `post_id` (lifecycle, ledger), `file` (story queue).
3. **Recoverable.** Never delete history. `post-lifecycle.json` keeps an append-only `history` per post.
4. **Safe against double publication.** A `post_id` in `media-ledger.json` is never dispatched again.
5. **Commit promptly.** As MAS learned, commit state right after a confirmed dispatch, not at the end of the run.

## Lifecycle of a post

```
drafting -> pending_approval -> approved -> scheduled -> published
   |              |
   |              +-> rejected   (human moved folder to content/rejected/)
   +-> qa_escalated              (3 failed QA cycles; folder still lands in pending_approval with QA notes)
failed                           (dispatch error; folder parked in content/approved/ for retry)
```

## Scale canary
If the published corpus passes about 200 posts, or the dedup embedding check takes over 500 ms, revisit
storage (see `dedup.latency_canary_ms` and `dedup.corpus_canary_posts` in `config/pipeline.json`).
`tools/dedup_check.py` will log a warning when either is crossed.

## Who writes what (Phase 1 tools)
`tools/pipeline_state.py` is the only writer of `post-lifecycle.json`, `design-memory.json` and atom `state` in the content bank.
`tools/media_ledger.py` and `tools/story_queue.py` write their own files. `tools/dedup_check.py add` writes `published-embeddings.jsonl`
(Routine 02, on confirmed publish only). Everything else is human or routine-prompt authored Markdown.
