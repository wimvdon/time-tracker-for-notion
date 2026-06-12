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
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.impca201.notiontimetracker.data.models.ActiveTimer
import com.impca201.notiontimetracker.data.models.Workspace
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "notion_settings")

class SettingsRepository(private val context: Context) {

    private val gson = Gson()

    private val WORKSPACES_KEY = stringPreferencesKey("workspaces_json")
    private val LAST_WORKSPACE_KEY = stringPreferencesKey("last_workspace_id")
    private val ACTIVE_TIMER_KEY = stringPreferencesKey("active_timer_json")

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
        val json = prefs[WORKSPACES_KEY] ?: return@map emptyList()
        runCatching {
            val type = object : TypeToken<List<Workspace>>() {}.type
            gson.fromJson<List<Workspace>>(json, type)
        }.getOrDefault(emptyList())
    }

    suspend fun getWorkspaces(): List<Workspace> = workspacesFlow.first()

    suspend fun saveWorkspaces(workspaces: List<Workspace>) {
        context.dataStore.edit { prefs ->
            prefs[WORKSPACES_KEY] = gson.toJson(workspaces)
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
        val json = prefs[ACTIVE_TIMER_KEY]?.takeIf { it.isNotBlank() } ?: return@map null
        runCatching { gson.fromJson(json, ActiveTimer::class.java) }.getOrNull()
    }

    suspend fun getActiveTimer(): ActiveTimer? = activeTimerFlow.first()

    suspend fun saveActiveTimer(timer: ActiveTimer) {
        context.dataStore.edit { prefs ->
            prefs[ACTIVE_TIMER_KEY] = gson.toJson(timer)
        }
    }

    suspend fun clearActiveTimer() {
        context.dataStore.edit { prefs ->
            prefs[ACTIVE_TIMER_KEY] = ""
        }
    }
}
