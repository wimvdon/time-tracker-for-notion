package com.impca201.notiontimetracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.ActiveTimer

@Composable
fun RecoveryDialog(
    timer: ActiveTimer,
    busy: Boolean,
    onStop: () -> Unit,
    onResume: () -> Unit,
    onDiscard: () -> Unit
) {
    AlertDialog(
        onDismissRequest = {},
        title = { Text(stringResource(R.string.recovery_title)) },
        text = {
            Column {
                Text(stringResource(R.string.recovery_body))
                if (timer.projectName.isNotBlank() || timer.description.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = listOf(timer.projectName, timer.description)
                            .filter { it.isNotBlank() }
                            .joinToString(" — "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDiscard, enabled = !busy) {
                    Text(stringResource(R.string.recovery_discard))
                }
                OutlinedButton(onClick = onStop, enabled = !busy) {
                    if (busy) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.recovery_stop))
                    }
                }
                Button(onClick = onResume, enabled = !busy) {
                    Text(stringResource(R.string.recovery_resume))
                }
            }
        }
    )
}
