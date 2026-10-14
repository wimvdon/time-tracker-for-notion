// Keeps the Notion API key encrypted on disk with Electron's safeStorage, which on
// Windows uses DPAPI: only this Windows user on this PC can decrypt it. (electron-store's
// encryptionKey on the whole file is only obfuscation: the key is in the source code.)
//
// The key is stored as `apiKeyEncrypted` (base64). An older plain `apiKey` value is
// moved over on start-up. If encryption is unavailable, the key falls back to the old
// plain field so the app keeps working. Electron-free, so it's unit tested
// (apiKey.test.cjs) with a fake store and fake safeStorage.

const ENCRYPTED_FIELD = 'apiKeyEncrypted';
const PLAIN_FIELD = 'apiKey';

function createApiKeyStore(store, safeStorage, log = console) {
  const canEncrypt = () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  };

  /** The API key, or '' when none is saved or it can no longer be decrypted. */
  function get() {
    const encrypted = store.get(ENCRYPTED_FIELD);
    if (encrypted) {
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (error) {
        // E.g. the settings file was copied from another PC or Windows user.
        log.warn('Could not decrypt the saved API key; it has to be entered again.', error?.message);
        return '';
      }
    }
    return store.get(PLAIN_FIELD) || '';
  }

  function set(value) {
    const key = typeof value === 'string' ? value : '';
    if (!key) {
      store.delete(ENCRYPTED_FIELD);
      store.delete(PLAIN_FIELD);
    } else if (canEncrypt()) {
      store.set(ENCRYPTED_FIELD, safeStorage.encryptString(key).toString('base64'));
      store.delete(PLAIN_FIELD);
    } else {
      store.set(PLAIN_FIELD, key);
      store.delete(ENCRYPTED_FIELD);
    }
  }

  /** Moves a key saved by an older version into encrypted storage. Call once the app is ready. */
  function migrate() {
    const plain = store.get(PLAIN_FIELD);
    if (plain && canEncrypt()) set(plain);
  }

  /**
   * The settings as the renderer sees them: the API key in plain `apiKey`, never the
   * encrypted field.
   */
  function forRenderer(all) {
    const { [ENCRYPTED_FIELD]: _encrypted, ...rest } = all;
    return { ...rest, [PLAIN_FIELD]: get() };
  }

  return { get, set, migrate, forRenderer, ENCRYPTED_FIELD, PLAIN_FIELD };
}

module.exports = { createApiKeyStore };
