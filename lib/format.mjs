/**
 * Output formatting — TXT, CUE, and JSON.
 */

import { writeFileSync } from 'fs';
import { basename } from 'path';

/** Format seconds as H:MM:SS or MM:SS. */
export function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Remove consecutive duplicate tracks (handles transition bouncing). */
export function dedupe(tracks) {
  const result = [];
  for (const t of tracks) {
    const prev = result[result.length - 1];
    if (prev && prev.title === t.title && prev.artist === t.artist) continue;
    result.push(t);
  }
  return result;
}

/** Write paste-friendly tracklist. */
export function writeTXT(tracks, outPath) {
  const lines = tracks.map(t => `${t.artist} - ${t.title} ${t.timestamp}`);
  writeFileSync(outPath, lines.join('\n') + '\n');
}

/** Write CUE sheet. */
export function writeCUE(tracks, outPath, audioFilename) {
  const title = basename(outPath, '.cue').replace(/[-_]/g, ' ');
  let cue = `REM GENRE DJ Mix\nTITLE "${title}"\nFILE "${audioFilename}" MP3\n`;

  tracks.forEach((t, i) => {
    const num = String(i + 1).padStart(2, '0');
    const mm = String(Math.floor(t.position_sec / 60)).padStart(2, '0');
    const ss = String(t.position_sec % 60).padStart(2, '0');
    cue += `  TRACK ${num} AUDIO\n`;
    cue += `    TITLE "${t.title}"\n`;
    cue += `    PERFORMER "${t.artist}"\n`;
    cue += `    INDEX 01 ${mm}:${ss}:00\n`;
  });

  writeFileSync(outPath, cue);
}

/** Write JSON tracklist with metadata. */
export function writeJSON(tracks, outPath, meta = {}) {
  writeFileSync(outPath, JSON.stringify({ ...meta, tracks }, null, 2));
}
