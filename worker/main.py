#!/usr/bin/env python3
"""
YouTube Transcript Python Worker
Communicates via JSON Lines on stdin/stdout.
"""

import json
import sys
import signal
import threading
from typing import Optional


def send_message(msg: dict):
    """Send a JSON message to stdout."""
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def send_progress(stage: str, progress: float):
    """Send progress update."""
    send_message({"type": "progress", "stage": stage, "progress": progress})


def send_result(data: dict):
    """Send result."""
    send_message({"type": "result", "data": data})


def send_error(message: str):
    """Send error."""
    send_message({"type": "error", "message": message})


def handle_test(message: dict):
    """Handle test action."""
    original = message.get("message", "")
    send_result({"message": f"Worker received: {original}"})
    return True


def handle_get_video_info(message: dict):
    """Handle get_video_info action using yt-dlp."""
    url = message.get("url", "")

    if not url:
        send_error("No URL provided")
        return True

    send_progress("fetching-metadata", 10)

    try:
        import subprocess
        import shutil

        yt_dlp_path = shutil.which("yt-dlp")
        if not yt_dlp_path:
            yt_dlp_cmd = [sys.executable, "-m", "yt_dlp"]
        else:
            yt_dlp_cmd = [yt_dlp_path]

        result = subprocess.run(
            yt_dlp_cmd + ["--dump-single-json", "--no-download", url],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            if "Video unavailable" in stderr or "Private video" in stderr:
                send_error("This video is unavailable.")
            elif "Video not found" in stderr:
                send_error("This video is unavailable.")
            elif "Unable to download" in stderr or "Network" in stderr:
                send_error("Unable to connect to YouTube.")
            else:
                send_error("Unable to retrieve video information.")
            return True

        import json as json_mod
        info = json_mod.loads(result.stdout)

        send_progress("fetching-metadata", 100)

        send_result({
            "action": "get_video_info",
            "data": {
                "id": info.get("id", ""),
                "title": info.get("title", ""),
                "channel": info.get("channel", info.get("uploader", "")),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "language": info.get("language", ""),
            },
        })
        return True

    except subprocess.TimeoutExpired:
        send_error("Request timed out. Please try again.")
        return True
    except Exception as e:
        send_error("Unable to retrieve video information.")
        return True


def handle_get_captions(message: dict):
    """Handle get_captions action."""
    url = message.get("url", "")
    language = message.get("language", "auto")

    if not url:
        send_error("No URL provided")
        return True

    send_progress("fetching-captions", 10)

    try:
        from captions import fetch_captions

        send_progress("fetching-captions", 30)
        result = fetch_captions(url, language)

        send_progress("fetching-captions", 100)

        send_result({
            "action": "get_captions",
            "data": result,
        })
        return True

    except Exception as e:
        send_error("Unable to parse the available captions.")
        return True


def handle_transcribe(message: dict):
    """Handle transcribe action using local Whisper."""
    url = message.get("url", "")
    model = message.get("model", "small")
    language = message.get("language", "auto")
    job_id = message.get("jobId", "")

    if not url:
        send_error("No URL provided")
        return True

    send_progress("preparing", 0)

    try:
        from whisper import download_audio, transcribe_audio, cleanup_job_dir

        title = ""
        try:
            import subprocess, shutil, json as json_mod
            yt_dlp_path = shutil.which("yt-dlp")
            yt_dlp_cmd = [yt_dlp_path] if yt_dlp_path else [sys.executable, "-m", "yt_dlp"]
            info_result = subprocess.run(
                yt_dlp_cmd + ["--dump-single-json", "--no-download", url],
                capture_output=True, text=True, timeout=30,
            )
            if info_result.returncode == 0:
                info = json_mod.loads(info_result.stdout)
                title = info.get("title", "")
        except Exception:
            pass

        send_progress("downloading", 0)

        def progress_callback(stage, progress, extra=None):
            msg = {"type": "progress", "stage": stage, "progress": progress}
            if extra:
                msg["extra"] = extra
            send_message(msg)

        audio_path = download_audio(url, job_id, progress_callback=progress_callback)

        send_progress("downloading", 100)

        result = transcribe_audio(
            audio_path,
            model_name=model,
            language=language if language != "auto" else None,
            progress_callback=progress_callback,
        )

        cleanup_job_dir(job_id)

        send_result({
            "action": "transcribe",
            "data": {
                "jobId": job_id,
                "title": title,
                "source": "whisper",
                "language": result["language"],
                "segments": result["segments"],
                "text": result["text"],
            },
        })
        return True

    except Exception as e:
        from whisper import cleanup_job_dir
        cleanup_job_dir(job_id)
        error_msg = str(e)
        if "timed out" in error_msg.lower():
            send_error("Download timed out. Please try again.")
        elif "not installed" in error_msg.lower():
            send_error("Local transcription is not available on this Mac.")
        elif "model" in error_msg.lower():
            send_error("Unable to load the Whisper model.")
        elif "download" in error_msg.lower():
            send_error("Unable to download audio from YouTube.")
        else:
            send_error("Transcription failed.")
        return True


def parse_vtt(content: str) -> list:
    """Parse VTT subtitle content into segments."""
    segments = []
    lines = content.split("\n")
    current_start = None
    current_end = None
    current_text = []

    for line in lines:
        line = line.strip()

        if "-->" in line:
            parts = line.split("-->")
            if len(parts) == 2:
                current_start = parse_vtt_time(parts[0].strip())
                current_end = parse_vtt_time(parts[1].strip())
                current_text = []
        elif line and not line.startswith("WEBVTT") and not line.startswith("Kind:") and not line.startswith("Language:"):
            if current_start is not None:
                clean_text = line.replace("<", "<").replace(">", ">")
                if clean_text:
                    current_text.append(clean_text)

        if current_start is not None and current_text and (not line or line == ""):
            segments.append({
                "id": len(segments),
                "start": current_start,
                "end": current_end or current_start,
                "text": " ".join(current_text),
            })
            current_start = None
            current_end = None
            current_text = []

    if current_start is not None and current_text:
        segments.append({
            "id": len(segments),
            "start": current_start,
            "end": current_end or current_start,
            "text": " ".join(current_text),
        })

    merged = []
    for seg in segments:
        if merged and seg["start"] - merged[-1]["end"] < 0.5:
            merged[-1]["end"] = seg["end"]
            merged[-1]["text"] += " " + seg["text"]
        else:
            merged.append(seg)

    for i, seg in enumerate(merged):
        seg["id"] = i

    return merged


def parse_vtt_time(time_str: str) -> float:
    """Parse VTT timestamp to seconds."""
    parts = time_str.replace(",", ".").split(":")
    if len(parts) == 3:
        hours = float(parts[0])
        minutes = float(parts[1])
        seconds = float(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    elif len(parts) == 2:
        minutes = float(parts[0])
        seconds = float(parts[1])
        return minutes * 60 + seconds
    return 0.0


def main():
    """Main worker loop."""
    mode = "worker"
    if len(sys.argv) >= 3 and sys.argv[1] == "--mode":
        mode = sys.argv[2]

    if mode == "test":
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
                if message.get("action") == "test":
                    handle_test(message)
                    break
            except json.JSONDecodeError:
                continue
        return

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
            action = message.get("action", "")

            if action == "get_video_info":
                should_exit = handle_get_video_info(message)
                if should_exit:
                    break
            elif action == "get_captions":
                should_exit = handle_get_captions(message)
                if should_exit:
                    break
            elif action == "transcribe":
                should_exit = handle_transcribe(message)
                if should_exit:
                    break
            elif action == "cancel":
                send_result({"message": "Cancelled"})
                break
            else:
                send_error(f"Unknown action: {action}")

        except json.JSONDecodeError as e:
            send_error(f"Invalid JSON: {e}")
        except Exception as e:
            send_error(f"Worker error: {e}")


if __name__ == "__main__":
    main()
