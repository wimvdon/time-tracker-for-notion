package com.impca201.notiontimetracker.data.repository

import com.impca201.notiontimetracker.data.api.NotionClient
import com.impca201.notiontimetracker.data.models.*

class NotionRepository(
    private val settingsRepository: SettingsRepository,
    private val client: NotionClient = NotionClient()
) {
    private fun apiKey() = settingsRepository.getApiKey()

    suspend fun testConnection(dbId: String? = null) =
        client.testConnection(apiKey(), dbId)

    suspend fun testConnectionWithKey(explicitKey: String, dbId: String? = null) =
        client.testConnection(explicitKey, dbId)

    suspend fun searchDatabases(): List<NamedOption> =
        client.searchDatabases(apiKey())

    suspend fun getDatabaseSchema(dbId: String): Map<String, SchemaProperty> =
        client.getDatabaseSchema(apiKey(), dbId)

    suspend fun fetchDatabasePages(dbId: String): List<NamedOption> =
        client.fetchDatabasePages(apiKey(), dbId)

    suspend fun listUsers(): List<NamedOption> =
        client.listUsers(apiKey())

    suspend fun fetchRunningTimers(
        dbId: String,
        statusProp: String,
        statusRunning: String,
        dateProp: String
    ): List<RunningTimerResult> = client.fetchRunningTimers(apiKey(), dbId, statusProp, statusRunning, dateProp)

    suspend fun createTimeEntry(
        dbId: String,
        title: String,
        startISO: String,
        projectId: String?,
        propertyMap: PropertyMap,
        extra: Map<String, Any?> = emptyMap()
    ): String = client.createTimeEntry(apiKey(), dbId, title, startISO, projectId, propertyMap, extra)

    suspend fun stopTimeEntry(
        pageId: String,
        startISO: String,
        endISO: String,
        propertyMap: PropertyMap
    ) = client.stopTimeEntry(apiKey(), pageId, startISO, endISO, propertyMap)

    suspend fun fetchRecentEntries(
        dbId: String,
        statusProp: String,
        statusDone: String,
        dateProp: String
    ): List<RecentEntryResult> = client.fetchRecentEntries(apiKey(), dbId, statusProp, statusDone, dateProp)

    suspend fun updatePageProperties(pageId: String, properties: Map<String, Any?>) =
        client.updatePageProperties(apiKey(), pageId, properties)

    suspend fun fetchPageProperties(pageId: String) =
        client.fetchPageProperties(apiKey(), pageId)

    suspend fun deletePage(pageId: String) = client.deletePage(apiKey(), pageId)

    suspend fun searchPages(): List<NamedOption> = client.searchPages(apiKey())

    suspend fun createSyncPage(parentPageId: String, title: String, payload: SyncPayload): String =
        client.createSyncPage(apiKey(), parentPageId, title, payload)

    suspend fun fetchSyncPageContent(pageId: String): SyncFetchResult? =
        client.fetchSyncPageContent(apiKey(), pageId)

    suspend fun updateSyncBlock(blockId: String, payload: SyncPayload) =
        client.updateSyncBlock(apiKey(), blockId, payload)
}
