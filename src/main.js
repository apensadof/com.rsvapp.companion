const { app, BrowserWindow, clipboard, ipcMain, net, dialog, Tray, Notification, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const { setup_autoUpdater } = require('./autoUpdater');
const { setup_printHandlers } = require('./printHandler'); // Importar el manejador de impresión
const { setup_srHandlers } = require('./srHandler'); // Importar el manejador de SR y archivos INI
const AutoLaunch = require('auto-launch');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');
let mainWindow = null;
let isQuitting = false; // Variable para controlar el estado de cierre

function showErrorDialog(errorTitle, errorMessage) {
    dialog.showErrorBox(errorTitle, errorMessage);
  }

ipcMain.handle('copy-to-clipboard', (event, text) => {
    clipboard.writeText(text);
  });
  
  ipcMain.handle('read-from-clipboard', () => {
    return clipboard.readText();
  });
  ipcMain.handle('show-notification', (event, title, body) => {
    new Notification({ title, body }).show();
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    return fs.promises.readFile(filePath, 'utf-8');
  });
  
  ipcMain.handle('write-file', async (event, filePath, data) => {
    return fs.promises.writeFile(filePath, data);
  });
  
  ipcMain.handle('delete-file', async (event, filePath) => {
    return fs.promises.unlink(filePath);
  });


ipcMain.handle('save-config', (event, config) => {
  fs.writeFileSync(configPath, JSON.stringify(config));
});

ipcMain.handle('load-config', () => {
  if (fs.existsSync(configPath)) {
    const config = fs.readFileSync(configPath);
    return JSON.parse(config);
  }
  return null;
});
ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates();
  });
  
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('open-external-url', (event, url) => {
    shell.openExternal(url);
  });
  ipcMain.handle('close-dev-tools', () => {
    mainWindow.webContents.closeDevTools();
  });
  ipcMain.handle('get-system-memory', () => {
    return process.getSystemMemoryInfo();
  });
  
  ipcMain.handle('get-cpu-usage', () => {
    return process.cpuUsage();
  });

ipcMain.handle('check-internet-connection', () => {
    return net.isOnline();
  });

  ipcMain.handle('get-app-info', () => {
    return {
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch
    };
});

// Crear la ventana principal
function createWindow(minimized = 0) {
  if (isQuitting) return;
  
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    trafficLightPosition: { x: 10, y: 10 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadURL('https://client.rsvapp.com/sr-companion/?standalone=true');
  mainWindow.setMenu(null);

  ipcMain.handle('minimize-window', () => mainWindow.minimize());
  ipcMain.handle('maximize-window', () => mainWindow.maximize());
  ipcMain.handle('restore-window', () => mainWindow.restore());
  ipcMain.handle('close-window', () => mainWindow.close());
  ipcMain.handle('hide-window', () => mainWindow.hide());
  ipcMain.handle('show-window', () => mainWindow.show());
  ipcMain.handle('is-maximized', () => mainWindow.isMaximized());
  ipcMain.handle('is-minimized', () => mainWindow.isMinimized());
  ipcMain.handle('toggle-maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle('toggle-visibility', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
  ipcMain.handle('minimize-to-tray', () => {
    mainWindow.hide();
    tray.setToolTip('App minimized to tray');
  });
  ipcMain.handle('set-window-size', (event, width, height) => {
    mainWindow.setSize(width, height);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    //mainWindow.webContents.openDevTools()
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    // listPrinters();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Crear el icono de la bandeja del sistema
function build_tray_icon() {
  if (process.platform === 'win32') {
    const tray = new Tray(path.join(__dirname, '../build/icon.ico'));
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    const menu = Menu.buildFromTemplate([
      { label: 'Abrir nueva ventana', click: createWindow },
      { label: 'Buscar actualizaciones', click: () => autoUpdater.checkForUpdates() },
      { label: 'Detener servicio', click: () => { isQuitting = true; app.quit(); } }
    ]);

    tray.setToolTip('RSV SR Companion');
    tray.setContextMenu(menu);
  }
}

// Inicializar la app
app.on('ready', () => {
  build_tray_icon();
  setup_autoUpdater();

  const autoLaunch = new AutoLaunch({ name: 'RSV SR Companion', path: app.getPath('exe') });
  autoLaunch.isEnabled().then(isEnabled => {
    if (!isEnabled) autoLaunch.enable();
  });
  
  createWindow(1);

  // Configurar los manejadores de impresión y SR
  setup_printHandlers(ipcMain, mainWindow);
  setup_srHandlers(ipcMain, mainWindow);
  ipcMain.handle("start-dev-tools", () => {
    mainWindow.webContents.openDevTools();
  });
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});