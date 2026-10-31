import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './index.js';
import { challengeFor, signState, verifyState, parseStart, STATE_TTL_MS } from './auth.js';
import { pickLanguage } from './page.js';

const env = { NOTION_CLIENT_ID: 'client-id', NOTION_CLIENT_SECRET: 'client-secret', STATE_SECRET: 'state-secret' };
const ORIGIN = 'https://auth.example.workers.dev';
const VERIFIER = 'a'.repeat(64);

const get = (path, headers = {}) => new Request(`${ORIGIN}${path}`, { headers });
const post = (path, body) =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

/** A fake Notion token endpoint that records what it was asked. */
function fakeNotion(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

async function startState(params) {
  const response = await handleRequest(get(`/start?${params}`), env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  return { location, state: location.searchParams.get('state') };
}

test('start sends the browser to Notion with the callback and a signed state', async () => {
  const challenge = await challengeFor(VERIFIER);
  const { location, state } = await startState(`platform=windows&port=49152&challenge=${challenge}`);
  assert.equal(location.origin + location.pathname, 'https://api.notion.com/v1/oauth/authorize');
  assert.equal(location.searchParams.get('client_id'), 'client-id');
  assert.equal(location.searchParams.get('redirect_uri'), `${ORIGIN}/callback`);
  assert.equal(location.searchParams.get('owner'), 'user');
  assert.equal(location.searchParams.get('response_type'), 'code');
  const data = await verifyState(state, env.STATE_SECRET);
  assert.deepEqual({ p: data.p, c: data.c, port: data.port }, { p: 'windows', c: challenge, port: 49152 });
});

test('start refuses unknown platforms, bad challenges and misplaced ports', async () => {
  const challenge = await challengeFor(VERIFIER);
  for (const params of [
    `platform=ios&challenge=${challenge}`,
    'platform=android&challenge=short',
    `platform=windows&challenge=${challenge}`,
    `platform=windows&port=80&challenge=${challenge}`,
    `platform=android&port=50000&challenge=${challenge}`,
  ]) {
    const response = await handleRequest(get(`/start?${params}`), env);
    assert.equal(response.status, 400, params);
  }
});

test('callback hands the code to the local Windows address', async () => {
  const { state } = await startState(`platform=windows&port=50123&challenge=${await challengeFor(VERIFIER)}`);
  const response = await handleRequest(get(`/callback?code=the-code&state=${encodeURIComponent(state)}`), env);
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get('Location'));
  assert.equal(target.origin, 'http://127.0.0.1:50123');
  assert.equal(target.pathname, '/callback');
  assert.equal(target.searchParams.get('code'), 'the-code');
  assert.equal(target.searchParams.get('state'), state);
});

test('callback shows Android a page that opens the matching app (release or Dev build)', async () => {
  for (const [platform, scheme] of [['android', 'timetrackerfornotion:'], ['android-debug', 'timetrackerfornotion-debug:']]) {
    const { state } = await startState(`platform=${platform}&challenge=${await challengeFor(VERIFIER)}`);
    const response = await handleRequest(
      get(`/callback?error=access_denied&state=${encodeURIComponent(state)}`, { 'Accept-Language': 'nl-BE,nl;q=0.9' }),
      env,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`href="${scheme}//auth\\?state=[^"]*&amp;error=access_denied"`));
    assert.match(html, /Time Tracker openen/);
  }
});

test('callback with a forged or expired state goes nowhere', async () => {
  const forged = await signState({ p: 'windows', port: 50000, c: 'x', exp: Date.now() + 1000 }, 'other-secret');
  const expired = await signState({ p: 'windows', port: 50000, c: 'x', exp: Date.now() - 1 }, env.STATE_SECRET);
  for (const state of [forged, expired, 'garbage']) {
    const response = await handleRequest(get(`/callback?code=c&state=${encodeURIComponent(state)}`), env);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Location'), null);
  }
});

test('token swaps the code with the client secret when the verifier matches', async () => {
  const { state } = await startState(`platform=android&challenge=${await challengeFor(VERIFIER)}`);
  const notion = fakeNotion(200, {
    access_token: 'ntn_access',
    refresh_token: 'nrt_refresh',
    workspace_id: 'ws-1',
    workspace_name: 'My workspace',
    bot_id: 'bot-1',
    owner: { type: 'user', user: { id: 'u1', person: { email: 'secret@example.com' } } },
  });
  const response = await handleRequest(post('/token', { code: 'the-code', state, verifier: VERIFIER }), env, notion.fetchImpl);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    access_token: 'ntn_access',
    refresh_token: 'nrt_refresh',
    workspace_id: 'ws-1',
    workspace_name: 'My workspace',
    bot_id: 'bot-1',
  });
  assert.equal(notion.calls.length, 1);
  assert.equal(notion.calls[0].url, 'https://api.notion.com/v1/oauth/token');
  assert.equal(notion.calls[0].init.headers.Authorization, `Basic ${btoa('client-id:client-secret')}`);
  assert.deepEqual(notion.calls[0].body, {
    grant_type: 'authorization_code',
    code: 'the-code',
    redirect_uri: `${ORIGIN}/callback`,
  });
});

test('token refuses a code redeemed without the right verifier, without asking Notion', async () => {
  const { state } = await startState(`platform=android&challenge=${await challengeFor(VERIFIER)}`);
  const notion = fakeNotion(200, { access_token: 'x' });
  const response = await handleRequest(post('/token', { code: 'c', state, verifier: 'b'.repeat(64) }), env, notion.fetchImpl);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_grant' });
  assert.equal(notion.calls.length, 0);
});

test('refresh passes Notion\'s new token pair back, and invalid_grant as a 400', async () => {
  const ok = fakeNotion(200, { access_token: 'new-access', refresh_token: 'new-refresh', workspace_name: 'W' });
  const response = await handleRequest(post('/refresh', { refresh_token: 'old' }), env, ok.fetchImpl);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.access_token, 'new-access');
  assert.equal(body.refresh_token, 'new-refresh');
  assert.deepEqual(ok.calls[0].body, { grant_type: 'refresh_token', refresh_token: 'old' });

  const revoked = fakeNotion(400, { error: 'invalid_grant' });
  const failed = await handleRequest(post('/refresh', { refresh_token: 'old' }), env, revoked.fetchImpl);
  assert.equal(failed.status, 400);
  assert.deepEqual(await failed.json(), { error: 'invalid_grant' });

  const down = fakeNotion(503, {});
  assert.equal((await handleRequest(post('/refresh', { refresh_token: 'old' }), env, down.fetchImpl)).status, 502);
  assert.equal((await handleRequest(post('/refresh', {}), env, down.fetchImpl)).status, 400);
});

test('anything else is not found', async () => {
  assert.equal((await handleRequest(get('/'), env)).status, 404);
  assert.equal((await handleRequest(get('/token'), env)).status, 404);
});

test('a state expires after the sign-in window', async () => {
  const data = parseStart(new URLSearchParams(`platform=android&challenge=${await challengeFor(VERIFIER)}`), 1000);
  const state = await signState(data, env.STATE_SECRET);
  assert.ok(await verifyState(state, env.STATE_SECRET, 1000 + STATE_TTL_MS));
  assert.equal(await verifyState(state, env.STATE_SECRET, 1001 + STATE_TTL_MS), null);
});

test('pages follow the browser language, else English', () => {
  assert.equal(pickLanguage('fr-BE,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(pickLanguage('pt-BR,de;q=0.5'), 'de');
  assert.equal(pickLanguage(null), 'en');
});
