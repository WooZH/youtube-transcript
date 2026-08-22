#!/bin/bash
# Copy ONLY the lightweight worker sources into dist (embedded into app
# binary by Tauri). Do NOT copy .venv or whisper models here — large files
# belong in the .app's Contents/Resources, which build-app.sh copies after
# `tauri build`. Embedding models/venv would bloat the binary by hundreds
# of MB and force every build variant to carry all models.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
WORKER_DIR="$ROOT_DIR/worker"

mkdir -p "$DIST_DIR/worker"
cp "$WORKER_DIR/main.py" "$DIST_DIR/worker/"
cp "$WORKER_DIR/captions.py" "$DIST_DIR/worker/"
cp "$WORKER_DIR/whisper.py" "$DIST_DIR/worker/"

echo "Worker sources copied to dist: $(ls "$DIST_DIR/worker/")"
