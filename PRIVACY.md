# Privacy policy

_Last updated: 2026-10-31_

Time Tracker for Notion (Windows and Android) has no analytics, advertising or crash reporting. Its only server of its own is the sign-in server described below, which stores nothing.

## What the apps send, and to whom

- **Notion (api.notion.com).** When you sign in with Notion, you choose on Notion's own page which pages and databases the app may use. The apps then read those, and create and update time entries in them. When you use settings sync, they also read and write one Notion page that holds your workspaces and presets.
- **The sign-in server (timetracker-signin.wim.to)**, a small Cloudflare Worker run for this app. It is used only while you sign in, and when Notion asks the app to renew its sign-in (roughly when it expires). It receives Notion's one-time sign-in code or the app's renewal token, passes it to Notion together with the app's own secret, and returns Notion's answer (your new sign-in and the name of your Notion workspace) to the app. It stores nothing and keeps no logs of its own. Cloudflare, which runs it, sees the request like any web host does (for example your IP address), under [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
- Nothing is sent anywhere else.
- Links you open from the app (for example a time entry in Notion) open in your browser or the Notion app, under Notion's privacy policy.

## What the apps store on your device

- **Your Notion sign-in** (the tokens Notion gave the app, and your workspace's name), encrypted: on Windows with Windows' own data protection (only your Windows user on that PC can read it); on Android with the Android Keystore (`EncryptedSharedPreferences`). If encryption is not available on a device, it is kept unencrypted in the app's private storage so the app keeps working. **Sign out** in Settings deletes it. An API key saved by an older version is deleted when you update.
- **Your settings**: workspaces (database IDs, property names, presets), the running timer, theme, language, window options, and the ID of the sync page.

Windows keeps this in `%APPDATA%\Time Tracker for Notion` (the Dev test build in `%APPDATA%\Time Tracker for Notion Dev`). Android keeps it in the app's private storage. Your Notion sign-in is excluded from Android's cloud backup and device-to-device transfer; your other settings can be included in Android's backup if you turned that on.

Uninstalling the Android app deletes everything. The Windows uninstaller keeps your settings folder, so a reinstall picks up where you left off; delete the folder above to remove them.

## Permissions (Android)

- **Internet**: to talk to Notion and, while signing in, the sign-in server.
- **Notifications** and a **foreground service**: to show the running timer with a Stop button while it runs.

If this changes, this file will be updated **before** the change is released.

Questions: open an issue at https://github.com/wimvdon/time-tracker-for-notion/issues.
