const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const zlib = require('zlib');
const Store = require('electron-store');
const notion = require('./notionClient.cjs');

// ---- Minimal PNG encoder (for colored tray icons) ----

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawColoredDot(size, [r, g, b]) {
  const SS = 4;
  const dim = size * SS;
  const data = Buffer.alloc(dim * dim * 4);
  const mid = dim / 2;
  const radius = mid * 0.82;
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const dist = Math.hypot(x + 0.5 - mid, y + 0.5 - mid);
      const a = Math.min(1, Math.max(0, radius - dist + 0.5));
      if (a <= 0) continue;
      const i = (y * dim + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(a * 255);
    }
  }
  // Downsample SS:1
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * dim + x * SS + sx) * 4;
          const alpha = data[i + 3];
          pr += data[i] * alpha; pg += data[i + 1] * alpha; pb += data[i + 2] * alpha; pa += alpha;
        }
      }
      const o = (y * size + x) * 4;
      if (pa > 0) {
        out[o] = Math.round(pr / pa); out[o + 1] = Math.round(pg / pa);
        out[o + 2] = Math.round(pb / pa); out[o + 3] = Math.round(pa / (SS * SS));
      }
    }
  }
  return encodePNG(size, size, out);
}

function makeColoredTrayIcon(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return nativeImage.createFromBuffer(drawColoredDot(32, [r, g, b]));
}

// encryptionKey obfuscates the config file at rest (it is not a hard security
// boundary — anyone with access to this source can derive it, see README).
const store = new Store({
  encryptionKey: 'notion-timer-local-config-v1',
  defaults: {
    apiKey: '',
    alwaysOnTop: true,
    startWithWindows: false,
    workspaces: [],
    lastUsedWorkspaceId: null,
    activeTimer: null,
    theme: 'auto',
  },
});

let mainWindow = null;
let tray = null;
let timerRunning = false;
let timerColor = null;
let isQuitting = false;
let cachedWorkspaces = [];

// Tray menu strings live in the main process, where the renderer's i18n is
// not available; app.getLocale() reflects the Windows display language.
const TRAY_STRINGS = {
  'en-GB': { open: 'Open', stopTimer: 'Stop timer', quit: 'Quit', quickStart: 'Quick Start' },
  'nl-BE': { open: 'Openen', stopTimer: 'Timer stoppen', quit: 'Afsluiten', quickStart: 'Snelstarters' },
};
let trayStrings = TRAY_STRINGS['en-GB'];

const assetPath = (name) => path.join(__dirname, '..', 'assets', name);

function createWindow() {
  const startHidden = process.argv.includes('--hidden');
  mainWindow = new BrowserWindow({
    width: 340,
    height: 480,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    alwaysOnTop: store.get('alwaysOnTop'),
    show: !startHidden,
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
  if (!timerRunning) return nativeImage.createFromPath(assetPath('tray-idle.png'));
  if (timerColor) {
    const colored = makeColoredTrayIcon(timerColor);
    if (colored) return colored;
  }
  return nativeImage.createFromPath(assetPath('tray-running.png'));
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
  } else {
    // Preset quick-start items
    const presetItems = [];
    for (const ws of cachedWorkspaces) {
      for (const preset of (ws.presets || [])) {
        presetItems.push({ workspace: ws, preset });
      }
    }
    if (presetItems.length > 0) {
      items.push({ type: 'separator' });
      for (const { workspace, preset } of presetItems.slice(0, 10)) {
        const label = preset.name ? `${workspace.name} – ${preset.name}` : workspace.name;
        items.push({
          label: `▶ ${label}`,
          click: () => {
            showWindow();
            mainWindow.webContents.send('tray:apply-preset', { workspaceId: workspace.id, preset });
          },
        });
      }
    }
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
  tray.setToolTip('Time Tracker');
  tray.on('click', () => showWindow());
  rebuildTrayMenu();
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function applyPresetById(presetId) {
  for (const ws of cachedWorkspaces) {
    const preset = (ws.presets || []).find((p) => p.id === presetId);
    if (preset) {
      showWindow();
      mainWindow?.webContents.send('tray:apply-preset', { workspaceId: ws.id, preset });
      return;
    }
  }
}

function rebuildJumpList() {
  if (!app.isPackaged) return;
  const items = [];
  for (const ws of cachedWorkspaces) {
    for (const preset of (ws.presets || [])) {
      if (!preset.name || !preset.id) continue;
      items.push({
        type: 'task',
        program: process.execPath,
        args: `--preset=${preset.id}`,
        title: `${ws.name} – ${preset.name}`,
        iconPath: process.execPath,
        iconIndex: 0,
      });
    }
  }
  if (items.length === 0) {
    app.setJumpList(null);
    return;
  }
  app.setJumpList([{ type: 'custom', name: trayStrings.quickStart, items: items.slice(0, 10) }]);
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

ipcMain.handle('notion:fetchRunningTimers', (_event, dbId, statusProp, statusRunning, dateProp) =>
  notion.fetchRunningTimers(store.get('apiKey'), dbId, statusProp, statusRunning, dateProp)
);

ipcMain.handle('notion:fetchRecentEntries', (_event, dbId, statusProp, statusDone, dateProp) =>
  notion.fetchRecentEntries(store.get('apiKey'), dbId, statusProp, statusDone, dateProp)
);

ipcMain.handle('notion:deletePage', (_event, pageId) =>
  notion.deletePage(store.get('apiKey'), pageId)
);

ipcMain.handle('notion:updatePage', (_event, pageId, properties) =>
  notion.updatePageProperties(store.get('apiKey'), pageId, properties)
);

ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url));

// apiKey is passed explicitly here so Settings can test a key before saving it
ipcMain.handle('notion:test', (_event, apiKey, dbId) =>
  notion.testConnection(apiKey || store.get('apiKey'), dbId)
);

ipcMain.handle('window:alwaysOnTop', (_event, value) => {
  store.set('alwaysOnTop', value);
  if (mainWindow) mainWindow.setAlwaysOnTop(value);
  return value;
});

ipcMain.handle('window:startWithWindows', (_event, value) => {
  store.set('startWithWindows', value);
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: value, args: value ? ['--hidden'] : [] });
  }
  return value;
});

// Renderer reports timer state so the tray icon/menu can reflect it
ipcMain.on('timer:state', (_event, data) => {
  timerRunning = typeof data === 'object' ? !!data.running : !!data;
  timerColor = typeof data === 'object' ? (data.color || null) : null;
  if (tray) {
    tray.setImage(trayIcon());
    rebuildTrayMenu();
  }
});

// Renderer notifies that workspace settings changed (e.g. presets added)
ipcMain.on('settings:changed', () => {
  cachedWorkspaces = store.get('workspaces') || [];
  if (tray) rebuildTrayMenu();
  rebuildJumpList();
});

// ---- App lifecycle ----

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const presetArg = argv.find((a) => a.startsWith('--preset='));
    if (presetArg) {
      applyPresetById(presetArg.slice('--preset='.length));
    } else {
      showWindow();
    }
  });

  app.whenReady().then(() => {
    // Same detection rule as the renderer: any Dutch locale maps to nl-BE
    if (app.getLocale().toLowerCase().startsWith('nl')) {
      trayStrings = TRAY_STRINGS['nl-BE'];
    }
    cachedWorkspaces = store.get('workspaces') || [];

    if (app.isPackaged) {
      const startWithWindows = store.get('startWithWindows') === true;
      app.setLoginItemSettings({ openAtLogin: startWithWindows, args: startWithWindows ? ['--hidden'] : [] });
    }

    createWindow();
    createTray();
    rebuildJumpList();

    // Handle --preset arg when launched fresh (app was not already running)
    const presetArg = process.argv.find((a) => a.startsWith('--preset='));
    if (presetArg) {
      mainWindow.webContents.once('did-finish-load', () => {
        applyPresetById(presetArg.slice('--preset='.length));
      });
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// Keep running in the tray even when all windows are closed
app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});
