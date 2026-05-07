import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudio, normalizeAnalysisOptions } from '../lib/analyze-audio.mjs';

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

test('reports local files with spaces without shell interpretation', async () => {
  await assert.rejects(
    analyzeAudio('/tmp/mix id/missing local mix.mp3', {}, {}),
    /File not found: \/tmp\/mix id\/missing local mix\.mp3/
  );
});
