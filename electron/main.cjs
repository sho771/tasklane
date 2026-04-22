const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function getDevUrlFromArgs() {
  const arg = process.argv.find((item) => item.startsWith('--dev-url='));
  if (!arg) {
    return null;
  }
  const value = arg.slice('--dev-url='.length).trim();
  return value || null;
}

function getRendererEntry() {
  const devUrl = getDevUrlFromArgs();
  if (devUrl) {
    return { type: 'url', value: devUrl };
  }

  return {
    type: 'file',
    value: path.join(__dirname, '..', 'dist', 'index.html')
  };
}

function getWindowForDialog() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function toPosixPath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

function decodeMarkdownBuffer(buffer) {
  const decoders = [
    () => new TextDecoder('utf-8', { fatal: true }).decode(buffer),
    () => new TextDecoder('shift_jis', { fatal: true }).decode(buffer),
    () => new TextDecoder('euc-jp', { fatal: true }).decode(buffer),
    () => new TextDecoder('iso-2022-jp', { fatal: true }).decode(buffer),
    () => new TextDecoder('utf-8').decode(buffer)
  ];

  for (const decode of decoders) {
    try {
      return decode();
    } catch {
      continue;
    }
  }

  return buffer.toString('utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTagRegex(tag) {
  const normalized = tag.startsWith('#') ? tag : `#${tag}`;
  return new RegExp(`(^|[^\\w])${escapeRegExp(normalized)}(?=$|[^\\w]|/)`, 'i');
}

async function collectMarkdownFiles(rootDir, relativeDir = '', options = {}) {
  const currentDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const childRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      const nested = await collectMarkdownFiles(rootDir, childRelative, options);
      files.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const fullPath = path.join(rootDir, childRelative);
      const raw = await fs.readFile(fullPath);
      const content = decodeMarkdownBuffer(raw);
      if (options.tagRegex && !options.tagRegex.test(content)) {
        continue;
      }
      files.push({
        relativePath: toPosixPath(childRelative),
        content
      });
    }
  }

  return files;
}

function resolveAndValidatePath(rootDir, relativePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Invalid relative path: ${relativePath}`);
  }
  return resolvedTarget;
}

ipcMain.handle('vault:select-folder', async () => {
  const result = await dialog.showOpenDialog(getWindowForDialog(), {
    title: 'Select Obsidian Vault Folder',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('vault:list-markdown', async (_event, payload) => {
  const request = typeof payload === 'string'
    ? { vaultPath: payload }
    : (payload || {});
  const vaultPath = typeof request.vaultPath === 'string' ? request.vaultPath : '';
  const tag = typeof request.tag === 'string' ? request.tag.trim() : '';

  if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
    throw new Error('vaultPath is required');
  }

  const resolvedVault = path.resolve(vaultPath);
  const stat = await fs.stat(resolvedVault);
  if (!stat.isDirectory()) {
    throw new Error('vaultPath is not a directory');
  }

  const tagRegex = tag ? buildTagRegex(tag) : null;
  const files = await collectMarkdownFiles(resolvedVault, '', { tagRegex });
  return { files, tag };
});

ipcMain.handle('vault:select-markdown-file', async (_event, payload) => {
  const request = payload || {};
  const vaultPath = typeof request.vaultPath === 'string' ? request.vaultPath.trim() : '';
  const defaultPath = vaultPath || undefined;
  const result = await dialog.showOpenDialog(getWindowForDialog(), {
    title: 'Select Markdown File',
    defaultPath,
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null, relativePath: null, content: '' };
  }

  const selectedPath = path.resolve(result.filePaths[0]);
  const raw = await fs.readFile(selectedPath);
  const content = decodeMarkdownBuffer(raw);
  let relativePath = path.basename(selectedPath);

  if (vaultPath) {
    const resolvedVault = path.resolve(vaultPath);
    const rel = path.relative(resolvedVault, selectedPath);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      relativePath = toPosixPath(rel);
    }
  }

  return {
    canceled: false,
    path: selectedPath,
    relativePath: toPosixPath(relativePath),
    content
  };
});

ipcMain.handle('vault:write-markdown-files', async (_event, payload) => {
  const vaultPath = payload && typeof payload.vaultPath === 'string' ? payload.vaultPath : '';
  const files = payload && Array.isArray(payload.files) ? payload.files : [];

  if (!vaultPath.trim()) {
    throw new Error('vaultPath is required');
  }

  const resolvedVault = path.resolve(vaultPath);
  await fs.mkdir(resolvedVault, { recursive: true });

  const written = [];
  for (const file of files) {
    const relativePath = file && typeof file.relativePath === 'string' ? toPosixPath(file.relativePath.trim()) : '';
    if (!relativePath || !relativePath.toLowerCase().endsWith('.md')) {
      continue;
    }

    const content = file && typeof file.content === 'string' ? file.content : '';
    const targetPath = resolveAndValidatePath(resolvedVault, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    written.push(relativePath);
  }

  return { writtenCount: written.length, writtenPaths: written };
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f5f7ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const rendererEntry = getRendererEntry();
  if (rendererEntry.type === 'url') {
    mainWindow.loadURL(rendererEntry.value);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(rendererEntry.value);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
