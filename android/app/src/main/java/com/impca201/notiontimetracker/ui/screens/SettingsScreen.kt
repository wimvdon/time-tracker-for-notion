package com.impca201.notiontimetracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.ThemeMode
import com.impca201.notiontimetracker.data.models.Workspace
import androidx.activity.compose.BackHandler
import com.impca201.notiontimetracker.ui.components.WorkspaceModal
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import com.impca201.notiontimetracker.ui.theme.AppShapes
import com.impca201.notiontimetracker.ui.theme.AppearanceSettings
import com.impca201.notiontimetracker.ui.theme.CollapsibleSection
import com.impca201.notiontimetracker.ui.theme.SettingsFooter
import com.impca201.notiontimetracker.ui.theme.SettingsScaffold
import com.impca201.notiontimetracker.ui.theme.SwitchSetting
import com.impca201.notiontimetracker.ui.theme.rememberAppVersion
import com.impca201.notiontimetracker.ui.theme.dynamicColorSupported
import com.impca201.notiontimetracker.viewmodel.SettingsViewModel
import com.impca201.notiontimetracker.ui.components.SearchableDropdown
import com.impca201.notiontimetracker.data.models.NamedOption

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
    onRemoveApiKey: () -> Unit,
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
    onDescriptionRequiredChange: (Boolean) -> Unit = {},
    onColorChange: (String) -> Unit = {},
    onAddExtraProp: () -> Unit,
    onRemoveExtraProp: (Int) -> Unit,
    onExtraPropNameChange: (Int, String) -> Unit,
    onExtraPropRequiredChange: (Int, Boolean) -> Unit,
    onExtraPropDefaultChange: (Int, String?) -> Unit,
    onThemeModeChange: (ThemeMode) -> Unit,
    onDynamicColorChange: (Boolean) -> Unit,
    onSnackbarDismiss: () -> Unit,
    onLocaleChange: (String) -> Unit = {},
    onDateFormatChange: (String) -> Unit = {},
    onTimeFormatChange: (String) -> Unit = {},
    onShowNotionLinkChange: (Boolean) -> Unit = {},
    onShowArchiveActionChange: (Boolean) -> Unit = {},
    onCreateSyncPage: (String, String) -> Unit = { _, _ -> },
    onLoadExistingSyncPage: (String, String) -> Unit = { _, _ -> },
    onDisconnectSync: () -> Unit = {},
    onSearchSyncPages: suspend () -> List<NamedOption> = { emptyList() }
) {
    BackHandler(onBack = onBack)
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(uiState.snackbarMessage) {
        uiState.snackbarMessage?.let { msg ->
            val text = when {
                msg == "api_key_saved" -> context.getString(R.string.toast_api_key_saved)
                msg == "api_key_removed" -> context.getString(R.string.toast_api_key_removed)
                msg.startsWith("workspace_added:") -> context.getString(R.string.toast_workspace_added, msg.substringAfter(":"))
                msg.startsWith("workspace_saved:") -> context.getString(R.string.toast_workspace_saved, msg.substringAfter(":"))
                else -> msg
            }
            // Dismiss the keyboard so the snackbar isn't hidden behind it.
            keyboardController?.hide()
            focusManager.clearFocus()
            snackbarHostState.showSnackbar(text)
            onSnackbarDismiss()
        }
    }

    if (editState != null) {
        WorkspaceModal(
            state = editState,
            allWorkspaces = uiState.workspaces,
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
            onDescriptionRequiredChange = onDescriptionRequiredChange,
            onColorChange = onColorChange,
            onAddExtraProp = onAddExtraProp,
            onRemoveExtraProp = onRemoveExtraProp,
            onExtraPropNameChange = onExtraPropNameChange,
            onExtraPropRequiredChange = onExtraPropRequiredChange,
            onExtraPropDefaultChange = onExtraPropDefaultChange,
            isValid = isEditValid
        )
        return
    }

    // Both sync dialogs close themselves once the sync page id changes (success);
    // on failure uiState.syncError is shown and the dialog stays open.
    var showCreateSync by remember { mutableStateOf(false) }
    var showLoadSync by remember { mutableStateOf(false) }
    LaunchedEffect(uiState.syncPageId) {
        if (uiState.syncPageId != null) {
            showCreateSync = false
            showLoadSync = false
        }
    }
    if (showCreateSync) {
        CreateSyncDialog(
            syncing = uiState.syncing,
            error = uiState.syncError,
            onDismiss = { showCreateSync = false },
            onSearch = onSearchSyncPages,
            onCreate = onCreateSyncPage
        )
    }
    if (showLoadSync) {
        LoadSyncDialog(
            syncing = uiState.syncing,
            error = uiState.syncError,
            onDismiss = { showLoadSync = false },
            onSearch = onSearchSyncPages,
            onAttach = onLoadExistingSyncPage
        )
    }

    val themeOptions = listOf(
        ThemeMode.AUTO to stringResource(R.string.theme_auto),
        ThemeMode.LIGHT to stringResource(R.string.theme_light),
        ThemeMode.DARK to stringResource(R.string.theme_dark),
    )
    val languageOptions = listOf(
        NamedOption("system", stringResource(R.string.language_system)),
        NamedOption("en", stringResource(R.string.language_en)),
        NamedOption("nl", stringResource(R.string.language_nl)),
        NamedOption("fr", stringResource(R.string.language_fr)),
        NamedOption("de", stringResource(R.string.language_de)),
        NamedOption("es", stringResource(R.string.language_es)),
        NamedOption("it", stringResource(R.string.language_it))
    )
    // A locale pulled in from the Windows app arrives as a full tag ("en-GB", "nl-BE"), so the
    // option is matched on the language subtag — otherwise the picker reads "System" while the
    // app is actually rendering that language.
    val localeLanguage = uiState.locale.lowercase().substringBefore('-').substringBefore('_')
    val selectedLanguage = languageOptions.firstOrNull { it.id == localeLanguage } ?: languageOptions.first()
    val dateFormatOptions = listOf(
        NamedOption("DD/MM/YYYY", "DD/MM/YYYY"),
        NamedOption("MM/DD/YYYY", "MM/DD/YYYY"),
        NamedOption("YYYY-MM-DD", "YYYY-MM-DD")
    )
    val selectedDateFormat = dateFormatOptions.firstOrNull { it.id == uiState.dateFormat } ?: dateFormatOptions.first()
    val timeFormatOptions = listOf(
        NamedOption("24h", "24h"),
        NamedOption("12h", "12h")
    )
    val selectedTimeFormat = timeFormatOptions.firstOrNull { it.id == uiState.timeFormat } ?: timeFormatOptions.first()

    SettingsScaffold(
        title = stringResource(R.string.settings_title),
        backLabel = stringResource(R.string.btn_back),
        onBack = onBack,
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) {
        if (uiState.workspaces.isEmpty()) {
            item(key = "first-launch") {
                Surface(shape = AppShapes.Group, color = MaterialTheme.colorScheme.secondaryContainer) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Icon(Icons.Rounded.Info, contentDescription = null)
                        Text(stringResource(R.string.first_launch_hint), style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        // --- Connection: API key and sync ---
        item(key = "api-key") {
            CollapsibleSection(
                key = "api-key",
                title = stringResource(R.string.label_api_key),
                summary = uiState.savedApiKey.takeIf { it.isNotBlank() }?.let { "••••" + it.takeLast(4) },
                icon = rememberVectorPainter(Icons.Rounded.Key),
                initiallyExpanded = uiState.savedApiKey.isBlank()
            ) {
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
                    enabled = !uiState.testingKey && uiState.apiKey.isNotBlank(),
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
                // Removing is its own action, offered only while a key is actually stored.
                if (uiState.savedApiKey.isNotBlank()) {
                    TextButton(
                        onClick = onRemoveApiKey,
                        enabled = !uiState.testingKey,
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Text(stringResource(R.string.btn_remove_key), color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        item(key = "sync") {
            CollapsibleSection(
                key = "sync",
                title = stringResource(R.string.label_sync),
                summary = if (uiState.syncPageId != null) {
                    stringResource(R.string.sync_status_connected, uiState.syncPageTitle.ifBlank { uiState.syncPageId!! })
                } else {
                    stringResource(R.string.sync_summary_not_connected)
                },
                icon = rememberVectorPainter(Icons.Rounded.Sync)
            ) {
                if (uiState.syncPageId != null) {
                    TextButton(onClick = onDisconnectSync) {
                        Text(stringResource(R.string.btn_disconnect_sync))
                    }
                } else {
                    Text(
                        stringResource(R.string.sync_status_not_connected),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { showCreateSync = true }, enabled = uiState.apiKey.isNotBlank()) {
                            Text(stringResource(R.string.btn_create_sync_page))
                        }
                        OutlinedButton(onClick = { showLoadSync = true }, enabled = uiState.apiKey.isNotBlank()) {
                            Text(stringResource(R.string.btn_load_existing_sync))
                        }
                    }
                }
            }
        }

        // --- App features ---
        item(key = "workspaces") {
            CollapsibleSection(
                key = "workspaces",
                title = stringResource(R.string.label_workspaces),
                summary = uiState.workspaces.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name }
                    ?: stringResource(R.string.no_workspaces_yet),
                icon = rememberVectorPainter(Icons.Rounded.Folder),
                initiallyExpanded = uiState.workspaces.isEmpty()
            ) {
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
                OutlinedButton(onClick = onAddWorkspace, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                    Spacer(Modifier.width(ButtonDefaults.IconSpacing))
                    Text(stringResource(R.string.btn_add_workspace))
                }
            }
        }

        item(key = "notion-actions") {
            CollapsibleSection(
                key = "notion-actions",
                title = stringResource(R.string.label_notion_actions),
                summary = listOfNotNull(
                    stringResource(R.string.title_open_in_notion).takeIf { uiState.showNotionLink },
                    stringResource(R.string.confirm_delete_confirm).takeIf { uiState.showArchiveAction }
                ).joinToString(", ").ifEmpty { null },
                icon = rememberVectorPainter(Icons.Rounded.Link)
            ) {
                SwitchSetting(
                    title = stringResource(R.string.label_show_notion_link),
                    summary = null,
                    checked = uiState.showNotionLink,
                    onCheckedChange = onShowNotionLinkChange
                )
                SwitchSetting(
                    title = stringResource(R.string.label_show_archive_action),
                    summary = null,
                    checked = uiState.showArchiveAction,
                    onCheckedChange = onShowArchiveActionChange
                )
            }
        }

        // --- Appearance, then language and formats ---
        item(key = "appearance") {
            CollapsibleSection(
                key = "appearance",
                title = stringResource(R.string.label_theme),
                summary = themeOptions.first { it.first == uiState.themeMode }.second,
                icon = rememberVectorPainter(Icons.Rounded.Palette)
            ) {
                AppearanceSettings(
                    themeLabel = stringResource(R.string.label_theme_mode),
                    themeOptions = themeOptions.map { it.second },
                    selectedTheme = themeOptions.indexOfFirst { it.first == uiState.themeMode },
                    onThemeSelect = { onThemeModeChange(themeOptions[it].first) },
                    dynamicColorTitle = stringResource(R.string.label_dynamic_color),
                    dynamicColorSummary = stringResource(R.string.dynamic_color_hint),
                    dynamicColor = uiState.dynamicColor,
                    onDynamicColorChange = onDynamicColorChange,
                    dynamicColorSupported = dynamicColorSupported
                )
            }
        }

        item(key = "language") {
            CollapsibleSection(
                key = "language",
                title = stringResource(R.string.label_language),
                summary = "${selectedLanguage.name} · ${selectedDateFormat.name} · ${selectedTimeFormat.name}",
                icon = rememberVectorPainter(Icons.Rounded.Language)
            ) {
                SearchableDropdown(
                    options = languageOptions,
                    selected = selectedLanguage,
                    placeholder = stringResource(R.string.label_language),
                    onSelect = { opt -> if (opt != null) onLocaleChange(opt.id) },
                    searchable = false,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(stringResource(R.string.label_date_format), style = MaterialTheme.typography.labelLarge)
                SearchableDropdown(
                    options = dateFormatOptions,
                    selected = selectedDateFormat,
                    placeholder = stringResource(R.string.label_date_format),
                    onSelect = { opt -> if (opt != null) onDateFormatChange(opt.id) },
                    searchable = false,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(stringResource(R.string.label_time_format), style = MaterialTheme.typography.labelLarge)
                SearchableDropdown(
                    options = timeFormatOptions,
                    selected = selectedTimeFormat,
                    placeholder = stringResource(R.string.label_time_format),
                    onSelect = { opt -> if (opt != null) onTimeFormatChange(opt.id) },
                    searchable = false,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        item(key = "footer") {
            SettingsFooter("${stringResource(R.string.app_name)} ${rememberAppVersion()}")
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
        shape = AppShapes.Item,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
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
                        stringResource(R.string.workspace_rounding_summary, workspace.roundingMinutes),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Column {
                IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                    Icon(Icons.Rounded.KeyboardArrowUp, contentDescription = stringResource(R.string.title_move_up))
                }
                IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                    Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = stringResource(R.string.title_move_down))
                }
            }

            IconButton(onClick = onEdit) {
                Icon(Icons.Rounded.Edit, contentDescription = stringResource(R.string.modal_title_edit_workspace))
            }

            IconButton(onClick = onDelete, enabled = !timerRunning) {
                Icon(
                    Icons.Rounded.Delete,
                    contentDescription = if (timerRunning) stringResource(R.string.title_delete_workspace_disabled)
                    else stringResource(R.string.title_delete_workspace),
                    tint = if (timerRunning) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

/** Dialog to create a new top-level Notion page holding the sync payload. */
@Composable
/**
 * Notion's API rejects `parent.workspace` for internal integrations ("aren't
 * owned by a single user"), so the new page must be created as a child of a
 * page the integration already has access to — picked here via the same
 * search-and-select pattern as [LoadSyncDialog].
 */
private fun CreateSyncDialog(
    syncing: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSearch: suspend () -> List<NamedOption>,
    onCreate: (String, String) -> Unit
) {
    var title by remember { mutableStateOf("Time Tracker Sync") }
    var pages by remember { mutableStateOf<List<NamedOption>>(emptyList()) }
    var loadingPages by remember { mutableStateOf(true) }
    var parentPage by remember { mutableStateOf<NamedOption?>(null) }
    var searchError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        loadingPages = true
        pages = runCatching { onSearch() }.getOrElse {
            searchError = it.message
            emptyList()
        }
        loadingPages = false
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.modal_title_create_sync)) },
        text = {
            Column {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = { Text(stringResource(R.string.placeholder_sync_page_title)) },
                    singleLine = true,
                    enabled = !syncing,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                if (searchError != null) {
                    Text(searchError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                } else {
                    SearchableDropdown(
                        options = pages,
                        selected = parentPage,
                        placeholder = stringResource(R.string.placeholder_select_sync_page),
                        onSelect = { parentPage = it },
                        loading = loadingPages,
                        enabled = !syncing,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.hint_create_sync),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { parentPage?.let { onCreate(it.id, title) } },
                enabled = !syncing && title.isNotBlank() && parentPage != null
            ) {
                Text(stringResource(R.string.btn_create))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.btn_cancel)) }
        }
    )
}

/** Dialog to attach to an existing Notion page containing a sync code block. */
@Composable
private fun LoadSyncDialog(
    syncing: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSearch: suspend () -> List<NamedOption>,
    onAttach: (String, String) -> Unit
) {
    var pages by remember { mutableStateOf<List<NamedOption>>(emptyList()) }
    var loadingPages by remember { mutableStateOf(true) }
    var selected by remember { mutableStateOf<NamedOption?>(null) }
    var searchError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        loadingPages = true
        pages = runCatching { onSearch() }.getOrElse {
            searchError = it.message
            emptyList()
        }
        loadingPages = false
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.modal_title_load_sync)) },
        text = {
            Column {
                if (searchError != null) {
                    Text(searchError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                } else {
                    SearchableDropdown(
                        options = pages,
                        selected = selected,
                        placeholder = stringResource(R.string.placeholder_select_sync_page),
                        onSelect = { selected = it },
                        loading = loadingPages,
                        enabled = !syncing,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.hint_load_sync),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (it == "not_a_sync_page") stringResource(R.string.error_not_a_sync_page) else it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { selected?.let { onAttach(it.id, it.name) } },
                enabled = !syncing && selected != null
            ) {
                Text(stringResource(R.string.btn_attach))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.btn_cancel)) }
        }
    )
}
