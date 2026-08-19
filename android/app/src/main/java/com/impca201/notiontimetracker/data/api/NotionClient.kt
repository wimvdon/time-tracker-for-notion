package com.impca201.notiontimetracker.data.api

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.impca201.notiontimetracker.data.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

class NotionClient {
    private val BASE_URL = "https://api.notion.com/v1"
    private val NOTION_VERSION = "2022-06-28"
    private val gson = Gson()

    /**
     * Request bodies are serialised with nulls kept. Notion reads an explicit
     * `null` as "clear this" — `{"select": null}` empties a select, `{"end":
     * null}` removes a date's end — and Gson's default of dropping null map
     * entries turned those into `{}`, which Notion ignores. The plain [gson]
     * above still encodes the sync payload, where an absent key and a null one
     * have to stay distinguishable for the desktop app reading it back.
     */
    private val requestGson = com.google.gson.GsonBuilder().serializeNulls().create()

    private val JSON = "application/json".toMediaType()
    private val httpClient = OkHttpClient.Builder().build()

    /**
     * Notion allows roughly three requests per second per integration and answers
     * 429 once that is exceeded. Loading a workspace's fields fires several calls
     * at once (schema, related-database pages, users) on top of the running-timer
     * and recent-entry queries for every workspace, so a burst can easily hit that
     * ceiling. Retrying here — honouring Retry-After — keeps a throttled call from
     * surfacing as an empty schema or an empty option list further up.
     */
    private val maxAttempts = 4

    private suspend fun fetch(
        apiKey: String,
        method: String,
        endpoint: String,
        body: Any? = null
    ): JsonObject = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) throw Exception("No Notion API key configured. Add one in Settings.")

        val reqBody = when {
            body != null -> requestGson.toJson(body).toRequestBody(JSON)
            method != "GET" -> "{}".toRequestBody(JSON)
            else -> null
        }

        val request = Request.Builder()
            .url("$BASE_URL$endpoint")
            .header("Authorization", "Bearer $apiKey")
            .header("Notion-Version", NOTION_VERSION)
            .header("Content-Type", "application/json")
            .method(method, reqBody)
            .build()

        var lastError = Exception("Notion API error")
        repeat(maxAttempts) { attempt ->
            val response = httpClient.newCall(request).await()
            val responseBody = response.body?.string() ?: "{}"
            val data = runCatching { gson.fromJson(responseBody, JsonObject::class.java) }
                .getOrDefault(JsonObject())

            if (response.isSuccessful) return@withContext data

            lastError = Exception(
                data.get("message")?.asString ?: "Notion API error (HTTP ${response.code})"
            )
            val retryable = response.code == 429 || response.code >= 500
            if (!retryable || attempt == maxAttempts - 1) throw lastError

            val retryAfterMs = response.header("Retry-After")?.toDoubleOrNull()?.times(1000)?.toLong()
            delay((retryAfterMs ?: (500L shl attempt)).coerceIn(300L, 10_000L))
        }
        throw lastError
    }

    suspend fun testConnection(apiKey: String, dbId: String? = null) {
        if (!dbId.isNullOrBlank()) {
            fetch(apiKey, "POST", "/databases/$dbId/query", mapOf("page_size" to 1))
        } else {
            fetch(apiKey, "GET", "/users/me")
        }
    }

    suspend fun searchDatabases(apiKey: String): List<NamedOption> {
        val results = mutableListOf<NamedOption>()
        var cursor: String? = null
        do {
            val body = buildMap<String, Any> {
                put("filter", mapOf("value" to "database", "property" to "object"))
                put("sort", mapOf("direction" to "descending", "timestamp" to "last_edited_time"))
                put("page_size", 100)
                if (cursor != null) put("start_cursor", cursor!!)
            }
            val data = fetch(apiKey, "POST", "/search", body)
            data.getAsJsonArray("results")?.forEach { el ->
                val db = el.asJsonObject
                val name = db.getAsJsonArray("title")
                    ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" }
                    ?.trim()
                    ?.ifBlank { "(Untitled)" } ?: "(Untitled)"
                results.add(NamedOption(db.get("id").asString, name))
            }
            cursor = if (data.get("has_more")?.asBoolean == true)
                data.get("next_cursor")?.asString else null
        } while (cursor != null)
        return results
    }

    suspend fun getDatabaseSchema(apiKey: String, dbId: String): Map<String, SchemaProperty> {
        val data = fetch(apiKey, "GET", "/databases/$dbId")
        val props = data.getAsJsonObject("properties") ?: return emptyMap()
        return props.entrySet().associate { (name, el) ->
            val prop = el.asJsonObject
            val type = prop.get("type")?.asString ?: "rich_text"
            val statusOptions = if (type == "status") {
                prop.getAsJsonObject("status")
                    ?.getAsJsonArray("options")
                    ?.map { opt ->
                        val o = opt.asJsonObject
                        StatusOption(name = o.get("name")?.asString ?: "", color = o.get("color")?.asString ?: "")
                    } ?: emptyList()
            } else emptyList()
            val selectOptions = when (type) {
                "select" -> prop.getAsJsonObject("select")?.getAsJsonArray("options")
                    ?.map { opt -> val o = opt.asJsonObject; StatusOption(name = o.get("name")?.asString ?: "", color = o.get("color")?.asString ?: "") } ?: emptyList()
                "multi_select" -> prop.getAsJsonObject("multi_select")?.getAsJsonArray("options")
                    ?.map { opt -> val o = opt.asJsonObject; StatusOption(name = o.get("name")?.asString ?: "", color = o.get("color")?.asString ?: "") } ?: emptyList()
                else -> emptyList()
            }
            val relationDatabaseId = if (type == "relation")
                prop.getAsJsonObject("relation")?.get("database_id")?.asString else null
            name to SchemaProperty(name = name, type = type, statusOptions = statusOptions, selectOptions = selectOptions, relationDatabaseId = relationDatabaseId)
        }
    }

    suspend fun fetchDatabasePages(apiKey: String, dbId: String): List<NamedOption> {
        val results = mutableListOf<NamedOption>()
        var cursor: String? = null
        do {
            val body = buildMap<String, Any> {
                put("page_size", 100)
                put("sorts", listOf(mapOf("timestamp" to "last_edited_time", "direction" to "descending")))
                if (cursor != null) put("start_cursor", cursor!!)
            }
            val data = fetch(apiKey, "POST", "/databases/$dbId/query", body)
            data.getAsJsonArray("results")?.forEach { el ->
                val page = el.asJsonObject
                val propsObj = page.getAsJsonObject("properties") ?: return@forEach
                val titleProp = propsObj.entrySet()
                    .map { it.value.asJsonObject }
                    .firstOrNull { it.get("type")?.asString == "title" }
                // Entries without a title still have to be listed: a relation value
                // pointing at one would otherwise have no matching option and the
                // field would read as empty even though the page is linked.
                val name = titleProp?.getAsJsonArray("title")
                    ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" }
                    ?.trim()
                    ?.ifBlank { "(Untitled)" } ?: "(Untitled)"
                results.add(NamedOption(page.get("id").asString, name))
            }
            cursor = if (data.get("has_more")?.asBoolean == true)
                data.get("next_cursor")?.asString else null
        } while (cursor != null)
        return results
    }

    suspend fun listUsers(apiKey: String): List<NamedOption> {
        val results = mutableListOf<NamedOption>()
        var cursor: String? = null
        do {
            val endpoint = "/users?page_size=100" + if (cursor != null) "&start_cursor=$cursor" else ""
            val data = fetch(apiKey, "GET", endpoint)
            data.getAsJsonArray("results")?.forEach { el ->
                val user = el.asJsonObject
                if (user.get("type")?.asString == "person") {
                    val name = user.get("name")?.asString
                        ?: user.getAsJsonObject("person")?.get("email")?.asString
                        ?: user.get("id").asString
                    results.add(NamedOption(user.get("id").asString, name))
                }
            }
            cursor = if (data.get("has_more")?.asBoolean == true)
                data.get("next_cursor")?.asString else null
        } while (cursor != null)
        return results.sortedBy { it.name }
    }

    suspend fun createTimeEntry(
        apiKey: String,
        dbId: String,
        title: String,
        startISO: String,
        projectId: String?,
        propertyMap: PropertyMap,
        extra: Map<String, Any?> = emptyMap()
    ): String {
        val properties = mutableMapOf<String, Any>()
        extra.forEach { (k, v) -> if (v != null) properties[k] = v }

        properties[propertyMap.timeEntryTitleProp] = mapOf(
            "title" to listOf(mapOf("text" to mapOf("content" to title)))
        )
        properties[propertyMap.timeEntryDateProp] = mapOf(
            "date" to mapOf("start" to startISO, "end" to null)
        )
        properties[propertyMap.timeEntryStatusProp] = mapOf(
            "status" to mapOf("name" to propertyMap.timeEntryStatusRunning)
        )
        if (!projectId.isNullOrBlank() && propertyMap.timeEntryRelationProp.isNotBlank()) {
            properties[propertyMap.timeEntryRelationProp] = mapOf(
                "relation" to listOf(mapOf("id" to projectId))
            )
        }

        val data = fetch(apiKey, "POST", "/pages", mapOf(
            "parent" to mapOf("database_id" to dbId),
            "properties" to properties
        ))
        return data.get("id").asString
    }

    suspend fun fetchRunningTimers(
        apiKey: String,
        dbId: String,
        statusProp: String,
        statusRunning: String,
        dateProp: String
    ): List<RunningTimerResult> {
        val results = mutableListOf<RunningTimerResult>()
        var cursor: String? = null
        do {
            val body = buildMap<String, Any> {
                put("filter", mapOf("property" to statusProp, "status" to mapOf("equals" to statusRunning)))
                if (dateProp.isNotBlank()) {
                    put("sorts", listOf(mapOf("property" to dateProp, "direction" to "descending")))
                }
                put("page_size", 100)
                if (cursor != null) put("start_cursor", cursor!!)
            }
            val data = fetch(apiKey, "POST", "/databases/$dbId/query", body)
            data.getAsJsonArray("results")?.forEach { el ->
                val page = el.asJsonObject
                val propsObj = page.getAsJsonObject("properties") ?: return@forEach
                val titleProp = propsObj.entrySet()
                    .map { it.value.asJsonObject }
                    .firstOrNull { it.get("type")?.asString == "title" }
                val title = titleProp?.getAsJsonArray("title")
                    ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" }
                    ?.trim()?.ifBlank { "Untitled" } ?: "Untitled"
                val startISO = if (dateProp.isNotBlank())
                    propsObj.getAsJsonObject(dateProp)?.getAsJsonObject("date")?.get("start")?.asString
                else null
                startISO ?: return@forEach
                val url = page.get("url")?.asString ?: ""
                results.add(RunningTimerResult(pageId = page.get("id").asString, title = title, startISO = startISO, url = url))
            }
            cursor = if (data.get("has_more")?.asBoolean == true)
                data.get("next_cursor")?.asString else null
        } while (cursor != null)
        return results
    }

    suspend fun fetchRecentEntries(
        apiKey: String,
        dbId: String,
        statusProp: String,
        statusDone: String,
        dateProp: String
    ): List<RecentEntryResult> {
        val body = buildMap<String, Any> {
            put("filter", mapOf("property" to statusProp, "status" to mapOf("equals" to statusDone)))
            if (dateProp.isNotBlank()) {
                put("sorts", listOf(mapOf("property" to dateProp, "direction" to "descending")))
            }
            put("page_size", 15)
        }
        val data = fetch(apiKey, "POST", "/databases/$dbId/query", body)
        val results = mutableListOf<RecentEntryResult>()
        data.getAsJsonArray("results")?.forEach { el ->
            val page = el.asJsonObject
            val propsObj = page.getAsJsonObject("properties") ?: return@forEach
            val titleProp = propsObj.entrySet()
                .map { it.value.asJsonObject }
                .firstOrNull { it.get("type")?.asString == "title" }
            val title = titleProp?.getAsJsonArray("title")
                ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" }
                ?.trim()?.ifBlank { "Untitled" } ?: "Untitled"
            val datePropObj = if (dateProp.isNotBlank()) propsObj.getAsJsonObject(dateProp)?.getAsJsonObject("date") else null
            val startISO = datePropObj?.get("start")?.asString
            val endISO = datePropObj?.get("end")?.asString
            val url = page.get("url")?.asString ?: ""
            results.add(RecentEntryResult(pageId = page.get("id").asString, title = title, startISO = startISO, endISO = endISO, url = url))
        }
        return results
    }

    suspend fun updatePageProperties(apiKey: String, pageId: String, properties: Map<String, Any?>) {
        fetch(apiKey, "PATCH", "/pages/$pageId", mapOf("properties" to properties.filterValues { it != null }))
    }

    /** Fetches a page's raw `properties` object, used to restore extra-field
     *  values (e.g. connected project) when loading an already-running timer. */
    suspend fun fetchPageProperties(apiKey: String, pageId: String): JsonObject {
        val data = fetch(apiKey, "GET", "/pages/$pageId")
        return data.getAsJsonObject("properties") ?: JsonObject()
    }

    suspend fun deletePage(apiKey: String, pageId: String) {
        fetch(apiKey, "PATCH", "/pages/$pageId", mapOf("archived" to true))
    }

    suspend fun stopTimeEntry(
        apiKey: String,
        pageId: String,
        startISO: String,
        endISO: String,
        propertyMap: PropertyMap
    ) {
        fetch(apiKey, "PATCH", "/pages/$pageId", mapOf(
            "properties" to mapOf(
                propertyMap.timeEntryDateProp to mapOf(
                    "date" to mapOf("start" to startISO, "end" to endISO)
                ),
                propertyMap.timeEntryStatusProp to mapOf(
                    "status" to mapOf("name" to propertyMap.timeEntryStatusDone)
                )
            )
        ))
    }

    // ---- Settings sync (stores a JSON blob in a code block on a Notion page) ----

    private fun encodeSyncPayload(payload: SyncPayload): List<Map<String, Any>> {
        val json = gson.toJson(payload)
        val chunks = json.chunked(2000).ifEmpty { listOf("") }
        return chunks.map { mapOf("type" to "text", "text" to mapOf("content" to it)) }
    }

    /**
     * Returns all Notion pages the integration can access (for the "load
     * existing sync page" picker).
     */
    suspend fun searchPages(apiKey: String): List<NamedOption> {
        val results = mutableListOf<NamedOption>()
        var cursor: String? = null
        do {
            val body = buildMap<String, Any> {
                put("filter", mapOf("value" to "page", "property" to "object"))
                put("sort", mapOf("direction" to "descending", "timestamp" to "last_edited_time"))
                put("page_size", 100)
                if (cursor != null) put("start_cursor", cursor!!)
            }
            val data = fetch(apiKey, "POST", "/search", body)
            data.getAsJsonArray("results")?.forEach { el ->
                val page = el.asJsonObject
                val propsObj = page.getAsJsonObject("properties")
                val titleProp = propsObj?.entrySet()?.map { it.value.asJsonObject }
                    ?.firstOrNull { it.get("type")?.asString == "title" }
                val name = titleProp?.getAsJsonArray("title")
                    ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" }
                    ?.trim()?.ifBlank { "(Untitled)" } ?: "(Untitled)"
                results.add(NamedOption(page.get("id").asString, name))
            }
            cursor = if (data.get("has_more")?.asBoolean == true)
                data.get("next_cursor")?.asString else null
        } while (cursor != null)
        return results
    }

    /**
     * Creates a new Notion page as a child of [parentPageId] (movable/renamable
     * by the user afterward) containing the sync payload as a single JSON code
     * block. Internal integrations cannot create pages directly at the
     * workspace root (Notion's API rejects `parent.workspace`), so an existing
     * accessible page must be chosen as the parent.
     * @return the new page id
     */
    suspend fun createSyncPage(apiKey: String, parentPageId: String, title: String, payload: SyncPayload): String {
        val body = mapOf(
            "parent" to mapOf("page_id" to parentPageId),
            "properties" to mapOf(
                "title" to mapOf("title" to listOf(mapOf("text" to mapOf("content" to title))))
            ),
            "children" to listOf(
                mapOf(
                    "object" to "block",
                    "type" to "code",
                    "code" to mapOf("language" to "json", "rich_text" to encodeSyncPayload(payload))
                )
            )
        )
        val data = fetch(apiKey, "POST", "/pages", body)
        return data.get("id").asString
    }

    /**
     * Reads a page's children looking for the sync JSON code block.
     * @return the block id and decoded payload, or null if the page has no
     * valid sync data.
     */
    suspend fun fetchSyncPageContent(apiKey: String, pageId: String): SyncFetchResult? {
        val data = fetch(apiKey, "GET", "/blocks/$pageId/children?page_size=100")
        val results = data.getAsJsonArray("results") ?: return null
        for (el in results) {
            val block = el.asJsonObject
            if (block.get("type")?.asString != "code") continue
            val richText = block.getAsJsonObject("code")?.getAsJsonArray("rich_text") ?: continue
            val json = richText.joinToString("") { rt ->
                val rtObj = rt.asJsonObject
                rtObj.get("plain_text")?.asString
                    ?: rtObj.getAsJsonObject("text")?.get("content")?.asString
                    ?: ""
            }
            val payload = runCatching { gson.fromJson(json, SyncPayload::class.java) }.getOrNull()
            if (payload != null && payload.workspaces != null && !payload.updatedAt.isNullOrBlank()) {
                return SyncFetchResult(block.get("id").asString, sanitizeSyncPayload(payload))
            }
        }
        return null
    }

    /**
     * Gson decodes via reflection and bypasses Kotlin's null-safety: any field
     * missing from the incoming JSON — e.g. `extraProps[].type`, which the
     * Windows app never writes since it derives that from the live Notion
     * schema instead of storing it — becomes `null` at runtime despite the
     * non-nullable Kotlin type. Left alone, that null crashes later when
     * kotlinx.serialization re-persists it locally (it enforces non-null for
     * real). Normalize everything to safe defaults right after decoding so
     * cross-platform/older payloads can never carry that null further.
     */
    private fun sanitizeSyncPayload(payload: SyncPayload): SyncPayload =
        payload.copy(workspaces = payload.workspaces.map { ws ->
            ws.copy(
                id = ws.id ?: java.util.UUID.randomUUID().toString(),
                name = ws.name ?: "",
                timeEntriesDbId = ws.timeEntriesDbId ?: "",
                projectsDbId = ws.projectsDbId ?: "",
                color = ws.color ?: "",
                propertyMap = (ws.propertyMap ?: PropertyMap()).let { pm ->
                    pm.copy(
                        timeEntryTitleProp = pm.timeEntryTitleProp ?: "",
                        timeEntryDateProp = pm.timeEntryDateProp ?: "",
                        timeEntryStatusProp = pm.timeEntryStatusProp ?: "",
                        timeEntryStatusRunning = pm.timeEntryStatusRunning ?: "",
                        timeEntryRelationProp = pm.timeEntryRelationProp ?: "",
                        timeEntryStatusDone = pm.timeEntryStatusDone ?: ""
                    )
                },
                extraProps = (ws.extraProps ?: emptyList()).map { ep ->
                    ep.copy(propName = ep.propName ?: "", type = ep.type ?: "rich_text")
                },
                presets = (ws.presets ?: emptyList()).map { p ->
                    p.copy(
                        id = p.id ?: java.util.UUID.randomUUID().toString(),
                        name = p.name ?: "",
                        pageTitle = p.pageTitle ?: "",
                        extraValues = (p.extraValues ?: emptyMap()).mapValues { it.value ?: "" }
                    )
                }
            )
        })

    /** Overwrites the sync code block in place with a fresh payload. */
    suspend fun updateSyncBlock(apiKey: String, blockId: String, payload: SyncPayload) {
        fetch(apiKey, "PATCH", "/blocks/$blockId", mapOf(
            "code" to mapOf("language" to "json", "rich_text" to encodeSyncPayload(payload))
        ))
    }
}

private suspend fun Call.await(): Response = suspendCoroutine { cont ->
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: java.io.IOException) =
            cont.resumeWithException(Exception("Network error: ${e.message}"))
        override fun onResponse(call: Call, response: Response) =
            cont.resume(response)
    })
}
