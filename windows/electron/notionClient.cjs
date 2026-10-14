// All Notion REST API calls. Runs in the main process only — the renderer
// never sees the API key.

// Overridable for integration testing against a local mock server
const BASE_URL = process.env.NOTION_API_BASE_URL || 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

/**
 * Notion allows roughly three requests per second per integration and answers
 * 429 once that is exceeded. Loading a workspace's fields fires several calls
 * at once (schema, related-database pages, users) on top of the running-timer
 * and recent-entry queries for every workspace, so a burst can easily hit that
 * ceiling. Retrying here — honouring Retry-After — keeps a throttled call from
 * surfacing as an empty schema or an empty option list further up.
 */
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function notionFetch(apiKey, method, endpoint, body) {
  if (!apiKey) {
    throw new Error('No Notion API key configured. Add one in Settings.');
  }
  for (let attempt = 0; ; attempt++) {
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
      throw new Error(`Network error reaching Notion: ${err.message}`, { cause: err });
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;

    const message = data.message || `Notion API error (HTTP ${response.status})`;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS - 1) throw new Error(message);

    const retryAfterMs = Number(response.headers.get('Retry-After')) * 1000;
    const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? retryAfterMs
      : 500 * 2 ** attempt;
    await sleep(Math.min(10_000, Math.max(300, backoffMs)));
  }
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
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
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
  let cursor;
  do {
    const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of data.results) {
      const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
      // Entries without a title still have to be listed: a relation value
      // pointing at one would otherwise have no matching option and the field
      // would read as empty even though the page is linked.
      const name =
        (titleProp?.title || []).map((t) => t.plain_text).join('').trim() || '(Untitled)';
      results.push({ id: page.id, name });
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

/**
 * Queries a time-entries database for pages that have the "running" status.
 * Returns [{ pageId, title, startISO }], sorted by startISO descending.
 */
async function fetchRunningTimers(apiKey, dbId, statusProp, statusRunning, dateProp) {
  const results = [];
  let cursor;
  do {
    const body = {
      filter: { property: statusProp, status: { equals: statusRunning } },
      page_size: 100,
      ...(dateProp ? { sorts: [{ property: dateProp, direction: 'descending' }] } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    };
    const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, body);
    for (const page of data.results) {
      const props = page.properties || {};
      const titlePropObj = Object.values(props).find((p) => p.type === 'title');
      const title = (titlePropObj?.title || []).map((t) => t.plain_text).join('').trim() || 'Untitled';
      const datePropObj = dateProp ? props[dateProp] : null;
      const startISO = datePropObj?.date?.start ?? null;
      if (!startISO) continue;
      results.push({ pageId: page.id, title, startISO, url: page.url || '' });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function fetchRecentEntries(apiKey, dbId, statusProp, statusDone, dateProp) {
  const body = {
    filter: { property: statusProp, status: { equals: statusDone } },
    page_size: 15,
    ...(dateProp ? { sorts: [{ property: dateProp, direction: 'descending' }] } : {}),
  };
  const data = await notionFetch(apiKey, 'POST', `/databases/${dbId}/query`, body);
  const results = [];
  for (const page of data.results) {
    const props = page.properties || {};
    const titlePropObj = Object.values(props).find((p) => p.type === 'title');
    const title = (titlePropObj?.title || []).map((t) => t.plain_text).join('').trim() || 'Untitled';
    const datePropObj = dateProp ? props[dateProp] : null;
    const startISO = datePropObj?.date?.start ?? null;
    const endISO = datePropObj?.date?.end ?? null;
    results.push({ pageId: page.id, title, startISO, endISO, url: page.url || '' });
  }
  return results;
}

async function deletePage(apiKey, pageId) {
  await notionFetch(apiKey, 'PATCH', `/pages/${pageId}`, { archived: true });
  return { ok: true };
}

async function updatePageProperties(apiKey, pageId, properties) {
  const filtered = Object.fromEntries(Object.entries(properties).filter(([, v]) => v != null));
  await notionFetch(apiKey, 'PATCH', `/pages/${pageId}`, { properties: filtered });
  return { ok: true };
}

/**
 * Fetches a page's raw `properties` map, used to restore extra-field values
 * (e.g. connected project) when loading an already-running timer.
 */
async function getPageProperties(apiKey, pageId) {
  const data = await notionFetch(apiKey, 'GET', `/pages/${pageId}`);
  return data.properties || {};
}

// ---- Settings sync (stores a JSON blob in a code block on a Notion page) ----

// Notion rich_text segments are capped at 2000 chars each.
const RICH_TEXT_CHUNK_SIZE = 2000;

function encodeSyncPayload(payload) {
  const json = JSON.stringify(payload);
  const chunks = [];
  for (let i = 0; i < json.length; i += RICH_TEXT_CHUNK_SIZE) {
    chunks.push(json.slice(i, i + RICH_TEXT_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push('');
  return chunks.map((c) => ({ type: 'text', text: { content: c } }));
}

function decodeSyncPayload(richText) {
  const json = (richText || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.workspaces) || typeof data.updatedAt !== 'string') {
    throw new Error('Not a valid sync page');
  }
  return data;
}

/**
 * Returns all Notion pages the integration can access (for the "load existing
 * sync page" picker).
 * @returns [{ id, name, url }]
 */
async function searchPages(apiKey) {
  const results = [];
  let cursor;
  do {
    const data = await notionFetch(apiKey, 'POST', '/search', {
      filter: { value: 'page', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of data.results) {
      const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
      const name = (titleProp?.title || []).map((t) => t.plain_text).join('').trim() || '(Untitled)';
      results.push({ id: page.id, name, url: page.url || '' });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/**
 * Creates a new Notion page as a child of `parentPageId` (movable/renamable by
 * the user afterward) containing the sync payload as a single JSON code block.
 * Internal integrations cannot create pages directly at the workspace root
 * (Notion's API rejects `parent.workspace`), so an existing accessible page
 * must be chosen as the parent.
 * @returns { pageId }
 */
async function createSyncPage(apiKey, parentPageId, title, payload) {
  const data = await notionFetch(apiKey, 'POST', '/pages', {
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ text: { content: title } }] },
    },
    children: [
      {
        object: 'block',
        type: 'code',
        code: { language: 'json', rich_text: encodeSyncPayload(payload) },
      },
    ],
  });
  return { pageId: data.id };
}

/**
 * Reads a page's children looking for the sync JSON code block.
 * @returns { blockId, payload } or null if the page has no valid sync data
 */
async function fetchSyncPageContent(apiKey, pageId) {
  const data = await notionFetch(apiKey, 'GET', `/blocks/${pageId}/children?page_size=100`);
  for (const block of data.results) {
    if (block.type !== 'code') continue;
    try {
      const payload = decodeSyncPayload(block.code.rich_text);
      return { blockId: block.id, payload };
    } catch {
      // Not our sync block — keep looking
    }
  }
  return null;
}

/** Overwrites the sync code block in place with a fresh payload. */
async function updateSyncBlock(apiKey, blockId, payload) {
  await notionFetch(apiKey, 'PATCH', `/blocks/${blockId}`, {
    code: { language: 'json', rich_text: encodeSyncPayload(payload) },
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
  fetchRunningTimers,
  fetchRecentEntries,
  deletePage,
  updatePageProperties,
  getPageProperties,
  searchPages,
  createSyncPage,
  fetchSyncPageContent,
  updateSyncBlock,
};
