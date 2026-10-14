# Privacy policy

_Last updated: 2026-10-14_

Time Tracker for Notion (Windows and Android) has no analytics, advertising or crash reporting, and no server of its own.

## What the apps send, and to whom

- **Notion only (api.notion.com).** The apps use your Notion integration token (API key) to read the databases and pages you shared with that integration, and to create and update time entries in them. When you use settings sync, they also read and write one Notion page that holds your workspaces and presets. Nothing is sent anywhere else.
- Links you open from the app (for example a time entry in Notion) open in your browser or the Notion app, under Notion's privacy policy.

## What the apps store on your device

- **Your Notion API key**, encrypted: on Windows with Windows' own data protection (only your Windows user on that PC can read it); on Android with the Android Keystore (`EncryptedSharedPreferences`). If encryption is not available on a device, the key is kept unencrypted in the app's private storage so the app keeps working.
- **Your settings**: workspaces (database IDs, property names, presets), the running timer, theme, language, window options, and the ID of the sync page.

Windows keeps this in `%APPDATA%\Time Tracker for Notion` (the Dev test build in `%APPDATA%\Time Tracker for Notion Dev`). Android keeps it in the app's private storage. The API key is excluded from Android's cloud backup and device-to-device transfer; your other settings can be included in Android's backup if you turned that on.

Uninstalling the Android app deletes everything. The Windows uninstaller keeps your settings folder, so a reinstall picks up where you left off; delete the folder above to remove them.

## Permissions (Android)

- **Internet**: to talk to Notion.
- **Notifications** and a **foreground service**: to show the running timer with a Stop button while it runs.

If this changes, this file will be updated **before** the change is released.

Questions: open an issue at https://github.com/wimvdon/time-tracker-for-notion/issues.
