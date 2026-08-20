package com.impca201.notiontimetracker.data.api

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive

/**
 * Null-safe reads for Notion's JSON.
 *
 * Gson's own `getAsJsonObject`/`getAsJsonArray` cast the member without
 * checking it: they return null when the key is *absent*, but throw
 * ClassCastException when it is present and JSON `null`. Notion sends exactly
 * that for every empty property — `"date": null`, `"select": null`,
 * `"status": null` — and one of them used to abort the whole response it was
 * read from. A single running entry with an empty date threw before any of the
 * other entries were parsed, so the running-timer query failed as a whole and
 * the list stayed empty on startup and on every refresh. `asString` has the
 * same problem: on a `null` element it throws UnsupportedOperationException.
 *
 * These read "present, and of the kind asked for, or null" instead. The
 * desktop app gets this for free from JavaScript's `?.`.
 */
internal fun JsonObject.objOrNull(name: String): JsonObject? = get(name) as? JsonObject

internal fun JsonObject.arrayOrNull(name: String): JsonArray? = get(name) as? JsonArray

internal fun JsonObject.stringOrNull(name: String): String? = (get(name) as? JsonPrimitive)?.asString

internal fun JsonObject.boolOrNull(name: String): Boolean? =
    (get(name) as? JsonPrimitive)?.takeIf { it.isBoolean }?.asBoolean

/** The element as an object, or null when it is `null`/a primitive/an array. */
internal fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject
