import { app, shell, BrowserWindow, dialog, nativeImage, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { runMigrations } from './db'
import { registerIpcHandlers } from './ipc'

function showAboutWindow(): void {
  const pngPath = join(__dirname, '../../resources/icon.png')
  const iconImage = nativeImage.createFromPath(pngPath)
  // Encode icon as base64 for embedding in HTML
  const iconBase64 = iconImage.toPNG().toString('base64')

  const win = new BrowserWindow({
    width: 340,
    height: 260,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'About Astro AI Chat',
    backgroundColor: '#ffffff',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  win.setMenu(null)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100vh;
    background: #ffffff; color: #1a1a1a; text-align: center;
    padding: 24px; gap: 10px;
    -webkit-app-region: drag;
    user-select: none;
  }
  img { width: 80px; height: 80px; border-radius: 18px; }
  h1 { font-size: 17px; font-weight: 600; margin-top: 4px; }
  .version { font-size: 13px; color: #666; }
  .credits { font-size: 12px; color: #888; }
  .copyright { font-size: 11px; color: #aaa; margin-top: 4px; }
</style>
</head>
<body>
  <img src="data:image/png;base64,${iconBase64}" alt="icon"/>
  <h1>Astro AI Chat</h1>
  <p class="version">Version ${app.getVersion()}</p>
  <p class="credits">Powered by AI &amp; Astrology API</p>
  <p class="copyright">© 2026 Procoders. All rights reserved.</p>
</body>
</html>`

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Astro AI Chat',
    backgroundColor: '#111111',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.procoders.astro-ai-chat')

  // Set dock icon and custom app menu on macOS
  if (process.platform === 'darwin') {
    const pngPath = join(__dirname, '../../resources/icon.png')
    if (app.dock) {
      app.dock.setIcon(nativeImage.createFromPath(pngPath))
    }

    const menu = Menu.buildFromTemplate([
      {
        label: app.getName(),
        submenu: [
          { label: `About ${app.getName()}`, click: () => showAboutWindow() },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ])
    Menu.setApplicationMenu(menu)
  }

  try {
    runMigrations()
  } catch (err) {
    dialog.showErrorBox('Database Error', `Failed to initialize database:\n${err}`)
    app.quit()
    return
  }

  registerIpcHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
