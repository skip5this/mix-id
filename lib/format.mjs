import { writeFileSync } from 'fs';
import { buildCueExport, buildJsonExport, buildTxtExport } from './export.mjs';

/** Write paste-friendly tracklist. */
export function writeTXT(tracks, outPath) {
  writeFileSync(outPath, buildTxtExport(tracks));
}

/** Write CUE sheet. */
export function writeCUE(tracks, outPath, audioFilename) {
  writeFileSync(outPath, buildCueExport(tracks, { audioFilename, outPath }));
}

/** Write JSON tracklist with metadata. */
export function writeJSON(tracks, outPath, meta = {}) {
  writeFileSync(outPath, buildJsonExport(tracks, meta));
}

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
