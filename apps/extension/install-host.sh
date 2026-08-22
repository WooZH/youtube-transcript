#!/bin/bash
# Install Chrome Native Messaging Host for YouTube Transcript (macOS)
#
# Usage:
#   ./install-host.sh                    # Install with dev extension ID
#   ./install-host.sh --extension-id ID  # Install with specific extension ID
#   ./install-host.sh --uninstall        # Remove the native host

set -euo pipefail

HOST_NAME="com.youtube-transcript.host"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/native-host/host.py"
MANIFEST_DIR="$SCRIPT_DIR"

# Default Chrome Native Messaging location on macOS
CHROME_NM_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Parse arguments
EXTENSION_ID=""
UNINSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --extension-id)
            EXTENSION_ID="$2"
            shift 2
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Uninstall mode
if $UNINSTALL; then
    echo "Uninstalling native messaging host..."
    rm -f "$CHROME_NM_DIR/$HOST_NAME.json"
    echo "Done. Host manifest removed."
    exit 0
fi

# Ensure host script exists
if [[ ! -f "$HOST_SCRIPT" ]]; then
    echo "Error: host.py not found at $HOST_SCRIPT"
    exit 1
fi

# Make host script executable
chmod +x "$HOST_SCRIPT"

# Create directory if needed
mkdir -p "$CHROME_NM_DIR"

# Default extension ID (development mode)
if [[ -z "$EXTENSION_ID" ]]; then
    EXTENSION_ID="placeholder-extension-id"
    echo "Note: Using placeholder extension ID. After loading the extension in Chrome,"
    echo "      re-run with: ./install-host.sh --extension-id <YOUR_EXTENSION_ID>"
    echo ""
    echo "      Find your extension ID at chrome://extensions"
fi

# Write manifest
MANIFEST="$CHROME_NM_DIR/$HOST_NAME.json"
cat > "$MANIFEST" <<EOF
{
    "name": "$HOST_NAME",
    "description": "YouTube Transcript - Local transcription bridge",
    "path": "$HOST_SCRIPT",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://$EXTENSION_ID/"
    ]
}
EOF

echo "Native messaging host installed:"
echo "  Manifest: $MANIFEST"
echo "  Host:     $HOST_SCRIPT"
echo "  Extension: chrome-extension://$EXTENSION_ID/"
echo ""
echo "Next steps:"
echo "  1. Load the extension in Chrome (chrome://extensions, Developer mode, Load unpacked)"
echo "  2. If using dev extension ID, re-run: ./install-host.sh --extension-id <ID>"
