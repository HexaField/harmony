#!/usr/bin/env node
// @harmony/app — Electron desktop application entrypoint
// Starts ServerRuntime in main process, opens BrowserWindow with ui-app

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { HarmonyApp } from '../src/app.ts'

const harmonyApp = new HarmonyApp()
let mainWindow = null
let tray = null

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production'
const uiDevUrl = process.env.HARMONY_UI_DEV_URL ?? 'http://localhost:5173'

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'Harmony',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(import.meta.dirname ?? __dirname, '..', 'bin', 'preload.js')
    }
  })

  // Load UI
  if (isDev) {
    await mainWindow.loadURL(uiDevUrl)
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // In packaged app: resources/ui/index.html (extraResources)
    // In dev layout: ../../ui-app/dist/index.html
    const resourcesPath = process.resourcesPath ?? join(import.meta.dirname ?? __dirname, '..')
    const uiDistPath = join(resourcesPath, 'ui', 'index.html')
    const devUiPath = join(import.meta.dirname ?? __dirname, '..', '..', 'ui-app', 'dist', 'index.html')
    if (existsSync(uiDistPath)) {
      await mainWindow.loadFile(uiDistPath)
    } else if (existsSync(devUiPath)) {
      await mainWindow.loadFile(devUiPath)
    } else {
      await mainWindow.loadURL(uiDevUrl)
    }
  }

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of quitting
    if (process.platform !== 'linux') {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVFhH7c4xDQAgEADBe/5Zh4AUKCjoZBiL2e2fHxERERERERERERERERERERERERERERERERERkX8ufZ/9qjkzjwNjWRk38fBeSQAAAABJRU5ErkJggg=='
  )
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Harmony', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: `Status: ${harmonyApp.getState().running ? 'Online' : 'Offline'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: async () => {
        await harmonyApp.stopServer()
        app.quit()
      }
    }
  ])

  tray.setToolTip('Harmony')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow?.show())
}

function registerDeepLinks() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('harmony', process.execPath, [process.argv[1]])
    }
  } else {
    app.setAsDefaultProtocolClient('harmony')
  }

  app.on('open-url', (_event, url) => {
    // Handle OAuth deep links: harmony://oauth-complete?data={...}
    if (url.startsWith('harmony://oauth-complete')) {
      try {
        const u = new URL(url)
        const dataStr = u.searchParams.get('data')
        if (dataStr && mainWindow) {
          const data = JSON.parse(dataStr)
          mainWindow.webContents.send('harmony:oauth-result', data)
          mainWindow.show()
          return
        }
      } catch (e) {
        console.error('Failed to parse OAuth deep link:', e)
      }
    }

    const result = harmonyApp.handleDeepLink(url)
    if (result && mainWindow) {
      mainWindow.webContents.send('deep-link', result)
      mainWindow.show()
    }
  })
}

function registerIPC() {
  ipcMain.handle('harmony:status', () => harmonyApp.getState())
  ipcMain.handle('harmony:create-identity', () => harmonyApp.createIdentity())
  ipcMain.handle('harmony:recover-identity', (_e, mnemonic) => harmonyApp.recoverIdentity(mnemonic))
  ipcMain.handle('harmony:migration-state', () => harmonyApp.getMigrationState())
  ipcMain.handle('harmony:start-migration', () => harmonyApp.startMigration())
  ipcMain.handle('harmony:set-migration-token', (_e, token) => harmonyApp.setMigrationToken(token))
  ipcMain.handle('harmony:cancel-migration', () => harmonyApp.cancelMigration())

  // Server lifecycle IPC
  const serverHost = process.env.HARMONY_HOST ?? '127.0.0.1'

  ipcMain.handle('harmony:start-server', async () => {
    await harmonyApp.startServer()
    return { serverUrl: `ws://${serverHost}:${harmonyApp.getState().serverPort}` }
  })

  ipcMain.handle('harmony:stop-server', async () => {
    await harmonyApp.stopServer()
    return { stopped: true }
  })

  ipcMain.handle('harmony:server-url', () => {
    const state = harmonyApp.getState()
    if (!state.running) return null
    return `ws://${serverHost}:${state.serverPort}`
  })

  ipcMain.handle('harmony:server-running', () => harmonyApp.getState().running)

  ipcMain.handle('harmony:open-external', (_e, url) => shell.openExternal(url))

  // Config persistence (on-disk, not localStorage)
  ipcMain.handle('harmony:config-get', () => harmonyApp.getConfig())
  ipcMain.handle('harmony:config-update', (_e, patch) => {
    harmonyApp.updateConfig(patch)
    return harmonyApp.getConfig()
  })
}

app.whenReady().then(async () => {
  // Grant media permissions (camera, microphone, screen capture)
  const { session, systemPreferences } = await import('electron')

  // macOS: proactively request TCC permissions
  if (process.platform === 'darwin') {
    try {
      const micStatus = await systemPreferences.askForMediaAccess('microphone')
      const camStatus = await systemPreferences.askForMediaAccess('camera')
      console.log(`Media permissions — mic: ${micStatus}, camera: ${camStatus}`)
    } catch (err) {
      console.warn('Could not request media permissions:', err)
    }
  }

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications']
    callback(allowed.includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications']
    return allowed.includes(permission)
  })

  // Start the server runtime
  try {
    await harmonyApp.launch()
    console.log('Harmony server started on port', harmonyApp.getState().serverPort)
  } catch (err) {
    console.error('Failed to start server:', err)
  }

  registerDeepLinks()
  registerIPC()
  await createWindow()
  createTray()

  // Notify renderer when server is already running
  mainWindow.webContents.on('did-finish-load', () => {
    if (harmonyApp.getState().running) {
      mainWindow.webContents.send('harmony:server-started', {
        serverUrl: `ws://127.0.0.1:${harmonyApp.getState().serverPort}`
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    harmonyApp.stopServer().then(() => app.quit())
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    mainWindow.show()
  }
})

app.on('before-quit', async () => {
  await harmonyApp.stopServer()
})
