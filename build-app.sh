#!/bin/bash
set -e

cd /Users/zhiheng/youtube-transcript

# Step 1: Build the Tauri app (no worker in bundle)
npx tauri build

# Step 2: Copy worker + venv into the .app bundle
APP_DIR="/Users/zhiheng/youtube-transcript/src-tauri/target/release/bundle/macos/YouTube Transcript.app"
RESOURCES="$APP_DIR/Contents/Resources"
WORKER="/Users/zhiheng/youtube-transcript/worker"

echo "Copying worker to app bundle..."
mkdir -p "$RESOURCES/worker"
cp "$WORKER/main.py" "$RESOURCES/worker/"
cp "$WORKER/captions.py" "$RESOURCES/worker/"
cp "$WORKER/whisper.py" "$RESOURCES/worker/"
cp "$WORKER/requirements.txt" "$RESOURCES/worker/"
cp -R "$WORKER/.venv" "$RESOURCES/worker/.venv"

# Step 3: Rebuild DMG with updated .app
echo "Rebuilding DMG..."
DMG_DIR="/Users/zhiheng/youtube-transcript/src-tauri/target/release/bundle/dmg"
DMG_NAME="YouTube Transcript_0.1.0_aarch64.dmg"
rm -f "$DMG_DIR/$DMG_NAME"

hdiutil create -volname "YouTube Transcript" \
  -srcfolder "$APP_DIR" \
  -ov -format UDZO \
  "$DMG_DIR/$DMG_NAME"

echo "Build complete!"
echo "  .app: $APP_DIR"
echo "  .dmg: $DMG_DIR/$DMG_NAME"
echo "  Size: $(du -sh "$DMG_DIR/$DMG_NAME" | cut -f1)"
