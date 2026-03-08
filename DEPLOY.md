# KWEN Council — Deployment Guide (GUI Only)
## Deploy to Cloudflare Workers Free Tier — No Command Line Needed

---

## Overview

You will upload one file (`worker.js`) to Cloudflare and configure everything through browser dashboards. Total time: ~20 minutes.

```
Your Browser
    ↓
Cloudflare Dashboard  →  Upload worker.js  →  Live on Workers URL
    ↓
Set 4 secrets + 2 KV stores
    ↓
HuggingFace Dashboard  →  Create OAuth App  →  Paste redirect URL
```

---

## PART A — HuggingFace: Get Your OAuth Credentials

> You mentioned the OAuth app is already created with `inference-api` permission. Just grab your credentials.

1. Go to **https://huggingface.co/settings/connected-apps**
2. Find your KWEN Council app and click on it
3. Copy and save two values somewhere safe:
   - **Client ID** (looks like: `abc123...`)
   - **Client Secret** (long random string — keep this private)

You'll need both in Part C.

---

## PART B — Cloudflare: Create KV Storage Namespaces

KV is Cloudflare's key-value storage — used to store sessions and chat history.

1. Go to **https://dash.cloudflare.com** and log in (create a free account if needed)
2. In the left sidebar, click **Workers & Pages**
3. Click **KV** in the top navigation tabs
4. Click **Create a namespace**
   - Name: `kwen-sessions`
   - Click **Add**
   - 📋 **Copy the ID shown** — it looks like `a1b2c3d4e5f6...` — save it
5. Click **Create a namespace** again
   - Name: `kwen-chats`
   - Click **Add**
   - 📋 **Copy this ID too** — save it separately

---

## PART C — Edit wrangler.toml Before Uploading

Open `wrangler.toml` in any text editor (Notepad, TextEdit, VS Code, etc.) and replace the two placeholder IDs with your real KV IDs from Part B:

**Find these lines:**
```
id = "REPLACE_WITH_SESSIONS_KV_ID"
...
id = "REPLACE_WITH_CHATS_KV_ID"
```

**Replace with your real IDs:**
```
id = "a1b2c3d4e5f6..."    ← your kwen-sessions ID
...
id = "x9y8z7w6v5u4..."    ← your kwen-chats ID
```

Save the file.

---

## PART D — Cloudflare: Create & Deploy the Worker

1. Go to **https://dash.cloudflare.com**
2. Left sidebar → **Workers & Pages**
3. Click **Create** (top right)
4. Choose **"Create Worker"** (not Pages)
5. Give it a name: `kwen-council`
6. Click **Deploy** (deploys a placeholder — that's fine)
7. You'll now see a screen with your Worker URL at the top:
   ```
   https://kwen-council.<your-account>.workers.dev
   ```
   📋 **Copy this URL** — you need it for the next step

8. Click **Edit code** (top right of the Worker page)
9. In the code editor, **select all existing code** (Ctrl+A / Cmd+A) and **delete it**
10. Open `worker.js` from your downloaded files, **select all**, copy it
11. **Paste** it into the Cloudflare code editor
12. Click **Deploy** (top right of editor)

---

## PART E — Cloudflare: Add Secrets (Environment Variables)

1. Go back to your Worker page: **Workers & Pages → kwen-council**
2. Click the **Settings** tab
3. Click **Variables and Secrets**
4. Click **Add** and add each of these 4 secrets one by one:

| Variable Name | Type | Value |
|---|---|---|
| `HF_CLIENT_ID` | Secret | Your HuggingFace Client ID from Part A |
| `HF_CLIENT_SECRET` | Secret | Your HuggingFace Client Secret from Part A |
| `REDIRECT_URI` | Secret | `https://kwen-council.<YOUR-ACCOUNT>.workers.dev/api/auth/callback` |
| `APP_URL` | Secret | `https://kwen-council.<YOUR-ACCOUNT>.workers.dev` |

> For each one: type the name → select **"Secret"** from the type dropdown → paste the value → click **Save**

> ⚠️ Replace `<YOUR-ACCOUNT>` with your actual Cloudflare account subdomain from the Worker URL in Part D.

---

## PART F — Cloudflare: Bind KV Namespaces to the Worker

1. Still in **Workers & Pages → kwen-council → Settings**
2. Click **Bindings**
3. Click **Add** → choose **KV Namespace**
   - Variable name: `SESSIONS`
   - KV Namespace: select `kwen-sessions` from the dropdown
   - Click **Save**
4. Click **Add** → choose **KV Namespace** again
   - Variable name: `CHATS`
   - KV Namespace: select `kwen-chats` from the dropdown
   - Click **Save**

---

## PART G — HuggingFace: Update Redirect URI

Now that you have your real Worker URL, update your HF OAuth app:

1. Go to **https://huggingface.co/settings/connected-apps**
2. Click on your KWEN Council app → **Edit**
3. Update the **Redirect URI** to:
   ```
   https://kwen-council.<YOUR-ACCOUNT>.workers.dev/api/auth/callback
   ```
4. Update the **Homepage URL** to:
   ```
   https://kwen-council.<YOUR-ACCOUNT>.workers.dev
   ```
5. Click **Save**

---

## PART H — Re-deploy to Apply All Settings

1. Go to **Workers & Pages → kwen-council**
2. Click **Edit code**
3. Click **Deploy** (even without changes — this triggers a fresh deploy with all the new secrets and bindings)

---

## PART I — Test It

1. Visit: `https://kwen-council.<YOUR-ACCOUNT>.workers.dev`
2. You should see the KWEN Council login page
3. Click **"Continue with Hugging Face"**
4. Authorise the app on HuggingFace
5. You should be redirected back and logged in
6. Type a question and click **"Convene Council"**

---

## Optional: Custom Domain

1. **Workers & Pages → kwen-council → Settings → Domains & Routes**
2. Click **Add Custom Domain**
3. Enter your domain (it must be on Cloudflare's nameservers)
4. Go back to **Variables and Secrets** and update:
   - `APP_URL` → `https://yourcustomdomain.com`
   - `REDIRECT_URI` → `https://yourcustomdomain.com/api/auth/callback`
5. Update the HuggingFace OAuth app redirect URI to match
6. Re-deploy (Edit code → Deploy)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login button goes to error page | Check `HF_CLIENT_ID` and `REDIRECT_URI` secrets exactly match your HF app settings |
| "redirect_uri_mismatch" error | The `REDIRECT_URI` secret must be character-for-character identical to what's in HF |
| Blank page after login | Check `APP_URL` secret is set correctly |
| "KV namespace not found" error | Check the KV bindings in Settings → Bindings are named `SESSIONS` and `CHATS` exactly |
| AI responses fail | The `inference-api` scope on your HF OAuth app must be enabled (you confirmed this ✅) |
| 503 / model loading | Qwen 72B may be cold-starting. Wait 30 seconds and retry. Switch to 7B for faster responses. |

---

## Changing the Qwen Model

In **Workers & Pages → kwen-council → Settings → Variables and Secrets**, find `HF_MODEL` (or add it as a plain text variable) and set it to one of:

| Model | Speed | Quality |
|---|---|---|
| `Qwen/Qwen2.5-72B-Instruct` | Slower | Best (default) |
| `Qwen/Qwen2.5-32B-Instruct` | Medium | Great |
| `Qwen/Qwen2.5-7B-Instruct` | Fast | Good |

---

## Free Tier Limits (Cloudflare)

| Resource | Free Allowance |
|---|---|
| Worker requests | 100,000 / day |
| KV reads | 100,000 / day |
| KV writes | 1,000 / day |
| KV storage | 1 GB |

Plenty for personal and small-team research use.

---

## Security Features Active

- ✅ `HttpOnly` cookies — session tokens invisible to JavaScript
- ✅ `Secure` flag — cookies only transmitted over HTTPS
- ✅ `SameSite=Strict` — CSRF attack prevention
- ✅ 24-hour session expiry with server-side storage
- ✅ Safe AI guidelines injected into every model call
- ✅ Security headers: X-Frame-Options DENY, X-XSS-Protection, Referrer-Policy
- ✅ Input validation and 2000-character request limit

---

*Files in this package: worker.js · wrangler.toml · DEPLOY.md*
