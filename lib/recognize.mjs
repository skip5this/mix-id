/**
 * Track recognition via Shazam.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Shazam, s16LEToSamplesArray } = require('shazam-api');

const shazam = new Shazam();

/**
 * Recognize a track from raw s16le PCM audio data.
 * Returns { title, artist, album, year } or null.
 */
export async function recognize(pcmBuffer) {
  const samples = s16LEToSamplesArray(pcmBuffer);
  const result = await shazam.recognizeSong(samples);

  if (!result) return null;

  return {
    title: result.title || 'Unknown',
    artist: result.artist || 'Unknown',
    album: result.album || '',
    year: result.year || '',
  };
}
