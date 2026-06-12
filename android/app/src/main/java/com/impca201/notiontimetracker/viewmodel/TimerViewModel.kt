package com.impca201.notiontimetracker.viewmodel

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.impca201.notiontimetracker.NotionTimeTrackerApp
import com.impca201.notiontimetracker.data.models.*
import com.impca201.notiontimetracker.service.TimerForegroundService
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class TimerViewModel(private val app: Application) : AndroidViewModel(app) {

    data class UiState(
        val apiKey: String = "",
        val workspaces: List<Workspace> = emptyList(),
        val selectedWorkspaceId: String? = null,
        val projects: List<NamedOption> = emptyList(),
        val projectsLoading: Boolean = false,
        val selectedProjectId: String? = null,
        val description: String = "",
        val extraFieldDefs: List<ExtraFieldDef> = emptyList(),
        val extraValues: Map<String, String> = emptyMap(),
        val running: Boolean = false,
        val activeTimer: ActiveTimer? = null,
        val elapsedSeconds: Long = 0L,
        val recoveredTimer: ActiveTimer? = null,
        val recoveryBusy: Boolean = false,
        val error: String? = null,
        val stopError: String? = null,
        val isStarting: Boolean = false,
        val isStopping: Boolean = false,
        val runningTimers: List<RunningTimerInfo> = emptyList(),
        val runningTimersLoading: Boolean = false
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val settingsRepo get() = (app as NotionTimeTrackerApp).settingsRepository
    private val notionRepo get() = (app as NotionTimeTrackerApp).notionRepository

    private var tickJob: Job? = null
    private var tickStartMs: Long = 0L

    init {
        viewModelScope.launch { loadInitialState() }
    }

    private suspend fun loadInitialState() {
        val apiKey = settingsRepo.getApiKey()
        val workspaces = settingsRepo.getWorkspaces()
        val lastId = settingsRepo.lastWorkspaceIdFlow.value
        val activeTimer = settingsRepo.getActiveTimer()

        _uiState.update { state ->
            state.copy(
                apiKey = apiKey,
                workspaces = workspaces,
                recoveredTimer = if (activeTimer != null && activeTimer.workspaceId.isNotBlank()) activeTimer else null
            )
        }

        if (activeTimer == null) {
            val firstId = (workspaces.firstOrNull { it.id == lastId } ?: workspaces.firstOrNull())?.id
            if (firstId != null) selectWorkspace(firstId)
            if (apiKey.isNotBlank() && workspaces.isNotEmpty()) loadRunningTimers()
        }
    }

    fun refreshSettings() {
        viewModelScope.launch {
            val apiKey = settingsRepo.getApiKey()
            val workspaces = settingsRepo.getWorkspaces()
            _uiState.update { it.copy(apiKey = apiKey, workspaces = workspaces) }
            val current = _uiState.value.selectedWorkspaceId
            if (current == null || workspaces.none { it.id == current }) {
                val firstId = workspaces.firstOrNull()?.id
                if (firstId != null) selectWorkspace(firstId)
            }
            loadRunningTimers()
        }
    }

    fun selectWorkspace(id: String) {
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == id } ?: return
        _uiState.update { it.copy(selectedWorkspaceId = id, projects = emptyList(), projectsLoading = true, extraFieldDefs = emptyList()) }
        viewModelScope.launch {
            settingsRepo.saveLastWorkspaceId(id)
            loadProjects(workspace)
            loadExtraFieldDefs(workspace)
        }
    }

    private suspend fun loadProjects(workspace: Workspace) {
        if (workspace.projectsDbId.isBlank()) {
            _uiState.update { it.copy(projects = emptyList(), projectsLoading = false) }
            return
        }
        runCatching { notionRepo.fetchDatabasePages(workspace.projectsDbId) }
            .onSuccess { pages -> _uiState.update { it.copy(projects = pages, projectsLoading = false) } }
            .onFailure { _uiState.update { it.copy(projectsLoading = false) } }
    }

    private suspend fun loadExtraFieldDefs(workspace: Workspace) {
        if (workspace.extraProps.isEmpty() || workspace.timeEntriesDbId.isBlank()) {
            _uiState.update { it.copy(extraFieldDefs = emptyList()) }
            initExtraValues(workspace.extraProps, emptyList())
            return
        }
        val schema = runCatching { notionRepo.getDatabaseSchema(workspace.timeEntriesDbId) }
            .getOrDefault(emptyMap())

        val defs = workspace.extraProps.mapNotNull { prop ->
            val schemaProp = schema[prop.propName] ?: return@mapNotNull null
            val type = schemaProp.type

            val options: List<NamedOption> = when (type) {
                "select", "multi_select" -> {
                    runCatching { notionRepo.getDatabaseSchema(workspace.timeEntriesDbId) }
                        .getOrDefault(emptyMap())[prop.propName]
                        ?.let { sp ->
                            when (type) {
                                "select" -> sp.statusOptions.map { NamedOption(it.name, it.name) }
                                "multi_select" -> sp.statusOptions.map { NamedOption(it.name, it.name) }
                                else -> emptyList()
                            }
                        } ?: emptyList()
                }
                "status" -> schemaProp.statusOptions.map { NamedOption(it.name, it.name) }
                "people" -> runCatching { notionRepo.listUsers() }.getOrDefault(emptyList())
                "relation" -> {
                    // Get the related DB ID from the schema (the raw schema needs relation.database_id)
                    // For simplicity, if the workspace has a projectsDbId and this is a relation, use it
                    runCatching { notionRepo.fetchDatabasePages(workspace.projectsDbId) }.getOrDefault(emptyList())
                }
                else -> emptyList()
            }
            ExtraFieldDef(
                propName = prop.propName,
                type = type,
                required = prop.required,
                defaultValue = prop.defaultValue,
                options = options,
                statusOptions = schemaProp.statusOptions
            )
        }
        _uiState.update { it.copy(extraFieldDefs = defs) }
        initExtraValues(workspace.extraProps, defs)
    }

    private fun initExtraValues(extraProps: List<ExtraProp>, defs: List<ExtraFieldDef>) {
        val values = extraProps.associate { prop ->
            val def = defs.firstOrNull { it.propName == prop.propName }
            val defaultVal = when {
                prop.defaultValue != null -> prop.defaultValue
                def?.type == "checkbox" -> "false"
                else -> ""
            }
            prop.propName to defaultVal
        }
        _uiState.update { it.copy(extraValues = values) }
    }

    fun setSelectedProject(id: String?) {
        _uiState.update { it.copy(selectedProjectId = id) }
    }

    fun setDescription(text: String) {
        _uiState.update { it.copy(description = text) }
    }

    fun setExtraValue(propName: String, value: String) {
        _uiState.update { it.copy(extraValues = it.extraValues + (propName to value)) }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
    fun clearStopError() = _uiState.update { it.copy(stopError = null) }

    fun startTimer() {
        val state = _uiState.value
        val workspace = state.workspaces.firstOrNull { it.id == state.selectedWorkspaceId } ?: return
        val apiKey = state.apiKey
        if (apiKey.isBlank()) { _uiState.update { it.copy(error = "No Notion API key set.") }; return }

        // Validate required extra fields
        val missingRequired = state.extraFieldDefs.any { def ->
            def.required && (state.extraValues[def.propName]?.isBlank() != false)
        }
        if (missingRequired) { _uiState.update { it.copy(error = "required_fields_missing") }; return }

        _uiState.update { it.copy(isStarting = true, error = null) }

        viewModelScope.launch {
            runCatching {
                val nowMs = System.currentTimeMillis()
                val rounding = workspace.roundingMinutes
                val roundedStartMs = if (rounding == 0) nowMs else roundToNearest(nowMs, rounding)

                val rawStartISO = toNotionDateTime(nowMs)
                val roundedStartISO = toNotionDateTime(roundedStartMs)

                val project = state.projects.firstOrNull { it.id == state.selectedProjectId }
                val projectName = project?.name ?: ""
                val description = state.description.ifBlank {
                    "${projectName.ifBlank { "" }} — ${formatDateDDMMYYYY(nowMs)}".trim(' ', '—', ' ')
                }
                val title = description.ifBlank { "Time entry" }

                val extraNotionValues = buildExtraNotionValues(state.extraFieldDefs, state.extraValues)

                val pageId = notionRepo.createTimeEntry(
                    dbId = workspace.timeEntriesDbId,
                    title = title,
                    startISO = roundedStartISO,
                    projectId = state.selectedProjectId,
                    propertyMap = workspace.propertyMap,
                    extra = extraNotionValues
                )

                val timer = ActiveTimer(
                    notionPageId = pageId,
                    roundedStart = roundedStartISO,
                    rawStart = rawStartISO,
                    workspaceId = workspace.id,
                    projectId = state.selectedProjectId,
                    projectName = projectName,
                    description = description,
                    propertyMap = workspace.propertyMap,
                    extraValues = state.extraValues
                )
                settingsRepo.saveActiveTimer(timer)

                app.startForegroundService(
                    TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes)
                )

                timer to roundedStartMs
            }.onSuccess { (timer, startMs) ->
                tickStartMs = startMs
                _uiState.update { it.copy(running = true, activeTimer = timer, isStarting = false, elapsedSeconds = 0L) }
                startTicking(startMs)
            }.onFailure { err ->
                _uiState.update { it.copy(isStarting = false, error = err.message ?: "Could not start timer") }
            }
        }
    }

    fun stopTimer(manualEndMs: Long? = null) {
        val state = _uiState.value
        val timer = state.activeTimer ?: return
        val workspace = state.workspaces.firstOrNull { it.id == timer.workspaceId } ?: return

        _uiState.update { it.copy(isStopping = true, stopError = null) }

        viewModelScope.launch {
            runCatching {
                val rounding = workspace.roundingMinutes
                val startMs = parseIso(timer.roundedStart)
                val nowMs = manualEndMs ?: System.currentTimeMillis()
                val endMs = if (rounding == 0) nowMs
                else {
                    val minEnd = startMs + rounding * 60_000L
                    val rounded = roundToNearest(nowMs, rounding)
                    if (rounded < minEnd) minEnd else rounded
                }
                val endISO = toNotionDateTime(endMs)
                notionRepo.stopTimeEntry(
                    pageId = timer.notionPageId,
                    startISO = timer.roundedStart,
                    endISO = endISO,
                    propertyMap = timer.propertyMap
                )
                settingsRepo.clearActiveTimer()
            }.onSuccess {
                tickJob?.cancel()
                stopService()
                _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, isStopping = false, stopError = null) }
                loadRunningTimers()
            }.onFailure { err ->
                _uiState.update { it.copy(isStopping = false, stopError = err.message ?: "Could not stop timer") }
            }
        }
    }

    fun updateStartTime(newStartISO: String) {
        val timer = _uiState.value.activeTimer ?: return
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == timer.workspaceId } ?: return
        val rounding = workspace.roundingMinutes
        val parsedMs = runCatching { parseIso(newStartISO) }.getOrNull() ?: return
        val roundedMs = if (rounding == 0) parsedMs else roundToNearest(parsedMs, rounding)
        val roundedISO = toNotionDateTime(roundedMs)
        val updated = timer.copy(roundedStart = roundedISO)
        tickStartMs = roundedMs
        _uiState.update { it.copy(activeTimer = updated) }
        viewModelScope.launch { settingsRepo.saveActiveTimer(updated) }
    }

    fun stopRecoveredTimer() {
        val timer = _uiState.value.recoveredTimer ?: return
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == timer.workspaceId }
        val rounding = workspace?.roundingMinutes ?: 15
        _uiState.update { it.copy(recoveryBusy = true) }
        viewModelScope.launch {
            runCatching {
                val startMs = parseIso(timer.roundedStart)
                val nowMs = System.currentTimeMillis()
                val endMs = if (rounding == 0) nowMs else {
                    val minEnd = startMs + rounding * 60_000L
                    val rounded = roundToNearest(nowMs, rounding)
                    if (rounded < minEnd) minEnd else rounded
                }
                notionRepo.stopTimeEntry(
                    pageId = timer.notionPageId,
                    startISO = timer.roundedStart,
                    endISO = toNotionDateTime(endMs),
                    propertyMap = timer.propertyMap
                )
                settingsRepo.clearActiveTimer()
            }.onSuccess {
                _uiState.update { it.copy(recoveredTimer = null, recoveryBusy = false) }
                val firstId = _uiState.value.workspaces.firstOrNull()?.id
                if (firstId != null) selectWorkspace(firstId)
                loadRunningTimers()
            }.onFailure { err ->
                _uiState.update { it.copy(recoveryBusy = false, error = err.message) }
            }
        }
    }

    fun resumeRecoveredTimer() {
        val timer = _uiState.value.recoveredTimer ?: return
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == timer.workspaceId } ?: run {
            discardRecoveredTimer(); return
        }
        val startMs = runCatching { parseIso(timer.rawStart) }.getOrElse { System.currentTimeMillis() }
        tickStartMs = startMs

        app.startForegroundService(
            TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes)
        )

        _uiState.update { it.copy(recoveredTimer = null, running = true, activeTimer = timer, elapsedSeconds = 0L) }
        startTicking(startMs)
        viewModelScope.launch { selectWorkspace(timer.workspaceId) }
    }

    fun discardRecoveredTimer() {
        viewModelScope.launch {
            settingsRepo.clearActiveTimer()
            _uiState.update { it.copy(recoveredTimer = null) }
            val firstId = _uiState.value.workspaces.firstOrNull()?.id
            if (firstId != null) selectWorkspace(firstId)
            loadRunningTimers()
        }
    }

    fun handleTimerStoppedFromService() {
        tickJob?.cancel()
        _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, isStopping = false) }
        loadRunningTimers()
    }

    fun loadRunningTimers(autoLoad: Boolean = true) {
        val state = _uiState.value
        if (state.recoveredTimer != null || state.apiKey.isBlank() ||
            state.workspaces.isEmpty() || state.runningTimersLoading) return
        if (autoLoad && state.running) return

        _uiState.update { it.copy(runningTimersLoading = true) }

        viewModelScope.launch {
            val allRunning = mutableListOf<RunningTimerInfo>()
            for (ws in state.workspaces) {
                val pm = ws.propertyMap
                if (ws.timeEntriesDbId.isBlank() || pm.timeEntryStatusProp.isBlank() ||
                    pm.timeEntryStatusRunning.isBlank()) continue
                runCatching {
                    notionRepo.fetchRunningTimers(
                        ws.timeEntriesDbId, pm.timeEntryStatusProp,
                        pm.timeEntryStatusRunning, pm.timeEntryDateProp
                    )
                }.getOrDefault(emptyList()).forEach { result ->
                    allRunning.add(RunningTimerInfo(
                        pageId = result.pageId,
                        title = result.title,
                        startISO = result.startISO,
                        workspaceId = ws.id,
                        workspaceName = ws.name,
                        propertyMap = pm
                    ))
                }
            }
            allRunning.sortByDescending { it.startISO }

            // Exclude the timer currently active in the UI
            val activePageId = _uiState.value.activeTimer?.notionPageId
            val others = if (activePageId != null) allRunning.filter { it.pageId != activePageId } else allRunning

            _uiState.update { it.copy(runningTimersLoading = false, runningTimers = others) }
            if (autoLoad && !_uiState.value.running && others.isNotEmpty()) loadRunningTimer(others[0])
        }
    }

    fun suspendActiveToNewTimer() {
        val state = _uiState.value
        if (!state.running || state.activeTimer == null) return

        val aside = RunningTimerInfo(
            pageId = state.activeTimer.notionPageId,
            title = state.activeTimer.description,
            startISO = state.activeTimer.roundedStart,
            workspaceId = state.activeTimer.workspaceId,
            workspaceName = state.workspaces.firstOrNull { it.id == state.activeTimer.workspaceId }?.name ?: "",
            propertyMap = state.activeTimer.propertyMap
        )

        tickJob?.cancel()
        app.stopService(Intent(app, TimerForegroundService::class.java))

        _uiState.update { it.copy(
            running = false,
            activeTimer = null,
            elapsedSeconds = 0L,
            description = "",
            runningTimers = it.runningTimers + aside
        )}

        viewModelScope.launch { settingsRepo.clearActiveTimer() }
    }

    fun loadRunningTimer(rt: RunningTimerInfo) {
        val state = _uiState.value
        val workspace = state.workspaces.firstOrNull { it.id == rt.workspaceId } ?: return

        // If another timer was active in UI, put it back in the list (it still runs in Notion)
        val previouslyActive = if (state.running && state.activeTimer != null) {
            RunningTimerInfo(
                pageId = state.activeTimer.notionPageId,
                title = state.activeTimer.description,
                startISO = state.activeTimer.roundedStart,
                workspaceId = state.activeTimer.workspaceId,
                workspaceName = state.workspaces.firstOrNull { it.id == state.activeTimer.workspaceId }?.name ?: "",
                propertyMap = state.activeTimer.propertyMap
            )
        } else null

        tickJob?.cancel()

        val timer = ActiveTimer(
            notionPageId = rt.pageId,
            roundedStart = rt.startISO,
            rawStart = rt.startISO,
            workspaceId = rt.workspaceId,
            projectId = null,
            projectName = "",
            description = rt.title,
            propertyMap = rt.propertyMap
        )

        // Switch foreground service to show the loaded timer
        if (state.running) app.stopService(Intent(app, TimerForegroundService::class.java))
        app.startForegroundService(
            TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes)
        )

        val startMs = runCatching { parseIso(rt.startISO) }.getOrElse { System.currentTimeMillis() }
        tickStartMs = startMs

        val others = state.runningTimers.filter { it.pageId != rt.pageId }.toMutableList()
        if (previouslyActive != null) others.add(previouslyActive)

        _uiState.update { it.copy(
            running = true,
            activeTimer = timer,
            elapsedSeconds = 0L,
            runningTimers = others,
            description = rt.title,
            selectedWorkspaceId = rt.workspaceId
        )}
        startTicking(startMs)
        viewModelScope.launch { settingsRepo.saveActiveTimer(timer) }
        selectWorkspace(rt.workspaceId)
    }

    fun stopOtherRunningTimer(rt: RunningTimerInfo) {
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == rt.workspaceId }
        val rounding = workspace?.roundingMinutes ?: 15
        viewModelScope.launch {
            runCatching {
                val startMs = parseIso(rt.startISO)
                val nowMs = System.currentTimeMillis()
                val endMs = if (rounding == 0) nowMs else {
                    val minEnd = startMs + rounding * 60_000L
                    val rounded = roundToNearest(nowMs, rounding)
                    if (rounded < minEnd) minEnd else rounded
                }
                notionRepo.stopTimeEntry(
                    pageId = rt.pageId,
                    startISO = rt.startISO,
                    endISO = toNotionDateTime(endMs),
                    propertyMap = rt.propertyMap
                )
            }.onSuccess {
                _uiState.update { it.copy(runningTimers = it.runningTimers.filter { t -> t.pageId != rt.pageId }) }
            }.onFailure { err ->
                _uiState.update { it.copy(error = err.message ?: "Could not stop timer") }
            }
        }
    }

    private fun startTicking(startMs: Long) {
        tickJob?.cancel()
        tickJob = viewModelScope.launch {
            while (true) {
                val elapsed = (System.currentTimeMillis() - startMs) / 1000L
                _uiState.update { it.copy(elapsedSeconds = elapsed.coerceAtLeast(0L)) }
                delay(1000L)
            }
        }
    }

    private fun stopService() {
        app.stopService(Intent(app, TimerForegroundService::class.java))
    }

    private fun buildExtraNotionValues(
        defs: List<ExtraFieldDef>,
        values: Map<String, String>
    ): Map<String, Any?> {
        val result = mutableMapOf<String, Any?>()
        for (def in defs) {
            val raw = values[def.propName] ?: continue
            val notionValue = buildPropertyValue(def.type, raw) ?: continue
            result[def.propName] = notionValue
        }
        return result
    }

    // --- Utilities (ported from JS) ---

    private fun roundToNearest(ms: Long, minutes: Int): Long {
        val intervalMs = minutes * 60_000L
        return Math.round(ms.toDouble() / intervalMs) * intervalMs
    }

    private fun toNotionDateTime(ms: Long): String {
        val odt = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault())
        return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(odt)
    }

    private fun parseIso(iso: String): Long =
        java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()

    private fun formatDateDDMMYYYY(ms: Long): String {
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = ms }
        return "%02d/%02d/%04d".format(
            cal.get(java.util.Calendar.DAY_OF_MONTH),
            cal.get(java.util.Calendar.MONTH) + 1,
            cal.get(java.util.Calendar.YEAR)
        )
    }

    companion object {
        fun buildPropertyValue(type: String, value: String): Any? {
            if (value.isBlank() && type != "checkbox") return null
            return when (type) {
                "rich_text" -> mapOf("rich_text" to listOf(mapOf("text" to mapOf("content" to value.trim()))))
                "number" -> value.toDoubleOrNull()?.let { mapOf("number" to it) }
                "checkbox" -> mapOf("checkbox" to (value == "true"))
                "select" -> if (value.isBlank()) null else mapOf("select" to mapOf("name" to value.trim()))
                "status" -> if (value.isBlank()) null else mapOf("status" to mapOf("name" to value.trim()))
                "multi_select" -> {
                    val names = value.split(",").map { it.trim() }.filter { it.isNotBlank() }
                    if (names.isEmpty()) null
                    else mapOf("multi_select" to names.map { mapOf("name" to it) })
                }
                "date" -> if (value.isBlank()) null else mapOf("date" to mapOf("start" to value))
                "url" -> mapOf("url" to value.trim())
                "email" -> mapOf("email" to value.trim())
                "phone_number" -> mapOf("phone_number" to value.trim())
                "people" -> {
                    val ids = value.split(",").map { it.trim() }.filter { it.isNotBlank() }
                    if (ids.isEmpty()) null else mapOf("people" to ids.map { mapOf("id" to it) })
                }
                "relation" -> {
                    val ids = value.split(",").map { it.trim() }.filter { it.isNotBlank() }
                    if (ids.isEmpty()) null else mapOf("relation" to ids.map { mapOf("id" to it) })
                }
                "files" -> if (value.isBlank()) null
                else mapOf("files" to listOf(mapOf("name" to "file", "external" to mapOf("url" to value.trim()))))
                else -> null
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        tickJob?.cancel()
    }
}
