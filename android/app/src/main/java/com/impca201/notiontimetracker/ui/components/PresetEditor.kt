package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.NamedOption
import com.impca201.notiontimetracker.data.models.Workspace
import com.impca201.notiontimetracker.ui.theme.SkeletonBlock
import com.impca201.notiontimetracker.ui.theme.workspaceAccentColor
import com.impca201.notiontimetracker.viewmodel.TimerViewModel

/**
 * Creates or edits a preset, as a full-screen dialog like Edit timer: its workspace (new
 * presets only), name, the description it starts with and its extra field values. The
 * workspace's fields load from Notion when it opens and whenever another workspace is picked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PresetEditorScreen(
    editor: TimerViewModel.PresetEditor,
    workspaces: List<Workspace>,
    onWorkspaceChange: (String) -> Unit,
    onNameChange: (String) -> Unit,
    onPageTitleChange: (String) -> Unit,
    onExtraChange: (String, String) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
    errorText: @Composable (String) -> String
) {
    val workspace = workspaces.firstOrNull { it.id == editor.workspaceId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(stringResource(if (editor.presetId == null) R.string.title_new_preset else R.string.title_edit_preset))
                },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.btn_cancel))
                    }
                },
                actions = {
                    TextButton(onClick = onSave, enabled = editor.name.isNotBlank()) {
                        Text(stringResource(R.string.btn_save))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Spacer(Modifier.height(4.dp))

            if (editor.presetId == null) {
                val options = workspaces.map { NamedOption(it.id, it.name) }
                val anyColour = workspaces.any { workspaceAccentColor(it.color) != null }
                SearchableDropdown(
                    options = options,
                    selected = options.firstOrNull { it.id == editor.workspaceId },
                    placeholder = stringResource(R.string.placeholder_select_workspace),
                    onSelect = { it?.let { opt -> onWorkspaceChange(opt.id) } },
                    modifier = Modifier.fillMaxWidth(),
                    searchable = options.size > 4,
                    label = stringResource(R.string.label_workspace),
                    leadingIcon = workspaceAccentColor(workspace?.color)?.let { c -> { Dot(c) } },
                    optionLeadingIcon = if (anyColour) {
                        { opt -> Dot(workspaceAccentColor(workspaces.firstOrNull { it.id == opt.id }?.color) ?: Color.Transparent) }
                    } else null
                )
            } else {
                // An existing preset stays in its workspace: its field values belong to that
                // workspace's fields.
                Row(
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.padding(vertical = 4.dp)
                ) {
                    workspaceAccentColor(workspace?.color)?.let { Dot(it) }
                    Text(workspace?.name ?: "", style = MaterialTheme.typography.titleMedium)
                }
            }

            OutlinedTextField(
                value = editor.name,
                onValueChange = onNameChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(stringResource(R.string.label_preset_name) + " *") },
                placeholder = { Text(stringResource(R.string.placeholder_preset_name)) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )

            OutlinedTextField(
                value = editor.pageTitle,
                onValueChange = onPageTitleChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(stringResource(R.string.placeholder_description)) },
                placeholder = { Text(stringResource(R.string.label_description)) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
            )

            if (editor.fieldsLoading) {
                workspace?.extraProps.orEmpty().forEach { _ ->
                    SkeletonBlock(height = 56.dp, shape = MaterialTheme.shapes.extraSmall)
                }
            }

            editor.fieldDefs.forEach { def ->
                ExtraFieldInput(
                    fieldDef = def,
                    value = editor.extraValues[def.propName] ?: "",
                    onValueChange = { onExtraChange(def.propName, it) },
                    modifier = Modifier.fillMaxWidth(),
                    clearableWhenRequired = true
                )
            }

            // Required fields are marked but not enforced here: they only have to be filled
            // in before a timer stops.
            if (editor.fieldDefs.any { it.required }) {
                Text(
                    stringResource(R.string.hint_preset_required),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            editor.fieldsError?.let { err ->
                Text(
                    errorText(err),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun Dot(color: Color) {
    Box(
        Modifier
            .size(12.dp)
            .clip(CircleShape)
            .background(color)
    )
}
