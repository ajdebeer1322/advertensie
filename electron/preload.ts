import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // File system
  pickFolder: (title?: string) => ipcRenderer.invoke('fs:pickFolder', title),
  pickFile: (filters?: { name: string; extensions: string[] }[], title?: string) =>
    ipcRenderer.invoke('fs:pickFile', filters, title),
  listImages: (folder: string) => ipcRenderer.invoke('fs:listImages', folder),
  readFileAsDataUrl: (filePath: string) => ipcRenderer.invoke('fs:readFileAsDataUrl', filePath),
  openPath: (p: string) => ipcRenderer.invoke('fs:openPath', p),

  // Fonts
  listSystemFonts: () => ipcRenderer.invoke('fonts:listSystem'),
  listFolderFonts: (folder: string) => ipcRenderer.invoke('fonts:listFolder', folder),
  loadFontFile: (filePath: string) => ipcRenderer.invoke('fonts:loadFile', filePath),

  // Sheets
  fetchSheet: (sheetUrl: string, worksheet: string) =>
    ipcRenderer.invoke('sheets:fetch', sheetUrl, worksheet),

  // Render
  renderPreview: (payload: unknown) => ipcRenderer.invoke('render:preview', payload),
  renderBatch: (payload: unknown) => ipcRenderer.invoke('render:batch', payload),

  // Progress
  onBatchProgress: (cb: (msg: any) => void) => {
    const listener = (_: unknown, msg: any) => cb(msg);
    ipcRenderer.on('render:batchProgress', listener);
    return () => ipcRenderer.removeListener('render:batchProgress', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;
