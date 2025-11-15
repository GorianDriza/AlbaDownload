const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: payload => ipcRenderer.invoke('update-settings', payload),
  chooseDownloadFolder: () => ipcRenderer.invoke('choose-download-folder'),
  startDownload: payload => ipcRenderer.invoke('start-download', payload),
  cancelDownload: payload => ipcRenderer.invoke('cancel-download', payload),
  openDownloadLocation: payload => ipcRenderer.invoke('open-download-location', payload),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: payload => ipcRenderer.invoke('download-update', payload),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  writeClipboardText: text => ipcRenderer.invoke('write-clipboard-text', text),
  onDownloadProgress: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', listener);
    return () => {
      ipcRenderer.removeListener('download-progress', listener);
    };
  },
  onSettingsUpdated: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('settings-updated', listener);
    return () => {
      ipcRenderer.removeListener('settings-updated', listener);
    };
  }
});
