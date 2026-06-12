# Notion Time Tracker

Lightweight time-tracking app for Notion — available as a Windows desktop widget and an Android app.

## Platforms

- [Windows (Electron)](#windows-electron) — always-visible widget with system tray
- [Android](#android) — native app with a sticky foreground notification as the active indicator

---

## Windows (Electron)

A lightweight, always-on-top Windows desktop widget. Pick a workspace and project, press **START**, and the app creates a time entry page in your Notion database. Press **STOP** and it fills in the end time — optionally rounded to the nearest 15 minutes (configurable per workspace).

Built with Electron, React, Vite, Tailwind CSS and Zustand.

### One-time setup: Notion API key

The app talks directly to the Notion API. You need a (free) internal integration:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Name it **Notion Timer**, type **Internal**, and pick your Notion workspace.
3. Under *Capabilities*, make sure **Read content**, **Insert content** and **Update content** are enabled.
4. Copy the **Internal Integration Secret** — this is the API key you paste into Settings. It starts with `secret_` or `ntn_`.
5. **Give the integration access to your pages.** In Notion, open each page that contains the databases you want to use → `···` → **Connections → Connect to → Notion Timer**. Do this on the **parent page containing the databases** — child databases inherit the connection.

### What your databases need

- a **Time Entries database**: needs a title property, a date property (start/end range), a status property (one option for "running", one for "completed"), and a relation property linking to projects.
- a **Projects database**: page titles are used as picker options — no configuration needed.

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
3. Optionally add up to five extra fields from the Time Entries database (text, number, select, multi-select, status, date, checkbox, URL, e-mail, phone, people, relation).
4. Click `←` to go to the timer.

### How it behaves

- **Start**: creates a time entry with status = running and the description as the title (or `"{Project} — {DD/MM/YYYY}"` if left empty). Start time is rounded to the nearest configured interval.
- **Stop**: fills in the end time and sets status = completed. End time is rounded with a minimum duration equal to one interval.
- **Closing the window** minimises to the system tray. The tray icon turns red while a timer runs.
- **Crash recovery**: if force-quit while a timer runs, next launch asks whether to stop, resume, or discard.

### Troubleshooting

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
│   ├── main.cjs           # Main process: window, tray, IPC, electron-store
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
- Crash recovery, identical rounding logic, and bilingual support (nl/en) — all ported 1:1

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

### Volledige setup & build

#### 1. Android Studio installeren

1. Download [Android Studio](https://developer.android.com/studio) — klik de grote downloadknop
2. Voer de installer uit, klik overal **Next**, standaardinstellingen zijn goed
3. Bij eerste launch: doorloop de setup-wizard, kies **Standard** installatie
4. Android Studio downloadt nu automatisch de JDK en SDK (~1,5 GB, even wachten)
5. Zodra het hoofdscherm verschijnt: klaar

---

#### 2. Android 16 SDK aanzetten

In Android Studio:

1. Menubalk → **Tools → SDK Manager**
2. Tab **SDK Platforms** → vink **Android 16 (API Level 36)** aan
3. Klik **Apply → OK** → wacht tot het download klaar is
4. Sluit SDK Manager

---

#### 3. APK bouwen

Dubbelklik `android/build.bat`. De eerste keer duurt het wat langer omdat Gradle zichzelf opzet. Daarna zie je:

```
Klaar! APK staat in:
  release\NotionTimeTracker.apk
```

Het bestand staat in de `release/` map in de root van het repo.

---

#### 4. APK op je toestel installeren

**Eenmalig op je toestel (één keer instellen):**

1. Ga naar **Instellingen → Apps**
2. Zoek je bestandsbeheerder (bijv. *Mijn bestanden*, *Files*, of *Google Files*)
3. Tik erop → **Installeer onbekende apps** → zet aan

**Bij elke nieuwe build:**

1. Kopieer `release/NotionTimeTracker.apk` naar je toestel via één van:
   - Google Drive / OneDrive uploaden op pc, downloaden op toestel
   - USB-kabel: sluit aan, kies **Bestandsoverdracht** in de melding op je toestel, sleep het APK-bestand naar een map
2. Open de bestandsbeheerder op je toestel
3. Navigeer naar het APK-bestand
4. Tik erop → **Installeren**
5. Bij een update van een bestaande versie gewoon opnieuw installeren — je instellingen blijven bewaard

### Troubleshooting (Android)

| Problem | Fix |
|---|---|
| "App not installed" on manual install | Enable *Install from unknown sources* for your file manager |
| `adb: command not found` | Add Android SDK platform-tools to PATH, or use the full path |
| Gradle sync fails | File → Sync Project with Gradle Files; check internet connection |
| Device not recognised via USB | Try another cable; toggle USB debugging off/on |
| Notification not showing | Grant notification permission in Settings → Apps → Notion Time Tracker → Notifications |

### Android project structure

```
android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/impca201/notiontimetracker/
│       │   ├── MainActivity.kt
│       │   ├── NotionTimeTrackerApp.kt
│       │   ├── data/
│       │   │   ├── models/Models.kt          # Workspace, ActiveTimer, ExtraProp, …
│       │   │   ├── api/NotionClient.kt        # OkHttp Notion REST client (7 endpoints)
│       │   │   └── repository/
│       │   │       ├── SettingsRepository.kt  # DataStore + EncryptedSharedPreferences
│       │   │       └── NotionRepository.kt
│       │   ├── service/TimerForegroundService.kt  # Ongoing notification, stop action
│       │   ├── ui/
│       │   │   ├── theme/                    # Material 3 dark theme
│       │   │   ├── screens/                  # TimerScreen.kt, SettingsScreen.kt
│       │   │   └── components/               # SearchableDropdown, ExtraFieldInput,
│       │   │                                 # WorkspaceModal, RecoveryDialog
│       │   └── viewmodel/
│       │       ├── TimerViewModel.kt         # Timer state, rounding, start/stop
│       │       └── SettingsViewModel.kt      # API key, workspace CRUD
│       └── res/
│           ├── values/strings.xml            # English (UK)
│           └── values-nl/strings.xml         # Dutch (NL/BE)
├── build.gradle.kts
└── settings.gradle.kts
```
