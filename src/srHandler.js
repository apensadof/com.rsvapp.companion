const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const ini = require('ini');
const { dialog } = require('electron');

let mainWindow = null;
let dbConfig;


function formatDbCred(config){
    return {
        user: config.User,
        password: config.Pwd,
        server: config.DataSource,
        database: config.Catalog,
        options: {
          encrypt: false,
          trustServerCertificate: true
        }
      };
}

function setup_srHandlers(ipcMain, window) {
  mainWindow = window;

  // Manejador para buscar automáticamente archivos INI
  ipcMain.handle('search-sr-ini', async () => {
    try {
      const result = await autoSearchIniFile();
      return result;
    } catch (error) {
      return { success: false, error };
    }
  });

  ipcMain.handle('buffer-from-b64', (event, base64String) => {
    try {
      // Decodifica la cadena base64 en un Buffer y convierte a string utf-8
      const decodedString = Buffer.from(base64String, 'base64').toString('utf-8');
      return { success: true, decodedString };
    } catch (error) {
      console.error('Error al decodificar el Buffer:', error);
      return { success: false, error: 'Error al decodificar el Buffer' };
    }
  });

  // Manejador para seleccionar manualmente el archivo INI
  ipcMain.handle('select-ini-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'INI Files', extensions: ['ini'] }]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Manejador para leer el archivo INI
  ipcMain.handle('read-ini-file', (event, filePath) => {
    return readIniFile(filePath);
  });


  // Manejador para verificar la conexión con la base de datos
  ipcMain.handle('validate-db-connection', async (event, config) => {
    dbConfig = formatDbCred(config);
    return await checkDbConnection(dbConfig);
  });
/*
  // Manejador para obtener las tablas de la base de datos
  ipcMain.handle('get-tables', async (event, config) => {
    dbConfig = formatDbCred(config);
    return await fetchTables(dbConfig);
  });

  // Manejador para obtener los datos de una tabla específica
  ipcMain.handle('get-table-data', async (event, config, tableName) => {
    dbConfig = formatDbCred(config);
    return await fetchTableData(dbConfig, tableName);
  });*/

  // Manejador para ejecutar una consulta específica
    // Manejador para ejecutar una consulta específica
    ipcMain.handle('execute-sql-query', async (event, dbQuery) => {
        if (!dbConfig) {
        return { success: false, error: 'Conexión no validada' }; // Asegúrate de tener una conexión antes de ejecutar consultas
        }
        try {
        const result = await tableQuery(dbConfig, dbQuery); // Usa el dbConfig almacenado
        return { success: true, data: result };
        } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        return { success: false, error };
        }
    });
    }

// Función para buscar el archivo INI automáticamente
async function autoSearchIniFile() {
    const baseDir = path.join(getRootDrive(), 'nationalsoft');  // Directorio base donde buscar
    const versionPattern = /^Softrestaurant\d+(\.\d+)*\w*$/;  // Patrón para versiones, e.g., Softrestaurant9.5.0Pro
    const iniFilePattern = /^Empresa\s*[a-zA-Z0-9]*\d+\.ini$/;  // Patrón para los archivos INI
    const restaurantIniFile = 'restaurant.ini';  // Nombre del archivo restaurant.ini
    
    try {
      mainWindow.webContents.send("console-log", `Se buscará en ${baseDir}`);
      if (!fs.existsSync(baseDir)) {
        mainWindow.webContents.send("console-log", `El directorio base ${baseDir} no existe.`);
        return { success: false, error: `El directorio base ${baseDir} no existe.` };
      } else {
        mainWindow.webContents.send("console-log", `El directorio base ${baseDir} se encontró.`);
      }
    
      // Registrar todos los directorios en baseDir para depuración
      const allDirectories = fs.readdirSync(baseDir, { withFileTypes: true });
      mainWindow.webContents.send("console-log", `Directorios en ${baseDir}: ${allDirectories.map(dir => dir.name).join(', ')}`);
    
      // Buscar las versiones instaladas de Softrestaurant dentro del directorio base
      const directories = allDirectories
        .filter(dir => dir.isDirectory() && versionPattern.test(dir.name))
        .map(dir => dir.name);
    
      if (directories.length === 0) {
        mainWindow.webContents.send("console-log", `No se encontraron directorios que coincidan con el patrón de Softrestaurant en ${baseDir}.`);
      } else {
        mainWindow.webContents.send("console-log", `Directorios encontrados: ${directories.join(', ')}`);
      }
    
      // Iterar por cada versión encontrada
      for (const dir of directories) {
        const iniDir = path.join(baseDir, dir, 'INIS');  // Ruta hacia la carpeta INIS
        mainWindow.webContents.send("console-log", `Buscando en: ${iniDir}`);
  
        if (fs.existsSync(iniDir)) {
          const files = fs.readdirSync(iniDir);
          const iniFile = files.find(file => iniFilePattern.test(file));  // Buscar el archivo INI
  
          if (iniFile) {
            const iniPath = path.join(iniDir, iniFile);
            mainWindow.webContents.send("console-log", `Archivo INI encontrado: ${iniPath}`);
            const iniContent = fs.readFileSync(iniPath, 'utf-8');
            const parsedData = ini.parse(iniContent);
            return { success: true, path:iniPath, iniData: parsedData };
          } else {
            mainWindow.webContents.send("console-log", `No se encontraron archivos INI que coincidan en ${iniDir}.`);
          }
        } else {
          mainWindow.webContents.send("console-log", `El directorio ${iniDir} no existe.`);
        }

        // Si no se encuentra en INIS, buscar el archivo restaurant.ini
        const restaurantIniPath = path.join(baseDir, dir, restaurantIniFile);
        if (fs.existsSync(restaurantIniPath)) {
          mainWindow.webContents.send("console-log", `Archivo restaurant.ini encontrado: ${restaurantIniPath}`);
          const iniContent = fs.readFileSync(restaurantIniPath, 'utf-8');
          const parsedData = ini.parse(iniContent);
          return { success: true, path: iniPath, iniData: parsedData };
        } else {
          mainWindow.webContents.send("console-log", `No se encontró ${restaurantIniFile} en ${path.join(baseDir, dir)}.`);
        }
      }
  
      return { success: false, error: 'No se encontró ningún archivo INI ni restaurant.ini.' };
    } catch (error) {
      console.error('Error buscando el archivo INI:', error);
      return { success: false, error: error.message };
    }
}

// Función para obtener el disco duro actual
function getRootDrive() {
    const currentPath = process.cwd(); // Obtiene la ruta actual
    return path.parse(currentPath).root; // Obtiene el root del sistema (p.ej., C:\ o D:\)
  }  

// Función para leer el archivo INI seleccionado
function readIniFile(filePath) {
    mainWindow.webContents.send("console-log", "Se va a leer " + filePath);
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const config = ini.parse(fileContent);
    return config;
  } catch (error) {
    console.error('Error al leer el archivo INI:', error);
    return null;
  }
}

// Función para verificar la conexión con la base de datos
async function checkDbConnection(config) {
  try {
    await sql.connect(config);
    return true;
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    return false;
  }
}

// Función para ejecutar una consulta específica
async function tableQuery(dbConfig, dbQuery) {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query(dbQuery);
    return result;
  } catch (error) {
    dialog.showErrorBox('Error al ejecutar la consulta:', error);
    mainWindow.webContents.send("console-log", "Error on query", dbQuery);
    console.error('Error al ejecutar la consulta:', error);
    return [];
  }
}



module.exports = {
  setup_srHandlers,
  autoSearchIniFile,
  readIniFile,
  checkDbConnection,
  tableQuery,
};