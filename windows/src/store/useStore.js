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
  if (old.timeEntryTitleProp !== undefined) return old; // already new shape
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
  if (at.workspaceId !== undefined) return at; // already new shape
  return {
    notionPageId: at.notionPageId,
    roundedStart: at.roundedStart,
    rawStart: at.rawStart,
    workspaceId: at.projectId ?? null, // "project" used to mean workspace
    projectId: at.deelprojectId ?? null,
    projectName: at.deelprojectName ?? '',
    description: at.description ?? '',
    propertyMap: migratePropertyMap(at.propertyMap),
  };
};

let toastSeq = 0;

export const useStore = create((set, get) => ({
  // Settings (synced from electron-store)
  apiKey: '',
  workspaces: [],
  alwaysOnTop: true,

  // UI
  view: 'timer', // 'timer' | 'settings'
  toasts: [],
  recoveredTimer: null, // orphaned activeTimer found on launch
  recoveryBusy: false,

  // Session state
  selectedWorkspaceId: null,
  projects: [],
  projectsLoading: false,
  selectedProjectId: null,
  description: '',
  // Extra fields of the selected workspace, resolved against the live schema:
  // [{ name, type, options: [{ id?, name }] }] and their current input values
  extraFieldDefs: [],
  extrasLoading: false,
  extraValues: {},

  // Timer state
  timer: { ...idleTimer },

  // Running timers fetched from Notion
  runningTimers: [],
  runningTimersLoading: false,
  recentEntries: [],
  recentEntriesLoading: false,
  deleteConfirm: null, // { pageId, title, context } where context is 'active' | 'running' | 'recent'

  setView: (view) => set({ view }),
  setDescription: (description) => set({ description }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setExtraValue: (name, value) =>
    set((s) => ({ extraValues: { ...s.extraValues, [name]: value } })),

  /** Returns the rounding interval in minutes; 0 means rounding is off. */
  getRoundingMinutes: () => {
    const ws = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    return ws?.roundingMinutes ?? 15;
  },

  /** Convenience helper: true when any rounding is configured. */
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

    // Migrate the old "projects as app configs" schema to workspaces.
    // Note: electron-store injects `workspaces: []` as a default, so the
    // presence of legacy data is what decides whether to migrate.
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

    // Migrate extraProps from string[] to { propName, defaultValue }[]
    // and roundingEnabled boolean to roundingMinutes number.
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
      return { ...ws, extraProps, roundingMinutes };
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
    });

    // First launch: send the user to Settings
    if (!settings.apiKey || !workspaces.length) {
      set({ view: 'settings' });
    }

    // Crash recovery: a timer was running when the app last closed
    if (activeTimer && activeTimer.notionPageId) {
      set({ recoveredTimer: activeTimer });
    } else if (lastUsedWorkspaceId) {
      const exists = workspaces.some((w) => w.id === lastUsedWorkspaceId);
      if (exists) get().selectWorkspace(lastUsedWorkspaceId);
    }

    // Load running timers from Notion (skipped if crash recovery is pending)
    if (settings.apiKey && workspaces.length && !(activeTimer && activeTimer.notionPageId)) {
      get().loadRunningTimers();
      get().loadRecentEntries();
    }
  },

  saveApiKey: async (apiKey) => {
    await api.saveSettings({ apiKey });
    set({ apiKey });
  },

  addWorkspace: async (workspace) => {
    const workspaces = [...get().workspaces, workspace];
    await api.saveSettings({ workspaces });
    set({ workspaces });
  },

  updateWorkspace: async (updatedWorkspace) => {
    const workspaces = get().workspaces.map((w) =>
      w.id === updatedWorkspace.id ? updatedWorkspace : w
    );
    await api.saveSettings({ workspaces });
    set({ workspaces });
    // If this is the selected workspace, re-fetch projects in case the
    // databases or property mapping changed
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
      // Ignore stale responses if the user switched workspaces meanwhile
      if (get().selectedWorkspaceId !== workspaceId) return;
      set({ projects, projectsLoading: false, selectedProjectId: null });
    } catch (err) {
      if (get().selectedWorkspaceId !== workspaceId) return;
      set({ projectsLoading: false });
      get().addToast({ type: 'error', message: `${t('toastProjectsError')}: ${errorMessage(err)}` });
    }
  },

  /**
   * Resolves the workspace's extra fields against the live database schema:
   * current property types, select/status option lists, workspace members for
   * people fields, and pages of the related database for relation fields.
   * Fields that no longer exist (or are no longer writable) are skipped.
   */
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
        const workspace_ep = workspace.extraProps.find((ep) => ep.propName === def.name);
        const configuredDefault = workspace_ep?.defaultValue ?? null;
        extraValues[def.name] =
          configuredDefault !== null && configuredDefault !== ''
            ? configuredDefault
            : emptyValueFor(def.type);
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

    // Extra fields: empty values are skipped, so Notion keeps its defaults
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
    // Persist so the timer survives a crash / force quit
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

  /** Shared by startTimer and crash-recovery resume. */
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

  /**
   * Applies a manually edited start time to the running timer. The rounding
   * rules of the workspace apply. The corrected start is persisted for crash
   * recovery and written to Notion with the PATCH on stop (which always sends
   * the start).
   */
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

  /**
   * Stops the timer. With a manually entered end time (`manualEnd`), that
   * time is used instead of "now" — still subject to the workspace's
   * rounding rules.
   */
  stopTimer: async (manualEnd = null) => {
    const { timer, addToast } = get();
    if (!timer.running) return;

    const rm = get().getRoundingMinutes();
    const rounding = rm > 0;
    if (manualEnd) {
      // Reject ends before the timer began; with rounding the minimum-
      // duration rule handles ends between the raw and rounded start
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
        startISO: timer.startISO, // exact value from creation, never re-rounded
        endISO: toNotionDateTime(endTime),
        props: timer.propertyMap,
      });
    } catch (err) {
      // Keep the timer state intact so the user can retry
      addToast({
        type: 'error',
        sticky: true,
        message: `${t('toastStopError')}: ${errorMessage(err)}`,
        action: { label: t('toastStopRetry'), run: () => get().stopTimer() },
      });
      return;
    }

    clearInterval(timer.tickInterval);
    api.saveSettings({ activeTimer: null });
    const workspace = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    const extraValues = {};
    for (const def of get().extraFieldDefs) {
      const ep = workspace?.extraProps?.find((p) => p.propName === def.name);
      const configured = ep?.defaultValue ?? null;
      extraValues[def.name] =
        configured !== null && configured !== '' ? configured : emptyValueFor(def.type);
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
    set({ recentEntriesLoading: false, recentEntries: allRecent.slice(0, 5) });
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

  /**
   * Puts the active timer aside (into runningTimers) without stopping it in Notion,
   * so the user can start a fresh timer on top of it.
   */
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

  /** Loads a Notion-running timer into the UI as the active timer. */
  loadRunningTimer: (rt) => {
    const state = get();

    // Stop previous UI tick without touching Notion (that timer is still running there)
    if (state.timer.running && state.timer.tickInterval) {
      clearInterval(state.timer.tickInterval);
    }

    // If a timer was active in the UI, put it back into the runningTimers list
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

    // Switch workspace (loads projects/extras in background)
    get().selectWorkspace(rt.workspaceId);

    // Persist as the active timer for crash recovery
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

    // Update the "other running timers" list
    set((s) => {
      const others = s.runningTimers.filter((x) => x.pageId !== rt.pageId);
      if (previouslyActive) others.push(previouslyActive);
      return { runningTimers: others, description: rt.title };
    });

    // Begin ticking — also triggers systray update via api.setTimerRunning(true)
    get().beginTicking({
      pageId: rt.pageId,
      roundedStart: new Date(rt.startISO),
      startISO: rt.startISO,
      rawStart: new Date(rt.startISO),
      propertyMap: rt.propertyMap,
    });
  },

  /** Stops one of the non-active running timers and removes it from the list. */
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
    // Rounding follows the workspace the timer belongs to
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
      set({ recoveryBusy: false });
      get().addToast({ type: 'error', message: `${t('toastRecoveryStopError')}: ${errorMessage(err)}` });
      return;
    }
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null, recoveryBusy: false });
    get().loadRunningTimers();
    get().loadRecentEntries();
  },

  discardRecoveredTimer: () => {
    // Forgets the timer locally; the Notion page keeps its running status
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null });
    get().loadRunningTimers();
    get().loadRecentEntries();
  },
}));
