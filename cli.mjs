#!/usr/bin/env node

/**
 * mix-id — Identify tracks in any DJ mix.
 *
 * Usage:
 *   mix-id <file-or-url> [options]
 *
 * Examples:
 *   mix-id my-mix.mp3
 *   mix-id https://soundcloud.com/dj/set-name
 *   mix-id https://www.mixcloud.com/dj/show-name
 *   mix-id https://youtube.com/watch?v=... --step 60
 */

import { basename } from 'path';
import { spawnSync } from 'child_process';
import { analyzeAudio, normalizeAnalysisOptions } from './lib/analyze-audio.mjs';
import { formatTime, writeTXT, writeCUE, writeJSON } from './lib/format.mjs';
import { fileSize, hasCommand } from './lib/audio.mjs';
import { parseCliArgs } from './lib/cli-options.mjs';

// --- Parse args ---

const { input, flags, options } = parseCliArgs(process.argv.slice(2));

if (!input || flags.help) {
  console.log(`
  mix-id — Identify tracks in any DJ mix.

  Usage:
    mix-id <file-or-url> [options]

  Options:
    --step <sec>      Time between scan points (auto: 30s ≤1hr, 60s >1hr)
    --segment <sec>   Sample length for recognition (default: 18)
    --start <sec>     Skip to position before scanning (default: 0)
    --help            Show this help

  Examples:
    mix-id my-mix.mp3
    mix-id https://soundcloud.com/dj/set-name
    mix-id mix.wav --step 60 --segment 20

  Requirements:
    ffmpeg    Audio processing (brew install ffmpeg)
    yt-dlp    URL downloads (brew install yt-dlp)
  `);
  process.exit(input ? 0 : 1);
}

try {
  normalizeAnalysisOptions(options);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const isURL = /^https?:\/\//i.test(input);

// --- Preflight checks ---

async function ensureDeps() {
  const missing = [];
  if (!hasCommand('ffmpeg') || !hasCommand('ffprobe')) missing.push('ffmpeg');
  if (isURL && !hasCommand('yt-dlp')) missing.push('yt-dlp');

  if (missing.length === 0) return;

  // Try auto-install via brew
  if (hasCommand('brew')) {
    console.log(`\n📦 Installing missing dependencies: ${missing.join(', ')}...\n`);
    const install = spawnSync('brew', ['install', ...missing], { stdio: 'inherit' });
    if (install.status === 0) {
      console.log('');
      return;
    }

    console.error(`\n❌ Auto-install failed. Please run manually:`);
    console.error(`   brew install ${missing.join(' ')}`);
    process.exit(1);
  }

  console.error(`\n❌ Missing dependencies: ${missing.join(', ')}`);
  console.error(`\n   Install with:`);
  console.error(`   brew install ${missing.join(' ')}    (macOS)`);
  console.error(`   apt install ${missing.join(' ')}     (Linux)`);
  process.exit(1);
}

await ensureDeps();

let result;
try {
  result = await analyzeAudio(input, {
    ...options,
    outputDir: process.cwd(),
    inheritDownloadProgress: true,
  }, {
    onProgress(progress) {
      if (progress.phase === 'download' && !progress.file) {
        console.log(`\n📥 Downloading...`);
        console.log(`   ${input}\n`);
      } else if (progress.phase === 'download' && progress.file) {
        console.log(`✅ ${basename(progress.file)} (${fileSize(progress.file)})\n`);
      } else if (progress.phase === 'scan' && !progress.segmentIndex) {
        console.log(`\n🎵 mix-id`);
        console.log('─'.repeat(50));
        console.log(`File:     ${basename(progress.file)}`);
        console.log(`Duration: ${formatTime(progress.duration)}`);
        console.log(`Settings: ${progress.step}s step, ${progress.segment}s sample`);
        console.log('─'.repeat(50) + '\n');
      }
    },
    onSegmentStart(segmentInfo) {
      const pct = segmentInfo.totalSegments > 0
        ? Math.round((segmentInfo.segmentIndex / segmentInfo.totalSegments) * 100)
        : 100;
      process.stdout.write(`[${segmentInfo.timestamp}] ${pct}% `);
    },
    onSegmentResult(segmentResult) {
      if (segmentResult.status === 'matched') {
        process.stdout.write(`✅ ${segmentResult.match.artist} — ${segmentResult.match.title}\n`);
      } else if (segmentResult.status === 'duplicate') {
        process.stdout.write(`↩️  ${segmentResult.match.artist} — ${segmentResult.match.title}\n`);
      } else if (segmentResult.status === 'skipped') {
        process.stdout.write('⚠️  skip\n');
      } else if (segmentResult.status === 'error') {
        process.stdout.write(`⚠️  ${segmentResult.error.message}\n`);
      } else {
        process.stdout.write('❓\n');
      }
    },
    onWarning(warning) {
      if (!warning.segment) {
        process.stdout.write(`\n   ⏳ ${warning.message}...\n`);
      }
    },
  });
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const tracks = result.tracks;

if (tracks.length === 0) {
  console.log('\n❌ No tracks identified.');
  process.exit(0);
}

// Print tracklist
console.log('\n' + '─'.repeat(50));
console.log(`🎧 TRACKLIST — ${basename(result.file)}`);
console.log('─'.repeat(50));
tracks.forEach((t, i) => {
  const num = String(i + 1).padStart(2);
  const album = t.album ? ` [${t.album}]` : '';
  console.log(`${num}. [${t.timestamp}] ${t.artist} — ${t.title}${album}`);
});
const removed = result.duplicatesRemoved;
if (removed > 0) console.log(`\n🔄 ${removed} duplicate(s) removed`);
console.log('─'.repeat(50));

// Write files
const base = result.file.replace(/\.[^.]+$/, '');
const audioFilename = basename(result.file);

writeTXT(tracks, base + '_tracklist.txt');
writeCUE(tracks, base + '.cue', audioFilename);
writeJSON(tracks, base + '_tracklist.json', {
  source: audioFilename,
  duration: result.duration,
  segments_scanned: result.segmentsScanned,
});

console.log(`\n💾 Output:`);
console.log(`   ${base}_tracklist.txt`);
console.log(`   ${base}.cue`);
console.log(`   ${base}_tracklist.json`);
