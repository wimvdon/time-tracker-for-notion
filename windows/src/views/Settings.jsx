import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { propertiesByType, statusOptions } from '../lib/schema.js';
import { WRITABLE_EXTRA_TYPES } from '../lib/notionValues.js';
import { t } from '../lib/i18n.js';
import { errorMessage } from '../lib/errors.js';
import SearchableSelect from '../components/SearchableSelect.jsx';

export default function Settings() {
  const apiKey = useStore((s) => s.apiKey);
  const workspaces = useStore((s) => s.workspaces);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const theme = useStore((s) => s.theme);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const deleteWorkspace = useStore((s) => s.deleteWorkspace);
  const moveWorkspace = useStore((s) => s.moveWorkspace);
  const toggleAlwaysOnTop = useStore((s) => s.toggleAlwaysOnTop);
  const setTheme = useStore((s) => s.setTheme);
  const setView = useStore((s) => s.setView);
  const addToast = useStore((s) => s.addToast);
  const timerRunning = useStore((s) => s.timer.running);

  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrExpanded, setQrExpanded] = useState(false);
  const qrDismissTimer = useRef(null);

  const firstLaunch = !apiKey || workspaces.length === 0;

  const generateQr = async () => {
    const payload = JSON.stringify({ apiKey, workspaces, theme });
    try {
      const QRCode = (await import('qrcode')).default;
      const url = await QRCode.toDataURL(payload, { width: 256, margin: 2 });
      setQrDataUrl(url);
      setQrExpanded(true);
      if (qrDismissTimer.current) clearTimeout(qrDismissTimer.current);
      qrDismissTimer.current = setTimeout(() => {
        setQrExpanded(false);
        setQrDataUrl(null);
      }, 30_000);
    } catch (err) {
      addToast({ type: 'error', message: `QR: ${errorMessage(err)}` });
    }
  };

  const dismissQr = () => {
    if (qrDismissTimer.current) clearTimeout(qrDismissTimer.current);
    setQrExpanded(false);
    setQrDataUrl(null);
  };

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
          {workspaces.map((w, i) => (
            <div
              key={w.id}
              className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2"
            >
              <span className="text-sm truncate">{w.name}</span>
              <span className="flex items-center gap-1 ml-2 shrink-0">
                <button
                  onClick={() => moveWorkspace(w.id, 'up')}
                  disabled={i === 0}
                  title={t('titleMoveUp')}
                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30 px-0.5"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveWorkspace(w.id, 'down')}
                  disabled={i === workspaces.length - 1}
                  title={t('titleMoveDown')}
                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30 px-0.5"
                >
                  ↓
                </button>
                <button
                  onClick={() => setEditingWorkspace(w)}
                  title={t('modalTitleEditWorkspace')}
                  className="text-zinc-500 hover:text-zinc-200 ml-1"
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

      {/* Theme */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelTheme')}</label>
        <div className="flex gap-3">
          {['auto', 'light', 'dark'].map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={opt}
                checked={theme === opt}
                onChange={() => setTheme(opt)}
                className="accent-emerald-500"
              />
              {t(`theme_${opt}`)}
            </label>
          ))}
        </div>
      </div>

      {/* QR code export */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">{t('labelQrExport')}</label>
          {qrExpanded ? (
            <button onClick={dismissQr} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">✕ {t('btnClose')}</button>
          ) : (
            <button
              onClick={generateQr}
              disabled={!apiKey}
              className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded transition-colors"
            >
              {t('btnShowQr')}
            </button>
          )}
        </div>
        {qrExpanded && qrDataUrl && (
          <div className="mt-2">
            <p className="text-xs text-amber-400 mb-2">⚠️ {t('qrSecurityWarning')}</p>
            <img src={qrDataUrl} alt="QR code" className="w-40 h-40 rounded border border-zinc-600" />
            <p className="text-xs text-zinc-600 mt-1">{t('qrAutoDismiss')}</p>
          </div>
        )}
      </div>

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
  timeEntryDateProp: '',
  timeEntryStatusProp: '',
  timeEntryStatusRunning: '',
  timeEntryStatusDone: '',
};

const MAX_EXTRA_PROPS = 5;

/** Add (no `workspace` prop) or edit (`workspace` provided) a workspace. */
function WorkspaceModal({ workspace, onClose }) {
  const addWorkspace = useStore((s) => s.addWorkspace);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const addToast = useStore((s) => s.addToast);

  const [name, setName] = useState(workspace?.name || '');
  const [timeEntriesDbId, setTimeEntriesDbId] = useState(workspace?.timeEntriesDbId || '');
  const [roundingMinutes, setRoundingMinutes] = useState(
    workspace?.roundingMinutes ?? (workspace?.roundingEnabled === false ? 0 : 15)
  );
  const [sel, setSel] = useState({ ...EMPTY_SELECTION, ...(workspace?.propertyMap || {}) });
  const [extraProps, setExtraProps] = useState(
    (workspace?.extraProps || []).map((ep) =>
      typeof ep === 'string' ? { propName: ep, defaultValue: null, required: false } : ep
    )
  );

  // Database list — fetched once per modal lifetime (Retry/Refresh re-fetches)
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
          (ep) =>
            !ep.propName ||
            (schema[ep.propName] && WRITABLE_EXTRA_TYPES.includes(schema[ep.propName].type))
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

  const teDateOpts = teSchema.schema ? propertiesByType(teSchema.schema, 'date') : [];
  const teStatusOpts = teSchema.schema ? propertiesByType(teSchema.schema, 'status') : [];
  const teStatusOptions = teSchema.schema
    ? statusOptions(teSchema.schema, sel.timeEntryStatusProp)
    : [];

  // Candidates for an extra-field row: writable types, minus the managed
  // properties and the names already chosen in other rows
  const extraCandidates = (rowIndex) => {
    if (!teSchema.schema) return [];
    const taken = new Set([
      sel.timeEntryDateProp,
      sel.timeEntryStatusProp,
      ...extraProps
        .filter((_, i) => i !== rowIndex)
        .map((ep) => ep.propName)
        .filter(Boolean),
    ]);
    return Object.entries(teSchema.schema)
      .filter(([propName, prop]) => WRITABLE_EXTRA_TYPES.includes(prop.type) && !taken.has(propName))
      .map(([propName, prop]) => ({ name: propName, type: prop.type }));
  };

  const complete =
    !!name.trim() &&
    !!timeEntriesDbId &&
    !!teSchema.schema &&
    !!sel.timeEntryDateProp &&
    !!sel.timeEntryStatusProp &&
    !!sel.timeEntryStatusRunning &&
    !!sel.timeEntryStatusDone;

  const handleSave = async () => {
    if (!complete) return;
    const relPropName = propertiesByType(teSchema.schema, 'relation')[0]?.name ?? '';
    const titlePropName = propertiesByType(teSchema.schema, 'title')[0]?.name ?? '';
    const projectsDbId = teSchema.schema[relPropName]?.relation?.database_id ?? '';
    const saved = {
      id: workspace?.id || crypto.randomUUID(),
      name: name.trim(),
      timeEntriesDbId,
      projectsDbId,
      roundingMinutes,
      propertyMap: {
        timeEntryTitleProp: titlePropName,
        timeEntryDateProp: sel.timeEntryDateProp,
        timeEntryStatusProp: sel.timeEntryStatusProp,
        timeEntryStatusRunning: sel.timeEntryStatusRunning,
        timeEntryStatusDone: sel.timeEntryStatusDone,
        timeEntryRelationProp: relPropName,
      },
      extraProps: extraProps.filter((ep) => !!ep.propName),
    };
    if (workspace) {
      await updateWorkspace(saved);
    } else {
      await addWorkspace(saved);
      addToast({ type: 'success', message: t('toastProjectAdded').replace('{name}', saved.name) });
    }
    onClose();
  };

  const dbOptions = dbs.items.map((db) => ({ value: db.id, label: db.name }));

  const roundingOptions = [
    { value: '0', label: t('roundingOff') },
    { value: '5', label: t('rounding5') },
    { value: '10', label: t('rounding10') },
    { value: '15', label: t('rounding15') },
  ];

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

        {/* Section B — Time Entries database */}
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
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-zinc-400">{t('labelTimeEntriesDb')}</label>
            <button
              onClick={loadDatabases}
              disabled={dbs.loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50 flex items-center gap-1"
              title={t('btnRefreshDatabases')}
            >
              ↻ {t('btnRefreshDatabases')}
            </button>
          </div>
          <SearchableSelect
            value={timeEntriesDbId}
            onChange={setTimeEntriesDbId}
            options={dbOptions}
            placeholder={dbs.loading ? t('loadingDatabases') : t('placeholderSelectDatabase')}
            disabled={dbs.loading || !!dbs.error}
            loading={dbs.loading}
            className="w-full"
          />
          {t('hintTimeEntriesDb') && (
            <p className="text-xs text-zinc-600 mt-1">{t('hintTimeEntriesDb')}</p>
          )}
        </div>

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
          </div>
        )}

        {/* Section D — Extra fields (optional, max 5) */}
        {timeEntriesDbId && teSchema.schema && (
          <div className="flex flex-col gap-2 border-t border-zinc-700 pt-3">
            <p className="text-xs font-semibold text-zinc-300">{t('sectionExtraFields')}</p>
            <p className="text-xs text-zinc-500">{t('hintExtraFields')}</p>
            {extraProps.map((ep, i) => {
              const propDef = teSchema.schema?.[ep.propName];
              const propOptions = propDef
                ? (propDef[propDef.type]?.options ?? []).map((o) => ({ name: o.name }))
                : [];
              const propRelDbId =
                propDef?.type === 'relation' ? (propDef.relation?.database_id ?? null) : null;
              const candidateOptions = extraCandidates(i).map((c) => ({
                value: c.name,
                label: `${c.name} (${c.type})`,
              }));
              return (
                <div key={i} className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <SearchableSelect
                      value={ep.propName}
                      onChange={(v) =>
                        setExtraProps((prev) =>
                          prev.map((p, j) =>
                            j === i ? { propName: v, defaultValue: null, required: p.required } : p
                          )
                        )
                      }
                      options={candidateOptions}
                      placeholder={t('placeholderSelectField')}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-1 text-xs text-zinc-400 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!ep.required}
                        onChange={(e) =>
                          setExtraProps((prev) =>
                            prev.map((p, j) => (j === i ? { ...p, required: e.target.checked } : p))
                          )
                        }
                        className="accent-emerald-500"
                      />
                      {t('labelRequiredField')}
                    </label>
                    <button
                      onClick={() => setExtraProps((prev) => prev.filter((_, j) => j !== i))}
                      title={t('titleRemoveExtraField')}
                      className="text-zinc-500 hover:text-red-400 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                  {ep.propName && propDef && (
                    <DefaultValueInput
                      type={propDef.type}
                      options={propOptions}
                      value={ep.defaultValue}
                      relDbId={propRelDbId}
                      onChange={(v) =>
                        setExtraProps((prev) =>
                          prev.map((p, j) => (j === i ? { ...p, defaultValue: v } : p))
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
            {extraProps.length < MAX_EXTRA_PROPS && (
              <button
                onClick={() => setExtraProps((prev) => [...prev, { propName: '', defaultValue: null, required: false }])}
                className="self-start px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-xs"
              >
                {t('btnAddExtraField')}
              </button>
            )}
          </div>
        )}

        {/* Section E — Rounding */}
        <div className="border-t border-zinc-700 pt-3">
          <label className="block text-xs text-zinc-400 mb-1">{t('labelWorkspaceRounding')}</label>
          <SearchableSelect
            value={String(roundingMinutes)}
            onChange={(v) => setRoundingMinutes(Number(v))}
            options={roundingOptions}
            allowClear={false}
            className="w-full"
          />
          <p className="text-xs text-zinc-500 mt-1">{t('workspaceRoundingHint')}</p>
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

/** Searchable dropdown over a list of { name } options, with loading and empty states. */
function PropSelect({ label, hint, loading, options, value, onChange }) {
  const empty = !loading && options.length === 0;
  const selectOptions = options.map((o) => ({ value: o.name, label: o.name }));
  return (
    <Field label={label} hint={hint}>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={selectOptions}
        placeholder={loading ? t('loadingProperties') : t('placeholderSelect')}
        disabled={loading || empty}
        loading={loading}
        className="w-full"
      />
      {empty && <p className="text-xs text-red-400 mt-1">{t('noPropertiesOfType')}</p>}
    </Field>
  );
}

/** Inline default-value editor rendered below the field-name selector. */
function DefaultValueInput({ type, options, value, onChange, relDbId }) {
  const [relPages, setRelPages] = useState([]);
  const [relLoading, setRelLoading] = useState(false);

  useEffect(() => {
    if (type !== 'relation' || !relDbId) return;
    setRelLoading(true);
    window.notionAPI
      .fetchDatabasePages(relDbId)
      .then((pages) => { setRelPages(pages); setRelLoading(false); })
      .catch(() => setRelLoading(false));
  }, [type, relDbId]);

  const containerClass = 'ml-2 mt-1 border-l-2 border-zinc-700 pl-2';
  const inputClass =
    'bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-sm w-full';

  if (['people', 'files'].includes(type)) {
    return (
      <div className={containerClass}>
        <p className="text-xs text-zinc-500">{t('defaultValueUnsupported')}</p>
      </div>
    );
  }

  if (type === 'relation') {
    const relOptions = relPages.map((p) => ({ value: p.id, label: p.name }));
    return (
      <div className={containerClass}>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelDefaultValue')}</label>
        <SearchableSelect
          value={value ?? ''}
          onChange={(v) => onChange(v || null)}
          options={relOptions}
          placeholder={relLoading ? t('placeholderLoading') : t('placeholderSelect')}
          disabled={relLoading}
          loading={relLoading}
          className="w-full"
        />
      </div>
    );
  }

  if (type === 'checkbox') {
    return (
      <div className={containerClass}>
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-emerald-500"
          />
          {t('labelDefaultValue')}
        </label>
      </div>
    );
  }

  if (type === 'select' || type === 'status') {
    const selectOptions = options.map((o) => ({ value: o.name, label: o.name }));
    return (
      <div className={containerClass}>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelDefaultValue')}</label>
        <SearchableSelect
          value={value ?? ''}
          onChange={(v) => onChange(v || null)}
          options={selectOptions}
          placeholder={t('placeholderSelect')}
          className="w-full"
        />
      </div>
    );
  }

  if (type === 'multi_select') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className={containerClass}>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelDefaultValue')}</label>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label key={o.name} className="flex items-center gap-1 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(o.name)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, o.name]
                    : selected.filter((n) => n !== o.name);
                  onChange(next.length ? next : null);
                }}
                className="accent-emerald-500"
              />
              {o.name}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className={containerClass}>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelDefaultValue')}</label>
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={inputClass}
        />
      </div>
    );
  }

  if (type === 'date') {
    return (
      <div className={containerClass}>
        <label className="block text-xs text-zinc-400 mb-1">{t('labelDefaultValue')}</label>
        <input
          type="datetime-local"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
        />
      </div>
    );
  }

  // rich_text, url, email, phone_number
  return (
    <div className={containerClass}>
      <label className="block text-xs text-zinc-400 mb-1">{t('labelDefaultValue')}</label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      />
    </div>
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
  pick('timeEntryDateProp', 'date');
  pick('timeEntryStatusProp', 'status');
  const opts = statusOptions(schema, next.timeEntryStatusProp);
  if (next.timeEntryStatusRunning && !opts.some((o) => o.name === next.timeEntryStatusRunning)) {
    next.timeEntryStatusRunning = '';
  }
  if (next.timeEntryStatusDone && !opts.some((o) => o.name === next.timeEntryStatusDone)) {
    next.timeEntryStatusDone = '';
  }
  return next;
}
