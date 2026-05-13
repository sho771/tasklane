const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopInfo', {
  runtime: 'electron'
});

contextBridge.exposeInMainWorld('desktopApi', {
  selectVaultFolder: () => ipcRenderer.invoke('vault:select-folder'),
  listMarkdownFiles: (vaultPath) => ipcRenderer.invoke('vault:list-markdown', vaultPath),
  selectMarkdownFile: (vaultPath) => ipcRenderer.invoke('vault:select-markdown-file', { vaultPath }),
  writeMarkdownFiles: (vaultPath, files) => ipcRenderer.invoke('vault:write-markdown-files', { vaultPath, files }),
  syncMarkdownFiles: (vaultPath, files, options = {}) => ipcRenderer.invoke('vault:sync-markdown-files', {
    vaultPath,
    files,
    deleteStaleManaged: Boolean(options.deleteStaleManaged)
  }),
  appendVaultLog: (vaultPath, entry) => ipcRenderer.invoke('vault:append-log', { vaultPath, entry }),
  logRenderer: (level, message) => ipcRenderer.send('renderer:log', { level, message })
});
