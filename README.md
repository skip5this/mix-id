# Cuezy

Cuezy is a macOS-first Electron app for identifying timestamped songs in local DJ mixes, radio sets, and VOD files.

The project is transitioning from the original `mix-id` CLI fork into a desktop app. The inherited CLI and reusable recognition core are still kept in place while the Electron app becomes the primary product.

## Desktop App

```bash
npm install
npm run dev       # Electron development app
npm run build     # electron-vite build
npm run dist:mac  # unsigned local dmg + zip build
```

The desktop app currently supports local audio and video files only. URL downloads and `yt-dlp` support remain available through the inherited CLI for now.

Requirements:

- Node.js `^20.19.0 || >=22.12.0`
- `ffmpeg` and `ffprobe` available on `PATH`

Privacy note: audio is processed locally, but short snippets are sent to Shazam's public recognition endpoint for identification.

## Repository Layout

```text
cli.mjs                 # inherited mix-id CLI entrypoint
lib/                    # reusable audio analysis, scanning, recognition, and CLI formatting core
src/main/               # Electron main process
src/preload/            # secure preload bridge exposed to the renderer
src/renderer/           # React renderer app
src/shared/             # code shared by Electron processes
test/                   # Node test runner coverage for core and shared helpers
electron.vite.config.js # Electron/Vite build configuration
```

This layout is intentionally transitional. `lib/` remains stable so the CLI and programmatic API keep working. A later refactor can move that code into `src/core/` once Cuezy no longer needs to preserve the old package surface.

## Desktop Packaging Notes

Public macOS distribution will require Developer ID signing and notarization. The current packaging config is intended for unsigned local development builds.

Packaging TODOs:

- Add app icon and DMG background/layout polish.
- Decide Apple Silicon arm64, Intel x64, and later universal build strategy.
- Add Developer ID signing, notarization, hardened runtime, and entitlements via environment variables.
- Add auto-update and clearer portable/zip distribution strategy.
- Bundle ffmpeg with `extraResources` / `asarUnpack`; do not pack executable binaries inside ASAR.
- Add URL/yt-dlp GUI support after the local-file workflow is solid.
- Add Electron fuses hardening and better installer metadata.

## Inherited CLI

The original `mix-id` CLI is still available:

```bash
npx mix-id my-mix.mp3
mix-id https://soundcloud.com/dj/set-name
mix-id https://www.mixcloud.com/dj/show-name
mix-id https://www.youtube.com/watch?v=...
mix-id my-mix.mp3 --step 30 --segment 20
mix-id my-mix.mp3 --start 3600
```

CLI requirements:

- `ffmpeg` and `ffprobe` for local audio processing
- `yt-dlp` for URL downloads

On macOS, the CLI will try to auto-install missing command-line dependencies through Homebrew. On Linux, install them with your package manager.

CLI output formats:

- `_tracklist.txt` for paste-friendly tracklists
- `.cue` for CUE sheets
- `_tracklist.json` for structured metadata

## Programmatic API

The analysis core can still be imported from ESM code:

```js
import { analyzeAudio } from 'mix-id/lib/analyze-audio.mjs';

const controller = new AbortController();
const result = await analyzeAudio('my-mix.mp3', {
  step: 30,
  segment: 18,
  signal: controller.signal,
}, {
  onSegmentResult(segment) {
    // Stream progress into your app UI.
  },
});
```

Cancellation is best-effort: Cuezy checks `AbortSignal` before and after audio tool calls, between scan segments, and during retry waits. A recognition request already in flight may continue until the Shazam library returns.

## How Recognition Works

1. Resolve the input as a local file or, in the CLI, download URL audio with `yt-dlp`.
2. Split the audio into short overlapping segments with ffmpeg.
3. Fingerprint each segment through Shazam recognition.
4. Deduplicate consecutive matches to smooth DJ transitions.
5. Present or export a timestamped tracklist.

## Notes

- No API key is needed; the inherited recognition layer uses Shazam's public recognition endpoint.
- Longer mixes use larger default scan steps to reduce rate limiting.
- If a scan is interrupted in the CLI, use `--start` to resume from a later timestamp.

## License

MIT
