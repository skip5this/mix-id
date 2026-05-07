import { contextBridge, ipcRenderer, webUtils } from 'electron';

function cleanNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanAnalysisOptions(options = {}) {
  return {
    filePath: typeof options.filePath === 'string' ? options.filePath : '',
    step: cleanNumber(options.step, null),
    segment: cleanNumber(options.segment, 18),
    start: cleanNumber(options.start, 0),
  };
}

function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => ({
    timestamp: String(row?.timestamp || ''),
    artist: String(row?.artist || ''),
    title: String(row?.title || ''),
    album: String(row?.album || ''),
    year: String(row?.year || ''),
  }));
}

function on(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  selectAudioFile: () => ipcRenderer.invoke('dialog:select-audio-file'),
  getDroppedFilePath: file => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  startAnalysis: options => ipcRenderer.invoke('analysis:start', cleanAnalysisOptions(options)),
  cancelAnalysis: jobId => ipcRenderer.invoke('analysis:cancel', String(jobId || '')),
  copyMarkdownTracklist: rows => ipcRenderer.invoke('export:copy-markdown', cleanRows(rows)),
  saveExport: (format, rows) => ipcRenderer.invoke('export:save', {
    format: String(format || 'markdown'),
    rows: cleanRows(rows),
  }),
  onAnalysisProgress: callback => on('analysis:progress', callback),
  onSegmentResult: callback => on('analysis:segment-result', callback),
  onAnalysisWarning: callback => on('analysis:warning', callback),
  onAnalysisDone: callback => on('analysis:done', callback),
  onAnalysisError: callback => on('analysis:error', callback),
};

contextBridge.exposeInMainWorld('cuezy', Object.freeze(api));
