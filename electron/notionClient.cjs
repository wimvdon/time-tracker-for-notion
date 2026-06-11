// All Notion REST API calls. Runs in the main process only — the renderer
// never sees the API key.

// Overridable for integration testing against a local mock server
const BASE_URL = process.env.NOTION_API_BASE_URL || 'https://api.notion.com/v1';
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
 * Returns all Notion databases the integration can access.
 * @returns [{ id, name }]
 */
async function searchDatabases(apiKey) {
  const results = [];
  let cursor;
  do {
    const data = await notionFetch(apiKey, 'POST', '/search', {
      filter: { value: 'database', property: 'object' },
      sort: { direction: 'ascending', timestamp: 'last_edited_time' },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const db of data.results) {
      const name = (db.title || []).map((t) => t.plain_text).join('').trim() || '(Untitled)';
      results.push({ id: db.id, name });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/**
 * Returns the raw `properties` map of a database. Filtering by property type
 * happens in the renderer (src/lib/schema.js).
 * Shape: { [propName]: { id, type, status?: { options: [{ name, color, id }] }, ... } }
 */
async function getDatabaseSchema(apiKey, dbId) {
  const data = await notionFetch(apiKey, 'GET', `/databases/${dbId}`);
  return data.properties;
}

/**
 * Fetches all pages of a database as picker options, using whichever property
 * is the title (every Notion database has exactly one). Used for the project
 * picker and for relation-type extra fields. Sorted by most recently edited.
 * @returns [{ id, name }]
 */
async function fetchDatabasePages(apiKey, dbId) {
  const results = [];
  let cursor = undefined;
  do {
    const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of data.results) {
      const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
      const name = (titleProp?.title || [])
        .map((t) => t.plain_text)
        .join('')
        .trim();
      if (name) results.push({ id: page.id, name });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/**
 * Returns the workspace members (for people-type extra fields).
 * @returns [{ id, name }]
 */
async function listUsers(apiKey) {
  const results = [];
  let cursor;
  do {
    const data = await notionFetch(
      apiKey,
      'GET',
      `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`
    );
    for (const user of data.results) {
      if (user.type === 'person') {
        results.push({ id: user.id, name: user.name || user.person?.email || user.id });
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Creates a new time entry page (START).
 * @param {object} params { dbId, title, startISO, projectId, props, extra }
 *   extra: pre-built Notion property values for the workspace's extra fields
 *   ({ [propName]: value }); managed properties win on a name collision.
 * @returns {{ pageId: string }}
 */
async function createTimeEntry(apiKey, { dbId, title, startISO, projectId, props, extra }) {
  const data = await notionFetch(apiKey, 'POST', '/pages', {
    parent: { database_id: dbId },
    properties: {
      ...(extra || {}),
      [props.timeEntryTitleProp]: {
        title: [{ text: { content: title } }],
      },
      [props.timeEntryDateProp]: {
        date: { start: startISO, end: null },
      },
      [props.timeEntryStatusProp]: {
        status: { name: props.timeEntryStatusRunning },
      },
      ...(projectId && props.timeEntryRelationProp
        ? { [props.timeEntryRelationProp]: { relation: [{ id: projectId }] } }
        : {}),
    },
  });
  return { pageId: data.id };
}

/**
 * Completes a time entry (STOP). startISO must be the exact value used at
 * creation — it is not re-rounded.
 * @param {object} params { pageId, startISO, endISO, props }
 */
async function stopTimeEntry(apiKey, { pageId, startISO, endISO, props }) {
  await notionFetch(apiKey, 'PATCH', `/pages/${pageId}`, {
    properties: {
      [props.timeEntryDateProp]: {
        date: { start: startISO, end: endISO },
      },
      [props.timeEntryStatusProp]: {
        status: { name: props.timeEntryStatusDone },
      },
    },
  });
  return { ok: true };
}

module.exports = {
  testConnection,
  searchDatabases,
  getDatabaseSchema,
  fetchDatabasePages,
  listUsers,
  createTimeEntry,
  stopTimeEntry,
};
