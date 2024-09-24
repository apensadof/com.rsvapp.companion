const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const electron_log = require('electron-log');

// Función para configurar y manejar eventos del autoUpdater
function setup_autoUpdater() {

  // Configura el logging
  autoUpdater.logger = electron_log;
  autoUpdater.logger.transports.file.level = "info";
  
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
  });
  
  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available.');
  });
  
  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater. ' + err);
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
  });
  
  
  // Evento disparado cuando hay una actualización disponible
  autoUpdater.on('update-available', () => {
    console.log('Una nueva actualización está disponible.');
    dialog.showMessageBox({
        type: 'info',
        title: 'Actualización disponible',
        message: 'Hay una nueva versión disponible. Se descargará en segundo plano.',
    });
  });
  
  // Evento disparado cuando la actualización ha sido descargada y está lista para ser instalada
  autoUpdater.on('update-downloaded', () => {
    console.log('Actualización descargada; se instalará en la próxima reiniciación');
    // Puedes forzar la instalación así:
    dialog.showMessageBox({
        type: 'info',
        title: 'Actualización descargada',
        message: 'Una nueva versión ha sido descargada. El programa se actualizará y detendrá automáticamente.',
    });
    autoUpdater.quitAndInstall(); 
  });

  if (require('electron-is-dev')) {
    autoUpdater.autoDownload = false;  // No descargar actualizaciones automáticamente en desarrollo
  } else {
    autoUpdater.checkForUpdatesAndNotify();  // En producción, buscar actualizaciones
  }

}
  module.exports = {
    setup_autoUpdater,
  };