// Keeps the Notion sign-in (access token, refresh token and the workspace name) encrypted on
// disk with Electron's safeStorage, which on Windows uses DPAPI: only this Windows user on this
// PC can decrypt it. (electron-store's encryptionKey on the whole file is only obfuscation: the
// key is in the source code.)
//
// The sign-in is stored as JSON in `notionAuthEncrypted` (base64). If encryption is unavailable,
// it falls back to the plain `notionAuth` field so the app keeps working. API keys from versions
// before "Sign in with Notion" (`apiKey`, `apiKeyEncrypted`) are deleted on start-up: the user
// signs in once instead. Electron-free, so it's unit tested (notionTokens.test.cjs) with a fake
// store and fake safeStorage.

const ENCRYPTED_FIELD = 'notionAuthEncrypted';
const PLAIN_FIELD = 'notionAuth';
const LEGACY_FIELDS = ['apiKey', 'apiKeyEncrypted'];
/** Settings fields only this module may write (store:set refuses them from the renderer). */
const PROTECTED_FIELDS = [ENCRYPTED_FIELD, PLAIN_FIELD, ...LEGACY_FIELDS];

function isSession(value) {
  return !!value && typeof value === 'object' && typeof value.accessToken === 'string' && !!value.accessToken;
}

function createTokenStore(store, safeStorage, log = console) {
  const canEncrypt = () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  };

  /**
   * The saved sign-in { accessToken, refreshToken, workspaceName, workspaceId }, or null when
   * there is none or it can no longer be decrypted.
   */
  function get() {
    const encrypted = store.get(ENCRYPTED_FIELD);
    if (encrypted) {
      try {
        const session = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
        return isSession(session) ? session : null;
      } catch (error) {
        // E.g. the settings file was copied from another PC or Windows user.
        log.warn('Could not read the saved Notion sign-in; the user has to sign in again.', error?.message);
        return null;
      }
    }
    const plain = store.get(PLAIN_FIELD);
    return isSession(plain) ? plain : null;
  }

  /** Saves a sign-in, or removes it when `session` is null. */
  function set(session) {
    if (!isSession(session)) {
      store.delete(ENCRYPTED_FIELD);
      store.delete(PLAIN_FIELD);
      return;
    }
    const value = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken || null,
      workspaceName: session.workspaceName || '',
      workspaceId: session.workspaceId || null,
    };
    if (canEncrypt()) {
      store.set(ENCRYPTED_FIELD, safeStorage.encryptString(JSON.stringify(value)).toString('base64'));
      store.delete(PLAIN_FIELD);
    } else {
      store.set(PLAIN_FIELD, value);
      store.delete(ENCRYPTED_FIELD);
    }
  }

  /** Deletes an API key saved by a version before "Sign in with Notion". */
  function removeLegacyApiKey() {
    for (const field of LEGACY_FIELDS) store.delete(field);
  }

  /** The settings as the renderer sees them: never a token or a stored key. */
  function forRenderer(all) {
    const view = { ...all };
    for (const field of PROTECTED_FIELDS) delete view[field];
    return view;
  }

  return { get, set, removeLegacyApiKey, forRenderer, PROTECTED_FIELDS };
}

module.exports = { createTokenStore, PROTECTED_FIELDS };
