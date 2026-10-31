const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { notionFetch, NOT_SIGNED_IN } = require('./notionClient.cjs');

// Replaces global fetch with a queue of answers, and records the Authorization headers sent.
let realFetch;
let sent;
function answer(...responses) {
  const queue = [...responses];
  globalThis.fetch = async (_url, init) => {
    sent.push(init.headers.Authorization);
    const [status, body] = queue.shift();
    return new Response(JSON.stringify(body), { status });
  };
}
beforeEach(() => {
  realFetch = globalThis.fetch;
  sent = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function auth(token, renewed) {
  const calls = [];
  return {
    calls,
    token: () => token,
    refresh: async (failed) => {
      calls.push(failed);
      return renewed;
    },
  };
}

test('an expired token is renewed once and the call retried', async () => {
  answer([401, { message: 'API token is invalid.' }], [200, { ok: 1 }]);
  const a = auth('old', 'new');
  assert.deepEqual(await notionFetch(a, 'GET', '/users/me'), { ok: 1 });
  assert.deepEqual(a.calls, ['old']);
  assert.deepEqual(sent, ['Bearer old', 'Bearer new']);
});

test('when the token cannot be renewed the call fails as "not signed in"', async () => {
  answer([401, { message: 'API token is invalid.' }]);
  await assert.rejects(notionFetch(auth('old', null), 'GET', '/users/me'), { message: NOT_SIGNED_IN });
});

test('a second 401 right after renewing is reported instead of looping', async () => {
  answer([401, {}], [401, { message: 'API token is invalid.' }]);
  const a = auth('old', 'new');
  await assert.rejects(notionFetch(a, 'GET', '/users/me'), { message: 'API token is invalid.' });
  assert.equal(a.calls.length, 1);
});

test('without a sign-in nothing is sent', async () => {
  answer();
  await assert.rejects(notionFetch(auth('', null), 'GET', '/users/me'), { message: NOT_SIGNED_IN });
  assert.deepEqual(sent, []);
});
