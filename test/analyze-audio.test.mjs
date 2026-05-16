import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  analyzeAudio,
  normalizeAnalysisOptions,
  normalizeAnalysisRequest,
} from '../lib/analyze-audio.mjs';

test('core analysis module can be imported', () => {
  assert.equal(typeof analyzeAudio, 'function');
});

test('normalizes default analysis options', () => {
  assert.deepEqual(normalizeAnalysisOptions({}), {
    step: null,
    segment: 18,
    start: 0,
    outputDir: process.cwd(),
  });
});

test('validates numeric analysis options', () => {
  assert.throws(() => normalizeAnalysisOptions({ step: 0 }), /step must be positive/);
  assert.throws(() => normalizeAnalysisOptions({ segment: -1 }), /segment must be positive/);
  assert.throws(() => normalizeAnalysisOptions({ start: -1 }), /start must be non-negative/);
});

test('normalizes analysis requests before work starts', async () => {
  assert.deepEqual(await normalizeAnalysisRequest('/tmp/local mix.mp3', { step: 600 }), {
    input: '/tmp/local mix.mp3',
    isURL: false,
    isLocalFile: true,
    options: {
      step: 600,
      segment: 18,
      start: 0,
      outputDir: process.cwd(),
    },
  });

  assert.equal(
    (await normalizeAnalysisRequest('https://example.com/mix')).isURL,
    true
  );
});

test('can require local file requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-request-'));

  try {
    const file = join(dir, 'mix file.mp3');
    writeFileSync(file, '');

    assert.equal(
      (await normalizeAnalysisRequest(file, {}, { requireLocalFile: true })).input,
      file
    );
    await assert.rejects(
      normalizeAnalysisRequest(dir, {}, { requireLocalFile: true }),
      /Selected path is not a file/
    );
    await assert.rejects(
      normalizeAnalysisRequest('https://example.com/mix', {}, {
        allowUrls: false,
        localOnlyMessage: 'local files only',
      }),
      /local files only/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports local files with spaces without shell interpretation', async () => {
  await assert.rejects(
    analyzeAudio('/tmp/mix id/missing local mix.mp3', {}, {}),
    /File not found: \/tmp\/mix id\/missing local mix\.mp3/
  );
});

test('reports request validation failures through onError', async () => {
  const errors = [];

  await assert.rejects(
    analyzeAudio('', {}, {
      onError(error) {
        errors.push(error);
      },
    }),
    /input path or URL is required/
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /input path or URL is required/);
});

test('public analysis API forwards explicit audio tool paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-api-'));

  try {
    const input = join(dir, 'mix.mp3');
    const ffprobe = join(dir, 'custom-ffprobe');
    const ffmpeg = join(dir, 'custom-ffmpeg');
    const ffprobeLog = join(dir, 'ffprobe.log');
    const ffmpegLog = join(dir, 'ffmpeg.log');
    writeFileSync(input, 'audio');
    writeFileSync(ffprobe, `#!/bin/sh\nprintf '%s\\n' "$0" > "${ffprobeLog}"\nprintf '{"format":{"duration":"90"}}'\n`);
    writeFileSync(ffmpeg, `#!/bin/sh\nprintf '%s\\n' "$0" >> "${ffmpegLog}"\nout=""\nprev=""\nfor arg in "$@"; do\n  if [ "$prev" = "-f" ]; then format="$arg"; fi\n  prev="$arg"\n  out="$arg"\ndone\nprintf ok > "$out"\n`);
    chmodSync(ffprobe, 0o755);
    chmodSync(ffmpeg, 0o755);

    const progress = [];
    const result = await analyzeAudio(input, {
      step: 45,
      segment: 1,
      rateLimitMs: 0,
      ffmpegCommand: ffmpeg,
      ffprobeCommand: ffprobe,
      recognize: async () => null,
    }, {
      onProgress(update) {
        progress.push(update);
      },
    });

    assert.equal(result.input, input);
    assert.equal(result.file, input);
    assert.equal(result.step, 45);
    assert.equal(result.segment, 1);
    assert.equal(result.segmentsScanned, 2);
    assert.deepEqual(result.tracks, []);
    assert.equal(progress.at(0).phase, 'prepare');
    assert.equal(progress.at(-1).phase, 'done');
    assert.equal(progress.every(update => update.input === input), true);
    assert.match(readFileSync(ffprobeLog, 'utf8'), /custom-ffprobe/);
    assert.match(readFileSync(ffmpegLog, 'utf8'), /custom-ffmpeg/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
