#!/usr/bin/env node

import { access, constants } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const defaultBinDir = join(repoRoot, 'resources', 'bin');

function parseArgs(argv) {
  const args = {
    binDir: defaultBinDir,
    target: `${process.platform}-${process.arch}`,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--target') {
      args.target = argv[++index];
    } else if (arg.startsWith('--target=')) {
      args.target = arg.slice('--target='.length);
    } else if (arg === '--bin-dir') {
      args.binDir = resolve(argv[++index]);
    } else if (arg.startsWith('--bin-dir=')) {
      args.binDir = resolve(arg.slice('--bin-dir='.length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!args.target) throw new Error('Missing --target value.');
  return args;
}

async function assertRunnable(path) {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
  } catch {
    throw new Error(`Missing or non-executable packaged audio tool: ${path}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const extension = args.target.startsWith('win32') ? '.exe' : '';
  const targetDir = join(args.binDir, args.target);
  const ffmpeg = join(targetDir, `ffmpeg${extension}`);
  const ffprobe = join(targetDir, `ffprobe${extension}`);

  await assertRunnable(ffmpeg);
  await assertRunnable(ffprobe);
  console.log(`Verified FFmpeg tools for ${args.target}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
