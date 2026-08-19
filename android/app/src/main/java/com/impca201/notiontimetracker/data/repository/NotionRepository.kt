package com.impca201.notiontimetracker.data.repository

import com.impca201.notiontimetracker.data.api.NotionClient
import com.impca201.notiontimetracker.data.models.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class NotionRepository(
    private val settingsRepository: SettingsRepository,
    private val client: NotionClient = NotionClient()
) {
    private fun apiKey() = settingsRepository.getApiKey()

    // ---- Metadata cache ----
    //
    // Database schemas, related-database entries and the user list describe the
    // Notion setup, not the time entries themselves, so they barely change while
    // the app is open — but they were refetched on every single workspace switch.
    // That both slowed switching down and made bursts of calls run into Notion's
    // rate limit, which surfaced as fields with no options (or no fields at all).
    // Entries are served from cache while fresh, and a stale copy is still served
    // when a refetch fails: showing the last known schema beats showing none.

    private class CacheEntry<T>(val value: T, val fetchedAt: Long)

    private val cacheMutex = Mutex()
    private val schemaCache = mutableMapOf<String, CacheEntry<Map<String, SchemaProperty>>>()
    private val databasePagesCache = mutableMapOf<String, CacheEntry<List<NamedOption>>>()
    private val usersCache = mutableMapOf<String, CacheEntry<List<NamedOption>>>()

    private suspend fun <T> cached(
        cache: MutableMap<String, CacheEntry<T>>,
        key: String,
        forceRefresh: Boolean,
        fetch: suspend () -> T
    ): T {
        if (!forceRefresh) {
            val hit = cacheMutex.withLock { cache[key] }
            if (hit != null && System.currentTimeMillis() - hit.fetchedAt < CACHE_TTL_MS) return hit.value
        }
        return try {
            val fresh = fetch()
            cacheMutex.withLock { cache[key] = CacheEntry(fresh, System.currentTimeMillis()) }
            fresh
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            (cacheMutex.withLock { cache[key] } ?: throw e).value
        }
    }

    /** Drops every cached schema/option list — call after the API key changes or
     *  a workspace's database configuration is edited. */
    suspend fun invalidateMetadataCache() {
        cacheMutex.withLock {
            schemaCache.clear()
            databasePagesCache.clear()
            usersCache.clear()
        }
    }

    suspend fun testConnection(dbId: String? = null) =
        client.testConnection(apiKey(), dbId)

    suspend fun testConnectionWithKey(explicitKey: String, dbId: String? = null) =
        client.testConnection(explicitKey, dbId)

    suspend fun searchDatabases(): List<NamedOption> =
        client.searchDatabases(apiKey())

    suspend fun getDatabaseSchema(dbId: String, forceRefresh: Boolean = false): Map<String, SchemaProperty> =
        cached(schemaCache, dbId, forceRefresh) { client.getDatabaseSchema(apiKey(), dbId) }

    suspend fun fetchDatabasePages(dbId: String, forceRefresh: Boolean = false): List<NamedOption> =
        cached(databasePagesCache, dbId, forceRefresh) { client.fetchDatabasePages(apiKey(), dbId) }

    suspend fun listUsers(forceRefresh: Boolean = false): List<NamedOption> =
        cached(usersCache, "users", forceRefresh) { client.listUsers(apiKey()) }

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

    companion object {
        /** How long a cached schema/option list counts as fresh. */
        private const val CACHE_TTL_MS = 60_000L
    }
}
