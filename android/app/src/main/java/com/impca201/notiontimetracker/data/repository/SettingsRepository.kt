package com.impca201.notiontimetracker.data.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.impca201.notiontimetracker.data.models.ActiveTimer
import com.impca201.notiontimetracker.data.models.ThemeMode
import com.impca201.notiontimetracker.data.models.Workspace
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "notion_settings")

class SettingsRepository(private val context: Context) {

    // kotlinx.serialization (not Gson): applies @Serializable defaults for missing
    // fields and ignores unknown keys, so workspaces saved by older versions
    // (e.g. before `color`/`presets` existed) deserialize without crashing.
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val WORKSPACES_KEY = stringPreferencesKey("workspaces_json")
    private val LAST_WORKSPACE_KEY = stringPreferencesKey("last_workspace_id")
    private val ACTIVE_TIMER_KEY = stringPreferencesKey("active_timer_json")
    private val THEME_MODE_KEY = stringPreferencesKey("theme_mode")
    private val DYNAMIC_COLOR_KEY = booleanPreferencesKey("dynamic_color")
    private val LOCALE_KEY = stringPreferencesKey("locale")
    private val DATE_FORMAT_KEY = stringPreferencesKey("date_format")
    private val TIME_FORMAT_KEY = stringPreferencesKey("time_format")
    private val SHOW_NOTION_LINK_KEY = booleanPreferencesKey("show_notion_link")
    private val SHOW_ARCHIVE_ACTION_KEY = booleanPreferencesKey("show_archive_action")
    private val SYNC_PAGE_ID_KEY = stringPreferencesKey("sync_page_id")
    private val SYNC_PAGE_TITLE_KEY = stringPreferencesKey("sync_page_title")
    private val SETTINGS_UPDATED_AT_KEY = stringPreferencesKey("settings_updated_at")
    private val LAST_SYNCED_UPDATED_AT_KEY = stringPreferencesKey("last_synced_updated_at")

    private val encryptedPrefs: SharedPreferences by lazy {
        runCatching {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "NotionTimeTracker_encrypted_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }.getOrElse { e ->
            android.util.Log.e("SettingsRepository", "EncryptedSharedPreferences creation failed, falling back", e)
            runCatching {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                    context.deleteSharedPreferences("NotionTimeTracker_encrypted_prefs")
                } else {
                    context.getSharedPreferences("NotionTimeTracker_encrypted_prefs", Context.MODE_PRIVATE).edit().clear().apply()
                }
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    "NotionTimeTracker_encrypted_prefs",
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            }.getOrElse { e2 ->
                android.util.Log.e("SettingsRepository", "Recreation of EncryptedSharedPreferences failed, using plain fallback", e2)
                context.getSharedPreferences("NotionTimeTracker_plain_fallback_prefs", Context.MODE_PRIVATE)
            }
        }
    }

    fun getApiKey(): String = encryptedPrefs.getString("api_key", "") ?: ""

    fun saveApiKey(key: String) {
        encryptedPrefs.edit().putString("api_key", key).apply()
    }

    val workspacesFlow: Flow<List<Workspace>> = context.dataStore.data.map { prefs ->
        val stored = prefs[WORKSPACES_KEY] ?: return@map emptyList()
        runCatching {
            json.decodeFromString<List<Workspace>>(stored).map { it.withPresetTitles() }
        }.getOrDefault(emptyList())
    }

    suspend fun getWorkspaces(): List<Workspace> = workspacesFlow.first()

    suspend fun saveWorkspaces(workspaces: List<Workspace>) {
        context.dataStore.edit { prefs ->
            prefs[WORKSPACES_KEY] = json.encodeToString(workspaces)
        }
    }

    /** Applies [transform] to the stored workspaces in one atomic edit and
     *  returns the result. Edits made from a screen's own copy of the list
     *  wrote that whole copy back — undoing anything the sync (or another
     *  screen) had stored since that copy was taken. */
    suspend fun updateWorkspaces(transform: (List<Workspace>) -> List<Workspace>): List<Workspace> {
        var updated: List<Workspace> = emptyList()
        context.dataStore.edit { prefs ->
            val current = prefs[WORKSPACES_KEY]
                ?.let { runCatching { json.decodeFromString<List<Workspace>>(it) }.getOrNull() }
                ?.map { it.withPresetTitles() }
                ?: emptyList()
            updated = transform(current)
            prefs[WORKSPACES_KEY] = json.encodeToString(updated)
        }
        return updated
    }

    val lastWorkspaceIdFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[LAST_WORKSPACE_KEY]
    }

    suspend fun saveLastWorkspaceId(id: String) {
        context.dataStore.edit { prefs ->
            prefs[LAST_WORKSPACE_KEY] = id
        }
    }

    val activeTimerFlow: Flow<ActiveTimer?> = context.dataStore.data.map { prefs ->
        val stored = prefs[ACTIVE_TIMER_KEY]?.takeIf { it.isNotBlank() } ?: return@map null
        runCatching { json.decodeFromString<ActiveTimer>(stored) }.getOrNull()
    }

    suspend fun getActiveTimer(): ActiveTimer? = activeTimerFlow.first()

    suspend fun saveActiveTimer(timer: ActiveTimer) {
        context.dataStore.edit { prefs ->
            prefs[ACTIVE_TIMER_KEY] = json.encodeToString(timer)
        }
    }

    suspend fun clearActiveTimer() {
        context.dataStore.edit { prefs ->
            prefs[ACTIVE_TIMER_KEY] = ""
        }
    }

    val themeModeFlow: Flow<ThemeMode> = context.dataStore.data.map { prefs ->
        when (prefs[THEME_MODE_KEY]) {
            "LIGHT" -> ThemeMode.LIGHT
            "DARK" -> ThemeMode.DARK
            else -> ThemeMode.AUTO
        }
    }

    val dynamicColorFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[DYNAMIC_COLOR_KEY] ?: false
    }

    suspend fun saveDynamicColor(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[DYNAMIC_COLOR_KEY] = enabled }
    }

    suspend fun saveThemeMode(mode: ThemeMode) {
        context.dataStore.edit { prefs -> prefs[THEME_MODE_KEY] = mode.name }
    }

    val localeFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[LOCALE_KEY] ?: "system"
    }

    suspend fun saveLocale(locale: String) {
        context.dataStore.edit { prefs -> prefs[LOCALE_KEY] = locale }
    }

    val dateFormatFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[DATE_FORMAT_KEY] ?: "DD/MM/YYYY"
    }

    suspend fun saveDateFormat(format: String) {
        context.dataStore.edit { prefs -> prefs[DATE_FORMAT_KEY] = format }
    }

    val timeFormatFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[TIME_FORMAT_KEY] ?: "24h"
    }

    suspend fun saveTimeFormat(format: String) {
        context.dataStore.edit { prefs -> prefs[TIME_FORMAT_KEY] = format }
    }

    // Global toggles for the per-entry Notion actions on active/recent timers.
    val showNotionLinkFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[SHOW_NOTION_LINK_KEY] ?: true
    }

    suspend fun saveShowNotionLink(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[SHOW_NOTION_LINK_KEY] = enabled }
    }

    val showArchiveActionFlow: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[SHOW_ARCHIVE_ACTION_KEY] ?: true
    }

    suspend fun saveShowArchiveAction(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[SHOW_ARCHIVE_ACTION_KEY] = enabled }
    }

    // ---- Notion-page sync ----

    val syncPageIdFlow: Flow<String?> = context.dataStore.data.map { prefs -> prefs[SYNC_PAGE_ID_KEY] }
    suspend fun getSyncPageId(): String? = syncPageIdFlow.first()

    val syncPageTitleFlow: Flow<String> = context.dataStore.data.map { prefs -> prefs[SYNC_PAGE_TITLE_KEY] ?: "" }

    val settingsUpdatedAtFlow: Flow<String?> = context.dataStore.data.map { prefs -> prefs[SETTINGS_UPDATED_AT_KEY] }
    suspend fun getSettingsUpdatedAt(): String? = settingsUpdatedAtFlow.first()

    val lastSyncedUpdatedAtFlow: Flow<String?> = context.dataStore.data.map { prefs -> prefs[LAST_SYNCED_UPDATED_AT_KEY] }
    suspend fun getLastSyncedUpdatedAt(): String? = lastSyncedUpdatedAtFlow.first()

    suspend fun saveSyncPage(pageId: String, title: String) {
        context.dataStore.edit { prefs ->
            prefs[SYNC_PAGE_ID_KEY] = pageId
            prefs[SYNC_PAGE_TITLE_KEY] = title
        }
    }

    suspend fun clearSyncPage() {
        context.dataStore.edit { prefs ->
            prefs.remove(SYNC_PAGE_ID_KEY)
            prefs.remove(SYNC_PAGE_TITLE_KEY)
            prefs.remove(LAST_SYNCED_UPDATED_AT_KEY)
        }
    }

    /** Bumped whenever a synced field changes locally, so sync knows this
     * device has edits that need pushing. */
    suspend fun touchSettingsUpdatedAt(): String {
        val now = syncTimestamp()
        context.dataStore.edit { prefs -> prefs[SETTINGS_UPDATED_AT_KEY] = now }
        return now
    }

    /**
     * "Now" in the exact shape the desktop app writes (`toISOString()`: UTC,
     * always three fraction digits). Both apps decide which side is newer by
     * comparing these strings, and `Instant.toString()` varies its precision —
     * it drops the fraction entirely on a whole second, and "…:05Z" sorts
     * after "…:05.300Z" although it is earlier.
     */
    fun syncTimestamp(): String = SYNC_TIMESTAMP_FORMAT.format(java.time.Instant.now())

    suspend fun saveSettingsUpdatedAt(value: String) {
        context.dataStore.edit { prefs -> prefs[SETTINGS_UPDATED_AT_KEY] = value }
    }

    suspend fun saveLastSyncedUpdatedAt(value: String) {
        context.dataStore.edit { prefs -> prefs[LAST_SYNCED_UPDATED_AT_KEY] = value }
    }

    private companion object {
        val SYNC_TIMESTAMP_FORMAT: java.time.format.DateTimeFormatter =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
                .withZone(java.time.ZoneOffset.UTC)
    }
}
