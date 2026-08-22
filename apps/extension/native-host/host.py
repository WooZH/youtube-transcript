#!/usr/bin/env python3
"""
Chrome Native Messaging Host for YouTube Transcript.
Bridges Chrome ↔ existing Python worker infrastructure.

Protocol: Chrome Native Messaging (4-byte length prefix + JSON over stdin/stdout).
stdout is RESERVED for Chrome messages only. All logging goes to stderr or log file.
"""

import json
import os
import struct
import subprocess
import sys
import threading
import uuid
from pathlib import Path

PROTOCOL_VERSION = 1
HOST_NAME = "com.youtube-transcript.host"

LOG_DIR = Path.home() / "Library" / "Logs" / "YouTube Transcript"
DEBUG = os.environ.get("YT_TRANSCRIPT_DEBUG", "0") == "1"

_log_file = None


def _get_log_file():
    global _log_file
    if _log_file is None:
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            _log_file = open(LOG_DIR / "native-host.log", "a", encoding="utf-8")
        except Exception:
            _log_file = False
    return _log_file if _log_file is not False else None


def log(msg: str):
    """Log to file (always) and stderr (if debug)."""
    f = _get_log_file()
    if f:
        import datetime
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"[{ts}] {msg}\n")
        f.flush()
    if DEBUG:
        sys.stderr.write(f"[native-host] {msg}\n")
        sys.stderr.flush()


def send_message(msg: dict):
    """Send a length-prefixed JSON message to Chrome via stdout."""
    encoded = json.dumps(msg, ensure_ascii=False).encode("utf-8")
    length = struct.pack("<I", len(encoded))
    sys.stdout.buffer.write(length)
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def read_message() -> dict | None:
    """Read a length-prefixed JSON message from Chrome via stdin."""
    length_bytes = sys.stdin.buffer.read(4)
    if not length_bytes or len(length_bytes) < 4:
        return None
    length = struct.unpack("<I", length_bytes)[0]
    if length == 0:
        return None
    if length > 10 * 1024 * 1024:
        log(f"Message too large: {length} bytes")
        return None
    data = sys.stdin.buffer.read(length)
    if len(data) < length:
        return None
    return json.loads(data.decode("utf-8"))


def validate_youtube_url(url: str) -> bool:
    """Validate that the URL is a YouTube URL."""
    if not url:
        return False
    allowed = [
        "youtube.com/watch",
        "www.youtube.com/watch",
        "youtube.com/shorts/",
        "www.youtube.com/shorts/",
        "youtu.be/",
    ]
    return any(f"https://{prefix}" in url or f"http://{prefix}" in url for prefix in allowed)


def get_worker_path() -> str | None:
    """Find the existing Python worker."""
    host_dir = Path(__file__).resolve().parent
    project_root = host_dir.parent.parent.parent

    candidates = [
        project_root / "worker" / "main.py",
        Path.cwd() / "worker" / "main.py",
        Path.cwd().parent / "worker" / "main.py",
    ]

    for path in candidates:
        if path.exists():
            return str(path)

    return None


def get_python_path() -> str:
    """Find Python with the worker's venv."""
    host_dir = Path(__file__).resolve().parent
    project_root = host_dir.parent.parent.parent

    candidates = [
        project_root / "worker" / ".venv" / "bin" / "python3",
        Path.cwd() / "worker" / ".venv" / "bin" / "python3",
        Path.cwd().parent / "worker" / "/.venv" / "bin" / "python3",
    ]

    for path in candidates:
        if path.exists():
            return str(path)

    return "python3"


def send_error(request_id: str, code: str, message: str):
    """Send an error response to Chrome."""
    send_message({
        "version": PROTOCOL_VERSION,
        "type": "error",
        "requestId": request_id,
        "code": code,
        "message": message,
    })


def send_progress(request_id: str, stage: str, progress: float):
    """Send a progress response to Chrome."""
    send_message({
        "version": PROTOCOL_VERSION,
        "type": "progress",
        "requestId": request_id,
        "stage": stage,
        "progress": progress,
    })


def send_result(request_id: str, data: dict):
    """Send a result response to Chrome."""
    send_message({
        "version": PROTOCOL_VERSION,
        "type": "result",
        "requestId": request_id,
        "data": data,
    })


def send_cancelled(request_id: str):
    """Send a cancelled response to Chrome."""
    send_message({
        "version": PROTOCOL_VERSION,
        "type": "cancelled",
        "requestId": request_id,
    })


class TranscriptionSession:
    """Manages a single transcription session with the Python worker."""

    def __init__(self, request_id: str, url: str):
        self.request_id = request_id
        self.url = url
        self.process: subprocess.Popen | None = None
        self.cancelled = False
        self.lock = threading.Lock()

    def start(self):
        """Start the transcription by spawning the worker."""
        worker_path = get_worker_path()
        if not worker_path:
            send_error(self.request_id, "WORKER_NOT_FOUND", "Local transcription is unavailable.")
            return

        python_path = get_python_path()
        job_id = str(uuid.uuid4())

        log(f"Starting transcription: request={self.request_id} url={self.url} worker={worker_path}")

        try:
            self.process = subprocess.Popen(
                [python_path, worker_path, "--mode", "worker"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=False,
            )
        except Exception as e:
            log(f"Failed to start worker: {e}")
            send_error(self.request_id, "NATIVE_HOST_ERROR", "Local transcription is unavailable.")
            return

        request = {
            "action": "transcribe",
            "url": self.url,
            "model": "small",
            "language": "auto",
            "jobId": job_id,
        }

        try:
            request_json = json.dumps(request) + "\n"
            self.process.stdin.write(request_json.encode("utf-8"))
            self.process.stdin.flush()
            self.process.stdin.close()
        except Exception as e:
            log(f"Failed to write request: {e}")
            self._cleanup()
            send_error(self.request_id, "NATIVE_HOST_ERROR", "Local transcription is unavailable.")
            return

        reader_thread = threading.Thread(target=self._read_output, daemon=True)
        reader_thread.start()

        stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        stderr_thread.start()

    def cancel(self):
        """Cancel the transcription."""
        with self.lock:
            self.cancelled = True
            if self.process:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

    def _read_output(self):
        """Read worker output and forward to Chrome."""
        try:
            for raw_line in self.process.stdout:
                if self.cancelled:
                    return

                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")

                if msg_type == "progress":
                    stage = msg.get("stage", "")
                    progress = msg.get("progress", 0)
                    send_progress(self.request_id, stage, progress)

                elif msg_type == "result":
                    data = msg.get("data", {})
                    result = {
                        "videoId": data.get("videoId", ""),
                        "title": data.get("title", ""),
                        "channel": data.get("channel", ""),
                        "duration": data.get("duration", 0),
                        "language": data.get("language", ""),
                        "source": "whisper",
                        "segments": data.get("segments", []),
                        "text": data.get("text", ""),
                    }
                    send_result(self.request_id, result)

                elif msg_type == "error":
                    error_msg = msg.get("message", "Transcription failed.")
                    send_error(self.request_id, "TRANSCRIPTION_FAILED", error_msg)

        except Exception as e:
            log(f"Error reading output: {e}")
            if not self.cancelled:
                send_error(self.request_id, "NATIVE_HOST_ERROR", "Local transcription is unavailable.")
        finally:
            self._cleanup()

    def _drain_stderr(self):
        """Drain stderr to prevent blocking."""
        try:
            for line in self.process.stderr:
                log(f"[worker] {line.decode('utf-8', errors='replace').strip()}")
        except Exception:
            pass

    def _cleanup(self):
        """Clean up the process."""
        try:
            if self.process and self.process.poll() is None:
                self.process.kill()
                self.process.wait(timeout=5)
        except Exception:
            pass
        self.process = None


def handle_transcribe(request: dict):
    """Handle a transcribe request."""
    request_id = request.get("requestId", "")
    url = request.get("url", "")

    if not validate_youtube_url(url):
        send_error(request_id, "INVALID_YOUTUBE_URL", "Invalid YouTube URL.")
        return None

    session = TranscriptionSession(request_id, url)
    session.start()
    return session


def main():
    """Main entry point. Reads Chrome messages and dispatches."""
    log(f"Native host started (pid={os.getpid()})")

    active_sessions: dict[str, TranscriptionSession] = {}

    while True:
        try:
            request = read_message()
        except Exception:
            break

        if request is None:
            break

        version = request.get("version", 0)
        msg_type = request.get("type", "")
        request_id = request.get("requestId", "")

        if version != PROTOCOL_VERSION:
            send_error(request_id, "INVALID_REQUEST", f"Unsupported protocol version: {version}")
            continue

        if msg_type == "transcribe":
            if active_sessions:
                send_error(request_id, "TRANSCRIPTION_BUSY", "Another local transcription is currently running. Please wait until it finishes.")
                continue

            session = handle_transcribe(request)
            if session:
                active_sessions[request_id] = session

        elif msg_type == "cancel":
            session = active_sessions.pop(request_id, None)
            if session:
                session.cancel()
                send_cancelled(request_id)

        else:
            send_error(request_id, "INVALID_REQUEST", f"Unknown message type: {msg_type}")

    for session in active_sessions.values():
        session.cancel()

    log("Native host exiting")


if __name__ == "__main__":
    main()
