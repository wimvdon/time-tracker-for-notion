import { create } from 'zustand';
import { computeStartTime, computeEndTime } from '../lib/rounding.js';
import { toNotionDateTime, formatDateDDMMYYYY } from '../lib/format.js';
import { DEFAULT_PROPERTY_MAP } from '../lib/constants.js';
import { t } from '../lib/i18n.js';

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

// Projects saved before property mapping existed have no propertyMap
const withDefaultPropertyMap = (project) => ({
  ...project,
  propertyMap: { ...DEFAULT_PROPERTY_MAP, ...(project.propertyMap || {}) },
});

let toastSeq = 0;

export const useStore = create((set, get) => ({
  // Settings (synced from electron-store)
  apiKey: '',
  projects: [],
  alwaysOnTop: true,
  roundingEnabled: true,

  // UI
  view: 'timer', // 'timer' | 'settings'
  toasts: [],
  recoveredTimer: null, // orphaned activeTimer found on launch
  recoveryBusy: false,

  // Session state
  selectedProjectId: null,
  deelprojecten: [],
  deelprojectenLoading: false,
  selectedDeelprojectId: null,
  description: '',

  // Timer state
  timer: { ...idleTimer },

  setView: (view) => set({ view }),
  setDescription: (description) => set({ description }),
  setSelectedDeelprojectId: (selectedDeelprojectId) => set({ selectedDeelprojectId }),

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
    const projects = (settings.projects || []).map(withDefaultPropertyMap);
    set({
      apiKey: settings.apiKey || '',
      projects,
      alwaysOnTop: settings.alwaysOnTop !== false,
      roundingEnabled: settings.roundingEnabled !== false,
    });

    // First launch: send the user to Settings
    if (!settings.apiKey || !projects.length) {
      set({ view: 'settings' });
    }

    // Crash recovery: a timer was running when the app last closed
    if (settings.activeTimer && settings.activeTimer.notionPageId) {
      set({ recoveredTimer: settings.activeTimer });
    } else if (settings.lastUsedProjectId) {
      const exists = projects.some((p) => p.id === settings.lastUsedProjectId);
      if (exists) get().selectProject(settings.lastUsedProjectId);
    }
  },

  saveApiKey: async (apiKey) => {
    await api.saveSettings({ apiKey });
    set({ apiKey });
  },

  addProject: async (project) => {
    const projects = [...get().projects, withDefaultPropertyMap(project)];
    await api.saveSettings({ projects });
    set({ projects });
  },

  updateProject: async (updatedProject) => {
    const projects = get().projects.map((p) =>
      p.id === updatedProject.id ? withDefaultPropertyMap(updatedProject) : p
    );
    await api.saveSettings({ projects });
    set({ projects });
    // If this is the selected project, re-fetch deelprojecten in case the title prop changed
    if (get().selectedProjectId === updatedProject.id) {
      get().selectProject(updatedProject.id);
    }
  },

  deleteProject: async (projectId) => {
    const projects = get().projects.filter((p) => p.id !== projectId);
    await api.saveSettings({ projects });
    const patch = { projects };
    if (get().selectedProjectId === projectId) {
      Object.assign(patch, {
        selectedProjectId: null,
        deelprojecten: [],
        selectedDeelprojectId: null,
      });
      await api.saveSettings({ lastUsedProjectId: null });
    }
    set(patch);
  },

  toggleAlwaysOnTop: async (value) => {
    await api.setAlwaysOnTop(value);
    set({ alwaysOnTop: value });
  },

  toggleRounding: async (value) => {
    await api.saveSettings({ roundingEnabled: value });
    set({ roundingEnabled: value });
  },

  // ---- Project / deelproject selection ----

  selectProject: async (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    set({
      selectedProjectId: projectId,
      deelprojecten: [],
      selectedDeelprojectId: null,
      deelprojectenLoading: !!project,
    });
    api.saveSettings({ lastUsedProjectId: projectId });
    if (!project) return;
    try {
      const deelprojecten = await api.fetchDeelprojecten(
        project.deelprojectenDbId,
        project.propertyMap
      );
      // Ignore stale responses if the user switched projects meanwhile
      if (get().selectedProjectId !== projectId) return;
      set({ deelprojecten, deelprojectenLoading: false });
    } catch (err) {
      if (get().selectedProjectId !== projectId) return;
      set({ deelprojectenLoading: false });
      get().addToast({ type: 'error', message: `${t('toastDeelprojectenError')}: ${err.message}` });
    }
  },

  // ---- Timer ----

  startTimer: async () => {
    const state = get();
    if (state.timer.running) return;
    const project = state.projects.find((p) => p.id === state.selectedProjectId);
    const deelproject = state.deelprojecten.find((d) => d.id === state.selectedDeelprojectId);
    if (!project || !deelproject) return;

    // With rounding off the exact timestamp is used; no 15-minute logic applies
    const roundedStart = state.roundingEnabled ? computeStartTime() : new Date();
    const startISO = toNotionDateTime(roundedStart);
    const title =
      state.description.trim() ||
      `${deelproject.name} — ${formatDateDDMMYYYY(roundedStart)}`;

    let pageId;
    try {
      ({ pageId } = await api.createTijdsregistratie({
        dbId: project.tijdsregistratiesDbId,
        title,
        startISO,
        deelprojectId: deelproject.id,
        props: project.propertyMap,
      }));
    } catch (err) {
      state.addToast({ type: 'error', message: `${t('toastStartError')}: ${err.message}` });
      return;
    }

    const rawStart = new Date();
    // Persist so the timer survives a crash / force quit
    api.saveSettings({
      activeTimer: {
        notionPageId: pageId,
        roundedStart: startISO,
        rawStart: rawStart.toISOString(),
        projectId: project.id,
        deelprojectId: deelproject.id,
        deelprojectName: deelproject.name,
        description: state.description,
        propertyMap: project.propertyMap,
      },
    });
    get().beginTicking({
      pageId,
      roundedStart,
      startISO,
      rawStart,
      propertyMap: project.propertyMap,
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
    const { timer, roundingEnabled, addToast } = get();
    if (!timer.running) return;

    const endTime = roundingEnabled ? computeEndTime(timer.roundedStart) : new Date();
    try {
      await api.stopTijdsregistratie({
        pageId: timer.notionPageId,
        startISO: timer.startISO, // exact value from creation, never re-rounded
        endISO: toNotionDateTime(endTime),
        props: timer.propertyMap || DEFAULT_PROPERTY_MAP,
      });
    } catch (err) {
      // Keep the timer state intact so the user can retry
      addToast({
        type: 'error',
        sticky: true,
        message: `${t('toastStopError')}: ${err.message}`,
        action: { label: t('toastStopRetry'), run: () => get().stopTimer() },
      });
      return;
    }

    clearInterval(timer.tickInterval);
    api.saveSettings({ activeTimer: null });
    set({ timer: { ...idleTimer }, description: '' });
    api.setTimerRunning(false);
  },

  // ---- Crash recovery ----

  resumeRecoveredTimer: async () => {
    const recovered = get().recoveredTimer;
    if (!recovered) return;
    set({ recoveredTimer: null, description: recovered.description || '', view: 'timer' });
    if (recovered.projectId) {
      await get().selectProject(recovered.projectId);
      set({ selectedDeelprojectId: recovered.deelprojectId || null });
    }
    get().beginTicking({
      pageId: recovered.notionPageId,
      roundedStart: new Date(recovered.roundedStart),
      startISO: recovered.roundedStart,
      rawStart: new Date(recovered.rawStart || recovered.roundedStart),
      propertyMap: recovered.propertyMap || DEFAULT_PROPERTY_MAP,
    });
  },

  stopRecoveredTimer: async () => {
    const recovered = get().recoveredTimer;
    if (!recovered) return;
    set({ recoveryBusy: true });
    const endTime = get().roundingEnabled
      ? computeEndTime(new Date(recovered.roundedStart))
      : new Date();
    try {
      await api.stopTijdsregistratie({
        pageId: recovered.notionPageId,
        startISO: recovered.roundedStart,
        endISO: toNotionDateTime(endTime),
        props: recovered.propertyMap || DEFAULT_PROPERTY_MAP,
      });
    } catch (err) {
      set({ recoveryBusy: false });
      get().addToast({ type: 'error', message: `${t('toastRecoveryStopError')}: ${err.message}` });
      return;
    }
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null, recoveryBusy: false });
  },

  discardRecoveredTimer: () => {
    // Forgets the timer locally; the Notion page stays as-is ("Lopende")
    api.saveSettings({ activeTimer: null });
    set({ recoveredTimer: null });
  },
}));
