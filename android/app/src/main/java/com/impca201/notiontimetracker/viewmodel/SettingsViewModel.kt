package com.impca201.notiontimetracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.impca201.notiontimetracker.NotionTimeTrackerApp
import com.impca201.notiontimetracker.data.models.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

class SettingsViewModel(private val app: Application) : AndroidViewModel(app) {

    data class UiState(
        val apiKey: String = "",
        val apiKeyVisible: Boolean = false,
        val workspaces: List<Workspace> = emptyList(),
        val timerRunning: Boolean = false,
        val testingKey: Boolean = false,
        val keyTestSuccess: Boolean = false,
        val keyTestError: String? = null,
        val snackbarMessage: String? = null,
        val themeMode: ThemeMode = ThemeMode.AUTO
    )

    data class WorkspaceEditState(
        val isNew: Boolean = true,
        val workspaceId: String = UUID.randomUUID().toString(),
        val name: String = "",
        val databases: List<NamedOption> = emptyList(),
        val databasesLoading: Boolean = false,
        val databasesError: String? = null,
        val timeEntriesDbId: String = "",
        val schema: Map<String, SchemaProperty> = emptyMap(),
        val schemaLoading: Boolean = false,
        val schemaError: String? = null,
        val timeEntryDateProp: String = "",
        val timeEntryStatusProp: String = "",
        val timeEntryStatusRunning: String = "",
        val timeEntryStatusDone: String = "",
        val extraProps: List<ExtraProp> = emptyList(),
        val roundingMinutes: Int = 15,
        val saving: Boolean = false,
        val saveError: String? = null,
        val extraPropRelationPages: Map<Int, List<NamedOption>> = emptyMap(),
        val extraPropRelationLoading: Set<Int> = emptySet()
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _editState = MutableStateFlow<WorkspaceEditState?>(null)
    val editState: StateFlow<WorkspaceEditState?> = _editState.asStateFlow()

    private val settingsRepo get() = (app as NotionTimeTrackerApp).settingsRepository
    private val notionRepo get() = (app as NotionTimeTrackerApp).notionRepository

    init {
        viewModelScope.launch { loadSettings() }
        viewModelScope.launch {
            settingsRepo.workspacesFlow.collect { workspaces ->
                _uiState.update { it.copy(workspaces = workspaces) }
            }
        }
    }

    private suspend fun loadSettings() {
        val apiKey = settingsRepo.getApiKey()
        val workspaces = settingsRepo.getWorkspaces()
        val themeMode = settingsRepo.themeModeFlow.first()
        _uiState.update { it.copy(apiKey = apiKey, workspaces = workspaces, themeMode = themeMode) }
    }

    fun setThemeMode(mode: ThemeMode) {
        _uiState.update { it.copy(themeMode = mode) }
        viewModelScope.launch { settingsRepo.saveThemeMode(mode) }
    }

    fun importApiKey(key: String) {
        _uiState.update { it.copy(apiKey = key) }
        viewModelScope.launch { settingsRepo.saveApiKey(key) }
    }

    fun importWorkspaces(workspaces: List<Workspace>) {
        viewModelScope.launch { settingsRepo.saveWorkspaces(workspaces) }
    }

    fun setTimerRunning(running: Boolean) = _uiState.update { it.copy(timerRunning = running) }

    fun setApiKey(key: String) = _uiState.update { it.copy(apiKey = key, keyTestError = null, keyTestSuccess = false) }

    fun toggleApiKeyVisible() = _uiState.update { it.copy(apiKeyVisible = !it.apiKeyVisible) }

    fun testAndSaveApiKey() {
        val key = _uiState.value.apiKey.trim()
        if (key.isBlank()) return
        _uiState.update { it.copy(testingKey = true, keyTestError = null, keyTestSuccess = false) }
        viewModelScope.launch {
            runCatching { notionRepo.testConnectionWithKey(key) }
                .onSuccess {
                    settingsRepo.saveApiKey(key)
                    _uiState.update { it.copy(testingKey = false, keyTestSuccess = true, snackbarMessage = "api_key_saved") }
                }
                .onFailure { err ->
                    _uiState.update { it.copy(testingKey = false, keyTestError = err.message) }
                }
        }
    }

    fun clearSnackbar() = _uiState.update { it.copy(snackbarMessage = null) }

    // --- Workspace ordering ---

    fun moveWorkspaceUp(id: String) {
        val list = _uiState.value.workspaces.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx <= 0) return
        val tmp = list[idx - 1]; list[idx - 1] = list[idx]; list[idx] = tmp
        viewModelScope.launch { settingsRepo.saveWorkspaces(list) }
    }

    fun moveWorkspaceDown(id: String) {
        val list = _uiState.value.workspaces.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0 || idx >= list.size - 1) return
        val tmp = list[idx + 1]; list[idx + 1] = list[idx]; list[idx] = tmp
        viewModelScope.launch { settingsRepo.saveWorkspaces(list) }
    }

    fun deleteWorkspace(id: String) {
        val updated = _uiState.value.workspaces.filter { it.id != id }
        viewModelScope.launch { settingsRepo.saveWorkspaces(updated) }
    }

    // --- Workspace edit ---

    fun openAddWorkspace() {
        _editState.value = WorkspaceEditState(isNew = true)
        loadDatabases()
    }

    fun openEditWorkspace(workspace: Workspace) {
        _editState.value = WorkspaceEditState(
            isNew = false,
            workspaceId = workspace.id,
            name = workspace.name,
            timeEntriesDbId = workspace.timeEntriesDbId,
            timeEntryDateProp = workspace.propertyMap.timeEntryDateProp,
            timeEntryStatusProp = workspace.propertyMap.timeEntryStatusProp,
            timeEntryStatusRunning = workspace.propertyMap.timeEntryStatusRunning,
            timeEntryStatusDone = workspace.propertyMap.timeEntryStatusDone,
            extraProps = workspace.extraProps,
            roundingMinutes = workspace.roundingMinutes
        )
        loadDatabases()
        if (workspace.timeEntriesDbId.isNotBlank()) loadSchema(workspace.timeEntriesDbId)
    }

    fun closeWorkspaceEdit() { _editState.value = null }

    fun loadDatabases() {
        _editState.update { it?.copy(databasesLoading = true, databasesError = null) } ?: return
        viewModelScope.launch {
            runCatching { notionRepo.searchDatabases() }
                .onSuccess { dbs -> _editState.update { it?.copy(databases = dbs, databasesLoading = false) } }
                .onFailure { err -> _editState.update { it?.copy(databasesLoading = false, databasesError = err.message) } }
        }
    }

    fun setWorkspaceName(name: String) = _editState.update { it?.copy(name = name) }

    fun setTimeEntriesDb(dbId: String) {
        _editState.update { it?.copy(timeEntriesDbId = dbId, schema = emptyMap(), timeEntryDateProp = "", timeEntryStatusProp = "", timeEntryStatusRunning = "", timeEntryStatusDone = "") }
        if (dbId.isNotBlank()) loadSchema(dbId)
    }

    fun loadSchema(dbId: String) {
        _editState.update { it?.copy(schemaLoading = true, schemaError = null) } ?: return
        viewModelScope.launch {
            runCatching { notionRepo.getDatabaseSchema(dbId) }
                .onSuccess { schema -> _editState.update { it?.copy(schema = schema, schemaLoading = false) } }
                .onFailure { err -> _editState.update { it?.copy(schemaLoading = false, schemaError = err.message) } }
        }
    }

    fun setDateProp(prop: String) = _editState.update { it?.copy(timeEntryDateProp = prop) }
    fun setStatusProp(prop: String) = _editState.update { it?.copy(timeEntryStatusProp = prop, timeEntryStatusRunning = "", timeEntryStatusDone = "") }
    fun setStatusRunning(opt: String) = _editState.update { it?.copy(timeEntryStatusRunning = opt) }
    fun setStatusDone(opt: String) = _editState.update { it?.copy(timeEntryStatusDone = opt) }
    fun setRounding(minutes: Int) = _editState.update { it?.copy(roundingMinutes = minutes) }

    fun addExtraProp() {
        val current = _editState.value ?: return
        if (current.extraProps.size >= 5) return
        _editState.update { it?.copy(extraProps = it.extraProps + ExtraProp(propName = "")) }
    }

    fun removeExtraProp(index: Int) {
        _editState.update { it?.copy(extraProps = it.extraProps.toMutableList().also { l -> l.removeAt(index) }) }
    }

    fun setExtraPropName(index: Int, name: String) {
        _editState.update { state ->
            state?.copy(extraProps = state.extraProps.toMutableList().also { list ->
                if (index < list.size) list[index] = list[index].copy(propName = name, type = state.schema[name]?.type ?: "rich_text", defaultValue = null)
            })
        }
        val state = _editState.value ?: return
        if (state.schema[name]?.type == "relation") {
            val relDbId = state.schema[name]?.relationDatabaseId
            if (!relDbId.isNullOrBlank()) {
                _editState.update { it?.copy(extraPropRelationLoading = it.extraPropRelationLoading + index) }
                viewModelScope.launch {
                    val pages = runCatching { notionRepo.fetchDatabasePages(relDbId) }.getOrDefault(emptyList())
                    _editState.update { it?.copy(
                        extraPropRelationPages = it.extraPropRelationPages + (index to pages),
                        extraPropRelationLoading = it.extraPropRelationLoading - index
                    )}
                }
            }
        }
    }

    fun setExtraPropRequired(index: Int, required: Boolean) {
        _editState.update { state ->
            state?.copy(extraProps = state.extraProps.toMutableList().also { list ->
                if (index < list.size) list[index] = list[index].copy(required = required)
            })
        }
    }

    fun setExtraPropDefault(index: Int, default: String?) {
        _editState.update { state ->
            state?.copy(extraProps = state.extraProps.toMutableList().also { list ->
                if (index < list.size) list[index] = list[index].copy(defaultValue = default)
            })
        }
    }

    fun saveWorkspace() {
        val edit = _editState.value ?: return
        if (!isEditValid(edit)) { _editState.update { it?.copy(saveError = "incomplete") }; return }

        val validExtraProps = edit.extraProps.filter { it.propName.isNotBlank() }
        val relPropName = edit.schema.entries.firstOrNull { it.value.type == "relation" }?.key ?: ""
        val projectsDbId = edit.schema[relPropName]?.relationDatabaseId ?: ""
        val workspace = Workspace(
            id = edit.workspaceId,
            name = edit.name.trim(),
            timeEntriesDbId = edit.timeEntriesDbId,
            projectsDbId = projectsDbId,
            roundingMinutes = edit.roundingMinutes,
            propertyMap = PropertyMap(
                timeEntryTitleProp = edit.schema.entries.firstOrNull { it.value.type == "title" }?.key ?: "Name",
                timeEntryDateProp = edit.timeEntryDateProp,
                timeEntryStatusProp = edit.timeEntryStatusProp,
                timeEntryStatusRunning = edit.timeEntryStatusRunning,
                timeEntryRelationProp = relPropName,
                timeEntryStatusDone = edit.timeEntryStatusDone
            ),
            extraProps = validExtraProps
        )

        _editState.update { it?.copy(saving = true) }
        viewModelScope.launch {
            val list = settingsRepo.getWorkspaces().toMutableList()
            if (edit.isNew) list.add(workspace)
            else { val idx = list.indexOfFirst { it.id == workspace.id }; if (idx >= 0) list[idx] = workspace else list.add(workspace) }
            settingsRepo.saveWorkspaces(list)
            _editState.value = null
            _uiState.update { it.copy(snackbarMessage = if (edit.isNew) "workspace_added:${workspace.name}" else "workspace_saved:${workspace.name}") }
        }
    }

    fun isEditValid(edit: WorkspaceEditState? = _editState.value): Boolean {
        edit ?: return false
        return edit.name.isNotBlank() &&
            edit.timeEntriesDbId.isNotBlank() &&
            edit.timeEntryDateProp.isNotBlank() &&
            edit.timeEntryStatusProp.isNotBlank() &&
            edit.timeEntryStatusRunning.isNotBlank() &&
            edit.timeEntryStatusDone.isNotBlank()
    }
}
