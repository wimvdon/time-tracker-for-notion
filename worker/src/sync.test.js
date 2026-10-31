import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './index.js';
import { SettingsStore, clearIdentityCache, isValidPayload, MAX_PAYLOAD_BYTES } from './sync.js';

const ORIGIN = 'https://timetracker-signin.example';

/** A Durable Object namespace with one Map per name, like Cloudflare keeps one object per user. */
function fakeNamespace() {
  const stores = new Map();
  return {
    stores,
    idFromName: (name) => name,
    get(id) {
      if (!stores.has(id)) stores.set(id, new SettingsStore({ storage: memoryStorage() }));
      const store = stores.get(id);
      return { fetch: (url, init) => store.fetch(new Request(url, init)) };
    },
  };
}

function memoryStorage() {
  const data = new Map();
  return {
    data,
    get: async (key) => (data.has(key) ? structuredClone(data.get(key)) : undefined),
    put: async (key, value) => void data.set(key, structuredClone(value)),
    delete: async (key) => data.delete(key),
  };
}

/** Notion's /users/me: each token belongs to a user in a workspace, or is refused. */
function fakeNotion(users) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const token = init.headers.Authorization.replace('Bearer ', '');
    calls.push(token);
    const user = users[token];
    if (!user) return new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 });
    return new Response(JSON.stringify({ object: 'user', type: 'bot', bot: user }));
  };
  return { calls, fetchImpl };
}

const alice = { owner: { type: 'user', user: { id: 'alice' } }, workspace_id: 'ws-1', workspace_name: 'Team' };
const bob = { owner: { type: 'user', user: { id: 'bob' } }, workspace_id: 'ws-1', workspace_name: 'Team' };
const internal = { owner: { type: 'workspace', workspace: true }, workspace_id: 'ws-1' };

const payload = (updatedAt, name = 'Work') => ({ updatedAt, workspaces: [{ id: 'w', name }], theme: 'dark' });

function request(method, token, body) {
  return new Request(`${ORIGIN}/settings`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

let env;
let notion;
beforeEach(() => {
  clearIdentityCache();
  env = { SETTINGS: fakeNamespace() };
  notion = fakeNotion({ 'tok-alice': alice, 'tok-alice-phone': alice, 'tok-bob': bob, 'tok-internal': internal });
});

const call = (method, token, body) => handleRequest(request(method, token, body), env, notion.fetchImpl);

test('nothing stored yet reads as null', async () => {
  const response = await call('GET', 'tok-alice');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { payload: null });
});

test('a device stores settings and another device of the same user reads them', async () => {
  const put = await call('PUT', 'tok-alice', { payload: payload('2026-10-31T10:00:00.000Z') });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).accepted, true);
  const got = await (await call('GET', 'tok-alice-phone')).json();
  assert.deepEqual(got.payload, payload('2026-10-31T10:00:00.000Z'));
});

test('users never see each other\'s settings, and the key is workspace plus user', async () => {
  await call('PUT', 'tok-alice', { payload: payload('2026-10-31T10:00:00.000Z') });
  assert.deepEqual(await (await call('GET', 'tok-bob')).json(), { payload: null });
  assert.deepEqual([...env.SETTINGS.stores.keys()].sort(), ['ws-1:alice', 'ws-1:bob']);
});

test('an older or equally old copy is refused and the stored one is returned', async () => {
  await call('PUT', 'tok-alice', { payload: payload('2026-10-31T10:00:00.000Z', 'Newer') });
  for (const updatedAt of ['2026-10-31T09:00:00.000Z', '2026-10-31T10:00:00.000Z']) {
    const response = await call('PUT', 'tok-alice-phone', { payload: payload(updatedAt, 'Older') });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.accepted, false);
    assert.equal(body.payload.workspaces[0].name, 'Newer');
  }
});

test('delete removes the stored copy', async () => {
  await call('PUT', 'tok-alice', { payload: payload('2026-10-31T10:00:00.000Z') });
  assert.equal((await call('DELETE', 'tok-alice')).status, 200);
  assert.deepEqual(await (await call('GET', 'tok-alice')).json(), { payload: null });
});

test('an expired or missing token gets 401, an API key (not a user) gets 403', async () => {
  assert.equal((await call('GET', 'tok-expired')).status, 401);
  assert.equal((await call('GET', null)).status, 401);
  assert.equal((await call('GET', 'tok-internal')).status, 403);
  assert.equal(env.SETTINGS.stores.size, 0);
});

test('bad payloads and oversized bodies are refused before anything is stored', async () => {
  for (const body of [{ payload: { workspaces: [] } }, { payload: { updatedAt: 'yesterday', workspaces: [] } }, { payload: [] }, 'not json']) {
    assert.equal((await call('PUT', 'tok-alice', body)).status, 400);
  }
  const huge = { payload: { ...payload('2026-10-31T10:00:00.000Z'), padding: 'x'.repeat(MAX_PAYLOAD_BYTES) } };
  assert.equal((await call('PUT', 'tok-alice', huge)).status, 413);
  assert.deepEqual(await (await call('GET', 'tok-alice')).json(), { payload: null });
});

test('Notion is asked who a token belongs to once, not on every sync', async () => {
  await call('GET', 'tok-alice');
  await call('GET', 'tok-alice');
  await call('PUT', 'tok-alice', { payload: payload('2026-10-31T10:00:00.000Z') });
  assert.deepEqual(notion.calls, ['tok-alice']);
});

test('only other methods are refused', async () => {
  assert.equal((await call('POST', 'tok-alice', {})).status, 405);
});

test('payload check', () => {
  assert.equal(isValidPayload(payload('2026-10-31T10:00:00.000Z')), true);
  assert.equal(isValidPayload(null), false);
});
