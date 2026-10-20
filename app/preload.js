const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  getState: () => ipcRenderer.invoke('pet:get-state'),
  getBounds: () => ipcRenderer.invoke('pet:get-bounds'),
  moveTo: (x, y) => ipcRenderer.send('pet:move', x, y),
  setMode: (mode) => ipcRenderer.invoke('pet:set-mode', mode),
  setPinned: (pinned) => ipcRenderer.invoke('pet:set-pinned', pinned),
  close: () => ipcRenderer.send('pet:close'),
  hide: () => ipcRenderer.send('pet:hide'),
  onState: (callback) => {
    ipcRenderer.on('pet:state', (_event, value) => callback(value));
  },
});
