import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { dedupe, formatTime, writeCUE, writeJSON, writeTXT } from '../lib/format.mjs';

const tracks = [
  { timestamp: '00:00', position_sec: 0, artist: 'Artist A', title: 'Track One', album: 'Album A' },
  { timestamp: '01:00', position_sec: 60, artist: 'Artist B', title: 'Track Two', album: '' },
];

test('formats seconds as display timestamps', () => {
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(3665), '1:01:05');
});

test('dedupes consecutive duplicate tracks', () => {
  assert.deepEqual(dedupe([
    tracks[0],
    { ...tracks[0] },
    tracks[1],
  ]), [tracks[0], tracks[1]]);
});

test('writes txt, cue, and json outputs to paths with spaces', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix id outputs '));

  try {
    const txt = join(dir, 'my mix_tracklist.txt');
    const cue = join(dir, 'my mix.cue');
    const json = join(dir, 'my mix_tracklist.json');

    writeTXT(tracks, txt);
    writeCUE(tracks, cue, 'my mix.mp3');
    writeJSON(tracks, json, { source: 'my mix.mp3', duration: 120, segments_scanned: 2 });

    assert.match(readFileSync(txt, 'utf8'), /Artist A - Track One 00:00/);
    assert.match(readFileSync(cue, 'utf8'), /FILE "my mix\.mp3" MP3/);
    assert.deepEqual(JSON.parse(readFileSync(json, 'utf8')).tracks, tracks);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writes valid cue timestamps for fractional track positions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix id cue '));

  try {
    const cue = join(dir, 'fractional mix.cue');

    writeCUE([
      { position_sec: 61.5, artist: 'Artist', title: 'Track' },
    ], cue, 'fractional mix.mp3');

    assert.match(readFileSync(cue, 'utf8'), /INDEX 01 01:01:37/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sanitizes cue quoted fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix id cue '));

  try {
    const cue = join(dir, 'quote mix.cue');

    writeCUE([
      { position_sec: 0, artist: 'DJ "A"\nLive', title: 'Song "B"\r\nEdit' },
    ], cue, 'my "mix".mp3');

    const text = readFileSync(cue, 'utf8');
    assert.match(text, /FILE "my 'mix'\.mp3" MP3/);
    assert.match(text, /TITLE "Song 'B' Edit"/);
    assert.match(text, /PERFORMER "DJ 'A' Live"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
