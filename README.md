# Notion Timer

A lightweight, always-on-top Windows desktop widget for time tracking in Notion.
Pick a workspace and project, press **START**, and the app creates a time entry
page in your Notion database. Press **STOP** and it fills in the end time —
optionally rounded to the nearest 15 minutes (with a 15-minute minimum
duration), configurable per workspace.

The app makes no assumptions about how your Notion is structured: you pick the
databases and the fields to use from dropdowns, straight from your own Notion
workspace.

Built with Electron, React, Vite, Tailwind CSS and Zustand.

---

## Table of contents

1. [One-time setup: Notion API key](#1-one-time-setup-notion-api-key)
2. [What your databases need](#2-what-your-databases-need)
3. [Running the app in development](#3-running-the-app-in-development)
4. [Building the Windows installer (.exe)](#4-building-the-windows-installer-exe)
5. [First launch & configuring workspaces](#5-first-launch--configuring-workspaces)
6. [How the app behaves](#6-how-the-app-behaves)
7. [Troubleshooting](#7-troubleshooting)
8. [Project structure](#8-project-structure)

---

## 1. One-time setup: Notion API key

The app talks directly to the Notion API. You need a (free) internal
integration:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and
   click **New integration**.
2. Name it **Notion Timer**, type **Internal**, and pick your Notion workspace.
3. Under *Capabilities*, make sure **Read content**, **Insert content** and
   **Update content** are enabled.
4. Copy the **Internal Integration Secret** — this is the API key you'll paste
   into the app's Settings. It starts with `secret_` or `ntn_`.
5. **Important — give the integration access to your pages.** In Notion, open
   each page that contains the databases you want to use:
   - Click `···` in the top-right corner
   - Choose **Connections** → **Connect to** → **Notion Timer**
   - Do this on the **parent page that contains the databases**, not just on
     the databases themselves. Child databases inherit the connection.

Without step 5 the API key is valid but the app's database dropdowns will be
empty — the integration can only see databases it has been connected to.

## 2. What your databases need

Each workspace in the app points at two Notion databases (they may be the same
database if your setup requires it):

- a **Time Entries database**, where the timer creates and completes entries.
  It needs at least: a *title* property, a *date* property (stores the
  start/end range), a *status* property with one option for "running" and one
  for "completed", and a *relation* property that links to your projects.
- a **Projects database**, whose records appear in the app's project picker.
  Only its *title* property is used (for display and sorting).

Property names don't matter — when you add a workspace, the app reads the
database schema and lets you pick each field from a dropdown showing only
properties of the right type.

## 3. Running the app in development

You need [Node.js](https://nodejs.org) LTS (v20 or newer) installed. Then, in a
terminal (PowerShell or Command Prompt on Windows):

```bash
cd notion-time-tracker
npm install        # one time, downloads dependencies (~2 min)
npm run dev        # starts Vite + Electron with hot reload
```

The widget window opens automatically. Code changes in `src/` reload live.

Other useful commands:

```bash
npm test           # run the time-rounding unit tests
npm run icons      # regenerate the app/tray icons in assets/
```

## 4. Building the Windows installer (.exe)

> You only do this when you want a "real" installable app instead of running
> from the terminal. Build on a Windows machine for the smoothest experience.

```bash
npm install        # if you haven't already
npm run dist
```

What happens:

1. Vite bundles the UI into `dist/`.
2. `electron-builder` packages everything into a one-click NSIS installer.

When it finishes, look in the **`release/`** folder:

```
release/
└── Notion Timer Setup 1.0.0.exe   ← double-click this to install
```

The installer is "one-click": it installs per-user (no admin rights needed),
creates a Start Menu + desktop shortcut, and launches the app. To uninstall,
use Windows *Settings → Apps* like any other program.

**Notes for first-time builders:**

- The first `npm run dist` downloads Electron binaries and NSIS tooling
  (a few hundred MB); later builds are much faster.
- Windows SmartScreen may warn "unrecognized app" when you run the installer,
  because it isn't code-signed. Click **More info → Run anyway**. Code signing
  certificates cost money and are not needed for personal use.
- If the build fails with a symlink/permissions error on Windows, run the
  terminal **as administrator** once, or enable Windows *Developer Mode*
  (Settings → System → For developers).
- To bump the version shown in the installer, change `"version"` in
  `package.json`.

## 5. First launch & configuring workspaces

On first launch the app opens on the **Settings** screen:

1. Paste your **Notion API key** and click **Test connection & save**.
2. Click **+ Add workspace**. The modal walks you through it:
   - **Name** — anything you like.
   - **Time Entries database** and **Projects database** — pick from the
     dropdown of all databases your integration can access. If the list is
     empty, the integration isn't connected to your pages (section 1, step 5).
   - Once a database is selected its fields appear automatically: pick the
     title, date range, status and project relation fields, and the status
     options for "running" and "completed". Each dropdown only shows
     properties of the right type, and single matches are pre-selected.
   - Tick or untick **Round times to nearest 15 minutes** for this workspace.
3. **Save** stays disabled until everything required is filled in, so a
   half-configured workspace can't be saved.
4. Repeat for each workspace, then click `←` to go to the timer. You can edit
   a workspace later via the ✏️ button next to it.

The app's language follows your Windows display language: Dutch for `nl-*`
locales, English (UK) for everything else. There is no manual toggle.

All settings are stored locally in an encrypted file
(`%APPDATA%/notion-timer/config.json`). Nothing is sent anywhere except to the
Notion API. Note: the encryption is obfuscation against casual snooping, not a
hard security boundary — the key lives in the app source. Settings from older
versions of the app are migrated automatically on first launch.

## 6. How the app behaves

- **Start**: creates a time entry with the "running" status option and your
  description as the title (or `"{Project} — {DD/MM/YYYY}"` if you left it
  empty). With rounding on, the start time is rounded to the nearest
  15 minutes (14:07 → 14:00, 14:08 → 14:15).
- **Stop**: fills in the end time and sets the "completed" status option.
  With rounding on, the end time is rounded to the nearest 15 minutes with a
  minimum duration of 15 minutes.
- **Rounding is per workspace**: configure it in the workspace's settings.
  With rounding off, exact timestamps are recorded and no minimum applies.
- While running you see the live elapsed time and the projected interval
  (e.g. `14:00 → 14:15`), which updates as time passes.
- **Closing the window minimises to the system tray** — the app keeps running.
  The tray icon turns into a red dot while a timer runs. Right-click the tray
  icon for *Open*, *Stop timer* and *Quit*.
- **Always on top** is on by default; toggle it in Settings.
- **Crash recovery**: if the app is force-quit while a timer runs, the next
  launch asks whether to stop it (at the current time), keep it running, or
  discard it.
- If stopping fails (e.g. you're offline), the timer state is kept and you can
  retry — nothing is lost.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "Connection failed: API token is invalid" | Re-copy the secret from notion.so/my-integrations; no spaces. |
| Database dropdowns are empty | The integration isn't connected to the pages containing your databases — see section 1, step 5. |
| "No suitable field found in this database" | The selected database is missing a property of the required type (e.g. no status property) — add it in Notion, then reopen the workspace modal. |
| Project dropdown stays empty | Check the Projects database and its title field under Settings → ✏️; the picker only shows records with a non-empty title. |
| App seems closed but won't restart | It's still in the system tray (bottom-right, behind `^`). Right-click → Quit. |
| Installer blocked by SmartScreen | More info → Run anyway (unsigned personal build). |

## 8. Project structure

```
notion-time-tracker/
├── electron/
│   ├── main.cjs           # Main process: window, tray, IPC, electron-store
│   ├── preload.cjs        # contextBridge: safe API exposed to the renderer
│   └── notionClient.cjs   # All Notion REST calls (API key never leaves main)
├── src/
│   ├── App.jsx            # Root component, view switching
│   ├── views/
│   │   ├── Timer.jsx      # Idle + running timer screens
│   │   └── Settings.jsx   # API key, workspaces, workspace modal
│   ├── components/
│   │   ├── Toasts.jsx     # Error/success toasts (with retry action)
│   │   └── RecoveryModal.jsx  # Orphaned-timer prompt on launch
│   ├── store/useStore.js  # Zustand store: settings, session, timer, migration
│   ├── locales/           # en-GB.js + nl-BE.js string tables
│   └── lib/
│       ├── rounding.js    # 15-minute rounding (mirrors Notion buttons)
│       ├── rounding.test.js
│       ├── format.js      # ISO-with-offset, DD/MM/YYYY, HH:MM:SS helpers
│       ├── i18n.js        # locale detection + t() lookup
│       ├── schema.js      # database schema helpers (propertiesByType, …)
│       └── errors.js      # strips IPC noise from error messages
├── scripts/generate-icons.cjs  # Regenerates assets/ icons (no deps)
├── assets/                # icon.ico, window + tray icons (generated)
└── package.json           # incl. electron-builder config
```
