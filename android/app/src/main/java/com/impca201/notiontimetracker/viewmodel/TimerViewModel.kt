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

/** Every date format offered in Settings. */
private val DATE_FORMATS = listOf("DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD")

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
        val showAlreadyRunningWarning: Boolean = false,
        val locale: String = "system",
        val dateFormat: String = "DD/MM/YYYY",
        val timeFormat: String = "24h",
        val showNotionLink: Boolean = true,
        val showArchiveAction: Boolean = true
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val settingsRepo get() = (app as NotionTimeTrackerApp).settingsRepository
    private val notionRepo get() = (app as NotionTimeTrackerApp).notionRepository
    private val syncer get() = (app as NotionTimeTrackerApp).settingsSyncer

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
                if (state.apiKey.isNotBlank() && state.workspaces.isNotEmpty()) {
                    if (state.running) {
                        checkActiveTimerStillRunning()
                        if (_uiState.value.running) {
                            refreshActiveTimerFieldsIfRunning()
                            loadRunningTimers()
                            loadRecentEntries()
                        }
                    } else {
                        loadRunningTimers()
                        loadRecentEntries()
                    }
                }
                if (state.apiKey.isNotBlank() && settingsRepo.getSyncPageId() != null) {
                    runCatching { syncer.syncNow() }.onSuccess { refreshSettings() }
                }
            }
        }
    }

    private suspend fun loadInitialState() {
        try {
            val apiKey = settingsRepo.getApiKey()
            val workspaces = settingsRepo.getWorkspaces()
            val lastId = settingsRepo.lastWorkspaceIdFlow.first()
            val activeTimer = settingsRepo.getActiveTimer()
            val locale = settingsRepo.localeFlow.first()
            val dateFormat = settingsRepo.dateFormatFlow.first()
            val timeFormat = settingsRepo.timeFormatFlow.first()
            val showNotionLink = settingsRepo.showNotionLinkFlow.first()
            val showArchiveAction = settingsRepo.showArchiveActionFlow.first()

            _uiState.update { state ->
                state.copy(
                    apiKey = apiKey,
                    workspaces = workspaces,
                    locale = locale,
                    dateFormat = dateFormat,
                    timeFormat = timeFormat,
                    showNotionLink = showNotionLink,
                    showArchiveAction = showArchiveAction
                )
            }

            ShortcutHelper.updateShortcuts(app, workspaces)

            if (activeTimer != null) {
                val workspace = workspaces.firstOrNull { it.id == activeTimer.workspaceId }
                if (workspace != null) {
                    _uiState.update { state ->
                        state.copy(
                            running = true,
                            activeTimer = activeTimer,
                            selectedWorkspaceId = activeTimer.workspaceId,
                            selectedProjectId = activeTimer.projectId,
                            description = activeTimer.description,
                            extraValues = activeTimer.extraValues
                        )
                    }
                    loadExtraFieldDefs(workspace)
                    val rawStartMs = runCatching { parseIso(activeTimer.rawStart) }.getOrElse { System.currentTimeMillis() }
                    tickStartMs = rawStartMs
                    startTicking(rawStartMs)
                    runCatching {
                        app.startForegroundService(
                            TimerForegroundService.buildStartIntent(app, activeTimer, workspace.name, workspace.roundingMinutes, workspace.color)
                        )
                    }.onFailure { e ->
                        android.util.Log.e("TimerViewModel", "Failed to start foreground service on launch", e)
                    }
                }
                if (apiKey.isNotBlank() && workspaces.isNotEmpty()) {
                    viewModelScope.launch { checkActiveTimerStillRunning() }
                    loadRunningTimers()
                    loadRecentEntries()
                }
            } else {
                val firstId = (workspaces.firstOrNull { it.id == lastId } ?: workspaces.firstOrNull())?.id
                if (firstId != null) selectWorkspace(firstId)
                if (apiKey.isNotBlank() && workspaces.isNotEmpty()) { loadRunningTimers(); loadRecentEntries() }
            }

            val pending = pendingPreset
            if (pending != null) {
                pendingPreset = null
                applyPresetById(pending.first, pending.second)
            }

            if (apiKey.isNotBlank() && settingsRepo.getSyncPageId() != null) {
                runCatching { syncer.syncNow() }.onSuccess { refreshSettings() }
            }
        } catch (e: Exception) {
            android.util.Log.e("TimerViewModel", "Failed to load initial state", e)
        }
    }

    fun refreshSettings() {
        viewModelScope.launch {
            val apiKey = settingsRepo.getApiKey()
            val workspaces = settingsRepo.getWorkspaces()
            val locale = settingsRepo.localeFlow.first()
            val dateFormat = settingsRepo.dateFormatFlow.first()
            val timeFormat = settingsRepo.timeFormatFlow.first()
            val showNotionLink = settingsRepo.showNotionLinkFlow.first()
            val showArchiveAction = settingsRepo.showArchiveActionFlow.first()
            _uiState.update { it.copy(
                apiKey = apiKey,
                workspaces = workspaces,
                locale = locale,
                dateFormat = dateFormat,
                timeFormat = timeFormat,
                showNotionLink = showNotionLink,
                showArchiveAction = showArchiveAction
            ) }
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
        val active = _uiState.value.activeTimer
        val currentDesc = if (active != null && active.workspaceId == id) active.description else ""
        val currentProj = if (active != null && active.workspaceId == id) active.projectId else null
        val currentExtras = if (active != null && active.workspaceId == id) active.extraValues else emptyMap()

        _uiState.update {
            it.copy(
                selectedWorkspaceId = id,
                description = currentDesc,
                selectedProjectId = currentProj,
                extraFieldDefs = emptyList(),
                extraValues = currentExtras,
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
            val schema = retryNotionCall { notionRepo.getDatabaseSchema(workspace.timeEntriesDbId) }
                ?: emptyMap()

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
        val active = _uiState.value.activeTimer
        if (active != null) {
            _uiState.update { it.copy(extraValues = active.extraValues) }
            return
        }
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
        if (state.apiKey.isBlank() || state.workspaces.isEmpty()) return
        if (state.running && state.activeTimer != null) {
            viewModelScope.launch {
                checkActiveTimerStillRunning()
                if (_uiState.value.running) refreshActiveTimerFieldsIfRunning()
            }
        }
        viewModelScope.launch {
            if (settingsRepo.getSyncPageId() != null) {
                runCatching { syncer.syncNow() }.onSuccess { refreshSettings() }
            }
        }
        loadRunningTimers()
        loadRecentEntries()
    }

    private suspend fun checkActiveTimerStillRunning() {
        val timer = _uiState.value.activeTimer ?: return
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == timer.workspaceId } ?: return
        val pm = workspace.propertyMap
        if (workspace.timeEntriesDbId.isBlank() || pm.timeEntryStatusProp.isBlank() || pm.timeEntryStatusRunning.isBlank()) return
        val result = runCatching {
            notionRepo.fetchRunningTimers(workspace.timeEntriesDbId, pm.timeEntryStatusProp, pm.timeEntryStatusRunning, pm.timeEntryDateProp)
        }
        if (result.isFailure) {
            // Keep timer running on network/temporary failure
            return
        }
        val running = result.getOrThrow()
        if (running.none { it.pageId == timer.notionPageId }) {
            tickJob?.cancel()
            stopService()
            settingsRepo.clearActiveTimer()
            _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L, infoToast = "timer_stopped_elsewhere") }
            
            val next = running.firstOrNull()
            if (next != null) {
                val nextInfo = RunningTimerInfo(
                    pageId = next.pageId,
                    title = next.title,
                    startISO = next.startISO,
                    url = next.url,
                    workspaceId = workspace.id,
                    workspaceName = workspace.name,
                    propertyMap = pm
                )
                loadRunningTimer(nextInfo)
            }
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
            // The description may be cleared; the page itself never gets an empty
            // title (that reads as "Untitled" in Notion), so it falls back to the
            // entry's start date — same as when it was started without one.
            val newDescription = description.trim()
            val startMs = runCatching { parseIso(timer.rawStart) }.getOrDefault(System.currentTimeMillis())
            val newTitle = newDescription.ifBlank { fallbackDescription(startMs, state.dateFormat) }
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
                    val updated = timer.copy(description = newDescription, projectId = projectId, projectName = projectName, extraValues = extraValues)
                    _uiState.update { it.copy(activeTimer = updated, description = newDescription, selectedProjectId = projectId, extraValues = extraValues, editTimerOpen = false) }
                    settingsRepo.saveActiveTimer(updated)
                    // Update foreground service notification immediately
                    val ws = state.workspaces.firstOrNull { it.id == updated.workspaceId }
                    if (ws != null) {
                        runCatching {
                            app.startForegroundService(
                                TimerForegroundService.buildStartIntent(app, updated, ws.name, ws.roundingMinutes, ws.color)
                            )
                        }.onFailure { e ->
                            android.util.Log.e("TimerViewModel", "Failed to start foreground service on update", e)
                        }
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
            runCatching {
                val nowMs = System.currentTimeMillis()
                val rawStartISO = toNotionDateTime(nowMs)

                val project = state.projects.firstOrNull { it.id == state.selectedProjectId }
                val projectName = project?.name ?: ""
                // An empty description becomes the start date on the Notion page;
                // the description input stays empty so nothing is pre-filled.
                val description = state.description.trim()
                val title = description.ifBlank { fallbackDescription(nowMs, state.dateFormat) }

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

                runCatching {
                    app.startForegroundService(
                        TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes, workspace.color)
                    )
                }.onFailure { e ->
                    android.util.Log.e("TimerViewModel", "Failed to start foreground service on startTimer", e)
                }

                timer to nowMs
            }.onSuccess { (timer, startMs) ->
                tickStartMs = startMs
                _uiState.update { it.copy(running = true, activeTimer = timer, description = timer.description, isStarting = false, elapsedSeconds = 0L) }
                startTicking(startMs)
                loadRunningTimers()
                loadRecentEntries()
                syncServiceNotifications()
            }.onFailure { err ->
                _uiState.update { it.copy(isStarting = false, error = err.message ?: "Could not start timer") }
            }
        }
    }

    private sealed class StopResult {
        object Success : StopResult()
        object Deleted : StopResult()
        data class Failed(val message: String) : StopResult()
    }

    /**
     * Stops the currently active timer's Notion page and clears the local
     * "active" slot (tickJob cancelled, uiState reset to not-running). Does
     * not touch `runningTimers` or the foreground service — callers decide
     * what happens next (promote another running timer, leave idle, or
     * immediately start a new one).
     */
    private suspend fun stopActivePage(manualEndMs: Long? = null): StopResult {
        val timer = _uiState.value.activeTimer ?: return StopResult.Success
        val workspace = _uiState.value.workspaces.firstOrNull { it.id == timer.workspaceId }
        val rounding = workspace?.roundingMinutes ?: 15

        val outcome = runCatching {
            val rawStartMs = parseIso(timer.rawStart)
            val startMs = if (rounding == 0) rawStartMs else roundToNearest(rawStartMs, rounding)
            val nowMs = manualEndMs ?: System.currentTimeMillis()
            val endMs = if (rounding == 0) nowMs else {
                val minEnd = startMs + rounding * 60_000L
                val rounded = roundToNearest(nowMs, rounding)
                if (rounded < minEnd) minEnd else rounded
            }
            notionRepo.stopTimeEntry(
                pageId = timer.notionPageId,
                startISO = toNotionDateTime(startMs),
                endISO = toNotionDateTime(endMs),
                propertyMap = timer.propertyMap
            )
        }

        if (outcome.isSuccess) {
            settingsRepo.clearActiveTimer()
            tickJob?.cancel()
            _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L) }
            return StopResult.Success
        }

        val msg = outcome.exceptionOrNull()?.message ?: ""
        if (isPageDeletedError(msg)) {
            settingsRepo.clearActiveTimer()
            tickJob?.cancel()
            _uiState.update { it.copy(running = false, activeTimer = null, elapsedSeconds = 0L) }
            return StopResult.Deleted
        }
        return StopResult.Failed(msg.ifBlank { "Could not stop timer" })
    }

    fun stopTimer(manualEndMs: Long? = null) {
        val state = _uiState.value
        val timer = state.activeTimer ?: return

        val workspace = state.workspaces.firstOrNull { it.id == timer.workspaceId }
        if (workspace?.descriptionRequired == true && state.description.isBlank()) {
            _uiState.update { it.copy(stopError = "description_before_stopping") }
            return
        }

        if (state.extraFieldDefs.any { def ->
                def.required && (state.extraValues[def.propName]?.isBlank() != false)
            }) {
            _uiState.update { it.copy(stopError = "required_fields_before_stopping") }
            return
        }

        _uiState.update { it.copy(isStopping = true, stopError = null) }

        viewModelScope.launch {
            val stoppedPageId = timer.notionPageId
            val stoppedTitle = state.description
            when (val result = stopActivePage(manualEndMs)) {
                is StopResult.Success -> {
                    val remainingRunning = _uiState.value.runningTimers.filter { it.pageId != stoppedPageId }
                    _uiState.update { it.copy(isStopping = false, runningTimers = remainingRunning, stopError = null) }
                    if (remainingRunning.isNotEmpty()) {
                        loadRunningTimer(remainingRunning.first())
                    } else {
                        stopService()
                    }
                    loadRunningTimers()
                    loadRecentEntries()
                    syncServiceNotifications()
                }
                is StopResult.Deleted -> {
                    val remainingRunning = _uiState.value.runningTimers.filter { it.pageId != stoppedPageId }
                    _uiState.update { it.copy(isStopping = false, runningTimers = remainingRunning, deletedPageDialogVisible = true, deletedPageDialogTitle = stoppedTitle.ifBlank { null }) }
                    if (remainingRunning.isNotEmpty()) {
                        loadRunningTimer(remainingRunning.first())
                    } else {
                        stopService()
                    }
                }
                is StopResult.Failed -> {
                    _uiState.update { it.copy(isStopping = false, stopError = result.message) }
                }
            }
        }
    }

    /**
     * Stops the currently active timer, then runs [onStopped]. Used by the
     * "already running" confirmation flow ("+"/presets/shortcuts): the app
     * never keeps two timers running side by side, so starting a new one
     * while one is active always stops the old one first.
     */
    private fun stopActiveAndThen(onStopped: suspend () -> Unit) {
        if (!_uiState.value.running) {
            viewModelScope.launch { onStopped() }
            return
        }
        viewModelScope.launch {
            when (val result = stopActivePage()) {
                is StopResult.Success -> {
                    stopService()
                    loadRunningTimers()
                    loadRecentEntries()
                    onStopped()
                }
                is StopResult.Deleted -> {
                    stopService()
                    _uiState.update { it.copy(deletedPageDialogVisible = true, deletedPageDialogTitle = null) }
                }
                is StopResult.Failed -> {
                    _uiState.update { it.copy(error = result.message) }
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
        viewModelScope.launch {
            settingsRepo.saveActiveTimer(updated)
            if (timer.propertyMap.timeEntryDateProp.isBlank()) return@launch
            runCatching {
                notionRepo.updatePageProperties(
                    timer.notionPageId,
                    mapOf(timer.propertyMap.timeEntryDateProp to mapOf("date" to mapOf("start" to newStartISO, "end" to null)))
                )
            }.onFailure { err ->
                val msg = err.message ?: ""
                if (isPageDeletedError(msg)) {
                    _uiState.update { it.copy(deletedPageDialogVisible = true, deletedPageDialogTitle = timer.description.ifBlank { null }) }
                } else {
                    _uiState.update { it.copy(error = msg) }
                }
            }
        }
    }

    fun handleTimerStoppedFromService(stoppedPageId: String? = null) {
        val state = _uiState.value
        tickJob?.cancel()

        val pageToFilter = stoppedPageId ?: state.activeTimer?.notionPageId
        val remainingRunning = if (pageToFilter != null) {
            state.runningTimers.filter { it.pageId != pageToFilter }
        } else {
            state.runningTimers
        }
        val wasActive = state.activeTimer?.notionPageId == pageToFilter

        if (remainingRunning.isNotEmpty() && wasActive) {
            _uiState.update { it.copy(
                running = false,
                activeTimer = null,
                elapsedSeconds = 0L,
                isStopping = false,
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
                runningTimers = remainingRunning
            ) }
        }
        loadRunningTimers()
        loadRecentEntries()
        syncServiceNotifications()
    }

    suspend fun loadRunningTimersSuspending() {
        val state = _uiState.value
        if (state.apiKey.isBlank() || state.workspaces.isEmpty()) return

        _uiState.update { it.copy(runningTimersLoading = true) }

        val allRunning = mutableListOf<RunningTimerInfo>()
        for (ws in state.workspaces) {
            val pm = ws.propertyMap
            if (ws.timeEntriesDbId.isBlank() || pm.timeEntryStatusProp.isBlank() ||
                pm.timeEntryStatusRunning.isBlank()) continue
            val result = runCatching {
                notionRepo.fetchRunningTimers(
                    ws.timeEntriesDbId, pm.timeEntryStatusProp,
                    pm.timeEntryStatusRunning, pm.timeEntryDateProp
                )
            }
            if (result.isFailure) {
                // Keep previously fetched running timers for this workspace
                val prevForWs = state.runningTimers.filter { it.workspaceId == ws.id }
                allRunning.addAll(prevForWs)
            } else {
                result.getOrThrow().forEach { res ->
                    allRunning.add(RunningTimerInfo(
                        pageId = res.pageId,
                        title = res.title,
                        startISO = res.startISO,
                        url = res.url,
                        workspaceId = ws.id,
                        workspaceName = ws.name,
                        propertyMap = pm
                    ))
                }
            }
        }
        allRunning.sortByDescending { it.startISO }
        // Merge deltas into the existing list instead of replacing it wholesale, so
        // entries that are still running keep their identity/position (no flicker or
        // momentary disappearance while switching timers).
        _uiState.update { it.copy(runningTimersLoading = false, runningTimers = mergeById(it.runningTimers, allRunning) { r -> r.pageId }) }
        syncServiceNotifications()
        val updatedState = _uiState.value
        if (!updatedState.running && updatedState.activeTimer == null && allRunning.isNotEmpty()) {
            loadRunningTimer(allRunning.first())
        }
    }

    fun loadRunningTimers() {
        if (_uiState.value.runningTimersLoading) return
        viewModelScope.launch {
            loadRunningTimersSuspending()
        }
    }

    fun loadRecentEntries() {
        val state = _uiState.value
        if (state.apiKey.isBlank() ||
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
            val top = allRecent.take(15)
            // Merge deltas (keeping existing entries' identity), then re-apply the
            // recent ordering so newly completed entries surface without a full reload.
            _uiState.update { state ->
                val topIds = top.map { it.pageId }.toSet()
                val merged = mergeById(state.recentEntries, top) { r -> r.pageId }
                    .filter { it.pageId in topIds }
                    .sortedByDescending { it.endISO ?: it.startISO ?: "" }
                state.copy(recentEntriesLoading = false, recentEntries = merged)
            }
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

        val startMs = runCatching { parseIso(rt.startISO) }.getOrElse { System.currentTimeMillis() }
        // A title this app generated for an empty description reads back as an
        // empty description, so the input is never pre-filled with a date.
        val description = if (isFallbackDescription(rt.title, startMs, state.dateFormat)) "" else rt.title

        val timer = ActiveTimer(
            notionPageId = rt.pageId,
            roundedStart = rt.startISO,
            rawStart = rt.startISO,
            workspaceId = rt.workspaceId,
            projectId = null,
            projectName = "",
            description = description,
            propertyMap = rt.propertyMap
        )

        // Switch foreground service to show the loaded timer
        runCatching {
            app.startForegroundService(
                TimerForegroundService.buildStartIntent(app, timer, workspace.name, workspace.roundingMinutes, workspace.color)
            )
        }.onFailure { e ->
            android.util.Log.e("TimerViewModel", "Failed to start foreground service on loadRunningTimer", e)
        }

        tickStartMs = startMs

        val others = state.runningTimers.filter { it.pageId != rt.pageId }.toMutableList()
        if (previouslyActive != null) others.add(previouslyActive)

        _uiState.update { it.copy(
            running = true,
            activeTimer = timer,
            elapsedSeconds = 0L,
            runningTimers = others,
            description = description,
            selectedWorkspaceId = rt.workspaceId
        )}
        startTicking(startMs)
        viewModelScope.launch { settingsRepo.saveActiveTimer(timer) }
        selectWorkspace(rt.workspaceId)
        syncServiceNotifications()

        // The running-timers list only carries title/start/url, so fetch the page's
        // full properties to restore its connected project and extra field values.
        viewModelScope.launch { refreshActiveTimerFieldsFromNotion(rt.pageId, workspace, rt.propertyMap) }
    }

    /**
     * Retries a Notion call up to [attempts] times with a short delay between tries.
     * Adopting a timer fires several Notion calls at once (running timers, recent
     * entries, this device's own workspace schema fetch, and this call's page
     * properties + schema fetch) — a single transient failure or momentary rate
     * limit among them shouldn't leave extra field values blank until the next
     * scheduled sync. Returns null once every attempt has failed.
     */
    private suspend fun <T> retryNotionCall(attempts: Int = 3, block: suspend () -> T): T? {
        repeat(attempts) { attempt ->
            val result = runCatching { block() }
            if (result.isSuccess) return result.getOrNull()
            if (attempt < attempts - 1) delay(1000L * (attempt + 1))
        }
        return null
    }

    /**
     * Re-reads the active timer's connected project and extra field values straight
     * from its Notion page, so Notion stays the source of truth instead of whatever
     * was last cached locally (e.g. if the page was edited directly in Notion, or
     * from another device, while this device had it loaded). Called when a running
     * timer is first loaded, and on every subsequent sync (manual refresh, 60s
     * auto-refresh) while it's still the active one.
     */
    private suspend fun refreshActiveTimerFieldsFromNotion(pageId: String, workspace: Workspace, propertyMap: PropertyMap) {
        val props = retryNotionCall { notionRepo.fetchPageProperties(pageId) } ?: return
        if (_uiState.value.activeTimer?.notionPageId != pageId) return

        val relProp = propertyMap.timeEntryRelationProp
        val projectId = relProp.takeIf { it.isNotBlank() }
            ?.let { parsePropertyValue(props.getAsJsonObject(it), "relation") }
            ?.split(",")?.firstOrNull { it.isNotBlank() }
        val projectName = if (projectId != null && workspace.projectsDbId.isNotBlank()) {
            runCatching { notionRepo.fetchDatabasePages(workspace.projectsDbId) }.getOrDefault(emptyList())
                .firstOrNull { it.id == projectId }?.name ?: ""
        } else ""

        // workspace.extraProps[].type is not a reliable source of the real Notion
        // property type (it's never populated on save) — fetch the live schema,
        // same as loadExtraFieldDefs does, to know how to parse each value. If the
        // schema still can't be fetched after retrying, bail out entirely instead
        // of falling back to an empty schema: every extra value would then parse
        // as blank (prop.type is never populated either) and overwrite whatever
        // correct values were already showing — a stale-but-right value beats a
        // freshly-wrong one.
        val extraValues = if (workspace.extraProps.isEmpty() || workspace.timeEntriesDbId.isBlank()) {
            emptyMap()
        } else {
            val schema = retryNotionCall { notionRepo.getDatabaseSchema(workspace.timeEntriesDbId) } ?: return
            workspace.extraProps.associate { prop ->
                val type = schema[prop.propName]?.type ?: prop.type
                prop.propName to parsePropertyValue(props.getAsJsonObject(prop.propName), type)
            }
        }

        val updatedTimer = _uiState.value.activeTimer?.takeIf { it.notionPageId == pageId }
            ?.copy(projectId = projectId, projectName = projectName, extraValues = extraValues) ?: return

        _uiState.update { it.copy(
            activeTimer = updatedTimer,
            selectedProjectId = projectId,
            extraValues = extraValues
        )}
        settingsRepo.saveActiveTimer(updatedTimer)
    }

    /** Refetches the active timer's fields from Notion, if there is one. Safe to call
     *  from any sync path (manual refresh, periodic auto-refresh). */
    private suspend fun refreshActiveTimerFieldsIfRunning() {
        val state = _uiState.value
        val timer = state.activeTimer ?: return
        val workspace = state.workspaces.firstOrNull { it.id == timer.workspaceId } ?: return
        refreshActiveTimerFieldsFromNotion(timer.notionPageId, workspace, timer.propertyMap)
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
                val remainingRunning = _uiState.value.runningTimers.filter { t -> t.pageId != rt.pageId }
                _uiState.update { it.copy(runningTimers = remainingRunning) }
            }.onFailure { err ->
                _uiState.update { it.copy(error = err.message ?: "Could not stop timer") }
            }
        }
    }

    private var pendingActionAfterWarning: (() -> Unit)? = null

    fun onConfirmAlreadyRunning() {
        _uiState.update { it.copy(showAlreadyRunningWarning = false) }
        val action = pendingActionAfterWarning
        pendingActionAfterWarning = null
        action?.invoke()
    }

    fun onCancelAlreadyRunning() {
        _uiState.update { it.copy(showAlreadyRunningWarning = false) }
        pendingActionAfterWarning = null
    }

    // Only reachable while a timer is running; stops it (via the confirmation
    // dialog) and drops back to the idle form so a fresh timer can be composed.
    fun onPlusButtonClicked() {
        if (!_uiState.value.running) return
        pendingActionAfterWarning = {
            stopActiveAndThen {}
        }
        _uiState.update { it.copy(showAlreadyRunningWarning = true) }
    }

    fun applyPreset(workspaceId: String, preset: Preset) {
        val action: suspend () -> Unit = {
            val state = _uiState.value
            val workspace = state.workspaces.firstOrNull { it.id == workspaceId }
            if (workspace != null) {
                if (state.selectedWorkspaceId != workspaceId) {
                    _uiState.update { it.copy(
                        selectedWorkspaceId = workspaceId,
                        extraFieldDefs = emptyList(),
                        extrasLoading = workspace.extraProps.isNotEmpty()
                    )}
                    settingsRepo.saveLastWorkspaceId(workspaceId)
                }
                // startTimer() only writes a property if it has a loaded def for it, so
                // this must be awaited before merging the preset's values in — otherwise,
                // if defs for this workspace are still loading (e.g. a shortcut/preset
                // fired right after launch, before the workspace's own selectWorkspace()
                // load finished), the preset's defaults would silently be dropped.
                if (_uiState.value.extraFieldDefs.isEmpty() && workspace.extraProps.isNotEmpty()) {
                    loadExtraFieldDefs(workspace)
                }
            }
            _uiState.update { it.copy(
                description = preset.pageTitle,
                extraValues = it.extraValues.toMutableMap().also { map ->
                    preset.extraValues.forEach { (k, v) -> map[k] = v }
                }
            )}
            startTimer()
        }

        if (_uiState.value.running) {
            pendingActionAfterWarning = {
                stopActiveAndThen { action() }
            }
            _uiState.update { it.copy(showAlreadyRunningWarning = true) }
        } else {
            viewModelScope.launch { action() }
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
        
        viewModelScope.launch {
            loadRunningTimersSuspending()
            applyPreset(workspaceId, preset)
        }
    }

    /**
     * "Play" on a recent entry: starts a new timer in the same workspace, with
     * the same description, connected project and extra field values as that
     * entry — but starting now, with no end. Mirrors applyPreset's flow, except
     * the project/extra values are read from the source Notion page (its own
     * schema-backed source of truth) rather than from a saved preset.
     */
    fun startFromRecentEntry(entry: RecentEntryInfo) {
        val action: suspend () -> Unit = {
            val state = _uiState.value
            val workspace = state.workspaces.firstOrNull { it.id == entry.workspaceId }
            if (workspace != null) {
                if (state.selectedWorkspaceId != entry.workspaceId) {
                    _uiState.update { it.copy(
                        selectedWorkspaceId = entry.workspaceId,
                        extraFieldDefs = emptyList(),
                        extrasLoading = workspace.extraProps.isNotEmpty()
                    )}
                    settingsRepo.saveLastWorkspaceId(entry.workspaceId)
                    loadExtraFieldDefs(workspace)
                }

                val startMs = entry.startISO?.let { iso -> runCatching { parseIso(iso) }.getOrNull() }
                    ?: System.currentTimeMillis()
                // A title this app generated for an empty description reads back as an
                // empty description, so the input is never pre-filled with a date.
                val description = if (isFallbackDescription(entry.title, startMs, state.dateFormat)) "" else entry.title
                _uiState.update { it.copy(description = description) }

                // Restore the connected project and extra field values straight from the
                // source page, matching the current database schema (same approach as
                // refreshActiveTimerFieldsFromNotion for an already-running timer).
                val props = runCatching { notionRepo.fetchPageProperties(entry.pageId) }.getOrNull()
                if (props != null) {
                    val relProp = workspace.propertyMap.timeEntryRelationProp
                    val projectId = relProp.takeIf { it.isNotBlank() }
                        ?.let { parsePropertyValue(props.getAsJsonObject(it), "relation") }
                        ?.split(",")?.firstOrNull { it.isNotBlank() }

                    val schema = if (workspace.extraProps.isNotEmpty() && workspace.timeEntriesDbId.isNotBlank()) {
                        runCatching { notionRepo.getDatabaseSchema(workspace.timeEntriesDbId) }.getOrDefault(emptyMap())
                    } else emptyMap()
                    val extraValues = workspace.extraProps.associate { prop ->
                        val type = schema[prop.propName]?.type ?: prop.type
                        prop.propName to parsePropertyValue(props.getAsJsonObject(prop.propName), type)
                    }
                    _uiState.update { it.copy(selectedProjectId = projectId, extraValues = extraValues) }
                }
                startTimer()
            }
        }

        if (_uiState.value.running) {
            pendingActionAfterWarning = {
                stopActiveAndThen { action() }
            }
            _uiState.update { it.copy(showAlreadyRunningWarning = true) }
        } else {
            viewModelScope.launch { action() }
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

    /**
     * Merges [incoming] into [current] keyed by [id]: existing entries keep their
     * position and are updated in place, entries no longer present are dropped, and
     * genuinely new entries are appended. Avoids clearing/reloading the whole list.
     */
    private fun <T> mergeById(current: List<T>, incoming: List<T>, id: (T) -> String): List<T> {
        val incomingById = incoming.associateBy(id)
        val merged = current.filter { incomingById.containsKey(id(it)) }
            .map { incomingById.getValue(id(it)) }
        val existingIds = merged.map(id).toSet()
        return merged + incoming.filter { id(it) !in existingIds }
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

    private fun formatDate(ms: Long, dateFormat: String): String {
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = ms }
        val day = cal.get(java.util.Calendar.DAY_OF_MONTH)
        val month = cal.get(java.util.Calendar.MONTH) + 1
        val year = cal.get(java.util.Calendar.YEAR)
        return when (dateFormat) {
            "MM/DD/YYYY" -> "%02d/%02d/%04d".format(month, day, year)
            "YYYY-MM-DD" -> "%04d-%02d-%02d".format(year, month, day)
            else -> "%02d/%02d/%04d".format(day, month, year)
        }
    }

    /**
     * The page title written to Notion when the description is left empty: the
     * entry's own start date, in the format chosen in Settings. The description
     * input itself is never pre-filled with it — the fallback only ever exists
     * on the Notion page.
     */
    private fun fallbackDescription(startMs: Long, dateFormat: String): String =
        formatDate(startMs, dateFormat)

    /**
     * True when [title] is a title this app generated for an empty description
     * on [startMs]. Every date format is checked, not just the current one, so a
     * title written before the setting was changed is still recognised.
     */
    private fun isFallbackDescription(title: String, startMs: Long, dateFormat: String): Boolean {
        val trimmed = title.trim()
        if (trimmed.isBlank()) return false
        return (DATE_FORMATS + dateFormat).any { formatDate(startMs, it) == trimmed }
    }

    fun saveCurrentAsPreset(name: String) {
        val state = _uiState.value
        val workspaceId = state.selectedWorkspaceId ?: return
        val workspace = state.workspaces.firstOrNull { it.id == workspaceId } ?: return
        val currentPresets = workspace.presets
        
        val newPreset = Preset(
            id = java.util.UUID.randomUUID().toString(),
            name = name,
            pageTitle = state.description,
            extraValues = state.extraValues
        )
        val updatedWorkspace = workspace.copy(presets = currentPresets + newPreset)
        val updatedWorkspaces = state.workspaces.map {
            if (it.id == workspaceId) updatedWorkspace else it
        }
        
        _uiState.update { it.copy(workspaces = updatedWorkspaces) }
        viewModelScope.launch {
            settingsRepo.saveWorkspaces(updatedWorkspaces)
            ShortcutHelper.updateShortcuts(app, updatedWorkspaces)
        }
    }

    fun deletePreset(workspaceId: String, presetId: String) {
        val state = _uiState.value
        val workspaces = state.workspaces.map { ws ->
            if (ws.id == workspaceId) {
                ws.copy(presets = ws.presets.filter { it.id != presetId })
            } else ws
        }
        _uiState.update { it.copy(workspaces = workspaces) }
        viewModelScope.launch {
            settingsRepo.saveWorkspaces(workspaces)
            ShortcutHelper.updateShortcuts(app, workspaces)
        }
    }

    fun movePresetUp(workspaceId: String, presetId: String) {
        val state = _uiState.value
        val workspaces = state.workspaces.map { ws ->
            if (ws.id == workspaceId) {
                val list = ws.presets.toMutableList()
                val idx = list.indexOfFirst { it.id == presetId }
                if (idx > 0) {
                    val temp = list[idx]
                    list[idx] = list[idx - 1]
                    list[idx - 1] = temp
                }
                ws.copy(presets = list)
            } else ws
        }
        _uiState.update { it.copy(workspaces = workspaces) }
        viewModelScope.launch {
            settingsRepo.saveWorkspaces(workspaces)
            ShortcutHelper.updateShortcuts(app, workspaces)
        }
    }

    fun movePresetDown(workspaceId: String, presetId: String) {
        val state = _uiState.value
        val workspaces = state.workspaces.map { ws ->
            if (ws.id == workspaceId) {
                val list = ws.presets.toMutableList()
                val idx = list.indexOfFirst { it.id == presetId }
                if (idx in 0 until list.size - 1) {
                    val temp = list[idx]
                    list[idx] = list[idx + 1]
                    list[idx + 1] = temp
                }
                ws.copy(presets = list)
            } else ws
        }
        _uiState.update { it.copy(workspaces = workspaces) }
        viewModelScope.launch {
            settingsRepo.saveWorkspaces(workspaces)
            ShortcutHelper.updateShortcuts(app, workspaces)
        }
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

        /** Reverse of [buildPropertyValue]: reads a Notion page property's raw JSON
         *  value back into the string format used by extraValues/ExtraFieldInput. */
        fun parsePropertyValue(prop: com.google.gson.JsonObject?, type: String): String {
            prop ?: return ""
            return when (type) {
                "rich_text" -> prop.getAsJsonArray("rich_text")
                    ?.joinToString("") { it.asJsonObject.get("plain_text")?.asString ?: "" } ?: ""
                "number" -> prop.get("number")?.takeIf { !it.isJsonNull }?.asString ?: ""
                "checkbox" -> if (prop.get("checkbox")?.takeIf { !it.isJsonNull }?.asBoolean == true) "true" else "false"
                "select" -> prop.getAsJsonObject("select")?.get("name")?.asString ?: ""
                "status" -> prop.getAsJsonObject("status")?.get("name")?.asString ?: ""
                "multi_select" -> prop.getAsJsonArray("multi_select")
                    ?.joinToString(",") { it.asJsonObject.get("name")?.asString ?: "" } ?: ""
                "date" -> prop.getAsJsonObject("date")?.get("start")?.asString ?: ""
                "url" -> prop.get("url")?.takeIf { !it.isJsonNull }?.asString ?: ""
                "email" -> prop.get("email")?.takeIf { !it.isJsonNull }?.asString ?: ""
                "phone_number" -> prop.get("phone_number")?.takeIf { !it.isJsonNull }?.asString ?: ""
                "people" -> prop.getAsJsonArray("people")
                    ?.joinToString(",") { it.asJsonObject.get("id")?.asString ?: "" } ?: ""
                "relation" -> prop.getAsJsonArray("relation")
                    ?.joinToString(",") { it.asJsonObject.get("id")?.asString ?: "" } ?: ""
                "files" -> prop.getAsJsonArray("files")?.firstOrNull()?.asJsonObject
                    ?.getAsJsonObject("external")?.get("url")?.asString ?: ""
                else -> ""
            }
        }
    }

    fun syncServiceNotifications() {
        val state = _uiState.value
        // Only the active timer (the one shown in the running view) has a permanent
        // notification. When there is no active timer there is nothing to surface, so
        // make sure any existing service is stopped instead. Starting a service only to
        // immediately stopSelf() risks a ForegroundServiceDidNotStartInTimeException.
        val active = state.activeTimer
        if (active == null) {
            stopService()
            return
        }
        val intent = Intent(app, TimerForegroundService::class.java).apply {
            action = TimerForegroundService.ACTION_SYNC_TIMERS
            putExtra("active_page_id", active.notionPageId)
            putExtra("active_title", active.description)
            putExtra("active_start_iso", active.rawStart)
            val ws = state.workspaces.firstOrNull { it.id == active.workspaceId }
            putExtra("active_workspace_name", ws?.name ?: "")
            putExtra("active_workspace_color", ws?.color)
            putExtra("active_rounding_minutes", ws?.roundingMinutes ?: 15)
        }
        runCatching {
            app.startForegroundService(intent)
        }.onFailure { e ->
            android.util.Log.e("TimerViewModel", "Failed to sync service notifications", e)
        }
    }

    override fun onCleared() {
        super.onCleared()
        tickJob?.cancel()
    }
}
