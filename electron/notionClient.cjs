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
 * Queries one page so query access is validated, not just metadata access.
 * Without a dbId it only validates the key itself via /users/me.
 */
async function testConnection(apiKey, dbId) {
  if (dbId) {
    await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, { page_size: 1 });
  } else {
    await notionFetch(apiKey, 'GET', '/users/me');
  }
  return { ok: true };
}

/**
 * Fetches all deelprojecten from a Deelprojecten database, sorted by name.
 * @param {object} props - the project's propertyMap
 * @returns [{ id, name }]
 */
async function fetchDeelprojecten(apiKey, dbId, props) {
  const results = [];
  let cursor = undefined;
  do {
    const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, {
      sorts: [{ property: props.deelTitleProp, direction: 'ascending' }],
      filter: { property: props.deelTitleProp, title: { is_not_empty: true } },
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of data.results) {
      const titleParts = page.properties?.[props.deelTitleProp]?.title || [];
      const name = titleParts.map((t) => t.plain_text).join('');
      if (name) results.push({ id: page.id, name });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/**
 * Creates a new Tijdsregistratie page (START).
 * @param {object} params { dbId, title, startISO, deelprojectId, props }
 * @returns {{ pageId: string }}
 */
async function createTijdsregistratie(apiKey, { dbId, title, startISO, deelprojectId, props }) {
  const data = await notionFetch(apiKey, 'POST', '/pages', {
    parent: { database_id: dbId },
    properties: {
      [props.tijdsTitleProp]: {
        title: [{ text: { content: title } }],
      },
      [props.tijdsTijdProp]: {
        date: { start: startISO, end: null },
      },
      [props.tijdsStatusProp]: {
        status: { name: props.tijdsStatusRunning },
      },
      [props.tijdsRelationProp]: {
        relation: [{ id: deelprojectId }],
      },
    },
  });
  return { pageId: data.id };
}

/**
 * Completes a Tijdsregistratie (STOP). startISO must be the exact value used
 * at creation — it is not re-rounded.
 * @param {object} params { pageId, startISO, endISO, props }
 */
async function stopTijdsregistratie(apiKey, { pageId, startISO, endISO, props }) {
  await notionFetch(apiKey, 'PATCH', `/pages/${pageId}`, {
    properties: {
      [props.tijdsTijdProp]: {
        date: { start: startISO, end: endISO },
      },
      [props.tijdsStatusProp]: {
        status: { name: props.tijdsStatusDone },
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
