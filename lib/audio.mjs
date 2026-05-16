/**
 * Audio utilities — download, probe, and extract segments.
 */

import { execFile, spawn } from 'child_process';
import { accessSync, constants, existsSync, statSync } from 'fs';
import { delimiter, join } from 'path';
import { promisify } from 'util';

const WINDOWS_EXTENSIONS = ['.EXE', '.CMD', '.BAT', '.COM'];
const MACOS_COMMAND_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'];
const commandCache = new Map();
const execFileAsync = promisify(execFile);

function executableCandidates(cmd) {
  if (process.platform !== 'win32' || /\.[^\\/]+$/.test(cmd)) return [cmd];
  const pathext = process.env.PATHEXT
    ? process.env.PATHEXT.split(';').filter(Boolean)
    : WINDOWS_EXTENSIONS;
  return [cmd, ...pathext.map(ext => cmd + ext)];
}

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandSearchDirs() {
  const dirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  if (process.platform === 'darwin') {
    for (const dir of MACOS_COMMAND_DIRS) {
      if (!dirs.includes(dir)) dirs.push(dir);
    }
  }

  return dirs;
}

function resolveCommand(cmd) {
  if (!cmd || /[\\/]/.test(cmd)) {
    const match = executableCandidates(cmd).find(canExecute);
    return match || cmd;
  }

  if (commandCache.has(cmd)) return commandCache.get(cmd);

  for (const dir of commandSearchDirs()) {
    const match = executableCandidates(join(dir, cmd)).find(canExecute);
    if (match) {
      commandCache.set(cmd, match);
      return match;
    }
  }

  commandCache.set(cmd, cmd);
  return cmd;
}

/** Check if a command exists on PATH. */
export function hasCommand(cmd) {
  const resolved = resolveCommand(cmd);
  return resolved !== cmd || canExecute(resolved);
}

function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(cmd), args, {
      stdio: opts.stdio ?? ['ignore', 'ignore', 'ignore'],
      signal: opts.signal,
    });
    let settled = false;
    let timeout;

    function finish(err, result) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    }

    if (opts.timeout) {
      timeout = setTimeout(() => {
        const err = new Error(`Command timed out after ${opts.timeout}ms: ${cmd}`);
        err.name = 'TimeoutError';
        child.kill('SIGTERM');
        finish(err);
      }, opts.timeout);
    }

    child.on('error', err => finish(err));
    child.on('close', status => finish(null, { status }));
  });
}

/** Get audio duration in seconds via ffprobe. */
export async function getDuration(file, opts = {}) {
  const { stdout } = await execFileAsync(resolveCommand(opts.ffprobeCommand ?? 'ffprobe'), [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    file,
  ], { encoding: 'utf8', signal: opts.signal });
  const data = JSON.parse(stdout);
  const duration = parseFloat(data?.format?.duration);
  if (Number.isNaN(duration)) {
    throw new Error('Could not determine audio duration.');
  }
  return duration;
}

/** Extract a segment as raw s16le mono 16kHz PCM for Shazam. */
export async function extractSegment(file, startSec, durationSec, outPath, opts = {}) {
  const result = await runProcess(opts.ffmpegCommand ?? 'ffmpeg', [
    '-y',
    '-ss', String(startSec),
    '-t', String(durationSec),
    '-i', file,
    '-ac', '1',
    '-ar', '16000',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    outPath,
  ], { signal: opts.signal });

  return result.status === 0;
}

/** Download audio from a URL using yt-dlp. Returns path to downloaded file. */
export async function downloadURL(url, outputDir, opts = {}) {
  if (!hasCommand('yt-dlp')) {
    throw new Error('yt-dlp is required for URL downloads. Install: brew install yt-dlp');
  }

  const ytDlp = resolveCommand('yt-dlp');

  // Get title for filename
  let rawTitle = '';
  try {
    const info = await execFileAsync(ytDlp, ['--print', 'title', '--no-download', url], {
      timeout: 30_000,
      signal: opts.signal,
    });
    rawTitle = info.stdout.trim();
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  const title = rawTitle
    ? rawTitle.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80)
    : 'downloaded-mix';

  const outTemplate = join(outputDir, `${title}.%(ext)s`);

  const dl = await runProcess(ytDlp, [
    '-x', '--audio-format', 'mp3', '--audio-quality', '0',
    '-o', outTemplate, '--no-playlist', '--progress', '--newline', url,
  ], {
    timeout: 600_000,
    signal: opts.signal,
    stdio: opts.stdio ?? ['ignore', 'inherit', 'inherit'],
  });

  if (dl.status !== 0) throw new Error('Download failed. Check the URL and try again.');

  // Find the output file
  const mp3Path = join(outputDir, `${title}.mp3`);
  if (existsSync(mp3Path)) return mp3Path;

  for (const ext of ['webm', 'opus', 'm4a', 'ogg', 'wav']) {
    const alt = join(outputDir, `${title}.${ext}`);
    if (existsSync(alt)) return alt;
  }

  throw new Error('Download failed. Check the URL and try again.');
}

/** Format file size for display. */
export function fileSize(path) {
  return (statSync(path).size / 1024 / 1024).toFixed(1) + ' MB';
}
