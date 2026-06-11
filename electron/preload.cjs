const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notionAPI', {
  getSettings: () => ipcRenderer.invoke('store:get'),
  saveSettings: (data) => ipcRenderer.invoke('store:set', data),
  fetchDeelprojecten: (dbId) => ipcRenderer.invoke('notion:fetchDeelprojecten', dbId),
  createTijdsregistratie: (params) => ipcRenderer.invoke('notion:create', params),
  stopTijdsregistratie: (params) => ipcRenderer.invoke('notion:stop', params),
  testConnection: (apiKey, dbId) => ipcRenderer.invoke('notion:test', apiKey, dbId),
  setAlwaysOnTop: (val) => ipcRenderer.invoke('window:alwaysOnTop', val),
  setTimerRunning: (running) => ipcRenderer.send('timer:state', running),
  onTrayStopTimer: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('tray:stop-timer', listener);
    return () => ipcRenderer.removeListener('tray:stop-timer', listener);
  },
});
