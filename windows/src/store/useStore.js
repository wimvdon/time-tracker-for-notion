import { create } from 'zustand';
import { computeStartTime, computeEndTime } from '../lib/rounding.js';
import { toNotionDateTime, formatDateDDMMYYYY } from '../lib/format.js';
import { t } from '../lib/i18n.js';
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

  // UI
  view: 'timer',
  toasts: [],
  recoveredTimer: null,
  recoveryBusy: false,
  editTimerOpen: false,
  theme: 'auto',

  // Session state
  selectedWorkspaceId: null,
  projects: [],
  projectsLoading: false,
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

  // Deleted-page dialog: { notionPageId, title, description, startISO }
  deletedPageInfo: null,

  setView: (view) => set({ view }),
  setDescription: (description) => set({ description }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setExtraValue: (name, value) =>
    set((s) => ({ extraValues: { ...s.extraValues, [name]: value } })),

  getRoundingMinutes: () => {
    const ws = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    return ws?.roundingMinutes ?? 15;
  },

  getRoundingEnabled: () => get().getRoundingMinutes() > 0,

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

    set({
      apiKey: settings.apiKey || '',
      workspaces,
      alwaysOnTop: settings.alwaysOnTop !== false,
      theme: settings.theme || 'auto',
    });

    if (!settings.apiKey || !workspaces.length) {
      set({ view: 'settings' });
    }

    if (activeTimer && activeTimer.notionPageId) {
      set({ recoveredTimer: activeTimer });
    } else if (lastUsedWorkspaceId) {
      const exists = workspaces.some((w) => w.id === lastUsedWorkspaceId);
      if (exists) get().selectWorkspace(lastUsedWorkspaceId);
    }

    if (settings.apiKey && workspaces.length && !(activeTimer && activeTimer.notionPageId)) {
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
        projects: [],
        selectedProjectId: null,
      });
      await api.saveSettings({ lastUsedWorkspaceId: null });
    }
    set(patch);
    api.notifySettingsChanged?.();
  },

  toggleAlwaysOnTop: async (value) => {
    await api.setAlwaysOnTop(value);
    set({ alwaysOnTop: value });
  },

  // ---- Workspace / project selection ----

  selectWorkspace: async (workspaceId) => {
    const workspace = get().workspaces.find((w) => w.id === workspaceId);
    set({
      selectedWorkspaceId: workspaceId,
      projects: [],
      selectedProjectId: null,
      projectsLoading: !!workspace,
      extraFieldDefs: [],
      extraValues: {},
      extrasLoading: !!workspace && (workspace.extraProps?.length ?? 0) > 0,
    });
    api.saveSettings({ lastUsedWorkspaceId: workspaceId });
    if (!workspace) return;
    get().loadExtraFields(workspace);
    try {
      const projects = await api.fetchDatabasePages(workspace.projectsDbId);
      if (get().selectedWorkspaceId !== workspaceId) return;
      set({ projects, projectsLoading: false, selectedProjectId: null });
    } catch (err) {
      if (get().selectedWorkspaceId !== workspaceId) return;
      set({ projectsLoading: false });
      get().addToast({ type: 'error', message: `${t('toastProjectsError')}: ${errorMessage(err)}` });
    }
  },

  loadExtraFields: async (workspace) => {
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
      const extraValues = {};
      for (const def of defs) {
        extraValues[def.name] = emptyValueFor(def.type);
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
    if (state.timer.running) return;
    const workspace = state.workspaces.find((w) => w.id === state.selectedWorkspaceId);
    if (!workspace) return;
    const project = state.projects.find((p) => p.id === state.selectedProjectId);

    const rm = get().getRoundingMinutes();
    const roundedStart = rm > 0 ? computeStartTime(new Date(), rm) : new Date();
    const startISO = toNotionDateTime(roundedStart);
    const title =
      state.description.trim() ||
      (project ? `${project.name} — ${formatDateDDMMYYYY(roundedStart)}` : formatDateDDMMYYYY(roundedStart));

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
        projectId: project?.id,
        props: workspace.propertyMap,
        extra,
      }));
    } catch (err) {
      state.addToast({ type: 'error', message: `${t('toastStartError')}: ${errorMessage(err)}` });
      return;
    }

    const rawStart = new Date();
    api.saveSettings({
      activeTimer: {
        notionPageId: pageId,
        roundedStart: startISO,
        rawStart: rawStart.toISOString(),
        workspaceId: workspace.id,
        projectId: project?.id,
        projectName: project?.name ?? '',
        description: state.description,
        propertyMap: workspace.propertyMap,
      },
    });
    get().beginTicking({
      pageId,
      roundedStart,
      startISO,
      rawStart,
      propertyMap: workspace.propertyMap,
    });
  },

  /**
   * Applies a preset: sets workspace, description, and extra values, then starts
   * the timer immediately.
   */
  applyPreset: async (workspaceId, preset) => {
    const state = get();
    if (state.timer.running) return;

    // Switch workspace if needed
    if (state.selectedWorkspaceId !== workspaceId) {
      await get().selectWorkspace(workspaceId);
    }

    // Set description and extra values from preset
    set({ description: preset.pageTitle || '' });
    if (preset.extraValues && Object.keys(preset.extraValues).length > 0) {
      set({ extraValues: { ...get().extraValues, ...preset.extraValues } });
    }

    // Start timer immediately
    await get().startTimer();
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
      },
    });
    api.setTimerRunning(true);
  },

  updateStartTime: (newStart) => {
    const state = get();
    if (!state.timer.running) return;
    const rm = state.getRoundingMinutes();
    const roundedStart = rm > 0 ? computeStartTime(newStart, rm) : newStart;
    const startISO = toNotionDateTime(roundedStart);
    set((s) => ({
      timer: {
        ...s.timer,
        roundedStart,
        startISO,
        rawStart: newStart,
        elapsedSeconds: Math.max(0, Math.floor((Date.now() - newStart.getTime()) / 1000)),
      },
    }));
    const project = state.projects.find((p) => p.id === state.selectedProjectId);
    api.saveSettings({
      activeTimer: {
        notionPageId: state.timer.notionPageId,
        roundedStart: startISO,
        rawStart: newStart.toISOString(),
        workspaceId: state.selectedWorkspaceId,
        projectId: state.selectedProjectId,
        projectName: project?.name ?? '',
        description: state.description,
        propertyMap: state.timer.propertyMap,
      },
    });
  },

  stopTimer: async (manualEnd = null) => {
    const { timer, addToast } = get();
    if (!timer.running) return;

    const rm = get().getRoundingMinutes();
    const rounding = rm > 0;
    if (manualEnd) {
      const earliest = Math.min(timer.rawStart.getTime(), timer.roundedStart.getTime());
      if (manualEnd.getTime() < earliest || (!rounding && manualEnd.getTime() <= earliest)) {
        addToast({ type: 'error', message: t('toastEndBeforeStart') });
        return;
      }
    }
    const endTime = rounding
      ? computeEndTime(timer.roundedStart, manualEnd ?? new Date(), rm)
      : manualEnd ?? new Date();
    try {
      await api.stopTimeEntry({
        pageId: timer.notionPageId,
        startISO: timer.startISO,
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
      addToast({
        type: 'error',
        sticky: true,
        message: `${t('toastStopError')}: ${msg}`,
        action: { label: t('toastStopRetry'), run: () => get().stopTimer() },
      });
      return;
    }

    clearInterval(timer.tickInterval);
    api.saveSettings({ activeTimer: null });
    const workspace = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    const extraValues = {};
    for (const def of get().extraFieldDefs) {
      extraValues[def.name] = emptyValueFor(def.type);
    }
    set({ timer: { ...idleTimer }, description: '', extraValues });
    api.setTimerRunning(false);
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
    set({ runningTimersLoading: false, runningTimers: allRunning });

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
    set({ recentEntriesLoading: false, recentEntries: allRecent.slice(0, 15) });
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

    set((s) => ({
      timer: { ...idleTimer },
      description: '',
      runningTimers: [...s.runningTimers, aside],
    }));

    api.setTimerRunning(false);
  },

  loadRunningTimer: (rt) => {
    const state = get();

    if (state.timer.running && state.timer.tickInterval) {
      clearInterval(state.timer.tickInterval);
    }

    const previouslyActive = state.timer.running
      ? {
          pageId: state.timer.notionPageId,
          title: state.description || '',
          startISO: state.timer.startISO,
          workspaceId: state.selectedWorkspaceId || '',
          workspaceName: state.workspaces.find((w) => w.id === state.selectedWorkspaceId)?.name || '',
          propertyMap: state.timer.propertyMap,
        }
      : null;

    get().selectWorkspace(rt.workspaceId);

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

    set((s) => {
      const others = s.runningTimers.filter((x) => x.pageId !== rt.pageId);
      if (previouslyActive) others.push(previouslyActive);
      return { runningTimers: others, description: rt.title };
    });

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
    const roundedStart = new Date(rt.startISO);
    const endTime = rm > 0 ? computeEndTime(roundedStart, new Date(), rm) : new Date();
    try {
      await api.stopTimeEntry({
        pageId: rt.pageId,
        startISO: rt.startISO,
        endISO: toNotionDateTime(endTime),
        props: rt.propertyMap,
      });
      set((s) => ({ runningTimers: s.runningTimers.filter((x) => x.pageId !== rt.pageId) }));
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
    const rm = workspace?.roundingMinutes ?? 15;
    const endTime =
      rm > 0
        ? computeEndTime(new Date(recovered.roundedStart), new Date(), rm)
        : new Date();
    try {
      await api.stopTimeEntry({
        pageId: recovered.notionPageId,
        startISO: recovered.roundedStart,
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

  openEditTimer: () => set({ editTimerOpen: true }),
  closeEditTimer: () => set({ editTimerOpen: false }),

  updateTimerDetails: async (projectId, description, extraValues) => {
    const state = get();
    if (!state.timer.running) return;
    const pm = state.timer.propertyMap;
    const project = state.projects.find((p) => p.id === projectId);
    const projectName = project?.name ?? '';
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
      editTimerOpen: false,
    });
    const updatedTimer = {
      notionPageId: state.timer.notionPageId,
      roundedStart: state.timer.startISO,
      rawStart: state.timer.rawStart?.toISOString?.() ?? state.timer.startISO,
      workspaceId: state.selectedWorkspaceId,
      projectId,
      projectName,
      description: newTitle,
      propertyMap: pm,
    };
    api.saveSettings({ activeTimer: updatedTimer });

    // Refresh to ensure consistency
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  // ---- Deleted page handling ----

  _showDeletedPageDialog: (timer) => {
    set({
      deletedPageInfo: {
        notionPageId: timer.notionPageId,
        title: get().description || '',
        description: get().description || '',
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
