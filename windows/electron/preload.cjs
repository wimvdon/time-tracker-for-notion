const { contextBridge, ipcRenderer } = require('electron');

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
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setAlwaysOnTop: (val) => ipcRenderer.invoke('window:alwaysOnTop', val),
  setTimerRunning: (running) => ipcRenderer.send('timer:state', running),
  onTrayStopTimer: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('tray:stop-timer', listener);
    return () => ipcRenderer.removeListener('tray:stop-timer', listener);
  },
});
