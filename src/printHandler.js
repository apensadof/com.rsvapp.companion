const { BrowserWindow, dialog } = require('electron');

let selectedPrinter = null;
let mainWindowRef = null;
let handlersRegistered = false;

// Helper function to get mainWindow
function getMainWindow() {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    throw new Error('Main window is not available');
  }
  return mainWindowRef;
}

function setupPrintHandlers(ipcMain, mainWindow) {
  mainWindowRef = mainWindow;
  
  // No registrar handlers múltiples veces
  if (handlersRegistered) {
    console.log('📄 [PRINT] Print handlers already registered, updating window reference only');
    return;
  }
  
  handlersRegistered = true;
  console.log('📄 [PRINT] Registering print handlers...');
  
  // Listar impresoras
  ipcMain.handle('list-printers', async () => {
    try {
      const win = getMainWindow();
      const printers = await win.webContents.getPrintersAsync();
      return printers; // Return the list of printers to the renderer
    } catch (error) {
      console.error('Error al listar impresoras:', error);
      throw new Error('Error al listar impresoras: ' + error.message);
    }
  });

  // Seleccionar impresora
  ipcMain.handle('select-printer', async (event, printerIndex) => {
    try {
      const win = getMainWindow();
      const printers = await win.webContents.getPrintersAsync();
      
      if (printerIndex >= 0 && printerIndex < printers.length) {
        selectedPrinter = printers[printerIndex];
        if (win && !win.isDestroyed()) {
          win.webContents.send("console-log", "Selected printer: " + JSON.stringify(selectedPrinter));
        }
        return selectedPrinter; // Return the selected printer to the renderer
      } else {
        throw new Error('Índice de impresora no válido');
      }
    } catch (error) {
      console.error('Error al seleccionar impresora:', error);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("console-log", "Error al seleccionar impresora: " + error);
      }
      throw new Error('Error al seleccionar impresora: ' + error.message);
    }
  });

  // Imprimir contenido
  ipcMain.handle('print', async (event, options) => {
    try {
      const win = getMainWindow();
      await win.webContents.print({
        deviceName: selectedPrinter ? selectedPrinter.name : null,
        silent: true,
        printBackground: true,
      });
      return { success: true }; // Return success response to renderer
    } catch (error) {
      console.error('Fallo de impresión:', error);
      throw new Error('Error durante la impresión: ' + error.message);
    }
  });

    // Imprimir iframe
    ipcMain.handle('print-iframe', async (event, src, paramsConfig = {}) => {
    try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("console-log", "Triggered print-ifr interface: " + src);
        }
        let printWindow = new BrowserWindow(
            { 
                show: false,
                webPreferences: { 
                    nodeIntegration: false 
                  } 
            }
        );
        
        // Cargar el iframe
        printWindow.loadURL(src);

        printWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Error cargando el iframe:', errorDescription);
            try {
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send("console-log", "Error loading iframe: " + errorDescription);
              }
            } catch (e) {
              console.error('Could not send error to main window:', e);
            }
            printWindow.close();
            throw new Error('Error cargando el iframe');
        });

        // Esperar hasta que el iframe haya cargado
        printWindow.webContents.on('did-finish-load', async () => {

        try {
            // mainWindow.webContents.send("console-log", "Starting print process");

            // Obtener la lista de impresoras

            /*// Verificar si hay una impresora seleccionada
            let deviceName = null;
            if (printer !== null) {
                if (printers[printer]) {
                    deviceName = printers[printer].name;
                } else {
                    throw new Error('Impresora no encontrada');
                }
            } else {
                deviceName = selectedPrinter ? selectedPrinter.name : null;
            }*/

            const win = getMainWindow();
            const printers = await win.webContents.getPrintersAsync();

            // Obtener la configuración con valores por defecto
            // Definir la configuración predeterminada
            const defaultConfig = {
                deviceName: printers[0].name,  // Impresora predeterminada
                silent: true,  // No mostrar el diálogo de impresión
                printBackground: true,  // Imprimir con fondos
                margins: {marginType: 'default'},  // Sin márgenes
                pageSize: 'Letter',  // Tamaño de página predeterminado
                landscape: false,  // Vertical
                color: true, // Color o BN
                scale: 100,  // Escala al 100%
                pagesPerSheet: 1,  // Una página por hoja
                collate: true,  // Agrupado
                copies: 1,  // Número de copias
                duplexMode: 'simplex',  // Impresión en una sola cara
            };

            // Combinar la configuración predeterminada con la personalizada proporcionada en `config`
            const printConfig = {
                ...defaultConfig,  // Valores por defecto
                ...paramsConfig,  // Sobrescribir con la configuración proporcionada

                // Si 'selectedPrinter' está definida en config y existe en la lista de impresoras, usarla
                deviceName: (paramsConfig.selectedPrinter !== undefined && printers[paramsConfig.selectedPrinter])
                    ? printers[paramsConfig.selectedPrinter].name  // Usar la impresora seleccionada
                    : defaultConfig.deviceName  // Usar la impresora predeterminada si no se selecciona una
            };

            // Definir la configuración del trabajo de impresión
            const printJobConfig = {
                deviceName: printConfig.deviceName,
                silent: printConfig.silent,
                printBackground: printConfig.printBackground,
                margins: printConfig.margins,
                pageSize: printConfig.pageSize,
                landscape: printConfig.landscape,
                scale: printConfig.scale,
                pagesPerSheet: printConfig.pagesPerSheet,
                collate: printConfig.collate,
                copies: printConfig.copies,
                duplexMode: printConfig.duplexMode,
            };
            //mainWindow.webContents.send("console-log", "Print config: " + JSON.stringify(printJobConfig));

            //mainWindow.webContents.send("console-log", "Selected printer: " + printConfig.deviceName);

            // Ejecutar la impresión
            printWindow.webContents.print(printJobConfig, (success, failureReason) => {
                if (success) {
                    // mainWindow.webContents.send("console-log", "Printing succeeded");
                } else {
                    dialog.showErrorBox("Error during ifr print", failureReason);
                    console.error('Error during ifr print:', failureReason);
                }
                printWindow.close();
            });

            return true; // Devolver éxito después de imprimir

        } catch (error) {
            try {
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send("console-log", "Error in print funct: " + error);
              }
            } catch (e) {
              console.error('Could not send error to main window:', e);
            }
            dialog.showErrorBox("Error in ifrprint funct", error.toString());
            console.error('Error al imprimir iframe:', error);
            printWindow.close();
            throw new Error('Error al imprimir iframe');
        }
        });
    } catch (error) {
        try {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("console-log", "Error en print-iframe: " + error.message);
          }
        } catch (e) {
          console.error('Could not send error to main window:', e);
        }
        throw new Error('Error en print-iframe: ' + error.message);
    }
    });
}

module.exports = {
  setupPrintHandlers,
};