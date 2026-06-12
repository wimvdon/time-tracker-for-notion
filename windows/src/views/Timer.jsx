import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { computeEndTime } from '../lib/rounding.js';
import { formatHHMM, formatElapsed } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { buildPropertyValue } from '../lib/notionValues.js';
import ExtraFieldInput from '../components/ExtraFieldInput.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';

/** Combines the date of `base` with an "HH:MM" string from a time input. */
function timeOnDate(base, hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const result = new Date(base);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export default function Timer() {
  const apiKey = useStore((s) => s.apiKey);
  const workspaces = useStore((s) => s.workspaces);
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useStore((s) => s.selectWorkspace);
  const description = useStore((s) => s.description);
  const setDescription = useStore((s) => s.setDescription);
  const extraFieldDefs = useStore((s) => s.extraFieldDefs);
  const extrasLoading = useStore((s) => s.extrasLoading);
  const extraValues = useStore((s) => s.extraValues);
  const setExtraValue = useStore((s) => s.setExtraValue);
  const timer = useStore((s) => s.timer);
  const startTimer = useStore((s) => s.startTimer);
  const setView = useStore((s) => s.setView);
  const recoveredTimer = useStore((s) => s.recoveredTimer);
  const runningTimers = useStore((s) => s.runningTimers);
  const runningTimersLoading = useStore((s) => s.runningTimersLoading);
  const loadRunningTimers = useStore((s) => s.loadRunningTimers);
  const loadRunningTimer = useStore((s) => s.loadRunningTimer);
  const stopOtherRunningTimer = useStore((s) => s.stopOtherRunningTimer);
  const suspendActiveToNewTimer = useStore((s) => s.suspendActiveToNewTimer);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  // Reload running timers on every state transition (except during crash recovery)
  const timerRunning = timer.running;
  const hasRecovery = !!recoveredTimer;
  useEffect(() => {
    if (!hasRecovery) {
      loadRunningTimers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, hasRecovery]);

  const settingsButton = (
    <div className="flex justify-end gap-2 px-4 pb-3">
      {timer.running && (
        <button
          onClick={suspendActiveToNewTimer}
          title={t('titleStartNewTimer')}
          className="text-zinc-500 hover:text-zinc-200 text-xl leading-none transition-colors"
        >
          ➕
        </button>
      )}
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
    return (
      <RunningView
        workspaceName={selectedWorkspace?.name || '—'}
        settingsButton={settingsButton}
        runningTimers={runningTimers}
        runningTimersLoading={runningTimersLoading}
        activePageId={timer.notionPageId}
        onLoadRunningTimer={loadRunningTimer}
        onStopOtherRunningTimer={stopOtherRunningTimer}
        onRefreshTimers={loadRunningTimers}
      />
    );
  }

  // ---- Idle state ----
  const requiredFieldsFilled = extraFieldDefs
    .filter((def) => def.required)
    .every((def) => buildPropertyValue(def.type, extraValues[def.name]) !== null);
  const canStart = !!apiKey && !!selectedWorkspaceId && !extrasLoading && requiredFieldsFilled;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col px-5 pt-5 gap-4 overflow-y-auto">
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
          <SearchableSelect
            value={selectedWorkspaceId || ''}
            onChange={(v) => selectWorkspace(v || null)}
            options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            placeholder={t('placeholderSelectWorkspace')}
            disabled={workspaces.length === 0}
            triggerClass="bg-zinc-800"
            className="w-full"
          />
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

        {selectedWorkspaceId && extrasLoading && (
          <div className="text-xs text-zinc-500">{t('placeholderLoading')}</div>
        )}
        {selectedWorkspaceId &&
          extraFieldDefs.map((def) => (
            <ExtraFieldInput
              key={def.name}
              def={def}
              value={extraValues[def.name]}
              onChange={(value) => setExtraValue(def.name, value)}
            />
          ))}

        <button
          onClick={startTimer}
          disabled={!canStart}
          className="mt-2 w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 font-semibold text-lg transition-colors"
        >
          {t('btnStart')}
        </button>

        <OtherRunningTimers
          timers={runningTimers}
          loading={runningTimersLoading}
          activePageId={null}
          onLoad={loadRunningTimer}
          onStop={stopOtherRunningTimer}
          onRefresh={loadRunningTimers}
        />
      </div>
      {settingsButton}
    </div>
  );
}

function RunningView({ workspaceName, settingsButton, runningTimers, runningTimersLoading, activePageId, onLoadRunningTimer, onStopOtherRunningTimer, onRefreshTimers }) {
  const timer = useStore((s) => s.timer);
  const description = useStore((s) => s.description);
  const stopTimer = useStore((s) => s.stopTimer);
  const updateStartTime = useStore((s) => s.updateStartTime);
  const getRoundingMinutes = useStore((s) => s.getRoundingMinutes);

  const [startInput, setStartInput] = useState(() => formatHHMM(timer.roundedStart));
  const [endInput, setEndInput] = useState('');

  useEffect(() => {
    setStartInput(formatHHMM(timer.roundedStart));
  }, [timer.startISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitStart = () => {
    if (!startInput) {
      setStartInput(formatHHMM(timer.roundedStart));
      return;
    }
    updateStartTime(timeOnDate(timer.rawStart, startInput));
  };

  const commitEnd = () => {
    if (!endInput) return;
    stopTimer(timeOnDate(timer.rawStart, endInput));
  };

  const blurOnEnter = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const rm = getRoundingMinutes();
  const projectedEnd = rm > 0 ? computeEndTime(timer.roundedStart, new Date(), rm) : new Date();

  const timeInputClass =
    'w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm tabular-nums text-center';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center px-6 pt-6 gap-1 overflow-y-auto">
        <div className="text-sm font-semibold text-zinc-300 truncate max-w-full">
          {workspaceName}
        </div>
        {description.trim() && (
          <div className="text-xs text-zinc-500 italic truncate max-w-full">{description}</div>
        )}

        <div className="mt-6 text-5xl font-mono font-bold tabular-nums text-red-400">
          {formatElapsed(timer.elapsedSeconds)}
        </div>
        <div className="mt-2 text-sm text-zinc-400 tabular-nums">
          {formatHHMM(timer.roundedStart)} → {formatHHMM(projectedEnd)}
        </div>

        <div className="mt-5 w-full grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('labelStartTime')}</label>
            <input
              type="time"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              onBlur={commitStart}
              onKeyDown={blurOnEnter}
              className={timeInputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('labelEndTime')}</label>
            <input
              type="time"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              onBlur={commitEnd}
              onKeyDown={blurOnEnter}
              className={timeInputClass}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-600 w-full">{t('hintManualEnd')}</p>

        <button
          onClick={() => stopTimer()}
          className="mt-4 w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 font-semibold text-lg transition-colors"
        >
          {t('btnStop')}
        </button>

        <OtherRunningTimers
          timers={runningTimers}
          loading={runningTimersLoading}
          activePageId={activePageId}
          onLoad={onLoadRunningTimer}
          onStop={onStopOtherRunningTimer}
          onRefresh={onRefreshTimers}
        />
      </div>
      {settingsButton}
    </div>
  );
}

function OtherRunningTimers({ timers, loading, activePageId, onLoad, onStop, onRefresh }) {
  if (!timers.length && !loading) return null;
  return (
    <div className="w-full mt-2 pt-3 border-t border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500">{t('runningTimersHeading')}</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          title={t('titleRefreshTimers')}
          className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 text-sm leading-none transition-colors"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>
      {timers.map((rt) => {
        const isActive = rt.pageId === activePageId;
        return (
          <div
            key={rt.pageId}
            onClick={isActive ? undefined : () => onLoad(rt)}
            className={`flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-md mb-1 transition-colors ${isActive ? 'opacity-60' : 'hover:bg-zinc-700 cursor-pointer'}`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate text-zinc-200">{rt.title}</div>
              <div className="text-xs text-zinc-500">{rt.workspaceName}</div>
            </div>
            {!isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onStop(rt); }}
                title={t('titleStopRunningTimer')}
                className="text-zinc-500 hover:text-red-400 text-base transition-colors shrink-0 leading-none"
              >
                ⏹
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
