/**
 * Core scanner — splits audio into segments and identifies tracks.
 */

import { mkdtempSync, readFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { getDuration, extractSegment } from './audio.mjs';
import { recognize } from './recognize.mjs';
import { formatTime } from './format.mjs';

const RATE_LIMIT_MS = 3000; // Be polite to Shazam
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Scan an audio file and identify tracks.
 *
 * @param {string} file       - Path to audio file
 * @param {object} opts
 * @param {number} opts.step     - Seconds between scan points (default: 30)
 * @param {number} opts.segment  - Seconds per sample (default: 18)
 * @param {number} opts.start    - Start position in seconds (default: 0)
 * @param {boolean} opts.quiet   - Suppress progress output
 * @returns {Promise<{ tracks: Array, duration: number, segmentsScanned: number }>}
 */
export async function scan(file, opts = {}) {
  const step = opts.step ?? 30;
  const segment = opts.segment ?? 18;
  const start = opts.start ?? 0;
  const quiet = opts.quiet ?? false;

  const duration = getDuration(file);
  const totalSegs = Math.floor((duration - segment) / step) + 1;
  const tmpDir = mkdtempSync(join(tmpdir(), 'mix-id-'));

  const log = quiet ? () => {} : (msg) => process.stdout.write(msg);

  if (!quiet) {
    console.log(`\n🎵 mix-id`);
    console.log('─'.repeat(50));
    console.log(`File:     ${basename(file)}`);
    console.log(`Duration: ${formatTime(duration)}`);
    console.log(`Settings: ${step}s step, ${segment}s sample`);
    console.log('─'.repeat(50) + '\n');
  }

  const tracks = [];
  let lastTrack = null;
  let segNum = 0;

  for (let pos = start; pos + segment <= duration; pos += step) {
    segNum++;
    const ts = formatTime(pos);
    const pct = Math.round((segNum / totalSegs) * 100);
    log(`[${ts}] ${pct}% `);

    const segPath = join(tmpDir, `seg.raw`);

    if (!extractSegment(file, pos, segment, segPath)) {
      log('⚠️  skip\n');
      continue;
    }

    try {
      const pcm = readFileSync(segPath);
      const match = await recognize(pcm);

      if (match) {
        const same = lastTrack
          && lastTrack.title === match.title
          && lastTrack.artist === match.artist;

        if (same) {
          log(`↩️  ${match.artist} — ${match.title}\n`);
        } else {
          log(`✅ ${match.artist} — ${match.title}\n`);
          tracks.push({ timestamp: ts, position_sec: pos, ...match });
          lastTrack = match;
        }
      } else {
        log('❓\n');
        lastTrack = null;
      }
    } catch (err) {
      log(`⚠️  ${err.message}\n`);
      lastTrack = null;
    }

    try { unlinkSync(segPath); } catch {}
    await sleep(RATE_LIMIT_MS);
  }

  return { tracks, duration, segmentsScanned: segNum };
}
