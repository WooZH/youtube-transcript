import { useState, useCallback, useEffect, useRef } from "react";
import type { JobState, Transcript, VideoInfo } from "../types/transcript";
import {
  testWorker,
  getVideoInfo,
  getCaptions,
  transcribe,
  cancelTranscription,
  onProgress,
  onResult,
  onError,
  onCancelled,
} from "../lib/api";

export function useTranscription() {
  const [state, setState] = useState<JobState>({ type: "idle" });
  const [workerStatus, setWorkerStatus] = useState<string>("");
  const unlistenersRef = useRef<(() => void)[]>([]);
  const timingRef = useRef<{ downloadStart?: number; downloadTime?: number; transcribeStart?: number; transcribeTime?: number }>({});

  const cleanup = useCallback(() => {
    unlistenersRef.current.forEach((unlisten) => unlisten());
    unlistenersRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const setupListeners = useCallback(async () => {
    cleanup();
    timingRef.current = {};

    const unlistenProgress = await onProgress((update) => {
      const stage = update.stage;
      if (stage === "downloading") {
        if (!timingRef.current.downloadStart) {
          timingRef.current.downloadStart = Date.now();
        }
        setState({
          type: "downloading",
          progress: update.progress,
          elapsed_s: update.extra?.elapsed_s,
          eta_s: update.extra?.eta_s,
          speed: update.extra?.speed,
        });
      } else if (stage === "transcribing") {
        if (timingRef.current.downloadStart && !timingRef.current.downloadTime) {
          timingRef.current.downloadTime = (Date.now() - timingRef.current.downloadStart) / 1000;
        }
        if (!timingRef.current.transcribeStart) {
          timingRef.current.transcribeStart = Date.now();
        }
        setState({ type: "transcribing", progress: update.progress });
      } else if (stage === "preparing") {
        setState({ type: "preparing" });
      } else if (stage === "fetching-metadata") {
        setState({ type: "fetching-metadata" });
      } else if (stage === "fetching-captions") {
        setState((prev) => {
          if (prev.type === "video-info") {
            return { type: "fetching-captions", url: prev.url };
          }
          return prev;
        });
      } else if (stage === "loading-model") {
        setState({ type: "loading-model" });
      } else if (stage === "processing") {
        setState({ type: "processing" });
      }
    });

    const unlistenResult = await onResult((transcript: Transcript) => {
      const transcribeTime = timingRef.current.transcribeStart
        ? (Date.now() - timingRef.current.transcribeStart) / 1000
        : undefined;
      const enrichedTranscript: Transcript = {
        ...transcript,
        downloadTime: timingRef.current.downloadTime,
        transcribeTime,
      };
      setState({ type: "complete", transcript: enrichedTranscript });
    });

    const unlistenError = await onError((message: string) => {
      setState({ type: "error", message });
    });

    const unlistenCancelled = await onCancelled(() => {
      setState({ type: "cancelled" });
    });

    unlistenersRef.current = [
      unlistenProgress,
      unlistenResult,
      unlistenError,
      unlistenCancelled,
    ];
  }, [cleanup]);

  const handleTestWorker = useCallback(async () => {
    try {
      setWorkerStatus("Testing...");
      const result = await testWorker();
      setWorkerStatus(result);
    } catch (error) {
      setWorkerStatus(`Error: ${error}`);
    }
  }, []);

  const handleGetVideoInfo = useCallback(async (url: string) => {
    setState({ type: "fetching-metadata" });

    try {
      const videoInfo = await getVideoInfo(url);
      setState({ type: "video-info", videoInfo, url });
    } catch (error) {
      setState({ type: "error", message: String(error) });
    }
  }, []);

  const handleGetCaptions = useCallback(
    async (url: string, videoInfo: VideoInfo, language?: string) => {
      setState({ type: "fetching-captions", url });

      try {
        const result = await getCaptions(url, language);

        if (result.source === "none" || result.segments.length === 0) {
          setState({ type: "no-captions", url, videoInfo });
          return;
        }

        const transcript: Transcript = {
          videoId: result.videoId,
          title: videoInfo.title,
          channel: videoInfo.channel,
          duration: videoInfo.duration,
          language: result.language,
          source: "captions",
          segments: result.segments,
          text: result.text,
        };

        setState({ type: "complete", transcript });
      } catch (error) {
        setState({ type: "error", message: String(error) });
      }
    },
    []
  );

  const handleTranscribeFromNoCaptions = useCallback(
    async (url: string, model?: string) => {
      setState({ type: "preparing" });

      try {
        await setupListeners();
        await transcribe(url, model);
      } catch (error) {
        setState({ type: "error", message: String(error) });
      }
    },
    [setupListeners]
  );

  const handleCancel = useCallback(async () => {
    try {
      await cancelTranscription();
      setState({ type: "cancelled" });
    } catch (error) {
      console.error("Cancel failed:", error);
    }
  }, []);

  const handleReset = useCallback(() => {
    cleanup();
    setState({ type: "idle" });
  }, [cleanup]);

  return {
    state,
    workerStatus,
    handleTestWorker,
    handleGetVideoInfo,
    handleGetCaptions,
    handleTranscribeFromNoCaptions,
    handleCancel,
    handleReset,
  };
}
