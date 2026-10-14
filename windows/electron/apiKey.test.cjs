const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApiKeyStore } = require('./apiKey.cjs');

// Minimal stand-ins for electron-store and Electron's safeStorage.
function fakeStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value;
    },
    delete: (key) => {
      delete data[key];
    },
  };
}

function fakeSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (buffer) => {
      const text = buffer.toString();
      if (!text.startsWith('enc:')) throw new Error('bad data');
      return text.slice(4);
    },
  };
}

const quiet = { warn: () => {} };

test('saves the key encrypted, never in plain text', () => {
  const store = fakeStore();
  const keys = createApiKeyStore(store, fakeSafeStorage(), quiet);
  keys.set('secret_abc');
  assert.equal(store.data.apiKey, undefined);
  assert.ok(store.data.apiKeyEncrypted);
  assert.notEqual(store.data.apiKeyEncrypted, 'secret_abc');
  assert.equal(keys.get(), 'secret_abc');
});

test('moves a plain key from an older version into encrypted storage', () => {
  const store = fakeStore({ apiKey: 'secret_old' });
  const keys = createApiKeyStore(store, fakeSafeStorage(), quiet);
  keys.migrate();
  assert.equal(store.data.apiKey, undefined);
  assert.equal(keys.get(), 'secret_old');
});

test('keeps working in plain text when encryption is unavailable', () => {
  const store = fakeStore();
  const keys = createApiKeyStore(store, fakeSafeStorage({ available: false }), quiet);
  keys.set('secret_abc');
  assert.equal(store.data.apiKey, 'secret_abc');
  keys.migrate();
  assert.equal(store.data.apiKey, 'secret_abc');
  assert.equal(keys.get(), 'secret_abc');
});

test('clearing the key removes both fields', () => {
  const store = fakeStore({ apiKey: 'a', apiKeyEncrypted: 'b' });
  const keys = createApiKeyStore(store, fakeSafeStorage(), quiet);
  keys.set('');
  assert.deepEqual(store.data, {});
  assert.equal(keys.get(), '');
});

test('a key that cannot be decrypted reads as empty instead of crashing', () => {
  const store = fakeStore({ apiKeyEncrypted: Buffer.from('garbage').toString('base64') });
  const keys = createApiKeyStore(store, fakeSafeStorage(), quiet);
  assert.equal(keys.get(), '');
});

test('the renderer gets the plain key, never the encrypted field', () => {
  const store = fakeStore();
  const keys = createApiKeyStore(store, fakeSafeStorage(), quiet);
  keys.set('secret_abc');
  const view = keys.forRenderer({ ...store.data, theme: 'dark' });
  assert.deepEqual(view, { theme: 'dark', apiKey: 'secret_abc' });
});
