import { useStore } from '../store/useStore.js';
import { computeEndTime } from '../lib/rounding.js';
import { formatHHMM, formatElapsed } from '../lib/format.js';
import { t } from '../lib/i18n.js';

export default function Timer() {
  const apiKey = useStore((s) => s.apiKey);
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useStore((s) => s.selectWorkspace);
  const projects = useStore((s) => s.projects);
  const projectsLoading = useStore((s) => s.projectsLoading);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useStore((s) => s.setSelectedProjectId);
  const description = useStore((s) => s.description);
  const setDescription = useStore((s) => s.setDescription);
  const timer = useStore((s) => s.timer);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const getRoundingEnabled = useStore((s) => s.getRoundingEnabled);
  const setView = useStore((s) => s.setView);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const settingsButton = (
    <div className="flex justify-end px-4 pb-3">
      <button
        onClick={() => setView('settings')}
        title={t('titleSettings')}
        className="text-zinc-500 hover:text-zinc-200 text-xl leading-none transition-colors"
      >
        ⚙️
      </button>
    </div>
  );

  // ---- Running state ----
  if (timer.running) {
    // Recomputed on every tick render, so the projected end refreshes as time
    // passes. Without rounding the end is simply "now".
    const projectedEnd = getRoundingEnabled() ? computeEndTime(timer.roundedStart) : new Date();
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center px-6 pt-8 gap-1">
          <div className="text-sm font-semibold text-zinc-300 truncate max-w-full">
            {selectedWorkspace?.name || '—'}
          </div>
          <div className="text-sm text-zinc-400 truncate max-w-full">
            {selectedProject?.name || '—'}
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
            {t('btnStop')}
          </button>
        </div>
        {settingsButton}
      </div>
    );
  }

  // ---- Idle state ----
  const canStart = !!apiKey && !!selectedProjectId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col px-5 pt-5 gap-4">
        {!apiKey && (
          <div className="text-xs bg-amber-900/40 border border-amber-700 text-amber-200 rounded-md p-2">
            {t('warnNoApiKey')}{' '}
            <button onClick={() => setView('settings')} className="underline font-semibold">
              {t('warnNoApiKeyLink')}
            </button>
          </div>
        )}
        {apiKey && workspaces.length === 0 && (
          <div className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md p-2">
            {t('warnNoWorkspaces')}{' '}
            <button onClick={() => setView('settings')} className="underline font-semibold">
              {t('warnNoWorkspacesLink')}
            </button>{' '}
            {t('warnNoWorkspacesSuffix')}
          </div>
        )}

        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('labelWorkspace')}</label>
          <select
            value={selectedWorkspaceId || ''}
            onChange={(e) => selectWorkspace(e.target.value || null)}
            disabled={workspaces.length === 0}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">{t('placeholderSelectWorkspace')}</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('labelProject')}</label>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
            disabled={!selectedWorkspaceId || projectsLoading}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">
              {projectsLoading ? t('placeholderLoading') : t('placeholderSelectProject')}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('labelDescription')}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('placeholderDescription')}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm placeholder-zinc-600"
          />
        </div>

        <button
          onClick={startTimer}
          disabled={!canStart}
          className="mt-2 w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 font-semibold text-lg transition-colors"
        >
          {t('btnStart')}
        </button>
      </div>
      {settingsButton}
    </div>
  );
}
