const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = 'dsh-desktop-pet';
const SIZES = {
  full: { width: 380, height: 560 },
  pet: { width: 220, height: 126 },
};

app.setName('像素渔场');
app.setPath('userData', path.join(app.getPath('appData'), APP_ID));

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
const state = { mode: 'pet', pinned: true, x: null, y: null };
try {
  Object.assign(state, JSON.parse(fs.readFileSync(statePath(), 'utf8')));
} catch (e) {
  /* first run */
}
if (typeof state.pinned !== 'boolean') state.pinned = true;
if (state.mode !== 'pet' && state.mode !== 'full') state.mode = 'full';

const argv = process.argv;
if (argv.includes('--pet')) state.mode = 'pet';
else if (argv.includes('--full')) state.mode = 'full';

let win = null;
let tray = null;
let saveTimer = null;

const publicState = () => ({ mode: state.mode, pinned: state.pinned });

function saveState() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch (e) {
    /* ignore */
  }
}

function saveStateSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

function clampPosition(x, y, w, h) {
  const displays = screen.getAllDisplays();
  const display = displays.find((d) => {
    const a = d.workArea;
    return x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height;
  }) || screen.getPrimaryDisplay();
  const a = display.workArea;
  return {
    x: Math.min(Math.max(x, a.x), a.x + Math.max(0, a.width - w)),
    y: Math.min(Math.max(y, a.y), a.y + Math.max(0, a.height - h)),
  };
}

function createWindow() {
  const size = SIZES[state.mode] || SIZES.full;
  let pos;
  if (Number.isInteger(state.x) && Number.isInteger(state.y)) {
    pos = clampPosition(state.x, state.y, size.width, size.height);
  } else {
    const a = screen.getPrimaryDisplay().workArea;
    pos = { x: a.x + a.width - size.width - 28, y: a.y + a.height - size.height - 28 };
  }

  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: pos.x,
    y: pos.y,
    title: '像素渔场',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: state.pinned,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setAlwaysOnTop(state.pinned, 'floating');
  win.once('ready-to-show', () => win.show());
  win.on('move', () => {
    const b = win.getBounds();
    state.x = b.x;
    state.y = b.y;
    saveStateSoon();
  });
  win.on('closed', () => {
    win = null;
  });
}

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('pet:state', publicState());
}

function applyMode(mode) {
  if (!SIZES[mode] || !win || win.isDestroyed()) return publicState();
  state.mode = mode;
  const size = SIZES[mode];
  const b = win.getBounds();
  const pos = clampPosition(b.x, b.y, size.width, size.height);
  win.setResizable(true);
  win.setBounds({ x: pos.x, y: pos.y, width: size.width, height: size.height });
  win.setResizable(false);
  state.x = pos.x;
  state.y = pos.y;
  saveState();
  broadcast();
  return publicState();
}

function applyPinned(pinned) {
  state.pinned = !!pinned;
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(state.pinned, 'floating');
  saveState();
  broadcast();
  return publicState();
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) win.show();
  win.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('像素渔场 · 桌面钓鱼');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '展开面板', click: () => { showWindow(); applyMode('full'); } },
    { label: '收起为宠物', click: () => { showWindow(); applyMode('pet'); } },
    { type: 'separator' },
    { label: '总在最前', type: 'checkbox', checked: state.pinned, click: (item) => applyPinned(item.checked) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('click', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isVisible() && win.isFocused()) win.hide();
    else showWindow();
  });
}

ipcMain.handle('pet:get-state', () => publicState());
ipcMain.handle('pet:get-bounds', () => (win && !win.isDestroyed() ? win.getBounds() : null));
ipcMain.handle('pet:set-mode', (_event, mode) => applyMode(mode));
ipcMain.handle('pet:set-pinned', (_event, pinned) => applyPinned(pinned));
ipcMain.on('pet:move', (_event, x, y) => {
  if (!win || win.isDestroyed()) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  win.setPosition(Math.round(x), Math.round(y), false);
});
ipcMain.on('pet:close', () => app.quit());
ipcMain.on('pet:hide', () => { if (win) win.hide(); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    showWindow();
    if (argv.includes('--pet')) applyMode('pet');
    else if (argv.includes('--full') || argv.some((arg) => String(arg).startsWith('dsh-pet://'))) applyMode('full');
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (String(url).startsWith('dsh-pet://')) {
      showWindow();
      applyMode('full');
    }
  });

  app.whenReady().then(() => {
    try {
      app.setAsDefaultProtocolClient('dsh-pet');
    } catch (e) {
      /* protocol registration is best effort */
    }
    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => app.quit());
}
