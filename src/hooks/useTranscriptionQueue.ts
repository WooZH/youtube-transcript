import { useState, useCallback, useRef, useEffect } from "react";
import type {
  TranscriptionJob,
  QueueState,
  Transcript,
} from "../types/transcript";
import {
  getVideoInfo,
  getCaptions,
  transcribe,
  cancelTranscription,
  onProgress,
  onResult,
  onError,
  onCancelled,
} from "../lib/api";
import { getSavedModel } from "../components/ModelSelector";

function generateId(): string {
  return crypto.randomUUID();
}

function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1);
    }
    if (
      urlObj.hostname === "www.youtube.com" ||
      urlObj.hostname === "youtube.com"
    ) {
      return urlObj.searchParams.get("v");
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const urlObj = new URL(trimmed);
    if (
      urlObj.hostname === "www.youtube.com" ||
      urlObj.hostname === "youtube.com"
    ) {
      const videoId = urlObj.searchParams.get("v");
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }
    if (urlObj.hostname === "youtu.be") {
      const path = urlObj.pathname.slice(1);
      return `https://www.youtube.com/watch?v=${path}`;
    }
  } catch {
    // Not a valid URL
  }
  return trimmed;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === "youtube.com" ||
      urlObj.hostname === "www.youtube.com" ||
      urlObj.hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

export function useTranscriptionQueue() {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [queueState, setQueueState] = useState<QueueState>("idle");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const unlistenersRef = useRef<(() => void)[]>([]);
  const processingRef = useRef(false);
  const shouldContinueRef = useRef(true);

  const cleanup = useCallback(() => {
    unlistenersRef.current.forEach((unlisten) => unlisten());
    unlistenersRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const updateJob = useCallback((jobId: string, updates: Partial<TranscriptionJob>) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, ...updates } : job
      )
    );
  }, []);

  const addJobs = useCallback((urls: string[]) => {
    const normalizedUrls = urls
      .map(normalizeUrl)
      .filter(isYouTubeUrl);

    const uniqueUrls = [...new Set(normalizedUrls)];

    const newJobs: TranscriptionJob[] = uniqueUrls
      .map((url) => ({
        id: generateId(),
        url,
        state: "queued" as const,
        createdAt: Date.now(),
      }));

    setJobs((prev) => {
      const existingVideoIds = new Set(
        prev.map((job) => extractVideoId(job.url)).filter(Boolean)
      );

      const filteredNewJobs = newJobs.filter((job) => {
        const videoId = extractVideoId(job.url);
        if (videoId && existingVideoIds.has(videoId)) {
          return false;
        }
        return true;
      });

      return [...prev, ...filteredNewJobs];
    });
  }, []);

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) =>
      prev.filter((job) => job.state !== "completed" && job.state !== "cancelled")
    );
  }, []);

  const retryJob = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              id: generateId(),
              state: "queued" as const,
              progress: undefined,
              stage: undefined,
              transcript: undefined,
              error: undefined,
              startedAt: undefined,
              completedAt: undefined,
            }
          : job
      )
    );
  }, []);

  const cancelAllJobs = useCallback(async () => {
    setJobs((prev) =>
      prev.map((job) =>
        job.state === "queued"
          ? { ...job, state: "cancelled" as const }
          : job
      )
    );

    if (currentJobId) {
      try {
        await cancelTranscription();
      } catch (error) {
        console.error("Cancel failed:", error);
      }
    }

    shouldContinueRef.current = false;
    setCurrentJobId(null);
    setQueueState("idle");
  }, [currentJobId]);

  const cancelJob = useCallback(async (jobId: string) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? { ...job, state: "cancelled" as const }
          : job
      )
    );

    if (currentJobId === jobId) {
      try {
        await cancelTranscription();
      } catch (error) {
        console.error("Cancel failed:", error);
      }
      setCurrentJobId(null);
      setQueueState("idle");
    }
  }, [currentJobId]);

  const processNextJob = useCallback(async () => {
    if (processingRef.current) {
      return;
    }

    const nextJob = jobs.find((job) => job.state === "queued");

    if (!nextJob) {
      setQueueState("idle");
      setCurrentJobId(null);
      processingRef.current = false;
      return;
    }

    if (!shouldContinueRef.current) {
      setQueueState("idle");
      setCurrentJobId(null);
      processingRef.current = false;
      return;
    }

    processingRef.current = true;
    setCurrentJobId(nextJob.id);
    setQueueState("processing");
    updateJob(nextJob.id, {
      state: "fetching-metadata",
      startedAt: Date.now(),
    });

    cleanup();

    try {
      const unlistenProgress = await onProgress((update) => {
        const stateMap: Record<string, string> = {
          preparing: "fetching-metadata",
          "fetching-metadata": "fetching-metadata",
          "fetching-captions": "fetching-captions",
          downloading: "downloading",
          "loading-model": "loading-model",
          transcribing: "transcribing",
          processing: "processing",
        };

        const jobState = stateMap[update.stage] || update.stage;
        updateJob(nextJob.id, {
          state: jobState as TranscriptionJob["state"],
          progress: update.progress,
          stage: update.stage,
          elapsed_s: update.extra?.elapsed_s,
          eta_s: update.extra?.eta_s,
          speed: update.extra?.speed,
        });
      });

      const unlistenResult = await onResult((transcript: Transcript) => {
        updateJob(nextJob.id, {
          state: "completed",
          transcript,
          completedAt: Date.now(),
        });
        processingRef.current = false;
        setTimeout(() => processNextJob(), 100);
      });

      const unlistenError = await onError((message: string) => {
        updateJob(nextJob.id, {
          state: "failed",
          error: message,
          completedAt: Date.now(),
        });
        processingRef.current = false;
        setTimeout(() => processNextJob(), 100);
      });

      const unlistenCancelled = await onCancelled(() => {
        updateJob(nextJob.id, {
          state: "cancelled",
          completedAt: Date.now(),
        });
        processingRef.current = false;
        setTimeout(() => processNextJob(), 100);
      });

      unlistenersRef.current = [
        unlistenProgress,
        unlistenResult,
        unlistenError,
        unlistenCancelled,
      ];

      const videoInfo = await getVideoInfo(nextJob.url);
      updateJob(nextJob.id, { videoInfo });

      updateJob(nextJob.id, { state: "fetching-captions" });
      const captionsResult = await getCaptions(nextJob.url);

      if (captionsResult.source !== "none" && captionsResult.segments.length > 0) {
        const transcript: Transcript = {
          videoId: captionsResult.videoId,
          title: videoInfo.title,
          channel: videoInfo.channel,
          duration: videoInfo.duration,
          language: captionsResult.language,
          source: "captions",
          segments: captionsResult.segments,
          text: captionsResult.text,
        };

        updateJob(nextJob.id, {
          state: "completed",
          transcript,
          completedAt: Date.now(),
        });
        processingRef.current = false;
        setTimeout(() => processNextJob(), 100);
        return;
      }

      updateJob(nextJob.id, { state: "downloading" });
      await transcribe(nextJob.url, getSavedModel(), "auto", nextJob.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateJob(nextJob.id, {
        state: "failed",
        error: errorMessage,
        completedAt: Date.now(),
      });
      processingRef.current = false;
      setTimeout(() => processNextJob(), 100);
    }
  }, [jobs, updateJob, cleanup]);

  const startQueue = useCallback(() => {
    if (queueState === "processing") {
      return;
    }

    shouldContinueRef.current = true;
    setQueueState("processing");
    processNextJob();
  }, [queueState, processNextJob]);

  const stopQueue = useCallback(() => {
    shouldContinueRef.current = false;
  }, []);

  const openTranscript = useCallback((job: TranscriptionJob): Transcript | null => {
    return job.transcript || null;
  }, []);

  return {
    jobs,
    queueState,
    currentJobId,
    addJobs,
    removeJob,
    clearCompleted,
    retryJob,
    startQueue,
    stopQueue,
    cancelAllJobs,
    cancelJob,
    openTranscript,
  };
}
