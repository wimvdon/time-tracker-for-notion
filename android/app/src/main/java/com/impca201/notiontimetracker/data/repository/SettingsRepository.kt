package com.impca201.notiontimetracker.data.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
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

    private val encryptedPrefs: SharedPreferences by lazy {
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
    }

    fun getApiKey(): String = encryptedPrefs.getString("api_key", "") ?: ""

    fun saveApiKey(key: String) {
        encryptedPrefs.edit().putString("api_key", key).apply()
    }

    val workspacesFlow: Flow<List<Workspace>> = context.dataStore.data.map { prefs ->
        val stored = prefs[WORKSPACES_KEY] ?: return@map emptyList()
        runCatching {
            json.decodeFromString<List<Workspace>>(stored)
        }.getOrDefault(emptyList())
    }

    suspend fun getWorkspaces(): List<Workspace> = workspacesFlow.first()

    suspend fun saveWorkspaces(workspaces: List<Workspace>) {
        context.dataStore.edit { prefs ->
            prefs[WORKSPACES_KEY] = json.encodeToString(workspaces)
        }
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

    suspend fun saveThemeMode(mode: ThemeMode) {
        context.dataStore.edit { prefs -> prefs[THEME_MODE_KEY] = mode.name }
    }
}
