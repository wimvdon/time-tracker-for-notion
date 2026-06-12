package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.data.models.NamedOption

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchableDropdown(
    options: List<NamedOption>,
    selected: NamedOption?,
    placeholder: String,
    onSelect: (NamedOption?) -> Unit,
    modifier: Modifier = Modifier,
    allowClear: Boolean = false,
    loading: Boolean = false,
    enabled: Boolean = true,
    searchable: Boolean = true
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }

    val filtered = remember(query, options) {
        if (query.isBlank()) options
        else options.filter { it.name.contains(query, ignoreCase = true) }
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { newExpanded ->
            if (enabled && !loading) {
                expanded = newExpanded
                if (!newExpanded) query = ""
            }
        },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = when {
                loading -> "Loading…"
                expanded && searchable -> query
                selected != null -> selected.name
                else -> ""
            },
            onValueChange = { if (expanded && searchable) query = it },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryEditable)
                .fillMaxWidth(),
            readOnly = !searchable || !expanded,
            enabled = enabled && !loading,
            placeholder = {
                Text(
                    text = when {
                        loading -> "Loading…"
                        expanded && searchable -> "Search…"
                        else -> placeholder
                    }
                )
            },
            trailingIcon = {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    if (allowClear && selected != null && !loading && !expanded) {
                        IconButton(
                            onClick = { onSelect(null) },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = "Clear",
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                }
            },
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
            singleLine = true
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false; query = "" }
        ) {
            if (allowClear && selected != null) {
                DropdownMenuItem(
                    text = {
                        Text(
                            "— None —",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    onClick = { onSelect(null); expanded = false; query = "" },
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
                HorizontalDivider()
            }

            if (filtered.isEmpty()) {
                DropdownMenuItem(
                    text = {
                        Text(
                            "No results",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    onClick = {},
                    enabled = false,
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
            } else {
                filtered.forEach { opt ->
                    DropdownMenuItem(
                        text = { Text(opt.name) },
                        onClick = { onSelect(opt); expanded = false; query = "" },
                        contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                        colors = MenuDefaults.itemColors(
                            textColor = if (opt.id == selected?.id)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface
                        )
                    )
                }
            }
        }
    }
}
