package com.impca201.notiontimetracker.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.NamedOption
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
    onStop: () -> Unit,
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
    onUpdateTimerDetails: (String?, String, Map<String, String>) -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onCancelDelete: () -> Unit,
    onDeleteEntry: () -> Unit,
    onOpenUrl: (String) -> Unit
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
            onOpenEditTimer = onOpenEditTimer,
            onConfirmDelete = onConfirmDelete,
            onOpenUrl = onOpenUrl
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
            onOpenUrl = onOpenUrl
        )
    }
}

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
    onOpenUrl: (String) -> Unit
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
                WarningCard {
                    Text(
                        buildString {
                            append(stringResource(R.string.warn_no_api_key))
                            append(" ")
                        },
                        style = MaterialTheme.typography.bodySmall
                    )
                    TextButton(onClick = onNavigateToSettings, contentPadding = PaddingValues(0.dp)) {
                        Text(stringResource(R.string.warn_no_api_key_link), style = MaterialTheme.typography.bodySmall)
                    }
                }
            } else if (uiState.workspaces.isEmpty()) {
                WarningCard {
                    Text(
                        buildString {
                            append(stringResource(R.string.warn_no_workspaces))
                            append(" ")
                        },
                        style = MaterialTheme.typography.bodySmall
                    )
                    TextButton(onClick = onNavigateToSettings, contentPadding = PaddingValues(0.dp)) {
                        Text(stringResource(R.string.warn_no_workspaces_link), style = MaterialTheme.typography.bodySmall)
                    }
                    Text(" " + stringResource(R.string.warn_no_workspaces_suffix), style = MaterialTheme.typography.bodySmall)
                }
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
                onRefresh = onRefreshRunningTimers,
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
    onStop: () -> Unit,
    onUpdateStartTime: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onRetryStop: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onSuspendActiveToNewTimer: () -> Unit,
    onRefreshRunningTimers: () -> Unit,
    onRefreshAll: () -> Unit,
    onOpenEditTimer: () -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onOpenUrl: (String) -> Unit
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
            Spacer(Modifier.height(8.dp))

            Text(
                workspace?.name ?: "",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    timer.description.ifBlank { "—" },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = onOpenEditTimer, modifier = Modifier.size(32.dp)) {
                    Icon(
                        Icons.Default.Edit,
                        contentDescription = stringResource(R.string.btn_edit_timer),
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
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
                        val iso = parseHHMMToISO(endTimeInput, timer.roundedStart)
                        if (iso != null) onStop()
                    })
                )
            }

            uiState.stopError?.let { err ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Row(modifier = Modifier.padding(12.dp)) {
                        Text(err, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        TextButton(onClick = onRetryStop) { Text(stringResource(R.string.toast_stop_retry)) }
                    }
                }
            }

            Button(
                onClick = {
                    val manualEnd = endTimeInput.takeIf { it.isNotBlank() }?.let {
                        runCatching { parseHHMMToMillis(it, timer.roundedStart) }.getOrNull()
                    }
                    onStop()
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
                onRefresh = onRefreshRunningTimers,
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
    onRefresh: () -> Unit,
    onDelete: (RunningTimerInfo) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    if (timers.isEmpty() && !loading) return

    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            stringResource(R.string.running_timers_heading),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        IconButton(onClick = onRefresh, enabled = !loading, modifier = Modifier.size(32.dp)) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.refresh_running_timers),
                    modifier = Modifier.size(16.dp)
                )
            }
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
                    val timeLabel = buildRecentTimeLabel(re.startISO, re.endISO)
                    if (timeLabel.isNotBlank()) {
                        Text(
                            timeLabel,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
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

@Composable
private fun WarningCard(content: @Composable RowScope.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Row(modifier = Modifier.padding(12.dp), content = content)
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

private fun buildRecentTimeLabel(startISO: String?, endISO: String?): String {
    if (startISO == null) return ""
    return runCatching {
        val start = OffsetDateTime.parse(startISO)
        val startStr = "%02d:%02d".format(start.hour, start.minute)
        if (endISO != null) {
            val end = OffsetDateTime.parse(endISO)
            val endStr = "%02d:%02d".format(end.hour, end.minute)
            "$startStr → $endStr"
        } else startStr
    }.getOrDefault("")
}
