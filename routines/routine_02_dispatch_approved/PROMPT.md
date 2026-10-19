# Routine 02: Dispatch approved posts to Postiz

You publish every folder in `content/approved/post_*` through the **Postiz connector** (MCP tools `mcp__Postiz__*`).
Run from the repo root. The deterministic parts are done by `tools/publishing_adapter/postiz_mcp.py`; you make the
Postiz calls in between. Channels, publish time and timezone come from `config/pipeline.json` → `publishing`.

Inputs from the caller: `DRY_RUN` (true/false) and `PUSH_BRANCH` (the branch this run pushes to).

Rules:
- A `post_id` already in `state/media-ledger.json` is **never** sent again (`prepare` refuses it).
- Never post content that is not in the post's `spec.json` / `dispatch_plan.json`. Never edit the caption.
- When `DRY_RUN` is true: create Postiz **drafts** (`type: "draft"`), and do NOT run `record` (state stays approved).
- Commit and push right after each confirmed state change.

## For each `content/approved/<POST_ID>/`

1. **Prepare.** `python tools/publishing_adapter/postiz_mcp.py prepare --post-id <POST_ID>` → prints the plan
   (also saved as `dispatch_plan.json`). Exit 1 = refused: log the reason, skip this post.
2. **Publish the media to GitHub** so Postiz can fetch it:
   `git add content/approved/<POST_ID> && git commit -m "routine 02: media for <POST_ID>" && git push origin HEAD:<PUSH_BRANCH>`,
   then `SHA=$(git rev-parse HEAD)`.
3. **URLs.** `python tools/publishing_adapter/postiz_mcp.py urls --post-id <POST_ID> --sha $SHA`.
   Check every URL with `curl -s -o /dev/null -w "%{http_code}" <url>` until it returns 200 (retry every 10 s, up to 2 min).
4. **Upload.** For each URL, in slide order: `mcp__Postiz__uploadFromUrlTool(url)`. Keep each returned `path`
   (that is the attachment URL). If one fails, retry it once; if it still fails, stop this post (step 8).
5. **Slot check.** `mcp__Postiz__postsListTool` from 1 day before to 1 day after `date_utc`. If a post on the same
   integration already starts with the same first 60 characters of `caption_plain`, it was already created by an
   earlier interrupted run: do not create it again, use that post's id as that channel's result.
6. **Create.** One `mcp__Postiz__integrationSchedulePostTool` call with one `socialPost` item per channel in the plan:
   - `integrationId`: the channel's `integration_id`; `isPremium`: false; `shortLink`: false
   - `type`: `"schedule"` (or `"draft"` when `DRY_RUN`); `date`: the plan's `date_utc`
   - `postsAndComments`: `[{"content": <content_html>, "attachments": [<uploaded paths in slide order>]}]`
   - `settings`: the channel's `settings` from the plan
   If `output.errors` comes back, fix what it names (never the caption text) and retry once. The result is
   `output: [{postId, integration, previewUrl}, ...]`, one item per channel: map `integration` back to the channel
   name and note its `postId` and `previewUrl`.
7. **Record** (skip when `DRY_RUN`):
   `python tools/publishing_adapter/postiz_mcp.py record --post-id <POST_ID> --result instagram=<id> --result facebook=<id>`
   (only the channels that succeeded). Then
   `git add state books content && git commit -m "routine 02: scheduled <POST_ID>" && git push origin HEAD:<PUSH_BRANCH>`.
8. **On failure** (no channel succeeded): `python tools/pipeline_state.py advance --post-id <POST_ID> --status failed --note "<why>"`,
   leave the folder in `content/approved/` (it is retried next run), commit + push, continue with the next post.

## Sync earlier posts (run once, after the loop; skip when `DRY_RUN`)
`mcp__Postiz__postsListTool` for the last 14 days → for each ledger entry with `state: scheduled`
(`python tools/media_ledger.py show`) whose date has passed, find its Postiz post(s) by id:
- published on every channel → `python tools/media_ledger.py set-state --post-id <ID> --state published` and
  `python tools/pipeline_state.py mark --post-id <ID> --status published`
- errored → `python tools/media_ledger.py set-state --post-id <ID> --state failed_parked` and
  `python tools/pipeline_state.py mark --post-id <ID> --status failed --note "<postiz error>"`; report it.
Commit + push if anything changed.

## Report
Per post: POST_ID, channels + Postiz ids + preview URLs, scheduled time (local), or why it was skipped/failed.
