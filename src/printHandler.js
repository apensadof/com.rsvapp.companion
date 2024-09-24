const { BrowserWindow } = require('electron');

let selectedPrinter = null;

function setup_printHandlers(ipcMain, mainWindow) {
  // Listar impresoras
  ipcMain.handle('list-printers', async () => {
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers; // Return the list of printers to the renderer
    } catch (error) {
      console.error('Error al listar impresoras:', error);
      throw new Error('Error al listar impresoras'); // Throw an error to the renderer
    }
  });

  // Seleccionar impresora
  ipcMain.handle('select-printer', async (event, printerName) => {
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      
      if (printerIndex >= 0 && printerIndex < printers.length) {
        selectedPrinter = printers[printerIndex];
        mainWindow.webContents.send("console-log", "Selected printer: "+JSON.stringify(selectedPrinter));
        return selectedPrinter; // Return the selected printer to the renderer
      } else {
        throw new Error('Índice de impresora no válido');
      }
    } catch (error) {
      console.error('Error al seleccionar impresora:', error);
      throw new Error('Error al seleccionar impresora');
    }
  });

  // Imprimir contenido
  ipcMain.handle('print', async (event, options) => {
    try {
      await mainWindow.webContents.print({
        deviceName: selectedPrinter ? selectedPrinter.name : null,
        silent: true,
        printBackground: true,
      });
      return { success: true }; // Return success response to renderer
    } catch (error) {
      console.error('Fallo de impresión:', error);
      throw new Error('Error durante la impresión');
    }
  });

    // Imprimir iframe
    ipcMain.handle('print-iframe', async (event, src, config = {}) => {
        mainWindow.webContents.send("console-log", "Triggered print-ifr interface: " + src);

    try {
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
            mainWindow.webContents.send("console-log", "Error cargando el iframe: " + errorDescription);
            printWindow.close();
            throw new Error('Error cargando el iframe');
        });

        // Esperar hasta que el iframe haya cargado
        printWindow.webContents.on('did-finish-load', async () => {
        mainWindow.webContents.send("console-log", "Se va a imprimir " + src);

        try {
            // Obtener la lista de impresoras
            const printers = await mainWindow.webContents.getPrintersAsync();

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


            // Obtener la configuración con valores por defecto
            // Definir la configuración predeterminada
            const defaultConfig = {
                deviceName: printers[0].name,  // Impresora predeterminada
                silent: false,  // No mostrar el diálogo de impresión
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
                ...config,  // Sobrescribir con la configuración proporcionada
                deviceName: config.selectedPrinter !== undefined 
                    ? printers[config.selectedPrinter]?.name 
                    : defaultConfig.deviceName,  // Elegir impresora según el índice o usar la predeterminada
            };

            mainWindow.webContents.send("console-log", "Impresora a elegir: " + deviceName);

            // Ejecutar la impresión
            printWindow.webContents.print({
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
            }, (success, failureReason) => {
                if (success) {
                    mainWindow.webContents.send("console-log", "Impresión exitosa");
                } else {
                    showErrorDialog("Error al imprimir iframe: " + failureReason);
                    console.error('Error al imprimir iframe:', failureReason);
                }
                printWindow.close();
            });

            return true; // Devolver éxito después de imprimir

        } catch (error) {
            showErrorDialog("Error al imprimir iframe: " + error.message);
            console.error('Error al imprimir iframe:', error);
            mainWindow.webContents.send("console-log", "Error en la impresión: " + error.message);
            printWindow.close();
            throw new Error('Error al imprimir iframe');
            return false;
        }
        });
    } catch (error) {
        mainWindow.webContents.send("console-log", "Error en print-iframe: " + error.message);
        throw new Error('Error en print-iframe: ' + error.message);
        return false;
    }
    });
}

module.exports = {
  setup_printHandlers,
};