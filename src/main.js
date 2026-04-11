const { app, BrowserWindow, clipboard, ipcMain, net, dialog, Tray, Notification, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const { setupAutoUpdater } = require('./autoUpdater');
const { setupPrintHandlers } = require('./printHandler'); // Importar el manejador de impresión
const { setupSrHandlers } = require('./srHandler'); // Importar el manejador de SR y archivos INI
const { createSplashWindow, updateSplashStatus, updateSplashVersion, closeSplashWindow } = require('./splashWindow');
const { networkInterfaces } = require('os');
const AutoLaunch = require('auto-launch');
const os = require('os'); // Módulo para obtener información del sistema operativo
const sudo = require('sudo-prompt');
const osu = require('node-os-utils'); // Si deseas información extra (CPU, RAM, etc.)
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged; // app.isPackaged indica si la app está empaquetada
const configPath = path.join(app.getPath('userData'), 'config.json');
const MAX_LOAD_ATTEMPTS = 1000;
const baseUrl = 'https://companion.rsv.mx/interface';


let mainWindow = null;
let splashWindow = null;
let isQuitting = false; // Variable para controlar el estado de cierre
let loadAttempts = 0;
let appName = "RSV Companion";
let isAppContentValidated = false;
let reloadTimeout = null;
let loadUrlTimeout = null;
let autoLaunchManager = null;


// Crear un objeto URL
const url = new URL(baseUrl);
const appVersion = app.getVersion();

// Agregar parámetros a la URL
url.searchParams.append('standalone', 'true');
url.searchParams.append('version', appVersion);

// Obtener la IP del dispositivo
function getNetworkIP() {
  const nets = networkInterfaces();
  let results = {};
  
  for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
          // Skip over non-IPv4 and internal (i.e., 127.0.0.1) addresses
          if (net.family === 'IPv4' && !net.internal) {
              if (!results[name]) {
                  results[name] = [];
              }
              results[name].push(net.address);
          }
      }
  }
  // Devolver la primera IP disponible
  return results;
}
function executeElevated(command) {
  return new Promise((resolve, reject) => {
    const options = {
      name: appName,
    };
    sudo.exec(command, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}
function showErrorDialog(errorTitle, errorMessage) {
    dialog.showErrorBox(errorTitle, errorMessage);
}
ipcMain.handle('show-alert-dialog', (event, message) => {
  return dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: appName,
    message: message,
    buttons: ['OK']
  });
});

ipcMain.handle('execute-elevated', async (event, command) => {
  try {
    const result = await executeElevated(command);
    return result;
  } catch (error) {
    console.error('Error executing elevated command:', error);
    throw error;
  }
});
ipcMain.handle('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle('reload-app', () => {
  loadAttempts = 0; // Reset attempts for manual reload
  reloadApp();
});

ipcMain.handle('set-autostart', async (event, enabled) => {
  try {
    if (!autoLaunchManager) {
      autoLaunchManager = new AutoLaunch({
        name: appName,
        path: app.getPath('exe'),
      });
    }

    const shouldEnable = !!enabled;
    if (shouldEnable) {
      await autoLaunchManager.enable();
    } else {
      await autoLaunchManager.disable();
    }

    const isEnabled = await autoLaunchManager.isEnabled();
    return { success: true, enabled: isEnabled };
  } catch (error) {
    console.error('Error setting autostart:', error);
    return { success: false, enabled: false, error: error.message || String(error) };
  }
});

ipcMain.handle('get-autostart', async () => {
  try {
    if (!autoLaunchManager) {
      autoLaunchManager = new AutoLaunch({
        name: appName,
        path: app.getPath('exe'),
      });
    }

    const isEnabled = await autoLaunchManager.isEnabled();
    return { success: true, enabled: isEnabled };
  } catch (error) {
    console.error('Error getting autostart status:', error);
    return { success: false, enabled: false, error: error.message || String(error) };
  }
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

ipcMain.handle('save-sql-file', async (event, options) => {
  try {
    const { content, defaultName } = options;
    
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar archivo SQL',
      defaultPath: path.join(app.getPath('downloads'), defaultName || 'database_export.sql'),
      filters: [
        { name: 'SQL Files', extensions: ['sql'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    
    // Write file
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    
    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Error saving SQL file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-user-path', async (event) => {
  return app.getPath('userData');
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
  autoUpdater.checkForUpdatesAndNotify();
});
  
  ipcMain.handle('is-any-update', async () => {
    return new Promise((resolve, reject) => {
      // Escuchar el evento de que una actualización está disponible
      autoUpdater.once('update-available', (info) => {
        resolve({ updateAvailable: true, info });
      });
  
      // Escuchar el evento de que no hay actualizaciones disponibles
      autoUpdater.once('update-not-available', () => {
        resolve({ updateAvailable: false });
      });
  
      // Si ocurre un error
      autoUpdater.once('error', (error) => {
        reject({ updateAvailable: false, error });
      });
  
      // Iniciar la verificación de actualizaciones
      autoUpdater.checkForUpdates();
    });
  });
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('open-external-url', (event, url) => {
    shell.openExternal(url);
  });
  ipcMain.handle('show-error-dialog', (event, title, message) => {
    dialog.showErrorBox(title, message);
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
      name: appName,
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch
  };
});

ipcMain.handle('get-device-info', async () => {
  // Información básica del dispositivo
  const cpuInfo = osu.cpu.model();  // Información del procesador
  const memInfo = await osu.mem.info();  // Memoria disponible
  const netInfo = getNetworkIP();  // Dirección IP

  return {
      deviceName: os.hostname(),  // Nombre del dispositivo
      platform: os.platform(),    // Sistema operativo (win32, linux, darwin, etc.)
      release: os.release(),      // Versión del sistema operativo
      arch: os.arch(),            // Arquitectura (x64, arm, etc.)
      cpus: os.cpus().length,     // Número de núcleos de CPU
      cpuModel: cpuInfo,          // Modelo de CPU
      totalMemory: os.totalmem(), // Memoria total en bytes
      freeMemory: os.freemem(),   // Memoria libre en bytes
      uptime: os.uptime(),        // Tiempo de actividad del sistema en segundos
      ip: netInfo,                // Dirección IP de las interfaces de red
      networkInterfaces: os.networkInterfaces(),  // Detalles completos de la red
      memUsage: memInfo.usedMemPercentage + '%'    // Porcentaje de memoria usada (de node-os-utils)
  };
});

// Add this function to check URL accessibility
const https = require('https');
function checkUrl(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('URL check timeout'));
    }, timeout);
    
    https.get(url, (res) => {
      clearTimeout(timeoutId);
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Status Code: ${res.statusCode}`));
      }
    }).on('error', (e) => {
      clearTimeout(timeoutId);
      reject(e);
    });
  });
}

// Crear la ventana principal
function createWindow(minimized = 0) {
  if (isQuitting) 
    return;

  console.log('🚀 [INIT] Creating main window...');
  updateSplashStatus('Creando ventana principal');

  function verifyAndShowWindow() {
    console.log('🔍 [VERIFY] Starting content verification...');
    updateSplashStatus('Verificando contenido');
    
    const appInfo = {
      name: appName,
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch
    };
    
    // Timeout de 10 segundos para la verificación
    const verificationTimeout = setTimeout(() => {
      console.log('⏱️ [TIMEOUT] Verification timeout - showing window anyway');
      updateSplashStatus('¡Aplicación lista!');
      setTimeout(() => {
        mainWindow.show();
        closeSplashWindow();
        isAppContentValidated = true;
        loadAttempts = 0;
      }, 500);
    }, 10000);
    
    mainWindow.webContents.executeJavaScript(`
      (function() {
        console.log('Checking if app is loaded...');
        window.electronAppInfo = ${JSON.stringify(appInfo)};
        
        if (window.appLoaded) {
          console.log('App is loaded!');
          return true;
        } else {
          console.log('App not loaded, setting up onAppLoaded...');
          window.onAppLoaded = () => {
            console.log('onAppLoaded called!');
          }
          // Devolver true de todos modos - la página cargó correctamente
          return true;
        }
      })()
    `).then(isValid => {
      clearTimeout(verificationTimeout);
      if (isValid) {
        console.log('✅ [SUCCESS] Content verified! Showing window...');
        updateSplashStatus('¡Aplicación lista!');
        
        setTimeout(() => {
          mainWindow.show();
          closeSplashWindow();
          isAppContentValidated = true;
          loadAttempts = 0;
        }, 500);
      } else {
        console.log('⚠️ [WARNING] Invalid page content, reloading...');
        retryLoad();
      }
    }).catch(error => {
      clearTimeout(verificationTimeout);
      console.error('❌ [ERROR] Error verifying page content:', error);
      console.log('⚠️ [WARNING] Showing window anyway...');
      // Si hay error en la verificación, mostrar de todos modos
      updateSplashStatus('¡Aplicación lista!');
      setTimeout(() => {
        mainWindow.show();
        closeSplashWindow();
        isAppContentValidated = true;
        loadAttempts = 0;
      }, 500);
    });
  }

  
  // Configuración de ventana específica por plataforma
  const windowConfig = {
    width: 600,
    height: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    // expose window controls in Windows/Linux
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    trafficLightPosition: { x: 10, y: 10 },

    show: false,
    resizable: false,
    frame: false, // Sin marco para tener control total
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // Configuraciones específicas de macOS
  if (process.platform === 'darwin') {
    windowConfig.titleBarStyle = 'hiddenInset';
    windowConfig.trafficLightPosition = { x: 10, y: 10 };
  }

  mainWindow = new BrowserWindow(windowConfig);


  
  // Cargar la URL en el mainWindow de Electron
  console.log('🌐 [NETWORK] Checking URL accessibility...');
  updateSplashStatus('Verificando conexión');
  
  checkUrl(url.toString(), 15000)
    .then(() => {
      console.log('✅ [NETWORK] URL is accessible, loading...');
      updateSplashStatus('Cargando aplicación');
      
      // Timeout agresivo para loadURL (60 segundos)
      loadUrlTimeout = setTimeout(() => {
        console.error('⏱️ [TIMEOUT] LoadURL took too long, retrying...');
        updateSplashStatus('Timeout - reintentando');
        clearTimeout(loadUrlTimeout);
        retryLoad();
      }, 60000);
      
      mainWindow.loadURL(url.toString())
        .then(() => {
          console.log('📄 [LOAD] URL loaded successfully');
          clearTimeout(loadUrlTimeout);
        })
        .catch(error => {
          console.error('❌ [ERROR] Error loading URL:', error);
          clearTimeout(loadUrlTimeout);
          updateSplashStatus('Error al cargar - reintentando');
          retryLoad();
        });
    })
    .catch(error => {
      console.error('❌ [NETWORK] Error accessing URL:', error);
      updateSplashStatus('Error de conexión - reintentando');
      retryLoad();
    });
  
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
  ipcMain.handle('set-window-size', (event, width, height) => {
    mainWindow.setSize(width, height);
  });
  ipcMain.handle('minimize-to-tray', () => {
    mainWindow.hide();
    tray.setToolTip('App minimized to tray');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ [LOAD] Page finished loading');
    clearTimeout(loadUrlTimeout);
    updateSplashStatus('Página cargada - verificando');
    
    // Inyectar CSS para ocultar scrollbars y ajustar el viewport
    mainWindow.webContents.insertCSS(`
      /* Ocultar scrollbars en todos los navegadores */
      ::-webkit-scrollbar {
        display: none;
      }
      
      * {
        -ms-overflow-style: none;  /* IE y Edge */
        scrollbar-width: none;  /* Firefox */
      }
      
      html, body {
        overflow: hidden;
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
      }
      
      body {
        overflow-y: auto;
        overflow-x: hidden;
      }
    `).then(() => {
      console.log('✅ [STYLE] Custom CSS injected');
    }).catch(err => {
      console.error('❌ [STYLE] Error injecting CSS:', err);
    });
    
    verifyAndShowWindow();
  });
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ [LOAD] Page failed to load:', errorDescription, 'Code:', errorCode);
    clearTimeout(loadUrlTimeout);
    updateSplashStatus('Error en la carga - reintentando');
    retryLoad();
  });
  
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('⏳ [LOAD] Started loading page...');
    updateSplashStatus('Descargando contenido');
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    // listPrinters();
  });
  mainWindow.on('closed', () => { 
    mainWindow = null; 
  });
  
  // Configurar handlers después de crear la ventana
  if (loadAttempts === 0) {
    console.log('📄 [SETUP] Configuring print and SR handlers...');
    setupPrintHandlers(ipcMain, mainWindow);
    setupSrHandlers(ipcMain, mainWindow);
  }
}

function reloadApp() {
  console.log('🔄 [RELOAD] Reloading application...');
  clearTimeout(reloadTimeout);
  clearTimeout(loadUrlTimeout);
  updateSplashStatus('Recargando aplicación');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(url.toString());
  } else {
    createWindow();
  }
}


// Function handling the retry logic
function retryLoad() {
  loadAttempts++;
  if (loadAttempts < MAX_LOAD_ATTEMPTS) {
    console.log(`⚠️ [RETRY] Attempt ${loadAttempts}: Reloading in 30 seconds...`);
    updateSplashStatus(`Reintento ${loadAttempts} en 30 segundos`);
    
    reloadTimeout = setTimeout(() => {
      reloadApp();
    }, 30000);
  } else {
    console.error('❌ [FATAL] Max load attempts reached. Please check your connection or try again later.');
    closeSplashWindow();
    dialog.showErrorBox(
      'Error de Carga', 
      'No se pudo cargar la aplicación después de múltiples intentos. Por favor verifica tu conexión a internet o intenta más tarde.'
    );
  }
}



// Crear el icono de la bandeja del sistema
function setupTrayIcon() {
  if (process.platform === 'win32') {
    const tray = new Tray(path.join(__dirname, '../build/icon.ico'));
    tray.on('click', () => {
      if (isAppContentValidated) {
        if (mainWindow === null || mainWindow.isDestroyed()) {
          createWindow();
        } else {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      } else {
        dialog.showMessageBox({
          type: 'info',
          title: 'RSV Companion',
          message: 'La aplicación está cargando, por favor espere...'
        });
      }
    });

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Abrir', click: () => {
        if (isAppContentValidated) {
          mainWindow.show();
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'RSV Companion',
            message: 'La aplicación está cargando, por favor espere...'
          });
        }
      }},
      { label: 'Buscar actualizaciones', click: () => autoUpdater.checkForUpdates() },
      { label: 'Recargar aplicación', click: () => {
        loadAttempts = 0; // Reset attempts for manual reload
        reloadApp();
      }},
      { label: 'Detener servicio', click: () => {
         isQuitting = true; 
         app.quit(); 
        }}
    ]);

    tray.setToolTip(appName);
    tray.setContextMenu(contextMenu);
    
  }
}

function setupAutoLaunch(){
  // Auto Launch
  autoLaunchManager = new AutoLaunch({
    name: appName,
    path: app.getPath('exe'),
  });
  autoLaunchManager.isEnabled().then(isEnabled => {
    if (!isEnabled) autoLaunchManager.enable();
  });
}

// Inicializar la app
app.on('ready', () => {
  console.log('🎯 [APP] Application ready event fired');
  
  // Crear y mostrar splash window
  splashWindow = createSplashWindow();
  updateSplashVersion(appVersion);
  updateSplashStatus('Iniciando aplicación');
  
  setupTrayIcon();
  setupAutoLaunch();
  
  // Esperar un momento antes de crear la ventana principal
  setTimeout(() => {
    createWindow(1);
  }, 1000);

  // Esperar 10 minutos después del inicio antes de comenzar verificaciones periódicas
  setTimeout(() => {
    setInterval(() => {
      if (!isQuitting) {
        try {
          autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.error('Error en verificación periódica de actualizaciones:', err);
          });
        } catch (error) {
          console.error('Error al verificar actualizaciones:', error);
        }
      }
    }, 10 * 60 * 1000); // Check every 10 minutes
  }, 10 * 60 * 1000); // Start checking after 10 minutes
  
  // Configurar handlers globales (que no dependen de mainWindow)
  ipcMain.handle("start-dev-tools", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools();
    }
  });
  
  // SetupAutoUpdater también necesita esperar a que mainWindow exista
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      setupAutoUpdater(ipcMain, isDev, mainWindow);
    }
  }, 2000);

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

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
