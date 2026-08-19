package com.impca201.notiontimetracker.data.repository

import com.impca201.notiontimetracker.data.models.SyncPayload
import com.impca201.notiontimetracker.data.models.ThemeMode
import kotlinx.coroutines.flow.first

/**
 * Reads/writes the Notion sync page's JSON code block. Shared by the Settings
 * screen (explicit create/load/sync actions) and TimerViewModel's periodic
 * refresh, so the pull-or-push algorithm only lives in one place.
 */
class SettingsSyncer(
    private val settingsRepo: SettingsRepository,
    private val notionRepo: NotionRepository
) {
    private fun themeModeToSyncString(mode: ThemeMode) = when (mode) {
        ThemeMode.LIGHT -> "light"
        ThemeMode.DARK -> "dark"
        ThemeMode.AUTO -> "auto"
    }

    private fun syncStringToThemeMode(value: String) = when (value.lowercase()) {
        "light" -> ThemeMode.LIGHT
        "dark" -> ThemeMode.DARK
        else -> ThemeMode.AUTO
    }

    suspend fun buildPayload(updatedAt: String): SyncPayload = SyncPayload(
        updatedAt = updatedAt,
        workspaces = settingsRepo.getWorkspaces(),
        theme = themeModeToSyncString(settingsRepo.themeModeFlow.first()),
        locale = settingsRepo.localeFlow.first(),
        dateFormat = settingsRepo.dateFormatFlow.first(),
        timeFormat = settingsRepo.timeFormatFlow.first(),
        showNotionLink = settingsRepo.showNotionLinkFlow.first(),
        showArchiveAction = settingsRepo.showArchiveActionFlow.first()
    )

    suspend fun applyPayload(payload: SyncPayload) {
        settingsRepo.saveWorkspaces(payload.workspaces)
        payload.theme?.let { settingsRepo.saveThemeMode(syncStringToThemeMode(it)) }
        payload.locale?.let { settingsRepo.saveLocale(it) }
        payload.dateFormat?.let { settingsRepo.saveDateFormat(it) }
        payload.timeFormat?.let { settingsRepo.saveTimeFormat(it) }
        payload.showNotionLink?.let { settingsRepo.saveShowNotionLink(it) }
        payload.showArchiveAction?.let { settingsRepo.saveShowArchiveAction(it) }
        // A pulled payload can point workspaces at other databases; anything cached
        // describes the previous configuration.
        notionRepo.invalidateMetadataCache()
    }

    /** Pull-or-push against the configured sync page, whichever side is newer.
     * Returns false if no sync page is configured or it no longer has valid
     * sync data. */
    suspend fun syncNow(): Boolean {
        val pageId = settingsRepo.getSyncPageId() ?: return false
        val result = notionRepo.fetchSyncPageContent(pageId) ?: return false
        val localUpdatedAt = settingsRepo.getSettingsUpdatedAt() ?: ""
        val lastSyncedAt = settingsRepo.getLastSyncedUpdatedAt()
        if (result.payload.updatedAt > localUpdatedAt) {
            applyPayload(result.payload)
            settingsRepo.saveSettingsUpdatedAt(result.payload.updatedAt)
            settingsRepo.saveLastSyncedUpdatedAt(result.payload.updatedAt)
        } else if (localUpdatedAt.isNotBlank() && localUpdatedAt != lastSyncedAt) {
            notionRepo.updateSyncBlock(result.blockId, buildPayload(localUpdatedAt))
            settingsRepo.saveLastSyncedUpdatedAt(localUpdatedAt)
        }
        return true
    }
}
