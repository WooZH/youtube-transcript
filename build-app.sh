#!/bin/bash
# Build YouTube Transcript DMG(s), one per Whisper model variant.
#
# Usage:
#   ./build-app.sh                              # arm64 (Apple Silicon), small model
#   ./build-app.sh tiny small                   # one DMG per listed model
#   TARGET=x86_64-apple-darwin ./build-app.sh   # Intel Mac build
#                                               # requires Rosetta 2 + worker/.venv-x86_64
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="YouTube Transcript"
VERSION=$(grep -m1 '"version"' src-tauri/tauri.conf.json | cut -d'"' -f4)

TARGET="${TARGET:-}"
if [ -n "$TARGET" ]; then
  TAURI_TARGET_ARGS=(--target "$TARGET")
  BUNDLE_DIR="src-tauri/target/$TARGET/release/bundle"
  ARCH="${TARGET%%-*}"          # e.g. x86_64
  VENV_DIR="worker/.venv-x86_64"
else
  TAURI_TARGET_ARGS=()
  BUNDLE_DIR="src-tauri/target/release/bundle"
  ARCH="aarch64"
  VENV_DIR="worker/.venv"
fi

BASE_APP="$BUNDLE_DIR/macos/$APP_NAME.app"
OUT_DIR="$BUNDLE_DIR/dmg"
MODEL_SRC="$HOME/Library/Application Support/YouTube Transcript/models/whisper-cpp"

MODELS=("$@")
if [ ${#MODELS[@]} -eq 0 ]; then
  MODELS=(small)
fi

# Verify requested models exist locally before building
for m in "${MODELS[@]}"; do
  if [ ! -f "$MODEL_SRC/ggml-$m.bin" ]; then
    echo "ERROR: model not found: $MODEL_SRC/ggml-$m.bin" >&2
    echo "Download it first, e.g.:" >&2
    echo "  curl -L -o '$MODEL_SRC/ggml-$m.bin' 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$m.bin'" >&2
    exit 1
  fi
done

if [ ! -d "$VENV_DIR" ]; then
  echo "ERROR: python venv not found at $VENV_DIR" >&2
  exit 1
fi

# Static ffmpeg for the target arch (bundled so end users need no setup)
FFMPEG_CACHE=".ffmpeg-cache"
mkdir -p "$FFMPEG_CACHE"
case "$ARCH" in
  aarch64) FF_NAME="ffmpeg-darwin-arm64.gz" ;;
  x86_64)  FF_NAME="ffmpeg-darwin-x64.gz" ;;
  *) echo "ERROR: no ffmpeg build known for arch $ARCH" >&2; exit 1 ;;
esac
FF_GZ="$FFMPEG_CACHE/$FF_NAME"
if [ ! -f "$FF_GZ" ]; then
  echo "Downloading static ffmpeg ($FF_NAME)..."
  curl -fL --retry 3 -o "$FF_GZ" \
    "https://github.com/eugeneware/ffmpeg-static/releases/latest/download/$FF_NAME"
fi

echo "Building v$VERSION ($ARCH) with variants: ${MODELS[*]}"

# Step 1: Build the Tauri app once (binary is identical for all variants)
npx tauri build ${TAURI_TARGET_ARGS[@]+"${TAURI_TARGET_ARGS[@]}"}

if [ ! -d "$BASE_APP" ]; then
  echo "ERROR: built app not found at $BASE_APP" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Step 2: Produce one .app + DMG per model variant
for m in "${MODELS[@]}"; do
  echo ""
  echo "=== Packaging variant: $m ==="
  VARIANT_APP="$OUT_DIR/$APP_NAME.app"
  rm -rf "$VARIANT_APP"
  cp -R "$BASE_APP" "$VARIANT_APP"

  RES="$VARIANT_APP/Contents/Resources/worker"
  mkdir -p "$RES/models/whisper-cpp" "$RES/bin"
  cp worker/main.py worker/captions.py worker/whisper.py worker/requirements.txt "$RES/"
  cp -R "$VENV_DIR" "$RES/.venv"
  cp "$MODEL_SRC/ggml-$m.bin" "$RES/models/whisper-cpp/"
  gunzip -c "$FF_GZ" > "$RES/bin/ffmpeg"
  chmod +x "$RES/bin/ffmpeg"

  DMG="$OUT_DIR/${APP_NAME}_${VERSION}_${m}_${ARCH}.dmg"
  rm -f "$DMG"
  hdiutil create -volname "$APP_NAME" \
    -srcfolder "$VARIANT_APP" \
    -ov -format UDZO \
    "$DMG"

  echo "Built: $DMG ($(du -sh "$DMG" | cut -f1))"
  rm -rf "$VARIANT_APP"
done

echo ""
echo "Build complete! arch=$ARCH variants: ${MODELS[*]}"
