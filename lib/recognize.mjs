/**
 * Track recognition via Shazam with rate-limit retry.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let shazam;
let s16LEToSamplesArray;

function getShazamApi() {
  if (!shazam || !s16LEToSamplesArray) {
    const api = require('shazam-api');
    shazam = new api.Shazam();
    s16LEToSamplesArray = api.s16LEToSamplesArray;
  }

  return { shazam, s16LEToSamplesArray };
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const err = new Error(typeof signal?.reason === 'string' ? signal.reason : 'Recognition cancelled');
  err.name = 'AbortError';
  return err;
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (!signal) {
    setTimeout(resolve, ms);
    return;
  }

  if (signal.aborted) {
    reject(abortError(signal));
    return;
  }

  const timeout = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  function onAbort() {
    clearTimeout(timeout);
    reject(abortError(signal));
  }

  signal.addEventListener('abort', onAbort, { once: true });
});

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 10_000; // 10s, 20s, 40s

/**
 * Recognize a track from raw s16le PCM audio data.
 * Retries with exponential backoff on rate-limit (HTML response).
 * Returns { title, artist, album, year } or null.
 */
export async function recognize(pcmBuffer, opts = {}) {
  const { shazam, s16LEToSamplesArray } = getShazamApi();
  const samples = s16LEToSamplesArray(pcmBuffer);
  const signal = opts.signal;
  const quiet = opts.quiet ?? false;
  const callbacks = opts.callbacks ?? {};

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw abortError(signal);
    }

    try {
      const result = await shazam.recognizeSong(samples);

      if (!result) return null;

      return {
        title: result.title || 'Unknown',
        artist: result.artist || 'Unknown',
        album: result.album || '',
        year: result.year || '',
      };
    } catch (err) {
      const isRateLimit = err.message && (
        err.message.includes('<!doctype') ||
        err.message.includes('<!DOCTYPE') ||
        err.message.includes('is not valid JSON')
      );

      if (isRateLimit && attempt < MAX_RETRIES) {
        const wait = BACKOFF_BASE_MS * Math.pow(2, attempt);
        callbacks.onWarning?.({
          message: `Rate limited — waiting ${wait / 1000}s before retry`,
          error: err,
          retryAfterMs: wait,
          attempt: attempt + 1,
        });
        if (!quiet) {
          process.stdout.write(`\n   ⏳ Rate limited — waiting ${wait / 1000}s before retry...\n`);
        }
        await sleep(wait, signal);
        continue;
      }

      throw err;
    }
  }

  return null;
}
