const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const notion = require('./notionClient.cjs');

// encryptionKey obfuscates the config file at rest (it is not a hard security
// boundary — anyone with access to this source can derive it, see README).
const store = new Store({
  encryptionKey: 'notion-timer-local-config-v1',
  defaults: {
    apiKey: '',
    alwaysOnTop: true,
    roundingEnabled: true,
    projects: [],
    lastUsedProjectId: null,
    activeTimer: null,
  },
});

let mainWindow = null;
let tray = null;
let timerRunning = false;
let isQuitting = false;

const assetPath = (name) => path.join(__dirname, '..', 'assets', name);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 480,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    alwaysOnTop: store.get('alwaysOnTop'),
    icon: assetPath('icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Closing the window minimises to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function trayIcon() {
  return nativeImage.createFromPath(
    assetPath(timerRunning ? 'tray-running.png' : 'tray-idle.png')
  );
}

function rebuildTrayMenu() {
  const items = [
    { label: 'Open', click: () => showWindow() },
  ];
  if (timerRunning) {
    items.push({
      label: 'Stop timer',
      click: () => {
        showWindow();
        mainWindow.webContents.send('tray:stop-timer');
      },
    });
  }
  items.push({ type: 'separator' });
  items.push({
    label: 'Quit',
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Notion Timer');
  tray.on('click', () => showWindow());
  rebuildTrayMenu();
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

// ---- IPC handlers ----

ipcMain.handle('store:get', () => store.store);

ipcMain.handle('store:set', (_event, data) => {
  for (const [key, value] of Object.entries(data)) {
    store.set(key, value);
  }
  return store.store;
});

ipcMain.handle('notion:fetchDeelprojecten', (_event, dbId, props) =>
  notion.fetchDeelprojecten(store.get('apiKey'), dbId, props)
);

ipcMain.handle('notion:create', (_event, params) =>
  notion.createTijdsregistratie(store.get('apiKey'), params)
);

ipcMain.handle('notion:stop', (_event, params) =>
  notion.stopTijdsregistratie(store.get('apiKey'), params)
);

// apiKey is passed explicitly here so Settings can test a key before saving it
ipcMain.handle('notion:test', (_event, apiKey, dbId) =>
  notion.testConnection(apiKey || store.get('apiKey'), dbId)
);

ipcMain.handle('window:alwaysOnTop', (_event, value) => {
  store.set('alwaysOnTop', value);
  if (mainWindow) mainWindow.setAlwaysOnTop(value);
  return value;
});

// Renderer reports timer state so the tray icon/menu can reflect it
ipcMain.on('timer:state', (_event, running) => {
  timerRunning = running;
  if (tray) {
    tray.setImage(trayIcon());
    rebuildTrayMenu();
  }
});

// ---- App lifecycle ----

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// Keep running in the tray even when all windows are closed
app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});
