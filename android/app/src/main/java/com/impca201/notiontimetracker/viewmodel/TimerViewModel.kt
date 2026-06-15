package com.impca201.notiontimetracker.viewmodel

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.impca201.notiontimetracker.NotionTimeTrackerApp
import com.impca201.notiontimetracker.data.models.*
import com.impca201.notiontimetracker.ShortcutHelper
import com.impca201.notiontimetracker.data.models.Preset
import com.impca201.notiontimetracker.service.TimerForegroundService
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
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
        val extrasLoading: Boolean = false,
        val runningTimers: List<RunningTimerInfo> = emptyList(),
        val runningTimersLoading: Boolean = false,
        val recentEntries: List<RecentEntryInfo> = emptyList(),
        val recentEntriesLoading: Boolean = false,
        val deleteConfirmInfo: DeleteConfirmInfo? = null,
        val editTimerOpen: Boolean = false,
        val deletedPageDialogVisible: Boolean = false,
        val deletedPageDialogTitle: String? = null,
        val infoToast: String? = null,
        val suspendedTimer: RunningTimerInfo? = null
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val settingsRepo get() = (app as NotionTimeTrackerApp).settingsRepository
    private val notionRepo get() = (app as NotionTimeTrackerApp).notionRepository

    private var tickJob: Job? = null
    private var tickStartMs: Long = 0L

    // A preset launched from a home-screen / launcher shortcut before workspaces
    // finished loading (cold start). Applied once loadInitialState() completes.
    private var pendingPreset: Pair<String, String>? = null

    init {
        viewModelScope.launch { loadInitialState() }
        // Auto-refresh every 60s
        viewModelScope.launch {
            while (true) {
                delay(60_000L)
                val state = _uiState.value
                if (state.recoveredTimer == null && state.apiKey.isNotBlank() && state.workspaces.isNotEmpty()) {
                    if (state.running) {
                        checkActiveTimerStillRunning()
                        if (_uiState.value.running) {
                            loadRunningTimers()
                            loadRecentEntries()
                        }
                    } else {
                        loadRunningTimers()
                        loadRecentEntries()
                    }
                }
            }
        }
    }

    private suspend fun loadInitialState() {
        val apiKey = settingsRepo.getApiKey()
        val workspaces = settingsRepo.getWorkspaces()
        val lastId = settingsRepo.lastWorkspaceIdFlow.first()
        val activeTimer = settingsRepo.getActiveTimer()

        _uiState.update { state ->
            state.copy(
                apiKey = apiKey,
                workspaces = workspaces,
                recoveredTimer = if (activeTimer != null && activeTimer.workspaceId.isNotBlank()) activeTimer else null
            )
        }

        ShortcutHelper.updateShortcuts(app, workspaces)

        if (activeTimer == null) {
            // A shortcut tapped during a cold start is queued until now; apply it
            // (quick-starts the preset) instead of falling back to the idle screen.
            val pending = pendingPreset
            if (pending != null) {
                pendingPreset = null
                applyPresetById(pending.first, pending.second)
                return
            }
            val firstId = (workspaces.firstOrNull { it.id == lastId } ?: workspaces.firstOrNull())?.id
            if (firstId != null) selectWorkspace(firstId)
            if (apiKey.isNotBlank() && workspaces.isNotEmpty()) { loadRunningTimers(); loadRecentEntries() }
        }
    }

    fun refreshSettings() {
        viewModelScope.launch {
            val apiKey = settingsRepo.getApiKey()
            val workspaces = settingsRepo.getWorkspaces()
            _uiState.update { it.copy(apiKey = apiKey, workspaces = workspaces) }
            ShortcutHelper.updateShortcuts(app, workspaces)
            val current = _uiState.value.selectedWorkspaceId
            if (current == null || workspaces.none { it.id == current }) {
                val firstId = workspaces.firstOrNull()?.id
                if (firstId != null) selectWorkspace(firstId)
            }
            loadRunningTimers()
            loadRecentEntries()
        }
    }

    fun selectWorkspace(id: String) {
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == id } ?: return
        _uiState.update {
            it.copy(
                selectedWorkspaceId = id,
                description = "",
                extraFieldDefs = emptyList(),
                extraValues = emptyMap(),
                extrasLoading = workspace.extraProps.isNotEmpty()
            )
        }
        viewModelScope.launch {
            settingsRepo.saveLastWorkspaceId(id)
            loadExtraFieldDefs(workspace)
        }
    }

    private suspend fun loadExtraFieldDefs(workspace: Workspace) {
        if (workspace.extraProps.isEmpty() || workspace.timeEntriesDbId.isBlank()) {
            _uiState.update { it.copy(extraFieldDefs = emptyList(), extrasLoading = false) }
            initExtraValues(workspace.extraProps, emptyList())
            return
        }

        val defs = runCatching {
            val schema = runCatching { notionRepo.getDatabaseSchema(workspace.timeEntriesDbId) }
                .getOrDefault(emptyMap())

            workspace.extraProps.mapNotNull { prop ->
                val schemaProp = schema[prop.propName] ?: return@mapNotNull null
                val type = schemaProp.type

                val options: List<NamedOption> = when (type) {
                    "select", "multi_select" -> {
                        schema[prop.propName]?.let { sp ->
                            sp.statusOptions.map { NamedOption(it.name, it.name) }
                        } ?: emptyList()
                    }
                    "status" -> schemaProp.statusOptions.map { NamedOption(it.name, it.name) }
                    "people" -> runCatching { notionRepo.listUsers() }.getOrDefault(emptyList())
                    "relation" -> {
                        val relDbId = schemaProp.relationDatabaseId ?: ""
                        if (relDbId.isNotBlank()) {
                            runCatching { notionRepo.fetchDatabasePages(relDbId) }.getOrDefault(emptyList())
                        } else emptyList()
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
        }.getOrDefault(emptyList())

        _uiState.update { it.copy(extraFieldDefs = defs, extrasLoading = false) }
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
    fun clearInfoToast() = _uiState.update { it.copy(infoToast = null) }

    fun openEditTimer() = _uiState.update { it.copy(editTimerOpen = true) }
    fun closeEditTimer() = _uiState.update { it.copy(editTimerOpen = false) }

    fun dismissDeletedPage() {
        val state = _uiState.value
        if (state.running) {
            tickJob?.cancel()
            stopService()
            viewModelScope.launch { settingsRepo.clearActiveTimer() }
            _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, deletedPageDialogVisible = false, deletedPageDialogTitle = null) }
        } else {
            _uiState.update { it.copy(deletedPageDialogVisible = false, deletedPageDialogTitle = null) }
        }
        loadRunningTimers()
        loadRecentEntries()
    }

    fun refreshAll() {
        val state = _uiState.value
        if (state.recoveredTimer != null || state.apiKey.isBlank() || state.workspaces.isEmpty()) return
        if (state.running && state.activeTimer != null) {
            viewModelScope.launch { checkActiveTimerStillRunning() }
        }
        loadRunningTimers()
        loadRecentEntries()
    }

    private suspend fun checkActiveTimerStillRunning() {
        val timer = _uiState.value.activeTimer ?: return
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == timer.workspaceId } ?: return
        val pm = workspace.propertyMap
        if (workspace.timeEntriesDbId.isBlank() || pm.timeEntryStatusProp.isBlank() || pm.timeEntryStatusRunning.isBlank()) return
        val running = runCatching {
            notionRepo.fetchRunningTimers(workspace.timeEntriesDbId, pm.timeEntryStatusProp, pm.timeEntryStatusRunning, pm.timeEntryDateProp)
        }.getOrDefault(emptyList())
        if (running.none { it.pageId == timer.notionPageId }) {
            tickJob?.cancel()
            stopService()
            settingsRepo.clearActiveTimer()
            _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, infoToast = "timer_stopped_elsewhere") }
        }
    }

    fun quickSaveDescription(description: String) {
        val timer = _uiState.value.activeTimer ?: return
        updateTimerDetails(timer.projectId, description, timer.extraValues)
    }

    fun updateTimerDetails(projectId: String?, description: String, extraValues: Map<String, String>) {
        val state = _uiState.value
        val timer = state.activeTimer ?: return
        viewModelScope.launch {
            val extraNotionValues = buildExtraNotionValues(state.extraFieldDefs, extraValues)
            val properties = mutableMapOf<String, Any?>()
            val projectName = state.projects.firstOrNull { it.id == projectId }?.name ?: ""
            // Allow empty title — no fallback to default
            val newTitle = description.trim()
            properties[timer.propertyMap.timeEntryTitleProp] = mapOf(
                "title" to listOf(mapOf("text" to mapOf("content" to newTitle)))
            )
            if (timer.propertyMap.timeEntryRelationProp.isNotBlank()) {
                properties[timer.propertyMap.timeEntryRelationProp] = if (!projectId.isNullOrBlank())
                    mapOf("relation" to listOf(mapOf("id" to projectId)))
                else mapOf("relation" to emptyList<Any>())
            }
            extraNotionValues.forEach { (k, v) -> properties[k] = v }
            runCatching { notionRepo.updatePageProperties(timer.notionPageId, properties) }
                .onSuccess {
                    val updated = timer.copy(description = newTitle, projectId = projectId, projectName = projectName, extraValues = extraValues)
                    _uiState.update { it.copy(activeTimer = updated, description = newTitle, selectedProjectId = projectId, extraValues = extraValues, editTimerOpen = false) }
                    settingsRepo.saveActiveTimer(updated)
                    // Update foreground service notification immediately
                    val ws = state.workspaces.firstOrNull { it.id == updated.workspaceId }
                    if (ws != null) {
                        app.startForegroundService(
                            TimerForegroundService.buildStartIntent(app, updated, ws.name, ws.roundingMinutes, ws.color)
                        )
                    }
                    // Refresh to ensure consistency
                    loadRunningTimers()
                    loadRecentEntries()
                }
                .onFailure { err ->
                    val msg = err.message ?: ""
                    if (isPageDeletedError(msg)) {
                        _uiState.update { it.copy(editTimerOpen = false, deletedPageDialogVisible = true, deletedPageDialogTitle = description.ifBlank { null }) }
                    } else {
                        _uiState.update { it.copy(error = msg) }
                    }
                }
        }
    }

    fun startTimer() {
        val state = _uiState.value
        val workspace = state.workspaces.firstOrNull { it.id == state.selectedWorkspaceId } ?: return
        val apiKey = state.apiKey
        if (apiKey.isBlank()) { _uiState.update { it.copy(error = "No Notion API key set.") }; return }

        // No validation on start (validated on stop instead)

        _uiState.update { it.copy(isStarting = true, error = null) }

        viewModelScope.launch {
            val currentState = _uiState.value
            val suspended = currentState.suspendedTimer
            if (suspended != null) {
                _uiState.update { it.copy(suspendedTimer = null) }
            }

            runCatching {
                val nowMs = System.currentTimeMillis()
                val rawStartISO = toNotionDateTime(nowMs)

                val project = state.projects.firstOrNull { it.id == state.selectedProjectId }
                val projectName = project?.name ?: ""
                val description = state.description.ifBlank {
                    "${projectName.ifBlank { "" }} – ${formatDateDDMMYYYY(nowMs)}".trim(' ', '–', ' ')
                }
                val title = description.ifBlank { "Time entry" }

                val extraNotionValues = buildExtraNotionValues(state.extraFieldDefs, state.extraValues)

                val pageId = notionRepo.createTimeEntry(
                    dbId = workspace.timeEntriesDbId,
                    title = title,
                    startISO = rawStartISO,
                    projectId = state.selectedProjectId,
                    propertyMap = workspace.propertyMap,
                    extra = extraNotionValues
                )

                val timer = ActiveTimer(
                    notionPageId = pageId,
                    roundedStart = rawStartISO,
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
                    TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes, workspace.color)
                )

                timer to nowMs
            }.onSuccess { (timer, startMs) ->
                tickStartMs = startMs
                _uiState.update { it.copy(running = true, activeTimer = timer, isStarting = false, elapsedSeconds = 0L) }
                startTicking(startMs)
                loadRunningTimers()
                loadRecentEntries()
            }.onFailure { err ->
                _uiState.update { it.copy(isStarting = false, error = err.message ?: "Could not start timer") }
            }
        }
    }

    fun stopTimer(manualEndMs: Long? = null) {
        val state = _uiState.value
        val timer = state.activeTimer
        val suspended = state.suspendedTimer

        if (timer == null && suspended != null) {
            val workspace = state.workspaces.firstOrNull { it.id == suspended.workspaceId } ?: return
            _uiState.update { it.copy(isStopping = true, stopError = null) }
            viewModelScope.launch {
                runCatching {
                    val rounding = workspace.roundingMinutes
                    val rawStartMs = runCatching { parseIso(suspended.startISO) }.getOrElse { System.currentTimeMillis() }
                    val startMs = if (rounding == 0) rawStartMs else roundToNearest(rawStartMs, rounding)
                    val nowMs = manualEndMs ?: System.currentTimeMillis()
                    val endMs = if (rounding == 0) nowMs
                    else {
                        val minEnd = startMs + rounding * 60_000L
                        val rounded = roundToNearest(nowMs, rounding)
                        if (rounded < minEnd) minEnd else rounded
                    }
                    val startISO = toNotionDateTime(startMs)
                    val endISO = toNotionDateTime(endMs)
                    notionRepo.stopTimeEntry(
                        pageId = suspended.pageId,
                        startISO = startISO,
                        endISO = endISO,
                        propertyMap = suspended.propertyMap
                    )
                }.onSuccess {
                    tickJob?.cancel()
                    val remainingRunning = _uiState.value.runningTimers.filter { it.pageId != suspended.pageId }
                    if (remainingRunning.isNotEmpty()) {
                        _uiState.update { it.copy(isStopping = false, suspendedTimer = null, runningTimers = remainingRunning, stopError = null) }
                        loadRunningTimer(remainingRunning.first())
                    } else {
                        stopService()
                        _uiState.update { it.copy(isStopping = false, suspendedTimer = null, runningTimers = emptyList(), stopError = null) }
                    }
                    loadRunningTimers()
                    loadRecentEntries()
                }.onFailure { err ->
                    _uiState.update { it.copy(isStopping = false, stopError = err.message ?: "Could not stop timer") }
                }
            }
            return
        }

        if (timer == null) return
        val workspace = state.workspaces.firstOrNull { it.id == timer.workspaceId } ?: return

        if (state.extraFieldDefs.any { def ->
                def.required && (state.extraValues[def.propName]?.isBlank() != false)
            }) {
            _uiState.update { it.copy(stopError = "required_fields_before_stopping") }
            return
        }

        _uiState.update { it.copy(isStopping = true, stopError = null) }

        viewModelScope.launch {
            runCatching {
                val rounding = workspace.roundingMinutes
                val rawStartMs = parseIso(timer.rawStart)
                val startMs = if (rounding == 0) rawStartMs else roundToNearest(rawStartMs, rounding)
                val nowMs = manualEndMs ?: System.currentTimeMillis()
                val endMs = if (rounding == 0) nowMs
                else {
                    val minEnd = startMs + rounding * 60_000L
                    val rounded = roundToNearest(nowMs, rounding)
                    if (rounded < minEnd) minEnd else rounded
                }
                val startISO = toNotionDateTime(startMs)
                val endISO = toNotionDateTime(endMs)
                notionRepo.stopTimeEntry(
                    pageId = timer.notionPageId,
                    startISO = startISO,
                    endISO = endISO,
                    propertyMap = timer.propertyMap
                )
                settingsRepo.clearActiveTimer()
            }.onSuccess {
                tickJob?.cancel()
                val remainingRunning = _uiState.value.runningTimers.filter { it.pageId != timer.notionPageId }
                if (remainingRunning.isNotEmpty()) {
                    _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, runningTimers = remainingRunning, isStopping = false, stopError = null) }
                    loadRunningTimer(remainingRunning.first())
                } else {
                    stopService()
                    _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, runningTimers = emptyList(), isStopping = false, stopError = null) }
                }
                loadRunningTimers()
                loadRecentEntries()
            }.onFailure { err ->
                val msg = err.message ?: ""
                if (isPageDeletedError(msg)) {
                    tickJob?.cancel()
                    val remainingRunning = _uiState.value.runningTimers.filter { it.pageId != timer.notionPageId }
                    settingsRepo.clearActiveTimer()
                    if (remainingRunning.isNotEmpty()) {
                        _uiState.update { it.copy(isStopping = false, running = false, activeTimer = null, elapsedSeconds = 0L, runningTimers = remainingRunning, deletedPageDialogVisible = true, deletedPageDialogTitle = state.description.ifBlank { null }) }
                        loadRunningTimer(remainingRunning.first())
                    } else {
                        stopService()
                        _uiState.update { it.copy(isStopping = false, running = false, activeTimer = null, elapsedSeconds = 0L, runningTimers = emptyList(), deletedPageDialogVisible = true, deletedPageDialogTitle = state.description.ifBlank { null }) }
                    }
                } else {
                    _uiState.update { it.copy(isStopping = false, stopError = msg.ifBlank { "Could not stop timer" }) }
                }
            }
        }
    }

    fun updateStartTime(newStartISO: String) {
        val timer = _uiState.value.activeTimer ?: return
        val parsedMs = runCatching { parseIso(newStartISO) }.getOrNull() ?: return
        val updated = timer.copy(roundedStart = newStartISO, rawStart = newStartISO)
        tickStartMs = parsedMs
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
                val rawStartMs = parseIso(timer.rawStart)
                val startMs = if (rounding == 0) rawStartMs else roundToNearest(rawStartMs, rounding)
                val nowMs = System.currentTimeMillis()
                val endMs = if (rounding == 0) nowMs else {
                    val minEnd = startMs + rounding * 60_000L
                    val rounded = roundToNearest(nowMs, rounding)
                    if (rounded < minEnd) minEnd else rounded
                }
                val startISO = toNotionDateTime(startMs)
                notionRepo.stopTimeEntry(
                    pageId = timer.notionPageId,
                    startISO = startISO,
                    endISO = toNotionDateTime(endMs),
                    propertyMap = timer.propertyMap
                )
                settingsRepo.clearActiveTimer()
            }.onSuccess {
                _uiState.update { it.copy(recoveredTimer = null, recoveryBusy = false) }
                val firstId = _uiState.value.workspaces.firstOrNull()?.id
                if (firstId != null) selectWorkspace(firstId)
                loadRunningTimers()
                loadRecentEntries()
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
            TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes, workspace.color)
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
            loadRecentEntries()
        }
    }

    fun handleTimerStoppedFromService(stoppedPageId: String? = null) {
        val state = _uiState.value
        tickJob?.cancel()

        var nextSuspended = state.suspendedTimer
        if (stoppedPageId != null && state.suspendedTimer?.pageId == stoppedPageId) {
            nextSuspended = null
        }

        val pageToFilter = stoppedPageId ?: state.activeTimer?.notionPageId
        val remainingRunning = if (pageToFilter != null) {
            state.runningTimers.filter { it.pageId != pageToFilter }
        } else {
            state.runningTimers
        }

        if (remainingRunning.isNotEmpty() && (state.activeTimer?.notionPageId == pageToFilter || state.suspendedTimer?.pageId == pageToFilter)) {
            _uiState.update { it.copy(
                running = false,
                activeTimer = null,
                elapsedSeconds = 0L,
                isStopping = false,
                suspendedTimer = nextSuspended,
                runningTimers = remainingRunning
            ) }
            loadRunningTimer(remainingRunning.first())
        } else {
            if (remainingRunning.isEmpty()) {
                stopService()
            }
            _uiState.update { it.copy(
                running = false,
                activeTimer = null,
                elapsedSeconds = 0L,
                isStopping = false,
                suspendedTimer = nextSuspended,
                runningTimers = remainingRunning
            ) }
        }
        loadRunningTimers()
        loadRecentEntries()
    }

    fun loadRunningTimers() {
        val state = _uiState.value
        if (state.recoveredTimer != null || state.apiKey.isBlank() ||
            state.workspaces.isEmpty() || state.runningTimersLoading) return

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
                        url = result.url,
                        workspaceId = ws.id,
                        workspaceName = ws.name,
                        propertyMap = pm
                    ))
                }
            }
            allRunning.sortByDescending { it.startISO }
            _uiState.update { it.copy(runningTimersLoading = false, runningTimers = allRunning) }
            val updatedState = _uiState.value
            if (!updatedState.running && updatedState.activeTimer == null && allRunning.isNotEmpty()) {
                if (updatedState.suspendedTimer == null) {
                    loadRunningTimer(allRunning.first())
                }
            }
        }
    }

    fun loadRecentEntries() {
        val state = _uiState.value
        if (state.recoveredTimer != null || state.apiKey.isBlank() ||
            state.workspaces.isEmpty() || state.recentEntriesLoading) return

        _uiState.update { it.copy(recentEntriesLoading = true) }

        viewModelScope.launch {
            val allRecent = mutableListOf<RecentEntryInfo>()
            for (ws in state.workspaces) {
                val pm = ws.propertyMap
                if (ws.timeEntriesDbId.isBlank() || pm.timeEntryStatusProp.isBlank() ||
                    pm.timeEntryStatusDone.isBlank()) continue
                runCatching {
                    notionRepo.fetchRecentEntries(
                        ws.timeEntriesDbId, pm.timeEntryStatusProp,
                        pm.timeEntryStatusDone, pm.timeEntryDateProp
                    )
                }.getOrDefault(emptyList()).forEach { result ->
                    allRecent.add(RecentEntryInfo(
                        pageId = result.pageId,
                        title = result.title,
                        startISO = result.startISO,
                        endISO = result.endISO,
                        url = result.url,
                        workspaceId = ws.id,
                        workspaceName = ws.name,
                        propertyMap = pm
                    ))
                }
            }
            allRecent.sortByDescending { it.endISO ?: it.startISO ?: "" }
            _uiState.update { it.copy(recentEntriesLoading = false, recentEntries = allRecent.take(15)) }
        }
    }

    fun confirmDelete(pageId: String, title: String, isRunning: Boolean) {
        _uiState.update { it.copy(deleteConfirmInfo = DeleteConfirmInfo(pageId, title, isRunning)) }
    }

    fun cancelDelete() {
        _uiState.update { it.copy(deleteConfirmInfo = null) }
    }

    fun deleteEntry() {
        val info = _uiState.value.deleteConfirmInfo ?: return
        _uiState.update { it.copy(deleteConfirmInfo = null) }

        viewModelScope.launch {
            runCatching { notionRepo.deletePage(info.pageId) }
                .onSuccess {
                    val isActiveTimer = _uiState.value.activeTimer?.notionPageId == info.pageId
                    when {
                        isActiveTimer -> {
                            tickJob?.cancel()
                            stopService()
                            settingsRepo.clearActiveTimer()
                            _uiState.update { it.copy(
                                running = false, activeTimer = null, elapsedSeconds = 0L,
                                runningTimers = it.runningTimers.filter { r -> r.pageId != info.pageId }
                            )}
                        }
                        info.isRunning -> {
                            _uiState.update { it.copy(runningTimers = it.runningTimers.filter { r -> r.pageId != info.pageId }) }
                        }
                        else -> {
                            _uiState.update { it.copy(recentEntries = it.recentEntries.filter { r -> r.pageId != info.pageId }) }
                        }
                    }
                    loadRunningTimers()
                    loadRecentEntries()
                }
                .onFailure { err ->
                    _uiState.update { it.copy(error = err.message ?: "Could not delete entry") }
                }
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

        val alreadyExists = state.runningTimers.any { it.pageId == aside.pageId }
        val newRunning = if (alreadyExists) state.runningTimers else state.runningTimers + aside

        _uiState.update { it.copy(
            running = false,
            activeTimer = null,
            elapsedSeconds = 0L,
            description = "",
            runningTimers = newRunning,
            suspendedTimer = aside
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
        app.startForegroundService(
            TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes, workspace.color)
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
            selectedWorkspaceId = rt.workspaceId,
            suspendedTimer = null
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
                val rawStartMs = parseIso(rt.startISO)
                val startMs = if (rounding == 0) rawStartMs else roundToNearest(rawStartMs, rounding)
                val nowMs = System.currentTimeMillis()
                val endMs = if (rounding == 0) nowMs else {
                    val minEnd = startMs + rounding * 60_000L
                    val rounded = roundToNearest(nowMs, rounding)
                    if (rounded < minEnd) minEnd else rounded
                }
                val startISO = toNotionDateTime(startMs)
                notionRepo.stopTimeEntry(
                    pageId = rt.pageId,
                    startISO = startISO,
                    endISO = toNotionDateTime(endMs),
                    propertyMap = rt.propertyMap
                )
            }.onSuccess {
                val isSuspended = _uiState.value.suspendedTimer?.pageId == rt.pageId
                val remainingRunning = _uiState.value.runningTimers.filter { t -> t.pageId != rt.pageId }
                _uiState.update { it.copy(
                    runningTimers = remainingRunning,
                    suspendedTimer = if (isSuspended) null else it.suspendedTimer
                ) }
                if (isSuspended && remainingRunning.isNotEmpty()) {
                    loadRunningTimer(remainingRunning.first())
                }
            }.onFailure { err ->
                _uiState.update { it.copy(error = err.message ?: "Could not stop timer") }
            }
        }
    }

    fun applyPreset(workspaceId: String, preset: Preset) {
        if (_uiState.value.running) return
        viewModelScope.launch {
            val state = _uiState.value
            if (state.selectedWorkspaceId != workspaceId) {
                val workspace = state.workspaces.firstOrNull { it.id == workspaceId } ?: return@launch
                _uiState.update { it.copy(
                    selectedWorkspaceId = workspaceId,
                    extraFieldDefs = emptyList(),
                    extrasLoading = workspace.extraProps.isNotEmpty()
                )}
                settingsRepo.saveLastWorkspaceId(workspaceId)
                loadExtraFieldDefs(workspace)
            }
            _uiState.update { it.copy(
                description = preset.pageTitle,
                extraValues = it.extraValues.toMutableMap().also { map ->
                    preset.extraValues.forEach { (k, v) -> map[k] = v }
                }
            )}
            startTimer()
        }
    }

    fun applyPresetById(workspaceId: String, presetId: String) {
        val state = _uiState.value
        // Cold start: workspaces not loaded yet. Queue the request; loadInitialState()
        // applies it once the data is available (fixes home-screen shortcuts).
        if (state.workspaces.isEmpty()) {
            pendingPreset = workspaceId to presetId
            return
        }
        val workspace = state.workspaces.firstOrNull { it.id == workspaceId } ?: return
        val preset = workspace.presets.firstOrNull { it.id == presetId } ?: return
        applyPreset(workspaceId, preset)
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

    private fun isPageDeletedError(msg: String): Boolean {
        val lower = msg.lowercase()
        return lower.contains("404") || lower.contains("not_found") ||
               lower.contains("object_not_found") || lower.contains("could not find page") ||
               lower.contains("page not found")
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
