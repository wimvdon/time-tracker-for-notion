# Time Tracker for Notion

Press **START** when you begin working and **STOP** when you're done. Time Tracker writes each block of time as a row in a Notion database, either from a small window on your Windows PC or from an app on your Android phone. This guide takes you from nothing to your first tracked hour, step by step.

## Contents

1. [What you need](#1-what-you-need)
2. [Prepare your Notion database](#2-prepare-your-notion-database)
3. [Give the app a key to your Notion](#3-give-the-app-a-key-to-your-notion)
4. [Install on Windows](#4-install-on-windows)
5. [Install on Android](#5-install-on-android)
6. [Connect the app to Notion](#6-connect-the-app-to-notion)
7. [Track your time](#7-track-your-time)
8. [Presets: start a timer in one click](#8-presets-start-a-timer-in-one-click)
9. [Use the same settings on all your devices](#9-use-the-same-settings-on-all-your-devices)
10. [Solving problems](#10-solving-problems)
11. [For developers](#11-for-developers)
12. [Sources](#12-sources)

---

## 1. What you need

- A **Notion account**. A free account works.
- For the desktop app: a **Windows 10 or 11** PC.
- For the phone app: an **Android** phone running Android 8 or newer.
- About 30 minutes for the first setup. After that, starting a timer takes one click.

Both apps are ready to download from this project's [Releases](https://github.com/impca201/notion-time-tracker/releases) page; chapters 4 and 5 show how.

---

## 2. Prepare your Notion database

The app needs a Notion *database* to write your time into. A database is a table in Notion where every row is a page. Each row will be one block of work, for example "Writing report, 09:00 – 10:30".

If you already have a time-tracking database with a date column and a status column, skip to [chapter 3](#3-give-the-app-a-key-to-your-notion).

1. Open Notion and click **+ New page** in the sidebar on the left.
2. Type a title for the page, for example `Time tracking`, and press **Enter**.
3. On the empty line below the title, type `/database` and choose **Database - Inline** from the menu that appears. A table appears with a column called **Name**. This column holds the title of each time entry; the app fills it in with what you're working on.
4. Click the title of the table (it says **Untitled** or **New database**) and type `Time Entries`.
5. Click the **+** at the right end of the column headers. A list of column types appears.
6. Choose **Date** and name the column `Time`. The app stores the start and end time of each entry here.
7. Click the **+** at the right end of the column headers again and choose **Status**. Name the column `Status`. A status column comes with the options **Not started**, **In progress** and **Done**. The app marks a running timer **In progress** and a finished one **Done**, so the default options are all you need.

You now have a database with the three columns the app needs: **Name**, **Time** and **Status**.

**Optional: link entries to projects.** If you keep a separate Notion database of projects or clients, add a column of type **Relation** to the Time Entries database and point it at that projects database. The app finds it automatically, keeps the link when you edit a running timer, and copies it when you restart an old entry. It never removes a link you set in Notion.

---

## 3. Give the app a key to your Notion

Notion only lets an app read and write your pages when you give it a key. Notion calls this a *connection* (older Notion screens call it an *integration*), and the key itself an *access token*. Think of it as a house key that only opens the rooms you choose.

> **Who can do this:** only a **Workspace Owner** can create a connection. On a personal Notion account, that's you. In a company workspace, ask the person who manages Notion to do these steps for you.

### 3.1 Create the key

1. In your web browser, go to [app.notion.com/developers](https://app.notion.com/developers) and sign in with your Notion account. This is Notion's **Developer portal**.
2. In the sidebar, under **Build**, click **Internal connections**.
3. Click **Create a new connection**.
4. Type a name you will recognise, for example `Time Tracker`.
5. Choose the Notion workspace that contains your Time Entries database, and confirm. The page of your new connection opens.
6. Click the **Configuration** tab.
7. Under the capabilities, make sure **Read content**, **Update content** and **Insert content** are switched on. The app needs to read your databases, add new time entries and update them when you stop a timer.
8. Find the **Installation access token** (older Notion screens: **Internal Integration Secret**). Click to show it, then copy it. It's a long code that starts with `ntn_` or `secret_`.
9. Paste the code into a safe place, such as a password manager. You'll paste it into the app in [chapter 6](#6-connect-the-app-to-notion). Treat it like a password: anyone who has it can change your Notion pages.

### 3.2 Let the key open your time-tracking page

A new connection can't see any of your pages yet. Give it access to the page that contains your database. Everything inside that page is included automatically.

1. In Notion, open the page that contains your Time Entries database (in chapter 2 you called it `Time tracking`).
2. Click **•••** in the top-right corner of the page.
3. Click **Connections**, then **Add connection**.
4. Type `Time Tracker` (the name from step 4 above) and click it.
5. Click **Confirm** if Notion asks whether the connection may access the page. The connection now appears under **Connections** in the same menu.

If you want to sync settings between devices ([chapter 9](#9-use-the-same-settings-on-all-your-devices)), the page where the sync page will live must be connected the same way. Connecting the `Time tracking` page covers this if you put the sync page inside it.

---

## 4. Install on Windows

Skip this chapter if you only want the Android app.

### 4.1 Download the installer

1. Open the [latest release](https://github.com/impca201/notion-time-tracker/releases/latest) of this project on GitHub.
2. Under **Assets**, click the file that ends in `.exe`, for example `Time.Tracker.for.Notion.Setup.1.0.1.exe`. It downloads to your **Downloads** folder.
3. If your browser says the file isn't commonly downloaded, click **•••** (or the arrow) next to the warning and choose **Keep**.

### 4.2 Install the app

1. Open your **Downloads** folder and double-click the installer.
2. If a blue window says **Windows protected your PC**, click **More info**, then **Run anyway**. Windows shows this for every app that isn't signed by a known publisher.
3. The app installs itself without further questions and opens on the **Settings** screen.

The app runs as a small window that stays on top of your other windows. When you close it, it keeps running in the *system tray*: the row of small icons at the bottom-right of the taskbar, next to the clock (click the **^** arrow if you don't see it).

To update the app later, download the installer of the newest release and run it again. Your settings are kept.

Continue with [chapter 6](#6-connect-the-app-to-notion).

---

## 5. Install on Android

### 5.1 Download the app

1. On your phone, open the [latest release](https://github.com/impca201/notion-time-tracker/releases/latest) of this project in your browser.
2. Under **Assets**, tap the file that ends in `.apk`, for example `TimeTracker-1.0.1.apk`. An *APK* is an Android app in a single file.
3. If the browser warns that the file might be harmful, tap **Download anyway**.

### 5.2 Install the app

1. Open the **Files** app (on Samsung phones: **My Files**), go to **Downloads** and tap the APK.
2. The first time, Android says it isn't allowed to install apps from this source. Tap **Settings**, switch on **Allow from this source**, and go back.
3. Tap **Install**. When it's done, tap **Open**.
4. Allow notifications when asked. The app shows the running timer as a notification, so you can see and stop it without opening the app.

To update the app later, repeat 5.1 and 5.2. Installing over the old version keeps your settings.

> **Built the app yourself before?** A copy you built with the old `build.bat` is signed with a different key, so Android refuses to install the release over it (**App not installed**). Uninstall the old copy first, then install the release. Uninstalling removes the app's settings, so connect it to Notion again afterwards ([chapter 6](#6-connect-the-app-to-notion)).

---

## 6. Connect the app to Notion

These steps are the same on Windows and Android. On Android, open **Settings** with the gear icon at the top-right of the timer screen first.

### 6.1 Add your key

1. In **Settings**, click (or tap) the **Notion API Key** box and paste the key you copied in [chapter 3](#31-create-the-key).
2. Click **Test connection & save**. When the key works, the message **API key works and was saved.** appears.

### 6.2 Add a workspace

In this app, a *workspace* is one Time Entries database plus how you want to use it. Most people need one; add more if you track time in several databases, for example one for work and one for a side project.

1. Under **Workspaces**, click **+ Add workspace**. The **Add Workspace** window opens.
2. In **Name**, type a short name, for example `Work`. It appears on the timer and on your preset buttons.
3. Under **Time Entries database**, choose the database you made in chapter 2. If the list is empty, click **Refresh**; if it stays empty, the connection doesn't have access to the page yet ([3.2](#32-let-the-key-open-your-time-tracking-page)).
4. Under **Date range field**, choose `Time`.
5. Under **Status field**, choose `Status`.
6. Under **Running status option**, choose **In progress**.
7. Under **Completed status option**, choose **Done**.
8. Optional settings in the same window:
   - **Extra fields (optional)**: click **+ Add field** to show up to five more columns of your database in the timer, for example a *Client* or *Billable* column. Tick **Required** to make sure it's filled in before the timer can stop.
   - **Description required**: when on, a timer can't be stopped until you've typed what you worked on.
   - **Time rounding**: rounds start and stop times to the nearest 5, 10 or 15 minutes. Choose **No rounding** to keep exact times.
   - **Workspace colour**: colours the timer and buttons, so you can tell workspaces apart at a glance.
9. Click **Save**.
10. Go back to the timer with the **←** arrow (Windows) or the back arrow (Android) at the top-left.

---

## 7. Track your time

### 7.1 Start a timer

1. Under **Workspace**, choose where the time belongs.
2. In **Working on…**, type what you're doing, for example `Monthly report`. You can leave it empty: the entry is then titled with today's date.
3. Fill in any extra fields you added.
4. Click **START**. The clock starts counting and a new row appears in your Notion database with status **In progress**.

On Windows, the stopwatch in the tray turns your workspace colour (red if it has none) while a timer runs. On Android, a notification shows the running timer.

### 7.2 While the timer runs

- **Change the description**: click it, type, and press **Enter** (or click somewhere else). It's saved to Notion straight away.
- **Change an extra field**: just change it. It's saved a moment after you stop typing.
- **Correct the start time**: change **Start time**, for example if you forgot to press START when you began.
- **Stop at an earlier time**: fill in **End time**. This stops the timer at that time.

### 7.3 Stop the timer

1. Click **STOP**. Anything you changed but that wasn't saved yet is saved first, so nothing gets lost.
2. The row in Notion gets its end time and the status **Done**. If you chose rounding, the start and end are rounded, and every entry lasts at least one rounding step.

You can also stop the timer:
- **Windows**: right-click the tray icon and choose **Stop timer**.
- **Android**: tap **Stop** in the notification, even when the app is closed.

### 7.4 Other things on the timer screen

- **Active timers** lists timers that are running in Notion, for example one you started on your phone. Click one to continue it here.
- **Recent time entries** lists your last finished entries. Click the play button next to one to start a new timer with the same details.
- The refresh button at the bottom (Windows) or top (Android) reloads both lists. They also refresh by themselves every minute.

If a timer is stopped on another device, this device notices within a minute and clears it with the message **Timer was stopped on another device.**

---

## 8. Presets: start a timer in one click

A *preset* remembers a workspace, a description and extra field values, and starts a timer with them in one click. Handy for things you do often, like a daily stand-up meeting.

### 8.1 Create a preset

1. On the timer screen, choose the workspace, type the description and fill in the extra fields you want the preset to remember.
2. Click the bookmark button next to **START**. The **Save Preset** window opens.
3. Type a title, for example `Stand-up`. The title is what the preset button shows, so **Save** only works once you've typed one.
4. Click **Save**.

### 8.2 Use a preset

Your presets appear as buttons at the top of the timer screen, labelled with their title, for example **Stand-up**, in the colour of their workspace. A label too long for one line ends in "…"; on Windows, hold the mouse over it to see the full name.

1. Click a preset button. The timer starts immediately with the preset's details.
2. If a timer is already running, the app asks **Timer already running**. Click **Stop & start new** to stop the old one and start the preset, or **Cancel**.

Preset buttons only appear after you've added your Notion key.

You can also start presets without opening the app:
- **Windows**: right-click the tray icon. Your first ten presets are listed there.
- **Android**: press and hold the app icon on your home screen. Up to four presets appear as shortcuts.

### 8.3 Reorder or delete presets

1. Click the pencil button after the preset buttons. The **Manage Presets** window opens.
2. Use the up and down arrows to change the order, or the bin icon to delete a preset.
3. Click **Dismiss** to close the window.

---

## 9. Use the same settings on all your devices

Instead of setting up every device by hand, you can keep your settings on a Notion page that all your devices read. This copies your workspaces, extra fields, presets, rounding, colours, appearance, language and date/time format. Your Notion key is **not** copied, for safety: you paste it on each device yourself ([6.1](#61-add-your-key)). Device-specific choices such as **Keep window on top** and **Start with Windows** also stay on each device.

### 9.1 On your first device: create the sync page

1. In **Settings**, under **Sync**, click **Create new**.
2. Under **Page title**, type a name, for example `Time Tracker settings`.
3. Choose the page the sync page should go in, for example `Time tracking`: under **Create inside** on Windows, or in the **Select a page…** list on Android. This page must be connected to your key ([3.2](#32-let-the-key-open-your-time-tracking-page)).
4. Click **Create**. The message **Sync page created** appears, and the sync section now says **Synced with "Time Tracker settings"**.

### 9.2 On every other device: attach to it

1. Add your Notion key on this device ([6.1](#61-add-your-key)).
2. In **Settings**, under **Sync**, click **Load existing**.
3. Choose `Time Tracker settings` and click **Attach**. Your workspaces and presets appear within a few seconds.

From now on, a change on one device reaches the others within about a minute. If you changed the same thing on two devices, the most recent change wins.

---

## 10. Solving problems

| What you see | What to do |
|---|---|
| **Connection failed** after **Test connection & save** | Copy the key again from the Developer portal ([3.1](#31-create-the-key), step 8) and make sure there are no spaces before or after it. |
| **No databases found** when adding a workspace | The key can't see your page yet. Follow [3.2](#32-let-the-key-open-your-time-tracking-page), then click **Refresh**. |
| **Fill in required fields before stopping.** | Fill in the fields marked in red, then click **STOP** again. |
| **Page not found in Notion** | The entry was deleted in Notion. Click **Dismiss**. To keep it, restore the page from Notion's **Trash** in the sidebar. |
| The Windows app seems closed but won't open again | It's still running in the system tray. Click the **^** arrow next to the clock, right-click the Time Tracker icon and choose **Open**. |
| **Windows protected your PC** when installing | Click **More info**, then **Run anyway** ([4.2](#42-install-the-app)). |
| **App not installed** on Android | Allow installing from your file manager ([5.2](#52-install-the-app), step 2). If you built the app yourself before, uninstall that copy first. Open the APK from the **Files** app, not from a browser. |
| No notification on Android | On the phone, open **Settings** → **Apps** → **Time Tracker** → **Notifications** and switch them on. |
| No preset shortcuts on Android | Press and hold the app icon. Shortcuts appear after you've created at least one preset and opened the app once. |

---

## 11. For developers

This chapter is for people who want to change the app's code.

### 11.1 Windows app

Built with Electron, React, Vite, Tailwind CSS and Zustand.

To run it while you work on it:

1. Install the **LTS** version of [Node.js](https://nodejs.org).
2. In File Explorer, open the project's `windows` folder.
3. Right-click an empty spot in the folder and choose **Open in Terminal**. A terminal window opens, already pointing at this folder.
4. Type `npm install` and press **Enter**. Wait until it finishes (the first time takes a minute).
5. Type `npm run dev` and press **Enter**. The app opens; changes to the code show up straight away.

Other commands, typed in the same terminal:

| Type this | What it does |
|---|---|
| `npm test` | Runs the unit tests (rounding, formatting, colours, Notion values, store). |
| `npm run icons` | Regenerates the app and tray icons in `assets/` and the Android launcher icon, all from one vector design. |
| `npm run dist` | Builds the installer into the `release` folder next to the `windows` folder. |

```
windows/
├── electron/
│   ├── main.cjs           # Main process: window, tray, IPC, presets in tray menu
│   ├── preload.cjs        # contextBridge: safe API exposed to the renderer
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

The Notion key is stored in the app's settings file on the PC. That file is obfuscated, not strongly encrypted: anyone with access to the PC and this source code can read it.

### 11.2 Android app

Built with Kotlin and Jetpack Compose. It mirrors the Windows app feature for feature, with a foreground notification instead of the tray icon.

| Component | Choice |
|---|---|
| UI | Jetpack Compose + Material 3 (Material You) |
| State | ViewModel + StateFlow |
| Storage | DataStore (Preferences) + EncryptedSharedPreferences (API key) |
| HTTP | OkHttp + Gson |
| Background | Foreground service with an ongoing notification |
| Min / target SDK | 26 (Android 8) / 36 (Android 16) |

To work on it, open the `android` folder in Android Studio (**File** → **Open**, choose the `android` folder, click **OK**). If Android Studio says the project needs syncing, click **Sync Now**. The app targets Android 16 (API level 36); install that SDK platform under **Tools** → **SDK Manager** if it's missing.

To build a debug APK, choose **Build** → **Build APK(s)**, or run `gradlew.bat assembleDebug` (`./gradlew assembleDebug` on macOS or Linux) in the `android` folder. The APK lands in `android/app/build/outputs/apk/debug/`. Signed APKs come only from the release workflow ([11.3](#113-publishing-a-release)).

```
android/app/src/main/
├── AndroidManifest.xml
├── java/com/impca201/notiontimetracker/
│   ├── MainActivity.kt          # Entry point, handles shortcut intents
│   ├── NotionTimeTrackerApp.kt  # Application class
│   ├── ShortcutHelper.kt        # Home-screen shortcuts for presets
│   ├── data/
│   │   ├── models/Models.kt               # Workspace, ActiveTimer, Preset, ExtraProp, …
│   │   ├── api/NotionClient.kt            # OkHttp Notion REST client
│   │   └── repository/
│   │       ├── SettingsRepository.kt      # DataStore + EncryptedSharedPreferences
│   │       ├── SettingsSyncer.kt          # Pull-or-push against the Notion sync page
│   │       └── NotionRepository.kt
│   ├── service/TimerForegroundService.kt  # Ongoing notification, stop action
│   ├── ui/
│   │   ├── theme/                         # Material 3 theme + workspace colours
│   │   ├── screens/                       # TimerScreen.kt, SettingsScreen.kt
│   │   └── components/                    # SearchableDropdown, ExtraFieldInput, WorkspaceModal, EditTimerModal
│   └── viewmodel/
│       ├── TimerViewModel.kt              # Timer state, rounding, start/stop, presets
│       └── SettingsViewModel.kt           # API key, workspaces
└── res/
    ├── values/strings.xml                 # English (UK)
    └── values-{nl,fr,de,es,it}/           # Dutch, French, German, Spanish, Italian
```

### 11.3 Publishing a release

GitHub builds both apps and attaches them to a release whenever you push a version tag. The workflow is in `.github/workflows/release.yml`.

**One time: give GitHub your Android signing key.** Android only updates an installed app when the new APK is signed with the same key, so every release must use the same keystore. Keep a backup of it; a lost key means users must uninstall before installing the next version.

1. Create a keystore (skip if you already have one):
   `keytool -genkeypair -v -keystore timetracker.jks -keyalg RSA -keysize 2048 -validity 10000 -alias timetracker`
2. Turn it into text: on Windows PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("timetracker.jks")) | Set-Clipboard`, on macOS or Linux `base64 -w0 timetracker.jks`.
3. On GitHub, open the repository's **Settings > Secrets and variables > Actions** and add four repository secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The text from step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | The alias, for example `timetracker` |
| `ANDROID_KEY_PASSWORD` | The key password (the same as the keystore password unless you set a different one) |

**Every release:** open **Actions > Release > Run workflow**, set **Release** to `patch` (1.0.1 to 1.0.2), `minor` (1.0.1 to 1.1.0) or `major` (1.0.1 to 2.0.0), and click **Run workflow**. It picks the next version after the latest tag, builds both apps and publishes the release with that tag.

You can also push a tag that looks like `v1.2.0` yourself:

```
git tag v1.2.0
git push origin v1.2.0
```

The **Actions** tab shows the build. When it finishes, the **Releases** page has `Time Tracker for Notion Setup 1.2.0.exe` and `TimeTracker-1.2.0.apk`. The tag sets the version shown in both apps; the Android version code is `major × 10000 + minor × 100 + patch`, so each new tag must be higher than the last.

To try a build without publishing, run the same workflow with **Release** left at `none`. The files appear under **Artifacts** on that run. Without the signing secrets, that run makes a debug APK instead.

The Windows installer isn't code-signed, so Windows SmartScreen shows **Windows protected your PC** the first time. Click **More info > Run anyway**.

---

## 12. Sources

- Notion Developers: [Internal connections](https://developers.notion.com/guides/get-started/internal-connections), how to create a connection and copy its access token
- Notion Developers: [Internal integrations](https://developers.notion.com/guides/get-started/internal-integrations), the same steps under the older names
- Notion Help: [Add & manage connections](https://www.notion.com/help/add-and-manage-connections-with-the-api), how to give a connection access to a page
- Notion release notes, [13 May 2026](https://www.notion.com/releases/2026-05-13): the Developer portal at app.notion.com/developers
- Notion Help: [Intro to databases](https://www.notion.com/help/intro-to-databases)
- Node.js: [nodejs.org](https://nodejs.org)
- Android Developers: [Install Android Studio](https://developer.android.com/studio/install)
