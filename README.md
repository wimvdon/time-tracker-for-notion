# Notion Timer

A lightweight, always-on-top Windows desktop widget for time tracking in Notion.
Pick a project and deelproject, press **START**, and the app creates a
*Tijdsregistratie* page in your Notion database. Press **STOP** and it fills in
the end time — with the same 15-minute rounding logic as the Notion Start/Stop
buttons (minimum duration: 15 minutes).

Built with Electron, React, Vite, Tailwind CSS and Zustand.

---

## Table of contents

1. [One-time setup: Notion API key](#1-one-time-setup-notion-api-key)
2. [Finding your database IDs](#2-finding-your-database-ids)
3. [Running the app in development](#3-running-the-app-in-development)
4. [Building the Windows installer (.exe)](#4-building-the-windows-installer-exe)
5. [First launch & configuring projects](#5-first-launch--configuring-projects)
6. [How the app behaves](#6-how-the-app-behaves)
7. [Troubleshooting](#7-troubleshooting)
8. [Project structure](#8-project-structure)

---

## 1. One-time setup: Notion API key

The app talks directly to the Notion API. You need a (free) internal
integration:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and
   click **New integration**.
2. Name it **Notion Timer**, type **Internal**, and pick your workspace.
3. Under *Capabilities*, make sure **Read content**, **Insert content** and
   **Update content** are enabled.
4. Copy the **Internal Integration Secret** — this is the API key you'll paste
   into the app's Settings. It starts with `secret_` or `ntn_`.
5. **Important — give the integration access to your pages.** In Notion, open
   each project page that contains your databases (e.g. *Schrijf-ze-VRIJdag*,
   *Recht in de Klas*, *Groen*):
   - Click `···` in the top-right corner
   - Choose **Connections** → **Connect to** → **Notion Timer**
   - Do this on the **parent page that contains the databases**, not just on
     the databases themselves. Child databases inherit the connection.

Without step 5 the API key is valid but every database call returns
"object not found".

## 2. Finding your database IDs

Each project needs two database IDs: the **Tijdsregistraties** database and the
**Deelprojecten** database.

1. In Notion, open the database **as a full page** (click the `⤢ Open as page`
   icon, or open it from the sidebar).
2. Look at the URL in your browser:
   ```
   https://www.notion.so/yourworkspace/a0d05621427382f3b7f687172523bc41?v=...
                                       └──────────── this part ───────────┘
   ```
3. The 32-character string before `?v=` is the database ID. You can paste it
   with or without dashes — both work
   (`a0d05621-4273-82f3-b7f6-87172523bc41` and
   `a0d05621427382f3b7f687172523bc41` are the same ID).

The databases must have these properties (the existing ones already do):

| Database | Required properties |
|---|---|
| Tijdsregistraties | `Tijdsregistratie` (title), `Tijd` (date), `Status` (status, with options "Lopende tijdsregistratie" and "Voltooide tijdsregistratie"), `Gekoppeld deelproject` (relation) |
| Deelprojecten | `Deelproject` (title) |

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

## 5. First launch & configuring projects

On first launch the app opens on the **Settings** screen:

1. Paste your **Notion API key** and click **Test connection & save**.
2. Click **+ Add project**. Enter:
   - **Display name** — anything you like, e.g. `Schrijf-ze-VRIJdag`
   - **Tijdsregistraties DB ID** — see [section 2](#2-finding-your-database-ids)
   - **Deelprojecten DB ID** — same
3. Click **Save & Test** — the app verifies both databases are reachable with
   your key before saving. If this fails, re-check section 1 step 5.
4. Repeat for each project, then click `←` to go to the timer.

All settings are stored locally in an encrypted file
(`%APPDATA%/notion-timer/config.json`). Nothing is sent anywhere except to the
Notion API. Note: the encryption is obfuscation against casual snooping, not a
hard security boundary — the key lives in the app source.

## 6. How the app behaves

- **Start**: rounds the start time to the nearest 15 minutes (14:07 → 14:00,
  14:08 → 14:15) and creates a page with status *Lopende tijdsregistratie*.
  The page title is your description, or `"{Deelproject} — {DD/MM/YYYY}"` if
  you left it empty.
- **Stop**: rounds the end time to the nearest 15 minutes, with a minimum
  duration of 15 minutes, and sets status *Voltooide tijdsregistratie*.
- While running you see the live elapsed time and the projected rounded
  interval (e.g. `14:00 → 14:15`), which updates as time passes.
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
| "Database test failed: Could not find database" | The integration isn't connected to the page containing the database — see section 1, step 5. |
| Deelproject dropdown stays empty | The Deelprojecten database must have a **title property named exactly `Deelproject`**. |
| Start fails with a property error | The Tijdsregistraties database property names/options must match the table in section 2 exactly (including the Status option names). |
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
│   │   └── Settings.jsx   # API key, projects, always-on-top
│   ├── components/
│   │   ├── Toasts.jsx     # Error/success toasts (with retry action)
│   │   └── RecoveryModal.jsx  # Orphaned-timer prompt on launch
│   ├── store/useStore.js  # Zustand store: settings, session, timer
│   └── lib/
│       ├── rounding.js    # 15-minute rounding (mirrors Notion buttons)
│       ├── rounding.test.js
│       └── format.js      # ISO-with-offset, DD/MM/YYYY, HH:MM:SS helpers
├── scripts/generate-icons.cjs  # Regenerates assets/ icons (no deps)
├── assets/                # icon.ico, window + tray icons (generated)
└── package.json           # incl. electron-builder config
```
