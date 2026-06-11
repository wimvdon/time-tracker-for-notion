// All Notion REST API calls. Runs in the main process only — the renderer
// never sees the API key.

const BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function notionFetch(apiKey, method, endpoint, body) {
  if (!apiKey) {
    throw new Error('No Notion API key configured. Add one in Settings.');
  }
  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Network error reaching Notion: ${err.message}`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Notion API error (HTTP ${response.status})`);
  }
  return data;
}

/**
 * Verifies the API key can reach a database (Settings "Test connection").
 * Without a dbId it only validates the key itself via /users/me.
 */
async function testConnection(apiKey, dbId) {
  if (dbId) {
    await notionFetch(apiKey, 'GET', `/databases/${dbId}`);
  } else {
    await notionFetch(apiKey, 'GET', '/users/me');
  }
  return { ok: true };
}

/**
 * Fetches all deelprojecten from a Deelprojecten database, sorted by name.
 * Returns [{ id, name }].
 */
async function fetchDeelprojecten(apiKey, dbId) {
  const results = [];
  let cursor = undefined;
  do {
    const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, {
      sorts: [{ property: 'Deelproject', direction: 'ascending' }],
      filter: { property: 'Deelproject', title: { is_not_empty: true } },
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of data.results) {
      const titleParts = page.properties?.Deelproject?.title || [];
      const name = titleParts.map((t) => t.plain_text).join('');
      if (name) results.push({ id: page.id, name });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/**
 * Creates a new Tijdsregistratie page (START).
 * @param {object} params { dbId, title, startISO, deelprojectId }
 * @returns {{ pageId: string }}
 */
async function createTijdsregistratie(apiKey, { dbId, title, startISO, deelprojectId }) {
  const data = await notionFetch(apiKey, 'POST', '/pages', {
    parent: { database_id: dbId },
    properties: {
      Tijdsregistratie: {
        title: [{ text: { content: title } }],
      },
      Tijd: {
        date: { start: startISO, end: null },
      },
      Status: {
        status: { name: 'Lopende tijdsregistratie' },
      },
      'Gekoppeld deelproject': {
        relation: [{ id: deelprojectId }],
      },
    },
  });
  return { pageId: data.id };
}

/**
 * Completes a Tijdsregistratie (STOP). startISO must be the exact value used
 * at creation — it is not re-rounded.
 * @param {object} params { pageId, startISO, endISO }
 */
async function stopTijdsregistratie(apiKey, { pageId, startISO, endISO }) {
  await notionFetch(apiKey, 'PATCH', `/pages/${pageId}`, {
    properties: {
      Tijd: {
        date: { start: startISO, end: endISO },
      },
      Status: {
        status: { name: 'Voltooide tijdsregistratie' },
      },
    },
  });
  return { ok: true };
}

module.exports = {
  testConnection,
  fetchDeelprojecten,
  createTijdsregistratie,
  stopTijdsregistratie,
};
