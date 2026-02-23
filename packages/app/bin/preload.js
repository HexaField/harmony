// Preload script for Electron — exposes IPC to renderer
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('harmony', {
  getStatus: () => ipcRenderer.invoke('harmony:status'),
  createIdentity: () => ipcRenderer.invoke('harmony:create-identity'),
  recoverIdentity: (mnemonic) => ipcRenderer.invoke('harmony:recover-identity', mnemonic),
  getMigrationState: () => ipcRenderer.invoke('harmony:migration-state'),
  startMigration: () => ipcRenderer.invoke('harmony:start-migration'),
  setMigrationToken: (token) => ipcRenderer.invoke('harmony:set-migration-token', token),
  cancelMigration: () => ipcRenderer.invoke('harmony:cancel-migration'),
  onDeepLink: (callback) => ipcRenderer.on('deep-link', (_event, data) => callback(data))
})
