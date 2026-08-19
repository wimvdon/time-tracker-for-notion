# Notion Time Tracker

Lightweight time-tracking app for Notion — available as a Windows desktop widget and an Android app.

## Platforms

- [Windows (Electron)](#windows-electron) — always-visible widget with system tray
- [Android](#android) — native app with a sticky foreground notification as the active indicator

---

## Windows (Electron)

A lightweight, always-on-top Windows desktop widget. Pick a workspace and project, press **START**, and the app creates a time entry page in your Notion database. Press **STOP** and it fills in the end time — optionally rounded to the nearest configured interval.

Built with Electron, React, Vite, Tailwind CSS and Zustand.

### One-time setup: Notion API key

The app talks directly to the Notion API. You need a (free) internal integration:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Name it **Notion Timer**, type **Internal**, and pick your Notion workspace.
3. Under *Capabilities*, make sure **Read content**, **Insert content** and **Update content** are enabled.
4. Copy the **Internal Integration Secret** — this is the API key you paste into Settings. It starts with `secret_` or `ntn_`.
5. **Give the integration access to your pages.** In Notion, open each page that contains the databases you want to use → `···` → **Connections → Connect to → Notion Timer**. Do this on the **parent page containing the databases** — child databases inherit the connection.

### What your databases need

- A **Time Entries database**: needs a title property, a date property (start/end range), a status property (one option for "running", one for "completed"), and optionally a relation property linking to a projects database.
- A **Projects database**: page titles are used as picker options — no configuration needed.

### Developing

```bash
cd windows
npm install
npm run dev
```

Other commands:

```bash
npm test           # run the time-rounding unit tests
npm run icons      # regenerate icons in assets/
```

### Building the Windows installer (.exe)

```bash
cd windows
build.bat          # or: npm run dist
```

The installer ends up in `windows/release/Notion Timer Setup 1.0.0.exe`.

### First launch & workspace configuration

On first launch the app opens on Settings:

1. Paste your Notion API key and click **Test connection & save**.
2. Click **+ Add workspace** and follow the step-by-step modal.
3. Optionally add up to five **extra fields** from the Time Entries database (text, number, select, multi-select, status, date, checkbox, URL, e-mail, phone, people, relation).
4. Optionally add up to five **presets** per workspace — quick-start configurations with a default title and extra field values (see [Presets](#presets)).
5. Click `←` to go to the timer.

### How it behaves

- **Start**: creates a time entry with status = running and the description as the title. The entry's start and end are rounded to the configured interval when the timer is stopped.
- **Empty description**: the entry is titled with its start date, formatted as configured in Settings (`DD/MM/YYYY`, `MM/DD/YYYY` or `YYYY-MM-DD`). The description field itself is never pre-filled — the date is only written to the Notion page, so an entry never shows up as "Untitled".
- **Stop**: fills in the end time and sets status = completed. End time is rounded with a minimum duration equal to one interval.
- **Edit timer**: the running view's fields are editable in place — change the title or any extra field value and it is written to the Notion page. Clearing the title falls back to the start date, exactly as when starting.
- **Description required**: workspaces can require a description (Settings → workspace). The field is then marked with `*` and a timer in that workspace cannot be stopped until it is filled in — starting stays a single click, same as for required extra fields.
- **Closing the window** minimises to the system tray. The tray icon turns red while a timer runs (or takes the workspace's colour, if one is set).
- **Crash recovery**: if force-quit while a timer runs, it is picked up again on the next launch and keeps counting.
- **Auto-refresh**: running timers and recent entries refresh every 60 seconds. If the active timer was stopped on another device, it is automatically cleared from the view.
- **Deleted pages**: if Notion reports that a page no longer exists when stopping or editing, the app shows the local details and asks you to confirm before discarding.

### Presets

Presets are quick-start configurations defined per workspace. Each preset has:
- A **name** (always prefixed with the workspace name)
- An optional **default title** for new time entries
- Optional **default values** for extra fields

Presets appear as clickable chips above the workspace selector in the timer view. Clicking a chip immediately starts the timer with those values.

On Windows, presets also appear in the **right-click tray menu**. Picking one while a timer is already running asks whether to stop it and start the new one.

### Syncing settings between devices

Settings are shared through a **sync page** in your own Notion workspace: Settings → *Create sync page* writes a JSON code block onto a page you pick, and every device attached to that page (Settings → *Load existing sync page*) pulls or pushes whichever side is newer, on launch and every 60 seconds.

What is synced: workspaces, field mappings, extra fields, presets, rounding, theme, language, date/time format and the per-entry Notion actions. The Notion API key is intentionally **not** included — enter it manually on each device. Device-local preferences (always-on-top and start-with-Windows on the desktop, Material You on Android) stay put as well.

### Troubleshooting (Windows)

| Problem | Fix |
|---|---|
| "Connection failed: API token is invalid" | Re-copy the secret from notion.so/my-integrations; no spaces. |
| Database dropdowns are empty | Integration isn't connected to the pages — see setup step 5. |
| Project dropdown stays empty | Check the Projects database in the workspace settings. Records without a page title are listed as *(Untitled)* rather than hidden, so an already-linked one always shows. |
| App seems closed but won't restart | It's in the system tray (bottom-right, behind `^`). Right-click → Quit. |
| Installer blocked by SmartScreen | More info → Run anyway (unsigned personal build). |

### Windows project structure

```
windows/
├── electron/
│   ├── main.cjs           # Main process: window, tray, IPC, presets in context menu
│   ├── preload.cjs        # contextBridge: safe API exposed to renderer
│   └── notionClient.cjs   # All Notion REST calls
├── src/
│   ├── App.jsx
│   ├── views/             # Timer.jsx, Settings.jsx
│   ├── components/        # ExtraFieldInput, SearchableSelect, Toasts
│   ├── store/useStore.js  # Zustand store (settings, session, timer, sync, migrations)
│   ├── locales/           # en-GB, nl-BE, fr, de, es, it
│   └── lib/               # rounding.js, format.js, i18n.js, schema.js, notionValues.js, color.js
├── assets/
└── package.json
```

---

## Android

A native Android app built with Kotlin + Jetpack Compose. Functionally identical to the Windows app, with Android-native UX:

- A **sticky foreground notification** replaces the system tray while a timer is running
- Tap **Stop** in the notification to stop the timer even when the app is closed
- The notification carries a progress bar filling towards the end of the current rounding interval
- Crash recovery, identical rounding logic, and the same six languages — all ported 1:1

### Tech stack

| Component | Choice |
|---|---|
| Language | Kotlin |
| UI | Jetpack Compose + Material You (Material 3) |
| State | ViewModel + StateFlow |
| Storage | DataStore (Preferences) + EncryptedSharedPreferences (API key) |
| HTTP | OkHttp + Gson |
| Background | Foreground Service |
| Notifications | NotificationCompat (ongoing, with progress) |
| Min SDK | 26 (Android 8) |
| Target SDK | 36 (Android 16) |

### First launch & workspace configuration

1. Open the app. Tap the gear icon to open Settings.
2. Paste your Notion API key and tap **Test connection & save**.
3. Tap **+ Add workspace** and follow the step-by-step modal.
4. Optionally add up to five **extra fields** per workspace. Presets are created from the timer screen (the bookmark button next to START).
5. Tap the back arrow to go to the timer.

Alternatively, attach the app to an existing sync page to import a whole configuration at once (see [Syncing settings](#syncing-settings-between-devices-1)).

### How it behaves

- **Start / Stop**: same logic as Windows — rounding, status transitions, relation fields, and the start-date fallback for an empty description.
- **Edit timer**: the running view's fields are editable in place. The title is saved with the check button (or the keyboard's Done key) and extra fields save themselves shortly after you change them; stopping also saves a title you typed but did not confirm. Clearing the title falls back to the start date.
- **Description required**: identical per-workspace option as on Windows; the timer cannot be stopped until a description is filled in.
- **Auto-refresh**: running timers and recent entries refresh every 60 seconds. If the active timer was stopped on another device, it is automatically cleared and a toast is shown.
- **Deleted pages**: if Notion reports that a page no longer exists when stopping or editing, the app shows the local details and asks you to confirm before discarding.

### Presets

Presets appear as tappable chips above the workspace selector in the timer view. Tapping a chip immediately starts the timer with those values.

Presets also appear as **Android dynamic shortcuts** — long-press the app icon on your home screen or app drawer to see up to four preset shortcuts. The shortcuts are refreshed automatically each time the app loads its settings.

### Syncing settings between devices

Same mechanism as on the desktop: Settings → *Create sync page* or *Load existing sync page*, attaching this device to a JSON code block on a Notion page that all your devices read and write. The Notion API key is not part of it; enter it manually on each device.

### Setup & build

#### 1. Install Android Studio

1. Download [Android Studio](https://developer.android.com/studio) — click the big download button.
2. Run the installer, click **Next** throughout — default settings are fine.
3. On first launch: step through the setup wizard, choose **Standard** installation.
4. Android Studio will automatically download the JDK and SDK (~1.5 GB, takes a few minutes).
5. Once the main screen appears: done.

---

#### 2. Enable the Android 16 SDK

In Android Studio:

1. Menu bar → **Tools → SDK Manager**
2. **SDK Platforms** tab → tick **Android 16 (API Level 36)**
3. Click **Apply → OK** → wait for the download to finish
4. Close SDK Manager

---

#### 3. Build the APK

Double-click `android/build.bat`. The first run takes a bit longer as Gradle sets itself up. You'll then see:

```
Done! APK is located at:
  release\NotionTimeTracker.apk
```

The file is placed in the `release/` folder at the root of the repo.

---

#### 4. Install the APK on your device

**One-time setup on your device:**

1. Go to **Settings → Apps**
2. Find your file manager (e.g. *My Files*, *Files*, or *Google Files*)
3. Tap it → **Install unknown apps** → turn on

**For each new build:**

1. Copy `release/NotionTimeTracker.apk` to your device via one of:
   - Upload to Google Drive / OneDrive on your PC, download on your device
   - USB cable: connect, choose **File Transfer** in the notification on your device, drag the APK to a folder
2. Open the file manager on your device
3. Navigate to the APK file
4. Tap it → **Install**
5. Reinstalling over an existing version keeps your settings intact

### Troubleshooting (Android)

| Problem | Fix |
|---|---|
| "App not installed" on manual install | Enable *Install from unknown sources* for your file manager |
| `adb: command not found` | Add Android SDK platform-tools to PATH, or use the full path |
| Gradle sync fails | File → Sync Project with Gradle Files; check internet connection |
| Device not recognised via USB | Try another cable; toggle USB debugging off/on |
| Notification not showing | Grant notification permission in Settings → Apps → Notion Time Tracker → Notifications |
| Preset shortcuts not showing | Long-press the app icon; shortcuts appear once at least one preset is configured |

### Android project structure

```
android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/impca201/notiontimetracker/
│       │   ├── MainActivity.kt          # Entry point, handles shortcut intents
│       │   ├── NotionTimeTrackerApp.kt  # Application class, DI root
│       │   ├── ShortcutHelper.kt        # Dynamic shortcuts for preset chips
│       │   ├── data/
│       │   │   ├── models/Models.kt          # Workspace, ActiveTimer, Preset, ExtraProp, …
│       │   │   ├── api/NotionClient.kt        # OkHttp Notion REST client
│       │   │   └── repository/
│       │   │       ├── SettingsRepository.kt  # DataStore + EncryptedSharedPreferences
│       │   │       ├── SettingsSyncer.kt       # Pull-or-push against the Notion sync page
│       │   │       └── NotionRepository.kt
│       │   ├── service/TimerForegroundService.kt  # Ongoing notification, stop action
│       │   ├── ui/
│       │   │   ├── theme/                    # Material 3 theme + workspace colours
│       │   │   ├── screens/                  # TimerScreen.kt, SettingsScreen.kt
│       │   │   └── components/               # SearchableDropdown, ExtraFieldInput,
│       │   │                                 # WorkspaceModal, EditTimerModal
│       │   └── viewmodel/
│       │       ├── TimerViewModel.kt         # Timer state, rounding, start/stop, presets
│       │       └── SettingsViewModel.kt      # API key, workspace CRUD, presets
│       └── res/
│           ├── values/strings.xml            # English (UK)
│           └── values-{nl,fr,de,es,it}/      # Dutch, French, German, Spanish, Italian
├── build.gradle.kts
└── settings.gradle.kts
```
