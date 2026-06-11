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

  setView: (view) => set({ view }),
  setDescription: (description) => set({ description }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setExtraValue: (name, value) =>
    set((s) => ({ extraValues: { ...s.extraValues, [name]: value } })),

  /** Rounding is configured per workspace; defaults to on. */
  getRoundingEnabled: () => {
    const ws = get().workspaces.find((w) => w.id === get().selectedWorkspaceId);
    return ws?.roundingEnabled ?? true;
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

    // Migrate the old "projects as app configs" schema to workspaces.
    // Note: electron-store injects `workspaces: []` as a default, so the
    // presence of legacy data is what decides whether to migrate.
    const hasLegacy =
      (settings.projects?.length ?? 0) > 0 && !(settings.workspaces?.length);
    const workspaces = hasLegacy
      ? settings.projects.map((p) => ({
          id: p.id,
          name: p.name,
          timeEntriesDbId: p.tijdsregistratiesDbId,
          projectsDbId: p.deelprojectenDbId,
          roundingEnabled: settings.roundingEnabled ?? true,
          propertyMap: migratePropertyMap(p.propertyMap),
        }))
      : settings.workspaces ?? [];
    const lastUsedWorkspaceId =
      settings.lastUsedWorkspaceId ?? settings.lastUsedProjectId ?? null;
    const activeTimer = migrateActiveTimer(settings.activeTimer);
    if (hasLegacy || settings.projects !== undefined) {
      // Save migrated data back so the old keys are gone
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
      set({ projects, projectsLoading: false });
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
      for (const name of workspace.extraProps) {
        const prop = schema?.[name];
        if (!prop || !WRITABLE_EXTRA_TYPES.includes(prop.type)) continue;
        const def = { name, type: prop.type, options: [] };
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
      for (const def of defs) extraValues[def.name] = emptyValueFor(def.type);
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
    const project = state.projects.find((p) => p.id === state.selectedProjectId);
    if (!workspace || !project) return;

    // With rounding off the exact timestamp is used; no 15-minute logic applies
    const roundedStart = get().getRoundingEnabled() ? computeStartTime() : new Date();
    const startISO = toNotionDateTime(roundedStart);
    const title =
      state.description.trim() || `${project.name} — ${formatDateDDMMYYYY(roundedStart)}`;

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
        projectId: project.id,
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
        projectId: project.id,
        projectName: project.name,
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

  stopTimer: async () => {
    const { timer, addToast } = get();
    if (!timer.running) return;

    const endTime = get().getRoundingEnabled() ? computeEndTime(timer.roundedStart) : new Date();
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
    const extraValues = {};
    for (const def of get().extraFieldDefs) extraValues[def.name] = emptyValueFor(def.type);
    set({ timer: { ...idleTimer }, description: '', extraValues });
    api.setTimerRunning(false);
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
    const endTime = (workspace?.roundingEnabled ?? true)
      ? computeEndTime(new Date(recovered.roundedStart))
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
  },

  discardRecoveredTimer: () => {
    // Forgets the timer locally; the Notion page keeps its running status
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null });
  },
}));
