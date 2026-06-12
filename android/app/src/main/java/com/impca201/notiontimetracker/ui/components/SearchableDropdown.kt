package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowDropUp
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import com.impca201.notiontimetracker.data.models.NamedOption

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

    val filtered = if (query.isBlank()) options
    else options.filter { it.name.contains(query, ignoreCase = true) }

    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)

    Column(modifier = modifier) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(colors.surfaceVariant)
                .border(1.dp, if (expanded) colors.primary else colors.outline, shape)
                .clickable(enabled = enabled && !loading) { expanded = !expanded; if (expanded) query = "" }
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = when {
                        loading -> "Loading…"
                        selected != null -> selected.name
                        else -> placeholder
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (selected != null) colors.onSurface else colors.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                if (allowClear && selected != null && !loading) {
                    Icon(
                        Icons.Default.Clear, contentDescription = "Clear",
                        tint = colors.onSurfaceVariant,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { onSelect(null) }
                    )
                    Spacer(Modifier.width(4.dp))
                }
                Icon(
                    if (expanded) Icons.Default.ArrowDropUp else Icons.Default.ArrowDropDown,
                    contentDescription = null,
                    tint = colors.onSurfaceVariant
                )
            }
        }

        if (expanded) {
            val focusRequester = remember { FocusRequester() }
            Popup(onDismissRequest = { expanded = false; query = "" }) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 400.dp),
                    shape = shape,
                    colors = CardDefaults.cardColors(containerColor = colors.surfaceVariant),
                    elevation = CardDefaults.cardElevation(8.dp)
                ) {
                    Column {
                        if (searchable) {
                            BasicTextField(
                                value = query,
                                onValueChange = { query = it },
                                textStyle = TextStyle(color = colors.onSurface, fontSize = 14.sp),
                                cursorBrush = SolidColor(colors.primary),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                                    .focusRequester(focusRequester),
                                decorationBox = { inner ->
                                    if (query.isEmpty()) Text("Search…", color = colors.onSurfaceVariant, fontSize = 14.sp)
                                    inner()
                                }
                            )
                            LaunchedEffect(Unit) { focusRequester.requestFocus() }
                            HorizontalDivider(color = colors.outline)
                        }

                        if (allowClear && selected != null) {
                            DropdownOption("— None —", false, colors) {
                                onSelect(null); expanded = false; query = ""
                            }
                            HorizontalDivider(color = colors.outline)
                        }

                        if (filtered.isEmpty()) {
                            Text(
                                "No results",
                                color = colors.onSurfaceVariant,
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodySmall
                            )
                        } else {
                            LazyColumn(modifier = Modifier.heightIn(max = 240.dp)) {
                                items(filtered) { opt ->
                                    DropdownOption(opt.name, opt.id == selected?.id, colors) {
                                        onSelect(opt); expanded = false; query = ""
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DropdownOption(
    text: String,
    isSelected: Boolean,
    colors: ColorScheme,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(if (isSelected) colors.secondaryContainer else colors.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isSelected) colors.onSecondaryContainer else colors.onSurface
        )
    }
}
