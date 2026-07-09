package com.impca201.notiontimetracker.data.models

import kotlinx.serialization.Serializable

@Serializable
data class PropertyMap(
    val timeEntryTitleProp: String = "",
    val timeEntryDateProp: String = "",
    val timeEntryStatusProp: String = "",
    val timeEntryStatusRunning: String = "",
    val timeEntryRelationProp: String = "",
    val timeEntryStatusDone: String = ""
)

@Serializable
data class ExtraProp(
    val propName: String,
    val type: String = "rich_text",
    val required: Boolean = false,
    val defaultValue: String? = null
)

@Serializable
data class Preset(
    val id: String,
    val name: String,
    val pageTitle: String = "",
    val extraValues: Map<String, String> = emptyMap(),
    val showInShortcuts: Boolean = false
)

@Serializable
data class Workspace(
    val id: String,
    val name: String,
    val timeEntriesDbId: String = "",
    val projectsDbId: String = "",
    val roundingMinutes: Int = 15,
    val propertyMap: PropertyMap = PropertyMap(),
    val extraProps: List<ExtraProp> = emptyList(),
    val presets: List<Preset> = emptyList(),
    val color: String = ""
)

@Serializable
data class ActiveTimer(
    val notionPageId: String,
    val roundedStart: String,
    val rawStart: String,
    val workspaceId: String,
    val projectId: String? = null,
    val projectName: String = "",
    val description: String = "",
    val propertyMap: PropertyMap = PropertyMap(),
    val extraValues: Map<String, String> = emptyMap()
)

data class NamedOption(val id: String, val name: String)

/**
 * Cross-device sync payload stored as a JSON code block on a Notion page.
 * Excludes the API key and per-device toggles (dynamic color on Android,
 * always-on-top/start-with-Windows on the desktop app).
 */
data class SyncPayload(
    val updatedAt: String,
    val workspaces: List<Workspace> = emptyList(),
    val theme: String? = null,
    val locale: String? = null,
    val dateFormat: String? = null,
    val timeFormat: String? = null,
    val showNotionLink: Boolean? = null,
    val showArchiveAction: Boolean? = null
)

data class SyncFetchResult(val blockId: String, val payload: SyncPayload)

data class RunningTimerResult(
    val pageId: String,
    val title: String,
    val startISO: String,
    val url: String = ""
)

@Serializable
data class RunningTimerInfo(
    val pageId: String,
    val title: String,
    val startISO: String,
    val url: String = "",
    val workspaceId: String,
    val workspaceName: String,
    val propertyMap: PropertyMap
)

data class RecentEntryResult(
    val pageId: String,
    val title: String,
    val startISO: String?,
    val endISO: String?,
    val url: String
)

data class RecentEntryInfo(
    val pageId: String,
    val title: String,
    val startISO: String?,
    val endISO: String?,
    val url: String,
    val workspaceId: String,
    val workspaceName: String,
    val propertyMap: PropertyMap
)

data class DeleteConfirmInfo(
    val pageId: String,
    val title: String,
    val isRunning: Boolean
)

data class StatusOption(val name: String, val color: String = "")

data class SchemaProperty(
    val name: String,
    val type: String,
    val statusOptions: List<StatusOption> = emptyList(),
    val selectOptions: List<StatusOption> = emptyList(),
    val relationDatabaseId: String? = null
)

enum class ThemeMode { AUTO, LIGHT, DARK }

data class ExtraFieldDef(
    val propName: String,
    val type: String,
    val required: Boolean,
    val defaultValue: String?,
    val options: List<NamedOption> = emptyList(),
    val statusOptions: List<StatusOption> = emptyList()
)

val WRITABLE_EXTRA_TYPES = setOf(
    "rich_text", "number", "select", "multi_select", "date",
    "checkbox", "url", "email", "phone_number", "people",
    "relation", "status", "files"
)

val READ_ONLY_TYPES = setOf(
    "title", "formula", "rollup", "created_time", "created_by",
    "last_edited_time", "last_edited_by", "unique_id", "verification",
    "button", "auto_increment_id"
)
