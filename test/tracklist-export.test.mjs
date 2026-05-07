import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, markdownTracklist, txtTracklist } from '../src/shared/tracklist-export.js';

const rows = [
  { timestamp: '00:00', artist: 'Artist A', title: 'Song A', album: 'Album A', year: '2024' },
  { timestamp: '20:00', artist: 'Artist B', title: 'Song B', album: '', year: '' },
];

test('formats markdown tracklists for copy and save', () => {
  assert.equal(markdownTracklist(rows), '# Tracklist\n\n00:00 - Artist A - Song A\n20:00 - Artist B - Song B\n');
});

test('formats txt tracklists', () => {
  assert.equal(txtTracklist(rows), 'Artist A - Song A 00:00\nArtist B - Song B 20:00\n');
});

test('builds json exports with normalized rows', () => {
  assert.deepEqual(JSON.parse(buildExport('json', rows)), { tracks: rows });
});

test('rejects unsupported export formats', () => {
  assert.throws(() => buildExport('html', rows), /Unsupported export format/);
});
