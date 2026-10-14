package com.impca201.notiontimetracker

import android.app.Application
import com.impca201.notiontimetracker.data.repository.NotionRepository
import com.impca201.notiontimetracker.data.repository.SettingsRepository
import com.impca201.notiontimetracker.data.repository.SettingsSyncer

class NotionTimeTrackerApp : Application() {
    lateinit var settingsRepository: SettingsRepository
    lateinit var notionRepository: NotionRepository
    lateinit var settingsSyncer: SettingsSyncer

    override fun onCreate() {
        super.onCreate()
        settingsRepository = SettingsRepository(this)
        notionRepository = NotionRepository(settingsRepository)
        settingsSyncer = SettingsSyncer(settingsRepository, notionRepository)
    }
}
