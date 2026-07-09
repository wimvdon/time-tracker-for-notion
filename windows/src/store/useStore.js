import { create } from 'zustand';
import { computeStartTime, computeEndTime } from '../lib/rounding.js';
import { toNotionDateTime, formatDateStr } from '../lib/format.js';
import { t, setLocale } from '../lib/i18n.js';
import { errorMessage } from '../lib/errors.js';
import { WRITABLE_EXTRA_TYPES, emptyValueFor, buildPropertyValue, parsePropertyValue } from '../lib/notionValues.js';

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

// How long a locally-stopped timer is hidden from the running-timer list while
// Notion's query catches up.
const RECENTLY_STOPPED_TTL_MS = 60_000;

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

  // Notion-page sync
  syncPageId: null,
  syncPageTitle: '',
  syncPageUrl: '',
  settingsUpdatedAt: null,
  lastSyncedUpdatedAt: null,
  syncing: false,
  syncError: null,

  // UI
  view: 'timer',
  toasts: [],
  isStarting: false,
  isStopping: false,
  theme: 'auto',
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
  // pageId -> timestamp of timers stopped locally. Notion's running-timer query
  // can briefly still return a just-stopped entry (replication lag); we ignore
  // those so the app doesn't re-adopt them (which would re-colour the tray icon).
  recentlyStopped: {},
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
      syncPageId: settings.syncPageId || null,
      syncPageTitle: settings.syncPageTitle || '',
      syncPageUrl: settings.syncPageUrl || '',
      settingsUpdatedAt: settings.settingsUpdatedAt || null,
      lastSyncedUpdatedAt: settings.lastSyncedUpdatedAt || null,
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

    if (settings.apiKey && settings.syncPageId) {
      get().syncNow();
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
      if (s.apiKey && s.workspaces.length) {
        get().loadRunningTimers();
        get().loadRecentEntries();
      }
      if (s.apiKey && s.syncPageId) {
        get().syncNow();
      }
    }, 60_000);
  },

  saveApiKey: async (apiKey) => {
    await api.saveSettings({ apiKey });
    set({ apiKey });
  },

  // Bumped whenever a synced field (workspaces/presets, theme, locale, formats,
  // Notion-action toggles) changes, so syncNow() knows this device has local
  // edits that need pushing.
  touchSettingsUpdatedAt: () => {
    const ts = new Date().toISOString();
    set({ settingsUpdatedAt: ts });
    api.saveSettings({ settingsUpdatedAt: ts });
  },

  addWorkspace: async (workspace) => {
    const workspaces = [...get().workspaces, workspace];
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
    get().touchSettingsUpdatedAt();
  },

  updateWorkspace: async (updatedWorkspace) => {
    const workspaces = get().workspaces.map((w) =>
      w.id === updatedWorkspace.id ? updatedWorkspace : w
    );
    await api.saveSettings({ workspaces });
    set({ workspaces });
    api.notifySettingsChanged?.();
    get().touchSettingsUpdatedAt();
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
    get().touchSettingsUpdatedAt();
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
    get().touchSettingsUpdatedAt();
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
    get().touchSettingsUpdatedAt();
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
    get().touchSettingsUpdatedAt();
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
    // Update state first so the reorder is visible immediately, then persist.
    set({ workspaces });
    api.notifySettingsChanged?.();
    await api.saveSettings({ workspaces });
    get().touchSettingsUpdatedAt();
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
    // Update state first so the reorder is visible immediately, then persist.
    set({ workspaces });
    api.notifySettingsChanged?.();
    await api.saveSettings({ workspaces });
    get().touchSettingsUpdatedAt();
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
    get().touchSettingsUpdatedAt();
  },

  setShowArchiveAction: async (value) => {
    await api.saveSettings({ showArchiveAction: value });
    set({ showArchiveAction: value });
    get().touchSettingsUpdatedAt();
  },

  setLocale: async (locale) => {
    await api.saveSettings({ locale });
    setLocale(locale);
    set({ locale });
    get().touchSettingsUpdatedAt();
  },

  setDateFormat: async (dateFormat) => {
    await api.saveSettings({ dateFormat });
    set({ dateFormat });
    get().touchSettingsUpdatedAt();
  },

  setTimeFormat: async (timeFormat) => {
    await api.saveSettings({ timeFormat });
    set({ timeFormat });
    get().touchSettingsUpdatedAt();
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
        pendingStartAction: async () => {
          const stopped = await get()._stopActivePage();
          if (!stopped) return;
          await action();
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

  // Only reachable while a timer is running; stops it (via the confirmation
  // dialog) and drops back to the idle form so a fresh timer can be composed.
  onPlusButtonClicked: () => {
    if (!get().timer.running) return;
    set({
      showAlreadyRunningWarning: true,
      pendingStartAction: async () => {
        const stopped = await get()._stopActivePage();
        if (!stopped) return;
        get().loadRunningTimers();
        get().loadRecentEntries();
      }
    });
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

  /**
   * Stops the currently active timer's Notion page and clears the local
   * "active" slot (tray reset to idle). Does not touch `runningTimers` or
   * decide what happens next — callers do that (promote another running
   * timer, leave idle, or immediately start a new one). Returns true on
   * success, false if the write failed (a toast/dialog is shown either way).
   */
  _stopActivePage: async (manualEnd = null) => {
    const { timer, addToast } = get();
    if (!timer.running) return true;

    const rm = get().getRoundingMinutes();
    const rounding = rm > 0;
    const rawStart = new Date(timer.rawStart);
    if (manualEnd && manualEnd.getTime() < rawStart.getTime()) {
      addToast({ type: 'error', message: t('toastEndBeforeStart') });
      return false;
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
      if (isPageDeletedError(msg)) {
        get()._showDeletedPageDialog(timer);
        return false;
      }
      addToast({
        type: 'error',
        sticky: true,
        message: `${t('toastStopError')}: ${msg}`,
        action: { label: t('toastStopRetry'), run: () => get().stopTimer(manualEnd) },
      });
      return false;
    }

    clearInterval(timer.tickInterval);
    get()._markStopped(timer.notionPageId);
    api.saveSettings({ activeTimer: null });
    api.setTimerRunning(false);

    const extraValues = {};
    for (const def of get().extraFieldDefs) {
      extraValues[def.name] = emptyValueFor(def.type);
    }
    set({ timer: { ...idleTimer }, description: '', extraValues });
    return true;
  },

  stopTimer: async (manualEnd = null) => {
    const { timer, isStopping } = get();
    if (isStopping || !timer.running) return;
    set({ isStopping: true });

    const stoppedPageId = timer.notionPageId;
    const ok = await get()._stopActivePage(manualEnd);
    set({ isStopping: false });
    if (!ok) return;

    const remainingRunning = get().runningTimers.filter((x) => x.pageId !== stoppedPageId);
    set({ runningTimers: remainingRunning });
    if (remainingRunning.length > 0) {
      get().loadRunningTimer(remainingRunning[0]);
    }
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Running timers loaded from Notion ----

  loadRunningTimers: async () => {
    const { workspaces, apiKey, runningTimersLoading } = get();
    if (!apiKey || !workspaces.length || runningTimersLoading) return;

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

    // Drop entries that were just stopped locally (Notion replication lag), and
    // prune the guard map of anything older than its TTL.
    const now = Date.now();
    const recentlyStopped = {};
    for (const [pid, ts] of Object.entries(get().recentlyStopped)) {
      if (now - ts < RECENTLY_STOPPED_TTL_MS) recentlyStopped[pid] = ts;
    }
    const visibleRunning = allRunning.filter((rt) => !recentlyStopped[rt.pageId]);

    // Merge deltas into the existing list instead of replacing it wholesale, so
    // entries that are still running keep their identity/position (no flicker or
    // momentary disappearance while switching timers).
    set({ runningTimersLoading: false, runningTimers: mergeById(get().runningTimers, visibleRunning), recentlyStopped });

    // If the active timer is no longer running in Notion (stopped elsewhere), clear it
    const activeTimer = get().timer;
    if (activeTimer.running && activeTimer.notionPageId) {
      const stillRunning = visibleRunning.some((rt) => rt.pageId === activeTimer.notionPageId);
      if (!stillRunning) {
        clearInterval(activeTimer.tickInterval);
        api.saveSettings({ activeTimer: null });
        api.setTimerRunning(false);
        set({ timer: { ...idleTimer } });
        get().addToast({ type: 'info', message: t('timerStoppedElsewhere') });
      }
    } else if (!activeTimer.running && visibleRunning.length > 0) {
      get().loadRunningTimer(visibleRunning[0]);
    }
  },

  _markStopped: (pageId) => {
    if (!pageId) return;
    set((s) => ({ recentlyStopped: { ...s.recentlyStopped, [pageId]: Date.now() } }));
  },

  loadRecentEntries: async () => {
    const { workspaces, apiKey, recentEntriesLoading } = get();
    if (!apiKey || !workspaces.length || recentEntriesLoading) return;

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
      get()._markStopped(pageId);
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
    set({ description: rt.title });

    get().beginTicking({
      pageId: rt.pageId,
      roundedStart: new Date(rt.startISO),
      startISO: rt.startISO,
      rawStart: new Date(rt.startISO),
      propertyMap: rt.propertyMap,
    });

    // The running-timers list only carries title/start/url, so fetch the page's
    // full properties to restore its connected project and extra field values
    // (relation, select, etc.) instead of leaving them blank.
    const workspace = get().workspaces.find((w) => w.id === rt.workspaceId);
    if (!workspace) return;
    try {
      const props = await api.getPageProperties(rt.pageId);
      if (get().timer.notionPageId !== rt.pageId) return;

      const relProp = rt.propertyMap?.timeEntryRelationProp;
      const projectId = relProp ? parsePropertyValue('relation', props[relProp]) || null : null;
      let projectName = '';
      if (projectId && workspace.projectsDbId) {
        const pages = await api.fetchDatabasePages(workspace.projectsDbId).catch(() => []);
        projectName = pages.find((p) => p.id === projectId)?.name ?? '';
      }

      // Don't rely on the store's extraFieldDefs — it may still belong to a
      // different workspace or not have finished loading yet. Fetch the live
      // schema directly, same as loadExtraFields does, to get the real type
      // for each configured extra field.
      const extraValues = {};
      if (workspace.extraProps?.length && workspace.timeEntriesDbId) {
        const schema = await api.getDatabaseSchema(workspace.timeEntriesDbId).catch(() => ({}));
        for (const { propName: name } of workspace.extraProps) {
          const type = schema?.[name]?.type;
          if (!type || !WRITABLE_EXTRA_TYPES.includes(type)) continue;
          extraValues[name] = parsePropertyValue(type, props[name]);
        }
      }

      if (get().timer.notionPageId !== rt.pageId) return;
      set({ selectedProjectId: projectId, extraValues });
      api.saveSettings({
        activeTimer: {
          notionPageId: rt.pageId,
          roundedStart: rt.startISO,
          rawStart: rt.startISO,
          workspaceId: rt.workspaceId,
          projectId,
          projectName,
          description: rt.title,
          propertyMap: rt.propertyMap,
        },
      });
    } catch {
      // Keep the blank project/extra values on failure — the timer itself is
      // already loaded and usable.
    }
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
      get()._markStopped(rt.pageId);
      set((s) => ({ runningTimers: s.runningTimers.filter((x) => x.pageId !== rt.pageId) }));
      get().loadRunningTimers();
      get().loadRecentEntries();
    } catch (err) {
      get().addToast({ type: 'error', message: `${t('toastStopError')}: ${errorMessage(err)}` });
    }
  },

  // ---- Theme ----

  setTheme: async (theme) => {
    await api.saveSettings({ theme });
    set({ theme });
    get().applyTheme();
    get().touchSettingsUpdatedAt();
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
    const s = get();
    if (s.apiKey && s.syncPageId) {
      get().syncNow();
    }
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Notion-page sync ----

  createSyncPage: async (parentPageId, title) => {
    const state = get();
    set({ syncing: true, syncError: null });
    try {
      const now = new Date().toISOString();
      const payload = buildSyncPayload(state, now);
      const { pageId } = await api.createSyncPage(parentPageId, title.trim(), payload);
      await api.saveSettings({
        syncPageId: pageId,
        syncPageTitle: title.trim(),
        syncPageUrl: '',
        settingsUpdatedAt: now,
        lastSyncedUpdatedAt: now,
      });
      set({
        syncPageId: pageId,
        syncPageTitle: title.trim(),
        syncPageUrl: '',
        settingsUpdatedAt: now,
        lastSyncedUpdatedAt: now,
        syncing: false,
      });
      get().addToast({ type: 'success', message: t('toastSyncCreated') });
      return true;
    } catch (err) {
      set({ syncing: false, syncError: errorMessage(err) });
      return false;
    }
  },

  /** Attaches to an existing page; fails (returns false) if it has no sync data. */
  loadExistingSyncPage: async (pageId, title) => {
    set({ syncing: true, syncError: null });
    try {
      const result = await api.fetchSyncPage(pageId);
      if (!result) {
        set({ syncing: false, syncError: t('errorNotASyncPage') });
        return false;
      }
      applySyncPayload(set, get, result.payload);
      await api.saveSettings({
        syncPageId: pageId,
        syncPageTitle: title || '',
        settingsUpdatedAt: result.payload.updatedAt,
        lastSyncedUpdatedAt: result.payload.updatedAt,
      });
      set({
        syncPageId: pageId,
        syncPageTitle: title || '',
        settingsUpdatedAt: result.payload.updatedAt,
        lastSyncedUpdatedAt: result.payload.updatedAt,
        syncing: false,
      });
      get().addToast({ type: 'success', message: t('toastSyncConnected') });
      return true;
    } catch (err) {
      set({ syncing: false, syncError: errorMessage(err) });
      return false;
    }
  },

  disconnectSync: async () => {
    await api.saveSettings({
      syncPageId: undefined,
      syncPageTitle: undefined,
      syncPageUrl: undefined,
      lastSyncedUpdatedAt: undefined,
    });
    set({ syncPageId: null, syncPageTitle: '', syncPageUrl: '', lastSyncedUpdatedAt: null });
  },

  /** Pull-or-push against the configured sync page, whichever side is newer. */
  syncNow: async () => {
    const state = get();
    if (!state.apiKey || !state.syncPageId || state.syncing) return;
    set({ syncing: true, syncError: null });
    try {
      const result = await api.fetchSyncPage(state.syncPageId);
      if (!result) {
        set({ syncing: false, syncError: t('errorNotASyncPage') });
        return;
      }
      const { blockId, payload: remote } = result;
      const local = get();
      if (remote.updatedAt > (local.settingsUpdatedAt || '')) {
        // Remote is newer — pull it in.
        applySyncPayload(set, get, remote);
        await api.saveSettings({ settingsUpdatedAt: remote.updatedAt, lastSyncedUpdatedAt: remote.updatedAt });
        set({ settingsUpdatedAt: remote.updatedAt, lastSyncedUpdatedAt: remote.updatedAt });
      } else if (local.settingsUpdatedAt && local.settingsUpdatedAt !== local.lastSyncedUpdatedAt) {
        // Local has unsynced edits — push them.
        const snapshot = buildSyncPayload(local, local.settingsUpdatedAt);
        await api.updateSyncBlock(blockId, snapshot);
        await api.saveSettings({ lastSyncedUpdatedAt: local.settingsUpdatedAt });
        set({ lastSyncedUpdatedAt: local.settingsUpdatedAt });
      }
      set({ syncing: false });
    } catch (err) {
      set({ syncing: false, syncError: errorMessage(err) });
    }
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

/** Builds the payload written to the sync page's code block. Excludes the
 * Notion API key and device-local toggles (alwaysOnTop, startWithWindows). */
function buildSyncPayload(state, updatedAt) {
  return {
    updatedAt,
    workspaces: state.workspaces,
    theme: state.theme,
    locale: state.locale,
    dateFormat: state.dateFormat,
    timeFormat: state.timeFormat,
    showNotionLink: state.showNotionLink,
    showArchiveAction: state.showArchiveAction,
  };
}

/** Applies a fetched sync payload to local state and persists it. */
function applySyncPayload(set, get, payload) {
  const patch = { workspaces: payload.workspaces };
  if (payload.theme !== undefined) patch.theme = payload.theme;
  if (payload.locale !== undefined) { setLocale(payload.locale); patch.locale = payload.locale; }
  if (payload.dateFormat !== undefined) patch.dateFormat = payload.dateFormat;
  if (payload.timeFormat !== undefined) patch.timeFormat = payload.timeFormat;
  if (payload.showNotionLink !== undefined) patch.showNotionLink = payload.showNotionLink;
  if (payload.showArchiveAction !== undefined) patch.showArchiveAction = payload.showArchiveAction;
  api.saveSettings(patch);
  set(patch);
  get().applyTheme();
}

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
