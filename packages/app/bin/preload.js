// Preload script for Electron — exposes IPC to renderer
const { contextBridge, ipcRenderer } = require('electron')

const desktopBridge = {
  startServer: () => ipcRenderer.invoke('harmony:start-server'),
  stopServer: () => ipcRenderer.invoke('harmony:stop-server'),
  getServerUrl: () => ipcRenderer.invoke('harmony:server-url'),
  isServerRunning: () => ipcRenderer.invoke('harmony:server-running'),
  getStatus: () => ipcRenderer.invoke('harmony:status'),
  createIdentity: () => ipcRenderer.invoke('harmony:create-identity'),
  recoverIdentity: (mnemonic) => ipcRenderer.invoke('harmony:recover-identity', mnemonic),
  getMigrationState: () => ipcRenderer.invoke('harmony:migration-state'),
  startMigration: () => ipcRenderer.invoke('harmony:start-migration'),
  setMigrationToken: (token) => ipcRenderer.invoke('harmony:set-migration-token', token),
  cancelMigration: () => ipcRenderer.invoke('harmony:cancel-migration'),
  onDeepLink: (callback) => ipcRenderer.on('deep-link', (_event, data) => callback(data)),
  openExternal: (url) => ipcRenderer.invoke('harmony:open-external', url),
  onOAuthResult: (callback) => ipcRenderer.on('harmony:oauth-result', (_event, data) => callback(data)),
  onServerStarted: (callback) => ipcRenderer.on('harmony:server-started', (_event, data) => callback(data)),
  getConfig: () => ipcRenderer.invoke('harmony:config-get'),
  updateConfig: (patch) => ipcRenderer.invoke('harmony:config-update', patch),
  waitForServer: () =>
    new Promise((resolve) => {
      ipcRenderer.invoke('harmony:server-running').then((running) => {
        if (running) {
          ipcRenderer.invoke('harmony:server-url').then((url) => resolve(url))
        } else {
          ipcRenderer.once('harmony:server-started', (_event, data) => resolve(data.serverUrl))
        }
      })
    })
}

contextBridge.exposeInMainWorld('__HARMONY_DESKTOP__', desktopBridge)
contextBridge.exposeInMainWorld('harmony', desktopBridge) // backward compat
