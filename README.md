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

- **Start**: creates a time entry with status = running and the description as the title. Start time is rounded to the nearest configured interval.
- **Empty description**: the entry is titled with its start date, formatted as configured in Settings (`DD/MM/YYYY`, `MM/DD/YYYY` or `YYYY-MM-DD`). The description field itself is never pre-filled — the date is only written to the Notion page, so an entry never shows up as "Untitled".
- **Stop**: fills in the end time and sets status = completed. End time is rounded with a minimum duration equal to one interval.
- **Edit timer**: while a timer is running, click the edit icon to change the title, project, or extra field values. Clearing the title falls back to the start date, exactly as when starting.
- **Description required**: workspaces can require a description (Settings → workspace). The field is then marked with `*` and a timer in that workspace cannot be stopped until it is filled in — starting stays a single click, same as for required extra fields.
- **Closing the window** minimises to the system tray. The tray icon turns red while a timer runs.
- **Crash recovery**: if force-quit while a timer runs, next launch asks whether to stop, resume, or discard.
- **Auto-refresh**: running timers and recent entries refresh every 60 seconds. If the active timer was stopped on another device, it is automatically cleared from the view.
- **Deleted pages**: if Notion reports that a page no longer exists when stopping or editing, the app shows the local details and asks you to confirm before discarding.

### Presets

Presets are quick-start configurations defined per workspace. Each preset has:
- A **name** (always prefixed with the workspace name)
- An optional **default title** for new time entries
- Optional **default values** for extra fields

Presets appear as clickable chips above the workspace selector in the timer view. Clicking a chip immediately starts the timer with those values.

On Windows, presets also appear in the **right-click tray menu** and **taskbar context menu** when no timer is running.

### Syncing settings to Android

Each workspace can be exported as a QR code (click the QR button next to the workspace name in Settings). Scanning this code from the Android app imports the full workspace configuration — databases, field mappings, extra fields, presets, and rounding settings. The Notion API key is intentionally not included; enter it manually on each device.

### Troubleshooting (Windows)

| Problem | Fix |
|---|---|
| "Connection failed: API token is invalid" | Re-copy the secret from notion.so/my-integrations; no spaces. |
| Database dropdowns are empty | Integration isn't connected to the pages — see setup step 5. |
| Project dropdown stays empty | Only records with a non-empty page title are shown — check the Projects database in the workspace settings. |
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
│   ├── components/        # ExtraFieldInput, SearchableSelect, Toasts, RecoveryModal
│   ├── store/useStore.js  # Zustand store (settings, session, timer, migrations)
│   ├── locales/           # en-GB.js, nl-BE.js
│   └── lib/               # rounding.js, format.js, i18n.js, schema.js, notionValues.js
├── assets/
└── package.json
```

---

## Android

A native Android app built with Kotlin + Jetpack Compose. Functionally identical to the Windows app, with Android-native UX:

- A **sticky foreground notification** replaces the system tray while a timer is running
- Tap **Stop** in the notification to stop the timer even when the app is closed
- **Android 16+**: uses `Notification.ProgressStyle` (Live Updates) for a visual progress bar
- Crash recovery, identical rounding logic, and bilingual support (Dutch/English) — all ported 1:1

### Tech stack

| Component | Choice |
|---|---|
| Language | Kotlin |
| UI | Jetpack Compose + Material You (Material 3) |
| State | ViewModel + StateFlow |
| Storage | DataStore (Preferences) + EncryptedSharedPreferences (API key) |
| HTTP | OkHttp + Gson |
| Background | Foreground Service |
| Notifications | NotificationCompat + `Notification.ProgressStyle` (API 36+) |
| Min SDK | 26 (Android 8) |
| Target SDK | 36 (Android 16) |

### First launch & workspace configuration

1. Open the app. Tap the gear icon to open Settings.
2. Paste your Notion API key and tap **Test connection & save**.
3. Tap **+ Add workspace** and follow the step-by-step modal.
4. Optionally add up to five **extra fields** and up to five **presets** per workspace.
5. Tap the back arrow to go to the timer.

Alternatively, scan a workspace QR code from the Windows app to import a workspace configuration directly (see [Syncing settings](#syncing-settings-to-android-1)).

### How it behaves

- **Start / Stop**: same logic as Windows — rounding, status transitions, relation fields, and the start-date fallback for an empty description.
- **Edit timer**: while a timer is running, tap the edit icon to update the title, project, or extra field values. Clearing the title falls back to the start date.
- **Description required**: identical per-workspace option as on Windows; the timer cannot be stopped until a description is filled in.
- **Auto-refresh**: running timers and recent entries refresh every 60 seconds. If the active timer was stopped on another device, it is automatically cleared and a toast is shown.
- **Deleted pages**: if Notion reports that a page no longer exists when stopping or editing, the app shows the local details and asks you to confirm before discarding.

### Presets

Presets appear as tappable chips above the workspace selector in the timer view. Tapping a chip immediately starts the timer with those values.

Presets also appear as **Android dynamic shortcuts** — long-press the app icon on your home screen or app drawer to see up to four preset shortcuts. The shortcuts are refreshed automatically each time the app loads its settings.

### Syncing settings to Android

On Windows, click the QR button next to any workspace in Settings to show a QR code. In the Android app, go to Settings and tap **Scan QR code to import settings**. The Notion API key is intentionally not included in the QR code; enter it manually on each device.

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
│       │   │       └── NotionRepository.kt
│       │   ├── service/TimerForegroundService.kt  # Ongoing notification, stop action
│       │   ├── ui/
│       │   │   ├── theme/                    # Material 3 dark theme
│       │   │   ├── screens/                  # TimerScreen.kt, SettingsScreen.kt, QrScannerScreen.kt
│       │   │   └── components/               # SearchableDropdown, ExtraFieldInput,
│       │   │                                 # WorkspaceModal, RecoveryDialog, EditTimerModal
│       │   └── viewmodel/
│       │       ├── TimerViewModel.kt         # Timer state, rounding, start/stop, presets
│       │       └── SettingsViewModel.kt      # API key, workspace CRUD, presets
│       └── res/
│           ├── values/strings.xml            # English (UK)
│           └── values-nl/strings.xml         # Dutch (NL/BE)
├── build.gradle.kts
└── settings.gradle.kts
```
