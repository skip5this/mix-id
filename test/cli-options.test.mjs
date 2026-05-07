import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs } from '../lib/cli-options.mjs';

test('parses positional input and numeric options', () => {
  const parsed = parseCliArgs([
    '/music/local mix.mp3',
    '--step', '60',
    '--segment', '20',
    '--start', '120',
  ]);

  assert.equal(parsed.input, '/music/local mix.mp3');
  assert.deepEqual(parsed.options, {
    step: 60,
    segment: 20,
    start: 120,
  });
});

test('keeps URL input intact', () => {
  const parsed = parseCliArgs([
    'https://www.youtube.com/watch?v=abc123',
    '--step', '30',
  ]);

  assert.equal(parsed.input, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(parsed.options.step, 30);
});

test('missing numeric flag values parse as invalid numbers', () => {
  const parsed = parseCliArgs(['mix.mp3', '--step', '--segment', '18']);

  assert.equal(Number.isNaN(parsed.options.step), true);
  assert.equal(parsed.options.segment, 18);
});
