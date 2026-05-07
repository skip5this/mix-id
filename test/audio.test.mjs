import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { extractSegment, getDuration, hasCommand } from '../lib/audio.mjs';

test('hasCommand accepts executable relative paths', () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-audio-'));

  try {
    process.chdir(dir);
    writeFileSync('ffmpeg', '#!/bin/sh\nexit 0\n');
    chmodSync('ffmpeg', 0o755);

    assert.equal(hasCommand('./ffmpeg'), true);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('extractSegment rejects when ffmpeg is aborted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-audio-'));
  const previousPath = process.env.PATH;

  try {
    const ffmpeg = join(dir, 'ffmpeg');
    writeFileSync(ffmpeg, '#!/usr/bin/env node\nsetTimeout(() => {}, 10_000);\n');
    chmodSync(ffmpeg, 0o755);
    process.env.PATH = `${dir}${delimiter}${previousPath || ''}`;

    const controller = new AbortController();
    const pending = extractSegment('/tmp/input.mp3', 0, 1, join(dir, 'segment.raw'), {
      signal: controller.signal,
    });
    controller.abort();

    await assert.rejects(pending, error => error.name === 'AbortError');
  } finally {
    process.env.PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getDuration rejects when ffprobe output has no duration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-audio-'));

  try {
    const ffprobe = join(dir, 'ffprobe');
    writeFileSync(ffprobe, '#!/bin/sh\nprintf \'{"format":{}}\'\n');
    chmodSync(ffprobe, 0o755);

    await assert.rejects(
      getDuration('/tmp/input.mp3', { ffprobeCommand: ffprobe }),
      /Could not determine audio duration/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
