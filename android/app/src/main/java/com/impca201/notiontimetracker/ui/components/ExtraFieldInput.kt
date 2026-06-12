package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.data.models.ExtraFieldDef
import com.impca201.notiontimetracker.data.models.NamedOption

@Composable
fun ExtraFieldInput(
    fieldDef: ExtraFieldDef,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = fieldDef.propName + if (fieldDef.required) " *" else "",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(4.dp))

        when (fieldDef.type) {
            "checkbox" -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(
                        checked = value == "true",
                        onCheckedChange = { onValueChange(if (it) "true" else "false") }
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(fieldDef.propName, style = MaterialTheme.typography.bodyMedium)
                }
            }

            "select", "status" -> {
                SearchableDropdown(
                    options = fieldDef.options,
                    selected = fieldDef.options.firstOrNull { it.id == value || it.name == value },
                    placeholder = "Select…",
                    onSelect = { onValueChange(it?.name ?: "") },
                    allowClear = !fieldDef.required,
                    searchable = fieldDef.options.size > 5,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            "multi_select" -> {
                MultiSelectChips(
                    options = fieldDef.options,
                    selected = value.split(",").map { it.trim() }.filter { it.isNotBlank() }.toSet(),
                    onSelectionChange = { onValueChange(it.joinToString(",")) }
                )
            }

            "people", "relation" -> {
                SearchableDropdown(
                    options = fieldDef.options,
                    selected = fieldDef.options.firstOrNull { it.id == value },
                    placeholder = "Select…",
                    onSelect = { onValueChange(it?.id ?: "") },
                    allowClear = !fieldDef.required,
                    searchable = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            "number" -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = { if (it.isEmpty() || it.matches(Regex("-?\\d*\\.?\\d*"))) onValueChange(it) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("0") }
                )
            }

            "date" -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("YYYY-MM-DD") }
                )
            }

            "url", "files" -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("https://…") }
                )
            }

            "email" -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("name@example.com") }
                )
            }

            "phone_number" -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text("+32…") }
                )
            }

            else -> {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        }
    }
}

@Composable
private fun MultiSelectChips(
    options: List<NamedOption>,
    selected: Set<String>,
    onSelectionChange: (Set<String>) -> Unit
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(options) { opt ->
            val isSelected = opt.name in selected
            FilterChip(
                selected = isSelected,
                onClick = {
                    val newSet = if (isSelected) selected - opt.name else selected + opt.name
                    onSelectionChange(newSet)
                },
                label = { Text(opt.name) }
            )
        }
    }
}
