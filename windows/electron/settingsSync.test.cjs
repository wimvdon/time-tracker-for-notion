const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsSync, isSyncPayload } = require('./settingsSync.cjs');

const SERVER = 'https://sync.example.test';

function server(...answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) });
    const [status, body] = answers.shift();
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

const auth = (token, renewed = null) => ({ token: () => token, refresh: async () => renewed });
const P = { updatedAt: '2026-10-31T10:00:00.000Z', workspaces: [] };

test('reads the stored settings with the Notion token', async () => {
  const s = server([200, { payload: P }]);
  const sync = createSettingsSync({ auth: auth('tok'), serverUrl: SERVER, fetchImpl: s.fetchImpl });
  assert.deepEqual(await sync.get(), P);
  assert.deepEqual(s.calls[0], { url: `${SERVER}/settings`, method: 'GET', auth: 'Bearer tok', body: undefined });
});

test('nothing stored reads as null', async () => {
  const sync = createSettingsSync({ auth: auth('tok'), serverUrl: SERVER, fetchImpl: server([200, { payload: null }]).fetchImpl });
  assert.equal(await sync.get(), null);
});

test('a push the server refuses because it has newer settings returns those', async () => {
  const newer = { ...P, updatedAt: '2026-10-31T11:00:00.000Z' };
  const s = server([409, { accepted: false, payload: newer }]);
  const sync = createSettingsSync({ auth: auth('tok'), serverUrl: SERVER, fetchImpl: s.fetchImpl });
  assert.deepEqual(await sync.put(P), { accepted: false, payload: newer });
  assert.deepEqual(s.calls[0].body, { payload: P });
});

test('an expired token is renewed once and the request retried', async () => {
  const s = server([401, { error: 'unauthorized' }], [200, { accepted: true, payload: P }]);
  const sync = createSettingsSync({ auth: auth('old', 'new'), serverUrl: SERVER, fetchImpl: s.fetchImpl });
  assert.deepEqual(await sync.put(P), { accepted: true, payload: P });
  assert.deepEqual(s.calls.map((c) => c.auth), ['Bearer old', 'Bearer new']);
});

test('without a sign-in, or when it cannot be renewed, it fails as not signed in', async () => {
  await assert.rejects(createSettingsSync({ auth: auth(''), serverUrl: SERVER, fetchImpl: server().fetchImpl }).get(), { message: 'NOT_SIGNED_IN' });
  const s = server([401, {}]);
  await assert.rejects(createSettingsSync({ auth: auth('old', null), serverUrl: SERVER, fetchImpl: s.fetchImpl }).get(), { message: 'NOT_SIGNED_IN' });
});

test('server errors are reported', async () => {
  const sync = createSettingsSync({ auth: auth('tok'), serverUrl: SERVER, fetchImpl: server([502, { error: 'notion_error' }]).fetchImpl });
  await assert.rejects(sync.get(), /notion_error/);
});

test('delete sends DELETE', async () => {
  const s = server([200, { deleted: true }]);
  await createSettingsSync({ auth: auth('tok'), serverUrl: SERVER, fetchImpl: s.fetchImpl }).remove();
  assert.equal(s.calls[0].method, 'DELETE');
});

test('only sensible payloads are accepted from the renderer', () => {
  assert.equal(isSyncPayload(P), true);
  for (const bad of [null, [], 'x', { updatedAt: 1, workspaces: [] }, { updatedAt: 'x' }]) assert.equal(isSyncPayload(bad), false);
});
