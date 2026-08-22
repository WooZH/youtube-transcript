"""
Local Whisper Transcription Module
Handles audio download and transcription using whisper.cpp (pywhispercpp).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Optional


def get_yt_dlp_cmd():
    """Get the yt-dlp command."""
    import shutil as shutil_mod
    yt_dlp_path = shutil_mod.which("yt-dlp")
    if yt_dlp_path:
        return [yt_dlp_path]
    return [sys.executable, "-m", "yt_dlp"]


def get_cache_dir() -> Path:
    """Get the cache directory for temporary files."""
    cache_dir = Path.home() / "Library" / "Caches" / "YouTube Transcript" / "jobs"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def get_models_dir() -> Path:
    """Get the models directory."""
    models_dir = Path.home() / "Library" / "Application Support" / "YouTube Transcript" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    return models_dir


def download_audio(url: str, job_id: str, progress_callback=None) -> Path:
    """
    Download audio from YouTube using yt-dlp.
    
    Returns path to the downloaded audio file.
    """
    job_dir = get_cache_dir() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    output_template = str(job_dir / "audio.%(ext)s")
    
    yt_dlp_cmd = get_yt_dlp_cmd()
    cmd = yt_dlp_cmd + [
        "-x",
        "--audio-format", "wav",
        "--audio-quality", "0",
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-N", "10",
        "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
        "-o", output_template,
        url,
    ]
    
    import time
    start_time = time.monotonic()
    last_speed = ""
    
    try:
        import re
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        
        last_percent = -1
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                match = re.search(r'(\d+\.?\d*)%', line)
                speed_match = re.search(r'at\s+([\d.]+\w+/s)', line)
                if speed_match:
                    last_speed = speed_match.group(1)
                if match:
                    percent = float(match.group(1))
                    elapsed = time.monotonic() - start_time
                    if percent > 0:
                        eta = elapsed / percent * (100 - percent)
                    else:
                        eta = 0
                    if percent != last_percent and progress_callback:
                        progress_callback("downloading", percent, {
                            "elapsed_s": round(elapsed, 1),
                            "eta_s": round(eta, 1),
                            "speed": last_speed,
                        })
                        last_percent = percent
        
        process.wait()
        
        if process.returncode != 0:
            stderr_output = process.stderr.read() if process.stderr else ""
            raise Exception(f"yt-dlp failed: {stderr_output}")
        
        audio_file = job_dir / "audio.wav"
        if audio_file.exists():
            return audio_file
        
        for f in job_dir.glob("audio.*"):
            if f.suffix in ['.wav', '.mp3', '.m4a', '.ogg', '.opus']:
                return f
        
        raise Exception("Audio file not found after download")
        
    except subprocess.TimeoutExpired:
        raise Exception("Download timed out")
    except Exception as e:
        cleanup_job_dir(job_id)
        raise


def get_audio_duration(audio_path: Path) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(audio_path)],
            capture_output=True, text=True, timeout=10,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def transcribe_audio(
    audio_path: Path,
    model_name: str = "small",
    language: Optional[str] = None,
    progress_callback=None,
) -> dict:
    """
    Transcribe audio using whisper.cpp (pywhispercpp).

    Returns dict with segments and metadata.
    """
    try:
        from pywhispercpp.model import Model
    except ImportError:
        raise Exception("pywhispercpp is not installed")

    models_dir = get_models_dir() / "whisper-cpp"
    models_dir.mkdir(parents=True, exist_ok=True)

    if progress_callback:
        progress_callback("loading-model", 0)

    try:
        model = Model(model_name, models_dir=str(models_dir))
    except Exception as e:
        raise Exception(f"Unable to load the Whisper model: {e}")

    if progress_callback:
        progress_callback("loading-model", 100)

    total_duration = get_audio_duration(audio_path)

    if progress_callback:
        progress_callback("transcribing", 0)

    try:
        detected_language = None
        if not language or language == "auto":
            lang_result, _ = model.auto_detect_language(str(audio_path))
            detected_language = lang_result[0] if lang_result else "en"

        last_progress = [0.0]

        def on_new_segment(seg):
            if progress_callback and total_duration > 0:
                progress = min(99.0, (seg.t1 / 100.0 / total_duration) * 100)
                if progress - last_progress[0] >= 1.0:
                    last_progress[0] = progress
                    progress_callback("transcribing", progress)

        segments_raw = model.transcribe(
            str(audio_path),
            language=language if language and language != "auto" else None,
            new_segment_callback=on_new_segment,
        )

        if progress_callback:
            progress_callback("transcribing", 100)

        if not detected_language:
            detected_language = "en"

        segments = []
        for i, seg in enumerate(segments_raw):
            start_s = seg.t0 / 100.0
            end_s = seg.t1 / 100.0
            segments.append({
                "id": i,
                "start": round(start_s, 2),
                "end": round(end_s, 2),
                "text": seg.text.strip(),
            })

        if progress_callback:
            progress_callback("processing", 100)

        text = "\n\n".join(seg["text"] for seg in segments)

        return {
            "language": detected_language,
            "segments": segments,
            "text": text,
        }

    except Exception as e:
        raise Exception(f"Transcription failed: {e}")


def cleanup_job_dir(job_id: str):
    """Clean up temporary files for a job."""
    job_dir = get_cache_dir() / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)


def handle_transcribe(message: dict, cancel_event=None) -> dict:
    """
    Handle the transcribe action.
    
    Args:
        message: The action message with url, model, language
        cancel_event: Optional threading.Event to check for cancellation
    
    Returns:
        Result dict to send back
    """
    job_id = message.get("jobId", str(uuid.uuid4()))
    url = message.get("url", "")
    model = message.get("model", "small")
    language = message.get("language", "auto")
    
    if not url:
        return {"type": "error", "message": "No URL provided"}
    
    try:
        if cancel_event and cancel_event.is_set():
            return {"type": "cancelled", "action": "transcribe", "jobId": job_id}
        
        def progress_callback(stage, progress):
            pass
        
        audio_path = download_audio(url, job_id, progress_callback)
        
        if cancel_event and cancel_event.is_set():
            cleanup_job_dir(job_id)
            return {"type": "cancelled", "action": "transcribe", "jobId": job_id}
        
        result = transcribe_audio(
            audio_path,
            model_name=model,
            language=language if language != "auto" else None,
            progress_callback=progress_callback,
        )
        
        cleanup_job_dir(job_id)
        
        return {
            "type": "result",
            "action": "transcribe",
            "data": {
                "jobId": job_id,
                "source": "whisper",
                "language": result["language"],
                "segments": result["segments"],
                "text": result["text"],
            },
        }
        
    except Exception as e:
        cleanup_job_dir(job_id)
        error_msg = str(e)
        if "timed out" in error_msg.lower():
            return {"type": "error", "message": "Download timed out. Please try again."}
        elif "not installed" in error_msg.lower():
            return {"type": "error", "message": "Local transcription is not available on this Mac."}
        elif "model" in error_msg.lower():
            return {"type": "error", "message": "Unable to load the Whisper model."}
        elif "download" in error_msg.lower():
            return {"type": "error", "message": "Unable to download audio from YouTube."}
        else:
            return {"type": "error", "message": "Transcription failed."}
