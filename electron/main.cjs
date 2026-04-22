const { app, BrowserWindow } = require('electron');
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
      nodeIntegration: false
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
