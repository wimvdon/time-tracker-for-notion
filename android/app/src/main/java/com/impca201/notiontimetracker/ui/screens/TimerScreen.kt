package com.impca201.notiontimetracker.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.impca201.notiontimetracker.ui.components.parseWorkspaceColor
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.NamedOption
import com.impca201.notiontimetracker.data.models.Preset
import com.impca201.notiontimetracker.data.models.RecentEntryInfo
import com.impca201.notiontimetracker.data.models.RunningTimerInfo
import com.impca201.notiontimetracker.ui.components.EditTimerModal
import com.impca201.notiontimetracker.ui.components.ExtraFieldInput
import com.impca201.notiontimetracker.ui.components.RecoveryDialog
import com.impca201.notiontimetracker.ui.components.SearchableDropdown
import com.impca201.notiontimetracker.viewmodel.TimerViewModel
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TimerScreen(
    uiState: TimerViewModel.UiState,
    onWorkspaceSelect: (String) -> Unit,
    onProjectSelect: (String?) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onExtraValueChange: (String, String) -> Unit,
    onStart: () -> Unit,
    onStop: (Long?) -> Unit,
    onUpdateStartTime: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onRecoveryStop: () -> Unit,
    onRecoveryResume: () -> Unit,
    onRecoveryDiscard: () -> Unit,
    onClearError: () -> Unit,
    onRetryStop: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onSuspendActiveToNewTimer: () -> Unit,
    onRefreshRunningTimers: () -> Unit,
    onRefreshAll: () -> Unit,
    onOpenEditTimer: () -> Unit,
    onCloseEditTimer: () -> Unit,
    onQuickSaveDescription: (String) -> Unit = {},
    onUpdateTimerDetails: (String?, String, Map<String, String>) -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onCancelDelete: () -> Unit,
    onDeleteEntry: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onApplyPreset: (String, Preset) -> Unit = { _, _ -> },
    onDismissDeletedPage: () -> Unit = {},
    onClearInfoToast: () -> Unit = {}
) {
    if (uiState.recoveredTimer != null) {
        RecoveryDialog(
            timer = uiState.recoveredTimer,
            busy = uiState.recoveryBusy,
            onStop = onRecoveryStop,
            onResume = onRecoveryResume,
            onDiscard = onRecoveryDiscard
        )
    }

    uiState.deleteConfirmInfo?.let { info ->
        AlertDialog(
            onDismissRequest = onCancelDelete,
            title = { Text(stringResource(R.string.confirm_delete_title)) },
            text = { Text(stringResource(R.string.confirm_delete_message, info.title)) },
            confirmButton = {
                TextButton(onClick = onDeleteEntry) {
                    Text(stringResource(R.string.confirm_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelDelete) {
                    Text(stringResource(R.string.btn_cancel))
                }
            }
        )
    }

    if (uiState.deletedPageDialogVisible) {
        AlertDialog(
            onDismissRequest = onDismissDeletedPage,
            title = { Text(stringResource(R.string.deleted_page_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.deleted_page_body))
                    uiState.deletedPageDialogTitle?.takeIf { it.isNotBlank() }?.let { title ->
                        Text("“$title”", style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(stringResource(R.string.deleted_page_hint), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = onDismissDeletedPage) {
                    Text(stringResource(R.string.deleted_page_confirm))
                }
            }
        )
    }

    uiState.infoToast?.let { msg ->
        val context = androidx.compose.ui.platform.LocalContext.current
        val displayMsg = when (msg) {
            "timer_stopped_elsewhere" -> stringResource(R.string.timer_stopped_elsewhere)
            else -> msg
        }
        LaunchedEffect(msg) {
            android.widget.Toast.makeText(context, displayMsg, android.widget.Toast.LENGTH_SHORT).show()
            onClearInfoToast()
        }
    }

    if (uiState.editTimerOpen && uiState.activeTimer != null) {
        EditTimerModal(
            uiState = uiState,
            onDismiss = onCloseEditTimer,
            onSave = onUpdateTimerDetails
        )
        return
    }

    if (uiState.running && uiState.activeTimer != null) {
        RunningView(
            uiState = uiState,
            onStop = onStop,
            onUpdateStartTime = onUpdateStartTime,
            onNavigateToSettings = onNavigateToSettings,
            onRetryStop = onRetryStop,
            onLoadRunningTimer = onLoadRunningTimer,
            onStopOtherRunningTimer = onStopOtherRunningTimer,
            onSuspendActiveToNewTimer = onSuspendActiveToNewTimer,
            onRefreshRunningTimers = onRefreshRunningTimers,
            onRefreshAll = onRefreshAll,
            onQuickSaveDescription = onQuickSaveDescription,
            onUpdateTimerDetails = onUpdateTimerDetails,
            onConfirmDelete = onConfirmDelete,
            onOpenUrl = onOpenUrl,
            onApplyPreset = onApplyPreset
        )
    } else {
        IdleView(
            uiState = uiState,
            onWorkspaceSelect = onWorkspaceSelect,
            onProjectSelect = onProjectSelect,
            onDescriptionChange = onDescriptionChange,
            onExtraValueChange = onExtraValueChange,
            onStart = onStart,
            onNavigateToSettings = onNavigateToSettings,
            onClearError = onClearError,
            onLoadRunningTimer = onLoadRunningTimer,
            onStopOtherRunningTimer = onStopOtherRunningTimer,
            onRefreshRunningTimers = onRefreshRunningTimers,
            onRefreshAll = onRefreshAll,
            onConfirmDelete = onConfirmDelete,
            onOpenUrl = onOpenUrl,
            onApplyPreset = onApplyPreset
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IdleView(
    uiState: TimerViewModel.UiState,
    onWorkspaceSelect: (String) -> Unit,
    onProjectSelect: (String?) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onExtraValueChange: (String, String) -> Unit,
    onStart: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onClearError: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onRefreshRunningTimers: () -> Unit,
    onRefreshAll: () -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onOpenUrl: (String) -> Unit,
    onApplyPreset: (String, Preset) -> Unit = { _, _ -> }
) {
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End
            ) {
                IconButton(onClick = onRefreshAll) {
                    Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.btn_refresh_all))
                }
                IconButton(onClick = onNavigateToSettings) {
                    Icon(Icons.Default.Settings, contentDescription = stringResource(R.string.title_settings))
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (uiState.apiKey.isBlank()) {
                val noApiKeyText = buildAnnotatedString {
                    append(stringResource(R.string.warn_no_api_key))
                    append(" ")
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline)) {
                        append(stringResource(R.string.warn_no_api_key_link))
                    }
                }
                FlowingWarningCard(text = noApiKeyText, onClick = onNavigateToSettings)
            } else if (uiState.workspaces.isEmpty()) {
                val noWorkspacesText = buildAnnotatedString {
                    append(stringResource(R.string.warn_no_workspaces))
                    append(" ")
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline)) {
                        append(stringResource(R.string.warn_no_workspaces_link))
                    }
                    append(" ")
                    append(stringResource(R.string.warn_no_workspaces_suffix))
                }
                FlowingWarningCard(text = noWorkspacesText, onClick = onNavigateToSettings)
            }

            uiState.error?.let { err ->
                val message = when (err) {
                    "required_fields_missing" -> stringResource(R.string.toast_required_fields_missing)
                    else -> err
                }
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(message, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        TextButton(onClick = onClearError) { Text("×") }
                    }
                }
            }

            // Preset chips
            PresetChips(
                workspaces = uiState.workspaces,
                apiKey = uiState.apiKey,
                onApplyPreset = onApplyPreset
            )

            FieldLabel(stringResource(R.string.label_workspace))
            val workspaceOptions = uiState.workspaces.map { NamedOption(it.id, it.name) }
            SearchableDropdown(
                options = workspaceOptions,
                selected = workspaceOptions.firstOrNull { it.id == uiState.selectedWorkspaceId },
                placeholder = stringResource(R.string.placeholder_select_workspace),
                onSelect = { it?.let { opt -> onWorkspaceSelect(opt.id) } },
                modifier = Modifier.fillMaxWidth(),
                searchable = workspaceOptions.size > 4,
                enabled = uiState.workspaces.isNotEmpty()
            )

            if (uiState.selectedWorkspaceId != null) {
                FieldLabel(stringResource(R.string.label_project))
                SearchableDropdown(
                    options = uiState.projects,
                    selected = uiState.projects.firstOrNull { it.id == uiState.selectedProjectId },
                    placeholder = if (uiState.projectsLoading) stringResource(R.string.placeholder_loading)
                    else stringResource(R.string.placeholder_select_project),
                    onSelect = { onProjectSelect(it?.id) },
                    allowClear = true,
                    searchable = true,
                    loading = uiState.projectsLoading,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            FieldLabel(stringResource(R.string.label_description))
            OutlinedTextField(
                value = uiState.description,
                onValueChange = onDescriptionChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(stringResource(R.string.placeholder_description)) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { })
            )

            uiState.extraFieldDefs.forEach { def ->
                ExtraFieldInput(
                    fieldDef = def,
                    value = uiState.extraValues[def.propName] ?: "",
                    onValueChange = { onExtraValueChange(def.propName, it) },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Spacer(Modifier.height(8.dp))

            val canStart = uiState.apiKey.isNotBlank() &&
                    uiState.selectedWorkspaceId != null &&
                    !uiState.isStarting &&
                    uiState.extraFieldDefs.none { def ->
                        def.required && (uiState.extraValues[def.propName]?.isBlank() != false)
                    }

            Button(
                onClick = onStart,
                enabled = canStart,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
            ) {
                if (uiState.isStarting) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp, color = MaterialTheme.colorScheme.onTertiary)
                } else {
                    Text(
                        stringResource(R.string.btn_start),
                        fontSize = 18.sp,
                        color = MaterialTheme.colorScheme.onTertiary
                    )
                }
            }

            OtherRunningTimers(
                timers = uiState.runningTimers,
                loading = uiState.runningTimersLoading,
                activePageId = null,
                onLoad = onLoadRunningTimer,
                onStop = onStopOtherRunningTimer,
                onDelete = { rt -> onConfirmDelete(rt.pageId, rt.title, true) },
                onOpenUrl = onOpenUrl
            )

            RecentEntriesSection(
                entries = uiState.recentEntries,
                loading = uiState.recentEntriesLoading,
                onDelete = { re -> onConfirmDelete(re.pageId, re.title, false) },
                onOpenUrl = onOpenUrl
            )

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun RunningView(
    uiState: TimerViewModel.UiState,
    onStop: (Long?) -> Unit,
    onUpdateStartTime: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onRetryStop: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onSuspendActiveToNewTimer: () -> Unit,
    onRefreshRunningTimers: () -> Unit,
    onRefreshAll: () -> Unit,
    onQuickSaveDescription: (String) -> Unit = {},
    onUpdateTimerDetails: (String?, String, Map<String, String>) -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onOpenUrl: (String) -> Unit,
    onApplyPreset: (String, Preset) -> Unit = { _, _ -> }
) {
    val timer = uiState.activeTimer ?: return
    val workspace = uiState.workspaces.firstOrNull { it.id == timer.workspaceId }
    val rounding = workspace?.roundingMinutes ?: 15

    val intervalText = remember(uiState.elapsedSeconds, timer.roundedStart, rounding) {
        buildIntervalText(timer.roundedStart, uiState.elapsedSeconds, rounding)
    }

    var startTimeInput by remember(timer.roundedStart) { mutableStateOf(formatHHMM(timer.roundedStart)) }
    var endTimeInput by remember { mutableStateOf("") }

    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End
            ) {
                IconButton(onClick = onRefreshAll) {
                    Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.btn_refresh_all))
                }
                IconButton(onClick = onSuspendActiveToNewTimer) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.start_new_timer))
                }
                IconButton(onClick = onNavigateToSettings) {
                    Icon(Icons.Default.Settings, contentDescription = stringResource(R.string.title_settings))
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            PresetChips(
                workspaces = uiState.workspaces,
                apiKey = uiState.apiKey,
                onApplyPreset = onApplyPreset
            )

            Spacer(Modifier.height(8.dp))

            Text(
                workspace?.name ?: "",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            var titleDraft by remember(timer.description) { mutableStateOf(timer.description) }
            val isTitleDirty = titleDraft.trim() != timer.description.trim()
            // Inline-editable project & extra fields, seeded from the active timer and
            // re-seeded when the underlying fields change (e.g. after loading another timer).
            var localProjectId by remember(timer.notionPageId) { mutableStateOf(uiState.selectedProjectId) }
            var localExtras by remember(timer.notionPageId) { mutableStateOf(uiState.extraValues) }
            var pendingSave by remember(timer.notionPageId) { mutableStateOf(false) }
            LaunchedEffect(uiState.extraFieldDefs, timer.notionPageId) {
                localProjectId = uiState.selectedProjectId
                localExtras = uiState.extraValues
            }
            // Debounce inline edits so we don't hit the Notion API on every keystroke.
            // The title is saved separately (its own check button / IME action), so we
            // keep the last-committed title here to avoid clobbering an in-progress edit.
            LaunchedEffect(localProjectId, localExtras, pendingSave) {
                if (!pendingSave) return@LaunchedEffect
                kotlinx.coroutines.delay(600)
                onUpdateTimerDetails(localProjectId, timer.description, localExtras)
                pendingSave = false
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    value = titleDraft,
                    onValueChange = { titleDraft = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.hint_timer_title), style = MaterialTheme.typography.bodySmall) },
                    textStyle = MaterialTheme.typography.bodyMedium,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onQuickSaveDescription(titleDraft.trim()) })
                )
                if (isTitleDirty) {
                    IconButton(onClick = { onQuickSaveDescription(titleDraft.trim()) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = stringResource(R.string.btn_save_changes),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            Text(
                formatElapsed(uiState.elapsedSeconds),
                style = MaterialTheme.typography.displayMedium.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 48.sp
                ),
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center
            )

            Text(
                intervalText,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    stringResource(R.string.label_start_time),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.width(100.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = startTimeInput,
                    onValueChange = { startTimeInput = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        val iso = parseHHMMToISO(startTimeInput, timer.roundedStart)
                        if (iso != null) onUpdateStartTime(iso)
                    })
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    stringResource(R.string.label_end_time),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.width(100.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = endTimeInput,
                    onValueChange = { endTimeInput = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.hint_manual_end), style = MaterialTheme.typography.bodySmall) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        val ms = parseHHMMToMillis(endTimeInput, timer.roundedStart)
                        if (ms != null) onStop(ms)
                    })
                )
            }

            // Inline project + extra-field editing (matches Windows: edits save immediately).
            if (uiState.projects.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Column(modifier = Modifier.fillMaxWidth()) {
                    FieldLabel(stringResource(R.string.label_project))
                    SearchableDropdown(
                        options = uiState.projects,
                        selected = uiState.projects.firstOrNull { it.id == localProjectId },
                        placeholder = stringResource(R.string.placeholder_select_project),
                        onSelect = {
                            localProjectId = it?.id
                            pendingSave = true
                        },
                        allowClear = true,
                        searchable = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            if (uiState.extraFieldDefs.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    uiState.extraFieldDefs.forEach { def ->
                        ExtraFieldInput(
                            fieldDef = def,
                            value = localExtras[def.propName] ?: "",
                            onValueChange = { value ->
                                localExtras = localExtras + (def.propName to value)
                                pendingSave = true
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            uiState.stopError?.let { err ->
                val errMsg = when (err) {
                    "required_fields_before_stopping" -> stringResource(R.string.toast_required_before_stopping)
                    else -> err
                }
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Row(modifier = Modifier.padding(12.dp)) {
                        Text(errMsg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        if (err != "required_fields_before_stopping") {
                            TextButton(onClick = onRetryStop) { Text(stringResource(R.string.toast_stop_retry)) }
                        }
                    }
                }
            }

            Button(
                onClick = {
                    val manualEnd = endTimeInput.takeIf { it.isNotBlank() }?.let {
                        runCatching { parseHHMMToMillis(it, timer.roundedStart) }.getOrNull()
                    }
                    onStop(manualEnd)
                },
                enabled = !uiState.isStopping,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                if (uiState.isStopping) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp, color = MaterialTheme.colorScheme.onError)
                } else {
                    Text(stringResource(R.string.btn_stop), fontSize = 18.sp, color = MaterialTheme.colorScheme.onError)
                }
            }

            OtherRunningTimers(
                timers = uiState.runningTimers,
                loading = uiState.runningTimersLoading,
                activePageId = uiState.activeTimer?.notionPageId,
                onLoad = onLoadRunningTimer,
                onStop = onStopOtherRunningTimer,
                onDelete = { rt -> onConfirmDelete(rt.pageId, rt.title, true) },
                onOpenUrl = onOpenUrl
            )

            RecentEntriesSection(
                entries = uiState.recentEntries,
                loading = uiState.recentEntriesLoading,
                onDelete = { re -> onConfirmDelete(re.pageId, re.title, false) },
                onOpenUrl = onOpenUrl
            )

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun OtherRunningTimers(
    timers: List<RunningTimerInfo>,
    loading: Boolean,
    activePageId: String?,
    onLoad: (RunningTimerInfo) -> Unit,
    onStop: (RunningTimerInfo) -> Unit,
    onDelete: (RunningTimerInfo) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    if (timers.isEmpty() && !loading) return

    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            stringResource(R.string.running_timers_heading),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (loading) {
            Spacer(Modifier.width(8.dp))
            CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 2.dp)
        }
    }
    timers.forEach { rt ->
        val isActive = rt.pageId == activePageId
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (!isActive) Modifier.clickable { onLoad(rt) } else Modifier),
            colors = CardDefaults.cardColors(
                containerColor = if (isActive) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                else MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(
                modifier = Modifier
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .then(if (isActive) Modifier.alpha(0.6f) else Modifier),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(rt.title, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                    Text(
                        rt.workspaceName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (!isActive) {
                    IconButton(onClick = { onStop(rt) }, modifier = Modifier.size(36.dp)) {
                        Text("⏹", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = { onDelete(rt) }, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = stringResource(R.string.title_delete_entry),
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (rt.url.isNotBlank()) {
                    IconButton(onClick = { onOpenUrl(rt.url) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Default.OpenInNew,
                            contentDescription = stringResource(R.string.title_open_in_notion),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RecentEntriesSection(
    entries: List<RecentEntryInfo>,
    loading: Boolean,
    onDelete: (RecentEntryInfo) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    if (entries.isEmpty() && !loading) return

    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
    Text(
        stringResource(R.string.recent_entries_heading),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 4.dp)
    )
    if (loading) {
        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
    }
    entries.forEach { re ->
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(re.title, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                    Text(
                        re.workspaceName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = { onDelete(re) }, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = stringResource(R.string.title_delete_entry),
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (re.url.isNotBlank()) {
                    IconButton(onClick = { onOpenUrl(re.url) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Default.OpenInNew,
                            contentDescription = stringResource(R.string.title_open_in_notion),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PresetChips(
    workspaces: List<com.impca201.notiontimetracker.data.models.Workspace>,
    apiKey: String,
    onApplyPreset: (String, Preset) -> Unit
) {
    val allPresets = workspaces.flatMap { ws -> ws.presets.map { ws to it } }
    if (allPresets.isEmpty() || apiKey.isBlank()) return
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        allPresets.forEach { (ws, preset) ->
            val wsColor = parseWorkspaceColor(ws.color)
            val chipLabel = if (preset.name.isBlank()) "▶ ${ws.name}" else "▶ ${ws.name} — ${preset.name}"
            SuggestionChip(
                onClick = { onApplyPreset(ws.id, preset) },
                label = { Text(chipLabel, style = MaterialTheme.typography.labelMedium) },
                colors = if (wsColor != null) SuggestionChipDefaults.suggestionChipColors(
                    containerColor = wsColor.copy(alpha = 0.15f),
                    labelColor = wsColor
                ) else SuggestionChipDefaults.suggestionChipColors(),
                border = if (wsColor != null) SuggestionChipDefaults.suggestionChipBorder(
                    enabled = true,
                    borderColor = wsColor.copy(alpha = 0.4f)
                ) else SuggestionChipDefaults.suggestionChipBorder(enabled = true)
            )
        }
    }
}

/** A warning card whose message flows as a single tappable paragraph (the link
 *  stays inline instead of floating onto its own row). */
@Composable
private fun FlowingWarningCard(text: androidx.compose.ui.text.AnnotatedString, onClick: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Text(
            text,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

private fun formatElapsed(totalSeconds: Long): String {
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return "%02d:%02d:%02d".format(h, m, s)
}

private fun formatHHMM(iso: String): String = runCatching {
    val odt = OffsetDateTime.parse(iso)
    "%02d:%02d".format(odt.hour, odt.minute)
}.getOrDefault("")

private fun buildIntervalText(roundedStart: String, elapsedSecs: Long, rounding: Int): String = runCatching {
    val startMs = OffsetDateTime.parse(roundedStart).toInstant().toEpochMilli()
    val nowMs = startMs + elapsedSecs * 1000L
    val startFmt = formatHHMMMs(startMs)
    if (rounding == 0) {
        "$startFmt → ${formatHHMMMs(nowMs)}"
    } else {
        val intervalMs = rounding * 60_000L
        val rounded = Math.round(nowMs.toDouble() / intervalMs) * intervalMs
        val minEnd = startMs + intervalMs
        val endMs = if (rounded < minEnd) minEnd else rounded
        "$startFmt → ${formatHHMMMs(endMs)}"
    }
}.getOrDefault("")

private fun formatHHMMMs(ms: Long): String {
    val inst = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault())
    return "%02d:%02d".format(inst.hour, inst.minute)
}

private fun parseHHMMToISO(hhMM: String, referenceISO: String): String? = runCatching {
    val parts = hhMM.trim().split(":")
    if (parts.size < 2) return null
    val h = parts[0].toInt(); val m = parts[1].toInt()
    val base = OffsetDateTime.parse(referenceISO)
    val target = base.withHour(h).withMinute(m).withSecond(0).withNano(0)
    DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(target)
}.getOrNull()

private fun parseHHMMToMillis(hhMM: String, referenceISO: String): Long? = runCatching {
    val iso = parseHHMMToISO(hhMM, referenceISO) ?: return null
    OffsetDateTime.parse(iso).toInstant().toEpochMilli()
}.getOrNull()

