// ============================================================================
// MAIN PROCESS - Electron Main Entry Point
// ============================================================================
// This file handles the main Electron process, including:
// - Window management and lifecycle
// - IPC communication with renderer process
// - System integrations (RobotJS, serial ports, notifications)
// - Tray icon and menu
// ============================================================================
const { autoUpdater } = require('electron-updater');
const { exec } = require('child_process');
const { app, BrowserWindow, session, Tray, Menu, ipcMain, clipboard, Notification, screen, shell } = require('electron/main');
const path = require('node:path');
const robot = require('robotjs');
const { productName } = require('./package.json');
const fs = require('fs');
const { spawn } = require('child_process');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the correct path to assets folder
 * In development: uses local 'assets' folder
 * In production: uses 'resources/assets' folder
 */
function getAssetPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets');
  }
  return path.join(__dirname, 'assets');
}


// Get Windows startup status (run on login)
ipcMain.handle('app:getStartupStatus', () => {
  return app.getLoginItemSettings().openAtLogin;
});

// Set Windows startup status
ipcMain.handle('app:setStartupStatus', (event, shouldOpen) => {
  const success = app.setLoginItemSettings({
    openAtLogin: shouldOpen,
    openAsHidden: true
  });
  return { success: true };
});

// Get assets path for renderer process
ipcMain.handle('app:getAssetPath', () => {
  return getAssetPath();
});

// ============================================================================
// WINDOW CREATION & MANAGEMENT
// ============================================================================


const iconPath = path.join(__dirname, 'icon.ico');

let mainWindow;
let tray = null;
let isQuitting = false;
let originalBounds = null;

/**
 * Create the main application window
 * Handles window events: minimize, close
 */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1250,
    height: 1200,
    icon: iconPath,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  // --- GÜNCELLEME OLAYLARI ---

  // Güncelleme var, indirme başladı
  autoUpdater.on('update-available', () => {
    if (mainWindow) mainWindow.webContents.send('update_available');
  });

  // İndirme bitti
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update_downloaded');
  });

  // Kullanıcı butona basınca çalışacak komut
  ipcMain.on('app:restartAndInstall', () => {
    autoUpdater.quitAndInstall();
  });

  //  mainWindow.webContents.openDevTools();

  mainWindow.show();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.setMenu(null);

  // Hide window to tray instead of minimizing
  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  // Handle window close event with user confirmation
  mainWindow.on('close', async (event) => {
    if (isQuitting) return;

    event.preventDefault();

    let defaultAction = 'showConfirm';
    try {
      defaultAction = await mainWindow.webContents.executeJavaScript(`window.getCloseAction()`);
    } catch (e) {
      console.error("Error getting settings from renderer:", e);
    }

    if (defaultAction === 'minimize') {
      mainWindow.hide();
      return;
    }
    if (defaultAction === 'exit') {
      isQuitting = true;
      app.quit();
      return;
    }

    try {
      const message = "Are you sure you want to exit the application completely? If you exit, the device connection will be severed.";

      const result = await mainWindow.webContents.executeJavaScript(`
            new Promise(resolve => {
                // showCustomConfirm fonksiyonu yoksa standart confirm kullan
                if (typeof showCustomConfirm !== 'function') {
                    const c = confirm("${message}");
                    resolve({ choice: c, remember: false });
                    return;
                }

                const confirmed = showCustomConfirm(
                    \`\${"${message}"}\n\n<label style="display: flex; align-items: center; gap: 8px; margin-top: 15px; font-size: 13px; color: var(--text); cursor: pointer;"><input type="checkbox" id="rememberChoice" style="width: 16px; height: 16px; accent-color: var(--accent);"> Remember my choice</label>\`,
                    "Confirm Exit",
                    "Exit App",
                    "Minimize to Tray" 
                );

                confirmed.then(userChoice => {
                    const remember = document.getElementById('rememberChoice')?.checked || false;
                    resolve({ choice: userChoice, remember: remember });
                });
            })
        `);

      if (result.choice) {
        if (result.remember) {
          await mainWindow.webContents.executeJavaScript(`window.setCloseAction('exit')`);
        }
        isQuitting = true;
        app.quit();
      } else {
        if (result.remember) {
          await mainWindow.webContents.executeJavaScript(`window.setCloseAction('minimize')`);
        }
        mainWindow.hide();
      }
    } catch (e) {
      console.error("Error showing confirm dialog:", e);
      mainWindow.hide();
    }
  });
}

// ============================================================================
// APP INITIALIZATION
// ============================================================================

app.whenReady().then(() => {
  // Versiyon bilgisini gönder

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  // Get list of available firmware boards
  ipcMain.handle('app:getFirmwareList', async () => {
    const boardsPath = path.join(getAssetPath(), 'firmware', 'boards.json');

    if (!fs.existsSync(boardsPath)) {
      console.warn("boards.json not found at:", boardsPath);
      return [];
    }

    try {
      const rawData = fs.readFileSync(boardsPath, 'utf-8');
      const boards = JSON.parse(rawData);
      return boards;
    } catch (e) {
      console.error("Error reading boards.json:", e);
      return [];
    }
  });
  // Open plugins folder in file explorer
  ipcMain.handle('app:openPluginsFolder', () => {
    const pluginsDir = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      try {
        fs.mkdirSync(pluginsDir);
      } catch (e) {
        console.error("Could not create plugins dir:", e);
        return { success: false, error: e.message };
      }
    }

    shell.openPath(pluginsDir);
    return { success: true, path: pluginsDir };
  });
  // Execute system commands (for button actions)
  ipcMain.handle('app:runCommand', async (event, command) => {
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.warn(`Command error: ${error.message}`);

          if (error.code === 'ENOENT') {
            return resolve({ success: false, error: error.message });
          }
          return resolve({
            success: true,
            stdout,
            stderr,
            warning: error.message
          });
        }

        resolve({ success: true, stdout, stderr });
      });
    });
  });

  ipcMain.handle('app:saveTempIcon', async (event, base64Data) => {
    try {
      const data = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(data, 'base64');

      const tempPath = app.getPath('temp');
      const fileName = `smartdeck_icon_${Date.now()}.png`;
      const fullPath = path.join(tempPath, fileName);

      fs.writeFileSync(fullPath, buffer);

      return { success: true, path: fullPath };
    } catch (e) {
      console.error("Save temp icon error:", e);
      return { success: false, error: e.message };
    }
  });
  // Scan installed Windows applications via PowerShell
  ipcMain.handle('app:scanInstalledApps', async () => {
    const psCommand = "$ErrorActionPreference='SilentlyContinue';$W=New-Object -ComObject WScript.Shell;Get-ChildItem -Path([Environment]::GetFolderPath('CommonStartMenu')),([Environment]::GetFolderPath('StartMenu')) -Recurse -Include *.lnk|ForEach-Object{$t=$W.CreateShortcut($_).TargetPath;if($t.EndsWith('.exe')){[PSCustomObject]@{N=$_.BaseName;P=$t}}}|Sort-Object -Property N -Unique|ConvertTo-Json -Compress";

    return new Promise((resolve) => {
      exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '\\"')}"`,
        { maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          if (error) {
            console.error("App Scan Error:", error);
            resolve([]);
          } else {
            try {
              const apps = JSON.parse(stdout || '[]');
              resolve(Array.isArray(apps) ? apps : [apps]);
            } catch (e) {
              resolve([]);
            }
          }
        });
    });
  });
  // Scan installed plugins
  ipcMain.handle('app:scanPlugins', async () => {


    ipcMain.handle('system:listSerialPorts', async () => {
      return new Promise((resolve) => {
        const cmd = 'powershell "[System.IO.Ports.SerialPort]::GetPortNames()"';
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            console.error("Port list error:", error);
            resolve([]);
            return;
          }
          const ports = stdout.trim().split(/\r?\n/).map(p => p.trim()).filter(p => p && p.startsWith('COM'));
          const uniquePorts = [...new Set(ports)].sort();
          resolve(uniquePorts);
        });
      });
    });
    // Flash firmware to ESP32 device
    ipcMain.on('app:flashFirmware', (event, port, modelFolder) => {
      const esptoolPath = path.join(getAssetPath(), 'tools', 'esptool.exe');
      const firmwareDir = path.join(getAssetPath(), 'firmware', modelFolder);
      const boardsPath = path.join(getAssetPath(), 'firmware', 'boards.json');
      // Default flash parameters for ESP32-S3
      let targetChip = 'esp32s3';
      let flashMode = 'dio';
      let flashFreq = '80m';
      let bootloaderAddr = '0x0';

      try {
        if (fs.existsSync(boardsPath)) {
          const boardsData = JSON.parse(fs.readFileSync(boardsPath, 'utf-8'));
          const selectedBoard = boardsData.find(b => b.folder === modelFolder);

          if (selectedBoard) {
            if (selectedBoard.chip) targetChip = selectedBoard.chip;
            if (selectedBoard.flash_mode) flashMode = selectedBoard.flash_mode;
            // flash_freq json'da yoksa varsayılan 80m kalsın, varsa onu al
            if (selectedBoard.flash_freq) flashFreq = selectedBoard.flash_freq;
            if (selectedBoard.boot_addr) bootloaderAddr = selectedBoard.boot_addr;
          }
        }
      } catch (e) {
        console.error("Error reading boards.json parameters:", e);
      }

      console.log(`Flashing ${modelFolder} -> Chip: ${targetChip}, Mode: ${flashMode}, BootAddr: ${bootloaderAddr}`);

      const bootloaderPath = path.join(firmwareDir, 'bootloader.bin');
      const partitionsPath = path.join(firmwareDir, 'partitions.bin');
      const bootAppPath = path.join(firmwareDir, 'boot_app0.bin');
      const firmwarePath = path.join(firmwareDir, 'firmware.bin');

      if (!fs.existsSync(bootloaderPath) || !fs.existsSync(firmwarePath)) {
        event.reply('flash-log', `Error: Firmware files not found for model ${modelFolder}\n`);
        event.reply('flash-complete', false);
        return;
      }

      const args = [
        '--chip', targetChip,
        '--port', port,
        '--baud', '460800',
        '--before', 'default_reset',
        '--after', 'hard_reset',
        'write_flash',
        '-z',
        '--flash_mode', flashMode,
        '--flash_freq', flashFreq,
        '--flash_size', 'detect',
        bootloaderAddr, bootloaderPath,
        '0x8000', partitionsPath,
        '0xe000', bootAppPath,
        '0x10000', firmwarePath
      ];

      event.reply('flash-log', `Starting flash for ${modelFolder} (${targetChip}) on ${port}...\n`);
      event.reply('flash-log', `Params: Mode=${flashMode}, BootAddr=${bootloaderAddr}\n`);
      event.reply('flash-log', `Command: esptool.exe ${args.join(' ')}\n\n`);

      const flasher = spawn(esptoolPath, args);

      flasher.stdout.on('data', (data) => {
        event.reply('flash-log', data.toString());
      });

      flasher.stderr.on('data', (data) => {
        event.reply('flash-log', data.toString());
      });

      flasher.on('close', (code) => {
        if (code === 0) {
          event.reply('flash-log', '\nFlash Complete Successfully!\n');
          event.reply('flash-complete', true);
        } else {
          event.reply('flash-log', `\nProcess exited with code ${code}\n`);
          event.reply('flash-complete', false);
        }
      });

      flasher.on('error', (err) => {
        event.reply('flash-log', `\nFailed to start esptool: ${err.message}\n`);
        event.reply('flash-complete', false);
      });
    });


    const pluginsDir = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'plugins');

    if (!fs.existsSync(pluginsDir)) {
      try { fs.mkdirSync(pluginsDir); } catch (e) { }
      return [];
    }

    try {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      const plugins = [];

      for (const entry of entries) {
        let fullPath = null;
        let basePath = null;

        if (entry.isDirectory()) {
          const p1 = path.join(pluginsDir, entry.name, 'plugin.json');
          const p2 = path.join(pluginsDir, entry.name, 'manifest.json');

          if (fs.existsSync(p1)) fullPath = p1;
          else if (fs.existsSync(p2)) fullPath = p2;

          if (fullPath) {
            basePath = path.join(pluginsDir, entry.name);
          }
        }
        else if (entry.isFile() && entry.name.endsWith('.json')) {
          fullPath = path.join(pluginsDir, entry.name);
          basePath = pluginsDir;
        }

        if (fullPath && basePath) {
          try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const data = JSON.parse(raw);

            if (data.buttons && Array.isArray(data.buttons)) {
              data._basePath = basePath;

              const jsPath = path.join(basePath, 'plugin.js');
              if (fs.existsSync(jsPath)) {
                data._jsPath = `file:///${jsPath.replace(/\\/g, '/')}?v=${Date.now()}`;
                console.log(`Dinamik eklenti bulundu: ${data.meta.name}`);
              }

              plugins.push(data);
            }
          } catch (err) {
            console.error(`Plugin load error (${entry.name}):`, err);
          }
        }
      }
      return plugins;
    } catch (e) {
      console.error("Plugin scan error:", e);
      return [];
    }
  });

  ipcMain.handle('system:getActiveWindowInfo', () => {
    try {
      const activeWindow = robot.getActiveWindow();
      const title = activeWindow.getTitle();
      const process = activeWindow.getProcess();

      return { success: true, title: title, process: process.name };
    } catch (e) {
      return { success: false, title: "", error: e.message };
    }
  });


  if (process.platform === 'win32') {
    app.setAppUserModelId("Smart Deck Notification");
  }


  ipcMain.handle('robot:keyTap', (event, key, modifiers) => {
    try {
      if (typeof key !== 'string' || key.length === 0) return { success: true };
      robot.setKeyboardDelay(1);
      if (modifiers && modifiers.length > 0) {
        robot.keyTap(key, modifiers);
      } else {
        robot.keyTap(key);
      }
      return { success: true };
    } catch (e) {
      console.error("RobotJS keyTap error:", e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('robot:typeStringSimulated', async (event, text) => {
    try {
      if (typeof text !== 'string' || text.length === 0) {
        return { success: true };
      }

      const oldClipboard = clipboard.readText();
      const lines = text.split('\n');

      for (const line of lines) {
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          clipboard.writeText(char);
          robot.keyTap('v', 'control');
          await new Promise(resolve => setTimeout(resolve, 5));
        }

        if (lines.indexOf(line) < lines.length - 1) {
          robot.setKeyboardDelay(50);
          robot.keyTap('enter');
          robot.setKeyboardDelay(1);
        }
      }

      setTimeout(() => {
        clipboard.writeText(oldClipboard);
      }, 100);

      return { success: true };
    } catch (e) {
      console.error("RobotJS typeStringSimulated error:", e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('robot:typeString', (event, text) => {
    try {
      if (typeof text !== 'string' || text.length === 0) {
        return { success: true };
      }
      robot.setKeyboardDelay(1);
      const oldClipboard = clipboard.readText();
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (line.length > 0) {
          clipboard.writeText(line);
          robot.keyTap('v', 'control');
        }
        if (index < lines.length - 1) {
          robot.keyTap('enter');
        }
      });
      setTimeout(() => {
        clipboard.writeText(oldClipboard);
      }, 100);
      return { success: true };
    } catch (e) {
      console.error("RobotJS typeString error:", e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('robot:getMousePos', () => {
    try {
      return { success: true, ...robot.getMousePos() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('robot:enterCaptureMode', () => {
    if (mainWindow) {
      originalBounds = mainWindow.getBounds();
      const displays = screen.getAllDisplays();
      let minX = 0, minY = 0, maxX = 0, maxY = 0;

      for (const display of displays) {
        const { x, y, width, height } = display.bounds;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + width > maxX) maxX = x + width;
        if (y + height > maxY) maxY = y + height;
      }

      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;

      mainWindow.setBounds({ x: minX, y: minY, width: totalWidth, height: totalHeight });
      mainWindow.setOpacity(0.01);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  ipcMain.handle('robot:exitCaptureMode', () => {
    if (mainWindow) {
      if (originalBounds) mainWindow.setBounds(originalBounds);
      mainWindow.setOpacity(1.0);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.focus();
      originalBounds = null;
    }
  });

  ipcMain.handle('robot:mouseMove', (event, x, y) => {
    try { robot.moveMouse(x, y); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('robot:mouseClick', (event, button, double) => {
    try { robot.mouseClick(button || 'left', double || false); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('robot:mouseToggle', (event, down, button) => {
    try { robot.mouseToggle(down || 'down', button || 'left'); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('app:showNotification', (event, title, body) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title: title, body: body, icon: iconPath, silent: true });
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notification.show();
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      return { success: true };
    }
    return { success: false, error: 'Notifications not supported' };
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') {
      return true;
    }
    return false;
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' data: blob: https://api.iconify.design; img-src 'self' data: blob: file: https://api.iconify.design; style-src 'self' 'unsafe-inline'; script-src 'self'; media-src 'self' file: data: blob:"
        ]
      }
    });
  });

  createWindow();

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        mainWindow.show();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setToolTip('Smart Deck');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
  // Uygulama açıldıktan 3 saniye sonra güncelleme kontrolü yap
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});