const { contextBridge, ipcRenderer } = require('electron');

// Este script se ejecutará antes de que se cargue la página
// Puedes usarlo para exponer APIs seguras al proceso de renderizado

window.addEventListener('DOMContentLoaded', () => {
    console.log('Preload script ejecutado correctamente');
    // Puedes hacer algo más aquí, como exponer APIs personalizadas
  });


contextBridge.exposeInMainWorld('electronAPI', {
    findIniFile: () => ipcRenderer.invoke('find-ini-file'),
    onIniData: (callback) => ipcRenderer.on('ini-data', (event, data) => callback(data)),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),  // Usa invoke para la comunicación asíncrona
    startDevTools: (callback) => ipcRenderer.invoke('start-dev-tools'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'), // Custom information from the main process
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
    once: (channel, callback) => ipcRenderer.once(channel, (event, ...args) => callback(...args))
});

