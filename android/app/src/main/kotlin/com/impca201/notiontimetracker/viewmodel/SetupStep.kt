package com.impca201.notiontimetracker.viewmodel

/**
 * What still has to be set up before the timer can be used. The timer screen shows a
 * full-screen "setup needed" state for it instead of the timer (DESIGN.md, "Empty and setup
 * states"), with a button to Settings.
 */
enum class SetupStep {
    /** No Notion API key yet: "Connect to Notion". */
    ApiKey,

    /** A key but no workspace: "Add a workspace". */
    Workspace,
    ;

    companion object {
        /** Null when the timer is ready to use, or while the settings are still loading. */
        fun of(settingsLoaded: Boolean, apiKey: String, workspaceCount: Int): SetupStep? =
            when {
                !settingsLoaded -> null
                apiKey.isBlank() -> ApiKey
                workspaceCount == 0 -> Workspace
                else -> null
            }
    }
}
