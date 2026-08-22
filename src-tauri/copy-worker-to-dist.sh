#!/bin/bash
DIST_DIR="/Users/zhiheng/youtube-transcript/dist"
WORKER_DIR="/Users/zhiheng/youtube-transcript/worker"

mkdir -p "$DIST_DIR/worker"
cp "$WORKER_DIR/main.py" "$DIST_DIR/worker/"
cp "$WORKER_DIR/captions.py" "$DIST_DIR/worker/"
cp "$WORKER_DIR/whisper.py" "$DIST_DIR/worker/"
cp -R "$WORKER_DIR/.venv" "$DIST_DIR/worker/.venv"

echo "Worker copied to dist: $(du -sh "$DIST_DIR/worker" | cut -f1)"
