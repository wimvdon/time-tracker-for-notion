# Setting up "Sign in with Notion"

The apps sign in to Notion through a small sign-in server: a Cloudflare Worker (`worker/` in this
repository) at **https://timetracker-signin.wim.to**. It holds Notion's client secret, which can't
be kept safely inside an app, and only swaps Notion's one-time sign-in code for a token (and
renews tokens). It stores nothing. How it works: [architecture.md](architecture.md#sign-in-with-notion).

This is a one-time setup. Each value goes in exactly one place:

| Value | Where it comes from | Where it goes |
|---|---|---|
| OAuth client ID | Notion (your public connection) | Cloudflare, worker secret `NOTION_CLIENT_ID` |
| OAuth client secret | Notion (your public connection) | Cloudflare, worker secret `NOTION_CLIENT_SECRET` |
| State secret | You make it up (a long random password) | Cloudflare, worker secret `STATE_SECRET` |
| Cloudflare API token | Cloudflare | GitHub, repository secret `CLOUDFLARE_API_TOKEN` |
| Cloudflare account ID | Cloudflare | GitHub, repository secret `CLOUDFLARE_ACCOUNT_ID` |

None of these ever go in the repository or in an app.

## 1. Notion: the public connection

In Notion's developer portal ([app.notion.com/developers/connections](https://app.notion.com/developers/connections)),
open the public connection for Time Tracker:

1. **Redirect URI:** `https://timetracker-signin.wim.to/callback` (exactly this, no slash at the end).
2. **Capabilities:** Read content, Update content, Insert content, and Read user information
   **without** email addresses (for "person" fields).
3. **Icon:** the app icon (512×512 PNG).
4. Copy the **OAuth client ID** and **OAuth client secret** for step 3.

## 2. Cloudflare and GitHub: deploying the worker

The domain `wim.to` must be in the same Cloudflare account; the worker adds
`timetracker-signin.wim.to` to it by itself on the first deploy.

1. Cloudflare → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers**
   → choose your account and the `wim.to` zone → **Create**. Copy the token.
2. Cloudflare → **Workers & Pages** → copy the **Account ID** (right-hand side).
3. GitHub → this repository → **Settings → Secrets and variables → Actions → New repository
   secret**: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` with the values above.
4. Deploy: GitHub → **Actions → Deploy worker → Run workflow** (on `main`). It also runs by
   itself whenever `worker/` changes on `main`. Without the two secrets it is skipped, with a
   note on the run's summary.

## 3. Cloudflare: the worker's secrets

After the first deploy: Cloudflare → **Workers & Pages → time-tracker-for-notion → Settings →
Variables and Secrets → Add**, type **Secret**, three times:

- `NOTION_CLIENT_ID`: the OAuth client ID from step 1.
- `NOTION_CLIENT_SECRET`: the OAuth client secret from step 1.
- `STATE_SECRET`: a long random password (40+ characters, from a password manager). Changing it
  later only cancels sign-ins that are in progress at that moment.

**Deploy** after adding them. Check: opening https://timetracker-signin.wim.to/ in a browser shows
`{"error":"not_found"}`. That means the worker runs.

## If the client secret leaks

Notion → your connection → regenerate the client secret, then replace `NOTION_CLIENT_SECRET` in
Cloudflare. People who are signed in stay signed in.
