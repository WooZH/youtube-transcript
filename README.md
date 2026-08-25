<div align="center">

**English** | [简体中文](README.zh-CN.md)

</div>

# YouTube Transcript

**Turn any YouTube video into searchable, exportable text — entirely on your computer.**

Paste a video link and the app grabs the official captions automatically. No captions available? The built-in AI engine transcribes the speech locally. No sign-up, no API keys, and your media never leaves your device.

## Highlights

### 🔒 Data Security

- **Fully local processing**: audio is downloaded to a local temp folder and transcribed on-device — **nothing ever leaves your computer**. No telemetry, no tracking
- **Zero accounts**: no sign-up, no login, no API keys
- **Clean by design**: temp files are deleted automatically after each job
- **Open source & auditable**: the entire data flow is public and reviewable

### ⚡ Estimated Transcription Speed

On Apple Silicon Macs; actual speed depends on your hardware and model:

| Model | vs. realtime | 10-min video ≈ |
|---|---|---|
| Tiny | ~10× | ~1 min |
| Base | ~7× | ~1.5 min |
| Small ⭐ | ~4× | ~2.5 min |
| Medium | ~2× | ~5 min |
| Large V3 | ~1× | ~10 min |

### 📤 Export Formats

**TXT** (plain text / with timestamps), **SRT** (standard subtitles, ready for video editors), **JSON** (structured data for further processing) — one-click export via native save dialogs.

### More Highlights

- **Works without captions** — when official captions are missing, it automatically falls back to local AI speech recognition
- **Zero setup** — installers bundle a transcription model and ffmpeg, so it works offline right after install
- **Batch processing** — queue multiple links and let it churn through them

## Features

| Feature | Details |
|---|---|
| 🎯 Single video | Paste link → preview → one click to captions or AI transcription |
| 🤖 Local AI transcription | 5 model tiers to balance speed and accuracy |
| 📦 Batch queue | Process multiple links with live progress (speed / ETA / per-segment) |
| 🗂 History | Local database of all transcripts with keyword search |
| 📤 Export | TXT / SRT / JSON via native save dialogs |
| 🔍 In-transcript search | Quick locate, copy as plain text or with timestamps |
| 🌐 Bilingual UI | English / 中文 one-click switch |
| 🧩 Chrome extension | View transcripts in a YouTube side panel (optional) |

## Download

| Your device | Pick this file | Notes |
|---|---|---|
| Mac (Apple Silicon) | `YouTube Transcript_2.0.0_small_aarch64.dmg` | **Recommended** — balanced speed & accuracy |
| Mac (Apple Silicon) | `..._tiny_aarch64.dmg` | Faster, lighter |
| Intel Mac | `..._small_x86_64.dmg` / `..._tiny_x86_64.dmg` | Older Intel Macs |
| Windows 10 / 11 | `YouTube Transcript_2.0.0_small_setup.exe` | Same as above |

Download the latest version from the [Releases page](https://github.com/WooZH/youtube-transcript/releases).

Every installer bundles a transcription model and ffmpeg — **no extra dependencies required**.

> First-launch warning: right-click the app → **Open** (macOS Gatekeeper), or click "More info → Run anyway" (Windows SmartScreen).

## Quick Start

1. **Paste a link** into the input box
2. **Confirm the video** via thumbnail preview
3. **Get the text** — captions are fetched automatically; if none exist, hit "Local transcription" and copy or export the result

## Choosing a Model

| Model | Size | Speed | Accuracy | Best for |
|---|---|---|---|---|
| Tiny | 75 MB | ★★★★★ | ★★ | Quick previews, low-end machines |
| Base | 142 MB | ★★★★ | ★★★ | Everyday light use |
| **Small** ⭐ | 464 MB | ★★★ | ★★★★ | **The sweet spot for most people** |
| Medium | 1.5 GB | ★★ | ★★★★ | Higher accuracy |
| Large V3 | 3 GB | ★ | ★★★★★ | Accuracy-first, professional use |

Switch models anytime in the app; non-bundled models download automatically on first use.

## FAQ

**Does it need internet?**
Fetching captions and audio does (the videos live on YouTube); AI transcription itself is fully offline.

**Is my content uploaded anywhere?**
No. Audio is downloaded to a local temp folder, transcribed on-device, and cleaned up afterwards.

**What if a video has no captions?**
The app detects this and offers one-click local AI transcription instead.

**Anything else to install on Mac?**
Nothing. ffmpeg and a transcription model are bundled. (Only building from source requires a system ffmpeg.)

---

## For Developers

<details>
<summary>Architecture</summary>

```
React frontend (src/)
    │  Tauri invoke + events
    ▼
Rust backend (src-tauri/)        Chrome extension (apps/extension/)
    │  JSON Lines                     │  HTTP (127.0.0.1:18923)
    ▼  stdin/stdout subprocess        ▼
Python worker (worker/)  ←──────────┘
  ├─ yt-dlp        audio download / caption scraping
  └─ pywhispercpp  local Whisper transcription
```

**Stack**: React 19 + TypeScript + Vite 8 ｜ Tauri 2 (Rust: tokio / rusqlite / rfd) ｜ Python 3 (yt-dlp / pywhispercpp) ｜ Chrome Extension MV3

</details>

<details>
<summary>Development</summary>

Prerequisites: Node.js + npm, Rust toolchain, Python 3, ffmpeg. Python deps live in `worker/.venv` (preferred by the app).

```bash
npm install
npm run dev            # frontend only (Vite)
npm run tauri dev      # full desktop app in dev mode
npm run lint           # oxlint
npm run build          # frontend production build

# Chrome extension (separate package.json in apps/extension)
cd apps/extension && npm install && npm run build
```

</details>

<details>
<summary>Packaging & Distribution</summary>

| Target | Command | Output |
|---|---|---|
| Apple Silicon (arm64) | `./build-app.sh tiny small` | One DMG per model variant |
| Intel Mac (x86_64) | `TARGET=x86_64-apple-darwin ./build-app.sh small` | x86_64 DMG |
| Windows | GitHub Actions (manual dispatch) | NSIS installer (.exe) |

- Intel builds need Rosetta 2 and an x86_64 virtualenv:
  ```bash
  arch -x86_64 /usr/bin/python3 -m venv worker/.venv-x86_64
  arch -x86_64 worker/.venv-x86_64/bin/pip install -r worker/requirements.txt
  ```
- Windows builds run on GitHub Actions: Actions → **Build Windows Installer** → Run workflow → pick a model → download the artifact
- Build scripts read local models from `~/Library/Application Support/YouTube Transcript/models/whisper-cpp/`. To fetch one manually:
  ```bash
  curl -L -o "$HOME/Library/Application Support/YouTube Transcript/models/whisper-cpp/ggml-tiny.bin" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
  ```

</details>

<details>
<summary>Local HTTP API & Data Locations</summary>

The desktop app serves a local transcription API on `127.0.0.1:18923` (used by the Chrome extension and other tools):

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `POST /api/transcribe` | Start a transcription job, returns requestId |
| `GET /api/progress/{id}` | Poll job progress |
| `POST /api/cancel/{id}` | Cancel a job |

Data locations (macOS):

- Settings & database: `~/Library/Application Support/com.youtube-transcript.desktop/`
- Whisper models: `~/Library/Application Support/YouTube Transcript/models/whisper-cpp/`
- Transcription temp files: `~/Library/Caches/YouTube Transcript/jobs/`

</details>
