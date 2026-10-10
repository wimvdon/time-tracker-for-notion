import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { formatHHMM, formatElapsed, formatDateStr, formatTimeStr, parseTimeStr } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import { buildPropertyValue } from '../lib/notionValues.js';
import { getWorkspaceAccentColor, getWorkspaceSolidFillColor } from '../lib/color.js';
import { useIsDarkTheme } from '../hooks/useIsDarkTheme.js';
import ExtraFieldInput from '../components/ExtraFieldInput.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import {
  ArrowClockwise20Regular,
  Add20Regular,
  Settings20Regular,
  Play20Regular,
  Edit20Regular,
  Bookmark20Regular,
  ArrowUp20Regular,
  ArrowDown20Regular,
  Delete20Regular,
  Stop20Regular,
  Open20Regular,
  Info20Regular
} from '@fluentui/react-icons';

/** Combines the date of `base` with an "HH:MM" string from a time input. */
function timeOnDate(base, hhmm) {
  const { hours, minutes } = parseTimeStr(hhmm);
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
  const isStarting = useStore((s) => s.isStarting);
  const setView = useStore((s) => s.setView);
  const runningTimers = useStore((s) => s.runningTimers);
  const runningTimersLoading = useStore((s) => s.runningTimersLoading);
  const loadRunningTimers = useStore((s) => s.loadRunningTimers);
  const loadRunningTimer = useStore((s) => s.loadRunningTimer);
  const stopOtherRunningTimer = useStore((s) => s.stopOtherRunningTimer);
  const recentEntries = useStore((s) => s.recentEntries);
  const recentEntriesLoading = useStore((s) => s.recentEntriesLoading);
  const loadRecentEntries = useStore((s) => s.loadRecentEntries);
  const startFromRecentEntry = useStore((s) => s.startFromRecentEntry);
  const deleteConfirm = useStore((s) => s.deleteConfirm);
  const confirmDelete = useStore((s) => s.confirmDelete);
  const cancelDelete = useStore((s) => s.cancelDelete);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const openNotionPage = useStore((s) => s.openNotionPage);
  const refreshAll = useStore((s) => s.refreshAll);

  const applyPreset = useStore((s) => s.applyPreset);
  const deletedPageInfo = useStore((s) => s.deletedPageInfo);
  const dismissDeletedPage = useStore((s) => s.dismissDeletedPage);

  const showAlreadyRunningWarning = useStore((s) => s.showAlreadyRunningWarning);
  const onConfirmAlreadyRunning = useStore((s) => s.onConfirmAlreadyRunning);
  const onCancelAlreadyRunning = useStore((s) => s.onCancelAlreadyRunning);
  const onPlusButtonClicked = useStore((s) => s.onPlusButtonClicked);
  const saveCurrentAsPreset = useStore((s) => s.saveCurrentAsPreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const movePresetUp = useStore((s) => s.movePresetUp);
  const movePresetDown = useStore((s) => s.movePresetDown);

  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [showManagePresetsModal, setShowManagePresetsModal] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const isDarkTheme = useIsDarkTheme();

  // Reload running timers and recent entries on every state transition
  const timerRunning = timer.running;
  useEffect(() => {
    loadRunningTimers();
    loadRecentEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const settingsButton = (
    <div className="flex justify-end gap-2 px-4 pt-3 pb-3 border-t border-zinc-800">
      <button
        onClick={refreshAll}
        title={t('btnRefreshAll')}
        className="text-zinc-500 hover:text-zinc-200 transition-colors flex items-center justify-center"
      >
        <ArrowClockwise20Regular className={`w-5 h-5 ${runningTimersLoading || recentEntriesLoading ? 'animate-spin' : ''}`} />
      </button>
      {timer.running && (
        <button
          onClick={onPlusButtonClicked}
          title={t('titleStartNewTimer')}
          className="text-zinc-500 hover:text-zinc-200 transition-colors flex items-center justify-center"
        >
          <Add20Regular className="w-5 h-5" />
        </button>
      )}
      <button
        onClick={() => setView('settings')}
        title={t('titleSettings')}
        className="text-zinc-500 hover:text-zinc-200 transition-colors flex items-center justify-center"
      >
        <Settings20Regular className="w-5 h-5" />
      </button>
    </div>
  );

  // ---- Running state ----
  let content;
  if (timer.running) {
    content = (
      <RunningView
        workspaceName={selectedWorkspace?.name || '–'}
        workspaceColor={selectedWorkspace?.color?.trim() || null}
        settingsButton={settingsButton}
        runningTimers={runningTimers}
        runningTimersLoading={runningTimersLoading}
        activePageId={timer.notionPageId}
        recentEntries={recentEntries}
        recentEntriesLoading={recentEntriesLoading}
        deleteConfirm={deleteConfirm}
        onLoadRunningTimer={loadRunningTimer}
        onStopOtherRunningTimer={stopOtherRunningTimer}
        onConfirmDelete={confirmDelete}
        onCancelDelete={cancelDelete}
        onDeleteEntry={deleteEntry}
        onOpenUrl={openNotionPage}
        onApplyPreset={applyPreset}
        onStartFromRecentEntry={startFromRecentEntry}
        onManagePresetsClick={() => setShowManagePresetsModal(true)}
      />
    );
  } else {
    // ---- Idle state ----
    const canStart = !!apiKey && !!selectedWorkspaceId && !extrasLoading && !isStarting;
    // Like required extra fields, a required description is enforced when the
    // timer is stopped — starting stays a single click.
    const descriptionRequired = !!selectedWorkspace?.descriptionRequired;
    const descriptionMissing = descriptionRequired && !description.trim();

    content = (
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

          <PresetChips
            workspaces={workspaces}
            apiKey={apiKey}
            onApplyPreset={applyPreset}
            onManageClick={() => setShowManagePresetsModal(true)}
            className="mb-2"
          />

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
            <label className={`block text-xs mb-1 ${descriptionMissing ? 'text-red-400' : 'text-zinc-400'}`}>
              {t('labelDescription')}
              {descriptionRequired && ' *'}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('placeholderDescription')}
              className={`w-full bg-zinc-800 border rounded-md px-3 py-2 text-sm placeholder-zinc-600 ${
                descriptionMissing ? 'border-red-500' : 'border-zinc-700'
              }`}
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
                error={def.required && buildPropertyValue(def.type, extraValues[def.name]) === null}
                onChange={(value) => setExtraValue(def.name, value)}
              />
            ))}

          <div className="flex gap-2 items-stretch mt-2">
            <button
              onClick={startTimer}
              disabled={!canStart || isStarting}
              className={`flex-1 py-3 rounded-lg font-semibold text-lg transition-colors flex items-center justify-center ${
                selectedWorkspace?.color
                  ? 'text-white hover:brightness-110 active:brightness-90 disabled:bg-zinc-800 disabled:text-zinc-600'
                  : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600'
              }`}
              style={
                selectedWorkspace?.color && canStart && !isStarting
                  ? { backgroundColor: getWorkspaceSolidFillColor(selectedWorkspace.color) }
                  : undefined
              }
            >
              {isStarting ? (
                <span className="animate-spin inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                t('btnStart')
              )}
            </button>
            
            <button
              onClick={() => setShowSavePresetModal(true)}
              disabled={!selectedWorkspaceId || isStarting}
              title={t('dialogSavePresetTitle')}
              className="px-3.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-lg text-lg text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Bookmark20Regular className="w-5 h-5" />
            </button>
          </div>

          <OtherRunningTimers
            timers={runningTimers}
            loading={runningTimersLoading}
            activePageId={null}
            onLoad={loadRunningTimer}
            onStop={stopOtherRunningTimer}
            onDelete={(rt) => confirmDelete(rt, 'running')}
            onOpenUrl={openNotionPage}
          />
          <RecentEntries
            entries={recentEntries}
            loading={recentEntriesLoading}
            workspaces={workspaces}
            onDelete={(entry) => confirmDelete(entry, 'recent')}
            onOpenUrl={openNotionPage}
            onPlay={startFromRecentEntry}
          />
        </div>
        {settingsButton}
        {deleteConfirm && (
          <DeleteConfirmDialog
            title={deleteConfirm.title}
            onConfirm={deleteEntry}
            onCancel={cancelDelete}
          />
        )}
        {deletedPageInfo && (
          <DeletedPageDialog info={deletedPageInfo} onDismiss={dismissDeletedPage} />
        )}
      </div>
    );
  }

  return (
    <>
      {content}

      {showAlreadyRunningWarning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">{t('warnAlreadyRunningTitle')}</h2>
            <p className="text-xs text-zinc-300">{t('warnAlreadyRunningBody')}</p>
            {timer.running && (
              <p className="text-xs text-zinc-400">
                {t('warnAlreadyRunningIn')}{' '}
                <span className="font-semibold text-zinc-200">{workspaces.find(w => w.id === timer.workspaceId)?.name || 'Notion'}</span>
              </p>
            )}
            <div className="flex flex-col gap-2 mt-1">
              <button
                type="button"
                onClick={onConfirmAlreadyRunning}
                className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white"
              >
                {t('btnStopAndStartNew')}
              </button>
              <button
                type="button"
                onClick={onCancelAlreadyRunning}
                className="w-full py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm text-zinc-300"
              >
                {t('btnCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSavePresetModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('dialogSavePresetTitle')}</h2>
            <p className="text-xs text-zinc-300">{t('dialogSavePresetBody')}</p>
            <p className="text-xs text-zinc-400 italic">{t('dialogSavePresetOptional')}</p>
            <div className="flex items-center w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs focus-within:border-zinc-500">
              <span className="text-zinc-300 select-none mr-1 font-medium whitespace-nowrap truncate max-w-[55%] shrink-0">
                {`${workspaces.find((w) => w.id === selectedWorkspaceId)?.name || ''} –`}
              </span>
              <input
                type="text"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                placeholder={t('dialogSavePresetPlaceholder')}
                className="w-full bg-transparent p-0 focus:outline-none placeholder-zinc-500"
              />
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={async () => {
                  await saveCurrentAsPreset(presetNameInput);
                  setPresetNameInput('');
                  setShowSavePresetModal(false);
                }}
                className="flex-1 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white"
              >
                {t('btnSave')}
              </button>
              <button
                onClick={() => {
                  setPresetNameInput('');
                  setShowSavePresetModal(false);
                }}
                className="flex-1 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm"
              >
                {t('btnCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showManagePresetsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full flex flex-col gap-3 max-h-[90vh]">
            <h2 className="text-sm font-semibold">{t('presetsManageTitle')}</h2>
            
            <div className="bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-3 flex gap-2.5 items-start text-xs text-zinc-200">
              <Info20Regular className="w-4 h-4 text-zinc-300 mt-0.5" />
              <p>{t('tooltipPresetsShortcuts')}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
              {(() => {
                const allPresets = workspaces.flatMap((ws) =>
                  (ws.presets || []).map((p, index, arr) => ({ ws, p, index, arr }))
                );
                if (allPresets.length === 0) {
                  return <div className="text-xs text-zinc-500 py-4 text-center">{t('presetsNoneConfigured')}</div>;
                }
                return allPresets.map(({ ws, p, index, arr }) => (
                  <div key={p.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs">
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <span className="font-semibold text-zinc-100 truncate">{p.name || ws.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ws.color?.trim() && (
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getWorkspaceAccentColor(ws.color.trim(), isDarkTheme) }} />
                        )}
                        <span className="text-[10px] text-zinc-400 truncate">{ws.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => movePresetUp(ws.id, p.id)}
                        disabled={index === 0}
                        title={t('titleMoveUp')}
                        className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-zinc-400 hover:text-zinc-200"
                      >
                        <ArrowUp20Regular className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePresetDown(ws.id, p.id)}
                        disabled={index === arr.length - 1}
                        title={t('titleMoveDown')}
                        className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-zinc-400 hover:text-zinc-200"
                      >
                        <ArrowDown20Regular className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(ws.id, p.id)}
                        title={t('titleRemovePreset')}
                        className="p-1 hover:bg-zinc-800 text-red-400 hover:text-red-300 rounded flex items-center justify-center"
                      >
                        <Delete20Regular className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>

            <button
              type="button"
              onClick={() => setShowManagePresetsModal(false)}
              className="w-full py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm mt-1"
            >
              {t('titleDismiss')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RunningView({
  workspaceName,
  workspaceColor,
  settingsButton,
  runningTimers,
  runningTimersLoading,
  activePageId,
  recentEntries,
  recentEntriesLoading,
  deleteConfirm,
  onLoadRunningTimer,
  onStopOtherRunningTimer,
  onConfirmDelete,
  onCancelDelete,
  onDeleteEntry,
  onOpenUrl,
  onApplyPreset,
  onStartFromRecentEntry,
  onManagePresetsClick,
}) {
  const timer = useStore((s) => s.timer);
  const isStopping = useStore((s) => s.isStopping);
  const description = useStore((s) => s.description);
  const extraFieldDefs = useStore((s) => s.extraFieldDefs);
  const extraValues = useStore((s) => s.extraValues);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const updateTimerDetails = useStore((s) => s.updateTimerDetails);
  const addToast = useStore((s) => s.addToast);
  const stopTimer = useStore((s) => s.stopTimer);
  const updateStartTime = useStore((s) => s.updateStartTime);
  const workspaces = useStore((s) => s.workspaces);
  const apiKey = useStore((s) => s.apiKey);
  const isDarkTheme = useIsDarkTheme();
  const accentColor = workspaceColor ? getWorkspaceAccentColor(workspaceColor, isDarkTheme) : null;

  // <input type="time"> only accepts a 24-hour "HH:MM" value — it renders blank
  // for anything else — so the value stays 24-hour whatever the display format
  // is. The browser presents it in the OS's own 12/24-hour convention.
  const [startInput, setStartInput] = useState(() => formatHHMM(new Date(timer.roundedStart)));
  const [endInput, setEndInput] = useState('');
  const [localDesc, setLocalDesc] = useState(description);
  const [localExtras, setLocalExtras] = useState({ ...extraValues });

  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);

  const [showTimeErrorModal, setShowTimeErrorModal] = useState(false);
  const [pendingEndTime, setPendingEndTime] = useState(null);

  const activeWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const descriptionMissing = !!activeWorkspace?.descriptionRequired && !localDesc.trim();

  useEffect(() => {
    setStartInput(formatHHMM(new Date(timer.roundedStart)));
  }, [timer.startISO]); // eslint-disable-line react-hooks/exhaustive-deps

  // Extra-field edits are saved after a short pause instead of on every
  // keystroke (same 600 ms debounce as the Android app). While one is pending,
  // a refresh from Notion must not overwrite the draft.
  const pendingExtrasRef = useRef(null);
  const extrasTimeoutRef = useRef(null);
  const descSaveRef = useRef(null);
  const localDescRef = useRef(localDesc);
  localDescRef.current = localDesc;

  const cancelPendingExtras = () => {
    clearTimeout(extrasTimeoutRef.current);
    extrasTimeoutRef.current = null;
    const pending = pendingExtrasRef.current;
    pendingExtrasRef.current = null;
    return pending;
  };

  const scheduleExtrasSave = (newExtras) => {
    clearTimeout(extrasTimeoutRef.current);
    pendingExtrasRef.current = newExtras;
    extrasTimeoutRef.current = setTimeout(() => {
      const pending = cancelPendingExtras();
      if (pending) updateTimerDetails(selectedProjectId, localDescRef.current, pending);
    }, 600);
  };

  useEffect(() => {
    // Switching to another running timer: drop the old timer's pending edit.
    cancelPendingExtras();
    setLocalDesc(description);
    setLocalExtras({ ...extraValues });
  }, [timer.notionPageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(extrasTimeoutRef.current), []);

  // Extra field values (e.g. connected project) can arrive asynchronously
  // shortly after a running timer is loaded — re-sync the draft once they do.
  useEffect(() => {
    if (pendingExtrasRef.current) return;
    setLocalExtras({ ...extraValues });
  }, [extraValues]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitStart = () => {
    if (!startInput) {
      setStartInput(formatHHMM(new Date(timer.roundedStart)));
      return;
    }
    updateStartTime(timeOnDate(timer.rawStart, startInput));
  };

  const handleStop = async (manualEnd = null) => {
    if (descriptionMissing) {
      addToast({ type: 'error', message: t('toastDescriptionBeforeStopping') });
      return;
    }
    const missingRequired = extraFieldDefs.some(
      (def) => def.required && buildPropertyValue(def.type, localExtras[def.name]) === null
    );
    if (missingRequired) {
      addToast({ type: 'error', message: t('toastRequiredBeforeStopping') });
      return;
    }
    // Write unsaved edits (a pending extra field, or a description that is
    // still being typed) before the entry is closed, so they aren't lost.
    // Clicking Stop blurs the description first; let that save land.
    await descSaveRef.current;
    const pendingExtras = cancelPendingExtras();
    const savedDesc = useStore.getState().description;
    if (pendingExtras || localDesc.trim() !== savedDesc.trim()) {
      await updateTimerDetails(selectedProjectId, localDesc, pendingExtras || localExtras);
    }
    stopTimer(manualEnd);
  };

  const commitEnd = () => {
    if (!endInput) return;
    const endDate = timeOnDate(timer.rawStart, endInput);
    if (endDate < timer.rawStart) {
      setPendingEndTime(endDate);
      setShowTimeErrorModal(true);
    } else {
      handleStop(endDate);
    }
  };

  const blurOnEnter = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const timeInputClass =
    'w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm tabular-nums text-center';

  return (
    <div
      className="flex flex-col h-full"
      style={accentColor ? { backgroundColor: accentColor + '33' } : undefined}
    >
      <div className="flex-1 flex flex-col items-center px-6 pt-6 overflow-y-auto">
        <PresetChips
          workspaces={workspaces}
          apiKey={apiKey}
          onApplyPreset={onApplyPreset}
          onManageClick={onManagePresetsClick}
          className="mb-3"
        />

        <div className="text-sm font-semibold text-zinc-100 truncate max-w-full">
          {workspaceName}
        </div>
        <input
          type="text"
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value)}
          onBlur={() => {
            if (localDesc.trim() === description.trim()) return;
            const pending = cancelPendingExtras();
            descSaveRef.current = updateTimerDetails(selectedProjectId, localDesc, pending || localExtras);
          }}
          onKeyDown={blurOnEnter}
          placeholder={t('placeholderDescription')}
          className={`mt-1 w-full bg-transparent border rounded-md px-2 py-0.5 text-sm text-zinc-200 text-center placeholder-zinc-600 outline-none transition-colors ${
            descriptionMissing
              ? 'border-red-500'
              : 'border-transparent hover:border-zinc-700 focus:border-zinc-600'
          }`}
        />

        <div className="mt-6 text-5xl font-mono font-bold tabular-nums text-red-400">
          {formatElapsed(timer.elapsedSeconds)}
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

        {extraFieldDefs.length > 0 && (
          <div className="mt-4 w-full flex flex-col gap-3">
            {extraFieldDefs.map((def) => (
              <ExtraFieldInput
                key={def.name}
                def={def}
                value={localExtras[def.name]}
                error={def.required && buildPropertyValue(def.type, localExtras[def.name]) === null}
                onChange={(value) => {
                  const newExtras = { ...localExtras, [def.name]: value };
                  setLocalExtras(newExtras);
                  scheduleExtrasSave(newExtras);
                }}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => handleStop()}
          disabled={isStopping}
          className="mt-5 w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 font-semibold text-lg transition-colors flex items-center justify-center disabled:opacity-50"
        >
          {isStopping ? (
            <span className="animate-spin inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            t('btnStop')
          )}
        </button>

        <OtherRunningTimers
          timers={runningTimers}
          loading={runningTimersLoading}
          activePageId={activePageId}
          onLoad={onLoadRunningTimer}
          onStop={onStopOtherRunningTimer}
          onDelete={(rt) => onConfirmDelete(rt, rt.pageId === activePageId ? 'active' : 'running')}
          onOpenUrl={onOpenUrl}
        />
        <RecentEntries
          entries={recentEntries}
          loading={recentEntriesLoading}
          workspaces={workspaces}
          onDelete={(entry) => onConfirmDelete(entry, 'recent')}
          onOpenUrl={onOpenUrl}
          onPlay={onStartFromRecentEntry}
        />
      </div>
      {settingsButton}
      {deleteConfirm && (
        <DeleteConfirmDialog
          title={deleteConfirm.title}
          onConfirm={onDeleteEntry}
          onCancel={onCancelDelete}
        />
      )}
      {showTimeErrorModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full max-w-xs flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">{t('dialogTimeErrorTitle')}</h2>
            <p className="text-xs text-zinc-300">{t('dialogTimeErrorBody')}</p>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setShowTimeErrorModal(false);
                  const nextDayDate = new Date(pendingEndTime.getTime() + 24 * 3600 * 1000);
                  handleStop(nextDayDate);
                  setEndInput('');
                  setPendingEndTime(null);
                }}
                className="flex-1 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
              >
                {t('btnNextDay')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTimeErrorModal(false);
                  setEndInput('');
                  setPendingEndTime(null);
                }}
                className="flex-1 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-xs font-semibold text-zinc-200"
              >
                {t('btnEdit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeletedPageDialog({ info, onDismiss }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 max-w-xs w-full">
        <p className="text-sm font-semibold text-zinc-200 mb-2">{t('deletedPageTitle')}</p>
        <p className="text-xs text-zinc-400 mb-2">{t('deletedPageBody')}</p>
        {info.title && (
          <p className="text-xs text-zinc-300 bg-zinc-900 rounded px-2 py-1 mb-2 truncate">
            &ldquo;{info.title}&rdquo;
          </p>
        )}
        <p className="text-xs text-zinc-500 mb-4">{t('deletedPageHint')}</p>
        <div className="flex justify-end">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-md transition-colors"
          >
            {t('deletedPageConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RunningTimerItem({ rt, isActive, onLoad, onStop, onDelete, onOpenUrl }) {
  const showNotionLink = useStore((s) => s.showNotionLink);
  const showArchiveAction = useStore((s) => s.showArchiveAction);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(rt.startISO).getTime();
    const updateElapsed = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [rt.startISO]);

  return (
    <div
      onClick={isActive ? undefined : () => onLoad(rt)}
      className={`flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-md mb-1 transition-colors ${isActive ? 'opacity-60' : 'hover:bg-zinc-700 cursor-pointer'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate text-zinc-200">{rt.title}</div>
        <div className="flex flex-col gap-0.5 text-xs text-zinc-500 mt-0.5">
          <span className="truncate">{rt.workspaceName}</span>
          <span className="font-mono text-emerald-400 font-semibold">{formatElapsed(elapsed)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {showNotionLink && rt.url && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenUrl(rt.url); }}
            title={t('titleOpenInNotion')}
            className="text-zinc-500 hover:text-zinc-200 transition-colors flex items-center justify-center p-1"
          >
            <Open20Regular className="w-4 h-4" />
          </button>
        )}
        {showArchiveAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(rt); }}
          title={t('titleDeleteEntry')}
          className="text-zinc-500 hover:text-red-400 transition-colors flex items-center justify-center p-1"
        >
          <Delete20Regular className="w-4 h-4" />
        </button>
        )}
        {!isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onStop(rt); }}
            title={t('titleStopRunningTimer')}
            className="text-zinc-500 hover:text-red-400 transition-colors flex items-center justify-center p-1"
          >
            <Stop20Regular className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** "Workspace – Preset", or just the workspace name for an unnamed preset
 *  (or one named after its workspace). Same label as the Android chips and
 *  the tray menu. */
function presetLabel(workspace, preset) {
  const name = preset.name?.trim();
  return name && name !== workspace.name ? `${workspace.name} – ${name}` : workspace.name;
}

/** Quick-start preset chips — shown when any workspace has presets, in both
 *  the idle form and the running view. Clicking one while a timer is already
 *  running goes through `applyPreset`'s "already running" confirmation. */
function PresetChips({ workspaces, apiKey, onApplyPreset, onManageClick, className = '' }) {
  const isDarkTheme = useIsDarkTheme();
  if (!workspaces.some((w) => (w.presets?.length ?? 0) > 0)) return null;
  return (
    <div className={`w-full flex flex-wrap items-center gap-1.5 ${className}`}>
      {workspaces.flatMap((w) =>
        (w.presets || []).map((preset) => {
          const hex = w.color?.trim();
          const accent = hex ? getWorkspaceAccentColor(hex, isDarkTheme) : null;
          const chipStyle = accent
            ? { borderColor: accent + '66', color: accent, backgroundColor: accent + '22' }
            : {};
          const label = presetLabel(w, preset);
          // The label only truncates once the chip would overflow the row, so
          // "Workspace – Preset" stays readable instead of being cut off at a
          // fixed width (which chopped it right before the dash).
          return (
            <button
              key={`${w.id}:${preset.id}`}
              onClick={() => onApplyPreset(w.id, preset)}
              disabled={!apiKey}
              title={label}
              style={chipStyle}
              className="flex items-center gap-1 min-w-0 max-w-full px-2.5 py-1 bg-zinc-800 hover:bg-emerald-700 border border-zinc-700 hover:border-emerald-600 rounded-full text-xs text-zinc-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play20Regular className="w-3 h-3 shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          );
        })
      )}
      <button
        onClick={onManageClick}
        title={t('presetsManageTitle')}
        className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-full transition-colors flex items-center justify-center text-sm"
      >
        <Edit20Regular className="w-4 h-4" />
      </button>
    </div>
  );
}

function OtherRunningTimers({ timers, loading, activePageId, onLoad, onStop, onDelete, onOpenUrl }) {
  if (!timers.length) return null;
  return (
    <div className="w-full mt-6 pt-3 border-t border-zinc-700">
      <div className="mb-2">
        <span className="text-xs text-zinc-500">{t('runningTimersHeading')}</span>
      </div>
      {timers.map((rt) => (
        <RunningTimerItem
          key={rt.pageId}
          rt={rt}
          isActive={rt.pageId === activePageId}
          onLoad={onLoad}
          onStop={onStop}
          onDelete={onDelete}
          onOpenUrl={onOpenUrl}
        />
      ))}
    </div>
  );
}

function formatRecentRange(startISO, endISO) {
  if (!startISO) return '';
  const { dateFormat, timeFormat } = useStore.getState();
  const dateStr = formatDateStr(startISO, dateFormat);
  const startStr = formatTimeStr(startISO, timeFormat);
  if (endISO) {
    const start = new Date(startISO);
    const end = new Date(endISO);
    const isSameDay = start.getFullYear() === end.getFullYear() &&
                      start.getMonth() === end.getMonth() &&
                      start.getDate() === end.getDate();
    const endStr = formatTimeStr(endISO, timeFormat);
    if (isSameDay) {
      return `${dateStr} ${startStr} → ${endStr}`;
    } else {
      const endDateStr = formatDateStr(endISO, dateFormat);
      return `${dateStr} ${startStr} → ${endDateStr} ${endStr}`;
    }
  }
  return `${dateStr} ${startStr} → …`;
}

function RecentEntries({ entries, loading, workspaces, onDelete, onOpenUrl, onPlay }) {
  const showNotionLink = useStore((s) => s.showNotionLink);
  const showArchiveAction = useStore((s) => s.showArchiveAction);
  const isDarkTheme = useIsDarkTheme();
  if (!entries.length) return null;
  return (
    <div className="w-full mt-6 pt-3 border-t border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500">{t('recentEntriesHeading')}</span>
      </div>
      {entries.map((entry) => {
        const wsColor = workspaces?.find((w) => w.id === entry.workspaceId)?.color?.trim();
        const accent = wsColor ? getWorkspaceAccentColor(wsColor, isDarkTheme) : null;
        return (
          <div
            key={entry.pageId}
            className="flex items-center gap-2 px-3 py-2 rounded-md mb-1 transition-colors border-l-2"
            style={
              accent
                ? { backgroundColor: accent + '1a', borderColor: accent }
                : { backgroundColor: 'rgb(39 39 42)', borderColor: 'transparent' } /* bg-zinc-800 */
            }
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate text-zinc-400">{entry.title}</div>
              <div className="flex flex-col gap-0.5 text-xs text-zinc-600 mt-0.5">
                <span className="truncate">{entry.workspaceName}</span>
                <span className="font-mono text-zinc-500 whitespace-nowrap">{formatRecentRange(entry.startISO, entry.endISO)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onPlay && (
                <button
                  onClick={() => onPlay(entry)}
                  title={t('titleStartFromEntry')}
                  className="text-zinc-500 hover:text-emerald-400 transition-colors flex items-center justify-center p-1"
                >
                  <Play20Regular className="w-4 h-4" />
                </button>
              )}
              {showNotionLink && entry.url && (
                <button
                  onClick={() => onOpenUrl(entry.url)}
                  title={t('titleOpenInNotion')}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors flex items-center justify-center p-1"
                >
                  <Open20Regular className="w-4 h-4" />
                </button>
              )}
              {showArchiveAction && (
                <button
                  onClick={() => onDelete(entry)}
                  title={t('titleDeleteEntry')}
                  className="text-zinc-500 hover:text-red-400 transition-colors flex items-center justify-center p-1"
                >
                  <Delete20Regular className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function DeleteConfirmDialog({ title, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 max-w-xs w-full">
        <p className="text-sm text-zinc-200 mb-1">{t('confirmDeleteTitle')}</p>
        <p className="text-xs text-zinc-500 mb-4 truncate">"{title}"</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            {t('btnCancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 rounded-md font-medium transition-colors"
          >
            {t('confirmDeleteConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
