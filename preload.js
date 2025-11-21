const { contextBridge, shell, ipcRenderer } = require('electron');
const path = require('path');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    shell: shell,
    path: path,

    system: {
      runCommand: (cmd) => ipcRenderer.invoke('app:runCommand', cmd),
      scanInstalledApps: () => ipcRenderer.invoke('app:scanInstalledApps'),
      getActiveWindowInfo: () => ipcRenderer.invoke('system:getActiveWindowInfo'),
      listSerialPorts: () => ipcRenderer.invoke('system:listSerialPorts')
    },

    app: {
      getVersion: () => ipcRenderer.invoke('app:getVersion'),
      // --- GÜNCELLEME İÇİN YENİ EKLENENLER ---
      onUpdateAvailable: (callback) => ipcRenderer.on('update_available', () => callback()),
      onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', () => callback()),
      restartAndInstall: () => ipcRenderer.send('app:restartAndInstall'),
      
      // Flasher Operations
      getFirmwareList: () => ipcRenderer.invoke('app:getFirmwareList'),
      flashFirmware: (port, model) => ipcRenderer.send('app:flashFirmware', port, model),
      onFlashLog: (callback) => ipcRenderer.on('flash-log', (event, text) => callback(text)),
      onFlashComplete: (callback) => ipcRenderer.on('flash-complete', (event, success) => callback(success)),
      removeAllFlashListeners: () => {
        ipcRenderer.removeAllListeners('flash-log');
        ipcRenderer.removeAllListeners('flash-complete');
      },

      // Other App Operations
      openPluginsFolder: () => ipcRenderer.invoke('app:openPluginsFolder'),
      getStartupStatus: () => ipcRenderer.invoke('app:getStartupStatus'),
      setStartupStatus: (flag) => ipcRenderer.invoke('app:setStartupStatus', flag),
      getAssetsPath: () => ipcRenderer.invoke('app:getAssetPath'),
      saveTempIcon: (base64) => ipcRenderer.invoke('app:saveTempIcon', base64),
      onCloseRequest: (callback) => ipcRenderer.on('app:request-close-action', (event, ...args) => callback(...args)),
      scanPlugins: () => ipcRenderer.invoke('app:scanPlugins'),
      sendCloseResponse: (data) => ipcRenderer.send('app:response-close-action', data)
    },

    robot: {
      // Keyboard
      keyTap: (key, modifiers) => ipcRenderer.invoke('robot:keyTap', key, modifiers),
      typeString: (text) => ipcRenderer.invoke('robot:typeString', text),
      typeStringSimulated: (text) => ipcRenderer.invoke('robot:typeStringSimulated', text),

      // Mouse
      getMousePos: () => ipcRenderer.invoke('robot:getMousePos'),
      mouseMove: (x, y) => ipcRenderer.invoke('robot:mouseMove', x, y),
      mouseClick: (button, double) => ipcRenderer.invoke('robot:mouseClick', button, double),
      mouseToggle: (down, button) => ipcRenderer.invoke('robot:mouseToggle', down, button),

      // Screen Capture
      enterCaptureMode: () => ipcRenderer.invoke('robot:enterCaptureMode'),
      exitCaptureMode: () => ipcRenderer.invoke('robot:exitCaptureMode')
    },

    showNotification: (title, body) => ipcRenderer.invoke('app:showNotification', title, body)
  });

  console.log('Preload script loaded successfully!');

} catch (error) {
  console.error('Error in preload script:', error);
}