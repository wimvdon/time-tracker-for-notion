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
data class Workspace(
    val id: String,
    val name: String,
    val timeEntriesDbId: String = "",
    val projectsDbId: String = "",
    val roundingMinutes: Int = 15,
    val propertyMap: PropertyMap = PropertyMap(),
    val extraProps: List<ExtraProp> = emptyList()
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

data class StatusOption(val name: String, val color: String = "")

data class SchemaProperty(
    val name: String,
    val type: String,
    val statusOptions: List<StatusOption> = emptyList()
)

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
