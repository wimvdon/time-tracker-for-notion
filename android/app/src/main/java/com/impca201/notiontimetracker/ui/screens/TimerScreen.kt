package com.impca201.notiontimetracker.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.res.stringResource
import com.impca201.notiontimetracker.ui.components.parseWorkspaceColor
import com.impca201.notiontimetracker.ui.theme.Motion
import com.impca201.notiontimetracker.ui.theme.SkeletonBlock
import com.impca201.notiontimetracker.ui.theme.SkeletonLine
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.Role
import com.impca201.notiontimetracker.ui.theme.AppShapes
import androidx.compose.ui.semantics.semantics
import com.impca201.notiontimetracker.ui.theme.rememberReducedMotion
import com.impca201.notiontimetracker.ui.theme.workspaceAccentColor
import com.impca201.notiontimetracker.ui.theme.workspaceSolidFillColor
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.Preset
import com.impca201.notiontimetracker.data.models.RecentEntryInfo
import com.impca201.notiontimetracker.data.models.RunningTimerInfo
import com.impca201.notiontimetracker.ui.components.EditTimerModal
import com.impca201.notiontimetracker.ui.components.ExtraFieldInput
import com.impca201.notiontimetracker.ui.components.RunningGlow
import com.impca201.notiontimetracker.ui.components.TimerHero
import com.impca201.notiontimetracker.viewmodel.TimerViewModel
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun TimerScreen(
    uiState: TimerViewModel.UiState,
    onWorkspaceSelect: (String) -> Unit,
    onProjectSelect: (String?) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onExtraValueChange: (String, String) -> Unit,
    onStart: (Long?) -> Unit,
    onStop: (Long?, String?) -> Unit,
    onUpdateStartTime: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onClearError: () -> Unit,
    onRetryStop: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onPlusButtonClicked: () -> Unit,
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
    onStartFromRecentEntry: (RecentEntryInfo) -> Unit = {},
    onDismissDeletedPage: () -> Unit = {},
    onClearInfoToast: () -> Unit = {},
    onConfirmAlreadyRunning: () -> Unit,
    onCancelAlreadyRunning: () -> Unit,
    onSavePreset: (String) -> Unit,
    onDeletePreset: (String, String) -> Unit,
    onMovePresetUp: (String, String) -> Unit,
    onMovePresetDown: (String, String) -> Unit
) {
    if (uiState.showAlreadyRunningWarning) {
        AlertDialog(
            onDismissRequest = onCancelAlreadyRunning,
            title = { Text(stringResource(R.string.warn_already_running_title)) },
            text = { Text(stringResource(R.string.warn_already_running_body)) },
            confirmButton = {
                TextButton(onClick = onConfirmAlreadyRunning) {
                    Text(stringResource(R.string.btn_stop_and_start_new))
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelAlreadyRunning) {
                    Text(stringResource(R.string.btn_cancel))
                }
            }
        )
    }

    var showSavePresetDialog by remember { mutableStateOf(false) }
    var presetNameInput by remember { mutableStateOf("") }
    if (showSavePresetDialog) {
        AlertDialog(
            onDismissRequest = { showSavePresetDialog = false },
            title = { Text(stringResource(R.string.dialog_save_preset_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.dialog_save_preset_body))
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = presetNameInput,
                        onValueChange = { presetNameInput = it },
                        label = { Text(stringResource(R.string.dialog_save_preset_name) + " *") },
                        placeholder = { Text(stringResource(R.string.dialog_save_preset_placeholder)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onSavePreset(presetNameInput.trim())
                        presetNameInput = ""
                        showSavePresetDialog = false
                    },
                    enabled = presetNameInput.isNotBlank()
                ) {
                    Text(stringResource(R.string.btn_save))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    presetNameInput = ""
                    showSavePresetDialog = false
                }) {
                    Text(stringResource(R.string.btn_cancel))
                }
            }
        )
    }

    var showManagePresetsDialog by remember { mutableStateOf(false) }
    if (showManagePresetsDialog) {
        ManagePresetsDialog(
            workspaces = uiState.workspaces,
            onDeletePreset = onDeletePreset,
            onMovePresetUp = onMovePresetUp,
            onMovePresetDown = onMovePresetDown,
            onDismiss = { showManagePresetsDialog = false }
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
        val displayMsg = localisedMessage(msg)
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

    AnimatedContent(
        targetState = uiState.running && uiState.activeTimer != null,
        transitionSpec = {
            fadeIn(Motion.fadeSpec(delayMillis = 90)) togetherWith fadeOut(Motion.fadeSpec(durationMillis = 90))
        },
        label = "timer-state"
    ) { running ->
        if (running) {
            RunningView(
                uiState = uiState,
                onStop = onStop,
                onUpdateStartTime = onUpdateStartTime,
                onNavigateToSettings = onNavigateToSettings,
                onRetryStop = onRetryStop,
                onLoadRunningTimer = onLoadRunningTimer,
                onStopOtherRunningTimer = onStopOtherRunningTimer,
                onPlusButtonClicked = onPlusButtonClicked,
                onRefreshAll = onRefreshAll,
                onQuickSaveDescription = onQuickSaveDescription,
                onUpdateTimerDetails = onUpdateTimerDetails,
                onConfirmDelete = onConfirmDelete,
                onOpenUrl = onOpenUrl,
                onApplyPreset = onApplyPreset,
                onStartFromRecentEntry = onStartFromRecentEntry,
                onSavePresetClick = { showSavePresetDialog = true },
                onManagePresetsClick = { showManagePresetsDialog = true }
            )
        } else {
            IdleView(
                uiState = uiState,
                onWorkspaceSelect = onWorkspaceSelect,
                onDescriptionChange = onDescriptionChange,
                onExtraValueChange = onExtraValueChange,
                onStart = onStart,
                onNavigateToSettings = onNavigateToSettings,
                onClearError = onClearError,
                onLoadRunningTimer = onLoadRunningTimer,
                onStopOtherRunningTimer = onStopOtherRunningTimer,
                onRefreshAll = onRefreshAll,
                onConfirmDelete = onConfirmDelete,
                onOpenUrl = onOpenUrl,
                onApplyPreset = onApplyPreset,
                onStartFromRecentEntry = onStartFromRecentEntry,
                onSavePresetClick = { showSavePresetDialog = true },
                onManagePresetsClick = { showManagePresetsDialog = true }
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IdleView(
    uiState: TimerViewModel.UiState,
    onWorkspaceSelect: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onExtraValueChange: (String, String) -> Unit,
    onStart: (Long?) -> Unit,
    onNavigateToSettings: () -> Unit,
    onClearError: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onRefreshAll: () -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onOpenUrl: (String) -> Unit,
    onApplyPreset: (String, Preset) -> Unit = { _, _ -> },
    onStartFromRecentEntry: (RecentEntryInfo) -> Unit = {},
    onSavePresetClick: () -> Unit,
    onManagePresetsClick: () -> Unit
) {
    val scrollState = rememberScrollState()
    val context = LocalContext.current
    val is12h = uiState.timeFormat == "12h"
    // A start time picked for a timer the user forgot to start; empty means "now". Only the
    // Start button uses it: presets, shortcuts and recent entries always start now.
    var pickedStartMs by rememberSaveable { mutableStateOf<Long?>(null) }

    Scaffold(
        contentColor = MaterialTheme.colorScheme.onBackground,
        topBar = {
            TimerTopBar {
                RefreshIconButton(
                    loading = uiState.runningTimersLoading || uiState.recentEntriesLoading,
                    onClick = onRefreshAll
                )
                IconButton(onClick = onNavigateToSettings) {
                    Icon(Icons.Rounded.Settings, contentDescription = stringResource(R.string.title_settings))
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
                val message = localisedMessage(err)
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(message, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        IconButton(onClick = onClearError) {
                            Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.title_dismiss))
                        }
                    }
                }
            }

            PresetChips(
                workspaces = uiState.workspaces,
                apiKey = uiState.apiKey,
                onApplyPreset = onApplyPreset,
                onManageClick = onManagePresetsClick
            )

            val selectedWorkspace = uiState.workspaces.firstOrNull { it.id == uiState.selectedWorkspaceId }

            WorkspaceTitle(
                workspaces = uiState.workspaces,
                selected = selectedWorkspace,
                onSelect = onWorkspaceSelect,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 12.dp)
            )

            // Starting while the fields are still loading would drop every extra
            // value from the new entry, so the button waits for them.
            val canStart = uiState.apiKey.isNotBlank() &&
                    uiState.selectedWorkspaceId != null &&
                    !uiState.extrasLoading &&
                    !uiState.isStarting
            val buttonColor = workspaceSolidFillColor(selectedWorkspace?.color) ?: TimerColors.Start

            TimerHeroWithAction(
                elapsedText = formatElapsed(0L),
                container = MaterialTheme.colorScheme.surfaceContainerHigh,
                contentColor = MaterialTheme.colorScheme.outline,
                running = false,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                TimerActionButton(
                    label = stringResource(R.string.btn_start),
                    icon = Icons.Rounded.PlayArrow,
                    onClick = { onStart(pickedStartMs) },
                    enabled = canStart,
                    loading = uiState.isStarting,
                    containerColor = buttonColor,
                    contentColor = TimerColors.OnAction
                )
            }

            TimerDetailsCard(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                // Like required extra fields, a required description is enforced when
                // the timer is stopped — starting stays a single tap.
                val descriptionRequired = selectedWorkspace?.descriptionRequired == true
                OutlinedTextField(
                    value = uiState.description,
                    onValueChange = onDescriptionChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = descriptionRequired && uiState.description.isBlank(),
                    label = {
                        Text(stringResource(R.string.placeholder_description) + if (descriptionRequired) " *" else "")
                    },
                    placeholder = { Text(stringResource(R.string.label_description)) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { })
                )

                TimeField(
                    label = stringResource(R.string.label_start_time),
                    value = pickedStartMs?.let { formatHHMM(isoAt(it), is12h) } ?: "",
                    placeholder = stringResource(R.string.time_now),
                    pickerDescription = stringResource(R.string.title_select_start_time),
                    onPick = {
                        val now = java.util.Calendar.getInstance().apply {
                            pickedStartMs?.let { ms -> timeInMillis = ms }
                        }
                        android.app.TimePickerDialog(context, { _, hour, minute ->
                            pickedStartMs = java.util.Calendar.getInstance().apply {
                                set(java.util.Calendar.HOUR_OF_DAY, hour)
                                set(java.util.Calendar.MINUTE, minute)
                                set(java.util.Calendar.SECOND, 0)
                                set(java.util.Calendar.MILLISECOND, 0)
                            }.timeInMillis
                        }, now.get(java.util.Calendar.HOUR_OF_DAY), now.get(java.util.Calendar.MINUTE), !is12h).show()
                    },
                    onClear = pickedStartMs?.let { { pickedStartMs = null } },
                    modifier = Modifier.fillMaxWidth()
                )

                if (uiState.extrasLoading) {
                    ExtraFieldsSkeleton(selectedWorkspace?.extraProps.orEmpty())
                }

                uiState.extraFieldDefs.forEach { def ->
                    ExtraFieldInput(
                        fieldDef = def,
                        value = uiState.extraValues[def.propName] ?: "",
                        onValueChange = { onExtraValueChange(def.propName, it) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // Loading the fields can fail (offline, rate limited) or find properties
                // that no longer exist in the database. Both used to just show fewer
                // fields than configured, with no way to tell that from "correct".
                uiState.extrasError?.let { err ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                localisedMessage(err),
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            uiState.selectedWorkspaceId?.let { wsId ->
                                TextButton(onClick = { onWorkspaceSelect(wsId) }) {
                                    Text(stringResource(R.string.btn_retry))
                                }
                            }
                        }
                    }
                }
            }

            SavePresetButton(
                onClick = onSavePresetClick,
                enabled = canStart,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )

            OtherRunningTimers(
                timers = uiState.runningTimers,
                loading = uiState.runningTimersLoading,
                error = uiState.runningTimersError,
                activePageId = null,
                onLoad = onLoadRunningTimer,
                onStop = onStopOtherRunningTimer,
                onDelete = { rt -> onConfirmDelete(rt.pageId, rt.title, true) },
                onOpenUrl = onOpenUrl,
                showNotionLink = uiState.showNotionLink,
                showArchiveAction = uiState.showArchiveAction
            )

            RecentEntriesSection(
                entries = uiState.recentEntries,
                loading = uiState.recentEntriesLoading,
                workspaces = uiState.workspaces,
                onDelete = { re -> onConfirmDelete(re.pageId, re.title, false) },
                onOpenUrl = onOpenUrl,
                onPlay = onStartFromRecentEntry,
                dateFormat = uiState.dateFormat,
                timeFormat = uiState.timeFormat,
                showNotionLink = uiState.showNotionLink,
                showArchiveAction = uiState.showArchiveAction
            )

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun RunningView(
    uiState: TimerViewModel.UiState,
    onStop: (Long?, String?) -> Unit,
    onUpdateStartTime: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onRetryStop: () -> Unit,
    onLoadRunningTimer: (RunningTimerInfo) -> Unit,
    onStopOtherRunningTimer: (RunningTimerInfo) -> Unit,
    onPlusButtonClicked: () -> Unit,
    onRefreshAll: () -> Unit,
    onQuickSaveDescription: (String) -> Unit = {},
    onUpdateTimerDetails: (String?, String, Map<String, String>) -> Unit,
    onConfirmDelete: (String, String, Boolean) -> Unit,
    onOpenUrl: (String) -> Unit,
    onApplyPreset: (String, Preset) -> Unit = { _, _ -> },
    onStartFromRecentEntry: (RecentEntryInfo) -> Unit = {},
    onSavePresetClick: () -> Unit = {},
    onManagePresetsClick: () -> Unit = {}
) {
    val timer = uiState.activeTimer ?: return
    val workspace = uiState.workspaces.firstOrNull { it.id == timer.workspaceId }
    val is12h = uiState.timeFormat == "12h"

    var startTimeInput by remember(timer.roundedStart, uiState.timeFormat) { mutableStateOf(formatHHMM(timer.roundedStart, is12h)) }
    var endTimeInput by remember { mutableStateOf("") }

    // Declared here rather than next to its text field: stopping has to hand
    // the draft over so a description typed but not yet saved is not lost.
    var titleDraft by remember(timer.description) { mutableStateOf(timer.description) }
    val isTitleDirty = titleDraft.trim() != timer.description.trim()

    var showTimeErrorDialog by remember { mutableStateOf(false) }
    var pendingEndTimeMs by remember { mutableStateOf(0L) }

    if (showTimeErrorDialog) {
        AlertDialog(
            onDismissRequest = { showTimeErrorDialog = false },
            title = { Text(stringResource(R.string.dialog_time_error_title)) },
            text = { Text(stringResource(R.string.dialog_time_error_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showTimeErrorDialog = false
                        val nextDayMs = pendingEndTimeMs + 24 * 3600 * 1000L
                        onStop(nextDayMs, titleDraft)
                        endTimeInput = ""
                    }
                ) {
                    Text(stringResource(R.string.btn_next_day))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showTimeErrorDialog = false
                        endTimeInput = ""
                    }
                ) {
                    Text(stringResource(R.string.btn_edit))
                }
            }
        )
    }

    val context = LocalContext.current

    val showStartTimePicker = {
        val odt = runCatching { OffsetDateTime.parse(timer.roundedStart) }.getOrNull() ?: OffsetDateTime.now()
        android.app.TimePickerDialog(context, { _, hour, minute ->
            val formatted24 = String.format("%02d:%02d", hour, minute)
            val iso = parseHHMMToISO(formatted24, timer.roundedStart)
            if (iso != null) {
                onUpdateStartTime(iso)
                startTimeInput = formatHHMM(iso, is12h)
            }
        }, odt.hour, odt.minute, !is12h).show()
    }

    val showEndTimePicker = {
        val cal = java.util.Calendar.getInstance()
        android.app.TimePickerDialog(context, { _, hour, minute ->
            val formatted24 = String.format("%02d:%02d", hour, minute)
            val iso = parseHHMMToISO(formatted24, timer.roundedStart)
            if (iso != null) {
                endTimeInput = formatHHMM(iso, is12h)
            }
        }, cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE), !is12h).show()
    }

    val handleStopClick = {
        val manualEnd = endTimeInput.takeIf { it.isNotBlank() }?.let {
            runCatching { parseHHMMToMillis(it, timer.roundedStart) }.getOrNull()
        }
        val startMs = runCatching { OffsetDateTime.parse(timer.roundedStart).toInstant().toEpochMilli() }.getOrDefault(0L)
        if (manualEnd != null && startMs > 0 && manualEnd < startMs) {
            pendingEndTimeMs = manualEnd
            showTimeErrorDialog = true
        } else {
            onStop(manualEnd, titleDraft)
        }
    }

    val workspaceColor = workspace?.color?.ifBlank { null }?.let { parseWorkspaceColor(it) }
    val workspaceAccent = workspaceAccentColor(workspace?.color)
    // A running timer tints the screen: the workspace colour, or the app's own red.
    val scaffoldBg = lerp(
        MaterialTheme.colorScheme.background,
        workspaceColor ?: MaterialTheme.colorScheme.primaryContainer,
        if (workspaceColor != null) 0.20f else 0.45f
    )
    val scrollState = rememberScrollState()
    var heroCenter by remember { mutableStateOf<Offset?>(null) }
    var screenOrigin by remember { mutableStateOf(Offset.Zero) }

    Box(
        Modifier
            .fillMaxSize()
            .background(scaffoldBg)
            .onGloballyPositioned { screenOrigin = it.positionInRoot() }
    ) {
        RunningGlow(
            primary = workspaceAccent ?: MaterialTheme.colorScheme.primary,
            secondary = MaterialTheme.colorScheme.tertiary,
            center = heroCenter?.minus(screenOrigin),
            animate = !rememberReducedMotion(),
            modifier = Modifier.matchParentSize()
        )
        Scaffold(
            containerColor = Color.Transparent,
            contentColor = MaterialTheme.colorScheme.onBackground,
            topBar = {
                TimerTopBar {
                    IconButton(onClick = onPlusButtonClicked) {
                        Icon(Icons.Rounded.Add, contentDescription = stringResource(R.string.start_new_timer))
                    }
                    RefreshIconButton(
                        loading = uiState.runningTimersLoading || uiState.recentEntriesLoading,
                        onClick = onRefreshAll
                    )
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Rounded.Settings, contentDescription = stringResource(R.string.title_settings))
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
                PresetChips(
                    workspaces = uiState.workspaces,
                    apiKey = uiState.apiKey,
                    onApplyPreset = onApplyPreset,
                    onManageClick = onManagePresetsClick
                )

                // A running timer's workspace can't change, so here it is a plain title.
                WorkspaceTitle(
                    workspaces = uiState.workspaces,
                    selected = workspace,
                    onSelect = null,
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 12.dp)
                )

                TimerHeroWithAction(
                    elapsedText = formatElapsed(uiState.elapsedSeconds),
                    container = lerp(
                        MaterialTheme.colorScheme.surfaceContainerHighest,
                        workspaceColor ?: MaterialTheme.colorScheme.primaryContainer,
                        if (workspaceColor != null) 0.35f else 0.6f
                    ),
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    running = true,
                    heroModifier = Modifier.onGloballyPositioned { heroCenter = it.boundsInRoot().center },
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                ) {
                    TimerActionButton(
                        label = stringResource(R.string.btn_stop),
                        icon = Icons.Rounded.Stop,
                        onClick = handleStopClick,
                        enabled = !uiState.isStopping,
                        loading = uiState.isStopping,
                        containerColor = TimerColors.Stop,
                        contentColor = TimerColors.OnAction
                    )
                }

                uiState.stopError?.let { err ->
                    val errMsg = localisedMessage(err)
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(errMsg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                            if (!isValidationMessage(err)) {
                                TextButton(onClick = onRetryStop) { Text(stringResource(R.string.toast_stop_retry)) }
                            }
                        }
                    }
                }

                var localProjectId by remember(timer.notionPageId) { mutableStateOf(uiState.selectedProjectId) }
                var localExtras by remember(timer.notionPageId) { mutableStateOf(uiState.extraValues) }
                var pendingSave by remember(timer.notionPageId) { mutableStateOf(false) }
                LaunchedEffect(uiState.extraFieldDefs, uiState.selectedProjectId, uiState.extraValues, timer.notionPageId) {
                    // A refresh from Notion must not overwrite an edit that has not been
                    // saved yet (the save is debounced by 600 ms, the auto-refresh runs
                    // every 60 s — without this the value snapped back while typing).
                    if (pendingSave) return@LaunchedEffect
                    localProjectId = uiState.selectedProjectId
                    localExtras = uiState.extraValues
                }
                LaunchedEffect(localProjectId, localExtras, pendingSave) {
                    if (!pendingSave) return@LaunchedEffect
                    kotlinx.coroutines.delay(600)
                    onUpdateTimerDetails(localProjectId, timer.description, localExtras)
                    pendingSave = false
                }

                // The tinted screen shows through the card a little, so it reads as part of
                // the running timer while its fields stay legible.
                TimerDetailsCard(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest.copy(alpha = 0.72f)) {
                    OutlinedTextField(
                        value = titleDraft,
                        onValueChange = { titleDraft = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        isError = workspace?.descriptionRequired == true && titleDraft.isBlank(),
                        label = {
                            Text(stringResource(R.string.placeholder_description) + if (workspace?.descriptionRequired == true) " *" else "")
                        },
                        placeholder = { Text(stringResource(R.string.hint_timer_title)) },
                        trailingIcon = if (isTitleDirty) {
                            {
                                IconButton(onClick = { onQuickSaveDescription(titleDraft.trim()) }) {
                                    Icon(
                                        Icons.Rounded.Check,
                                        contentDescription = stringResource(R.string.btn_save_changes),
                                        tint = workspaceAccent ?: MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        } else null,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { onQuickSaveDescription(titleDraft.trim()) }),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = workspaceAccent ?: MaterialTheme.colorScheme.primary,
                            focusedLabelColor = workspaceAccent ?: MaterialTheme.colorScheme.primary
                        )
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TimeField(
                                label = stringResource(R.string.label_start_time),
                                value = startTimeInput,
                                placeholder = null,
                                pickerDescription = stringResource(R.string.title_select_start_time),
                                onPick = showStartTimePicker,
                                modifier = Modifier.weight(1f)
                            )
                            TimeField(
                                label = stringResource(R.string.label_end_time),
                                value = endTimeInput,
                                placeholder = null,
                                pickerDescription = stringResource(R.string.title_select_end_time),
                                onPick = showEndTimePicker,
                                onClear = if (endTimeInput.isNotBlank()) ({ endTimeInput = "" }) else null,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        Text(
                            stringResource(R.string.hint_manual_end),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }

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

                SavePresetButton(
                    onClick = onSavePresetClick,
                    enabled = true,
                    color = workspaceAccent,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )

                OtherRunningTimers(
                    timers = uiState.runningTimers,
                    loading = uiState.runningTimersLoading,
                    error = uiState.runningTimersError,
                    activePageId = uiState.activeTimer?.notionPageId,
                    onLoad = onLoadRunningTimer,
                    onStop = onStopOtherRunningTimer,
                    onDelete = { rt -> onConfirmDelete(rt.pageId, rt.title, true) },
                    onOpenUrl = onOpenUrl,
                    showNotionLink = uiState.showNotionLink,
                    showArchiveAction = uiState.showArchiveAction
                )

                RecentEntriesSection(
                    entries = uiState.recentEntries,
                    loading = uiState.recentEntriesLoading,
                    workspaces = uiState.workspaces,
                    onDelete = { re -> onConfirmDelete(re.pageId, re.title, false) },
                    onOpenUrl = onOpenUrl,
                    onPlay = onStartFromRecentEntry,
                    dateFormat = uiState.dateFormat,
                    timeFormat = uiState.timeFormat,
                    showNotionLink = uiState.showNotionLink,
                    showArchiveAction = uiState.showArchiveAction
                )

                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

/**
 * The workspace as the screen's title: its colour dot and name in Headline Small. Idle
 * ([onSelect] set) it is a button that opens the workspace menu, each workspace with its dot;
 * while a timer runs it is plain text, since a running timer's workspace can't change.
 */
@Composable
private fun WorkspaceTitle(
    workspaces: List<com.impca201.notiontimetracker.data.models.Workspace>,
    selected: com.impca201.notiontimetracker.data.models.Workspace?,
    onSelect: ((String) -> Unit)?,
    modifier: Modifier = Modifier
) {
    var menuOpen by remember { mutableStateOf(false) }
    val anyColour = workspaces.any { workspaceAccentColor(it.color) != null }
    val dot = workspaceAccentColor(selected?.color)
    val name = selected?.name ?: stringResource(R.string.placeholder_select_workspace)
    val enabled = onSelect != null && workspaces.isNotEmpty()
    val changeLabel = stringResource(R.string.label_workspace)
    Box(modifier) {
        Row(
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clip(CircleShape)
                .then(
                    if (enabled) Modifier
                        .clickable(role = Role.DropdownList, onClickLabel = changeLabel) { menuOpen = true }
                        .padding(start = 16.dp, end = 8.dp)
                    else Modifier.padding(horizontal = 16.dp)
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (dot != null) WorkspaceSwatch(dot)
            Text(
                name,
                style = MaterialTheme.typography.headlineSmall,
                color = if (selected != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
            if (enabled) {
                Icon(
                    Icons.Rounded.ArrowDropDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        if (onSelect != null) {
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                workspaces.forEach { ws ->
                    val wsDot = workspaceAccentColor(ws.color)
                    DropdownMenuItem(
                        text = { Text(ws.name) },
                        onClick = { menuOpen = false; onSelect(ws.id) },
                        // Workspaces without a colour get an empty slot so the names line up.
                        leadingIcon = if (anyColour) ({ WorkspaceSwatch(wsDot ?: Color.Transparent) }) else null,
                        colors = MenuDefaults.itemColors(
                            textColor = if (ws.id == selected?.id) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface
                        )
                    )
                }
            }
        }
    }
}

/**
 * The cookie with Start or Stop on its bottom edge: the button overlaps the shape by half its
 * height, as a FAB anchored to a surface does, so the action reads as belonging to the timer
 * while keeping its label and full 56dp size.
 */
@Composable
private fun TimerHeroWithAction(
    elapsedText: String,
    container: Color,
    contentColor: Color,
    running: Boolean,
    modifier: Modifier = Modifier,
    heroModifier: Modifier = Modifier,
    action: @Composable () -> Unit
) {
    Box(modifier.width(HeroSize).height(HeroSize + TimerActionButtonHeight / 2)) {
        TimerHero(
            elapsedText = elapsedText,
            container = container,
            contentColor = contentColor,
            running = running,
            modifier = heroModifier.align(Alignment.TopCenter)
        )
        Box(Modifier.align(Alignment.BottomCenter)) { action() }
    }
}

private val HeroSize: Dp = 272.dp

/**
 * Every field of the timer in one card: a Group-shaped surface sets the form apart from the
 * timer above and the lists below. Not collapsible — all fields are always in reach.
 */
@Composable
private fun TimerDetailsCard(containerColor: Color, content: @Composable ColumnScope.() -> Unit) {
    Card(
        shape = AppShapes.Group,
        colors = CardDefaults.cardColors(containerColor = containerColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            content = content
        )
    }
}

/**
 * A time as a read-only outlined field with its name as the label: tapping it opens the time
 * picker. [onClear] (when set) adds a clear button, which empties it again.
 */
@Composable
private fun TimeField(
    label: String,
    value: String,
    placeholder: String?,
    pickerDescription: String,
    onPick: () -> Unit,
    modifier: Modifier = Modifier,
    onClear: (() -> Unit)? = null
) {
    Box(modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = { },
            readOnly = true,
            enabled = false,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text(label) },
            placeholder = placeholder?.let { { Text(it) } },
            // With a clear button on top, the slot stays empty but keeps the text clear of it.
            trailingIcon = {
                if (onClear == null) Icon(Icons.Rounded.AccessTime, contentDescription = null)
                else Spacer(Modifier.size(24.dp))
            },
            colors = OutlinedTextFieldDefaults.colors(
                disabledTextColor = MaterialTheme.colorScheme.onSurface,
                disabledBorderColor = MaterialTheme.colorScheme.outline,
                disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                disabledPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant,
                disabledTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant
            )
        )
        Box(
            Modifier
                .matchParentSize()
                .clickable(role = Role.Button, onClickLabel = pickerDescription, onClick = onPick)
        )
        if (onClear != null) {
            IconButton(
                onClick = onClear,
                modifier = Modifier.align(Alignment.CenterEnd).padding(top = 8.dp)
            ) {
                Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.btn_clear))
            }
        }
    }
}

/** Saves the form as a preset: a text button under the details, in the workspace colour. */
@Composable
private fun SavePresetButton(
    onClick: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    color: Color? = null
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        colors = if (color != null) ButtonDefaults.textButtonColors(contentColor = color) else ButtonDefaults.textButtonColors()
    ) {
        Icon(Icons.Rounded.BookmarkBorder, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.title_save_preset))
    }
}

/** An instant as the ISO timestamp the time formatting here reads. */
private fun isoAt(ms: Long): String =
    java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime().toString()

@Composable
private fun OtherRunningTimers(
    timers: List<RunningTimerInfo>,
    loading: Boolean,
    error: String?,
    activePageId: String?,
    onLoad: (RunningTimerInfo) -> Unit,
    onStop: (RunningTimerInfo) -> Unit,
    onDelete: (RunningTimerInfo) -> Unit,
    onOpenUrl: (String) -> Unit,
    showNotionLink: Boolean = true,
    showArchiveAction: Boolean = true
) {
    // A failed query is still worth a line even with nothing to list: an empty
    // list would otherwise read as "nothing is running".
    if (timers.isEmpty() && error == null) return

    // Drives the per-second elapsed counters below. It has to be *read* while
    // composing them — a state that is only written recomposes nothing, which
    // left every timer in this list frozen at the value it had when the list
    // was first drawn.
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(timers) {
        while (true) {
            kotlinx.coroutines.delay(1000L)
            nowMs = System.currentTimeMillis()
        }
    }

    SectionHeader(stringResource(R.string.running_timers_heading), loading = loading)
    error?.let { err ->
        Text(
            localisedMessage(err),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error
        )
    }
    timers.forEach { rt ->
        val isActive = rt.pageId == activePageId
        val startMs = runCatching { OffsetDateTime.parse(rt.startISO).toInstant().toEpochMilli() }.getOrDefault(0L)
        val elapsedSecs = if (startMs > 0) (nowMs - startMs) / 1000L else 0L
        val elapsedStr = formatElapsed(elapsedSecs.coerceAtLeast(0L))

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (!isActive) Modifier.clickable { onLoad(rt) } else Modifier),
            colors = CardDefaults.cardColors(
                containerColor = if (isActive) MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.5f)
                else MaterialTheme.colorScheme.surfaceContainerHigh
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
                    Text(
                        elapsedStr,
                        style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (!isActive) {
                    IconButton(onClick = { onStop(rt) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Rounded.Stop,
                            contentDescription = stringResource(R.string.btn_stop),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (showNotionLink && rt.url.isNotBlank()) {
                    IconButton(onClick = { onOpenUrl(rt.url) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.AutoMirrored.Rounded.OpenInNew,
                            contentDescription = stringResource(R.string.title_open_in_notion),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (showArchiveAction) {
                    IconButton(onClick = { onDelete(rt) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Rounded.Delete,
                            contentDescription = stringResource(R.string.title_delete_entry),
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
    workspaces: List<com.impca201.notiontimetracker.data.models.Workspace> = emptyList(),
    onDelete: (RecentEntryInfo) -> Unit,
    onOpenUrl: (String) -> Unit,
    onPlay: (RecentEntryInfo) -> Unit = {},
    dateFormat: String,
    timeFormat: String,
    showNotionLink: Boolean = true,
    showArchiveAction: Boolean = true
) {
    // The first load shows placeholder cards; a refresh keeps the list and shows the spinner.
    val firstLoad = entries.isEmpty() && loading
    if (entries.isEmpty() && !firstLoad) return

    SectionHeader(stringResource(R.string.recent_entries_heading), loading = loading && !firstLoad)
    if (firstLoad) {
        val loadingText = stringResource(R.string.placeholder_loading)
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = loadingText },
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            repeat(3) { RecentEntrySkeleton() }
        }
    }
    entries.forEach { re ->
        val timeRange = formatRecentRange(re.startISO, re.endISO, dateFormat, timeFormat == "12h")
        val wsAccent = workspaceAccentColor(workspaces.firstOrNull { it.id == re.workspaceId }?.color)
        val cardContainerColor = wsAccent?.copy(alpha = 0.15f) ?: MaterialTheme.colorScheme.surfaceContainerHigh

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = cardContainerColor),
            border = wsAccent?.let { BorderStroke(1.dp, it.copy(alpha = 0.4f)) }
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        timeRange,
                        style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = { onPlay(re) }, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Rounded.PlayArrow,
                        contentDescription = stringResource(R.string.title_start_from_entry),
                        modifier = Modifier.size(18.dp),
                        tint = wsAccent ?: MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (showNotionLink && re.url.isNotBlank()) {
                    IconButton(onClick = { onOpenUrl(re.url) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.AutoMirrored.Rounded.OpenInNew,
                            contentDescription = stringResource(R.string.title_open_in_notion),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (showArchiveAction) {
                    IconButton(onClick = { onDelete(re) }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Rounded.Delete,
                            contentDescription = stringResource(R.string.title_delete_entry),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

/** Stands in for a recent-entry card (title, workspace, time range) while the list loads. */
@Composable
private fun RecentEntrySkeleton() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            SkeletonLine(Modifier.fillMaxWidth(0.6f), height = 16.dp)
            SkeletonLine(Modifier.fillMaxWidth(0.35f), height = 12.dp)
            SkeletonLine(Modifier.fillMaxWidth(0.5f), height = 12.dp)
        }
    }
}

/**
 * The selected workspace's extra fields while their options load from Notion: the real labels
 * over placeholder fields, so the form doesn't jump when the inputs arrive.
 */
@Composable
private fun ExtraFieldsSkeleton(props: List<com.impca201.notiontimetracker.data.models.ExtraProp>) {
    val loadingText = stringResource(R.string.placeholder_loading)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = loadingText },
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        props.forEach { prop ->
            if (prop.type == "checkbox") {
                SkeletonBlock(height = 32.dp, modifier = Modifier.width(52.dp), shape = CircleShape)
            } else {
                SkeletonBlock(height = 56.dp, shape = MaterialTheme.shapes.extraSmall)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun PresetChips(
    workspaces: List<com.impca201.notiontimetracker.data.models.Workspace>,
    apiKey: String,
    onApplyPreset: (String, Preset) -> Unit,
    onManageClick: () -> Unit
) {
    val allPresets = workspaces.flatMap { ws -> ws.presets.map { ws to it } }
    if (allPresets.isEmpty() || apiKey.isBlank()) return
    // SuggestionChip pads itself out to Material3's ~48dp minimum touch target, which
    // makes each chip's laid-out height much taller than its visible ~32dp content —
    // that invisible padding was stacking on top of the declared line spacing below,
    // making wrapped rows look far apart. Setting the minimum to 0.dp here lets the
    // chips (and the gap between wrapped lines) size to their actual visual content.
    // (The older LocalMinimumInteractiveComponentEnforcement flag is deprecated and
    // ignored since Material3 1.3, so it no longer has any effect.)
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)
        ) {
            allPresets.forEach { (ws, preset) ->
                val wsColor = workspaceAccentColor(ws.color)
                val chipLabel = "▶ ${preset.name}"
                SuggestionChip(
                    onClick = { onApplyPreset(ws.id, preset) },
                    // One line, ellipsized only when the chip would be wider than
                    // the row — same as the Windows chips.
                    label = {
                        Text(
                            chipLabel,
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
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

            Box(
                modifier = Modifier
                    .align(Alignment.CenterVertically)
                    .size(32.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onManageClick),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Rounded.Edit,
                    contentDescription = stringResource(R.string.title_manage_presets),
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/** The app's top bar: the title in Material 3's default (regular) style, actions on the right.
 *  Transparent, so a running timer's tinted background runs up behind it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimerTopBar(actions: @Composable RowScope.() -> Unit) {
    TopAppBar(
        title = { Text(stringResource(R.string.app_title)) },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
    )
}

private val TimerActionButtonHeight: Dp = 56.dp

/**
 * Start and Stop keep their meaning whatever the theme or wallpaper colours: green and red, with
 * white labels (a workspace colour, when set, replaces the green).
 */
private object TimerColors {
    val Start = Color(0xFF1E8E3E)
    val Stop = Color(0xFFD93025)
    val OnAction = Color.White
}

/**
 * The Start / Stop button, sized as a Material 3 Expressive medium button: 56dp high, a Title
 * Medium label, 24dp icon. Fully round, tightening to 12dp corners while pressed (the Expressive
 * shape morph); its colour follows the workspace, so switching workspaces animates it.
 */
@Composable
private fun TimerActionButton(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean,
    loading: Boolean,
    containerColor: Color,
    contentColor: Color,
    modifier: Modifier = Modifier
) {
    val animate = !rememberReducedMotion()
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val corner by animateDpAsState(
        targetValue = if (pressed && animate) 12.dp else TimerActionButtonHeight / 2,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 800f),
        label = "timer-button-corner"
    )
    val container by animateColorAsState(containerColor, Motion.fadeSpec(), label = "timer-button-color")
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(TimerActionButtonHeight),
        shape = RoundedCornerShape(corner),
        interactionSource = interactionSource,
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = contentColor),
        contentPadding = PaddingValues(horizontal = 24.dp)
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp, color = contentColor)
        } else {
            Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(8.dp))
            Text(label, style = MaterialTheme.typography.titleMedium)
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

/** Refresh icon button that spins while a refresh is in progress. */
@Composable
private fun RefreshIconButton(loading: Boolean, onClick: () -> Unit) {
    val rotation = remember { Animatable(0f) }
    LaunchedEffect(loading) {
        if (loading) {
            rotation.snapTo(0f)
            rotation.animateTo(
                targetValue = 360f,
                animationSpec = infiniteRepeatable(tween(durationMillis = 900, easing = LinearEasing))
            )
        } else {
            rotation.snapTo(0f)
        }
    }
    IconButton(onClick = onClick) {
        Icon(
            Icons.Rounded.Refresh,
            contentDescription = stringResource(R.string.btn_refresh_all),
            modifier = Modifier.rotate(rotation.value)
        )
    }
}

/**
 * Resolves a message key from the view model (see `UiError`) to text in the
 * language the app is set to. Anything after a `|` is Notion's own message and
 * is appended as detail; an unrecognised key is shown as-is so a message is
 * never swallowed.
 */
@Composable
private fun localisedMessage(raw: String): String {
    val key = raw.substringBefore('|')
    val detail = raw.substringAfter('|', "")
    val resId = when (key) {
        "no_api_key" -> R.string.error_no_api_key
        "start_failed" -> R.string.toast_start_error
        "stop_failed" -> R.string.toast_stop_error
        "update_failed" -> R.string.toast_update_error
        "delete_failed" -> R.string.toast_delete_error
        "running_timers_failed" -> R.string.error_running_timers_failed
        "required_fields_missing" -> R.string.toast_required_fields_missing
        "required_fields_before_stopping" -> R.string.toast_required_before_stopping
        "description_before_stopping" -> R.string.toast_description_before_stopping
        "timer_stopped_elsewhere" -> R.string.timer_stopped_elsewhere
        "extras_load_failed" -> R.string.error_extras_load_failed
        "extras_missing_props" -> R.string.error_extras_missing_props
        else -> null
    } ?: return raw
    val text = stringResource(resId)
    return if (detail.isBlank()) text else "$text: $detail"
}

/** True for the validation messages that the user fixes by filling the form in,
 *  rather than by retrying the failed call. */
private fun isValidationMessage(raw: String): Boolean =
    raw.substringBefore('|') in setOf("required_fields_before_stopping", "description_before_stopping")

/**
 * Heads a list section (active timers, recent entries) in Title Medium. Space above it, not a
 * divider, separates the section from what comes before: Material 3 keeps dividers for
 * separating items inside a group, and the header already marks where the group starts.
 */
@Composable
private fun SectionHeader(text: String, loading: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .semantics { heading() },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f)
        )
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        }
    }
}

/** The selected workspace's colour as a dot at the start of the workspace field. */
@Composable
private fun WorkspaceSwatch(color: Color) {
    Box(
        Modifier
            .size(12.dp)
            .clip(CircleShape)
            .background(color)
    )
}

private fun formatElapsed(totalSeconds: Long): String {
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return "%02d:%02d:%02d".format(h, m, s)
}

private fun formatHHMM(iso: String, is12h: Boolean = false): String = runCatching {
    val odt = OffsetDateTime.parse(iso)
    if (is12h) {
        val hr = odt.hour
        val ampm = if (hr >= 12) "PM" else "AM"
        val h12 = when {
            hr == 0 -> 12
            hr > 12 -> hr - 12
            else -> hr
        }
        "%d:%02d %s".format(h12, odt.minute, ampm)
    } else {
        "%02d:%02d".format(odt.hour, odt.minute)
    }
}.getOrDefault("")

private fun parseHHMMToISO(hhMM: String, referenceISO: String): String? = runCatching {
    val clean = hhMM.trim().uppercase()
    val isPM = clean.contains("PM")
    val isAM = clean.contains("AM")
    val timePart = clean.replace("AM", "").replace("PM", "").trim()
    val parts = timePart.split(":")
    if (parts.size < 2) return null
    var h = parts[0].toInt()
    val m = parts[1].toInt()
    if (isPM && h < 12) h += 12
    if (isAM && h == 12) h = 0
    val base = OffsetDateTime.parse(referenceISO)
    val target = base.withHour(h).withMinute(m).withSecond(0).withNano(0)
    DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(target)
}.getOrNull()

private fun parseHHMMToMillis(hhMM: String, referenceISO: String): Long? = runCatching {
    val iso = parseHHMMToISO(hhMM, referenceISO) ?: return null
    OffsetDateTime.parse(iso).toInstant().toEpochMilli()
}.getOrNull()

private fun formatDate(iso: String, format: String = "DD/MM/YYYY"): String = runCatching {
    val odt = OffsetDateTime.parse(iso)
    when (format) {
        "MM/DD/YYYY" -> "%02d/%02d/%04d".format(odt.monthValue, odt.dayOfMonth, odt.year)
        "YYYY-MM-DD" -> "%04d-%02d-%02d".format(odt.year, odt.monthValue, odt.dayOfMonth)
        else -> "%02d/%02d/%04d".format(odt.dayOfMonth, odt.monthValue, odt.year) // default DD/MM/YYYY
    }
}.getOrDefault("")

private fun formatRecentRange(startISO: String?, endISO: String?, dateFormat: String, is12h: Boolean): String {
    if (startISO == null) return ""
    val startDateStr = formatDate(startISO, dateFormat)
    val startTimeStr = formatHHMM(startISO, is12h)
    if (endISO == null || endISO.isBlank()) {
        return "$startDateStr $startTimeStr"
    }
    val endDateStr = formatDate(endISO, dateFormat)
    val endTimeStr = formatHHMM(endISO, is12h)
    return if (startDateStr == endDateStr) {
        "$startDateStr $startTimeStr → $endTimeStr"
    } else {
        "$startDateStr $startTimeStr → $endDateStr $endTimeStr"
    }
}

@Composable
private fun ManagePresetsDialog(
    workspaces: List<com.impca201.notiontimetracker.data.models.Workspace>,
    onDeletePreset: (String, String) -> Unit,
    onMovePresetUp: (String, String) -> Unit,
    onMovePresetDown: (String, String) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.presets_manage_title)) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 400.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Rounded.Info, contentDescription = stringResource(R.string.title_info), tint = MaterialTheme.colorScheme.onSecondaryContainer)
                        Text(
                            text = stringResource(R.string.tooltip_presets_shortcuts),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                }

                val flatPresets = workspaces.flatMap { ws ->
                    ws.presets.mapIndexed { index, preset ->
                        Triple(ws, preset, index)
                    }
                }
                flatPresets.forEach { (ws, preset, indexInWorkspace) ->
                    val label = "${ws.name} – ${preset.name}"
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { onMovePresetUp(ws.id, preset.id) },
                                enabled = indexInWorkspace > 0,
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Rounded.ArrowUpward, contentDescription = stringResource(R.string.title_move_preset_up), modifier = Modifier.size(16.dp))
                            }
                            IconButton(
                                onClick = { onMovePresetDown(ws.id, preset.id) },
                                enabled = indexInWorkspace < ws.presets.size - 1,
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Rounded.ArrowDownward, contentDescription = stringResource(R.string.title_move_preset_down), modifier = Modifier.size(16.dp))
                            }
                            IconButton(
                                onClick = { onDeletePreset(ws.id, preset.id) },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Rounded.Delete, contentDescription = stringResource(R.string.title_remove_preset), modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.title_dismiss))
            }
        }
    )
}


