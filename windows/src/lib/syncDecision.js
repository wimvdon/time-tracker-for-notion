/**
 * What a settings sync should do, given this device's state and the copy on the sync server
 * (null when there is none yet). Same rule as the Android app (`data/repository/SyncDecision.kt`).
 *
 *  - 'pull': the server has newer settings; take them.
 *  - 'push': this device has edits the server doesn't have yet, or the server is empty and this
 *            device has something to share.
 *  - 'none': nothing to do. A brand-new install with no settings never pushes, so it can't wipe
 *            another device's settings with an empty list.
 *
 * @param {{ settingsUpdatedAt: string|null, lastSyncedUpdatedAt: string|null, hasSettings: boolean }} local
 * @param {{ updatedAt: string }|null} remote
 */
export function syncDecision(local, remote) {
  const localAt = local.settingsUpdatedAt || '';
  if (remote && remote.updatedAt > localAt) return 'pull';
  if (!remote) return localAt || local.hasSettings ? 'push' : 'none';
  if (localAt && localAt !== local.lastSyncedUpdatedAt) return 'push';
  return 'none';
}
