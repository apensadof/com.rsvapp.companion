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
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),  // Usa invoke para la comunicación asíncrona
    startDevTools: (callback) => ipcRenderer.invoke('start-dev-tools'),
    showDialog: (options) => ipcRenderer.invoke('show-dialog', options),
    showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'), // Custom information from the main process
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
    once: (channel, callback) => ipcRenderer.once(channel, (event, ...args) => callback(...args))
});

contextBridge.exposeInMainWorld('electron', {
    setAutostart: async (enabled) => {
        const result = await ipcRenderer.invoke('set-autostart', !!enabled);
        if (!result || result.success !== true) {
            throw new Error(result?.error || 'No se pudo actualizar el autostart');
        }
        return result.enabled === true;
    },
    getAutostart: async () => {
        const result = await ipcRenderer.invoke('get-autostart');
        if (!result || result.success !== true) {
            throw new Error(result?.error || 'No se pudo consultar autostart');
        }
        return result.enabled === true;
    }
});
