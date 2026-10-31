/**
 * What still has to be set up before the timer can be used: 'signIn' (not signed in to Notion
 * yet), 'workspace' (signed in but no workspace) or null (ready, or the settings are still
 * loading). The timer view shows a full-screen "setup needed" state for it instead of the timer.
 * Same rule as the Android app (`viewmodel/SetupStep.kt`).
 */
export function setupStep(settingsLoaded, signedIn, workspaceCount) {
  if (!settingsLoaded) return null;
  if (!signedIn) return 'signIn';
  if (workspaceCount === 0) return 'workspace';
  return null;
}
