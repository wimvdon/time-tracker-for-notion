# Technical decisions

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

- The token is only used in the Electron main process. The renderer runs with `contextIsolation`, without `nodeIntegration`, with navigation and `window.open` blocked and a strict production CSP. It reaches Notion only through named IPC channels.
- electron-store "encrypts" the config file with a key embedded in the source. This is **obfuscation, not security**: anyone with the file and this repository can decode it. It was accepted because Windows has no app-private keystore that Electron uses without extra native modules, and the threat model is a single-user PC.

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

## Releases from CI only

GitHub Actions builds both apps from a tag and publishes them together, so the Windows and Android versions always match.

- **Version:** derived from the tag; the Android version code is `major × 10000 + minor × 100 + patch`, so it always increases with semver.
- **Signing:** the key comes from environment variables, so no keystore file or password is ever in the repository.
- **Without secrets:** non-publishing runs fall back to a debug APK, so forks and PRs still produce artifacts.
- **Local builds:** the local `build.bat` scripts were removed in favour of Releases. A local APK has a different signature, which caused install conflicts with released builds.
