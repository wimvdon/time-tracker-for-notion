# Installation

## Prerequisites

| For | Requirement |
|---|---|
| Both apps | A Notion account and an internal connection (integration) token; see [usage.md](usage.md#1-prepare-notion) |
| Windows app | Windows 10 or 11 (Mica on Windows 11 22H2+). Development: Node.js LTS (CI uses Node 22) and npm. |
| Android app | Phone with Android 8.0+ (API 26). Development: Android Studio with JDK 17 (CI uses Temurin 17) and SDK Platform 36. |

No environment variables, database or backend are needed.

## Option A: install a release

1. Open the [latest release](https://github.com/impca201/notion-time-tracker/releases/latest).
2. **Windows:** download the `.exe` and run it. It's a one-click per-user NSIS installer. SmartScreen warns because the installer isn't code-signed; choose **More info › Run anyway**.
3. **Android:** download the `.apk` on the phone and open it from the **Files** app. Allow installing from that source when asked.
4. Continue with [usage.md](usage.md).

An APK built locally is signed with a debug key. Android refuses to install a release over it until the old copy is uninstalled.

## Option B: run from source

### 1. Clone the repo

```bash
git clone https://github.com/impca201/notion-time-tracker.git
cd notion-time-tracker
```

### 2. Windows app

```bash
cd windows
npm install
npm run dev
```

`npm run dev` starts Vite on `http://localhost:5173` (strict port) and launches Electron against it with hot reload.

Other scripts:

| Command | Does |
|---|---|
| `npm test` | Unit tests (`node --test "src/**/*.test.js"`) |
| `npm run build` | Production renderer build into `windows/dist/` |
| `npm run dist` | Build + NSIS installer into `release/` at the repo root |
| `npm run dist:dir` | Build + unpacked app (no installer), faster for smoke tests |
| `npm run icons` | Regenerate all icons from the vector design, including Android launcher layers |

Settings are stored by electron-store in `%APPDATA%\Time Tracker for Notion\config.json` (obfuscated, see [decisions.md](decisions.md#api-key-handling)). Uninstalling keeps it (`deleteAppDataOnUninstall: false`).

#### Optional: mock Notion server

`notionClient.cjs` reads `NOTION_API_BASE_URL`, so you can point the app at a local mock:

```bash
NOTION_API_BASE_URL=http://localhost:4010/v1 npm run dev
```

### 3. Android app

1. Android Studio › **File › Open** › choose the `android` folder.
2. Install SDK Platform 36 if prompted (**Tools › SDK Manager**).
3. Wait for Gradle sync, then **Run** on a device or emulator.

From a terminal, inside `android/`:

```bash
./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug       # install on a connected device
```

Use `gradlew.bat` on Windows. Android Studio writes `local.properties` with the SDK path; without it, create one with `sdk.dir=/path/to/Android/Sdk`.

## Verify it works

1. Open the app's **Settings**, paste the token and click **Test connection & save**. Expect **API key works and was saved.**
2. Add a workspace and press **START**. A new row with the *running* status appears in the Notion database.
3. Press **STOP**. The row gets an end time and the *done* status.

## Release builds (CI)

`.github/workflows/release.yml` builds both apps on tag pushes (`v*`), on **Run workflow**, and on PRs that change the workflow.

- **Version:** taken from the tag, or bumped from the latest tag (`patch`, `minor`, `major`). `none` builds without publishing. The Android version code is `major × 10000 + minor × 100 + patch`.
- **Windows job:** `npm ci`, sets the package version, `npm test`, `npm run dist -- --publish never`.
- **Android job:** decodes the keystore secret and runs `assemble{Release|Debug}` with `-PversionName` and `-PversionCode`. It builds debug when the secrets are missing and nothing is published.
- **Release job:** attaches `Time Tracker for Notion Setup x.y.z.exe` and `TimeTracker-x.y.z.apk` to the GitHub Release.

Repository secrets for signing (the Android build reads them as environment variables):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the `.jks`. Linux/macOS: `base64 -w0 timetracker.jks`. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("timetracker.jks")) \| Set-Clipboard` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Create the keystore once and keep a backup. A lost key means users must uninstall before the next update:

```bash
keytool -genkeypair -v -keystore timetracker.jks -keyalg RSA -keysize 2048 -validity 10000 -alias timetracker
```

Release:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

Or use **Actions › Release › Run workflow** with **Release** = `patch`, `minor` or `major`.
