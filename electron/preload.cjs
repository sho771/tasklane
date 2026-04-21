const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopInfo', {
  runtime: 'electron'
});
