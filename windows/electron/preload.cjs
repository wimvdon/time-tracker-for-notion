const { contextBridge, ipcRenderer } = require('electron');

// A preset can be sent (desktop shortcut with --preset=…) before the renderer
// has loaded its settings and subscribed; queue it instead of dropping it.
const pendingPresets = [];
let presetCallback = null;
ipcRenderer.on('tray:apply-preset', (_event, data) => {
  if (presetCallback) presetCallback(data);
  else pendingPresets.push(data);
});

contextBridge.exposeInMainWorld('notionAPI', {
  getSettings: () => ipcRenderer.invoke('store:get'),
  saveSettings: (data) => ipcRenderer.invoke('store:set', data),
  searchDatabases: () => ipcRenderer.invoke('notion:searchDatabases'),
  getDatabaseSchema: (dbId) => ipcRenderer.invoke('notion:getDatabaseSchema', dbId),
  fetchDatabasePages: (dbId) => ipcRenderer.invoke('notion:fetchDatabasePages', dbId),
  listUsers: () => ipcRenderer.invoke('notion:listUsers'),
  createTimeEntry: (params) => ipcRenderer.invoke('notion:create', params),
  stopTimeEntry: (params) => ipcRenderer.invoke('notion:stop', params),
  fetchRunningTimers: (dbId, statusProp, statusRunning, dateProp) =>
    ipcRenderer.invoke('notion:fetchRunningTimers', dbId, statusProp, statusRunning, dateProp),
  testConnection: (apiKey, dbId) => ipcRenderer.invoke('notion:test', apiKey, dbId),
  fetchRecentEntries: (dbId, statusProp, statusDone, dateProp) =>
    ipcRenderer.invoke('notion:fetchRecentEntries', dbId, statusProp, statusDone, dateProp),
  deletePage: (pageId) => ipcRenderer.invoke('notion:deletePage', pageId),
  updatePage: (pageId, properties) => ipcRenderer.invoke('notion:updatePage', pageId, properties),
  getPageProperties: (pageId) => ipcRenderer.invoke('notion:getPageProperties', pageId),
  searchPages: () => ipcRenderer.invoke('notion:searchPages'),
  createSyncPage: (parentPageId, title, payload) =>
    ipcRenderer.invoke('notion:createSyncPage', parentPageId, title, payload),
  fetchSyncPage: (pageId) => ipcRenderer.invoke('notion:fetchSyncPage', pageId),
  updateSyncBlock: (blockId, payload) => ipcRenderer.invoke('notion:updateSyncBlock', blockId, payload),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setAlwaysOnTop: (val) => ipcRenderer.invoke('window:alwaysOnTop', val),
  setStartWithWindows: (val) => ipcRenderer.invoke('window:startWithWindows', val),
  setTimerRunning: (running, color) => ipcRenderer.send('timer:state', { running, color: color || null }),
  notifySettingsChanged: () => ipcRenderer.send('settings:changed'),
  onTrayStopTimer: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('tray:stop-timer', listener);
    return () => ipcRenderer.removeListener('tray:stop-timer', listener);
  },
  onTrayApplyPreset: (callback) => {
    presetCallback = callback;
    // Deliver anything that arrived before the renderer finished loading.
    for (const data of pendingPresets.splice(0)) callback(data);
    return () => {
      if (presetCallback === callback) presetCallback = null;
    };
  },
});
