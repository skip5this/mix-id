/**
 * Track recognition via Shazam with rate-limit retry.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Shazam, s16LEToSamplesArray } = require('shazam-api');

const shazam = new Shazam();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 10_000; // 10s, 20s, 40s

/**
 * Recognize a track from raw s16le PCM audio data.
 * Retries with exponential backoff on rate-limit (HTML response).
 * Returns { title, artist, album, year } or null.
 */
export async function recognize(pcmBuffer) {
  const samples = s16LEToSamplesArray(pcmBuffer);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        process.stdout.write(`\n   ⏳ Rate limited — waiting ${wait / 1000}s before retry...\n`);
        await sleep(wait);
        continue;
      }

      throw err;
    }
  }

  return null;
}
