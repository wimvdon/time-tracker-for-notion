const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTokenStore } = require('./notionTokens.cjs');

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
const SESSION = { accessToken: 'ntn_a', refreshToken: 'nrt_r', workspaceName: 'Team', workspaceId: 'w1' };

test('saves the sign-in encrypted, never in plain text', () => {
  const store = fakeStore();
  const tokens = createTokenStore(store, fakeSafeStorage(), quiet);
  tokens.set(SESSION);
  assert.equal(store.data.notionAuth, undefined);
  assert.ok(store.data.notionAuthEncrypted);
  assert.ok(!store.data.notionAuthEncrypted.includes('ntn_a'));
  assert.deepEqual(tokens.get(), SESSION);
});

test('keeps working in plain text when encryption is unavailable', () => {
  const store = fakeStore();
  const tokens = createTokenStore(store, fakeSafeStorage({ available: false }), quiet);
  tokens.set(SESSION);
  assert.deepEqual(store.data.notionAuth, SESSION);
  assert.equal(store.data.notionAuthEncrypted, undefined);
  assert.deepEqual(tokens.get(), SESSION);
});

test('signing out removes both fields', () => {
  const store = fakeStore({ notionAuth: SESSION, notionAuthEncrypted: 'x' });
  const tokens = createTokenStore(store, fakeSafeStorage(), quiet);
  tokens.set(null);
  assert.deepEqual(store.data, {});
  assert.equal(tokens.get(), null);
});

test('a sign-in that cannot be decrypted reads as signed out instead of crashing', () => {
  const store = fakeStore({ notionAuthEncrypted: Buffer.from('garbage').toString('base64') });
  const tokens = createTokenStore(store, fakeSafeStorage(), quiet);
  assert.equal(tokens.get(), null);
});

test('an API key from an older version is deleted, not used', () => {
  const store = fakeStore({ apiKey: 'secret_old', apiKeyEncrypted: 'enc', theme: 'dark' });
  const tokens = createTokenStore(store, fakeSafeStorage(), quiet);
  assert.equal(tokens.get(), null);
  tokens.removeLegacyApiKey();
  assert.deepEqual(store.data, { theme: 'dark' });
});

test('the renderer never sees a token or a key', () => {
  const store = fakeStore();
  const tokens = createTokenStore(store, fakeSafeStorage({ available: false }), quiet);
  tokens.set(SESSION);
  const view = tokens.forRenderer({ ...store.data, apiKey: 'old', apiKeyEncrypted: 'old', theme: 'dark' });
  assert.deepEqual(view, { theme: 'dark' });
});
