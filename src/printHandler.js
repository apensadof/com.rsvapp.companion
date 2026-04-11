const { BrowserWindow, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

  // Imprimir HTML directamente
  ipcMain.handle('print-html', async (event, htmlContent, paramsConfig = {}) => {
    try {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("console-log", "Triggered print-html interface");
      }
      
      let printWindow = new BrowserWindow({ 
        show: false,
        webPreferences: { 
          nodeIntegration: false 
        } 
      });
      
      // Load HTML content directly
      printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

      printWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Error loading HTML:', errorDescription);
        try {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("console-log", "Error loading HTML: " + errorDescription);
          }
        } catch (e) {
          console.error('Could not send error to main window:', e);
        }
        printWindow.close();
        throw new Error('Error loading HTML content');
      });

      // Wait for content to load
      printWindow.webContents.on('did-finish-load', async () => {
        try {
          const win = getMainWindow();
          const printers = await win.webContents.getPrintersAsync();

          const defaultConfig = {
            deviceName: printers[0].name,
            silent: true,
            printBackground: true,
            margins: {marginType: 'default'},
            pageSize: 'Letter',
            landscape: false,
            color: false,
            scale: 100,
            pagesPerSheet: 1,
            collate: true,
            copies: 1,
            duplexMode: 'simplex',
          };

          const printConfig = {
            ...defaultConfig,
            ...paramsConfig,
            deviceName: (paramsConfig.selectedPrinter !== undefined && printers[paramsConfig.selectedPrinter])
              ? printers[paramsConfig.selectedPrinter].name
              : defaultConfig.deviceName
          };

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

          printWindow.webContents.print(printJobConfig, (success, failureReason) => {
            if (success) {
              console.log('HTML printing succeeded');
            } else {
              dialog.showErrorBox("Error during HTML print", failureReason);
              console.error('Error during HTML print:', failureReason);
            }
            printWindow.close();
          });

          return true;

        } catch (error) {
          try {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("console-log", "Error in print function: " + error);
            }
          } catch (e) {
            console.error('Could not send error to main window:', e);
          }
          dialog.showErrorBox("Error in HTML print function", error.toString());
          console.error('Error printing HTML:', error);
          printWindow.close();
          throw new Error('Error printing HTML');
        }
      });
    } catch (error) {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("console-log", "Error in print-html: " + error.message);
        }
      } catch (e) {
        console.error('Could not send error to main window:', e);
      }
      throw new Error('Error in print-html: ' + error.message);
    }
  });

    // Imprimir iframe
    ipcMain.handle('print-iframe', async (event, src, paramsConfig = {}) => {
    try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("console-log", "Triggered print-ifr interface: " + src);
        }
        // Tamaño para impresora térmica 80mm (~302px a 96 DPI)
        const thermalWidth = paramsConfig.printWidth || 302; // 80mm default
        let printWindow = new BrowserWindow(
            { 
                show: false,
                width: thermalWidth,
                height: 1000,
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
            const win = getMainWindow();
            
            // Esperar a que los recursos estén completamente cargados (evento 'load' del window)
            await printWindow.webContents.executeJavaScript(`
              new Promise(resolve => {
                if (document.readyState === 'complete') {
                  setTimeout(resolve, 150);
                } else {
                  window.addEventListener('load', () => setTimeout(resolve, 150));
                }
              })
            `);

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

    // Print raw HTML content (avoids blob URL cross-context issue)
    ipcMain.handle('print-html', async (event, htmlContent, paramsConfig = {}) => {
      let tmpFile = null;
      try {
        // Write HTML to a temp file so any BrowserWindow can load it via file://
        const tmpDir = os.tmpdir();
        tmpFile = path.join(tmpDir, `rsv_cal_${Date.now()}.html`);
        fs.writeFileSync(tmpFile, htmlContent, 'utf8');
        const fileUrl = `file://${tmpFile.replace(/\\/g, '/')}`;

        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('console-log', 'print-html: loading ' + fileUrl);
        }

        const thermalWidth = paramsConfig.printWidth || 302;
        const printWindow = new BrowserWindow({
          show: false,
          width: thermalWidth,
          height: 1000,
          webPreferences: { nodeIntegration: false },
        });

        printWindow.loadURL(fileUrl);

        printWindow.webContents.on('did-fail-load', (ev, errorCode, errorDescription) => {
          console.error('print-html: failed to load temp file:', errorDescription);
          printWindow.close();
        });

        await new Promise((resolve, reject) => {
          printWindow.webContents.once('did-finish-load', async () => {
            try {
              await printWindow.webContents.executeJavaScript(`
                new Promise(resolve => {
                  if (document.readyState === 'complete') {
                    setTimeout(resolve, 150);
                  } else {
                    window.addEventListener('load', () => setTimeout(resolve, 150));
                  }
                })
              `);

              const printers = await win.webContents.getPrintersAsync();
              const defaultConfig = {
                deviceName: printers[0]?.name || '',
                silent: true,
                printBackground: true,
                margins: { marginType: 'none' },
                pageSize: 'Letter',
                landscape: false,
                color: false,
                copies: 1,
                duplexMode: 'simplex',
              };

              const printConfig = {
                ...defaultConfig,
                ...paramsConfig,
                deviceName: (paramsConfig.selectedPrinter !== undefined && printers[paramsConfig.selectedPrinter])
                  ? printers[paramsConfig.selectedPrinter].name
                  : defaultConfig.deviceName,
              };

              const printJobConfig = {
                deviceName: printConfig.deviceName,
                silent: printConfig.silent,
                printBackground: printConfig.printBackground,
                margins: printConfig.margins,
                pageSize: printConfig.pageSize,
                landscape: printConfig.landscape,
                copies: printConfig.copies,
                duplexMode: printConfig.duplexMode,
              };

              printWindow.webContents.print(printJobConfig, (success, failureReason) => {
                if (!success) {
                  console.error('print-html: print failed:', failureReason);
                }
                printWindow.close();
                try { fs.unlinkSync(tmpFile); } catch (_) {}
                if (success) resolve(); else reject(new Error(failureReason));
              });
            } catch (err) {
              printWindow.close();
              try { fs.unlinkSync(tmpFile); } catch (_) {}
              reject(err);
            }
          });
        });

        return true;
      } catch (error) {
        if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch (_) {} }
        try {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('console-log', 'print-html error: ' + error.message);
          }
        } catch (_) {}
        console.error('print-html error:', error);
        throw new Error('Error en print-html: ' + error.message);
      }
    });
}

module.exports = {
  setupPrintHandlers,
};