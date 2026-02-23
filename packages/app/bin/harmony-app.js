#!/usr/bin/env node
// @harmony/app — Electron desktop application entrypoint
// Starts ServerRuntime in main process, opens BrowserWindow with ui-app

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, protocol } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { HarmonyApp, getDataDir } from '../src/app.ts'

const harmonyApp = new HarmonyApp()
let mainWindow = null
let tray = null

const isDev = process.env.NODE_ENV !== 'production'
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
      preload: join(import.meta.dirname ?? __dirname, 'preload.js')
    }
  })

  // Load UI
  if (isDev) {
    await mainWindow.loadURL(uiDevUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const uiDistPath = join(import.meta.dirname ?? __dirname, '..', '..', 'ui-app', 'dist', 'index.html')
    if (existsSync(uiDistPath)) {
      await mainWindow.loadFile(uiDistPath)
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
}

app.whenReady().then(async () => {
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
