package com.impca201.notiontimetracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.ThemeMode
import com.impca201.notiontimetracker.data.models.Workspace
import com.impca201.notiontimetracker.ui.components.WorkspaceModal
import com.impca201.notiontimetracker.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    uiState: SettingsViewModel.UiState,
    editState: SettingsViewModel.WorkspaceEditState?,
    isEditValid: Boolean,
    onBack: () -> Unit,
    onApiKeyChange: (String) -> Unit,
    onToggleApiKeyVisible: () -> Unit,
    onTestAndSave: () -> Unit,
    onMoveUp: (String) -> Unit,
    onMoveDown: (String) -> Unit,
    onEditWorkspace: (Workspace) -> Unit,
    onDeleteWorkspace: (String) -> Unit,
    onAddWorkspace: () -> Unit,
    onCloseEdit: () -> Unit,
    onSaveWorkspace: () -> Unit,
    onWorkspaceNameChange: (String) -> Unit,
    onTimeEntriesDbChange: (String) -> Unit,
    onRefreshDatabases: () -> Unit,
    onDatePropChange: (String) -> Unit,
    onStatusPropChange: (String) -> Unit,
    onStatusRunningChange: (String) -> Unit,
    onStatusDoneChange: (String) -> Unit,
    onRoundingChange: (Int) -> Unit,
    onColorChange: (String) -> Unit = {},
    onAddExtraProp: () -> Unit,
    onRemoveExtraProp: (Int) -> Unit,
    onExtraPropNameChange: (Int, String) -> Unit,
    onExtraPropRequiredChange: (Int, Boolean) -> Unit,
    onExtraPropDefaultChange: (Int, String?) -> Unit,
    onAddPreset: () -> Unit = {},
    onRemovePreset: (Int) -> Unit = {},
    onUpdatePreset: (Int, com.impca201.notiontimetracker.data.models.Preset) -> Unit = { _, _ -> },
    onThemeModeChange: (ThemeMode) -> Unit,
    onScanQr: () -> Unit,
    onSnackbarDismiss: () -> Unit
) {
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.snackbarMessage) {
        uiState.snackbarMessage?.let { msg ->
            val text = when {
                msg == "api_key_saved" -> "API key works and was saved."
                msg.startsWith("workspace_added:") -> "Workspace \"${msg.substringAfter(":")}\" added."
                msg.startsWith("workspace_saved:") -> "Workspace \"${msg.substringAfter(":")}\" saved."
                else -> msg
            }
            snackbarHostState.showSnackbar(text)
            onSnackbarDismiss()
        }
    }

    if (editState != null) {
        WorkspaceModal(
            state = editState,
            onDismiss = onCloseEdit,
            onSave = onSaveWorkspace,
            onNameChange = onWorkspaceNameChange,
            onTimeEntriesDbChange = onTimeEntriesDbChange,
            onRefreshDatabases = onRefreshDatabases,
            onDatePropChange = onDatePropChange,
            onStatusPropChange = onStatusPropChange,
            onStatusRunningChange = onStatusRunningChange,
            onStatusDoneChange = onStatusDoneChange,
            onRoundingChange = onRoundingChange,
            onColorChange = onColorChange,
            onAddExtraProp = onAddExtraProp,
            onRemoveExtraProp = onRemoveExtraProp,
            onExtraPropNameChange = onExtraPropNameChange,
            onExtraPropRequiredChange = onExtraPropRequiredChange,
            onExtraPropDefaultChange = onExtraPropDefaultChange,
            onAddPreset = onAddPreset,
            onRemovePreset = onRemovePreset,
            onUpdatePreset = onUpdatePreset,
            isValid = isEditValid
        )
        return
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.btn_back))
                    }
                }
            )
        }
    ) { padding ->
        val scrollState = rememberScrollState()
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (uiState.workspaces.isEmpty()) {
                Spacer(Modifier.height(4.dp))
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Text(
                        stringResource(R.string.first_launch_hint),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            // --- API Key section ---
            Text(stringResource(R.string.label_api_key), style = MaterialTheme.typography.titleSmall)

            OutlinedTextField(
                value = uiState.apiKey,
                onValueChange = onApiKeyChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(stringResource(R.string.placeholder_api_key)) },
                visualTransformation = if (uiState.apiKeyVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    TextButton(onClick = onToggleApiKeyVisible) {
                        Text(
                            if (uiState.apiKeyVisible) stringResource(R.string.btn_hide_key)
                            else stringResource(R.string.btn_show_key)
                        )
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onTestAndSave() })
            )

            uiState.keyTestError?.let { err ->
                Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick = onTestAndSave,
                enabled = uiState.apiKey.isNotBlank() && !uiState.testingKey,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (uiState.testingKey) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.btn_testing_key))
                } else {
                    Text(stringResource(R.string.btn_test_and_save_key))
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // --- Workspaces section ---
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(stringResource(R.string.label_workspaces), style = MaterialTheme.typography.titleSmall)
            }

            if (uiState.workspaces.isEmpty()) {
                Text(
                    stringResource(R.string.no_workspaces_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium
                )
            } else {
                uiState.workspaces.forEachIndexed { index, workspace ->
                    WorkspaceListItem(
                        workspace = workspace,
                        canMoveUp = index > 0,
                        canMoveDown = index < uiState.workspaces.size - 1,
                        timerRunning = uiState.timerRunning,
                        onEdit = { onEditWorkspace(workspace) },
                        onDelete = { onDeleteWorkspace(workspace.id) },
                        onMoveUp = { onMoveUp(workspace.id) },
                        onMoveDown = { onMoveDown(workspace.id) }
                    )
                }
            }

            OutlinedButton(
                onClick = onAddWorkspace,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.btn_add_workspace))
            }

            OutlinedButton(
                onClick = onScanQr,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.btn_add_workspace_qr))
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // --- Theme section ---
            Text(stringResource(R.string.label_theme), style = MaterialTheme.typography.titleSmall)
            ThemePicker(selected = uiState.themeMode, onSelect = onThemeModeChange)

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ThemePicker(selected: ThemeMode, onSelect: (ThemeMode) -> Unit) {
    val options = listOf(
        ThemeMode.AUTO to R.string.theme_auto,
        ThemeMode.LIGHT to R.string.theme_light,
        ThemeMode.DARK to R.string.theme_dark,
    )
    Column {
        options.forEach { (mode, labelRes) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                RadioButton(selected = selected == mode, onClick = { onSelect(mode) })
                Spacer(Modifier.width(8.dp))
                Text(stringResource(labelRes), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun WorkspaceListItem(
    workspace: Workspace,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    timerRunning: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f).padding(start = 4.dp)) {
                Text(workspace.name, style = MaterialTheme.typography.bodyLarge)
                if (workspace.roundingMinutes > 0) {
                    Text(
                        "Rounding: ${workspace.roundingMinutes} min",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Column {
                IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                    Icon(Icons.Default.KeyboardArrowUp, contentDescription = stringResource(R.string.title_move_up))
                }
                IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = stringResource(R.string.title_move_down))
                }
            }

            IconButton(onClick = onEdit) {
                Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.modal_title_edit_workspace))
            }

            IconButton(onClick = onDelete, enabled = !timerRunning) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = if (timerRunning) stringResource(R.string.title_delete_workspace_disabled)
                    else stringResource(R.string.title_delete_workspace),
                    tint = if (timerRunning) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.error
                )
            }
        }
    }
}
