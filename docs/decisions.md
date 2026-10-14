# Technical decisions

## Android through Google Play, no GitHub Releases (2026-10-14)

The repository becomes public (free GitHub Actions minutes), and the apps should not be freely downloadable. The Release workflow no longer creates a GitHub Release. The `vX.Y.Z` tag is still created (after a successful release), and the version rules (`android/scripts/release_version.py`) are unchanged. Same setup as the sibling apps Snoozer and Tracker for Simkl.

- **Android:** a signed AAB goes to Google Play's **internal testing** track; the owner installs from Play with automatic updates and no longer needs Obtainium. Uploaded with `r0adkll/upload-google-play` (approved by the owner), a widely used action, pinned to the v1.1.5 commit, in its own job with read-only GitHub access that runs only after both apps passed. The tag is created by a separate job afterwards, so a failed run leaves no tag and can be re-run. Rejected: a hand-written upload script against the Play Developer API.
- **Windows:** no public download at all (the owner's choice). A release's installer is a file of the workflow run (kept 90 days), downloaded by hand. Trade-off: no update notice and manual installs; once the repository is public, anyone signed in to GitHub can download run artifacts. Rejected: a GitHub Release with only the installer (public download); the Microsoft Store (a much larger change).
- **A new Google-generated app signing key** (Play App Signing), not the key shared with the owner's other apps; the existing key is only the upload key. Cost: the GitHub-installed Android app must be uninstalled once, losing the saved API key and settings (time entries are in Notion). Rejected: giving Google the shared key, which ties the three apps' signing together.
- **A build-only run (`none`) still produces a Dev installer, an APK and an AAB**, the AAB for the first upload by hand, with versionCode 1 so they can never update an installed app.
- Selling the apps later would need Google's billing library (a new dependency) and a way to sell the Windows app; not part of this change.

## All rights reserved, no open-source licence (2026-10-14)

The repository becomes public so GitHub Actions minutes are free, but the code is not meant to be reused: the apps may become paid later. `LICENSE` is therefore a plain copyright notice ("all rights reserved"): the source can be read, but not copied, modified, distributed or sold without written permission. Without any licence the default is the same under copyright law; the explicit notice makes it clear to readers. Rejected: MIT, Apache 2.0 and GPL, which would let anyone reuse the code or publish their own build. Note that by GitHub's terms of service, other GitHub users may still view and fork a public repository on GitHub itself; that grants no other rights.

## Aligned with the windows-electron-app and android-app templates (2026-10-14)

The repository now follows the rules and workflows of the private `wimvdon/windows-electron-app` and `wimvdon/android-app` templates, like the sibling apps Snoozer and Tracker for Simkl.

- **Rules and process:** `CLAUDE.md` for Claude Code sessions, a plain-language pull request template with PC and phone test steps, weekly Dependabot updates (npm in `windows/`, Gradle in `android/`, GitHub Actions), `PRIVACY.md`, `.editorconfig`.
- **CI** runs on pull requests *and* on pushes to `main` (as in the templates; previously pull requests only), cancels outdated runs, and the Android job now also runs **lint** (errors fail, no baseline) and the release-script tests, and attaches `TimeTracker-<version>-debug.apk` unzipped. Lint found 5 errors, fixed in code: Compose string lookups now use `LocalResources`, and the "timer stopped" broadcast names the app's own package, so other apps can no longer receive the Notion page ID it carries.
- **Release workflow** restructured like the templates: a *plan* job with tested version maths (`android/scripts/release_version.py`), the Android signing key checked before the build (`decode_keystore.py`, `VerifySigningKey.java`), tests and lint before the signed build, and a separate *publish* job, the only one with write access, that uses `gh release create` instead of a third-party action.
- **Android debug builds use `applicationIdSuffix = ".debug"` and the name "Time Tracker Dev"**, so a pull request's APK installs next to the released app with its own settings and API key, like the Windows Dev installer.
- **Node.js version in `windows/.nvmrc`** (24), used by CI and development.
- **`sandbox: true`** is set explicitly on the window (the Electron default), as in the template, so it can't be switched off by accident.
- **Android sources moved from `src/*/java/` to `src/*/kotlin/`**, the template's layout.
- **Kept on purpose, unlike the templates:** the Windows app stays JavaScript with Tailwind and Fluent icons rather than TypeScript, Fluent UI components and electron-vite, and has no Playwright end-to-end tests; moving would be a rewrite of a released app, and the installer smoke test already starts the real packaged app on Windows. Android `minSdk` stays 26 (Android 8.0) instead of 31 so existing users keep getting updates. Six languages instead of two.

## No backend: clients call Notion directly

Each user creates their own Notion internal connection and pastes the token into the app.

- **Why:**
  - There is no server to host, secure or pay for.
  - Data never passes through a third party.
  - An internal connection needs no OAuth app review.
- **Trade-offs:**
  - Setup is manual: create the connection, then share the page with it.
  - Every device holds the token.
  - Rate limits (about 3 requests/s per integration) are shared by all of a user's devices.

## Notion as shared state, not just storage

A timer is "running" because its Notion page has the *running* status. There is no separate running-timer record. That makes cross-device behaviour fall out naturally:
- A timer started on the phone shows up under **Active timers** on the PC and can be adopted there.
- Stopping on either device is detected by the other within a minute.

The cost is the 60-second polling loop. Notion has no push or webhook channel for internal integrations that a desktop or phone client could receive.

## Settings sync through a JSON code block

The settings (workspaces, presets, preferences) are a single JSON document in a code block on a user-chosen page.

- **Discarded alternative:** a Notion database with one row per setting or workspace. It would need a schema, many requests per sync and conflict handling per row. A code block is one read and one write.
- **Page creation:** Notion rejects `parent.workspace` for internal integrations, so the sync page is created inside an existing page the user picks.
- **Size limit:** the JSON is chunked into 2000-character `rich_text` segments because of Notion's per-segment limit.
- **Conflict resolution:** whole-payload last-writer-wins by `updatedAt`. Simple and predictable; concurrent edits to different settings on two devices lose one side. This was accepted because settings change rarely.
- **Not synced:** the API key, so a leaked sync page never exposes credentials. Device-only settings (always on top, start with Windows, Android dynamic colour) aren't synced either.

## Two native-feeling apps instead of one cross-platform codebase

Windows uses Electron + React; Android uses Kotlin + Compose. Each app uses the platform feature that makes the timer usable:
- **Windows:** tray icon, Mica, always-on-top mini window, start with Windows.
- **Android:** foreground-service notification with Stop, launcher shortcuts, Material You.

The price is duplicated logic (Notion client, rounding, sync, preset rules). The code compensates by mirroring comments and rules across both apps, and by making each app read the other's sync variants (locale tags, preset value shapes).

## Rounding at stop, with a minimum duration

Entries are created with the exact start time. When stopping, both start and end are rounded to the nearest N minutes (5, 10 or 15; half rounds up), and the end is at least `start + N`.

- **Exact start while running:** the running entry, and the elapsed time shown, is truthful.
- **Rounding at stop:** the stored entry still matches what the user's existing Notion Start/Stop button formulas produced, which `rounding.js` replicates.
- **Minimum duration:** a quick start/stop still records one billing unit.

## API key handling

### Windows

- The token is only used for requests in the Electron main process. The renderer receives it through `store:get` because the Settings screen shows the field, and reaches Notion only through named IPC channels.
- **At rest, the token is encrypted with Electron's `safeStorage`** (`electron/apiKey.cjs`), which on Windows uses DPAPI: only the same Windows user on the same PC can decrypt it, without extra native modules. A plain token saved by an older version is moved over on start-up. If the settings file is copied to another PC or user, the token can't be decrypted and must be entered again. If encryption is ever unavailable, the token falls back to the old plain field so the app keeps working.
  - *Replaced (2026-10-14):* earlier versions relied only on electron-store's `encryptionKey`, a key embedded in the source. That stays on for the rest of the file, but it is **obfuscation, not security**: anyone with the file and this repository can decode it.
  - *Downgrading* to an older version loses the saved token (that version can't read the encrypted field); enter it again.

### Android

- The token is in EncryptedSharedPreferences (AES-256-GCM, key in Android Keystore) and is excluded from cloud backup and device transfer.
- If the keystore is corrupted (known on some devices after restore), the app recreates the encrypted file, then falls back to plain private prefs so it keeps working instead of crashing. Users may have to re-enter the key.

## Rate limiting: retry and cache

Loading a workspace fires several calls at once: schema, related pages, users, and running and recent queries for every workspace. That easily exceeds Notion's rate limit.

- **Retry (both clients):** 429 and 5xx are retried with `Retry-After` or exponential backoff (up to 4 attempts).
- **Cache (Android):** `NotionRepository` caches schemas, related-database pages and users for 60 s and serves a stale copy when a refetch fails. Showing the last known schema beats showing fields without options.

## Never lose a running timer

Several deliberate choices protect against silently losing time:

- **Failed stop:** the local timer is kept and an error is shown. On Android the notification switches to a "stop failed" state so the user can retry. Previously an offline stop cleared the timer while the Notion entry ran on forever.
- **Failed running-timer query:** the active timer is not cleared (covered by `useStore.test.js`).
- **Just-stopped timers:** filtered out for 60 s because Notion's query can return them briefly. Otherwise they would be re-adopted.
- **Pending edits:** flushed before the stop request.
- **Deleted page:** detected and shown as a dialog, not a generic error.

## Android foreground service with `specialUse`

A visible, live-updating notification with a working **Stop** button is the core Android feature. It has to work while the app is closed, and the service stops the entry in Notion itself. None of the predefined foreground service types fits a user-started work timer, so it uses `specialUse` with subtype `timer`.

## Data model evolution without schema versions

Stored shapes are migrated when read:
- `migratePropertyMap` and `migrateActiveTimer` on Windows;
- kotlinx.serialization with `ignoreUnknownKeys` and defaults on Android;
- `withPresetTitles` in both apps.

Older settings files, and sync payloads written by an older app on another device, load without a migration step. This was chosen over versioned migrations because the same data arrives from two apps that may be on different versions.

Android uses **kotlinx.serialization** for everything: stored settings and the sync payload as `@Serializable` classes (default values for missing fields), and Notion responses as `JsonElement` trees read through null-safe helpers. Notion request bodies keep their `null`s, because Notion reads an explicit `null` as "clear this field".

## Desktop details

- **Coloured tray icon:** tinted per pixel from a template PNG and re-encoded with a ~40-line PNG encoder in `main.cjs`, avoiding a native image dependency.
- **Single instance:** `requestSingleInstanceLock` plus `--preset=<id>` lets desktop shortcuts start a preset in the already-running app.
- **Installer:** one-click, per-user NSIS, so no admin rights are needed. App data is kept on uninstall so reinstalling preserves settings. The installer isn't code-signed, which means SmartScreen warns; a certificate costs money and the audience is small.
- **Language:** tray strings live in the main process, keyed by language subtag, because the renderer's i18n isn't available there.

## Electron security hardening (2026-10-14)

Following the Electron security checklist, beyond process isolation and the CSP:
- **`app://bundle/` instead of `file://`:** the UI is served by a custom protocol that only maps to files inside `dist/` (`electron/bundlePath.cjs`, unit tested against `../` tricks), so the page can't read other local files. This also allows the `grantFileProtocolExtraPrivileges` fuse to be off.
- **IPC sender checks:** every `handle()`/`on()` channel in `main.cjs` ignores or rejects messages that don't come from the app's own page.
- **Blocked permissions:** permission requests (camera, notifications, …) and `<webview>` are refused; the app uses none of them.
- **Electron fuses** (`package.json` → `build.electronFuses`): no `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` or `--inspect`, cookie encryption on, and the app only loads from its integrity-checked `app.asar`.

## Packaging, lint and installer tests (2026-10-14)

- **Only main-process packages are runtime dependencies** (`electron-store`). React, Fluent icons and Zustand are bundled into `dist/` by Vite, so they are dev dependencies and no longer shipped a second time inside the app: the packaged app code went from 119 MB to 1.9 MB.
- **ESLint** with the recommended rules and the classic React hook rules (`rules-of-hooks`, `exhaustive-deps`). The newer React Compiler rules (`set-state-in-effect`, `refs`) are left off: they ask for rewrites of working effect code, which is riskier than the warnings are worth without a UI test suite. The UI is forbidden from importing Node.js or Electron.
- **Dev builds install next to the real app.** `npm run dist:dev` (`electron-builder.dev.cjs`) builds *Time Tracker for Notion Dev*, with its own app ID, Start menu entry and settings folder, so testing a pull request never touches the real settings, token or running timer.
- **The installer is tested on Windows in CI.** `windows/scripts/smoke-test-installer.ps1` installs it silently, starts the installed app (with the fuses on), checks its window, and uninstalls it, on every pull request and before every release.
- **Node.js 24**, the current LTS, in CI and for development. npm 11's `allowScripts` in `package.json` only lets esbuild run its install script.

## Releases from CI only

GitHub Actions builds both apps from a tag and publishes them together, so the Windows and Android versions always match.

- **Version:** derived from the tag; the Android version code is `major × 10000 + minor × 100 + patch`, so it always increases with semver.
- **Signing:** the key comes from environment variables, so no keystore file or password is ever in the repository.
- **Without secrets:** non-publishing runs fall back to a debug APK, so forks and PRs still produce artifacts.
- **Refusal rules (2026-10-14):** the workflow refuses to publish from outside `main`, when the tag or release already exists, when the version isn't higher than the previous release (Android would refuse the update), or when nothing changed since the previous release. A build-only run builds the Windows *Dev* app, so trying it never replaces the installed app.
- **Local builds:** the local `build.bat` scripts were removed in favour of Releases. A local APK has a different signature, which caused install conflicts with released builds.

## electron-store 8 and @vitejs/plugin-react 4 held back (2026-10-14)

Two Dependabot major updates were merged with red CI and reverted:

- **electron-store 11** is ESM-only (since 9). `electron/main.cjs` is CommonJS, so `require('electron-store')` returned a module object instead of the class and the installed app showed an error window at launch (caught by the installer smoke test). Moving up needs the main process to load it with `import()` or to become ESM.
- **@vitejs/plugin-react 6** requires Vite 8; the app uses Vite 6, so `npm ci` refused to install. Moving up needs Vite upgraded first (plugin-react 5.2 supports Vite 6 to 8).

Merge either update only when all three CI jobs, including the installer smoke test, are green.
