import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { propertiesByType, statusOptions } from '../lib/schema.js';
import { WRITABLE_EXTRA_TYPES } from '../lib/notionValues.js';
import { t } from '../lib/i18n.js';
import { errorMessage } from '../lib/errors.js';

export default function Settings() {
  const apiKey = useStore((s) => s.apiKey);
  const workspaces = useStore((s) => s.workspaces);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const deleteWorkspace = useStore((s) => s.deleteWorkspace);
  const toggleAlwaysOnTop = useStore((s) => s.toggleAlwaysOnTop);
  const setView = useStore((s) => s.setView);
  const addToast = useStore((s) => s.addToast);
  const timerRunning = useStore((s) => s.timer.running);

  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState(null);

  const firstLaunch = !apiKey || workspaces.length === 0;

  const handleSaveAndTestKey = async () => {
    const key = keyInput.trim();
    setTesting(true);
    try {
      await window.notionAPI.testConnection(key, null);
      await saveApiKey(key);
      addToast({ type: 'success', message: t('toastApiKeySaved') });
    } catch (err) {
      addToast({ type: 'error', message: `${t('toastConnectionFailed')}: ${errorMessage(err)}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('timer')}
          className="text-zinc-400 hover:text-zinc-100 text-lg"
          title={t('titleBack')}
        >
          {t('btnBack')}
        </button>
        <h1 className="text-base font-semibold">{t('settingsTitle')}</h1>
      </div>

      {firstLaunch && (
        <div className="text-xs bg-blue-900/40 border border-blue-700 text-blue-200 rounded-md p-2">
          {t('firstLaunchHint')}
        </div>
      )}

      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelApiKey')}</label>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={t('placeholderApiKey')}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm placeholder-zinc-600"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? t('btnHideKey') : t('btnShowKey')}
            className="px-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm hover:bg-zinc-700"
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <button
          onClick={handleSaveAndTestKey}
          disabled={testing || !keyInput.trim()}
          className="mt-2 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm"
        >
          {testing ? t('btnTestingKey') : t('btnTestAndSaveKey')}
        </button>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelWorkspaces')}</label>
        <div className="flex flex-col gap-1">
          {workspaces.length === 0 && (
            <div className="text-xs text-zinc-600 italic py-1">{t('noWorkspacesYet')}</div>
          )}
          {workspaces.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2"
            >
              <span className="text-sm truncate">{w.name}</span>
              <span className="flex items-center gap-2 ml-2 shrink-0">
                <button
                  onClick={() => setEditingWorkspace(w)}
                  title={t('modalTitleEditWorkspace')}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  ✏️
                </button>
                <button
                  onClick={() => deleteWorkspace(w.id)}
                  disabled={timerRunning}
                  title={timerRunning ? t('titleDeleteWorkspaceDisabled') : t('titleDeleteWorkspace')}
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-40"
                >
                  🗑
                </button>
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAddWorkspace(true)}
          disabled={!apiKey}
          title={!apiKey ? t('warnNoApiKey') : undefined}
          className="mt-2 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm"
        >
          {t('btnAddWorkspace')}
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={alwaysOnTop}
          onChange={(e) => toggleAlwaysOnTop(e.target.checked)}
          className="accent-emerald-500"
        />
        {t('labelAlwaysOnTop')}
      </label>

      {showAddWorkspace && <WorkspaceModal onClose={() => setShowAddWorkspace(false)} />}
      {editingWorkspace && (
        <WorkspaceModal
          workspace={editingWorkspace}
          onClose={() => setEditingWorkspace(null)}
        />
      )}
    </div>
  );
}

const EMPTY_SELECTION = {
  timeEntryTitleProp: '',
  timeEntryDateProp: '',
  timeEntryStatusProp: '',
  timeEntryStatusRunning: '',
  timeEntryStatusDone: '',
  timeEntryRelationProp: '',
};

const MAX_EXTRA_PROPS = 3;

/** Add (no `workspace` prop) or edit (`workspace` provided) a workspace. */
function WorkspaceModal({ workspace, onClose }) {
  const addWorkspace = useStore((s) => s.addWorkspace);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const addToast = useStore((s) => s.addToast);

  const [name, setName] = useState(workspace?.name || '');
  const [timeEntriesDbId, setTimeEntriesDbId] = useState(workspace?.timeEntriesDbId || '');
  const [projectsDbId, setProjectsDbId] = useState(workspace?.projectsDbId || '');
  const [roundingEnabled, setRoundingEnabled] = useState(workspace?.roundingEnabled ?? true);
  const [sel, setSel] = useState({ ...EMPTY_SELECTION, ...(workspace?.propertyMap || {}) });
  // Optional extra fields (property names in the Time Entries database);
  // empty strings are unfilled rows and are dropped on save
  const [extraProps, setExtraProps] = useState(workspace?.extraProps || []);

  // Database list — fetched once per modal lifetime (Retry re-fetches)
  const [dbs, setDbs] = useState({ loading: true, error: null, items: [] });
  // Schema of the selected Time Entries database
  const [teSchema, setTeSchema] = useState({ loading: false, error: null, schema: null });

  const setProp = (key, value) => setSel((s) => ({ ...s, [key]: value }));

  const loadDatabases = async () => {
    setDbs({ loading: true, error: null, items: [] });
    try {
      const items = await window.notionAPI.searchDatabases();
      setDbs({ loading: false, error: null, items });
    } catch (err) {
      setDbs({ loading: false, error: errorMessage(err), items: [] });
    }
  };

  useEffect(() => {
    loadDatabases();
  }, []);

  // Load the Time Entries schema whenever that database changes. Selections
  // that don't exist in the freshly loaded schema are cleared so a stale
  // property name can never be saved.
  const loadTeSchema = async (dbId) => {
    setTeSchema({ loading: true, error: null, schema: null });
    try {
      const schema = await window.notionAPI.getDatabaseSchema(dbId);
      setTeSchema({ loading: false, error: null, schema });
      setSel((s) => validateTeSelection(s, schema));
      // Drop extra fields that don't exist (or aren't writable) in this schema
      setExtraProps((prev) =>
        prev.filter(
          (propName) =>
            !propName ||
            (schema[propName] && WRITABLE_EXTRA_TYPES.includes(schema[propName].type))
        )
      );
    } catch (err) {
      setTeSchema({ loading: false, error: errorMessage(err), schema: null });
    }
  };

  useEffect(() => {
    if (timeEntriesDbId) loadTeSchema(timeEntriesDbId);
    else setTeSchema({ loading: false, error: null, schema: null });
  }, [timeEntriesDbId]);

  const teTitleOpts = teSchema.schema ? propertiesByType(teSchema.schema, 'title') : [];
  const teDateOpts = teSchema.schema ? propertiesByType(teSchema.schema, 'date') : [];
  const teStatusOpts = teSchema.schema ? propertiesByType(teSchema.schema, 'status') : [];
  const teRelationOpts = teSchema.schema ? propertiesByType(teSchema.schema, 'relation') : [];
  const teStatusOptions = teSchema.schema
    ? statusOptions(teSchema.schema, sel.timeEntryStatusProp)
    : [];

  // Candidates for an extra-field row: writable types, minus the managed
  // properties and the names already chosen in other rows
  const extraCandidates = (rowIndex) => {
    if (!teSchema.schema) return [];
    const taken = new Set([
      sel.timeEntryTitleProp,
      sel.timeEntryDateProp,
      sel.timeEntryStatusProp,
      sel.timeEntryRelationProp,
      ...extraProps.filter((_, i) => i !== rowIndex),
    ]);
    return Object.entries(teSchema.schema)
      .filter(([propName, prop]) => WRITABLE_EXTRA_TYPES.includes(prop.type) && !taken.has(propName))
      .map(([propName, prop]) => ({ name: propName, type: prop.type }));
  };

  const complete =
    !!name.trim() &&
    !!timeEntriesDbId &&
    !!projectsDbId &&
    !!sel.timeEntryTitleProp &&
    !!sel.timeEntryDateProp &&
    !!sel.timeEntryStatusProp &&
    !!sel.timeEntryStatusRunning &&
    !!sel.timeEntryStatusDone &&
    !!sel.timeEntryRelationProp;

  const handleSave = async () => {
    if (!complete) return;
    const saved = {
      id: workspace?.id || crypto.randomUUID(),
      name: name.trim(),
      timeEntriesDbId,
      projectsDbId,
      roundingEnabled,
      propertyMap: {
        timeEntryTitleProp: sel.timeEntryTitleProp,
        timeEntryDateProp: sel.timeEntryDateProp,
        timeEntryStatusProp: sel.timeEntryStatusProp,
        timeEntryStatusRunning: sel.timeEntryStatusRunning,
        timeEntryStatusDone: sel.timeEntryStatusDone,
        timeEntryRelationProp: sel.timeEntryRelationProp,
      },
      extraProps: extraProps.filter(Boolean),
    };
    if (workspace) {
      await updateWorkspace(saved);
    } else {
      await addWorkspace(saved);
      addToast({ type: 'success', message: t('toastProjectAdded').replace('{name}', saved.name) });
    }
    onClose();
  };

  const dbSelect = (value, onChange) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={dbs.loading || !!dbs.error}
      className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
    >
      <option value="">
        {dbs.loading ? t('loadingDatabases') : t('placeholderSelectDatabase')}
      </option>
      {dbs.items.map((db) => (
        <option key={db.id} value={db.id}>
          {db.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full max-h-full overflow-y-auto flex flex-col gap-4">
        <h2 className="text-sm font-semibold">
          {workspace ? t('modalTitleEditWorkspace') : t('modalTitleAddWorkspace')}
        </h2>

        {/* Section A — Name */}
        <Field label={t('labelWorkspaceName')}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm"
          />
        </Field>

        {/* Section B — Databases */}
        {dbs.error && (
          <div className="text-xs bg-red-950 border border-red-700 text-red-200 rounded-md p-2 flex items-start gap-2">
            <span className="flex-1">{`${t('errorLoadingDatabases')}: ${dbs.error}`}</span>
            <button onClick={loadDatabases} className="font-semibold underline shrink-0">
              {t('btnRetry')}
            </button>
          </div>
        )}
        {!dbs.loading && !dbs.error && dbs.items.length === 0 && (
          <div className="text-xs bg-amber-900/40 border border-amber-700 text-amber-200 rounded-md p-2">
            {t('noDatabasesFound')}
          </div>
        )}
        <Field label={t('labelTimeEntriesDb')} hint={t('hintTimeEntriesDb')}>
          {dbSelect(timeEntriesDbId, setTimeEntriesDbId)}
        </Field>
        <Field label={t('labelProjectsDb')} hint={t('hintProjectsDb')}>
          {dbSelect(projectsDbId, setProjectsDbId)}
        </Field>

        {/* Section C — Time entry properties */}
        {timeEntriesDbId && (
          <div className="flex flex-col gap-3 border-t border-zinc-700 pt-3">
            {teSchema.error && (
              <div className="text-xs bg-red-950 border border-red-700 text-red-200 rounded-md p-2 flex items-start gap-2">
                <span className="flex-1">{`${t('errorLoadingSchema')}: ${teSchema.error}`}</span>
                <button
                  onClick={() => loadTeSchema(timeEntriesDbId)}
                  className="font-semibold underline shrink-0"
                >
                  {t('btnRetry')}
                </button>
              </div>
            )}
            <PropSelect
              label={t('labelTimeEntryTitleProp')}
              hint={t('hintTimeEntryTitleProp')}
              loading={teSchema.loading}
              options={teTitleOpts}
              value={sel.timeEntryTitleProp}
              onChange={(v) => setProp('timeEntryTitleProp', v)}
            />
            <PropSelect
              label={t('labelTimeEntryDateProp')}
              hint={t('hintTimeEntryDateProp')}
              loading={teSchema.loading}
              options={teDateOpts}
              value={sel.timeEntryDateProp}
              onChange={(v) => setProp('timeEntryDateProp', v)}
            />
            <PropSelect
              label={t('labelTimeEntryStatusProp')}
              hint={t('hintTimeEntryStatusProp')}
              loading={teSchema.loading}
              options={teStatusOpts}
              value={sel.timeEntryStatusProp}
              onChange={(v) =>
                // Changing the status field invalidates the chosen options
                setSel((s) => ({
                  ...s,
                  timeEntryStatusProp: v,
                  timeEntryStatusRunning: '',
                  timeEntryStatusDone: '',
                }))
              }
            />
            {sel.timeEntryStatusProp && (
              <div className="ml-4 flex flex-col gap-3">
                <PropSelect
                  label={t('labelTimeEntryStatusRunning')}
                  hint={t('hintTimeEntryStatusRunning')}
                  loading={teSchema.loading}
                  options={teStatusOptions}
                  value={sel.timeEntryStatusRunning}
                  onChange={(v) => setProp('timeEntryStatusRunning', v)}
                />
                <PropSelect
                  label={t('labelTimeEntryStatusDone')}
                  hint={t('hintTimeEntryStatusDone')}
                  loading={teSchema.loading}
                  options={teStatusOptions}
                  value={sel.timeEntryStatusDone}
                  onChange={(v) => setProp('timeEntryStatusDone', v)}
                />
              </div>
            )}
            <PropSelect
              label={t('labelTimeEntryRelationProp')}
              hint={t('hintTimeEntryRelationProp')}
              loading={teSchema.loading}
              options={teRelationOpts}
              value={sel.timeEntryRelationProp}
              onChange={(v) => setProp('timeEntryRelationProp', v)}
            />
          </div>
        )}

        {/* Section D — Extra fields (optional, max 3) */}
        {timeEntriesDbId && teSchema.schema && (
          <div className="flex flex-col gap-2 border-t border-zinc-700 pt-3">
            <p className="text-xs font-semibold text-zinc-300">{t('sectionExtraFields')}</p>
            <p className="text-xs text-zinc-500">{t('hintExtraFields')}</p>
            {extraProps.map((propName, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={propName}
                  onChange={(e) =>
                    setExtraProps((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                  }
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">{t('placeholderSelectField')}</option>
                  {extraCandidates(i).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setExtraProps((prev) => prev.filter((_, j) => j !== i))}
                  title={t('titleRemoveExtraField')}
                  className="text-zinc-500 hover:text-red-400 shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
            {extraProps.length < MAX_EXTRA_PROPS && (
              <button
                onClick={() => setExtraProps((prev) => [...prev, ''])}
                className="self-start px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-xs"
              >
                {t('btnAddExtraField')}
              </button>
            )}
          </div>
        )}

        {/* Section E — Rounding */}
        <div className="border-t border-zinc-700 pt-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={roundingEnabled}
              onChange={(e) => setRoundingEnabled(e.target.checked)}
              className="accent-emerald-500"
            />
            {t('labelWorkspaceRounding')}
          </label>
          <p className="text-xs text-zinc-500 mt-1 ml-5">{t('workspaceRoundingHint')}</p>
        </div>

        {/* Section F — Buttons */}
        {!complete && (
          <p className="text-xs text-zinc-500">{t('saveIncompleteHint')}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
          >
            {t('btnCancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!complete}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold"
          >
            {t('btnSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

/** Dropdown over a list of { name } options, with loading and empty states. */
function PropSelect({ label, hint, loading, options, value, onChange }) {
  const empty = !loading && options.length === 0;
  return (
    <Field label={label} hint={hint}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || empty}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
      >
        <option value="">{loading ? t('loadingProperties') : t('placeholderSelect')}</option>
        {options.map((o) => (
          <option key={o.name} value={o.name}>
            {o.name}
          </option>
        ))}
      </select>
      {empty && <p className="text-xs text-red-400 mt-1">{t('noPropertiesOfType')}</p>}
    </Field>
  );
}

// Clears selections that don't exist in the freshly loaded schema, and
// auto-selects when a property type has exactly one candidate.
function validateTeSelection(sel, schema) {
  const next = { ...sel };
  const pick = (key, type) => {
    const candidates = propertiesByType(schema, type);
    if (next[key] && !candidates.some((c) => c.name === next[key])) next[key] = '';
    if (!next[key] && candidates.length === 1) next[key] = candidates[0].name;
  };
  pick('timeEntryTitleProp', 'title');
  pick('timeEntryDateProp', 'date');
  pick('timeEntryStatusProp', 'status');
  pick('timeEntryRelationProp', 'relation');
  const opts = statusOptions(schema, next.timeEntryStatusProp);
  if (next.timeEntryStatusRunning && !opts.some((o) => o.name === next.timeEntryStatusRunning)) {
    next.timeEntryStatusRunning = '';
  }
  if (next.timeEntryStatusDone && !opts.some((o) => o.name === next.timeEntryStatusDone)) {
    next.timeEntryStatusDone = '';
  }
  return next;
}

