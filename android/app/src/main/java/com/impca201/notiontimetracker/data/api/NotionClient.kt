package com.impca201.notiontimetracker.data.api

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.impca201.notiontimetracker.data.models.*
import kotlinx.coroutines.Dispatchers
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
    private val JSON = "application/json".toMediaType()
    private val httpClient = OkHttpClient.Builder().build()

    private suspend fun fetch(
        apiKey: String,
        method: String,
        endpoint: String,
        body: Any? = null
    ): JsonObject = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) throw Exception("No Notion API key configured. Add one in Settings.")

        val reqBody = when {
            body != null -> gson.toJson(body).toRequestBody(JSON)
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

        val response = httpClient.newCall(request).await()
        val responseBody = response.body?.string() ?: "{}"
        val data = runCatching { gson.fromJson(responseBody, JsonObject::class.java) }
            .getOrDefault(JsonObject())

        if (!response.isSuccessful) {
            val message = data.get("message")?.asString
                ?: "Notion API error (HTTP ${response.code})"
            throw Exception(message)
        }
        data
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
                val name = titleProp?.getAsJsonArray("title")
                    ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" }
                    ?.trim()
                if (!name.isNullOrBlank()) {
                    results.add(NamedOption(page.get("id").asString, name))
                }
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
}

private suspend fun Call.await(): Response = suspendCoroutine { cont ->
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: java.io.IOException) =
            cont.resumeWithException(Exception("Network error: ${e.message}"))
        override fun onResponse(call: Call, response: Response) =
            cont.resume(response)
    })
}
