#!/usr/bin/env node

import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
} from 'fs/promises';
import { get } from 'https';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const defaultManifestPath = join(repoRoot, 'resources', 'ffmpeg-manifest.json');
const defaultCacheDir = join(repoRoot, '.cache', 'ffmpeg');
const defaultOutputDir = join(repoRoot, 'resources', 'bin');
const executableMode = 0o755;

function parseArgs(argv) {
  const args = {
    all: false,
    cacheDir: defaultCacheDir,
    force: false,
    list: false,
    manifest: defaultManifestPath,
    outputDir: defaultOutputDir,
    target: `${process.platform}-${process.arch}`,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--all') {
      args.all = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--target') {
      args.target = argv[++index];
    } else if (arg.startsWith('--target=')) {
      args.target = arg.slice('--target='.length);
    } else if (arg === '--manifest') {
      args.manifest = resolve(argv[++index]);
    } else if (arg.startsWith('--manifest=')) {
      args.manifest = resolve(arg.slice('--manifest='.length));
    } else if (arg === '--cache-dir') {
      args.cacheDir = resolve(argv[++index]);
    } else if (arg.startsWith('--cache-dir=')) {
      args.cacheDir = resolve(arg.slice('--cache-dir='.length));
    } else if (arg === '--output-dir') {
      args.outputDir = resolve(argv[++index]);
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = resolve(arg.slice('--output-dir='.length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(path) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !manifest.targets) {
    throw new Error(`Invalid manifest: ${path}`);
  }
  return manifest;
}

function validateEntry(target, entry) {
  if (entry?.status !== 'active') {
    throw new Error(`${target} is not active in the FFmpeg manifest yet.`);
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const missing = ['url', 'sha256', 'archiveType', 'path']
      .filter(key => !entry?.artifacts?.[tool]?.[key]);

    if (missing.length > 0) {
      throw new Error(`${target} ${tool} is missing required manifest fields: ${missing.join(', ')}`);
    }
  }
}

function archiveName(target, tool, artifact) {
  const urlName = basename(new URL(artifact.url).pathname);
  return `${target}-${tool}-${artifact.sha256.slice(0, 12)}-${urlName || 'ffmpeg-archive'}`;
}

function download(url, outputPath, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error(`Too many redirects: ${url}`));
  }

  return new Promise((resolveDownload, rejectDownload) => {
    const request = get(url, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          rejectDownload(new Error(`Redirect status ${response.statusCode} without location header: ${url}`));
          return;
        }

        download(new URL(location, url).toString(), outputPath, redirects + 1)
          .then(resolveDownload, rejectDownload);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        rejectDownload(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const file = createWriteStream(outputPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(error => {
          if (error) {
            rejectDownload(error);
            return;
          }
          resolveDownload();
        });
      });
      file.on('error', rejectDownload);
    });

    request.on('error', rejectDownload);
  });
}

async function sha256(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', rejectRun);
    child.on('close', status => {
      if (status === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} exited with status ${status}`));
      }
    });
  });
}

async function extractArchive(archivePath, outputDir, archiveType) {
  await mkdir(outputDir, { recursive: true });

  if (archiveType === 'tar' || archiveType === 'tar.gz' || archiveType === 'tgz' || archiveType === 'tar.xz') {
    await run('tar', ['-xf', archivePath, '-C', outputDir]);
    return;
  }

  if (archiveType === 'zip') {
    if (process.platform === 'darwin') {
      await run('ditto', ['-x', '-k', archivePath, outputDir]);
      return;
    }

    if (process.platform === 'win32') {
      await run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(outputDir)} -Force`,
      ]);
      return;
    }

    await run('unzip', ['-q', archivePath, '-d', outputDir]);
    return;
  }

  throw new Error(`Unsupported archiveType: ${archiveType}`);
}

async function ensureArchive(target, tool, artifact, cacheDir, force) {
  await mkdir(cacheDir, { recursive: true });
  const archivePath = join(cacheDir, archiveName(target, tool, artifact));

  if (force || !await exists(archivePath)) {
    console.log(`Downloading ${target} ${tool} archive...`);
    try {
      await download(artifact.url, archivePath);
    } catch (error) {
      await rm(archivePath, { force: true });
      throw error;
    }
  }

  const actual = await sha256(archivePath);
  if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) {
    await rm(archivePath, { force: true });
    throw new Error(`Checksum mismatch for ${target} ${tool}. Expected ${artifact.sha256}, got ${actual}.`);
  }

  return archivePath;
}

async function copyTool(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  if (process.platform !== 'win32') {
    await chmod(destination, executableMode);
  }
}

async function installTarget(target, entry, args) {
  validateEntry(target, entry);

  const targetDir = join(args.outputDir, target);
  const toolNames = target.startsWith('win32')
    ? { ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' }
    : { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };

  await rm(targetDir, { recursive: true, force: true });

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const artifact = entry.artifacts[tool];
    const archivePath = await ensureArchive(target, tool, artifact, args.cacheDir, args.force);
    const extractDir = await mkdtemp(join(tmpdir(), `cuezy-${tool}-${target}-`));

    try {
      await extractArchive(archivePath, extractDir, artifact.archiveType);
      const source = join(extractDir, artifact.path);
      await stat(source);
      await copyTool(source, join(targetDir, toolNames[tool]));
    } finally {
      await rm(extractDir, { recursive: true, force: true });
    }
  }

  console.log(`Installed ${target} FFmpeg tools to ${targetDir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readManifest(args.manifest);
  const targets = args.all ? Object.keys(manifest.targets) : [args.target];

  if (args.list) {
    for (const target of Object.keys(manifest.targets).sort()) {
      const entry = manifest.targets[target];
      console.log(`${target}\t${entry.status || 'unknown'}\t${entry.version || 'unversioned'}`);
    }
    return;
  }

  for (const target of targets) {
    const entry = manifest.targets[target];
    if (!entry) throw new Error(`No FFmpeg manifest entry for target: ${target}`);
    await installTarget(target, entry, args);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
