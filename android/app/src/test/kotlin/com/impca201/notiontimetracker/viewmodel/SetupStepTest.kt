package com.impca201.notiontimetracker.viewmodel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SetupStepTest {
    @Test
    fun `without an API key the first step is connecting to Notion`() {
        assertEquals(SetupStep.ApiKey, SetupStep.of(settingsLoaded = true, apiKey = "", workspaceCount = 0))
        assertEquals(SetupStep.ApiKey, SetupStep.of(settingsLoaded = true, apiKey = "  ", workspaceCount = 2))
    }

    @Test
    fun `with a key but no workspace the step is adding a workspace`() {
        assertEquals(SetupStep.Workspace, SetupStep.of(settingsLoaded = true, apiKey = "secret_abc", workspaceCount = 0))
    }

    @Test
    fun `with a key and a workspace nothing is left to set up`() {
        assertNull(SetupStep.of(settingsLoaded = true, apiKey = "secret_abc", workspaceCount = 1))
    }

    @Test
    fun `nothing is shown while the settings are still loading`() {
        assertNull(SetupStep.of(settingsLoaded = false, apiKey = "", workspaceCount = 0))
    }
}
