# Architecture

## General design

The repository holds two independent clients with the same feature set. There is no backend: each client calls the Notion REST API directly with the user's internal-integration token.

```
                     ┌────────────────────────────────────────────┐
                     │                Notion API                  │
                     │  Time Entries DB(s)  ·  Projects DB  ·     │
                     │  Sync page (JSON code block)               │
                     └───────────▲───────────────────▲────────────┘
                                 │ HTTPS             │ HTTPS
           ┌─────────────────────┴───┐   ┌───────────┴────────────────────┐
           │ Windows (Electron)      │   │ Android                        │
           │ main: notionClient.cjs  │   │ NotionClient → NotionRepository│
           │   ▲ IPC (preload)       │   │   ▲                            │
           │ renderer: React+Zustand │   │ TimerViewModel / Settings VM   │
           │ tray, window, store     │   │ Compose UI · Foreground service│
           └─────────────────────────┘   └────────────────────────────────┘
```

Notion plays three roles:

1. **System of record:** every timer is a page in a user-chosen *Time Entries* database.
2. **Shared runtime state:** a timer is "running" when its status property equals the workspace's *running* option. Any device can list, adopt or stop it.
3. **Settings sync:** workspaces, presets and display preferences live as JSON in a code block on a page the user picks.

The two codebases share no code. They agree on Notion page shapes and the sync payload format, and both read each other's variants (locale tags, preset value shapes).

## Domain model

| Concept | Meaning |
|---|---|
| **Workspace** | One Time Entries database plus its configuration. It holds a `propertyMap` (which title, date, status and relation properties to use, and which status options mean *running* and *done*), an optional projects database, rounding minutes, extra fields (`extraProps`), presets, colour and *description required*. |
| **Time entry** | A Notion page. **Start:** title = description, date = `{start}`, status = *running*, optional relation, extra properties. **Stop:** date = `{start, end}` and status = *done*. |
| **Active timer** | Locally persisted pointer to the running page: page id, rounded and raw start, workspace, property map and extra values. It lets the app survive restarts. |
| **Preset** | A named description plus extra values in a workspace. One click selects the workspace, fills the form and starts. |

## Windows app components

| Component | File | Responsibility |
|---|---|---|
| Main process | `windows/electron/main.cjs` | Window: 340×620 content area (less on a short screen), non-resizable, always on top optional, Mica on Win 11 22H2+. Tray icon tinted with the running workspace colour (in-process PNG encoder). Tray menu: open, stop, up to 10 presets, quit. Also: single-instance lock, `--preset=` / `--hidden` arguments, start with Windows, electron-store. Registers all IPC handlers. |
| Notion client | `windows/electron/notionClient.cjs` | Every REST call: retry with backoff on 429/5xx (honours `Retry-After`), pagination, sync payload encoding. |
| Preload bridge | `windows/electron/preload.cjs` | Exposes `window.notionAPI` through `contextBridge`. Queues preset requests that arrive before the renderer subscribes. |
| Store | `windows/src/store/useStore.js` | Zustand store with all app logic: init and migrations, start/stop/update timer, running and recent lists, presets, sync, theme, toasts, and the 60-second refresh loop. |
| Views | `windows/src/views/Timer.jsx`, `Settings.jsx` | The two screens. |
| Pure helpers | `windows/src/lib/*.js` | Rounding, date formatting, Notion value builders and parsers, colour variants, i18n, schema helpers, preset titles. All unit-tested. |

## Android app components

| Component | Package / file | Responsibility |
|---|---|---|
| `NotionTimeTrackerApp` | root | Creates the singletons: `SettingsRepository`, `NotionRepository`, `SettingsSyncer` |
| `NotionClient` | `data/api` | OkHttp calls, same retry policy as Windows. Request JSON keeps `null`s, because Notion reads `null` as "clear". |
| `NotionRepository` | `data/repository` | Injects the API key. Caches schemas, related pages and users for 60 s, and serves stale data when a refetch fails. |
| `SettingsRepository` | `data/repository` | DataStore `notion_settings` for workspaces and the active timer (JSON via kotlinx.serialization) and display settings. The API key is in EncryptedSharedPreferences. |
| `SettingsSyncer` | `data/repository` | Pull-or-push algorithm for the sync page, shared by Settings and the timer refresh loop |
| `TimerViewModel` / `SettingsViewModel` | `viewmodel` | All screen logic: start/stop, rounding, presets, running and recent lists, 60 s refresh |
| `TimerForegroundService` | `service` | Ongoing notification with live elapsed time and a **Stop** action. Stops the entry in Notion itself, so it works with the app closed. |
| `ShortcutHelper` | root | Up to 4 presets as dynamic launcher shortcuts |
| UI | `ui/screens`, `ui/components`, `ui/theme` | Compose screens, dialogs, workspace colour theming |

## System flow

### Start a timer

1. The user picks a workspace and types a description, or clicks a preset, a recent entry's ▶, a tray item or a launcher shortcut.
2. The client waits until the workspace's extra field definitions have loaded. Otherwise extra values from a preset would be silently dropped.
3. If a timer already runs, the user confirms **Stop & start new**.
4. `POST /pages` creates the entry. The description becomes the title (empty → the date in the chosen format), the date gets the start, the status is *running*, plus the relation and extra fields.
5. The start time is the exact current time. Rounding applies at stop: if the workspace rounds, both start and end are rounded to the nearest N minutes, and the duration is at least N minutes.
6. The active timer is persisted locally, ticking starts, the tray icon is tinted, and on Android the foreground service is started.

### While running

- Description and extra field edits are written with `PATCH /pages/{id}` (description on Enter or blur, extra fields debounced).
- Changing **Start time** rewrites the date. Filling **End time** stops at that time.

### Stop

1. Pending edits are flushed first.
2. `PATCH /pages/{id}` sets the date `{start, end}` and the *done* status.
3. If the call fails, the timer is kept locally and the error is shown, so a timer is never lost offline. On Android the notification switches to a failed state and **Stop** can be retried.

### 60-second refresh loop (both apps)

Every minute, when a key and workspaces exist:

1. Query each workspace's database for pages with the *running* status, and the last 15 *done* entries.
2. If the local active timer is no longer running in Notion, clear it: "Timer was stopped on another device."
3. If the active page no longer exists, show the "Page not found" dialog.
4. Re-read the active page's properties so edits made in Notion appear locally.
5. Run a settings sync if a sync page is configured.

Lists are merged by page id to avoid flicker. Timers stopped locally within the last minute are filtered out of the running list, because Notion's query can still return them briefly.

### Settings sync

`syncNow` compares the remote payload's `updatedAt` with the local `settingsUpdatedAt`:

- **Remote newer:** apply the remote payload (workspaces, theme, locale, date and time format, link and archive toggles).
- **Local edits not yet pushed** (`settingsUpdatedAt ≠ lastSyncedUpdatedAt`): overwrite the code block with the local snapshot.
- **Otherwise:** nothing.

It is last-writer-wins at whole-payload granularity. The API key and device-only settings (always on top, start with Windows, Android dynamic colour) are never synced.

## Patterns used

- **Thin client, no backend.** Each user's own token talks to their own workspace.
- **Process isolation (Windows).** `contextIsolation: true`, `nodeIntegration: false`, navigation and `window.open` blocked, strict CSP in production. The renderer never sees the token.
- **Single store / MVVM.** Zustand on Windows and ViewModel + `StateFlow` on Android hold all logic; views are declarative.
- **Repository + cache (Android).** `NotionRepository` hides the token and caches slow-changing metadata.
- **Optimistic local state with Notion reconciliation.** UI updates immediately; the refresh loop corrects it from Notion.
- **Schema migrations on read.** Older stored shapes (property maps, active timer, untitled presets) are migrated when loaded instead of with versioned migrations.

## Data storage

| Data | Windows | Android |
|---|---|---|
| API key | electron-store, obfuscated with a fixed `encryptionKey` | EncryptedSharedPreferences (AES-256). Falls back to recreating it, then to plain prefs if the keystore fails. Excluded from backups. |
| Workspaces, presets, active timer, preferences | electron-store `config.json` | DataStore `notion_settings` (JSON strings for structured values) |
| Time entries | Notion | Notion |
| Shared settings | Notion sync page | Notion sync page |
