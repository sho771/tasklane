const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } = require('electron');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');

let mainLogPath = '';

function getSecureSettingsPath() {
  return path.join(app.getPath('userData'), 'secure-settings.json');
}

async function readSecureSettings() {
  try {
    const raw = await fs.readFile(getSecureSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeSecureSettings(settings) {
  const filePath = getSecureSettingsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
}

function encryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('安全な保存領域を利用できません');
  }
  return safeStorage.encryptString(String(value || '')).toString('base64');
}

function decryptSecret(value) {
  if (!value) {
    return '';
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('安全な保存領域を利用できません');
  }
  return safeStorage.decryptString(Buffer.from(String(value), 'base64'));
}

function formatError(error) {
  if (!error) {
    return '';
  }
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

async function writeMainLog(message, error) {
  try {
    if (!mainLogPath && app.isReady()) {
      mainLogPath = path.join(app.getPath('userData'), 'taskkanri-main.log');
    }
    if (!mainLogPath) {
      return;
    }
    const entry = [
      `[${new Date().toISOString()}] ${message}`,
      error ? formatError(error) : ''
    ].filter(Boolean).join('\n');
    await fs.appendFile(mainLogPath, `${entry}\n\n`, 'utf8');
  } catch {
    // Ignore logging failures.
  }
}

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

function getAppIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, '..', 'build', iconName);
  return fsSync.existsSync(iconPath) ? iconPath : undefined;
}

function getWindowForDialog() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function toPosixPath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

function splitFrontmatter(content) {
  const normalized = String(content || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: '', body: normalized };
  }

  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: normalized };
  }

  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 5)
  };
}

function parseMetaValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return raw.replace(/^["']|["']$/g, '');
}

function parseFrontmatterBlock(frontmatter) {
  const meta = {};
  String(frontmatter || '')
    .split('\n')
    .forEach((line) => {
      const index = line.indexOf(':');
      if (index <= 0) {
        return;
      }
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) {
        meta[key] = parseMetaValue(value);
      }
    });
  return meta;
}

function isTaskkanriMarkdown(content) {
  const { frontmatter } = splitFrontmatter(content);
  const meta = parseFrontmatterBlock(frontmatter);
  return Boolean(meta.taskkanri);
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

async function removeEmptyParentDirectories(rootDir, startPath) {
  const resolvedRoot = path.resolve(rootDir);
  let currentDir = path.dirname(startPath);

  while (currentDir && currentDir !== resolvedRoot) {
    const relative = path.relative(resolvedRoot, currentDir);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return;
    }

    try {
      await fs.rmdir(currentDir);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        currentDir = path.dirname(currentDir);
        continue;
      }
      return;
    }

    currentDir = path.dirname(currentDir);
  }
}

ipcMain.handle('vault:select-folder', async () => {
  const result = await dialog.showOpenDialog(getWindowForDialog(), {
    title: 'Obsidian Vaultフォルダを選択',
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
    throw new Error('vaultPathが必要です');
  }

  const resolvedVault = path.resolve(vaultPath);
  const stat = await fs.stat(resolvedVault);
  if (!stat.isDirectory()) {
    throw new Error('vaultPathはディレクトリではありません');
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
    title: 'Markdownファイルを選択',
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
    throw new Error('vaultPathが必要です');
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

ipcMain.handle('vault:sync-markdown-files', async (_event, payload) => {
  const vaultPath = payload && typeof payload.vaultPath === 'string' ? payload.vaultPath : '';
  const files = payload && Array.isArray(payload.files) ? payload.files : [];
  const deleteStaleManaged = Boolean(payload && payload.deleteStaleManaged);

  if (!vaultPath.trim()) {
    throw new Error('vaultPathが必要です');
  }

  const resolvedVault = path.resolve(vaultPath);
  await fs.mkdir(resolvedVault, { recursive: true });

  const written = [];
  const activePaths = new Set();
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
    activePaths.add(relativePath);
  }

  const deleted = [];
  if (deleteStaleManaged) {
    const markdownFiles = await collectMarkdownFiles(resolvedVault);
    for (const file of markdownFiles) {
      if (activePaths.has(file.relativePath) || !isTaskkanriMarkdown(file.content)) {
        continue;
      }
      const targetPath = resolveAndValidatePath(resolvedVault, file.relativePath);
      await fs.unlink(targetPath);
      await removeEmptyParentDirectories(resolvedVault, targetPath);
      deleted.push(file.relativePath);
    }
  }

  return { writtenCount: written.length, writtenPaths: written, deletedCount: deleted.length, deletedPaths: deleted };
});

ipcMain.handle('vault:append-log', async (_event, payload) => {
  const vaultPath = payload && typeof payload.vaultPath === 'string' ? payload.vaultPath : '';
  const entry = payload && typeof payload.entry === 'string' ? payload.entry : '';

  if (!vaultPath.trim()) {
    throw new Error('vaultPathが必要です');
  }
  if (!entry.trim()) {
    return { written: false };
  }

  const resolvedVault = path.resolve(vaultPath);
  await fs.mkdir(resolvedVault, { recursive: true });
  const logPath = resolveAndValidatePath(resolvedVault, path.join('.log', 'vault_log.log'));
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${entry.replace(/[\r\n]+/g, ' ')}\n`, 'utf8');
  return { written: true, relativePath: toPosixPath(path.join('.log', 'vault_log.log')) };
});

ipcMain.handle('secure-ai-key:get', async () => {
  const settings = await readSecureSettings();
  return {
    apiKey: decryptSecret(settings.aiApiKey || '')
  };
});

ipcMain.handle('secure-ai-key:set', async (_event, payload) => {
  const apiKey = payload && typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  const settings = await readSecureSettings();
  if (!apiKey) {
    delete settings.aiApiKey;
  } else {
    settings.aiApiKey = encryptSecret(apiKey);
    settings.updatedAt = new Date().toISOString();
  }
  await writeSecureSettings(settings);
  return { saved: Boolean(apiKey) };
});

ipcMain.handle('secure-ai-key:clear', async () => {
  const settings = await readSecureSettings();
  delete settings.aiApiKey;
  await writeSecureSettings(settings);
  return { cleared: true };
});

ipcMain.handle('app:open-external', async (_event, payload) => {
  const url = payload && typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('外部URLを開けません');
  }
  await shell.openExternal(url);
  return { opened: true };
});

ipcMain.on('renderer:log', (_event, payload) => {
  const level = payload && typeof payload.level === 'string' ? payload.level : 'info';
  const message = payload && typeof payload.message === 'string' ? payload.message : '';
  writeMainLog(`renderer:${level} ${message}`);
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    backgroundColor: '#f5f7ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeMainLog(`did-fail-load code=${errorCode} url=${validatedURL} desc=${errorDescription}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeMainLog(`console-message level=${level} line=${line} source=${sourceId} message=${message}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeMainLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.on('unresponsive', () => {
    writeMainLog('window-unresponsive');
  });

  const rendererEntry = getRendererEntry();
  if (rendererEntry.type === 'url') {
    mainWindow.loadURL(rendererEntry.value).catch((error) => {
      writeMainLog(`loadURL failed: ${rendererEntry.value}`, error);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(rendererEntry.value).catch((error) => {
      writeMainLog(`loadFile failed: ${rendererEntry.value}`, error);
    });
  }
}

app.whenReady().then(() => {
  mainLogPath = path.join(app.getPath('userData'), 'taskkanri-main.log');
  writeMainLog('app-ready');
  Menu.setApplicationMenu(null);
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

process.on('uncaughtException', (error) => {
  writeMainLog('uncaughtException', error);
});

process.on('unhandledRejection', (error) => {
  writeMainLog('unhandledRejection', error);
});
