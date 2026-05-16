import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { scan } from '../lib/scanner.mjs';

test('reports progress relative to resumed start position', async () => {
  const progress = [];

  await scan('/tmp/fake mix.mp3', {
    duration: 110,
    start: 40,
    step: 20,
    segment: 10,
    quiet: true,
    rateLimitMs: 0,
    extractSegment: (_file, _start, _duration, outPath) => {
      writeFileSync(outPath, Buffer.alloc(8));
      return true;
    },
    recognize: async () => null,
    callbacks: {
      onProgress(update) {
        progress.push(update);
      },
    },
  });

  assert.deepEqual(
    progress.map(update => update.percent),
    [25, 50, 75, 100]
  );
  assert.deepEqual(
    progress.map(update => update.totalSegments),
    [4, 4, 4, 4]
  );
});

test('removes temporary scan directory after scanning', async () => {
  let scanDir;

  await scan('/tmp/fake mix.mp3', {
    duration: 20,
    step: 10,
    segment: 10,
    quiet: true,
    rateLimitMs: 0,
    extractSegment: (_file, _start, _duration, outPath) => {
      scanDir = dirname(outPath);
      writeFileSync(outPath, Buffer.alloc(8));
      return true;
    },
    recognize: async () => null,
  });

  assert.equal(existsSync(scanDir), false);
});

test('aborts after repeated segment extraction failures', async () => {
  const warnings = [];
  const segments = [];

  await assert.rejects(
    scan('/tmp/fake mix.mp3', {
      duration: 40,
      step: 10,
      segment: 10,
      quiet: true,
      rateLimitMs: 0,
      maxConsecutiveExtractionFailures: 2,
      extractSegment: async () => false,
      recognize: async () => null,
      callbacks: {
        onWarning(warning) {
          warnings.push(warning);
        },
        onSegmentResult(segment) {
          segments.push(segment);
        },
      },
    }),
    /Segment extraction failed 2 times in a row/
  );

  assert.equal(warnings.length, 2);
  assert.deepEqual(segments.map(segment => segment.status), ['skipped', 'skipped']);
});

test('resets extraction failure threshold after a successful segment', async () => {
  const outcomes = [false, true, false, true];

  const result = await scan('/tmp/fake mix.mp3', {
    duration: 40,
    step: 10,
    segment: 10,
    quiet: true,
    rateLimitMs: 0,
    maxConsecutiveExtractionFailures: 2,
    extractSegment: async (_file, _start, _duration, outPath) => {
      const ok = outcomes.shift();
      if (ok) writeFileSync(outPath, Buffer.alloc(8));
      return ok;
    },
    recognize: async () => null,
  });

  assert.equal(result.segmentsScanned, 4);
});

test('passes explicit ffmpeg command to segment extraction', async () => {
  const commands = [];

  await scan('/tmp/fake mix.mp3', {
    duration: 10,
    step: 10,
    segment: 10,
    quiet: true,
    rateLimitMs: 0,
    ffmpegCommand: '/opt/cuezy/ffmpeg',
    extractSegment: async (_file, _start, _duration, outPath, opts) => {
      commands.push(opts.ffmpegCommand);
      writeFileSync(outPath, Buffer.alloc(8));
      return true;
    },
    recognize: async () => null,
  });

  assert.deepEqual(commands, ['/opt/cuezy/ffmpeg']);
});
