package com.impca201.notiontimetracker

import android.app.Application
import com.impca201.notiontimetracker.data.api.AuthClient
import com.impca201.notiontimetracker.data.repository.NotionRepository
import com.impca201.notiontimetracker.data.repository.NotionSession
import com.impca201.notiontimetracker.data.repository.SettingsRepository
import com.impca201.notiontimetracker.data.repository.SettingsSyncer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers

class NotionTimeTrackerApp : Application() {
    lateinit var settingsRepository: SettingsRepository
    lateinit var notionSession: NotionSession
    lateinit var notionRepository: NotionRepository
    lateinit var settingsSyncer: SettingsSyncer

    /** For work that must finish even when the screen that started it is gone (finishing a sign-in). */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onCreate() {
        super.onCreate()
        settingsRepository = SettingsRepository(this)
        settingsRepository.removeLegacyApiKey()
        notionSession = NotionSession(settingsRepository, AuthClient())
        notionRepository = NotionRepository(notionSession)
        settingsSyncer = SettingsSyncer(settingsRepository, notionRepository)
    }
}
