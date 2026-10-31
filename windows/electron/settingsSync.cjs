// Settings sync with the sign-in server (worker/src/sync.js): reads, stores and deletes this
// Notion user's synced settings. Sends the Notion token so the server knows whose settings they
// are; renews it once when the server answers 401, like notionClient.cjs does with Notion.
// Electron-free, so it's unit tested (settingsSync.test.cjs).

const { AUTH_SERVER_URL, NOT_SIGNED_IN } = require('./notionAuth.cjs');

function createSettingsSync({ auth, serverUrl = AUTH_SERVER_URL, fetchImpl = (...args) => fetch(...args) }) {
  async function request(method, body) {
    let token = auth.token();
    if (!token) throw new Error(NOT_SIGNED_IN);
    for (let renewed = false; ; renewed = true) {
      let response;
      try {
        response = await fetchImpl(new URL('/settings', serverUrl), {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        throw new Error(`Network error reaching the sync server: ${err.message}`, { cause: err });
      }
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && !renewed) {
        token = await auth.refresh(token);
        if (!token) throw new Error(NOT_SIGNED_IN);
        continue;
      }
      // 409: the server's copy is newer; it comes back in `payload`.
      if (response.ok || response.status === 409) return data;
      throw new Error(`Settings sync failed (${data.error || `HTTP ${response.status}`})`);
    }
  }

  return {
    /** The stored settings payload, or null. */
    get: async () => (await request('GET')).payload ?? null,
    /** Stores `payload` unless the server has a newer one: { accepted, payload }. */
    put: async (payload) => {
      const data = await request('PUT', { payload });
      return { accepted: data.accepted === true, payload: data.payload ?? null };
    },
    remove: async () => {
      await request('DELETE');
    },
  };
}

/** A payload the renderer may send: an object with an ISO updatedAt and a workspaces list. */
function isSyncPayload(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.workspaces)
  );
}

module.exports = { createSettingsSync, isSyncPayload };
