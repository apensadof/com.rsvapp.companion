const { BrowserWindow, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let splashWindow = null;

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  splashWindow = new BrowserWindow({
    width: 450,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Leer el logo como base64
  const logoPath = path.join(__dirname, '../build/rsv_dark.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');

  const isDarkMode = nativeTheme.shouldUseDarkColors;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      overflow: hidden;
    }
    
    .splash-container {
      background: ${isDarkMode ? '#1a1a1a' : '#ffffff'};
      border-radius: 24px;
      padding: 50px 40px;
      text-align: center;
      box-shadow: 0 25px 80px rgba(0,0,0,${isDarkMode ? '0.6' : '0.15'}), 
                  0 0 0 1px rgba(${isDarkMode ? '255,255,255' : '0,0,0'},${isDarkMode ? '0.1' : '0.05'});
      width: 420px;
      animation: slideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      backdrop-filter: blur(10px);
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    .logo-container {
      margin-bottom: 30px;
      animation: fadeInScale 0.6s ease-out 0.2s both;
    }
    
    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    .logo {
      width: 120px;
      height: auto;
      ${isDarkMode ? 'filter: invert(1) brightness(1.1);' : ''}
      animation: pulse 3s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { 
        transform: scale(1);
        opacity: 1;
      }
      50% { 
        transform: scale(1.02);
        opacity: 0.95;
      }
    }
    
    h1 {
      color: ${isDarkMode ? '#ffffff' : '#1a1a1a'};
      font-size: 26px;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
      animation: fadeIn 0.6s ease-out 0.3s both;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .subtitle {
      color: ${isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'};
      font-size: 13px;
      margin-bottom: 35px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1px;
      animation: fadeIn 0.6s ease-out 0.4s both;
    }
    
    .status {
      color: ${isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)'};
      font-size: 14px;
      margin-bottom: 25px;
      min-height: 20px;
      font-weight: 500;
      animation: fadeIn 0.6s ease-out 0.5s both;
    }
    
    .loader {
      width: 100%;
      height: 3px;
      background: ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 20px;
      animation: fadeIn 0.6s ease-out 0.6s both;
    }
    
    .loader-bar {
      height: 100%;
      background: ${isDarkMode ? '#ffffff' : '#1a1a1a'};
      border-radius: 2px;
      animation: loading 1.8s cubic-bezier(0.65, 0.05, 0.36, 1) infinite;
      box-shadow: 0 0 10px ${isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'};
    }
    
    @keyframes loading {
      0% {
        width: 0%;
        margin-left: 0%;
      }
      50% {
        width: 60%;
        margin-left: 20%;
      }
      100% {
        width: 0%;
        margin-left: 100%;
      }
    }
    
    .version {
      color: ${isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
      font-size: 11px;
      font-weight: 500;
      animation: fadeIn 0.6s ease-out 0.7s both;
    }
    
    .dots {
      display: inline-block;
      width: 20px;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="splash-container">
    <div class="logo-container">
      <img src="data:image/png;base64,${logoBase64}" alt="RSV Logo" class="logo">
    </div>
    <h1>Companion</h1>
    <!--<div class="subtitle">Restaurant System</div>-->
    <div class="status" id="status">Iniciando aplicación<span class="dots" id="dots"></span></div>
    <div class="loader">
      <div class="loader-bar"></div>
    </div>
    <div class="version" id="version">v1.0.0</div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    // Animación de puntos
    let dotCount = 0;
    setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      const dotsElement = document.getElementById('dots');
      if (dotsElement) {
        dotsElement.textContent = '.'.repeat(dotCount);
      }
    }, 500);
    
    // Recibir actualizaciones de estado
    ipcRenderer.on('splash-status', (event, message) => {
      const statusElement = document.getElementById('status');
      if (statusElement) {
        statusElement.innerHTML = message + '<span class="dots" id="dots"></span>';
      }
    });
    
    ipcRenderer.on('splash-version', (event, version) => {
      const versionElement = document.getElementById('version');
      if (versionElement) {
        versionElement.textContent = 'v' + version;
      }
    });
  </script>
</body>
</html>
  `;

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  return splashWindow;
}

function updateSplashStatus(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-status', message);
  }
}

function updateSplashVersion(version) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-version', version);
  }
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

module.exports = {
  createSplashWindow,
  updateSplashStatus,
  updateSplashVersion,
  closeSplashWindow
};

