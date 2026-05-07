/**
 * Core scanner — splits audio into segments and identifies tracks.
 */

import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { getDuration, extractSegment } from './audio.mjs';
import { recognize } from './recognize.mjs';
import { formatTime } from './format.mjs';

const RATE_LIMIT_MS = 3000; // Be polite to Shazam
const MAX_CONSECUTIVE_EXTRACTION_FAILURES = 3;

export class AbortError extends Error {
  constructor(message = 'Analysis cancelled') {
    super(message);
    this.name = 'AbortError';
  }
}

export class ExtractionFailureError extends Error {
  constructor(count) {
    super(`Segment extraction failed ${count} times in a row. Check the audio file and ffmpeg installation.`);
    this.name = 'ExtractionFailureError';
  }
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new AbortError(typeof signal.reason === 'string' ? signal.reason : undefined);
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (!signal) {
    setTimeout(resolve, ms);
    return;
  }

  try {
    throwIfAborted(signal);
  } catch (err) {
    reject(err);
    return;
  }

  const timeout = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  function onAbort() {
    clearTimeout(timeout);
    reject(signal.reason instanceof Error ? signal.reason : new AbortError());
  }

  signal.addEventListener('abort', onAbort, { once: true });
});

/**
 * Scan an audio file and identify tracks.
 *
 * @param {string} file       - Path to audio file
 * @param {object} opts
 * @param {number} opts.step     - Seconds between scan points (default: 30)
 * @param {number} opts.segment  - Seconds per sample (default: 18)
 * @param {number} opts.start    - Start position in seconds (default: 0)
 * @param {boolean} opts.quiet   - Suppress progress output
 * @param {AbortSignal} opts.signal - Cancel between segments and during waits
 * @param {number} opts.maxConsecutiveExtractionFailures - Abort after repeated extraction failures
 * @param {object} opts.callbacks - Optional progress callbacks
 * @returns {Promise<{ tracks: Array, duration: number, segmentsScanned: number }>}
 */
export async function scan(file, opts = {}) {
  const step = opts.step ?? 30;
  const segment = opts.segment ?? 18;
  const start = opts.start ?? 0;
  const quiet = opts.quiet ?? false;
  const signal = opts.signal;
  const callbacks = opts.callbacks ?? {};
  const rateLimitMs = opts.rateLimitMs ?? RATE_LIMIT_MS;
  const maxConsecutiveExtractionFailures = opts.maxConsecutiveExtractionFailures
    ?? MAX_CONSECUTIVE_EXTRACTION_FAILURES;
  const recognizeTrack = opts.recognize ?? recognize;
  const extractAudioSegment = opts.extractSegment ?? extractSegment;

  throwIfAborted(signal);
  const duration = opts.duration ?? await getDuration(file, { signal });
  const totalSegs = start + segment <= duration
    ? Math.floor((duration - segment - start) / step) + 1
    : 0;
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
  let consecutiveExtractionFailures = 0;

  try {
    for (let pos = start; pos + segment <= duration; pos += step) {
      throwIfAborted(signal);
      segNum++;
      const ts = formatTime(pos);
      const pct = totalSegs > 0 ? Math.round((segNum / totalSegs) * 100) : 100;
      const progress = {
        phase: 'scan',
        file,
        positionSec: pos,
        timestamp: ts,
        segmentIndex: segNum,
        totalSegments: totalSegs,
        percent: pct,
      };

      callbacks.onProgress?.(progress);
      callbacks.onSegmentStart?.({
        file,
        positionSec: pos,
        timestamp: ts,
        segmentIndex: segNum,
        totalSegments: totalSegs,
      });
      log(`[${ts}] ${pct}% `);

      const segPath = join(tmpDir, `seg.raw`);

      try {
        if (!await extractAudioSegment(file, pos, segment, segPath, { signal })) {
          consecutiveExtractionFailures++;
          const segmentResult = {
            status: 'skipped',
            file,
            positionSec: pos,
            timestamp: ts,
            segmentIndex: segNum,
            totalSegments: totalSegs,
            match: null,
            track: null,
            duplicate: false,
          };
          callbacks.onWarning?.({ message: 'Segment extraction failed', segment: segmentResult });
          callbacks.onSegmentResult?.(segmentResult);
          log('⚠️  skip\n');
          if (consecutiveExtractionFailures >= maxConsecutiveExtractionFailures) {
            throw new ExtractionFailureError(consecutiveExtractionFailures);
          }
          continue;
        }

        consecutiveExtractionFailures = 0;
        const pcm = readFileSync(segPath);
        const match = await recognizeTrack(pcm, { signal, quiet, callbacks });
        throwIfAborted(signal);

        if (match) {
          const same = lastTrack
            && lastTrack.title === match.title
            && lastTrack.artist === match.artist;

          if (same) {
            callbacks.onSegmentResult?.({
              status: 'duplicate',
              file,
              positionSec: pos,
              timestamp: ts,
              segmentIndex: segNum,
              totalSegments: totalSegs,
              match,
              track: null,
              duplicate: true,
            });
            log(`↩️  ${match.artist} — ${match.title}\n`);
          } else {
            const track = { timestamp: ts, position_sec: pos, ...match };
            log(`✅ ${match.artist} — ${match.title}\n`);
            tracks.push(track);
            lastTrack = match;
            callbacks.onTrackDetected?.(track);
            callbacks.onSegmentResult?.({
              status: 'matched',
              file,
              positionSec: pos,
              timestamp: ts,
              segmentIndex: segNum,
              totalSegments: totalSegs,
              match,
              track,
              duplicate: false,
            });
          }
        } else {
          callbacks.onSegmentResult?.({
            status: 'none',
            file,
            positionSec: pos,
            timestamp: ts,
            segmentIndex: segNum,
            totalSegments: totalSegs,
            match: null,
            track: null,
            duplicate: false,
          });
          log('❓\n');
          lastTrack = null;
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'ExtractionFailureError') throw err;
        const segmentResult = {
          status: 'error',
          file,
          positionSec: pos,
          timestamp: ts,
          segmentIndex: segNum,
          totalSegments: totalSegs,
          match: null,
          track: null,
          duplicate: false,
          error: err,
        };
        callbacks.onWarning?.({ message: err.message, error: err, segment: segmentResult });
        callbacks.onSegmentResult?.(segmentResult);
        log(`⚠️  ${err.message}\n`);
        lastTrack = null;
      } finally {
        try { unlinkSync(segPath); } catch {}
      }

      await sleep(rateLimitMs, signal);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return { tracks, duration, segmentsScanned: segNum };
}
