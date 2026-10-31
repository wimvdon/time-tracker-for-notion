const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  createNotionSession,
  createPkce,
  listenForCallback,
  SIGN_IN_CANCELLED,
} = require('./notionAuth.cjs');

const AUTH = 'https://auth.example.test';

function memoryTokens(initial = null) {
  let session = initial;
  return { get: () => session, set: (value) => { session = value; } };
}

/** A fake sign-in server: answers by path, records the bodies it got. */
function fakeServer(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    calls.push({ path, body });
    const [status, data] = await routes[path](body);
    return new Response(JSON.stringify(data), { status });
  };
  return { calls, fetchImpl };
}

/** Plays the browser: follows the start URL the app opened back to the local callback. */
function browserReturning(params) {
  const opened = [];
  const openBrowser = async (url) => {
    opened.push(new URL(url));
    const port = new URL(url).searchParams.get('port');
    const query = new URLSearchParams(params).toString();
    // Like a browser, without waiting for the app to finish.
    fetch(`http://127.0.0.1:${port}/callback?${query}`).then((r) => r.text());
  };
  return { opened, openBrowser };
}

test('the challenge is the sha256 of the verifier, both URL-safe', () => {
  const { verifier, challenge } = createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
});

test('sign-in opens the server with a local port, swaps the code and saves the tokens', async () => {
  const tokens = memoryTokens();
  const changes = [];
  const server = fakeServer({
    '/token': () => [200, { access_token: 'ntn_new', refresh_token: 'nrt_new', workspace_name: 'Team', workspace_id: 'w1' }],
  });
  const browser = browserReturning({ code: 'the-code', state: 'the-state' });
  const session = createNotionSession({
    tokens,
    openBrowser: browser.openBrowser,
    onChange: (reason) => changes.push(reason),
    authUrl: AUTH,
    fetchImpl: server.fetchImpl,
  });

  const account = await session.signIn();

  assert.deepEqual(account, { workspaceName: 'Team' });
  const start = browser.opened[0];
  assert.equal(start.origin + start.pathname, `${AUTH}/start`);
  assert.equal(start.searchParams.get('platform'), 'windows');
  assert.ok(Number(start.searchParams.get('port')) > 1023);
  const { body } = server.calls[0];
  assert.equal(body.code, 'the-code');
  assert.equal(body.state, 'the-state');
  assert.equal(crypto.createHash('sha256').update(body.verifier).digest('base64url'), start.searchParams.get('challenge'));
  assert.deepEqual(tokens.get(), { accessToken: 'ntn_new', refreshToken: 'nrt_new', workspaceName: 'Team', workspaceId: 'w1' });
  assert.equal(session.token(), 'ntn_new');
  assert.deepEqual(changes, ['signedIn']);
});

test('clicking Cancel on Notion\'s page ends the sign-in quietly, without asking the server', async () => {
  const server = fakeServer({});
  const session = createNotionSession({
    tokens: memoryTokens(),
    openBrowser: browserReturning({ error: 'access_denied', state: 's' }).openBrowser,
    authUrl: AUTH,
    fetchImpl: server.fetchImpl,
  });
  await assert.rejects(session.signIn(), { message: SIGN_IN_CANCELLED });
  assert.equal(server.calls.length, 0);
});

test('a sign-in can be cancelled from the app while the browser is open', async () => {
  const session = createNotionSession({
    tokens: memoryTokens(),
    openBrowser: async () => {},
    authUrl: AUTH,
    fetchImpl: fakeServer({}).fetchImpl,
  });
  const signingIn = session.signIn();
  setTimeout(() => session.cancelSignIn(), 20);
  await assert.rejects(signingIn, { message: SIGN_IN_CANCELLED });
});

test('a refused code is reported and nothing is saved', async () => {
  const tokens = memoryTokens();
  const session = createNotionSession({
    tokens,
    openBrowser: browserReturning({ code: 'c', state: 's' }).openBrowser,
    authUrl: AUTH,
    fetchImpl: fakeServer({ '/token': () => [400, { error: 'invalid_grant' }] }).fetchImpl,
  });
  await assert.rejects(session.signIn(), /invalid_grant/);
  assert.equal(tokens.get(), null);
});

test('the local listener only answers /callback and gives up after its timeout', async () => {
  const listener = listenForCallback({ timeoutMs: 50 });
  const port = await listener.ready;
  const other = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
  assert.equal(other.status, 404);
  await assert.rejects(listener.result, { message: SIGN_IN_CANCELLED });
});

test('refresh swaps the refresh token once for several requests at the same time', async () => {
  const tokens = memoryTokens({ accessToken: 'old', refreshToken: 'nrt_old', workspaceName: 'Team', workspaceId: 'w1' });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const server = fakeServer({
    '/refresh': async () => { await gate; return [200, { access_token: 'new', refresh_token: 'nrt_new' }]; },
  });
  const session = createNotionSession({ tokens, openBrowser: async () => {}, authUrl: AUTH, fetchImpl: server.fetchImpl });

  const results = Promise.all([session.refresh('old'), session.refresh('old'), session.refresh('old')]);
  release();
  assert.deepEqual(await results, ['new', 'new', 'new']);
  assert.equal(server.calls.length, 1);
  assert.deepEqual(server.calls[0].body, { refresh_token: 'nrt_old' });
  // The workspace name is kept when the refresh answer leaves it out.
  assert.deepEqual(tokens.get(), { accessToken: 'new', refreshToken: 'nrt_new', workspaceName: 'Team', workspaceId: 'w1' });
  // A request that failed with the old token after the refresh just gets the new one.
  assert.equal(await session.refresh('old'), 'new');
  assert.equal(server.calls.length, 1);
});

test('a refused refresh token signs out and tells the UI', async () => {
  const tokens = memoryTokens({ accessToken: 'old', refreshToken: 'nrt_old', workspaceName: 'Team' });
  const changes = [];
  const session = createNotionSession({
    tokens,
    openBrowser: async () => {},
    onChange: (reason) => changes.push(reason),
    authUrl: AUTH,
    fetchImpl: fakeServer({ '/refresh': () => [400, { error: 'invalid_grant' }] }).fetchImpl,
  });
  assert.equal(await session.refresh('old'), null);
  assert.equal(tokens.get(), null);
  assert.equal(session.account(), null);
  assert.deepEqual(changes, ['expired']);
});

test('a server problem during refresh keeps the sign-in', async () => {
  const tokens = memoryTokens({ accessToken: 'old', refreshToken: 'nrt_old', workspaceName: 'Team' });
  const session = createNotionSession({
    tokens,
    openBrowser: async () => {},
    authUrl: AUTH,
    fetchImpl: fakeServer({ '/refresh': () => [502, { error: 'notion_error' }] }).fetchImpl,
  });
  await assert.rejects(session.refresh('old'), /renew/);
  assert.equal(tokens.get().accessToken, 'old');
});

test('signing out forgets the tokens', () => {
  const tokens = memoryTokens({ accessToken: 'a', refreshToken: 'r', workspaceName: 'Team' });
  const changes = [];
  const session = createNotionSession({ tokens, openBrowser: async () => {}, onChange: (r) => changes.push(r), authUrl: AUTH });
  assert.deepEqual(session.account(), { workspaceName: 'Team' });
  session.signOut();
  assert.equal(session.token(), '');
  assert.deepEqual(changes, ['signedOut']);
});
