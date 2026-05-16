import { accessSync, constants } from 'fs';
import { join } from 'path';
import { app } from 'electron';

const EXECUTABLE_NAMES = process.platform === 'win32'
  ? { ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' }
  : { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };

function bundledBinDir() {
  const target = `${process.platform}-${process.arch}`;
  const base = app.isPackaged
    ? process.resourcesPath
    : app.getAppPath();
  return app.isPackaged
    ? join(base, 'bin', target)
    : join(base, 'resources', 'bin', target);
}

export function bundledAudioTools() {
  const dir = bundledBinDir();
  const ffmpeg = join(dir, EXECUTABLE_NAMES.ffmpeg);
  const ffprobe = join(dir, EXECUTABLE_NAMES.ffprobe);

  const accessMode = process.platform === 'win32' ? constants.F_OK : constants.X_OK;
  try {
    accessSync(ffmpeg, accessMode);
    accessSync(ffprobe, accessMode);
  } catch {
    return {
      available: false,
      ffmpegCommand: null,
      ffprobeCommand: null,
      source: 'system',
      binDir: dir,
    };
  }

  return {
    available: true,
    ffmpegCommand: ffmpeg,
    ffprobeCommand: ffprobe,
    source: 'bundled',
    binDir: dir,
  };
}
