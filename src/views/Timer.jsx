import { useStore } from '../store/useStore.js';
import { computeEndTime } from '../lib/rounding.js';
import { formatHHMM, formatElapsed } from '../lib/format.js';

export default function Timer() {
  const apiKey = useStore((s) => s.apiKey);
  const projects = useStore((s) => s.projects);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectProject = useStore((s) => s.selectProject);
  const deelprojecten = useStore((s) => s.deelprojecten);
  const deelprojectenLoading = useStore((s) => s.deelprojectenLoading);
  const selectedDeelprojectId = useStore((s) => s.selectedDeelprojectId);
  const setSelectedDeelprojectId = useStore((s) => s.setSelectedDeelprojectId);
  const description = useStore((s) => s.description);
  const setDescription = useStore((s) => s.setDescription);
  const timer = useStore((s) => s.timer);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const setView = useStore((s) => s.setView);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedDeelproject = deelprojecten.find((d) => d.id === selectedDeelprojectId);

  const settingsButton = (
    <div className="flex justify-end px-4 pb-3">
      <button
        onClick={() => setView('settings')}
        title="Settings"
        className="text-zinc-500 hover:text-zinc-200 text-xl leading-none transition-colors"
      >
        ⚙️
      </button>
    </div>
  );

  // ---- Running state ----
  if (timer.running) {
    // Recomputed on every tick render, so the projected end refreshes as time passes
    const projectedEnd = computeEndTime(timer.roundedStart);
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center px-6 pt-8 gap-1">
          <div className="text-sm font-semibold text-zinc-300 truncate max-w-full">
            {selectedProject?.name || '—'}
          </div>
          <div className="text-sm text-zinc-400 truncate max-w-full">
            {selectedDeelproject?.name || '—'}
          </div>
          {description.trim() && (
            <div className="text-xs text-zinc-500 italic truncate max-w-full">
              {description}
            </div>
          )}

          <div className="mt-8 text-5xl font-mono font-bold tabular-nums text-red-400">
            {formatElapsed(timer.elapsedSeconds)}
          </div>
          <div className="mt-2 text-sm text-zinc-400 tabular-nums">
            {formatHHMM(timer.roundedStart)} → {formatHHMM(projectedEnd)}
          </div>

          <button
            onClick={stopTimer}
            className="mt-10 w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 font-semibold text-lg transition-colors"
          >
            ⏹ STOP
          </button>
        </div>
        {settingsButton}
      </div>
    );
  }

  // ---- Idle state ----
  const canStart = !!apiKey && !!selectedDeelprojectId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col px-5 pt-5 gap-4">
        {!apiKey && (
          <div className="text-xs bg-amber-900/40 border border-amber-700 text-amber-200 rounded-md p-2">
            No Notion API key set.{' '}
            <button onClick={() => setView('settings')} className="underline font-semibold">
              Open Settings
            </button>
          </div>
        )}
        {apiKey && projects.length === 0 && (
          <div className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md p-2">
            Add a project in{' '}
            <button onClick={() => setView('settings')} className="underline font-semibold">
              Settings
            </button>{' '}
            to get started.
          </div>
        )}

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Project</label>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => selectProject(e.target.value || null)}
            disabled={projects.length === 0}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Deelproject</label>
          <select
            value={selectedDeelprojectId || ''}
            onChange={(e) => setSelectedDeelprojectId(e.target.value || null)}
            disabled={!selectedProjectId || deelprojectenLoading}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">
              {deelprojectenLoading ? 'Loading…' : 'Select…'}
            </option>
            {deelprojecten.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Bezig met…</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm placeholder-zinc-600"
          />
        </div>

        <button
          onClick={startTimer}
          disabled={!canStart}
          className="mt-2 w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 font-semibold text-lg transition-colors"
        >
          ▶ START
        </button>
      </div>
      {settingsButton}
    </div>
  );
}
