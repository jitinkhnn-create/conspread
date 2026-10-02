# Building Tomorrow: AI Social Media Studio

A small virtual social-media team (strategist, copywriter, art director, designer, QA critic, publisher,
analyst) that turns the book **"Building Tomorrow"** (a 16-chapter SEL workbook for ages 11 to 15, by Jitin Khanna)
into 2 to 3 Instagram posts a week.

The book is the intellectual source. Instagram is the discovery layer. **Value first, book discovery second.**
Two audience tracks: `child_teen` (ages 11 to 15) and `parent_teacher`. Content is grounded in the actual
workbook: no invented quotes, no fake chapter references, no distortion of meaning.

**This repo is both the code and the database.** No server, no VPS, no hosted runtime.

## How it works

```
 content_bank.json ──► [1 Strategist] ──► [2 Copywriter] ──► [3 Art director] ──► RENDERER ──► [4 QA critic]
   (atoms of the book)    what/for whom       every word         template + slots   (Pillow)      looks at the PNGs
                              │                   │  ▲                │                              │
                              ▼                   ▼  │                ▼                              ▼
                         strategist.json   copywriter.json    art_director.json         critic.json: pass / revise / fail
                                              dedup_check ─┘                                        │  revise → route back (max 3 cycles)
                                                                                                    ▼
                                                                          content/pending_approval/{post_id}/  ◄── human reviews here
```

1. **Every AI stage outputs structured JSON, never a final artefact.** Each JSON is validated against a schema
   in `agents/schemas/` plus semantic rules, by `python tools/validate.py stage <role> <file>`. Only the
   deterministic renderer turns JSON into pixels.
2. **The rulebooks learn, not the model.** No fine-tuning. Human rejections become structured feedback; a
   periodic crystallization pass proposes rulebook edits; a human merges them; the rulebook is permanently smarter.
3. **State lives in git.** JSON/JSONL for machines, Markdown for humans. See [`state/README.md`](state/README.md).
4. **Human-in-the-loop always.** Nothing publishes without a human moving it to `content/approved/`.
5. **Publishing is isolated** behind an adapter (`tools/publishing_adapter/postiz.py`). Swap Postiz and only the adapter changes.

### Two clocks
Local scheduler (cron / Task Scheduler) decides **when the pipeline runs**. Postiz decides **when an approved
post goes live**. They do not coordinate; the pipeline hands over finished posts and moves on.

## Runtime

Routines are **prompts run by headless Claude Code** (`claude -p`), the same execution model as the sibling
MAS social pipeline. Deterministic work (validation, dedup, rendering, ledgers, the Postiz adapter) is Python in
`tools/`. Because a prompt cannot enforce a JSON contract by itself, **`tools/validate.py` is the enforcement layer**,
and every stage must pass it before the next stage starts.

- Authentication: your Claude Code login. No Anthropic API key is needed on this path.
- Invoked by local cron (macOS/Linux) or Task Scheduler (Windows). See `config/cron.example` (Phase 2).
- Migration to GitHub Actions later means changing only *where* the same command is invoked. Everything is
  relative to the repo root; secrets are documented in `.env.example`.

```bash
pip install -r requirements.txt
python tools/validate.py all        # repo health check: expect "OK  repository"
```

## Repository map

| Path | What |
|---|---|
| `books/building_tomorrow/` | Source, per-chapter Markdown (`ch01.md`…), `content_bank.json` + schema |
| `brand/` | `voice.md`, `audience.md`, `guidelines.md`, `design_system.json` (**placeholder palette until the cover arrives**) |
| `agents/` | One rulebook per reasoning stage + `schemas/` (the JSON contracts) |
| `templates/` | `active/` `proposed/` `archived/` layout templates + `metadata.schema.json` |
| `assets/` | `benchmark/` (human references), `design-bank/` (approved imagery) |
| `state/` | All durable pipeline state (see its README) |
| `content/` | `drafts/` → `pending_approval/` → `approved/` → `published/`, or `rejected/` |
| `tools/` | Validation, dedup, rendering, visual QA, ledgers, publishing adapter |
| `routines/` | The four routine prompts |
| `config/` | `pipeline.json` (thresholds, sizes, paths); `cron.example` (Phase 2) |

## Phase 1 results

- **Manuscript:** `books/building_tomorrow/source/interior.pdf` → 8 sections in `chapters/ch01..ch08.md` (`python tools/extract_book.py`). It has **8 Sections, not 16 chapters**; "chapter N" means "Section N" throughout. Atoms are built from Sections 4, 7 and 8 first (57 atoms, every `workbook_verbatim` string machine-checked against the text: `python tools/validate.py bank`).
- **Templates:** `numbered_notes` (carousel), `quote_glyph`, `object_hero_square`, `photo_split`. Previews in `templates/active/*/preview/`.
- **Dry runs:** `post_20260921_01` (7-slide carousel, QA revise → pass) and `post_20260921_02` (quote card, one word-limit revision → pass) are waiting in `content/pending_approval/`. Re-rendering both reproduces the stored PNGs byte for byte.
- **Not yet run:** a full cycle driven by `claude -p` (Phase 2). Both dry runs were executed by hand by following `routines/routine_01_select_generate/PROMPT.md`.

## Human approval: interim mechanism (until Phase 3)

Routine 01 writes each finished candidate to `content/pending_approval/{post_id}/`:
rendered PNGs, `spec.json` (all stage outputs), `caption.md`, `rationale.md` (why this atom, why this template, what QA said).

- **Approve:** move the folder to `content/approved/`. Routine 02 dispatches it to Postiz on its next run. (Or `python tools/pipeline_state.py approve --post-id ID`.)
- **Reject:** move the folder to `content/rejected/`, and append a structured entry to `state/feedback-log.md`:

  ```
  ## {post_id} — rejected {date}
  - **layer:** content | copy | design | brand | tone
  - **issue_tag:** {short slug, e.g. hook-too-generic}
  - **action_note:** {one sentence — what to do differently}
  - **free_text:** {optional}
  ```
  The atom returns to `unused` with the rejection attached. Both happen on the next run's `pipeline_state.py reconcile`, or immediately with
  `python tools/pipeline_state.py reject --post-id ID --layer copy --issue-tag hook-too-generic --action-note "..."`, which also writes the log entry for you.
- **QA calibration:** if you approve something QA rejected (or reject something QA passed), append a line to
  `state/qa-calibration.jsonl`. This trains the critic.

The last 20 rejections are prepended to the strategist, copywriter and art-director prompts on every run, so
learning is immediate. Every 1 to 2 weeks, crystallization proposes durable rulebook diffs into
`state/proposed-rule-updates/{date}/` for you to merge by hand.

## Build phases

| Phase | Scope | Status |
|---|---|---|
| **0** | Repo skeleton, schemas, brand + agent rulebooks, state files, README, validator | **done** |
| **1** | Book extraction, content bank, benchmark analysis, 4-template library, renderers, visual QA, dedup, dry runs, rotation validation | **done** (2 live cycles; see below) |
| **2** | Routines 01 to 04 wired for cron, Postiz adapter, `config/cron.example`, end-to-end with manual approval | |
| **3** | Real approval channel, analytics ingestion, crystallization diffs, template evolution, regression tests, optional GitHub Actions | deferred |

## Relationship to MAS

Same execution model (prompt routines + Python helpers + repo-backed state + provider adapter) and several
mirrored patterns: a media ledger for idempotent dispatch, a Postiz slot check before creating a post, and parking
a finished post when publishing fails. The intelligence layer here (rulebooks, atomisation, template rotation,
dedup, crystallization) is book-specific. MAS itself is never modified from this repo.
Helpers are copied and adapted, not imported.

## Open items (need a human)

- [x] Cover image → palette and fonts in `brand/design_system.json` (done in Phase 1)
- [ ] **Which title is this book?** The manuscript says "Building Tomorrow" in its text, "Wisdom Ways" in its running header, and matches the *Meeting Myself* back cover. Decides the on-image name (`brand.mark_text` in `design_system.json`), the palette, and the attribution line
- [ ] Instagram handle, display name, and the book's CTA target → `brand/guidelines.md`
- [ ] Sensitive-topics policy for teen-facing content (`brand/voice.md`, marked `TO CONFIRM`)
- [ ] Postiz API key, instance URL, and the Instagram integration id (Phase 2)
