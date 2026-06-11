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
 * Fetches all projects from a Projects database, sorted by title.
 * @param {object} props - the workspace's propertyMap
 * @returns [{ id, name }]
 */
async function fetchProjects(apiKey, dbId, props) {
  const results = [];
  let cursor = undefined;
  do {
    const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, {
      sorts: [{ property: props.projectTitleProp, direction: 'ascending' }],
      filter: { property: props.projectTitleProp, title: { is_not_empty: true } },
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of data.results) {
      const titleParts = page.properties?.[props.projectTitleProp]?.title || [];
      const name = titleParts.map((t) => t.plain_text).join('');
      if (name) results.push({ id: page.id, name });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/**
 * Creates a new time entry page (START).
 * @param {object} params { dbId, title, startISO, projectId, props }
 * @returns {{ pageId: string }}
 */
async function createTimeEntry(apiKey, { dbId, title, startISO, projectId, props }) {
  const data = await notionFetch(apiKey, 'POST', '/pages', {
    parent: { database_id: dbId },
    properties: {
      [props.timeEntryTitleProp]: {
        title: [{ text: { content: title } }],
      },
      [props.timeEntryDateProp]: {
        date: { start: startISO, end: null },
      },
      [props.timeEntryStatusProp]: {
        status: { name: props.timeEntryStatusRunning },
      },
      [props.timeEntryRelationProp]: {
        relation: [{ id: projectId }],
      },
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
  fetchProjects,
  createTimeEntry,
  stopTimeEntry,
};
