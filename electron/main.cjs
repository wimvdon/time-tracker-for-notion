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
    workspaces: [],
    lastUsedWorkspaceId: null,
    activeTimer: null,
  },
});

let mainWindow = null;
let tray = null;
let timerRunning = false;
let isQuitting = false;

// Tray menu strings live in the main process, where the renderer's i18n is
// not available; app.getLocale() reflects the Windows display language.
const TRAY_STRINGS = {
  'en-GB': { open: 'Open', stopTimer: 'Stop timer', quit: 'Quit' },
  'nl-BE': { open: 'Openen', stopTimer: 'Timer stoppen', quit: 'Afsluiten' },
};
let trayStrings = TRAY_STRINGS['en-GB'];

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
    { label: trayStrings.open, click: () => showWindow() },
  ];
  if (timerRunning) {
    items.push({
      label: trayStrings.stopTimer,
      click: () => {
        showWindow();
        mainWindow.webContents.send('tray:stop-timer');
      },
    });
  }
  items.push({ type: 'separator' });
  items.push({
    label: trayStrings.quit,
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
    // undefined means "remove this key" — used by schema migrations
    if (value === undefined) {
      store.delete(key);
    } else {
      store.set(key, value);
    }
  }
  return store.store;
});

ipcMain.handle('notion:searchDatabases', () =>
  notion.searchDatabases(store.get('apiKey'))
);

ipcMain.handle('notion:getDatabaseSchema', (_event, dbId) =>
  notion.getDatabaseSchema(store.get('apiKey'), dbId)
);

ipcMain.handle('notion:fetchDatabasePages', (_event, dbId) =>
  notion.fetchDatabasePages(store.get('apiKey'), dbId)
);

ipcMain.handle('notion:listUsers', () => notion.listUsers(store.get('apiKey')));

ipcMain.handle('notion:create', (_event, params) =>
  notion.createTimeEntry(store.get('apiKey'), params)
);

ipcMain.handle('notion:stop', (_event, params) =>
  notion.stopTimeEntry(store.get('apiKey'), params)
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
    // Same detection rule as the renderer: any Dutch locale maps to nl-BE
    if (app.getLocale().toLowerCase().startsWith('nl')) {
      trayStrings = TRAY_STRINGS['nl-BE'];
    }
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
