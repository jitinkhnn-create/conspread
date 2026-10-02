# routines/

The four routines. Each lives in its own folder and is a **prompt** (`PROMPT.md`) that headless Claude Code
executes (`claude -p`), the same execution model as the MAS pipeline. The prompt orchestrates; the
deterministic work is done by scripts in `tools/`.

| Folder | Routine | Prompt written in |
|---|---|---|
| `routine_01_select_generate/` | Select atom → strategist → copywriter → art director → render → QA → `pending_approval/` | Phase 1 (dry runs), wired in Phase 2 |
| `routine_02_dispatch_approved/` | `content/approved/` → Postiz adapter → ledger | Phase 2 |
| `routine_03_weekly_strategy/` | Analytics + feedback → `MASTER-STRATEGY.md`, `visual-strategy.md` | Phase 2 |
| `routine_04_design_refresh/` | New reference → template proposal; design-bank assets | Phase 2 |

## How a routine runs

```
cron / Task Scheduler
  └─ python tools/run_routine.py routine_01_select_generate      (Phase 2)
       └─ claude -p < routines/routine_01_select_generate/PROMPT.md
            ├─ reads the repo, runs tools/*.py for anything deterministic
            ├─ per stage: read agents/<role>.md → write <stage>.json → python tools/validate.py stage <role> <file>
            └─ writes results back to the repo and exits
```

## Rules every routine prompt follows
1. **Stage JSON, never a final artefact.** A reasoning stage writes JSON to `content/drafts/{post_id}/`. Only `tools/compose_post.py` produces pixels.
2. **A stage is not done until `tools/validate.py stage <role> <file>` exits 0.** On failure, fix and re-validate (max 2 self-repairs), then abort the run and log the failure.
3. **Stages stay distinct.** Each stage reads only its own rulebook in `agents/` plus the inputs listed there. It does not read the other rulebooks.
4. **State writes go through the tools** (`media_ledger.py`, `story_queue.py`, `validate.py` for checks) or the documented atomic pattern in `state/README.md`.
5. **Commit state right after a confirmed state change**, never batched to the end of a run (a MAS lesson).
6. **Nothing publishes in Routine 01.** It ends by writing `content/pending_approval/{post_id}/`.
7. **No absolute paths, no machine-specific env vars.** Everything is relative to the repo root; secrets come from `.env.example`-documented variables.
8. **On error:** log to `state/post-lifecycle.json` history, leave the run's draft folder in place, and continue to a clean exit code.
