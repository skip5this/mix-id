/**
 * Shared tracklist export builders.
 *
 * These functions return export text only. CLI and Electron decide where that
 * text goes: filesystem, clipboard, save dialog, or something else.
 */

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function limitRows(rows, maxRows) {
  if (!Number.isFinite(maxRows) || maxRows <= 0) return rows;
  return rows.slice(0, maxRows);
}

export function normalizeTrackRow(row) {
  if (!row || typeof row !== 'object') return null;

  const normalized = {
    timestamp: String(row.timestamp || ''),
    artist: String(row.artist || ''),
    title: String(row.title || row.song || ''),
  };

  if ('album' in row) normalized.album = String(row.album || '');
  if ('year' in row) normalized.year = String(row.year || '');

  const positionSec = finiteNumber(row.position_sec ?? row.positionSec);
  if (positionSec !== null) normalized.position_sec = positionSec;

  return normalized;
}

export function normalizeTrackRows(rows, options = {}) {
  if (!Array.isArray(rows)) return [];
  return limitRows(rows, options.maxRows).map(normalizeTrackRow).filter(Boolean);
}

export function buildMarkdownExport(rows, meta = {}) {
  const lines = normalizeTrackRows(rows, meta)
    .filter(row => row.timestamp || row.artist || row.title)
    .map(row => `${row.timestamp} - ${row.artist} - ${row.title}`.trim());

  return ['# Tracklist', '', ...lines].join('\n').trimEnd() + '\n';
}

export function buildTxtExport(rows, meta = {}) {
  return normalizeTrackRows(rows, meta)
    .filter(row => row.timestamp || row.artist || row.title)
    .map(row => `${row.artist} - ${row.title} ${row.timestamp}`.trim())
    .join('\n') + '\n';
}

export function buildJsonExport(rows, meta = {}) {
  const { maxRows, ...jsonMeta } = meta;
  return JSON.stringify({ ...jsonMeta, tracks: normalizeTrackRows(rows, { maxRows }) }, null, 2);
}

function cueText(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
}

function baseName(value, ext = '') {
  const name = String(value || '').split(/[\\/]/).pop() || '';
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
}

function cueIndexTime(positionSec) {
  const totalFrames = Math.max(0, Math.floor((Number(positionSec) || 0) * 75));
  const minutes = Math.floor(totalFrames / (60 * 75));
  const seconds = Math.floor((totalFrames % (60 * 75)) / 75);
  const frames = totalFrames % 75;

  return [
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
    String(frames).padStart(2, '0'),
  ].join(':');
}

function positionFromTimestamp(timestamp) {
  const parts = String(timestamp || '').split(':').map(part => Number(part));
  if (parts.some(part => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return null;
}

export function buildCueExport(rows, meta = {}) {
  const audioFilename = meta.audioFilename || meta.source || 'tracklist.mp3';
  const titleSource = meta.title || (
    meta.outPath
      ? baseName(meta.outPath, '.cue')
      : baseName(audioFilename).replace(/\.[^.]+$/, '')
  );
  const title = cueText(String(titleSource).replace(/[-_]/g, ' '));
  let cue = `REM GENRE DJ Mix\nTITLE "${title}"\nFILE "${cueText(audioFilename)}" MP3\n`;

  normalizeTrackRows(rows, meta).forEach((track, index) => {
    const positionSec = finiteNumber(track.position_sec) ?? positionFromTimestamp(track.timestamp);
    const num = String(index + 1).padStart(2, '0');
    cue += `  TRACK ${num} AUDIO\n`;
    cue += `    TITLE "${cueText(track.title)}"\n`;
    cue += `    PERFORMER "${cueText(track.artist)}"\n`;
    cue += `    INDEX 01 ${cueIndexTime(positionSec)}\n`;
  });

  return cue;
}

export function buildTracklistExport(format, rows, meta = {}) {
  if (format === 'markdown' || format === 'md') return buildMarkdownExport(rows, meta);
  if (format === 'txt' || format === 'text') return buildTxtExport(rows, meta);
  if (format === 'json') return buildJsonExport(rows, meta);
  if (format === 'cue') return buildCueExport(rows, meta);
  throw new TypeError('Unsupported export format.');
}

export const markdownTracklist = buildMarkdownExport;
export const txtTracklist = buildTxtExport;
export const jsonTracklist = buildJsonExport;
export const cueTracklist = buildCueExport;
export const buildExport = buildTracklistExport;
