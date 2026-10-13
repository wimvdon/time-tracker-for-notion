# Project structure

```
time-tracker-for-notion/
├── .github/workflows/release.yml     Version → Windows installer + Android APK → GitHub Release
├── .gitignore                        Build outputs, release/, keystores
├── README.md
├── docs/
├── windows/                          Electron desktop app
│   ├── package.json                  Scripts, dependencies, electron-builder config (NSIS → ../release)
│   ├── package-lock.json
│   ├── vite.config.js                React + Tailwind plugins, production CSP, relative base
│   ├── index.html                    Renderer entry HTML
│   ├── assets/                       icon.svg (source), icon.ico/png, tray icons
│   ├── scripts/generate-icons.cjs    Renders all icons from one vector design (desktop + Android)
│   ├── electron/
│   │   ├── main.cjs                  Window, tray, IPC handlers, lifecycle, electron-store
│   │   ├── preload.cjs               contextBridge → window.notionAPI
│   │   └── notionClient.cjs          All Notion REST calls (main process only)
│   └── src/
│       ├── main.jsx                  React root
│       ├── App.jsx                   Init, theme/accent, view switch, tray event wiring
│       ├── index.css                 Tailwind + Fluent-style tokens
│       ├── views/                    Timer.jsx, Settings.jsx
│       ├── components/               ExtraFieldInput, SearchableSelect, Toasts
│       ├── hooks/useIsDarkTheme.js
│       ├── store/
│       │   ├── useStore.js           All application state and actions (Zustand)
│       │   └── useStore.test.js
│       ├── lib/                      Pure helpers, each with a *.test.js where it has logic
│       │   ├── rounding.js           Round to nearest N, minimum duration
│       │   ├── format.js             Durations, dates, fallback titles, Notion datetimes
│       │   ├── notionValues.js       Build/parse property values per Notion type
│       │   ├── schema.js             Pick properties/options from a database schema
│       │   ├── presets.js            Guarantee every preset has a title
│       │   ├── color.js              Workspace colour light/dark variants with contrast
│       │   ├── errors.js             Strip IPC noise from error messages
│       │   └── i18n.js               Locale resolution and t()
│       └── locales/                  en-GB, nl-BE, fr, de, es, it
└── android/                          Android app (Gradle project root)
    ├── build.gradle.kts              Plugin declarations (versions come from the catalog)
    ├── settings.gradle.kts
    ├── gradle.properties
    ├── gradle/
    │   ├── libs.versions.toml        Version catalog: AGP 8.7.3, Kotlin 2.1.0, all libraries
    │   └── wrapper/                  Gradle 8.11.1
    ├── gradlew, gradlew.bat
    └── app/
        ├── build.gradle.kts          SDK levels, signing from env vars, versioning, dependencies
        ├── proguard-rules.pro        Keep rules for Gson/serialization models
        └── src/main/
            ├── AndroidManifest.xml
            ├── java/com/impca201/notiontimetracker/
            │   ├── NotionTimeTrackerApp.kt   Creates repositories and syncer
            │   ├── MainActivity.kt           Compose host, navigation, shortcut + service intents
            │   ├── ShortcutHelper.kt         Preset launcher shortcuts
            │   ├── LocaleHelper.kt           In-app language override
            │   ├── data/
            │   │   ├── api/                  NotionClient (HTTP), NotionJson (JSON helpers)
            │   │   ├── models/Models.kt      Workspace, PropertyMap, Preset, ActiveTimer, SyncPayload, …
            │   │   └── repository/           SettingsRepository, NotionRepository, SettingsSyncer
            │   ├── service/
            │   │   └── TimerForegroundService.kt
            │   ├── ui/
            │   │   ├── screens/              TimerScreen, SettingsScreen
            │   │   ├── components/           WorkspaceModal, EditTimerModal, ExtraFieldInput, SearchableDropdown
            │   │   └── theme/                Material 3 theme, typography, workspace colours
            │   └── viewmodel/                TimerViewModel, SettingsViewModel
            └── res/
                ├── drawable/, mipmap-anydpi-v26/   Generated launcher icon layers
                ├── values*/                        Strings (en + nl, fr, de, es, it), colours, themes
                └── xml/                            Backup and data-extraction rules
```

## Responsibilities and layers

### Windows

| Layer | Location | Rule |
|---|---|---|
| Privileged | `electron/` | Only place with Node APIs, the API key, the file system and network |
| Bridge | `electron/preload.cjs` | One function per IPC channel, no logic beyond queueing early events |
| State and logic | `src/store/useStore.js` | All async flows, persistence calls and Notion orchestration |
| Pure logic | `src/lib/` | No I/O, no React, no `window`. Safe to unit-test with `node --test`. |
| Presentation | `src/views/`, `src/components/` | Render state and call store actions |

### Android

| Layer | Location | Rule |
|---|---|---|
| Data | `data/api`, `data/repository`, `data/models` | HTTP, persistence, caching, sync. No Compose. |
| Logic | `viewmodel/` | Screen state as `StateFlow`; calls repositories |
| Background | `service/` | The foreground timer notification and its Stop action |
| UI | `ui/` | Stateless Compose functions driven by ViewModel state |

## What should NOT go where

- **Windows `src/`:** no `fetch` to Notion and no access to the API key. Add an IPC channel in `main.cjs` + `preload.cjs` + `notionClient.cjs` instead.
- **Windows `src/lib/`:** no imports of the store, `window.notionAPI` or React. Keep it pure so tests run without Electron.
- **Android `ui/`:** no repository calls. Go through a ViewModel.
- **Both apps:** changes to the sync payload or to how preset values are stored must be made in **both** apps. Each reads the other's payloads.
- **`release/`** (created by `npm run dist`) and keystores are build outputs and are git-ignored.
