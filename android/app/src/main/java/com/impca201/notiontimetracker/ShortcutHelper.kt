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
        try {
            val max = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context).coerceAtMost(4)
            val shortcuts = workspaces
                .flatMap { ws -> ws.presets.filter { it.showInShortcuts }.map { ws to it } }
                .take(max)
                .map { (ws, preset) ->
                    val intent = Intent(context, MainActivity::class.java).apply {
                        action = Intent.ACTION_VIEW
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                        putExtra(EXTRA_WORKSPACE_ID, ws.id)
                        putExtra(EXTRA_PRESET_ID, preset.id)
                    }
                    val label = if (preset.name.isBlank()) ws.name else "${ws.name} – ${preset.name}"
                    val builder = ShortcutInfoCompat.Builder(context, "preset_${ws.id}_${preset.id}")
                        .setShortLabel(label.take(25))
                        .setLongLabel(label.take(50))
                        .setIntent(intent)
                    
                    runCatching {
                        builder.setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                    }
                    builder.build()
                }
            ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
        } catch (e: Exception) {
            android.util.Log.e("ShortcutHelper", "Failed to update dynamic launcher shortcuts", e)
        }
    }
}
