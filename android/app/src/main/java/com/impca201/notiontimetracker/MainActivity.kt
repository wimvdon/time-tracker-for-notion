package com.impca201.notiontimetracker

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.impca201.notiontimetracker.data.models.ThemeMode
import com.impca201.notiontimetracker.service.TimerForegroundService
import com.impca201.notiontimetracker.ui.screens.QrScannerScreen
import com.impca201.notiontimetracker.ui.screens.SettingsScreen
import com.impca201.notiontimetracker.ui.screens.TimerScreen
import com.impca201.notiontimetracker.ui.theme.NotionTimeTrackerTheme
import com.impca201.notiontimetracker.viewmodel.SettingsViewModel
import com.impca201.notiontimetracker.viewmodel.TimerViewModel

class MainActivity : ComponentActivity() {

    private lateinit var timerViewModel: TimerViewModel
    private lateinit var settingsViewModel: SettingsViewModel

    private val timerStoppedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == TimerForegroundService.ACTION_TIMER_STOPPED) {
                timerViewModel.handleTimerStoppedFromService()
            }
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* permission result handled silently */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        timerViewModel = ViewModelProvider(
            this,
            ViewModelProvider.AndroidViewModelFactory.getInstance(application)
        )[TimerViewModel::class.java]

        settingsViewModel = ViewModelProvider(
            this,
            ViewModelProvider.AndroidViewModelFactory.getInstance(application)
        )[SettingsViewModel::class.java]

        requestNotificationPermissionIfNeeded()

        setContent {
            val settingsUiState by settingsViewModel.uiState.collectAsState()
            NotionTimeTrackerTheme(themeMode = settingsUiState.themeMode) {
                AppNavigation(timerViewModel, settingsViewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(TimerForegroundService.ACTION_TIMER_STOPPED)
        registerReceiver(timerStoppedReceiver, filter, RECEIVER_NOT_EXPORTED)
        // Refresh settings in case user changed them while settings were open
        timerViewModel.refreshSettings()
    }

    override fun onPause() {
        super.onPause()
        runCatching { unregisterReceiver(timerStoppedReceiver) }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}

@Composable
private fun AppNavigation(
    timerViewModel: TimerViewModel,
    settingsViewModel: SettingsViewModel
) {
    val context = LocalContext.current
    val navController = rememberNavController()
    val timerState by timerViewModel.uiState.collectAsState()
    val settingsState by settingsViewModel.uiState.collectAsState()
    val editState by settingsViewModel.editState.collectAsState()

    // Keep settingsViewModel aware of timer running state
    LaunchedEffect(timerState.running) {
        settingsViewModel.setTimerRunning(timerState.running)
    }

    NavHost(navController = navController, startDestination = "timer") {
        composable("timer") {
            TimerScreen(
                uiState = timerState,
                onWorkspaceSelect = timerViewModel::selectWorkspace,
                onProjectSelect = timerViewModel::setSelectedProject,
                onDescriptionChange = timerViewModel::setDescription,
                onExtraValueChange = timerViewModel::setExtraValue,
                onStart = timerViewModel::startTimer,
                onStop = timerViewModel::stopTimer,
                onUpdateStartTime = timerViewModel::updateStartTime,
                onNavigateToSettings = { navController.navigate("settings") },
                onRecoveryStop = timerViewModel::stopRecoveredTimer,
                onRecoveryResume = timerViewModel::resumeRecoveredTimer,
                onRecoveryDiscard = timerViewModel::discardRecoveredTimer,
                onClearError = timerViewModel::clearError,
                onRetryStop = { timerViewModel.stopTimer() },
                onLoadRunningTimer = timerViewModel::loadRunningTimer,
                onStopOtherRunningTimer = timerViewModel::stopOtherRunningTimer,
                onSuspendActiveToNewTimer = timerViewModel::suspendActiveToNewTimer,
                onRefreshRunningTimers = { timerViewModel.loadRunningTimers() },
                onRefreshAll = timerViewModel::refreshAll,
                onOpenEditTimer = timerViewModel::openEditTimer,
                onCloseEditTimer = timerViewModel::closeEditTimer,
                onUpdateTimerDetails = timerViewModel::updateTimerDetails,
                onConfirmDelete = { pageId, title, isRunning -> timerViewModel.confirmDelete(pageId, title, isRunning) },
                onCancelDelete = timerViewModel::cancelDelete,
                onDeleteEntry = timerViewModel::deleteEntry,
                onOpenUrl = { url -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            )
        }

        composable("settings") {
            SettingsScreen(
                uiState = settingsState,
                editState = editState,
                isEditValid = editState?.let { settingsViewModel.isEditValid(it) } ?: false,
                onBack = {
                    timerViewModel.refreshSettings()
                    navController.popBackStack()
                },
                onApiKeyChange = settingsViewModel::setApiKey,
                onToggleApiKeyVisible = settingsViewModel::toggleApiKeyVisible,
                onTestAndSave = settingsViewModel::testAndSaveApiKey,
                onMoveUp = settingsViewModel::moveWorkspaceUp,
                onMoveDown = settingsViewModel::moveWorkspaceDown,
                onEditWorkspace = settingsViewModel::openEditWorkspace,
                onDeleteWorkspace = settingsViewModel::deleteWorkspace,
                onAddWorkspace = settingsViewModel::openAddWorkspace,
                onCloseEdit = settingsViewModel::closeWorkspaceEdit,
                onSaveWorkspace = settingsViewModel::saveWorkspace,
                onWorkspaceNameChange = settingsViewModel::setWorkspaceName,
                onTimeEntriesDbChange = settingsViewModel::setTimeEntriesDb,
                onRefreshDatabases = settingsViewModel::loadDatabases,
                onDatePropChange = settingsViewModel::setDateProp,
                onStatusPropChange = settingsViewModel::setStatusProp,
                onStatusRunningChange = settingsViewModel::setStatusRunning,
                onStatusDoneChange = settingsViewModel::setStatusDone,
                onRoundingChange = settingsViewModel::setRounding,
                onAddExtraProp = settingsViewModel::addExtraProp,
                onRemoveExtraProp = settingsViewModel::removeExtraProp,
                onExtraPropNameChange = settingsViewModel::setExtraPropName,
                onExtraPropRequiredChange = settingsViewModel::setExtraPropRequired,
                onExtraPropDefaultChange = settingsViewModel::setExtraPropDefault,
                onThemeModeChange = settingsViewModel::setThemeMode,
                onScanQr = { navController.navigate("qr_scan") },
                onSnackbarDismiss = settingsViewModel::clearSnackbar
            )
        }

        composable("qr_scan") {
            QrScannerScreen(
                onBack = { navController.popBackStack() },
                onImport = { apiKey, workspaces, theme ->
                    if (apiKey != null) settingsViewModel.importApiKey(apiKey)
                    if (workspaces != null) settingsViewModel.importWorkspaces(workspaces)
                    if (theme != null) settingsViewModel.setThemeMode(theme)
                    navController.popBackStack()
                }
            )
        }
    }
}
