const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopInfo', {
  runtime: 'electron'
});

contextBridge.exposeInMainWorld('desktopApi', {
  selectVaultFolder: () => ipcRenderer.invoke('vault:select-folder'),
  listMarkdownFiles: (vaultPath) => ipcRenderer.invoke('vault:list-markdown', vaultPath),
  selectMarkdownFile: (vaultPath) => ipcRenderer.invoke('vault:select-markdown-file', { vaultPath }),
  writeMarkdownFiles: (vaultPath, files) => ipcRenderer.invoke('vault:write-markdown-files', { vaultPath, files })
});
