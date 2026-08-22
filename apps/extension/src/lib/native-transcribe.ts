import type { Transcript } from "../types/transcript";

const API_BASE = "http://127.0.0.1:18923";

export interface ProgressUpdate {
  stage: string;
  progress: number;
}

export interface TranscribeOptions {
  url: string;
  onProgress?: (update: ProgressUpdate) => void;
  onResult?: (transcript: Transcript) => void;
  onError?: (error: string) => void;
  onCancelled?: () => void;
}

let activeRequestId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function isNativeHostAvailable(): boolean {
  return true;
}

function cleanup() {
  activeRequestId = null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function transcribeLocally(options: TranscribeOptions): { cancel: () => void } {
  const { url, onProgress, onResult, onError, onCancelled } = options;

  if (activeRequestId) {
    onError?.("Another local transcription is currently running.");
    return { cancel: () => {} };
  }

  // Check if Tauri app is running
  fetch(`${API_BASE}/api/health`)
    .then((r) => {
      if (!r.ok) throw new Error("not ok");
      return r.json();
    })
    .then(() => {
      // Start transcription
      return fetch(`${API_BASE}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    })
    .then((r) => r.json())
    .then((data: { requestId?: string; error?: string }) => {
      if (data.error) {
        onError?.(data.error);
        return;
      }

      const requestId = data.requestId;
      if (!requestId) {
        onError?.("No request ID returned.");
        return;
      }

      activeRequestId = requestId;
      onProgress?.({ stage: "preparing", progress: 0 });

      // Poll for progress
      pollTimer = setInterval(() => {
        if (!activeRequestId) {
          clearInterval(pollTimer!);
          return;
        }

        fetch(`${API_BASE}/api/progress/${requestId}`)
          .then((r) => r.json())
          .then((status: { stage?: string; progress?: number; result?: Transcript; error?: string }) => {
            if (status.error) {
              cleanup();
              onError?.(status.error);
            } else if (status.result) {
              cleanup();
              onResult?.(status.result);
            } else if (status.stage) {
              onProgress?.({
                stage: status.stage,
                progress: status.progress || 0,
              });
            }
          })
          .catch(() => {
            // Tauri app may have stopped
          });
      }, 1000);
    })
    .catch(() => {
      onError?.("Local transcription requires the YouTube Transcript app to be running. Start it with: npm run tauri dev");
    });

  return {
    cancel() {
      if (activeRequestId) {
        fetch(`${API_BASE}/api/cancel/${activeRequestId}`, { method: "POST" }).catch(() => {});
      }
      cleanup();
      onCancelled?.();
    },
  };
}
