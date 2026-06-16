package com.impca201.notiontimetracker.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.impca201.notiontimetracker.MainActivity
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.ShortcutHelper
import com.impca201.notiontimetracker.data.models.ActiveTimer
import com.impca201.notiontimetracker.data.models.Workspace
import com.impca201.notiontimetracker.data.repository.SettingsRepository
import com.impca201.notiontimetracker.service.TimerForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object WidgetHelper {
    private val helperScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun updateAllWidgets(context: Context) {
        helperScope.launch {
            val repository = SettingsRepository(context)
            val activeTimer = repository.activeTimerFlow.first()
            val workspaces = repository.workspacesFlow.first()

            val appWidgetManager = AppWidgetManager.getInstance(context)

            // Update Small Widgets
            val smallComponentName = ComponentName(context, SmallWidgetProvider::class.java)
            val smallIds = appWidgetManager.getAppWidgetIds(smallComponentName)
            for (id in smallIds) {
                val views = RemoteViews(context.packageName, R.layout.widget_small)
                populateViews(context, views, activeTimer, workspaces, isLarge = false)
                appWidgetManager.updateAppWidget(id, views)
            }

            // Update Large Widgets
            val largeComponentName = ComponentName(context, LargeWidgetProvider::class.java)
            val largeIds = appWidgetManager.getAppWidgetIds(largeComponentName)
            for (id in largeIds) {
                val views = RemoteViews(context.packageName, R.layout.widget_large)
                populateViews(context, views, activeTimer, workspaces, isLarge = true)
                appWidgetManager.updateAppWidget(id, views)
            }
        }
    }

    private fun populateViews(
        context: Context,
        views: RemoteViews,
        activeTimer: ActiveTimer?,
        workspaces: List<Workspace>,
        isLarge: Boolean
    ) {
        // App open PendingIntent on header/background click
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            context,
            100,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_idle_container, openPendingIntent)

        if (activeTimer != null) {
            views.setViewVisibility(R.id.widget_idle_container, View.GONE)
            views.setViewVisibility(R.id.widget_active_container, View.VISIBLE)

            views.setTextViewText(R.id.widget_description, activeTimer.description.ifBlank { "Untitled" })

            val workspace = workspaces.find { it.id == activeTimer.workspaceId }
            val wsName = workspace?.name ?: activeTimer.projectName.ifBlank { "Notion" }
            views.setTextViewText(R.id.widget_workspace, wsName)

            // Set color if present
            val colorStr = workspace?.color ?: ""
            if (colorStr.isNotBlank()) {
                runCatching {
                    val colorInt = Color.parseColor(colorStr)
                    views.setTextColor(R.id.widget_workspace, colorInt)
                }
            } else {
                views.setTextColor(R.id.widget_workspace, context.getColor(R.color.widget_accent))
            }

            // Parse chronometer
            val startMs = parseIso(activeTimer.rawStart)
            if (startMs > 0) {
                val bootRelativeTime = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - startMs)
                views.setChronometer(R.id.widget_chronometer, bootRelativeTime, null, true)
            }

            // Click open on header details too
            views.setOnClickPendingIntent(R.id.widget_description, openPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_workspace, openPendingIntent)

            // Stop button PendingIntent
            val stopIntent = Intent(context, TimerForegroundService::class.java).apply {
                action = TimerForegroundService.ACTION_STOP
            }
            val stopPendingIntent = PendingIntent.getService(
                context,
                101,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_stop_button, stopPendingIntent)
        } else {
            views.setViewVisibility(R.id.widget_idle_container, View.VISIBLE)
            views.setViewVisibility(R.id.widget_active_container, View.GONE)
        }

        // Handle Presets in Large Widget
        if (isLarge) {
            val allPresets = workspaces.flatMap { ws -> ws.presets.map { ws to it } }.take(4)
            val presetBtns = listOf(
                R.id.preset_btn_1,
                R.id.preset_btn_2,
                R.id.preset_btn_3,
                R.id.preset_btn_4
            )

            if (allPresets.isNotEmpty()) {
                views.setViewVisibility(R.id.widget_no_presets_text, View.GONE)
                allPresets.forEachIndexed { idx, (ws, preset) ->
                    val btnId = presetBtns[idx]
                    views.setViewVisibility(btnId, View.VISIBLE)
                    val label = if (preset.name.isBlank() || preset.name == ws.name) ws.name else "${ws.name} – ${preset.name}"
                    views.setTextViewText(btnId, label)

                    // Set border/background color if possible, or keep default
                    val wsColor = ws.color.takeIf { it.isNotBlank() }
                    if (wsColor != null) {
                        runCatching {
                            val colorInt = Color.parseColor(wsColor)
                            views.setTextColor(btnId, colorInt)
                        }
                    } else {
                        views.setTextColor(btnId, context.getColor(R.color.widget_text_primary))
                    }

                    // Intent to start preset
                    val presetIntent = Intent(context, MainActivity::class.java).apply {
                        action = Intent.ACTION_MAIN
                        addCategory(Intent.CATEGORY_LAUNCHER)
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        putExtra(ShortcutHelper.EXTRA_WORKSPACE_ID, ws.id)
                        putExtra(ShortcutHelper.EXTRA_PRESET_ID, preset.id)
                    }
                    val presetPendingIntent = PendingIntent.getActivity(
                        context,
                        200 + idx,
                        presetIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(btnId, presetPendingIntent)
                }

                // Hide remaining buttons
                for (i in allPresets.size until 4) {
                    views.setViewVisibility(presetBtns[i], View.GONE)
                }
            } else {
                views.setViewVisibility(R.id.widget_no_presets_text, View.VISIBLE)
                for (btnId in presetBtns) {
                    views.setViewVisibility(btnId, View.GONE)
                }
            }
        }
    }

    private fun parseIso(iso: String): Long {
        if (iso.isBlank()) return 0L
        return runCatching {
            val cleanIso = iso.substringBefore(".").substringBefore("Z") // remove fractional seconds and Z
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            format.parse(cleanIso)?.time ?: 0L
        }.getOrDefault(0L)
    }
}
