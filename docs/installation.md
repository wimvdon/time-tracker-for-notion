# Installation

## Prerequisites

| For | Requirement |
|---|---|
| Both apps | A Notion account and an internal connection (integration) token; see [usage.md](usage.md#1-prepare-notion) |
| Windows app | Windows 10 or 11 (Mica on Windows 11 22H2+). Development: Node.js 24 LTS (as in CI) and npm. |
| Android app | Phone with Android 8.0+ (API 26). Development: Android Studio with JDK 17 or newer (CI uses Temurin 21) and SDK Platform 37. |

No environment variables, database or backend are needed.

## Option A: install a release

New versions are no longer published as a GitHub Release (the repository is public). Older versions remain on the [Releases](https://github.com/wimvdon/time-tracker-for-notion/releases) page, but no new ones are added.

1. **Android:** install from Google Play's internal testing track (invite only). See [Publishing the Android app through Google Play](#publishing-the-android-app-through-google-play). Updates come automatically through the Play Store.
2. **Windows:** in GitHub, open **Actions › Release**, click the run of the version you want (green, with the version in its summary), and download **windows** under **Artifacts** (kept 90 days; you must be signed in to GitHub). Unzip it and run the `.exe`. It's a one-click per-user NSIS installer that updates the installed app and keeps its settings. SmartScreen warns because the installer isn't code-signed; choose **More info › Run anyway**.
3. Continue with [usage.md](usage.md).

An APK built locally is signed with a debug key. Android refuses to install a release over it until the old copy is uninstalled.

## Option B: run from source

### 1. Clone the repo

```bash
git clone https://github.com/wimvdon/time-tracker-for-notion.git
cd time-tracker-for-notion
```

### 2. Windows app

Use Node.js 24 (`windows/.nvmrc`; with nvm: `nvm use` inside `windows/`).

```bash
cd windows
npm ci
npm run dev
```

`npm run dev` starts Vite on `http://localhost:5173` (strict port) and launches Electron against it with hot reload.

Other scripts:

| Command | Does |
|---|---|
| `npm test` | Unit tests (`node --test`, in `src/` and `electron/`) |
| `npm run lint` | ESLint |
| `npm run check` | Lint + unit tests + build, what CI checks first |
| `npm run build` | Production renderer build into `windows/dist/` |
| `npm run dist` | Build + NSIS installer into `release/` at the repo root |
| `npm run dist:dev` | Build + installer for *Time Tracker for Notion Dev*, which installs next to the real app with its own settings |
| `npm run dist:dir` | Build + unpacked app (no installer), faster for smoke tests |
| `npm run icons` | Regenerate all icons from the vector design, including Android launcher layers |

Settings are stored by electron-store in `%APPDATA%\Time Tracker for Notion\config.json` (obfuscated, with the API key encrypted by Windows, see [decisions.md](decisions.md#api-key-handling)). The Dev app uses `%APPDATA%\Time Tracker for Notion Dev\`. Uninstalling keeps it (`deleteAppDataOnUninstall: false`).

#### Optional: mock Notion server

`notionClient.cjs` reads `NOTION_API_BASE_URL`, so you can point the app at a local mock:

```bash
NOTION_API_BASE_URL=http://localhost:4010/v1 npm run dev
```

### 3. Android app

1. Android Studio › **File › Open** › choose the `android` folder.
2. Install SDK Platform 37 if prompted (**Tools › SDK Manager**).
3. Wait for Gradle sync, then **Run** on a device or emulator.

From a terminal, inside `android/`:

```bash
./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug       # install on a connected device
./gradlew testDebugUnitTest lintDebug   # what CI checks
```

Debug builds have the application ID `com.impca201.notiontimetracker.debug` and the name **Time Tracker Dev**, so they install next to the released app with their own settings and API key.

Use `gradlew.bat` on Windows. Android Studio writes `local.properties` with the SDK path; without it, create one with `sdk.dir=/path/to/Android/Sdk`.

## Verify it works

1. Open the app's **Settings**, paste the token and click **Test connection & save**. Expect **API key works and was saved.**
2. Add a workspace and press **Start**. A new row with the *running* status appears in the Notion database.
3. Press **Stop**. The row gets an end time and the *done* status.

## Release builds (CI)

`.github/workflows/ci.yml` checks every pull request and every push to `main` (an outdated run of the same pull request is cancelled):
- **Windows checks** (Linux): lint, unit tests, renderer build, and an audit of the packages that ship in the app.
- **Windows build** (Windows): builds the Dev installer, installs it silently, starts it, checks its window, uninstalls it, and attaches the installer to the run (**Checks → CI → Artifacts**).
- **Android**: release-script tests, unit tests, lint (errors fail), debug and release builds, and `TimeTracker-<version>-debug.apk` attached to the run. It installs as *Time Tracker Dev* next to the real app. Test and lint reports are attached too.

`.github/workflows/release.yml` builds both apps on tag pushes (`v*`) and on **Run workflow**.

- **Version:** taken from the tag, or bumped from the latest tag (`patch`, `minor`, `major`). `none` builds without publishing: a Dev installer and an APK and AAB with versionCode 1, which cannot update an installed app. The Android version code is `major × 10000 + minor × 100 + patch`.
- **Refuses to publish** from outside `main`, when the tag already exists, when the version isn't higher than the previous release, or with no commits since it.
- **Windows job:** `npm ci`, sets the package version, lint, `npm test`, builds the installer (`dist`, or `dist:dev` for a build-only run), then installs, starts and uninstalls it with `windows/scripts/smoke-test-installer.ps1`.
- **Android checks job:** decodes the keystore secret (`android/scripts/decode_keystore.py`), checks the keystore password, alias and key password (`VerifySigningKey.java`) before building, writes `android/keystore.properties`, and runs the unit tests and lint. In a build-only run it then builds the APK and the AAB; it builds a debug APK when the secrets are missing.
- **Play job** (releases only, after both apps passed): builds the signed AAB with `-PappVersionName` and `-PappVersionCode` and uploads it to Google Play's **internal testing** track with `r0adkll/upload-google-play` (pinned). It has read-only GitHub access. `TimeTracker-x.y.z-mapping.txt` (R8's map, to read crash stack traces) is kept as the run's **android-mapping** artifact and is also sent to Play.
- **Tag job:** the only job with write access. Creates the `vX.Y.Z` tag, only after Play accepted the bundle; a failed run leaves no tag and can be re-run (**Re-run failed jobs**).
- **No GitHub Release:** the repository is public, so nothing installable is attached there. The release's Windows installer is the run's **windows** artifact (kept 90 days).
- **Version maths** (next version, version code, "is newer") is in `android/scripts/release_version.py`, unit tested, for both apps.

Repository secrets for signing:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the `.jks`. Linux/macOS: `base64 -w0 timetracker.jks`. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("timetracker.jks")) \| Set-Clipboard` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | The Google Play service account's JSON key (see below, step 6) |

The keystore is the Play **upload key**: Google Play re-signs the app with its own app signing key.

Create the keystore once and keep a backup. A lost key means users must uninstall before the next update:

```bash
keytool -genkeypair -v -keystore timetracker.jks -keyalg RSA -keysize 2048 -validity 10000 -alias timetracker
```

Release: **Actions › Release › Run workflow** on `main` and pick `patch`, `minor` or `major`, or push a tag:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

Or use **Actions › Release › Run workflow** with **Release** = `patch`, `minor` or `major`.

## Publishing the Android app through Google Play

One-time setup, done in a web browser. You need the Google account you want to publish with and about an hour, plus waiting time for Google's identity check.

### 1. Create a Play developer account

1. Go to [play.google.com/console/signup](https://play.google.com/console/signup) and sign in with your Google account.
2. Choose **Yourself** (a personal account).
3. Pay the one-time registration fee of **US$25**.
4. Complete the **identity verification** (an ID document, and a phone number and address). This can take a few days; you get an email when it is done.

### 2. Create the app

1. In the [Play Console](https://play.google.com/console), click **Create app**.
2. App name: **Time Tracker for Notion**. Default language: English. App or game: **App**. Free or paid: **Free**.

   Note: Google does not let you change a free app to paid later. If you may sell the app one day, read Play Console Help on free and paid apps before choosing (a paid app also needs a payments profile).
3. Tick the declarations and click **Create app**.

The app ID (package name) is fixed by the first file you upload in step 5. It must be exactly **`com.impca201.notiontimetracker`**, which the bundles built by the workflow already have. Never upload the Dev build (`.debug`): that would claim the wrong ID for good.

### 3. Play App Signing: let Google create a new key

Google signs the app that phones download with an **app signing key** that it keeps. The key in the GitHub secrets becomes only the **upload key**: it proves to Google that an upload comes from you. If an upload key is ever lost or leaked, Google can replace it (**Test and release › App integrity › Upload key certificate › Request upload key reset**).

This app uses a **new app signing key created by Google**, not the key that also signed the owner's other apps (decision of 2026-10-14 in [decisions.md](decisions.md)). Nothing to do here: in step 5 the Play Console shows **Play App Signing** with **Use Google-generated key** (the default). Keep that choice.

Consequence: the app from Play has a different signature than the APKs from GitHub Releases. Android does not let one replace the other, so **uninstall the GitHub version once** before installing from Play. Your time entries are in Notion and are not affected. You lose only the saved Notion API key and the app's settings: paste the key again in **Settings** and add your workspaces again (or let the Notion sync page bring them back).

(The alternative, giving Google the existing key with Google's encryption tool so current installs keep updating, was not chosen: that key also signs other apps.)

### 4. Set up internal testing

1. In the app, go to **Test and release › Testing › Internal testing**.
2. Open the **Testers** tab, click **Create email list**, name it (for example "Me"), and add **your own Google account email address**: the account that is signed in to the Play Store on your phone. Save, and tick the list.
3. Keep this page open; the **Join on the web** link appears here after step 5.

Internal testing allows up to 100 testers, needs no review by Google beyond the automatic checks, and is available within minutes.

### 5. Upload the first build by hand

Google requires the very first bundle to be uploaded in the Play Console.

1. In GitHub: **Actions › Release › Run workflow**, branch `main`, **Release** = `none`, **Run workflow**. Wait for it to finish (green).
2. Open the run and download **android** under **Artifacts**, then unzip it. It holds `TimeTracker-<version>.aab`. (Its versionCode is 1, which is fine: every real release has a higher one, so it updates this build.)
3. In the Play Console: **Test and release › Testing › Internal testing › Create new release**.
4. Under **App integrity**, keep **Use Google-generated key** (step 3).
5. Under **App bundles**, upload the `.aab` file. Release name: `first upload`. Click **Next**, then **Save and publish** (sometimes **Start rollout to Internal testing**). Warnings about a missing privacy policy or app details may show; they do not block internal testing, errors do.
6. Back on the **Testers** tab, copy the **Join on the web** link, open it on your phone (signed in with the email from step 4), tap **Accept invitation**, then **Download it on Google Play**.
7. Uninstall the GitHub version of the app first if it is still on the phone (step 3), then install from the Play Store.
8. Delete the dry run's artifacts in GitHub (the run's page › **Artifacts** › bin icon).

### 6. Let the Release workflow upload to Play

The workflow uploads with a Google Cloud **service account**: a robot account with only the rights you give it.

1. Open [console.cloud.google.com](https://console.cloud.google.com) with the same Google account. Create a project (top bar › project picker › **New project**, for example "time-tracker-release").
2. In that project, enable the API: search for **Google Play Android Developer API** and click **Enable**.
3. Go to **IAM & Admin › Service accounts › Create service account**. Name: `github-release`. Click **Create and continue**, skip the optional roles, click **Done**.
4. Click the new service account › **Keys › Add key › Create new key › JSON › Create**. A `.json` file downloads. It is a password: do not email it or put it in the repository.
5. Copy the service account's email address (it ends in `.iam.gserviceaccount.com`).
6. In the Play Console (the main page with all your apps, not inside the app): **Users and permissions › Invite new users**. Paste the service account email.
7. Under **App permissions**, click **Add app**, choose **Time Tracker for Notion**, and tick at least **Release apps to testing tracks** (and **View app information and download bulk reports (read-only)**). Do not give it account-wide admin rights. Click **Invite user** (it is accepted automatically).
8. In GitHub: the repository › **Settings › Secrets and variables › Actions › New repository secret**. Name: `PLAY_SERVICE_ACCOUNT_JSON`. Value: open the `.json` file in a text editor and paste its entire contents. **Add secret**.
9. Delete the `.json` file from your computer (or keep it only in a password manager).

From now on, **Actions › Release › Run workflow** with `patch`, `minor` or `major` puts the new version on your phone through the Play Store.

### Later: a public release on Google Play

Not needed for your own use. Before the app can go to **Production** (anyone can find and install it), Google requires:

- **A closed test first** for personal developer accounts created after November 2023: as of 2026, at least **12 testers** who stay opted in for **14 days in a row**, after which you apply for production access. Google has changed these numbers before; check the current rule in the Play Console (**Dashboard**) or [Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465).
- **A privacy policy URL.** Once the repository is public, [PRIVACY.md](../PRIVACY.md) is reachable at `https://github.com/wimvdon/time-tracker-for-notion/blob/main/PRIVACY.md`.
- **The Data safety form** (**Policy and programs › App content**): fill it in from PRIVACY.md (the app sends your Notion API key and time entries to the Notion API only; no ads, analytics or tracking).
- **The content rating questionnaire** and the other items under **App content** (target audience, ads: none).
- A store listing: short and full description, icon, feature graphic and screenshots.
