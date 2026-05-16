Bundled Audio Tools
===================

Cuezy loads packaged ffmpeg and ffprobe binaries from this directory using the
platform and architecture target:

```text
resources/bin/darwin-arm64/ffmpeg
resources/bin/darwin-arm64/ffprobe
resources/bin/darwin-x64/ffmpeg
resources/bin/darwin-x64/ffprobe
resources/bin/win32-x64/ffmpeg.exe
resources/bin/win32-x64/ffprobe.exe
resources/bin/linux-x64/ffmpeg
resources/bin/linux-x64/ffprobe
```

Do not commit downloaded binaries here. Their source, version, checksum,
license, and build script are documented in `resources/ffmpeg-manifest.json`
and `THIRD_PARTY_NOTICES.md`.

Use `npm run fetch:ffmpeg -- --list` to inspect configured targets. Use
`npm run fetch:ffmpeg -- --target <platform-arch>` before packaging that target.
