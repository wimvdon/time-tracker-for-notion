package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.ExtraFieldDef
import com.impca201.notiontimetracker.data.models.ExtraProp
import com.impca201.notiontimetracker.data.models.NamedOption
import com.impca201.notiontimetracker.data.models.Preset
import com.impca201.notiontimetracker.data.models.READ_ONLY_TYPES
import com.impca201.notiontimetracker.data.models.SchemaProperty
import com.impca201.notiontimetracker.data.models.WRITABLE_EXTRA_TYPES
import com.impca201.notiontimetracker.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspaceModal(
    state: SettingsViewModel.WorkspaceEditState,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onNameChange: (String) -> Unit,
    onTimeEntriesDbChange: (String) -> Unit,
    onRefreshDatabases: () -> Unit,
    onDatePropChange: (String) -> Unit,
    onStatusPropChange: (String) -> Unit,
    onStatusRunningChange: (String) -> Unit,
    onStatusDoneChange: (String) -> Unit,
    onRoundingChange: (Int) -> Unit,
    onAddExtraProp: () -> Unit,
    onRemoveExtraProp: (Int) -> Unit,
    onExtraPropNameChange: (Int, String) -> Unit,
    onExtraPropRequiredChange: (Int, Boolean) -> Unit,
    onExtraPropDefaultChange: (Int, String?) -> Unit,
    onAddPreset: () -> Unit = {},
    onRemovePreset: (Int) -> Unit = {},
    onUpdatePreset: (Int, Preset) -> Unit = { _, _ -> },
    isValid: Boolean
) {
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.isNew) stringResource(R.string.modal_title_add_workspace)
                        else stringResource(R.string.modal_title_edit_workspace)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = stringResource(R.string.btn_cancel))
                    }
                },
                actions = {
                    TextButton(onClick = onSave, enabled = isValid && !state.saving) {
                        if (state.saving) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        else Text(stringResource(R.string.btn_save))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(scrollState)
        ) {
            Spacer(Modifier.height(8.dp))

            // Name
            SectionLabel(stringResource(R.string.label_workspace_name))
            OutlinedTextField(
                value = state.name,
                onValueChange = onNameChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("My workspace") }
            )

            Spacer(Modifier.height(16.dp))

            // Time Entries database
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionLabel(stringResource(R.string.label_time_entries_db), modifier = Modifier.weight(1f))
                TextButton(onClick = onRefreshDatabases, enabled = !state.databasesLoading) {
                    Text(stringResource(R.string.btn_refresh_databases))
                }
            }
            when {
                state.databasesLoading -> LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                state.databasesError != null -> Text(
                    state.databasesError,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
                state.databases.isEmpty() -> Text(
                    stringResource(R.string.no_databases_found),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall
                )
                else -> SearchableDropdown(
                    options = state.databases,
                    selected = state.databases.firstOrNull { it.id == state.timeEntriesDbId },
                    placeholder = stringResource(R.string.placeholder_select_database),
                    onSelect = { onTimeEntriesDbChange(it?.id ?: "") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.hint_database_integration),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Schema-based fields (visible once timeEntriesDbId is set)
            if (state.timeEntriesDbId.isNotBlank()) {
                Spacer(Modifier.height(16.dp))

                when {
                    state.schemaLoading -> {
                        Text(stringResource(R.string.loading_properties), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    state.schemaError != null -> Text(state.schemaError, color = MaterialTheme.colorScheme.error)
                    else -> SchemaFields(
                        schema = state.schema,
                        dateProp = state.timeEntryDateProp,
                        statusProp = state.timeEntryStatusProp,
                        statusRunning = state.timeEntryStatusRunning,
                        statusDone = state.timeEntryStatusDone,
                        onDatePropChange = onDatePropChange,
                        onStatusPropChange = onStatusPropChange,
                        onStatusRunningChange = onStatusRunningChange,
                        onStatusDoneChange = onStatusDoneChange
                    )
                }
            }

            // Extra fields
            Spacer(Modifier.height(16.dp))
            Text(stringResource(R.string.section_extra_fields), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.hint_extra_fields),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))

            val editableProps = state.schema.entries
                .filter { (_, v) -> v.type in WRITABLE_EXTRA_TYPES && v.type !in READ_ONLY_TYPES }
                .map { NamedOption(it.key, it.key) }

            state.extraProps.forEachIndexed { index, prop ->
                ExtraPropRow(
                    index = index,
                    prop = prop,
                    availableProps = editableProps,
                    schema = state.schema,
                    relationPages = state.extraPropRelationPages[index] ?: emptyList(),
                    relationLoading = index in state.extraPropRelationLoading,
                    onNameChange = { onExtraPropNameChange(index, it) },
                    onRequiredChange = { onExtraPropRequiredChange(index, it) },
                    onDefaultChange = { onExtraPropDefaultChange(index, it) },
                    onRemove = { onRemoveExtraProp(index) }
                )
                Spacer(Modifier.height(8.dp))
            }

            if (state.extraProps.size < 5) {
                TextButton(onClick = onAddExtraProp) {
                    Text(stringResource(R.string.btn_add_extra_field))
                }
            }

            // Presets
            Spacer(Modifier.height(16.dp))
            Text(stringResource(R.string.section_presets), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.hint_presets),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))

            val relationOptionsByName = state.extraProps
                .mapIndexedNotNull { idx, ep ->
                    val opts = state.extraPropRelationPages[idx]
                    if (ep.propName.isNotBlank() && opts != null) ep.propName to opts else null
                }
                .toMap()

            state.presets.forEachIndexed { index, preset ->
                PresetRow(
                    preset = preset,
                    workspaceName = state.name,
                    extraProps = state.extraProps.filter { it.propName.isNotBlank() },
                    schema = state.schema,
                    relationOptions = relationOptionsByName,
                    onUpdate = { onUpdatePreset(index, it) },
                    onRemove = { onRemovePreset(index) }
                )
                Spacer(Modifier.height(8.dp))
            }

            if (state.presets.size < 5) {
                TextButton(onClick = onAddPreset) {
                    Text(stringResource(R.string.btn_add_preset))
                }
            }

            // Rounding
            Spacer(Modifier.height(16.dp))
            Text(stringResource(R.string.label_workspace_rounding), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.workspace_rounding_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            RoundingSelector(selected = state.roundingMinutes, onSelect = onRoundingChange)

            if (!isValid) {
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.save_incomplete_hint),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SchemaFields(
    schema: Map<String, SchemaProperty>,
    dateProp: String,
    statusProp: String,
    statusRunning: String,
    statusDone: String,
    onDatePropChange: (String) -> Unit,
    onStatusPropChange: (String) -> Unit,
    onStatusRunningChange: (String) -> Unit,
    onStatusDoneChange: (String) -> Unit
) {
    val dateProps = schema.entries.filter { it.value.type == "date" }.map { NamedOption(it.key, it.key) }
    val statusProps = schema.entries.filter { it.value.type == "status" }.map { NamedOption(it.key, it.key) }
    val statusOptions = schema[statusProp]?.statusOptions ?: emptyList()

    SectionLabel(stringResource(R.string.label_time_entry_date_prop))
    SearchableDropdown(
        options = dateProps,
        selected = dateProps.firstOrNull { it.id == dateProp },
        placeholder = stringResource(R.string.placeholder_select),
        onSelect = { onDatePropChange(it?.id ?: "") },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.height(12.dp))

    SectionLabel(stringResource(R.string.label_time_entry_status_prop))
    SearchableDropdown(
        options = statusProps,
        selected = statusProps.firstOrNull { it.id == statusProp },
        placeholder = stringResource(R.string.placeholder_select),
        onSelect = { onStatusPropChange(it?.id ?: "") },
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.height(12.dp))

    if (statusProp.isNotBlank() && statusOptions.isNotEmpty()) {
        val optionItems = statusOptions.map { NamedOption(it.name, it.name) }

        SectionLabel(stringResource(R.string.label_time_entry_status_running))
        SearchableDropdown(
            options = optionItems,
            selected = optionItems.firstOrNull { it.id == statusRunning },
            placeholder = stringResource(R.string.placeholder_select),
            onSelect = { onStatusRunningChange(it?.id ?: "") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        SectionLabel(stringResource(R.string.label_time_entry_status_done))
        SearchableDropdown(
            options = optionItems,
            selected = optionItems.firstOrNull { it.id == statusDone },
            placeholder = stringResource(R.string.placeholder_select),
            onSelect = { onStatusDoneChange(it?.id ?: "") },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun ExtraPropRow(
    index: Int,
    prop: ExtraProp,
    availableProps: List<NamedOption>,
    schema: Map<String, SchemaProperty>,
    relationPages: List<NamedOption>,
    relationLoading: Boolean,
    onNameChange: (String) -> Unit,
    onRequiredChange: (Boolean) -> Unit,
    onDefaultChange: (String?) -> Unit,
    onRemove: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SearchableDropdown(
                    options = availableProps,
                    selected = availableProps.firstOrNull { it.id == prop.propName },
                    placeholder = stringResource(R.string.placeholder_select_field),
                    onSelect = { onNameChange(it?.id ?: "") },
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(8.dp))
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.title_remove_extra_field))
                }
            }

            if (prop.propName.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = prop.required, onCheckedChange = onRequiredChange)
                    Text(stringResource(R.string.label_required_field), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}


@Composable
private fun PresetRow(
    preset: Preset,
    workspaceName: String,
    extraProps: List<ExtraProp>,
    schema: Map<String, SchemaProperty>,
    relationOptions: Map<String, List<NamedOption>>,
    onUpdate: (Preset) -> Unit,
    onRemove: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "$workspaceName — ",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.widthIn(max = 100.dp)
                )
                OutlinedTextField(
                    value = preset.name,
                    onValueChange = { onUpdate(preset.copy(name = it)) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.preset_name_placeholder), style = MaterialTheme.typography.bodySmall) },
                    textStyle = MaterialTheme.typography.bodySmall
                )
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.title_remove_preset))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.label_preset_title), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = preset.pageTitle,
                onValueChange = { onUpdate(preset.copy(pageTitle = it)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(stringResource(R.string.preset_title_placeholder), style = MaterialTheme.typography.bodySmall) },
                textStyle = MaterialTheme.typography.bodySmall
            )
            extraProps.forEach { ep ->
                val type = ep.type.ifBlank { "rich_text" }
                if (type == "files") return@forEach
                Spacer(Modifier.height(4.dp))
                val schemaProp = schema[ep.propName]
                val options = when (type) {
                    "select", "multi_select" -> schemaProp?.selectOptions?.map { NamedOption(it.name, it.name) } ?: emptyList()
                    "status" -> schemaProp?.statusOptions?.map { NamedOption(it.name, it.name) } ?: emptyList()
                    "relation" -> relationOptions[ep.propName] ?: emptyList()
                    else -> emptyList()
                }
                val fieldDef = ExtraFieldDef(
                    propName = ep.propName,
                    type = type,
                    required = ep.required,
                    defaultValue = ep.defaultValue,
                    options = options,
                    statusOptions = schemaProp?.statusOptions ?: emptyList()
                )
                ExtraFieldInput(
                    fieldDef = fieldDef,
                    value = preset.extraValues[ep.propName] ?: "",
                    onValueChange = { onUpdate(preset.copy(extraValues = preset.extraValues + (ep.propName to it))) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun RoundingSelector(selected: Int, onSelect: (Int) -> Unit) {
    val options = listOf(
        0 to R.string.rounding_off,
        5 to R.string.rounding_5,
        10 to R.string.rounding_10,
        15 to R.string.rounding_15
    )
    Column {
        options.forEach { (minutes, labelRes) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                RadioButton(selected = selected == minutes, onClick = { onSelect(minutes) })
                Spacer(Modifier.width(8.dp))
                Text(stringResource(labelRes), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(bottom = 4.dp)
    )
}
