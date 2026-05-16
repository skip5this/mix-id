import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { analyzeAudio, normalizeAnalysisRequest } from '../../lib/analyze-audio.mjs';
import { hasCommand } from '../../lib/audio.mjs';
import { buildExport, markdownTracklist } from '../shared/tracklist-export.js';
import { bundledAudioTools } from './tool-paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'webm',
  'mka',
  'mp4',
  'mov',
  'mkv',
];

let mainWindow;
let activeJob = null;

app.setName('Cuezy');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 660,
    title: 'Cuezy',
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#f7f3eb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && url !== currentUrl) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function ensureTrustedSender(event) {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Untrusted IPC sender');
  }
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
  };
}

function serializeSegment(segment) {
  if (!segment || typeof segment !== 'object') return segment;
  return {
    ...segment,
    error: segment.error ? serializeError(segment.error) : undefined,
  };
}

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

async function validateAnalysisInput(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Analysis options are required.');
  }

  if (typeof input.filePath !== 'string' || input.filePath.trim() === '') {
    throw new TypeError('Select an audio file first.');
  }

  const request = await normalizeAnalysisRequest(input.filePath, {
    step: input.step === null || input.step === undefined ? null : Number(input.step),
    segment: input.segment === undefined ? 18 : Number(input.segment),
    start: input.start === undefined ? 0 : Number(input.start),
  }, {
    allowUrls: false,
    requireLocalFile: true,
    localOnlyMessage: 'The desktop MVP supports local files only.',
  });

  return { filePath: request.input, options: request.options };
}

function defaultExportName(format) {
  if (format === 'json') return 'cuezy-tracklist.json';
  if (format === 'txt') return 'cuezy-tracklist.txt';
  return 'cuezy-tracklist.md';
}

function fileFilters(format) {
  if (format === 'json') return [{ name: 'JSON', extensions: ['json'] }];
  if (format === 'txt') return [{ name: 'Text', extensions: ['txt'] }];
  return [{ name: 'Markdown', extensions: ['md', 'markdown'] }];
}

function audioTools() {
  const bundled = bundledAudioTools();
  if (bundled.available) return bundled;

  if (app.isPackaged) {
    return {
      available: false,
      ffmpegCommand: null,
      ffprobeCommand: null,
      source: 'missing',
      binDir: bundled.binDir,
    };
  }

  const ffmpegAvailable = hasCommand('ffmpeg');
  const ffprobeAvailable = hasCommand('ffprobe');
  return {
    available: ffmpegAvailable && ffprobeAvailable,
    ffmpegCommand: 'ffmpeg',
    ffprobeCommand: 'ffprobe',
    source: 'system',
    binDir: bundled.binDir,
  };
}

ipcMain.handle('app:get-info', event => {
  ensureTrustedSender(event);
  const tools = audioTools();
  return {
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    ffmpegAvailable: tools.available,
    audioToolsSource: tools.available ? tools.source : 'missing',
  };
});

ipcMain.handle('dialog:select-audio-file', async event => {
  ensureTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select audio or video file',
    properties: ['openFile'],
    filters: [
      { name: 'Audio and video', extensions: AUDIO_EXTENSIONS },
      { name: 'All files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: null };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('analysis:start', async (event, input) => {
  ensureTrustedSender(event);
  if (activeJob) {
    throw new Error('An analysis job is already running.');
  }

  const tools = audioTools();
  if (!tools.available) {
    throw new Error(app.isPackaged
      ? 'Cuezy could not find its bundled audio tools. Reinstall Cuezy and try again.'
      : 'ffmpeg and ffprobe are required. Install ffmpeg or add bundled tools under resources/bin and try again.');
  }

  const { filePath, options } = await validateAnalysisInput(input);
  const jobId = `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const controller = new AbortController();
  activeJob = { id: jobId, controller };

  queueMicrotask(async () => {
    try {
      const result = await analyzeAudio(filePath, {
        ...options,
        signal: controller.signal,
        ffmpegCommand: tools.ffmpegCommand,
        ffprobeCommand: tools.ffprobeCommand,
      }, {
        onProgress(progress) {
          send('analysis:progress', { jobId, progress });
        },
        onSegmentResult(segment) {
          send('analysis:segment-result', { jobId, segment: serializeSegment(segment) });
        },
        onWarning(warning) {
          send('analysis:warning', {
            jobId,
            warning: {
              message: warning.message,
              retryAfterMs: warning.retryAfterMs,
              attempt: warning.attempt,
            },
          });
        },
      });

      send('analysis:done', { jobId, result });
    } catch (error) {
      send('analysis:error', { jobId, error: serializeError(error) });
    } finally {
      if (activeJob?.id === jobId) activeJob = null;
    }
  });

  return { jobId };
});

ipcMain.handle('analysis:cancel', (event, jobId) => {
  ensureTrustedSender(event);
  if (!activeJob || activeJob.id !== jobId) {
    return { canceled: false };
  }

  activeJob.controller.abort('Analysis cancelled');
  return { canceled: true };
});

ipcMain.handle('export:copy-markdown', (event, rows) => {
  ensureTrustedSender(event);
  const text = markdownTracklist(rows);
  clipboard.writeText(text);
  return { copied: true, text };
});

ipcMain.handle('export:save', async (event, input) => {
  ensureTrustedSender(event);
  if (!input || typeof input !== 'object') {
    throw new TypeError('Export request is required.');
  }

  const format = String(input.format || 'markdown');
  const text = buildExport(format, input.rows);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save tracklist',
    defaultPath: defaultExportName(format),
    filters: fileFilters(format),
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null };
  }

  const { writeFile } = await import('fs/promises');
  await writeFile(result.filePath, text, 'utf8');
  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  activeJob?.controller.abort('Application is quitting');
  activeJob = null;
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// TODO: Add a later Electron hardening pass with Electron fuses.
