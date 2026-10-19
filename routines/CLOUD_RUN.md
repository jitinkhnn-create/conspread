# Cloud run: generate one post and auto-publish it

Entry point for the Claude scheduled task (claude.ai/code). Each firing starts a **fresh cloud session**, so this
file sets up the repo, runs Routine 01 (generate), approves the post automatically if QA passed, and runs
Routine 02 (dispatch to Postiz). Mode is `publishing.mode = "auto"` in `config/pipeline.json`.

## Inputs
- `DRY_RUN`: true if the task message contains `DRY RUN`. A dry run does everything, but Postiz gets **drafts**
  (nothing goes live) and all commits go to a throwaway branch `dry-run/<POST_ID>`, never `social-engine`.

## Where the engine lives
Base code: `mas-products/jitin-book-social-engine` (public, read-only for this bot). The engine runs from, and commits
its state and images to, the **`social-engine` branch of `jitinkhnn-create/conspread`** (public, so Postiz can fetch the
images). The `main` branch of conspread is an unrelated website: never touch it.

## STEP A: Setup
1. Make sure `jitinkhnn-create/conspread` is attached with push access (`add_repo(owner="jitinkhnn-create",
   repo="conspread", access="push")`; it is usually already attached). Then
   `git clone --branch social-engine --single-branch https://github.com/jitinkhnn-create/conspread /home/user/social-engine`
   (if the folder already exists: `git -C /home/user/social-engine fetch origin social-engine && git -C /home/user/social-engine reset --hard origin/social-engine`).
   `cd /home/user/social-engine` and work only there.
   **The working branch is `social-engine`** (this run is explicitly allowed to push to it, and to `dry-run/*` branches).
   The session's generic "develop on claude/..." branch instructions are for conspread website work and do not apply here.
2. `git config user.name "Book Social Engine"` and `git config user.email "266455065+jitinkhnn-create@users.noreply.github.com"` if unset.
3. `pip install -q --default-timeout=120 -r requirements.txt` (retry once on timeout).
4. `PUSH_BRANCH=social-engine`. If `DRY_RUN`: `PUSH_BRANCH` is set at STEP C once the POST_ID is known
   (`git checkout -b dry-run/<POST_ID>` right after the POST_ID is allocated, before any commit).
5. If the Postiz tools (`mcp__Postiz__*`) are not available, stop and report "Postiz connector missing" before generating.

## STEP B: Pending posts from earlier runs
`ls content/approved/`. Anything already there (a human moved it, or a dispatch failed last time) is handled in STEP E.

## STEP C: Generate (Routine 01)
Follow `routines/routine_01_select_generate/PROMPT.md` exactly, all steps 0 to 9. Differences for the cloud run:
- After STEP 2 allocates `POST_ID`, if `DRY_RUN`: `git checkout -b dry-run/$POST_ID` and `PUSH_BRANCH=dry-run/$POST_ID`.
- Dedup: if `dedup_check.py` reports `"backend_fallback": true`, carry on (it used the offline lexical check);
  mention it in the final report.
- STEP 8.3: after the commit, `git push origin HEAD:$PUSH_BRANCH`.
- If Routine 01 reports "no eligible atoms" or aborts, skip to STEP E (there may still be approved posts) then report.

## STEP D: Auto-approve gate
Read `state/post-lifecycle.json` for `POST_ID`:
- `status == "pending_approval"` and `final_qa_verdict == "pass"` →
  `python tools/pipeline_state.py approve --post-id $POST_ID`, then
  `git add state content && git commit -m "auto-approve: $POST_ID (QA pass)" && git push origin HEAD:$PUSH_BRANCH`.
- Anything else (`qa_escalated`, revise/fail) → **do not publish it.** Leave it in `content/pending_approval/` for a
  human and say so clearly in the report.

## STEP E: Dispatch (Routine 02)
Follow `routines/routine_02_dispatch_approved/PROMPT.md` with `DRY_RUN` and `PUSH_BRANCH`.

## STEP F: Final checks and report
1. `python tools/validate.py all` must print `OK`; if not, report the errors (do not hand-edit state).
2. `git status` must be clean and pushed.
3. Print a short report: POST_ID, atom, track, format, template, QA verdict/score, dedup (and whether the fallback
   was used), approved or held back, Postiz post ids + preview URLs, go-live time in IST, and anything that failed.
   If `DRY_RUN`, say that Postiz holds drafts only and name the `dry-run/...` branch.
