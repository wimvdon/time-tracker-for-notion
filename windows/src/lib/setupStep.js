/**
 * What still has to be set up before the timer can be used: 'apiKey' (no Notion API key yet),
 * 'workspace' (a key but no workspace) or null (ready, or the settings are still loading).
 * The timer view shows a full-screen "setup needed" state for it instead of the timer.
 * Same rule as the Android app (`viewmodel/SetupStep.kt`).
 */
export function setupStep(settingsLoaded, apiKey, workspaceCount) {
  if (!settingsLoaded) return null;
  if (!apiKey || !apiKey.trim()) return 'apiKey';
  if (workspaceCount === 0) return 'workspace';
  return null;
}
