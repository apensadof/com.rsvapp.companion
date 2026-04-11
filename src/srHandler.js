const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const ini = require('ini');
const { dialog } = require('electron');

let mainWindow = null;
let dbConfig;
let handlersRegistered = false;

// Helper function to get mainWindow
function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window is not available');
  }
  return mainWindow;
}

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

function setupSrHandlers(ipcMain, window) {
  mainWindow = window;
  
  // No registrar handlers múltiples veces
  if (handlersRegistered) {
    console.log('📄 [SR] SR handlers already registered, updating window reference only');
    return;
  }
  
  handlersRegistered = true;
  console.log('📄 [SR] Registering SR handlers...');

  // Manejador para buscar automáticamente archivos INI (con configuración opcional)
  ipcMain.handle('search-sr-ini', async (event, searchConfig = {}) => {
    try {
      const result = await autoSearchIniFile(searchConfig);
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
  ipcMain.handle('get-db-config', async () => {
    return dbConfig;
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

// Función para buscar TODOS los archivos INI automáticamente
async function autoSearchIniFile(searchConfig = {}) {
    // Configuración con valores por defecto
    const config = {
      baseDirs: searchConfig.baseDirs || [
        path.join(getRootDrive(), 'nationalsoft'),
        path.join('C:', 'nationalsoft'),
        path.join('D:', 'nationalsoft')
      ],
      subFolder: searchConfig.subFolder || 'INIS',
      versionPattern: searchConfig.versionPattern || /^Softrestaurant\d+(\.\d+)*\w*$/,
      iniFilePattern: searchConfig.iniFilePattern || /^Empresa\s*[a-zA-Z0-9]*\d+\.ini$/,
      searchOnlyInINIS: searchConfig.searchOnlyInINIS !== false // Por defecto true
    };
    
    const foundInstallations = []; // Array to store all found installations
    
    try {
      mainWindow.webContents.send("console-log", `Buscando en múltiples ubicaciones: ${config.baseDirs.join(', ')}`);
      
      // Buscar en cada directorio base configurado
      for (const baseDir of config.baseDirs) {
        // Verificar si el directorio existe
        if (!fs.existsSync(baseDir)) {
          mainWindow.webContents.send("console-log", `⚠️ Directorio ${baseDir} no existe, saltando...`);
          continue;
        }
        
        mainWindow.webContents.send("console-log", `✓ Encontrado directorio: ${baseDir}`);
        
        try {
          // Registrar todos los directorios en baseDir para depuración
          const allDirectories = fs.readdirSync(baseDir, { withFileTypes: true });
          mainWindow.webContents.send("console-log", `Subdirectorios en ${baseDir}: ${allDirectories.map(dir => dir.name).join(', ')}`);
        
          // Buscar las versiones instaladas de Softrestaurant dentro del directorio base
          const directories = allDirectories
            .filter(dir => dir.isDirectory() && config.versionPattern.test(dir.name))
            .map(dir => dir.name);
        
          if (directories.length === 0) {
            mainWindow.webContents.send("console-log", `No se encontraron directorios de SoftRestaurant en ${baseDir}.`);
            continue;
          }
          
          mainWindow.webContents.send("console-log", `✓ Versiones encontradas en ${baseDir}: ${directories.join(', ')}`);
        
          // Iterar por cada versión encontrada y buscar archivos INI
          for (const dir of directories) {
            const iniDir = path.join(baseDir, dir, config.subFolder);
            mainWindow.webContents.send("console-log", `Buscando en: ${iniDir}`);
      
            // Check INIS directory
            if (fs.existsSync(iniDir)) {
              const files = fs.readdirSync(iniDir);
              const iniFiles = files.filter(file => config.iniFilePattern.test(file));
      
              if (iniFiles.length > 0) {
                mainWindow.webContents.send("console-log", `✓ Encontrados ${iniFiles.length} archivos INI en ${iniDir}`);
                
                for (const iniFile of iniFiles) {
                  const iniPath = path.join(iniDir, iniFile);
                  
                  try {
                    const iniContent = fs.readFileSync(iniPath, 'utf-8');
                    const parsedData = ini.parse(iniContent);
                    
                    // Extraer el nombre de la empresa del archivo INI
                    const empresaMatch = iniFile.match(/Empresa\s*([a-zA-Z0-9]*\d+)/i);
                    const empresaName = empresaMatch ? empresaMatch[1] : iniFile.replace('.ini', '');
                    
                    foundInstallations.push({
                      version: dir,
                      baseDir: baseDir,
                      iniFileName: iniFile,
                      empresaName: empresaName,
                      path: iniPath,
                      iniData: parsedData,
                      server: parsedData.DataSource || 'N/A',
                      database: parsedData.Catalog || 'N/A',
                      type: 'empresa'
                    });
                    
                    mainWindow.webContents.send("console-log", `✓ Procesado: ${iniFile} (${parsedData.Catalog})`);
                  } catch (error) {
                    console.error(`Error parsing INI file ${iniPath}:`, error);
                    mainWindow.webContents.send("console-log", `❌ Error al parsear ${iniPath}: ${error.message}`);
                  }
                }
              } else {
                mainWindow.webContents.send("console-log", `No se encontraron archivos INI en ${iniDir}.`);
              }
            } else {
              mainWindow.webContents.send("console-log", `Directorio no existe: ${iniDir}`);
            }
          }
        } catch (error) {
          mainWindow.webContents.send("console-log", `Error procesando ${baseDir}: ${error.message}`);
          continue;
        }
      }
  
      if (foundInstallations.length === 0) {
        mainWindow.webContents.send("console-log", `❌ No se encontraron instalaciones de SoftRestaurant en ninguna ubicación`);
        return { 
          success: false, 
          error: 'No se encontraron instalaciones de SoftRestaurant en las rutas configuradas.', 
          installations: [],
          searchedPaths: config.baseDirs
        };
      }
      
      mainWindow.webContents.send("console-log", `✓ Búsqueda completada: ${foundInstallations.length} instalaciones encontradas`);
      
      // Return all found installations
      return { 
        success: true, 
        installations: foundInstallations,
        totalFound: foundInstallations.length,
        searchedPaths: config.baseDirs,
        // For backward compatibility, include first installation data
        path: foundInstallations[0].path,
        iniData: foundInstallations[0].iniData
      };
    } catch (error) {
      console.error('Error buscando el archivo INI:', error);
      mainWindow.webContents.send("console-log", `❌ Error crítico en búsqueda: ${error.message}`);
      return { success: false, error: error.message, installations: [] };
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
    const pool = await sql.connect(config);
    
    // Get database information
    const dbName = config.database;
    const serverName = config.server;
    
    // Get list of tables
    const tablesResult = await pool.request().query(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME,
        TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    
    const tables = tablesResult.recordset;
    
    // Get database size
    let dbSize = null;
    try {
      const sizeResult = await pool.request().query(`
        SELECT 
          SUM(size) * 8 / 1024 as SizeMB
        FROM sys.master_files
        WHERE database_id = DB_ID()
      `);
      dbSize = sizeResult.recordset[0]?.SizeMB;
    } catch (err) {
      console.log('Could not get database size:', err.message);
    }
    
    return {
      success: true,
      database: dbName,
      server: serverName,
      tables: tables,
      tableCount: tables.length,
      sizeMB: dbSize ? Math.round(dbSize) : null
    };
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    return {
      success: false,
      error: error.message
    };
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
  setupSrHandlers,
  autoSearchIniFile,
  readIniFile,
  checkDbConnection,
  tableQuery,
};