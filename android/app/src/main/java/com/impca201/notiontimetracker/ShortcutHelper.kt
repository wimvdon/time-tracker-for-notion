package com.impca201.notiontimetracker

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.impca201.notiontimetracker.data.models.Workspace

object ShortcutHelper {
    const val EXTRA_WORKSPACE_ID = "preset_workspace_id"
    const val EXTRA_PRESET_ID = "preset_id"

    fun updateShortcuts(context: Context, workspaces: List<Workspace>) {
        val max = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context).coerceAtMost(4)
        val shortcuts = workspaces
            .flatMap { ws -> ws.presets.map { ws to it } }
            .take(max)
            .map { (ws, preset) ->
                val intent = Intent(context, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    putExtra(EXTRA_WORKSPACE_ID, ws.id)
                    putExtra(EXTRA_PRESET_ID, preset.id)
                }
                val label = if (preset.name.isBlank()) ws.name else "${ws.name} — ${preset.name}"
                ShortcutInfoCompat.Builder(context, "preset_${ws.id}_${preset.id}")
                    .setShortLabel(label.take(25))
                    .setLongLabel(label.take(50))
                    .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                    .setIntent(intent)
                    .build()
            }
        ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
    }
}
