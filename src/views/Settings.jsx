import { useState } from 'react';
import { useStore } from '../store/useStore.js';

export default function Settings() {
  const apiKey = useStore((s) => s.apiKey);
  const projects = useStore((s) => s.projects);
  const alwaysOnTop = useStore((s) => s.alwaysOnTop);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const deleteProject = useStore((s) => s.deleteProject);
  const toggleAlwaysOnTop = useStore((s) => s.toggleAlwaysOnTop);
  const setView = useStore((s) => s.setView);
  const addToast = useStore((s) => s.addToast);
  const timerRunning = useStore((s) => s.timer.running);

  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);

  const firstLaunch = !apiKey || projects.length === 0;

  const handleSaveAndTestKey = async () => {
    const key = keyInput.trim();
    setTesting(true);
    try {
      await window.notionAPI.testConnection(key, null);
      await saveApiKey(key);
      addToast({ type: 'success', message: 'API key works and was saved.' });
    } catch (err) {
      addToast({ type: 'error', message: `Connection failed: ${err.message}` });
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
          title="Back"
        >
          ←
        </button>
        <h1 className="text-base font-semibold">Settings</h1>
      </div>

      {firstLaunch && (
        <div className="text-xs bg-blue-900/40 border border-blue-700 text-blue-200 rounded-md p-2">
          Add your Notion API key and at least one project to get started.
        </div>
      )}

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Notion API Key</label>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="secret_… or ntn_…"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm placeholder-zinc-600"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? 'Hide' : 'Show'}
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
          {testing ? 'Testing…' : 'Test connection & save'}
        </button>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Projects</label>
        <div className="flex flex-col gap-1">
          {projects.length === 0 && (
            <div className="text-xs text-zinc-600 italic py-1">No projects yet.</div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2"
            >
              <span className="text-sm truncate">{p.name}</span>
              <button
                onClick={() => deleteProject(p.id)}
                disabled={timerRunning}
                title={timerRunning ? 'Stop the timer first' : 'Delete project'}
                className="text-zinc-500 hover:text-red-400 disabled:opacity-40 ml-2"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAddProject(true)}
          className="mt-2 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
        >
          + Add project
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={alwaysOnTop}
          onChange={(e) => toggleAlwaysOnTop(e.target.checked)}
          className="accent-emerald-500"
        />
        Always on top
      </label>

      {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} />}
    </div>
  );
}

function AddProjectModal({ onClose }) {
  const addProject = useStore((s) => s.addProject);
  const addToast = useStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [tijdDbId, setTijdDbId] = useState('');
  const [deelDbId, setDeelDbId] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() && tijdDbId.trim() && deelDbId.trim();

  const handleSaveAndTest = async () => {
    setSaving(true);
    try {
      // Verify both databases are reachable with the saved API key before adding
      await window.notionAPI.testConnection(null, tijdDbId.trim());
      await window.notionAPI.testConnection(null, deelDbId.trim());
    } catch (err) {
      addToast({ type: 'error', message: `Database test failed: ${err.message}` });
      setSaving(false);
      return;
    }
    await addProject({
      id: crypto.randomUUID(),
      name: name.trim(),
      tijdsregistratiesDbId: tijdDbId.trim(),
      deelprojectenDbId: deelDbId.trim(),
    });
    addToast({ type: 'success', message: `Project "${name.trim()}" added.` });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Add Project</h2>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Tijdsregistraties DB ID</label>
          <input
            type="text"
            value={tijdDbId}
            onChange={(e) => setTijdDbId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs font-mono placeholder-zinc-600"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Deelprojecten DB ID</label>
          <input
            type="text"
            value={deelDbId}
            onChange={(e) => setDeelDbId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs font-mono placeholder-zinc-600"
          />
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndTest}
            disabled={!canSave || saving}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? 'Testing…' : 'Save & Test'}
          </button>
        </div>
      </div>
    </div>
  );
}
