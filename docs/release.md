# Release Checklist

This checklist captures the current local release flow for Cuezy. The app is
still unsigned, so these steps are for validating development builds before a
public release process is finalized.

## Before Packaging

- Confirm the working tree only contains intended source changes.
- Run the core test suite:

```bash
/opt/homebrew/bin/node --test
```

- Run the production build:

```bash
npm run build
```

## FFmpeg Artifacts

- Confirm `resources/ffmpeg-manifest.json` pins the intended FFmpeg and
  FFprobe version, URLs, SHA-256 checksums, provider, build script, and license.
- Confirm `THIRD_PARTY_NOTICES.md` matches the pinned artifacts.
- Fetch the pinned macOS binaries:

```bash
npm run fetch:ffmpeg -- --target darwin-arm64
npm run fetch:ffmpeg -- --target darwin-x64
```

- Verify both binary sets:

```bash
npm run verify:ffmpeg -- --target darwin-arm64
npm run verify:ffmpeg -- --target darwin-x64
```

- Do not commit downloaded binaries. They should remain ignored under
  `resources/bin/darwin-*`.

## Package

- Build the macOS app:

```bash
npm run dist:mac
```

- If Electron Builder cannot write to the default cache, use a temporary cache:

```bash
ELECTRON_BUILDER_CACHE=/private/tmp/cuezy-electron-builder-cache npm run dist:mac
```

- Confirm the packaged app only includes the matching architecture tools. For
  an arm64 build, this should list only `darwin-arm64` binaries:

```bash
find release/mac-arm64/Cuezy.app/Contents/Resources -maxdepth 4 -type f \( -name ffmpeg -o -name ffprobe \) -print
```

## Smoke Test

- Launch the packaged app from `release/mac-arm64/Cuezy.app`.
- Select a real local audio or video file.
- For a long-file smoke test, set `Scan step` to `600` in Advanced.
- Run analysis and confirm:
  - progress advances through the file;
  - tracks appear in the editable table;
  - completion shows the scanned segment count;
  - export buttons enable after completion.

Packaged builds must use bundled tools from
`Cuezy.app/Contents/Resources/bin/<platform-arch>/`. They should not fall back
to `ffmpeg` or `ffprobe` from `PATH`.

## Later Public Release Steps

- Add Developer ID signing.
- Add notarization and hardened runtime entitlements.
- Decide universal versus separate arm64/x64 artifacts.
- Finalize DMG layout and zip distribution strategy.
- Add release upload and checksum generation.
- Revisit Electron fuses and auto-update configuration.
