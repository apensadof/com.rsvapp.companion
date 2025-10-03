const { dialog, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const electron_log = require('electron-log');

// Función para configurar y manejar eventos del autoUpdater
function setupAutoUpdater(ipcMain, isDev, mainWindow) {

  // Configura el logging
  autoUpdater.logger = electron_log;
  autoUpdater.logger.transports.file.level = "info";
  
  // Configurar timeouts y opciones adicionales
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Deshabilitar verificación de firma en desarrollo
  if (isDev) {
    autoUpdater.forceDevUpdateConfig = true;
  }
  
  // Variable para rastrear si ya estamos verificando actualizaciones
  let isCheckingForUpdates = false;
  
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    isCheckingForUpdates = true;
    
    // Timeout de 30 segundos para la verificación
    setTimeout(() => {
      if (isCheckingForUpdates) {
        console.log('Update check timeout - continuing with app load');
        isCheckingForUpdates = false;
      }
    }, 30000);
  });
  
  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available.');
    isCheckingForUpdates = false;
  });
  
  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater. ' + err);
    isCheckingForUpdates = false;
    // No enviar el error al window si aún no está listo
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send("console-log", 'Error in auto-updater. ' + err);
    }
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
    mainWindow.webContents.send("console-log", log_message);

  });
  
  
  // Evento disparado cuando hay una actualización disponible
  autoUpdater.on('update-available', (info) => {
    console.log('Una nueva actualización está disponible.');
    isCheckingForUpdates = false;
    
    // No enviar mensajes si la ventana no está lista
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send("console-log", "Una nueva actualización está disponible.");
      mainWindow.webContents.send("update-available");
    }

    new Notification({ 
        title: 'Actualización disponible',
      body: 'Hay una nueva versión disponible. Se descargará en segundo plano.'
    }).show();
  });
  // Evento disparado cuando la actualización ha sido descargada y está lista para ser instalada
  autoUpdater.on('update-downloaded', () => {
    isCheckingForUpdates = false;
    new Notification({ 
      title: 'Actualización descargada', 
      body: 'El programa se actualizará automáticamente.'
    }).show();
    console.log('Actualización descargada; se instalará en la próxima reiniciación');
    autoUpdater.quitAndInstall(); 
  });
  

  // Verificar actualizaciones solo en producción
  if (!isDev) {
    console.log('Aplicación en modo producción - programando verificación de actualizaciones');
    // Esperar 10 segundos antes de verificar actualizaciones para no bloquear el inicio
    setTimeout(() => {
      if (!isCheckingForUpdates) {
        try {
          console.log('Iniciando verificación de actualizaciones...');
          autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.error('Error al verificar actualizaciones:', err);
            isCheckingForUpdates = false;
          });
        } catch (error) {
          console.error('Error al iniciar verificación de actualizaciones:', error);
          isCheckingForUpdates = false;
        }
      }
    }, 10000);
  } else {
    console.log('Aplicación en modo desarrollo - actualizaciones deshabilitadas');
  }
}
  module.exports = {
    setupAutoUpdater,
  };