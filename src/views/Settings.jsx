import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { DEFAULT_PROPERTY_MAP } from '../lib/constants.js';
import { t } from '../lib/i18n.js';

// label/hint locale keys for each propertyMap field, in display order
const PROPERTY_FIELDS = [
  { key: 'tijdsTitleProp', label: 'labelTijdsTitleProp', hint: 'hintTijdsTitleProp' },
  { key: 'tijdsTijdProp', label: 'labelTijdsTijdProp', hint: 'hintTijdsTijdProp' },
  { key: 'tijdsStatusProp', label: 'labelTijdsStatusProp', hint: 'hintTijdsStatusProp' },
  { key: 'tijdsStatusRunning', label: 'labelTijdsStatusRunning', hint: 'hintTijdsStatusRunning' },
  { key: 'tijdsStatusDone', label: 'labelTijdsStatusDone', hint: 'hintTijdsStatusDone' },
  { key: 'tijdsRelationProp', label: 'labelTijdsRelationProp', hint: 'hintTijdsRelationProp' },
  { key: 'deelTitleProp', label: 'labelDeelTitleProp', hint: 'hintDeelTitleProp' },
];

export default function Settings() {
  const apiKey = useStore((s) => s.apiKey);
  const projects = useStore((s) => s.projects);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const roundingEnabled = useStore((s) => s.roundingEnabled);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const deleteProject = useStore((s) => s.deleteProject);
  const toggleAlwaysOnTop = useStore((s) => s.toggleAlwaysOnTop);
  const toggleRounding = useStore((s) => s.toggleRounding);
  const setView = useStore((s) => s.setView);
  const addToast = useStore((s) => s.addToast);
  const timerRunning = useStore((s) => s.timer.running);

  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const firstLaunch = !apiKey || projects.length === 0;

  const handleSaveAndTestKey = async () => {
    const key = keyInput.trim();
    setTesting(true);
    try {
      await window.notionAPI.testConnection(key, null);
      await saveApiKey(key);
      addToast({ type: 'success', message: t('toastApiKeySaved') });
    } catch (err) {
      addToast({ type: 'error', message: `${t('toastConnectionFailed')}: ${err.message}` });
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
        <label className="block text-xs text-zinc-400 mb-1">{t('labelProjects')}</label>
        <div className="flex flex-col gap-1">
          {projects.length === 0 && (
            <div className="text-xs text-zinc-600 italic py-1">{t('noProjectsYet')}</div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2"
            >
              <span className="text-sm truncate">{p.name}</span>
              <span className="flex items-center gap-2 ml-2 shrink-0">
                <button
                  onClick={() => setEditingProject(p)}
                  title={t('modalTitleEditProject')}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  ✏️
                </button>
                <button
                  onClick={() => deleteProject(p.id)}
                  disabled={timerRunning}
                  title={timerRunning ? t('titleDeleteProjectDisabled') : t('titleDeleteProject')}
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-40"
                >
                  🗑
                </button>
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAddProject(true)}
          className="mt-2 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
        >
          {t('btnAddProject')}
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

      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={roundingEnabled}
            onChange={(e) => toggleRounding(e.target.checked)}
            className="accent-emerald-500"
          />
          {t('labelRoundingEnabled')}
        </label>
        <p className="text-xs text-zinc-500 mt-1 ml-5">{t('roundingHint')}</p>
      </div>

      {showAddProject && <ProjectModal onClose={() => setShowAddProject(false)} />}
      {editingProject && (
        <ProjectModal project={editingProject} onClose={() => setEditingProject(null)} />
      )}
    </div>
  );
}

/** Add (no `project` prop) or edit (`project` provided) a project. */
function ProjectModal({ project, onClose }) {
  const addProject = useStore((s) => s.addProject);
  const updateProject = useStore((s) => s.updateProject);
  const addToast = useStore((s) => s.addToast);

  const [name, setName] = useState(project?.name || '');
  const [tijdDbId, setTijdDbId] = useState(project?.tijdsregistratiesDbId || '');
  const [deelDbId, setDeelDbId] = useState(project?.deelprojectenDbId || '');
  const [propertyMap, setPropertyMap] = useState({
    ...DEFAULT_PROPERTY_MAP,
    ...(project?.propertyMap || {}),
  });
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() && tijdDbId.trim() && deelDbId.trim();

  const setProp = (key, value) =>
    setPropertyMap((m) => ({ ...m, [key]: value }));

  const handleSaveAndTest = async () => {
    setSaving(true);
    try {
      // Verify both databases are reachable with the saved API key before saving
      await window.notionAPI.testConnection(null, tijdDbId.trim());
      await window.notionAPI.testConnection(null, deelDbId.trim());
    } catch (err) {
      addToast({ type: 'error', message: `${t('toastConnectionFailed')}: ${err.message}` });
      setSaving(false);
      return;
    }
    // Blank property names silently fall back to the defaults
    const cleanedMap = Object.fromEntries(
      Object.entries(DEFAULT_PROPERTY_MAP).map(([key, fallback]) => [
        key,
        (propertyMap[key] || '').trim() || fallback,
      ])
    );
    const saved = {
      id: project?.id || crypto.randomUUID(),
      name: name.trim(),
      tijdsregistratiesDbId: tijdDbId.trim(),
      deelprojectenDbId: deelDbId.trim(),
      propertyMap: cleanedMap,
    };
    if (project) {
      await updateProject(saved);
    } else {
      await addProject(saved);
      addToast({ type: 'success', message: t('toastProjectAdded').replace('{name}', saved.name) });
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full max-h-full overflow-y-auto flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {project ? t('modalTitleEditProject') : t('modalTitleAddProject')}
        </h2>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('labelProjectName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('labelTijdsregistratiesDbId')}</label>
          <input
            type="text"
            value={tijdDbId}
            onChange={(e) => setTijdDbId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs font-mono placeholder-zinc-600"
          />
          <p className="text-xs text-zinc-500 mt-1">{t('hintTijdsregistratiesDbId')}</p>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('labelDeelprojectenDbId')}</label>
          <input
            type="text"
            value={deelDbId}
            onChange={(e) => setDeelDbId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs font-mono placeholder-zinc-600"
          />
          <p className="text-xs text-zinc-500 mt-1">{t('hintDeelprojectenDbId')}</p>
        </div>

        <details className="border border-zinc-700 rounded-md">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-zinc-300 select-none">
            {t('sectionPropertyMapping')}
          </summary>
          <div className="px-3 pb-3 flex flex-col gap-3">
            <p className="text-xs text-zinc-500">{t('hintPropertyMapping')}</p>
            {PROPERTY_FIELDS.map(({ key, label, hint }) => (
              <div key={key}>
                <label className="block text-xs text-zinc-400 mb-1">{t(label)}</label>
                <input
                  type="text"
                  value={propertyMap[key]}
                  onChange={(e) => setProp(key, e.target.value)}
                  placeholder={DEFAULT_PROPERTY_MAP[key]}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs placeholder-zinc-600"
                />
                <p className="text-xs text-zinc-600 mt-1">{t(hint)}</p>
              </div>
            ))}
          </div>
        </details>

        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
          >
            {t('btnCancel')}
          </button>
          <button
            onClick={handleSaveAndTest}
            disabled={!canSave || saving}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? t('btnSaving') : t('btnSaveAndTest')}
          </button>
        </div>
      </div>
    </div>
  );
}
