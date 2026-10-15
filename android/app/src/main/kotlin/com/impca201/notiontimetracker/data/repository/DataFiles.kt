package com.impca201.notiontimetracker.data.repository

/**
 * Names of the stored files. Only [SETTINGS] goes into Android's backup and phone-to-phone
 * transfer (`res/xml/data_extraction_rules.xml`, `res/xml/backup_rules.xml`, checked by
 * `BackupRulesTest`).
 */
object DataFiles {
    /** Workspaces, presets, the active timer and preferences (DataStore). Backed up. */
    const val SETTINGS = "notion_settings"

    /** The Notion API key (EncryptedSharedPreferences). Never leaves this phone. */
    const val API_KEY = "NotionTimeTracker_encrypted_prefs"

    /** Used only when the Android keystore fails. Never leaves this phone. */
    const val API_KEY_FALLBACK = "NotionTimeTracker_plain_fallback_prefs"

    /** Where DataStore keeps a file, relative to the app's files folder (backup rules use this). */
    fun dataStorePath(name: String) = "datastore/$name.preferences_pb"
}
