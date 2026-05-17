import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import {
  downloadURL,
  extractSegment,
  getDuration,
  hasCommand,
  resolveCommandPath,
} from '../lib/audio.mjs';

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

test('resolveCommandPath returns executable command paths', () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-audio-'));

  try {
    process.chdir(dir);
    writeFileSync('ffmpeg', '#!/bin/sh\nexit 0\n');
    chmodSync('ffmpeg', 0o755);

    assert.equal(resolveCommandPath('./ffmpeg'), './ffmpeg');
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

test('extractSegment accepts an explicit ffmpeg command path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-audio-'));

  try {
    const ffmpeg = join(dir, 'custom-ffmpeg');
    writeFileSync(ffmpeg, '#!/bin/sh\nshift 15\nprintf ok > "$1"\n');
    chmodSync(ffmpeg, 0o755);

    const outPath = join(dir, 'segment.raw');
    const extracted = await extractSegment('/tmp/input.mp3', 0, 1, outPath, {
      ffmpegCommand: ffmpeg,
    });

    assert.equal(extracted, true);
  } finally {
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

test('downloadURL accepts an explicit yt-dlp command path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mix-id-audio-'));

  try {
    const ytDlp = join(dir, 'custom-yt-dlp');
    const log = join(dir, 'yt-dlp.log');
    writeFileSync(ytDlp, `#!/bin/sh
printf '%s\\n' "$0 $*" >> "${log}"
if [ "$1" = "--print" ]; then
  printf 'Test Mix\\n'
  exit 0
fi
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    out="$arg"
    break
  fi
  prev="$arg"
done
out=$(printf '%s' "$out" | sed 's/%(ext)s/mp3/g')
printf audio > "$out"
`);
    chmodSync(ytDlp, 0o755);

    const file = await downloadURL('https://example.com/mix', dir, {
      ytDlpCommand: ytDlp,
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    assert.equal(file, join(dir, 'test-mix.mp3'));
    assert.equal(readFileSync(file, 'utf8'), 'audio');
    assert.match(readFileSync(log, 'utf8'), /custom-yt-dlp --print title --no-download/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
