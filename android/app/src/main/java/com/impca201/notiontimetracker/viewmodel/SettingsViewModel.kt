package com.impca201.notiontimetracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.impca201.notiontimetracker.NotionTimeTrackerApp
import com.impca201.notiontimetracker.data.models.*
import com.impca201.notiontimetracker.ShortcutHelper
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
        /** The key currently persisted, so the UI can tell "nothing stored yet"
         *  apart from "stored key, field edited". */
        val savedApiKey: String = "",
        val apiKeyVisible: Boolean = false,
        val workspaces: List<Workspace> = emptyList(),
        val timerRunning: Boolean = false,
        val testingKey: Boolean = false,
        val keyTestSuccess: Boolean = false,
        val keyTestError: String? = null,
        val snackbarMessage: String? = null,
        val themeMode: ThemeMode = ThemeMode.AUTO,
        val dynamicColor: Boolean = false,
        val locale: String = "system",
        val dateFormat: String = "DD/MM/YYYY",
        val timeFormat: String = "24h",
        val showNotionLink: Boolean = true,
        val showArchiveAction: Boolean = true,
        val syncPageId: String? = null,
        val syncPageTitle: String = "",
        val syncing: Boolean = false,
        val syncError: String? = null
    )

    data class WorkspaceEditState(
        val isNew: Boolean = true,
        val workspaceId: String = UUID.randomUUID().toString(),
        val name: String = "",
        val color: String = "",
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
        val descriptionRequired: Boolean = false,
        val roundingMinutes: Int = 15,
        val presets: List<Preset> = emptyList(),
        val saving: Boolean = false,
        val saveError: String? = null,
        /** Identifies this editing session. Async loads carry the token they were
         *  started with and only apply while it still matches, so a response for a
         *  workspace (or database) the user has since left can never land in the
         *  form that is open now. */
        val session: Long = 0L
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _editState = MutableStateFlow<WorkspaceEditState?>(null)
    val editState: StateFlow<WorkspaceEditState?> = _editState.asStateFlow()

    private var editSessionCounter = 0L

    /** Applies [transform] only if the edit form is still the one identified by
     *  [session] (and, when given, still pointing at [dbId]). */
    private fun updateEditIfCurrent(
        session: Long,
        dbId: String? = null,
        transform: (WorkspaceEditState) -> WorkspaceEditState
    ) {
        _editState.update { state ->
            if (state == null || state.session != session) state
            else if (dbId != null && state.timeEntriesDbId != dbId) state
            else transform(state)
        }
    }

    private val settingsRepo get() = (app as NotionTimeTrackerApp).settingsRepository
    private val notionRepo get() = (app as NotionTimeTrackerApp).notionRepository
    private val syncer get() = (app as NotionTimeTrackerApp).settingsSyncer

    init {
        viewModelScope.launch {
            loadSettings()
            if (_uiState.value.apiKey.isNotBlank() && _uiState.value.syncPageId != null) syncNow()
        }
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
        val dynamicColor = settingsRepo.dynamicColorFlow.first()
        val locale = settingsRepo.localeFlow.first()
        val dateFormat = settingsRepo.dateFormatFlow.first()
        val timeFormat = settingsRepo.timeFormatFlow.first()
        val showNotionLink = settingsRepo.showNotionLinkFlow.first()
        val showArchiveAction = settingsRepo.showArchiveActionFlow.first()
        val syncPageId = settingsRepo.getSyncPageId()
        val syncPageTitle = settingsRepo.syncPageTitleFlow.first()
        _uiState.update { it.copy(
            apiKey = apiKey,
            savedApiKey = apiKey,
            workspaces = workspaces,
            themeMode = themeMode,
            dynamicColor = dynamicColor,
            locale = locale,
            dateFormat = dateFormat,
            timeFormat = timeFormat,
            showNotionLink = showNotionLink,
            showArchiveAction = showArchiveAction,
            syncPageId = syncPageId,
            syncPageTitle = syncPageTitle
        ) }
    }

    fun setShowNotionLink(enabled: Boolean) {
        _uiState.update { it.copy(showNotionLink = enabled) }
        viewModelScope.launch { settingsRepo.saveShowNotionLink(enabled); settingsRepo.touchSettingsUpdatedAt() }
    }

    fun setShowArchiveAction(enabled: Boolean) {
        _uiState.update { it.copy(showArchiveAction = enabled) }
        viewModelScope.launch { settingsRepo.saveShowArchiveAction(enabled); settingsRepo.touchSettingsUpdatedAt() }
    }

    fun setThemeMode(mode: ThemeMode) {
        _uiState.update { it.copy(themeMode = mode) }
        viewModelScope.launch { settingsRepo.saveThemeMode(mode); settingsRepo.touchSettingsUpdatedAt() }
    }

    fun setDynamicColor(enabled: Boolean) {
        // Device-local — not part of the synced payload.
        _uiState.update { it.copy(dynamicColor = enabled) }
        viewModelScope.launch { settingsRepo.saveDynamicColor(enabled) }
    }

    fun setLocale(locale: String, onSaved: () -> Unit = {}) {
        _uiState.update { it.copy(locale = locale) }
        viewModelScope.launch {
            // Persist before notifying, so a subsequent Activity.recreate() reads the
            // new locale in attachBaseContext() (otherwise the change needs an app restart).
            settingsRepo.saveLocale(locale)
            settingsRepo.touchSettingsUpdatedAt()
            onSaved()
        }
    }

    fun setDateFormat(format: String) {
        _uiState.update { it.copy(dateFormat = format) }
        viewModelScope.launch { settingsRepo.saveDateFormat(format); settingsRepo.touchSettingsUpdatedAt() }
    }

    fun setTimeFormat(format: String) {
        _uiState.update { it.copy(timeFormat = format) }
        viewModelScope.launch { settingsRepo.saveTimeFormat(format); settingsRepo.touchSettingsUpdatedAt() }
    }

    fun setTimerRunning(running: Boolean) = _uiState.update { it.copy(timerRunning = running) }

    fun setApiKey(key: String) = _uiState.update { it.copy(apiKey = key, keyTestError = null, keyTestSuccess = false) }

    fun toggleApiKeyVisible() = _uiState.update { it.copy(apiKeyVisible = !it.apiKeyVisible) }

    /** Removes the stored key. Only offered while one is actually stored. */
    fun removeApiKey() {
        viewModelScope.launch {
            settingsRepo.saveApiKey("")
            _uiState.update {
                it.copy(
                    apiKey = "",
                    savedApiKey = "",
                    keyTestSuccess = false,
                    keyTestError = null,
                    snackbarMessage = "api_key_removed"
                )
            }
        }
    }

    fun testAndSaveApiKey() {
        val key = _uiState.value.apiKey.trim()
        // Nothing to test or save; the button is disabled in this state anyway.
        if (key.isBlank()) return
        _uiState.update { it.copy(testingKey = true, keyTestError = null, keyTestSuccess = false) }
        viewModelScope.launch {
            runCatching { notionRepo.testConnectionWithKey(key) }
                .onSuccess {
                    settingsRepo.saveApiKey(key)
                    // Cached schemas/options belong to whatever integration the old key
                    // pointed at.
                    notionRepo.invalidateMetadataCache()
                    _uiState.update {
                        it.copy(
                            apiKey = key,
                            savedApiKey = key,
                            testingKey = false,
                            keyTestSuccess = true,
                            snackbarMessage = "api_key_saved"
                        )
                    }
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
        viewModelScope.launch { saveWorkspaces(list) }
    }

    fun moveWorkspaceDown(id: String) {
        val list = _uiState.value.workspaces.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0 || idx >= list.size - 1) return
        val tmp = list[idx + 1]; list[idx + 1] = list[idx]; list[idx] = tmp
        viewModelScope.launch { saveWorkspaces(list) }
    }

    fun deleteWorkspace(id: String) {
        val updated = _uiState.value.workspaces.filter { it.id != id }
        viewModelScope.launch { saveWorkspaces(updated) }
    }

    // --- Workspace edit ---

    fun openAddWorkspace() {
        _editState.value = WorkspaceEditState(isNew = true, session = ++editSessionCounter)
        loadDatabases()
    }

    fun openEditWorkspace(workspace: Workspace) {
        _editState.value = WorkspaceEditState(
            isNew = false,
            session = ++editSessionCounter,
            workspaceId = workspace.id,
            name = workspace.name,
            color = workspace.color,
            timeEntriesDbId = workspace.timeEntriesDbId,
            timeEntryDateProp = workspace.propertyMap.timeEntryDateProp,
            timeEntryStatusProp = workspace.propertyMap.timeEntryStatusProp,
            timeEntryStatusRunning = workspace.propertyMap.timeEntryStatusRunning,
            timeEntryStatusDone = workspace.propertyMap.timeEntryStatusDone,
            extraProps = workspace.extraProps,
            descriptionRequired = workspace.descriptionRequired,
            roundingMinutes = workspace.roundingMinutes,
            presets = workspace.presets
        )
        loadDatabases()
        if (workspace.timeEntriesDbId.isNotBlank()) loadSchema(workspace.timeEntriesDbId)
    }

    fun closeWorkspaceEdit() {
        // Bumping the token makes every in-flight load for this form a no-op, so it
        // cannot write into the next workspace the user opens.
        editSessionCounter++
        _editState.value = null
    }

    fun loadDatabases() {
        val session = _editState.value?.session ?: return
        _editState.update { it?.copy(databasesLoading = true, databasesError = null) }
        viewModelScope.launch {
            runCatching { notionRepo.searchDatabases() }
                .onSuccess { dbs -> updateEditIfCurrent(session) { it.copy(databases = dbs, databasesLoading = false) } }
                .onFailure { err -> updateEditIfCurrent(session) { it.copy(databasesLoading = false, databasesError = err.message) } }
        }
    }

    fun setWorkspaceName(name: String) = _editState.update { it?.copy(name = name) }

    fun setTimeEntriesDb(dbId: String) {
        _editState.update { state ->
            if (state == null || state.timeEntriesDbId == dbId) state
            else state.copy(
                timeEntriesDbId = dbId,
                schema = emptyMap(),
                schemaError = null,
                timeEntryDateProp = "",
                timeEntryStatusProp = "",
                timeEntryStatusRunning = "",
                timeEntryStatusDone = "",
                // Extra fields name properties of the previous database; keeping them
                // would save property names this database does not have, which then
                // silently disappear from the timer form.
                extraProps = if (state.timeEntriesDbId.isBlank()) state.extraProps else emptyList()
            )
        }
        if (dbId.isNotBlank()) loadSchema(dbId)
    }

    fun loadSchema(dbId: String) {
        val session = _editState.value?.session ?: return
        _editState.update { it?.copy(schemaLoading = true, schemaError = null) }
        viewModelScope.launch {
            // Always live: the whole point of this screen is to configure against the
            // database as it is right now.
            runCatching { notionRepo.getDatabaseSchema(dbId, forceRefresh = true) }
                .onSuccess { schema ->
                    updateEditIfCurrent(session, dbId) { it.copy(schema = schema, schemaLoading = false) }
                }
                .onFailure { err ->
                    updateEditIfCurrent(session, dbId) { it.copy(schemaLoading = false, schemaError = err.message) }
                }
        }
    }

    fun setDateProp(prop: String) = _editState.update { it?.copy(timeEntryDateProp = prop) }
    fun setStatusProp(prop: String) = _editState.update { it?.copy(timeEntryStatusProp = prop, timeEntryStatusRunning = "", timeEntryStatusDone = "") }
    fun setStatusRunning(opt: String) = _editState.update { it?.copy(timeEntryStatusRunning = opt) }
    fun setStatusDone(opt: String) = _editState.update { it?.copy(timeEntryStatusDone = opt) }
    fun setRounding(minutes: Int) = _editState.update { it?.copy(roundingMinutes = minutes) }
    fun setDescriptionRequired(required: Boolean) = _editState.update { it?.copy(descriptionRequired = required) }
    fun setColor(color: String) = _editState.update { it?.copy(color = color) }

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

    fun addPreset() {
        val current = _editState.value ?: return
        if (current.presets.size >= 5) return
        _editState.update { it?.copy(presets = it.presets + Preset(id = UUID.randomUUID().toString(), name = "")) }
    }

    fun removePreset(index: Int) {
        _editState.update { it?.copy(presets = it.presets.toMutableList().also { l -> if (index < l.size) l.removeAt(index) }) }
    }

    fun updatePreset(index: Int, preset: Preset) {
        _editState.update { state ->
            state?.copy(presets = state.presets.toMutableList().also { list ->
                if (index < list.size) list[index] = preset
            })
        }
    }

    fun saveWorkspace() {
        val edit = _editState.value ?: return
        if (!isEditValid(edit)) { _editState.update { it?.copy(saveError = "incomplete") }; return }

        val validExtraProps = edit.extraProps.filter { it.propName.isNotBlank() }

        _editState.update { it?.copy(saving = true) }
        viewModelScope.launch {
            val list = settingsRepo.getWorkspaces().toMutableList()
            val existing = list.firstOrNull { it.id == edit.workspaceId }

            // The title property and the "project" relation are derived from the live
            // schema, which is not always there — reopening a saved workspace while
            // offline (or rate limited) leaves it empty. Deriving from an empty schema
            // wrote back a title property of "Name" and an empty relation, quietly
            // breaking a workspace that was configured correctly, so an unavailable
            // schema keeps whatever was saved before instead.
            val schemaAvailable = edit.schema.isNotEmpty()
            val titleProp = if (schemaAvailable) {
                edit.schema.entries.firstOrNull { it.value.type == "title" }?.key ?: "Name"
            } else {
                existing?.propertyMap?.timeEntryTitleProp?.takeIf { it.isNotBlank() } ?: "Name"
            }
            val relPropName = if (schemaAvailable) {
                edit.schema.entries.firstOrNull { it.value.type == "relation" }?.key ?: ""
            } else {
                existing?.propertyMap?.timeEntryRelationProp ?: ""
            }
            val projectsDbId = if (schemaAvailable) {
                edit.schema[relPropName]?.relationDatabaseId ?: ""
            } else {
                existing?.projectsDbId ?: ""
            }

            val workspace = Workspace(
                id = edit.workspaceId,
                name = edit.name.trim(),
                color = edit.color.trim(),
                timeEntriesDbId = edit.timeEntriesDbId,
                projectsDbId = projectsDbId,
                roundingMinutes = edit.roundingMinutes,
                descriptionRequired = edit.descriptionRequired,
                propertyMap = PropertyMap(
                    timeEntryTitleProp = titleProp,
                    timeEntryDateProp = edit.timeEntryDateProp,
                    timeEntryStatusProp = edit.timeEntryStatusProp,
                    timeEntryStatusRunning = edit.timeEntryStatusRunning,
                    timeEntryRelationProp = relPropName,
                    timeEntryStatusDone = edit.timeEntryStatusDone
                ),
                extraProps = validExtraProps,
                presets = edit.presets.map { p ->
                    p.copy(name = p.name.trim(), pageTitle = p.pageTitle.trim())
                }
            )

            if (edit.isNew) list.add(workspace)
            else { val idx = list.indexOfFirst { it.id == workspace.id }; if (idx >= 0) list[idx] = workspace else list.add(workspace) }
            saveWorkspaces(list)
            // The timer screen builds its fields from the cached schema; the database
            // this workspace points at may just have changed.
            notionRepo.invalidateMetadataCache()
            editSessionCounter++
            _editState.value = null
            _uiState.update { it.copy(snackbarMessage = if (edit.isNew) "workspace_added:${workspace.name}" else "workspace_saved:${workspace.name}") }
        }
    }

    fun isEditValid(edit: WorkspaceEditState? = _editState.value): Boolean {
        edit ?: return false
        if (edit.name.isBlank() ||
            edit.timeEntriesDbId.isBlank() ||
            edit.timeEntryDateProp.isBlank() ||
            edit.timeEntryStatusProp.isBlank() ||
            edit.timeEntryStatusRunning.isBlank() ||
            edit.timeEntryStatusDone.isBlank() ||
            edit.timeEntryStatusRunning == edit.timeEntryStatusDone
        ) return false
        return true
    }

    fun isPresetValid(preset: Preset, extraProps: List<ExtraProp>): Boolean {
        if (preset.name.isBlank()) return true
        val required = extraProps.filter { it.required && it.propName.isNotBlank() }
        return required.all { ep -> !preset.extraValues[ep.propName].isNullOrBlank() }
    }

    private suspend fun saveWorkspaces(list: List<Workspace>) {
        settingsRepo.saveWorkspaces(list)
        ShortcutHelper.updateShortcuts(app, list)
        settingsRepo.touchSettingsUpdatedAt()
    }

    // ---- Notion-page sync ----

    suspend fun searchSyncPages(): List<NamedOption> = notionRepo.searchPages()

    fun createSyncPage(parentPageId: String, title: String) {
        if (title.isBlank() || parentPageId.isBlank()) return
        _uiState.update { it.copy(syncing = true, syncError = null) }
        viewModelScope.launch {
            try {
                val now = java.time.Instant.now().toString()
                val payload = syncer.buildPayload(now)
                val pageId = notionRepo.createSyncPage(parentPageId, title.trim(), payload)
                settingsRepo.saveSyncPage(pageId, title.trim())
                settingsRepo.saveSettingsUpdatedAt(now)
                settingsRepo.saveLastSyncedUpdatedAt(now)
                _uiState.update { it.copy(syncPageId = pageId, syncPageTitle = title.trim(), syncing = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(syncing = false, syncError = e.message) }
            }
        }
    }

    fun loadExistingSyncPage(pageId: String, title: String) {
        _uiState.update { it.copy(syncing = true, syncError = null) }
        viewModelScope.launch {
            try {
                val result = notionRepo.fetchSyncPageContent(pageId)
                if (result == null) {
                    _uiState.update { it.copy(syncing = false, syncError = "not_a_sync_page") }
                    return@launch
                }
                syncer.applyPayload(result.payload)
                settingsRepo.saveSyncPage(pageId, title)
                settingsRepo.saveSettingsUpdatedAt(result.payload.updatedAt)
                settingsRepo.saveLastSyncedUpdatedAt(result.payload.updatedAt)
                loadSettings()
                _uiState.update { it.copy(syncPageId = pageId, syncPageTitle = title, syncing = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(syncing = false, syncError = e.message) }
            }
        }
    }

    fun disconnectSync() {
        viewModelScope.launch { settingsRepo.clearSyncPage() }
        _uiState.update { it.copy(syncPageId = null, syncPageTitle = "") }
    }

    /** Pull-or-push against the configured sync page, whichever side is newer. */
    fun syncNow() {
        if (_uiState.value.syncPageId == null || _uiState.value.syncing) return
        _uiState.update { it.copy(syncing = true, syncError = null) }
        viewModelScope.launch {
            try {
                val ok = syncer.syncNow()
                if (!ok) {
                    _uiState.update { it.copy(syncing = false, syncError = "not_a_sync_page") }
                    return@launch
                }
                loadSettings()
                _uiState.update { it.copy(syncing = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(syncing = false, syncError = e.message) }
            }
        }
    }
}
