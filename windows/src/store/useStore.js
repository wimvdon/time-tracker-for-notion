import { create } from 'zustand';
import { computeStartTime, computeEndTime } from '../lib/rounding.js';
import { toNotionDateTime, formatDateStr } from '../lib/format.js';
import { t, setLocale } from '../lib/i18n.js';
import { errorMessage } from '../lib/errors.js';
import { WRITABLE_EXTRA_TYPES, emptyValueFor, buildPropertyValue } from '../lib/notionValues.js';

const api = window.notionAPI;

const idleTimer = {
  running: false,
  notionPageId: null,
  roundedStart: null,
  startISO: null,
  rawStart: null,
  propertyMap: null,
  elapsedSeconds: 0,
  tickInterval: null,
};

// ---- Migration from the pre-workspace schema ----

const migratePropertyMap = (old) => {
  if (!old) return {};
  if (old.timeEntryTitleProp !== undefined) return old;
  return {
    timeEntryTitleProp: old.tijdsTitleProp ?? '',
    timeEntryDateProp: old.tijdsTijdProp ?? '',
    timeEntryStatusProp: old.tijdsStatusProp ?? '',
    timeEntryStatusRunning: old.tijdsStatusRunning ?? '',
    timeEntryStatusDone: old.tijdsStatusDone ?? '',
    timeEntryRelationProp: old.tijdsRelationProp ?? '',
  };
};

const migrateActiveTimer = (at) => {
  if (!at) return null;
  if (at.workspaceId !== undefined) return at;
  return {
    notionPageId: at.notionPageId,
    roundedStart: at.roundedStart,
    rawStart: at.rawStart,
    workspaceId: at.projectId ?? null,
    projectId: at.deelprojectId ?? null,
    projectName: at.deelprojectName ?? '',
    description: at.description ?? '',
    propertyMap: migratePropertyMap(at.propertyMap),
  };
};

let toastSeq = 0;

export const useStore = create((set, get) => ({
  // Settings
  apiKey: '',
  workspaces: [],
  alwaysOnTop: true,
  startWithWindows: false,
  // Global toggles for the per-entry Notion actions on active/recent timers.
  showNotionLink: true,
  showArchiveAction: true,

  // UI
  view: 'timer',
  toasts: [],
  recoveredTimer: null,
  recoveryBusy: false,
  isStarting: false,
  isStopping: false,
  theme: 'auto',
  suspendedTimer: null,
  showAlreadyRunningWarning: false,
  pendingStartAction: null,

  // Session state
  selectedWorkspaceId: null,
  selectedProjectId: null,
  description: '',
  extraFieldDefs: [],
  extrasLoading: false,
  extraValues: {},

  // Timer state
  timer: { ...idleTimer },

  // Running timers from Notion
  runningTimers: [],
  runningTimersLoading: false,
  recentEntries: [],
  recentEntriesLoading: false,
  deleteConfirm: null,

  // Deleted-page dialog: { notionPageId, title, startISO }
  deletedPageInfo: null,

  setView: (view) => set({ view }),
  setDescription: (description) => set({ description }),
  setExtraValue: (name, value) =>
    set((s) => ({ extraValues: { ...s.extraValues, [name]: value } })),

  getRoundingMinutes: () => {
    const ws = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    return ws?.roundingMinutes ?? 15;
  },

  addToast: (toast) => {
    const id = ++toastSeq;
    set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));
    if (!toast.sticky) {
      setTimeout(() => get().dismissToast(id), 6000);
    }
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  // ---- Init / settings ----

  init: async () => {
    const settings = await api.getSettings();

    const hasLegacy =
      (settings.projects?.length ?? 0) > 0 && !(settings.workspaces?.length);
    const rawWorkspaces = hasLegacy
      ? settings.projects.map((p) => ({
          id: p.id,
          name: p.name,
          timeEntriesDbId: p.tijdsregistratiesDbId,
          projectsDbId: p.deelprojectenDbId,
          roundingEnabled: settings.roundingEnabled ?? true,
          propertyMap: migratePropertyMap(p.propertyMap),
        }))
      : settings.workspaces ?? [];

    const workspaces = rawWorkspaces.map((ws) => {
      const extraProps = (ws.extraProps || []).map((ep) =>
        typeof ep === 'string' ? { propName: ep, defaultValue: null } : ep
      );
      const roundingMinutes =
        ws.roundingMinutes !== undefined
          ? ws.roundingMinutes
          : ws.roundingEnabled === false
          ? 0
          : 15;
      return { ...ws, extraProps, roundingMinutes, presets: ws.presets || [] };
    });

    const lastUsedWorkspaceId =
      settings.lastUsedWorkspaceId ?? settings.lastUsedProjectId ?? null;
    const activeTimer = migrateActiveTimer(settings.activeTimer);

    const needsMigrationSave =
      hasLegacy ||
      settings.projects !== undefined ||
      rawWorkspaces.some(
        (ws) =>
          ws.roundingMinutes === undefined ||
          (ws.extraProps || []).some((ep) => typeof ep === 'string')
      );
    if (needsMigrationSave) {
      api.saveSettings({
        workspaces,
        lastUsedWorkspaceId,
        activeTimer,
        projects: undefined,
        lastUsedProjectId: undefined,
        roundingEnabled: undefined,
      });
    }

    const activeLocale = settings.locale || 'system';
    setLocale(activeLocale);

    set({
      apiKey: settings.apiKey || '',
      workspaces,
      alwaysOnTop: settings.alwaysOnTop !== false,
      startWithWindows: settings.startWithWindows === true,
      showNotionLink: settings.showNotionLink !== false,
      showArchiveAction: settings.showArchiveAction !== false,
      theme: settings.theme || 'auto',
      locale: activeLocale,
      dateFormat: settings.dateFormat || 'DD/MM/YYYY',
      timeFormat: settings.timeFormat || '24h',
    });

    if (!settings.apiKey || !workspaces.length) {
      set({ view: 'settings' });
    }

    if (activeTimer && activeTimer.notionPageId) {
      set({ description: activeTimer.description || '', view: 'timer' });
      if (activeTimer.workspaceId) {
        await get().selectWorkspace(activeTimer.workspaceId, activeTimer);
        set({ selectedProjectId: activeTimer.projectId || null });
      }
      get().beginTicking({
        pageId: activeTimer.notionPageId,
        roundedStart: new Date(activeTimer.roundedStart),
        startISO: activeTimer.roundedStart,
        rawStart: new Date(activeTimer.rawStart || activeTimer.roundedStart),
        propertyMap: activeTimer.propertyMap,
      });
    } else if (lastUsedWorkspaceId) {
      const exists = workspaces.some((w) => w.id === lastUsedWorkspaceId);
      if (exists) get().selectWorkspace(lastUsedWorkspaceId);
    }

    if (settings.apiKey && workspaces.length) {
      get().loadRunningTimers();
      get().loadRecentEntries();
    }

    get().applyTheme();

    // Tray preset shortcuts
    if (api.onTrayApplyPreset) {
      api.onTrayApplyPreset(({ workspaceId, preset }) => {
        get().applyPreset(workspaceId, preset);
      });
    }

    // 60s auto-refresh
    setInterval(() => {
      const s = get();
      if (s.apiKey && s.workspaces.length && !s.recoveredTimer) {
        get().loadRunningTimers();
        get().loadRecentEntries();
      }
    }, 60_000);
  },

  saveApiKey: async (apiKey) => {
    await api.saveSettings({ apiKey });
    set({ apiKey });
  },

  addWorkspace: async (workspace) => {
    const workspaces = [...get().workspaces, workspace];
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
  },

  updateWorkspace: async (updatedWorkspace) => {
    const workspaces = get().workspaces.map((w) =>
      w.id === updatedWorkspace.id ? updatedWorkspace : w
    );
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
    if (get().selectedWorkspaceId === updatedWorkspace.id) {
      get().selectWorkspace(updatedWorkspace.id);
    }
  },

  moveWorkspace: async (id, direction) => {
    const workspaces = [...get().workspaces];
    const idx = workspaces.findIndex((w) => w.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= workspaces.length) return;
    [workspaces[idx], workspaces[swapIdx]] = [workspaces[swapIdx], workspaces[idx]];
    await api.saveSettings({ workspaces });
    set({ workspaces });
  },

  deleteWorkspace: async (workspaceId) => {
    const workspaces = get().workspaces.filter((w) => w.id !== workspaceId);
    await api.saveSettings({ workspaces });
    const patch = { workspaces };
    if (get().selectedWorkspaceId === workspaceId) {
      Object.assign(patch, {
        selectedWorkspaceId: null,
        selectedProjectId: null,
      });
      await api.saveSettings({ lastUsedWorkspaceId: null });
    }
    set(patch);
    api.notifySettingsChanged?.();
  },

  saveCurrentAsPreset: async (name) => {
    const state = get();
    const workspaceId = state.selectedWorkspaceId;
    if (!workspaceId) return;
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    const newPreset = {
      id: Math.random().toString(36).substring(2, 9),
      name: name.trim() || '',
      pageTitle: state.description.trim(),
      extraValues: { ...state.extraValues },
      showInShortcuts: false
    };
    const workspaces = state.workspaces.map((w) => {
      if (w.id === workspaceId) {
        return {
          ...w,
          presets: [...(w.presets || []), newPreset]
        };
      }
      return w;
    });
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
  },

  deletePreset: async (workspaceId, presetId) => {
    const state = get();
    const workspaces = state.workspaces.map((w) => {
      if (w.id === workspaceId) {
        return {
          ...w,
          presets: (w.presets || []).filter((p) => p.id !== presetId)
        };
      }
      return w;
    });
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
  },

  movePresetUp: async (workspaceId, presetId) => {
    const state = get();
    const workspaces = state.workspaces.map((w) => {
      if (w.id === workspaceId) {
        const presets = [...(w.presets || [])];
        const idx = presets.findIndex((p) => p.id === presetId);
        if (idx > 0) {
          [presets[idx], presets[idx - 1]] = [presets[idx - 1], presets[idx]];
          return { ...w, presets };
        }
      }
      return w;
    });
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
  },

  movePresetDown: async (workspaceId, presetId) => {
    const state = get();
    const workspaces = state.workspaces.map((w) => {
      if (w.id === workspaceId) {
        const presets = [...(w.presets || [])];
        const idx = presets.findIndex((p) => p.id === presetId);
        if (idx >= 0 && idx < presets.length - 1) {
          [presets[idx], presets[idx + 1]] = [presets[idx + 1], presets[idx]];
          return { ...w, presets };
        }
      }
      return w;
    });
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
  },

  toggleAlwaysOnTop: async (value) => {
    await api.setAlwaysOnTop(value);
    set({ alwaysOnTop: value });
  },

  toggleStartWithWindows: async (value) => {
    await api.setStartWithWindows(value);
    set({ startWithWindows: value });
  },

  setShowNotionLink: async (value) => {
    await api.saveSettings({ showNotionLink: value });
    set({ showNotionLink: value });
  },

  setShowArchiveAction: async (value) => {
    await api.saveSettings({ showArchiveAction: value });
    set({ showArchiveAction: value });
  },

  setLocale: async (locale) => {
    await api.saveSettings({ locale });
    setLocale(locale);
    set({ locale });
  },

  setDateFormat: async (dateFormat) => {
    await api.saveSettings({ dateFormat });
    set({ dateFormat });
  },

  setTimeFormat: async (timeFormat) => {
    await api.saveSettings({ timeFormat });
    set({ timeFormat });
  },

  // ---- Workspace / project selection ----

  selectWorkspace: async (workspaceId, activeOverride = null) => {
    const state = get();
    const workspace = state.workspaces.find((w) => w.id === workspaceId);

    const active = activeOverride || (state.timer.running && state.timer.workspaceId === workspaceId
      ? { description: state.description, projectId: state.selectedProjectId, extraValues: state.extraValues }
      : null);

    const description = active ? (active.description || '') : '';
    const selectedProjectId = active ? (active.projectId || null) : null;
    const extraValues = active ? (active.extraValues || {}) : {};

    set({
      selectedWorkspaceId: workspaceId,
      selectedProjectId,
      description,
      extraFieldDefs: [],
      extraValues,
      extrasLoading: !!workspace && (workspace.extraProps?.length ?? 0) > 0,
    });
    api.saveSettings({ lastUsedWorkspaceId: workspaceId });
    if (!workspace) return;
    await get().loadExtraFields(workspace, active);
  },

  loadExtraFields: async (workspace, active = null) => {
    if (!(workspace.extraProps?.length)) return;
    try {
      const schema = await api.getDatabaseSchema(workspace.timeEntriesDbId);
      let users = null;
      const defs = [];
      for (const { propName: name, required } of workspace.extraProps) {
        const prop = schema?.[name];
        if (!prop || !WRITABLE_EXTRA_TYPES.includes(prop.type)) continue;
        const def = { name, type: prop.type, options: [], required: !!required };
        if (prop.type === 'select' || prop.type === 'multi_select' || prop.type === 'status') {
          def.options = (prop[prop.type]?.options ?? []).map((o) => ({ name: o.name }));
        } else if (prop.type === 'people') {
          users = users ?? (await api.listUsers());
          def.options = users;
        } else if (prop.type === 'relation' && prop.relation?.database_id) {
          def.options = await api.fetchDatabasePages(prop.relation.database_id);
        }
        defs.push(def);
      }
      if (get().selectedWorkspaceId !== workspace.id) return;
      const extraValues = { ...active?.extraValues };
      for (const def of defs) {
        if (extraValues[def.name] === undefined) {
          extraValues[def.name] = emptyValueFor(def.type);
        }
      }
      set({ extraFieldDefs: defs, extraValues, extrasLoading: false });
    } catch (err) {
      if (get().selectedWorkspaceId !== workspace.id) return;
      set({ extrasLoading: false });
      get().addToast({ type: 'error', message: `${t('errorLoadingExtras')}: ${errorMessage(err)}` });
    }
  },

  // ---- Timer ----

  startTimer: async () => {
    const state = get();
    if (state.timer.running || state.isStarting) return;
    set({ isStarting: true });

    if (state.suspendedTimer) {
      set({ suspendedTimer: null });
    }

    const workspace = state.workspaces.find((w) => w.id === state.selectedWorkspaceId);
    if (!workspace) {
      set({ isStarting: false });
      return;
    }

    const rawStart = new Date();
    const startISO = toNotionDateTime(rawStart);
    const title = state.description.trim() || formatDateStr(rawStart, state.dateFormat);

    const extra = {};
    for (const def of state.extraFieldDefs) {
      const value = buildPropertyValue(def.type, state.extraValues[def.name]);
      if (value) extra[def.name] = value;
    }

    let pageId;
    try {
      ({ pageId } = await api.createTimeEntry({
        dbId: workspace.timeEntriesDbId,
        title,
        startISO,
        projectId: state.selectedProjectId,
        props: workspace.propertyMap,
        extra,
      }));
    } catch (err) {
      set({ isStarting: false });
      state.addToast({ type: 'error', message: `${t('toastStartError')}: ${errorMessage(err)}` });
      return;
    }

    api.saveSettings({
      activeTimer: {
        notionPageId: pageId,
        roundedStart: startISO,
        rawStart: rawStart.toISOString(),
        workspaceId: workspace.id,
        projectId: state.selectedProjectId,
        projectName: '',
        description: state.description,
        propertyMap: workspace.propertyMap,
        extraValues: state.extraValues,
      },
    });
    get().beginTicking({
      pageId,
      roundedStart: rawStart,
      startISO,
      rawStart,
      propertyMap: workspace.propertyMap,
    });
    set({ isStarting: false });
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  /**
   * Applies a preset: sets workspace, description, and extra values, then starts
   * the timer immediately.
   */
  applyPreset: async (workspaceId, preset) => {
    const action = async () => {
      const state = get();
      if (state.selectedWorkspaceId !== workspaceId) {
        await get().selectWorkspace(workspaceId);
      }
      set({ description: preset.pageTitle || '' });
      if (preset.extraValues && Object.keys(preset.extraValues).length > 0) {
        set({ extraValues: { ...get().extraValues, ...preset.extraValues } });
      }
      await get().startTimer();
    };

    if (get().timer.running) {
      set({
        showAlreadyRunningWarning: true,
        pendingStartAction: () => {
          get().suspendActiveToNewTimer();
          action();
        }
      });
    } else {
      await action();
    }
  },

  onConfirmAlreadyRunning: () => {
    set({ showAlreadyRunningWarning: false });
    const action = get().pendingStartAction;
    set({ pendingStartAction: null });
    if (action) action();
  },

  onCancelAlreadyRunning: () => {
    set({ showAlreadyRunningWarning: false, pendingStartAction: null });
  },

  onPlusButtonClicked: () => {
    if (get().timer.running) {
      set({
        showAlreadyRunningWarning: true,
        pendingStartAction: () => {
          get().suspendActiveToNewTimer();
        }
      });
    } else {
      get().suspendActiveToNewTimer();
    }
  },

  beginTicking: ({ pageId, roundedStart, startISO, rawStart, propertyMap }) => {
    const tickInterval = setInterval(() => {
      set((s) => ({
        timer: {
          ...s.timer,
          elapsedSeconds: Math.floor((Date.now() - s.timer.rawStart.getTime()) / 1000),
        },
      }));
    }, 1000);
    set({
      timer: {
        running: true,
        notionPageId: pageId,
        roundedStart,
        startISO,
        rawStart,
        propertyMap,
        elapsedSeconds: Math.floor((Date.now() - rawStart.getTime()) / 1000),
        tickInterval,
        workspaceId: get().selectedWorkspaceId,
      },
    });
    const ws = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    api.setTimerRunning(true, ws?.color?.trim() || null);
  },

  updateStartTime: (newStart) => {
    const state = get();
    if (!state.timer.running) return;
    const startISO = toNotionDateTime(newStart);
    set((s) => ({
      timer: {
        ...s.timer,
        roundedStart: newStart,
        startISO,
        rawStart: newStart,
        elapsedSeconds: Math.max(0, Math.floor((Date.now() - newStart.getTime()) / 1000)),
      },
    }));
    api.saveSettings({
      activeTimer: {
        notionPageId: state.timer.notionPageId,
        roundedStart: startISO,
        rawStart: newStart.toISOString(),
        workspaceId: state.selectedWorkspaceId,
        projectId: state.selectedProjectId,
        projectName: '',
        description: state.description,
        propertyMap: state.timer.propertyMap,
      },
    });
  },

  stopTimer: async (manualEnd = null) => {
    const { timer, suspendedTimer, addToast, isStopping } = get();
    if (isStopping) return;

    if (!timer.running && suspendedTimer) {
      set({ isStopping: true });
      const ws = get().workspaces.find((w) => w.id === suspendedTimer.workspaceId);
      const rm = ws?.roundingMinutes ?? 15;
      const rounding = rm > 0;
      const rawStart = new Date(suspendedTimer.startISO);
      const roundedStart = rounding ? computeStartTime(rawStart, rm) : rawStart;
      const endTime = rounding
        ? computeEndTime(roundedStart, manualEnd ?? new Date(), rm)
        : manualEnd ?? new Date();
      try {
        await api.stopTimeEntry({
          pageId: suspendedTimer.pageId,
          startISO: toNotionDateTime(roundedStart),
          endISO: toNotionDateTime(endTime),
          props: suspendedTimer.propertyMap,
        });
      } catch (err) {
        const msg = errorMessage(err);
        set({ isStopping: false });
        addToast({
          type: 'error',
          sticky: true,
          message: `${t('toastStopError')}: ${msg}`,
          action: { label: t('toastStopRetry'), run: () => get().stopTimer(manualEnd) },
        });
        return;
      }
      const remainingRunning = get().runningTimers.filter((x) => x.pageId !== suspendedTimer.pageId);
      api.saveSettings({ activeTimer: null });
      if (remainingRunning.length > 0) {
        set({ timer: { ...idleTimer }, description: '', suspendedTimer: null, runningTimers: remainingRunning, isStopping: false });
        get().loadRunningTimer(remainingRunning[0]);
      } else {
        api.setTimerRunning(false);
        set({ timer: { ...idleTimer }, description: '', suspendedTimer: null, runningTimers: [], isStopping: false });
      }
      get().loadRunningTimers();
      get().loadRecentEntries();
      return;
    }

    if (!timer.running) return;
    set({ isStopping: true });

    const rm = get().getRoundingMinutes();
    const rounding = rm > 0;
    const rawStart = new Date(timer.rawStart);
    if (manualEnd) {
      if (manualEnd.getTime() < rawStart.getTime()) {
        set({ isStopping: false });
        addToast({ type: 'error', message: t('toastEndBeforeStart') });
        return;
      }
    }
    const roundedStart = rounding ? computeStartTime(rawStart, rm) : rawStart;
    const endTime = rounding
      ? computeEndTime(roundedStart, manualEnd ?? new Date(), rm)
      : manualEnd ?? new Date();
    try {
      await api.stopTimeEntry({
        pageId: timer.notionPageId,
        startISO: toNotionDateTime(roundedStart),
        endISO: toNotionDateTime(endTime),
        props: timer.propertyMap,
      });
    } catch (err) {
      const msg = errorMessage(err);
      // Check if the page was deleted (404)
      if (isPageDeletedError(msg)) {
        get()._showDeletedPageDialog(timer);
        return;
      }
      set({ isStopping: false });
      addToast({
        type: 'error',
        sticky: true,
        message: `${t('toastStopError')}: ${msg}`,
        action: { label: t('toastStopRetry'), run: () => get().stopTimer() },
      });
      return;
    }

    clearInterval(timer.tickInterval);
    const remainingRunning = get().runningTimers.filter((x) => x.pageId !== timer.notionPageId);
    api.saveSettings({ activeTimer: null });

    const extraValues = {};
    for (const def of get().extraFieldDefs) {
      extraValues[def.name] = emptyValueFor(def.type);
    }

    if (remainingRunning.length > 0) {
      set({ timer: { ...idleTimer }, description: '', extraValues, runningTimers: remainingRunning, isStopping: false });
      get().loadRunningTimer(remainingRunning[0]);
    } else {
      api.setTimerRunning(false);
      set({ timer: { ...idleTimer }, description: '', extraValues, runningTimers: [], isStopping: false });
    }
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Running timers loaded from Notion ----

  loadRunningTimers: async () => {
    const { workspaces, apiKey, recoveredTimer, runningTimersLoading } = get();
    if (!apiKey || !workspaces.length || recoveredTimer || runningTimersLoading) return;

    set({ runningTimersLoading: true });
    const allRunning = [];

    for (const ws of workspaces) {
      const pm = ws.propertyMap;
      if (!ws.timeEntriesDbId || !pm?.timeEntryStatusProp || !pm?.timeEntryStatusRunning) continue;
      try {
        const pages = await api.fetchRunningTimers(
          ws.timeEntriesDbId,
          pm.timeEntryStatusProp,
          pm.timeEntryStatusRunning,
          pm.timeEntryDateProp,
        );
        for (const page of pages) {
          allRunning.push({ ...page, workspaceId: ws.id, workspaceName: ws.name, propertyMap: pm });
        }
      } catch {
        // silently ignore per-workspace errors
      }
    }

    allRunning.sort((a, b) => new Date(b.startISO) - new Date(a.startISO));
    // Merge deltas into the existing list instead of replacing it wholesale, so
    // entries that are still running keep their identity/position (no flicker or
    // momentary disappearance while switching timers).
    set({ runningTimersLoading: false, runningTimers: mergeById(get().runningTimers, allRunning) });

    // If the active timer is no longer running in Notion (stopped elsewhere), clear it
    const activeTimer = get().timer;
    if (activeTimer.running && activeTimer.notionPageId) {
      const stillRunning = allRunning.some((rt) => rt.pageId === activeTimer.notionPageId);
      if (!stillRunning) {
        clearInterval(activeTimer.tickInterval);
        api.saveSettings({ activeTimer: null });
        api.setTimerRunning(false);
        set({ timer: { ...idleTimer } });
        get().addToast({ type: 'info', message: t('timerStoppedElsewhere') });
      }
    } else if (!activeTimer.running && allRunning.length > 0 && !get().suspendedTimer) {
      get().loadRunningTimer(allRunning[0]);
    }
  },

  loadRecentEntries: async () => {
    const { workspaces, apiKey, recoveredTimer, recentEntriesLoading } = get();
    if (!apiKey || !workspaces.length || recoveredTimer || recentEntriesLoading) return;

    set({ recentEntriesLoading: true });
    const allRecent = [];
    for (const ws of workspaces) {
      const pm = ws.propertyMap;
      if (!ws.timeEntriesDbId || !pm?.timeEntryStatusProp || !pm?.timeEntryStatusDone) continue;
      try {
        const pages = await api.fetchRecentEntries(
          ws.timeEntriesDbId,
          pm.timeEntryStatusProp,
          pm.timeEntryStatusDone,
          pm.timeEntryDateProp,
        );
        for (const page of pages) {
          allRecent.push({ ...page, workspaceId: ws.id, workspaceName: ws.name, propertyMap: pm });
        }
      } catch {
        // silently ignore per-workspace errors
      }
    }
    allRecent.sort((a, b) => (b.endISO || b.startISO || '').localeCompare(a.endISO || a.startISO || ''));
    const top = allRecent.slice(0, 15);
    // Merge deltas (keeping existing entries' identity), then re-apply the recent
    // ordering so newly completed entries surface without a full list reload.
    const merged = mergeById(get().recentEntries, top)
      .filter((r) => top.some((x) => x.pageId === r.pageId))
      .sort((a, b) => (b.endISO || b.startISO || '').localeCompare(a.endISO || a.startISO || ''));
    set({ recentEntriesLoading: false, recentEntries: merged });
  },

  confirmDelete: (entry, context) => set({ deleteConfirm: { pageId: entry.pageId, title: entry.title, context } }),
  cancelDelete: () => set({ deleteConfirm: null }),

  deleteEntry: async () => {
    const { deleteConfirm } = get();
    if (!deleteConfirm) return;
    const { pageId, context } = deleteConfirm;
    set({ deleteConfirm: null });
    try {
      await api.deletePage(pageId);
      if (context === 'active') {
        const { timer } = get();
        if (timer.tickInterval) clearInterval(timer.tickInterval);
        api.saveSettings({ activeTimer: null });
        api.setTimerRunning(false);
        set((s) => ({
          timer: { ...idleTimer },
          runningTimers: s.runningTimers.filter((r) => r.pageId !== pageId),
        }));
      } else if (context === 'running') {
        set((s) => ({ runningTimers: s.runningTimers.filter((r) => r.pageId !== pageId) }));
      } else {
        set((s) => ({ recentEntries: s.recentEntries.filter((r) => r.pageId !== pageId) }));
      }
      get().loadRunningTimers();
      get().loadRecentEntries();
    } catch (err) {
      get().addToast({ type: 'error', message: `${t('toastDeleteError')}: ${errorMessage(err)}` });
    }
  },

  openNotionPage: (url) => { api.openExternal(url); },

  suspendActiveToNewTimer: () => {
    const state = get();
    if (!state.timer.running) return;

    const aside = {
      pageId: state.timer.notionPageId,
      title: state.description || '',
      startISO: state.timer.startISO,
      workspaceId: state.selectedWorkspaceId || '',
      workspaceName: state.workspaces.find((w) => w.id === state.selectedWorkspaceId)?.name || '',
      propertyMap: state.timer.propertyMap,
    };

    clearInterval(state.timer.tickInterval);
    api.saveSettings({ activeTimer: null });

    const alreadyExists = state.runningTimers.some((t) => t.pageId === aside.pageId);
    const newRunning = alreadyExists ? state.runningTimers : [...state.runningTimers, aside];

    set({
      timer: { ...idleTimer },
      description: '',
      runningTimers: newRunning,
      suspendedTimer: aside,
    });
  },

  loadRunningTimer: async (rt) => {
    const state = get();

    if (state.timer.running && state.timer.tickInterval) {
      clearInterval(state.timer.tickInterval);
    }

    // Only switch workspace when actually needed — avoids resetting extraFieldDefs/extraValues
    if (state.selectedWorkspaceId !== rt.workspaceId) {
      await get().selectWorkspace(rt.workspaceId);
    }

    api.saveSettings({
      activeTimer: {
        notionPageId: rt.pageId,
        roundedStart: rt.startISO,
        rawStart: rt.startISO,
        workspaceId: rt.workspaceId,
        projectId: null,
        projectName: '',
        description: rt.title,
        propertyMap: rt.propertyMap,
      },
    });

    // Only update description; leave runningTimers untouched so the list stays stable.
    // The active/inactive styling is derived from timer.notionPageId, not the list order.
    set({ description: rt.title, suspendedTimer: null });

    get().beginTicking({
      pageId: rt.pageId,
      roundedStart: new Date(rt.startISO),
      startISO: rt.startISO,
      rawStart: new Date(rt.startISO),
      propertyMap: rt.propertyMap,
    });
  },

  stopOtherRunningTimer: async (rt) => {
    const ws = get().workspaces.find((w) => w.id === rt.workspaceId);
    const rm = ws?.roundingMinutes ?? 15;
    const rounding = rm > 0;
    const rawStart = new Date(rt.startISO);
    const roundedStart = rounding ? computeStartTime(rawStart, rm) : rawStart;
    const endTime = rounding ? computeEndTime(roundedStart, new Date(), rm) : new Date();
    try {
      await api.stopTimeEntry({
        pageId: rt.pageId,
        startISO: toNotionDateTime(roundedStart),
        endISO: toNotionDateTime(endTime),
        props: rt.propertyMap,
      });
      const isSuspended = get().suspendedTimer?.pageId === rt.pageId;
      const remainingRunning = get().runningTimers.filter((x) => x.pageId !== rt.pageId);
      set((s) => ({
        runningTimers: remainingRunning,
        suspendedTimer: isSuspended ? null : s.suspendedTimer
      }));
      if (isSuspended && remainingRunning.length > 0) {
        get().loadRunningTimer(remainingRunning[0]);
      }
      get().loadRunningTimers();
      get().loadRecentEntries();
    } catch (err) {
      get().addToast({ type: 'error', message: `${t('toastStopError')}: ${errorMessage(err)}` });
    }
  },

  // ---- Crash recovery ----

  resumeRecoveredTimer: async () => {
    const recovered = get().recoveredTimer;
    if (!recovered) return;
    set({ recoveredTimer: null, description: recovered.description || '', view: 'timer' });
    if (recovered.workspaceId) {
      await get().selectWorkspace(recovered.workspaceId);
      set({ selectedProjectId: recovered.projectId || null });
    }
    get().beginTicking({
      pageId: recovered.notionPageId,
      roundedStart: new Date(recovered.roundedStart),
      startISO: recovered.roundedStart,
      rawStart: new Date(recovered.rawStart || recovered.roundedStart),
      propertyMap: recovered.propertyMap,
    });
  },

  stopRecoveredTimer: async () => {
    const recovered = get().recoveredTimer;
    if (!recovered) return;
    set({ recoveryBusy: true });
    const workspace = get().workspaces.find((w) => w.id === recovered.workspaceId);
    const rounding = workspace?.roundingMinutes ?? 15;
    const rawStart = new Date(recovered.rawStart || recovered.roundedStart);
    const roundedStart = rounding > 0 ? computeStartTime(rawStart, rounding) : rawStart;
    const endTime =
      rounding > 0
        ? computeEndTime(roundedStart, new Date(), rounding)
        : new Date();
    try {
      await api.stopTimeEntry({
        pageId: recovered.notionPageId,
        startISO: toNotionDateTime(roundedStart),
        endISO: toNotionDateTime(endTime),
        props: recovered.propertyMap,
      });
    } catch (err) {
      const msg = errorMessage(err);
      set({ recoveryBusy: false });
      if (isPageDeletedError(msg)) {
        // Page was deleted — just discard locally
        api.saveSettings({ activeTimer: null });
        set({ recoveredTimer: null, recoveryBusy: false });
        get().addToast({ type: 'info', message: t('toastDeletedPageDiscarded') });
        get().loadRunningTimers();
        get().loadRecentEntries();
        return;
      }
      get().addToast({ type: 'error', message: `${t('toastRecoveryStopError')}: ${msg}` });
      return;
    }
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null, recoveryBusy: false });
    get().loadRunningTimers();
    get().loadRecentEntries();
    get().loadRecentEntries();
  },

  discardRecoveredTimer: () => {
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null });
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Theme ----

  setTheme: async (theme) => {
    await api.saveSettings({ theme });
    set({ theme });
    get().applyTheme();
  },

  applyTheme: () => {
    const { theme } = get();
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.remove('dark', 'light');
    }
  },

  // ---- Refresh ----

  refreshAll: () => {
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Edit running timer ----

  updateTimerDetails: async (projectId, description, extraValues) => {
    const state = get();
    if (!state.timer.running) return;
    const pm = state.timer.propertyMap;
    // Allow empty title — do not fall back to a default
    const newTitle = description.trim();

    const properties = {};
    if (pm?.timeEntryTitleProp) {
      properties[pm.timeEntryTitleProp] = {
        title: [{ text: { content: newTitle } }],
      };
    }
    if (pm?.timeEntryRelationProp) {
      properties[pm.timeEntryRelationProp] = projectId
        ? { relation: [{ id: projectId }] }
        : { relation: [] };
    }
    for (const def of state.extraFieldDefs) {
      const value = buildPropertyValue(def.type, extraValues[def.name]);
      if (value) properties[def.name] = value;
      else if (value === null && def.type !== 'checkbox') {
        // Explicitly clear optional fields when set to empty
        properties[def.name] = buildEmptyNotionValue(def.type);
      }
    }

    try {
      await api.updatePage(state.timer.notionPageId, properties);
    } catch (err) {
      const msg = errorMessage(err);
      if (isPageDeletedError(msg)) {
        get()._showDeletedPageDialog(state.timer);
        return;
      }
      get().addToast({ type: 'error', message: `${t('toastUpdateError')}: ${msg}` });
      return;
    }

    set({
      description: newTitle,
      selectedProjectId: projectId,
      extraValues,
    });
    const updatedTimer = {
      notionPageId: state.timer.notionPageId,
      roundedStart: state.timer.startISO,
      rawStart: state.timer.rawStart?.toISOString?.() ?? state.timer.startISO,
      workspaceId: state.selectedWorkspaceId,
      projectId,
      projectName: '',
      description: newTitle,
      propertyMap: pm,
      extraValues,
    };
    api.saveSettings({ activeTimer: updatedTimer });

    // Refresh to ensure consistency
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Deleted page handling ----

  _showDeletedPageDialog: (timer) => {
    set({
      isStopping: false,
      deletedPageInfo: {
        notionPageId: timer.notionPageId,
        title: get().description || '',
        startISO: timer.startISO || timer.roundedStart || null,
      },
    });
  },

  dismissDeletedPage: () => {
    const { deletedPageInfo, timer } = get();
    if (!deletedPageInfo) return;
    // Clear the active timer locally
    if (timer.running) {
      clearInterval(timer.tickInterval);
      api.saveSettings({ activeTimer: null });
      api.setTimerRunning(false);
      set({ timer: { ...idleTimer }, deletedPageInfo: null });
    } else {
      set({ deletedPageInfo: null });
    }
    get().loadRunningTimers();
    get().loadRecentEntries();
  },
}));

// ---- Helpers ----

/**
 * Merges `incoming` into `current` keyed by pageId: existing entries keep their
 * position and are updated in place, entries no longer present are dropped, and
 * genuinely new entries are appended. This avoids clearing and fully reloading
 * the list on every refresh.
 */
function mergeById(current, incoming) {
  const incomingById = new Map(incoming.map((x) => [x.pageId, x]));
  const merged = current
    .filter((x) => incomingById.has(x.pageId))
    .map((x) => ({ ...x, ...incomingById.get(x.pageId) }));
  const existingIds = new Set(merged.map((x) => x.pageId));
  for (const item of incoming) {
    if (!existingIds.has(item.pageId)) merged.push(item);
  }
  return merged;
}

function isPageDeletedError(msg) {
  const lower = (msg || '').toLowerCase();
  return (
    lower.includes('404') ||
    lower.includes('not_found') ||
    lower.includes('object_not_found') ||
    lower.includes('could not find page') ||
    lower.includes('page not found')
  );
}

function buildEmptyNotionValue(type) {
  switch (type) {
    case 'rich_text': return { rich_text: [] };
    case 'select': return { select: null };
    case 'multi_select': return { multi_select: [] };
    case 'url': return { url: null };
    case 'email': return { email: null };
    case 'phone_number': return { phone_number: null };
    case 'number': return { number: null };
    case 'date': return { date: null };
    case 'relation': return { relation: [] };
    default: return null;
  }
}
