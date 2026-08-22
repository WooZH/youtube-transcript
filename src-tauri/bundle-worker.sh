#!/bin/bash
RESOURCE_DIR="$1"
WORKER_DIR="/Users/zhiheng/youtube-transcript/worker"

if [ -z "$RESOURCE_DIR" ]; then
    echo "Usage: bundle-worker.sh <resource_dir>"
    exit 1
fi

mkdir -p "$RESOURCE_DIR/worker"
cp "$WORKER_DIR/main.py" "$RESOURCE_DIR/worker/"
cp "$WORKER_DIR/captions.py" "$RESOURCE_DIR/worker/"
cp "$WORKER_DIR/whisper.py" "$RESOURCE_DIR/worker/"
cp -R "$WORKER_DIR/.venv" "$RESOURCE_DIR/worker/.venv"

echo "Worker bundled: $(du -sh "$RESOURCE_DIR/worker" | cut -f1)"
