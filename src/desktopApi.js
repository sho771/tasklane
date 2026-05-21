import { invoke, isTauri } from '@tauri-apps/api/core';

function exposeTauriDesktopApi() {
  const runningInTauri = isTauri() || Boolean(window.__TAURI_INTERNALS__);
  if (window.desktopApi || !runningInTauri) {
    return;
  }

  window.desktopInfo = { runtime: 'tauri' };
  window.desktopApi = {
    selectVaultFolder: () => invoke('select_vault_folder'),
    listMarkdownFiles: (request) => {
      const payload = typeof request === 'string'
        ? { vault_path: request, tag: '' }
        : {
            vault_path: request?.vaultPath || '',
            tag: request?.tag || ''
          };
      return invoke('list_markdown_files', payload);
    },
    selectMarkdownFile: (vaultPath) => invoke('select_markdown_file', {
      vault_path: typeof vaultPath === 'string' ? vaultPath : vaultPath?.vaultPath || ''
    }),
    writeMarkdownFiles: (vaultPath, files) => invoke('write_markdown_files', {
      vault_path: vaultPath,
      files
    }),
    syncMarkdownFiles: (vaultPath, files, options = {}) => invoke('sync_markdown_files', {
      vault_path: vaultPath,
      files,
      delete_stale_managed: Boolean(options.deleteStaleManaged)
    }),
    appendVaultLog: (vaultPath, entry) => invoke('append_vault_log', {
      vault_path: vaultPath,
      entry
    }),
    logRenderer: (level, message) => invoke('log_renderer', {
      level,
      message
    }).catch(() => {})
  };
}

exposeTauriDesktopApi();
