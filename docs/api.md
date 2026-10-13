# Interfaces

The project exposes no HTTP API of its own. These are the interfaces it depends on or offers:

1. [Notion REST API calls](#1-notion-rest-api-calls) — what both apps send to Notion
2. [Sync page format](#2-sync-page-format) — the contract between the Windows and Android apps
3. [Windows IPC bridge](#3-windows-ipc-bridge-windownotionapi) — renderer ↔ main process
4. [Windows command-line arguments](#4-windows-command-line-arguments)
5. [Android intents](#5-android-intents)

## 1. Notion REST API calls

- **Base URL:** `https://api.notion.com/v1`. On Windows it can be overridden with `NOTION_API_BASE_URL`.
- **Headers:** `Authorization: Bearer <token>`, `Notion-Version: 2022-06-28`, `Content-Type: application/json`.
- **Implementations:** `windows/electron/notionClient.cjs` and `android/…/data/api/NotionClient.kt`. They are equivalent.

| Function | Method & path | Body / query | Returns |
|---|---|---|---|
| `testConnection(key, dbId?)` | `POST /databases/{dbId}/query` or `GET /users/me` | `{ page_size: 1 }` | throws on failure |
| `searchDatabases` | `POST /search` | `filter.object = database`, paginated | `[{ id, name }]` |
| `getDatabaseSchema(dbId)` | `GET /databases/{dbId}` | — | raw `properties` map |
| `fetchDatabasePages(dbId)` | `POST /databases/{dbId}/query` | paginated | `[{ id, name }]` (relation options) |
| `listUsers` | `GET /users?page_size=100` | paginated | `[{ id, name }]` (people options) |
| `createTimeEntry` | `POST /pages` | see below | `{ pageId }` |
| `stopTimeEntry` | `PATCH /pages/{id}` | date `{start, end}`, status = done | — |
| `fetchRunningTimers` | `POST /databases/{dbId}/query` | `status equals <running>`, sorted by date desc, paginated | `[{ pageId, title, startISO, url }]` |
| `fetchRecentEntries` | `POST /databases/{dbId}/query` | `status equals <done>`, date desc, `page_size: 15` | `[{ pageId, title, startISO, endISO, url }]` |
| `updatePage` | `PATCH /pages/{id}` | `{ properties }` | — |
| `getPageProperties` | `GET /pages/{id}` | — | raw `properties` |
| `deletePage` | `PATCH /pages/{id}` | `{ archived: true }` (moves to Notion Trash) | — |
| `searchPages` | `POST /search` | `filter.object = page`, last edited desc, paginated | `[{ id, name, url }]` |
| `createSyncPage` | `POST /pages` | child of a page, one `code` block (json) | `{ pageId }` |
| `fetchSyncPage` | `GET /blocks/{pageId}/children?page_size=100` | — | `{ blockId, payload }` or `null` |
| `updateSyncBlock` | `PATCH /blocks/{blockId}` | `code.rich_text` = payload | — |

### Create a time entry

```json
POST /pages
{
  "parent": { "database_id": "<timeEntriesDbId>" },
  "properties": {
    "<extra prop>": { "...": "typed value" },
    "Name":   { "title": [{ "text": { "content": "Monthly report" } }] },
    "Time":   { "date": { "start": "2026-10-11T09:03:00.000+02:00", "end": null } },
    "Status": { "status": { "name": "In progress" } },
    "Project": { "relation": [{ "id": "<projectPageId>" }] }
  }
}
```

The property names come from the workspace's `propertyMap`. Extra fields support `rich_text`, `number`, `select`, `multi_select`, `status`, `date`, `checkbox`, `url`, `email`, `phone_number`, `people`, `relation` and `files` (external URL). See `windows/src/lib/notionValues.js`.

### Error handling

- **Retries:** 429 and 5xx responses are retried up to 4 attempts. The wait honours `Retry-After`, otherwise it is `500 ms × 2^attempt`, clamped between 300 ms and 10 s.
- **Other errors:** the error carries Notion's `message`, or `Notion API error (HTTP <code>)`.
- **No key configured:** `No Notion API key configured. Add one in Settings.`
- **Network failures (Windows):** `Network error reaching Notion: …`.
- **Deleted entries:** messages containing `404`, `object_not_found` or "could not find page" are treated as a deleted page. The UI shows **Page not found in Notion** instead of an error toast.

### Authentication

Internal-integration token only (no OAuth). The token needs **Read**, **Update** and **Insert content**. It only sees pages explicitly connected to it in Notion.

## 2. Sync page format

A Notion page containing a `code` block (language `json`). The JSON is split into `rich_text` segments of at most 2000 characters (Notion's per-segment limit) and joined when read. The first code block that parses as a valid payload is used; any other block is ignored.

```json
{
  "updatedAt": "2026-10-11T07:15:42.120Z",
  "workspaces": [
    {
      "id": "…",
      "name": "Work",
      "timeEntriesDbId": "…",
      "projectsDbId": "",
      "roundingMinutes": 15,
      "color": "#3B82F6",
      "descriptionRequired": false,
      "propertyMap": {
        "timeEntryTitleProp": "Name",
        "timeEntryDateProp": "Time",
        "timeEntryStatusProp": "Status",
        "timeEntryStatusRunning": "In progress",
        "timeEntryStatusDone": "Done",
        "timeEntryRelationProp": ""
      },
      "extraProps": [{ "propName": "Client", "type": "select", "required": true }],
      "presets": [{ "id": "…", "name": "Stand-up", "pageTitle": "Daily stand-up", "extraValues": {} }]
    }
  ],
  "theme": "auto",
  "locale": "nl-BE",
  "dateFormat": "DD/MM/YYYY",
  "timeFormat": "24h",
  "showNotionLink": true,
  "showArchiveAction": false
}
```

Rules both apps follow:

- **Validity:** `updatedAt` (ISO string) and `workspaces` (array) are required; anything else makes the block "not a sync page".
- **Optional fields:** a missing optional field leaves the local value untouched. Android therefore keeps `null`s out of the payload (`explicitNulls = false` in `SyncPayloadJson.kt`).
- **Locale tags differ per app:** Windows writes `en-GB` and `nl-BE`, Android writes `en` and `nl`. Both map any tag by its language subtag.
- **Preset values:** each app normalizes the other's value shapes when reading them.
- **Never included:** the API key and device-only settings.

## 3. Windows IPC bridge (`window.notionAPI`)

Defined in `windows/electron/preload.cjs`; handlers live in `windows/electron/main.cjs`.

| Renderer call | Channel | Kind |
|---|---|---|
| `getSettings()` / `saveSettings(patch)` | `store:get` / `store:set` | invoke |
| `searchDatabases`, `getDatabaseSchema`, `fetchDatabasePages`, `listUsers` | `notion:*` | invoke |
| `createTimeEntry`, `stopTimeEntry`, `updatePage`, `getPageProperties`, `deletePage` | `notion:create`, `notion:stop`, `notion:updatePage`, … | invoke |
| `fetchRunningTimers`, `fetchRecentEntries`, `testConnection` | `notion:*` | invoke |
| `searchPages`, `createSyncPage`, `fetchSyncPage`, `updateSyncBlock` | `notion:*` | invoke |
| `openExternal(url)` | `shell:openExternal` (only `http(s)://` URLs) | invoke |
| `setAlwaysOnTop(bool)`, `setStartWithWindows(bool)` | `window:*` | invoke |
| `setNativeTheme(theme)` | `window:setTheme` | send |
| `setTimerRunning(running, color)` | `timer:state` (tray icon + menu) | send |
| `notifySettingsChanged()` | `settings:changed` (rebuild tray menu) | send |
| `onTrayStopTimer(cb)`, `onTrayApplyPreset(cb)`, `onAccentColorChanged(cb)` | `tray:stop-timer`, `tray:apply-preset`, `appearance:accent` | main → renderer |

The main process injects the API key into every `notion:*` call. The renderer never receives it except as part of `store:get`, which the Settings screen needs to display the field.

## 4. Windows command-line arguments

| Argument | Effect |
|---|---|
| `--hidden` | Start in the tray without showing the window (used by **Start with Windows**) |
| `--preset=<presetId>` | Start that preset's timer. If the app is already running, the single-instance handler forwards it to the running instance. |

Example desktop shortcut target:

```bat
"%LOCALAPPDATA%\Programs\Time Tracker for Notion\Time Tracker for Notion.exe" --preset=3f2c…
```

Preset ids are visible in the sync page JSON or in `%APPDATA%\Time Tracker for Notion\config.json` (obfuscated).

## 5. Android intents

| Intent | Target | Effect |
|---|---|---|
| `ACTION_VIEW` with extras `preset_workspace_id`, `preset_id` | `MainActivity` | Starts the preset (used by the dynamic launcher shortcuts, max 4) |
| `ACTION_STOP_TIMER` | `TimerForegroundService` (not exported) | Notification **Stop** button: stops the entry in Notion |
| Broadcast `com.impca201.notiontimetracker.TIMER_STOPPED` (extra: page id) | `MainActivity` receiver | Tells a visible UI the service stopped the timer |
