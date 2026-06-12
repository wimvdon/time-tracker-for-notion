package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.ExtraFieldDef
import com.impca201.notiontimetracker.data.models.NamedOption
import com.impca201.notiontimetracker.viewmodel.TimerViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTimerModal(
    uiState: TimerViewModel.UiState,
    onDismiss: () -> Unit,
    onSave: (projectId: String?, description: String, extraValues: Map<String, String>) -> Unit
) {
    val timer = uiState.activeTimer ?: return
    var description by remember(timer.notionPageId) { mutableStateOf(timer.description) }
    var selectedProjectId by remember(timer.notionPageId) { mutableStateOf(timer.projectId) }
    var extraValues by remember(timer.notionPageId) { mutableStateOf(uiState.extraValues) }

    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_edit_timer)) },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = stringResource(R.string.btn_cancel))
                    }
                },
                actions = {
                    TextButton(onClick = { onSave(selectedProjectId, description, extraValues) }) {
                        Text(stringResource(R.string.btn_save_changes))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Spacer(Modifier.height(8.dp))

            if (uiState.projects.isNotEmpty()) {
                Text(
                    stringResource(R.string.label_project),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                SearchableDropdown(
                    options = uiState.projects,
                    selected = uiState.projects.firstOrNull { it.id == selectedProjectId },
                    placeholder = stringResource(R.string.placeholder_select_project),
                    onSelect = { selectedProjectId = it?.id },
                    allowClear = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Text(
                stringResource(R.string.label_description),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(stringResource(R.string.placeholder_description)) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
            )

            uiState.extraFieldDefs.forEach { def ->
                ExtraFieldInput(
                    fieldDef = def,
                    value = extraValues[def.propName] ?: "",
                    onValueChange = { extraValues = extraValues + (def.propName to it) },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}
