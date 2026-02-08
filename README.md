# mix-id

Identify every track in a DJ mix — from a local file or streaming URL.

```
$ npx mix-id https://soundcloud.com/dj/my-set

📥 Downloading...
✅ my-set.mp3 (142.3 MB)

🎵 mix-id
──────────────────────────────────────────────────
File:     my-set.mp3
Duration: 1:30:12
Settings: 30s step, 18s sample
──────────────────────────────────────────────────

[00:00] 1% ✅ The Orb — Little Fluffy Clouds
[00:30] 1% ↩️  The Orb — Little Fluffy Clouds
[01:00] 2% ✅ Surface — Falling in Love
...

──────────────────────────────────────────────────
🎧 TRACKLIST — my-set.mp3
──────────────────────────────────────────────────
 1. [00:00] The Orb — Little Fluffy Clouds
 2. [01:00] Surface — Falling in Love
 3. [04:30] Madonna — Vogue
──────────────────────────────────────────────────

💾 Output:
   my-set_tracklist.txt
   my-set.cue
   my-set_tracklist.json
```

## Install

```bash
npm install -g mix-id
```

Or run directly:

```bash
npx mix-id my-mix.mp3
```

### Requirements

- **Node.js** 18+
- **ffmpeg** — audio processing (`brew install ffmpeg`)
- **yt-dlp** — URL downloads (`brew install yt-dlp`) — only needed for URLs

## Usage

```bash
# Local file
mix-id my-mix.mp3

# SoundCloud
mix-id https://soundcloud.com/dj/set-name

# Mixcloud
mix-id https://www.mixcloud.com/dj/show-name

# YouTube
mix-id https://www.youtube.com/watch?v=...

# Custom scan settings
mix-id my-mix.mp3 --step 60 --segment 20

# Resume from a specific position
mix-id my-mix.mp3 --start 3600
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--step` | `30` | Seconds between scan points |
| `--segment` | `18` | Sample length for recognition |
| `--start` | `0` | Skip to this position (seconds) |
| `--help` | | Show help |

## Output

mix-id generates three files:

- **`_tracklist.txt`** — Paste-friendly format for Mixcloud, etc.
- **`.cue`** — CUE sheet with track markers and timestamps
- **`_tracklist.json`** — Structured data with full metadata

## How it works

1. Downloads audio from URL (if given) using yt-dlp
2. Splits the audio into overlapping segments
3. Fingerprints each segment via Shazam's recognition API
4. Deduplicates consecutive matches (handles DJ transitions)
5. Outputs clean tracklist in multiple formats

## Supported sources

Any URL that [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports — that's **1000+ sites** including:

- SoundCloud
- Mixcloud
- YouTube
- Bandcamp
- And many more

## Tips

- **Longer mixes?** The default 30s step works well. Use `--step 60` to scan faster at the cost of precision.
- **Transitions fuzzy?** Shazam sometimes bounces between two tracks during a mix. mix-id deduplicates these automatically.
- **No API key needed.** mix-id uses Shazam's public recognition endpoint.
- **Rate limited?** mix-id waits 2s between requests to be respectful. A 2-hour mix takes ~8 minutes to scan.

## License

MIT
