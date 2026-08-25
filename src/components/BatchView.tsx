import { useState } from "react";
import type { TranscriptionJob, Transcript } from "../types/transcript";
import { useTranscriptionQueue } from "../hooks/useTranscriptionQueue";
import { exportTranscript } from "../lib/api";
import { formatDuration } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { useToast } from "./Toast";
import { Button, Textarea, Badge } from "./primitives";

function sanitizeFilename(title: string): string {
  return title
    .replace(/[\/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);
}

function getStateIcon(state: TranscriptionJob["state"]): string {
  switch (state) {
    case "queued":
      return "○";
    case "completed":
      return "✓";
    case "failed":
      return "!";
    case "cancelled":
      return "×";
    default:
      return "◉";
  }
}

function getStateLabel(state: TranscriptionJob["state"], t: (key: any) => string): string {
  switch (state) {
    case "queued": return t("waiting");
    case "fetching-metadata": return t("fetchingInfo");
    case "fetching-captions": return t("checkingCaptions");
    case "downloading": return t("downloadingAudio");
    case "loading-model": return t("loadingModelState");
    case "transcribing": return t("transcribingState");
    case "processing": return t("processingState");
    case "completed": return t("completed");
    case "failed": return t("failed");
    case "cancelled": return t("cancelled");
    default: return state;
  }
}

interface BatchViewProps {
  onViewTranscript: (transcript: Transcript) => void;
}

export function BatchView({ onViewTranscript }: BatchViewProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const {
    jobs,
    queueState,
    addJobs,
    clearCompleted,
    retryJob,
    startQueue,
    stopQueue,
    cancelAllJobs,
    cancelJob,
  } = useTranscriptionQueue();

  const [inputText, setInputText] = useState("");

  const handleAddUrls = () => {
    const lines = inputText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    const validUrls: string[] = [];
    const rejected: { url: string; reason: string }[] = [];

    for (const line of lines) {
      try {
        const urlObj = new URL(line);
        const isYT =
          urlObj.hostname === "youtube.com" ||
          urlObj.hostname === "www.youtube.com" ||
          urlObj.hostname === "youtu.be" ||
          urlObj.hostname === "m.youtube.com";
        if (isYT) {
          validUrls.push(line);
        } else {
          rejected.push({ url: line, reason: t("invalidYouTubeUrl") });
        }
      } catch {
        rejected.push({ url: line, reason: t("invalidUrl") });
      }
    }

    if (validUrls.length > 0) {
      addJobs(validUrls);
    }

    if (rejected.length > 0) {
      const summary = validUrls.length > 0
        ? `${validUrls.length} ${t("videosAdded")}. `
        : "";
      const reasons = rejected
        .map((r) => `\u2022 ${r.url} \u2014 ${r.reason}`)
        .join("\n");
      showToast(`${summary}${rejected.length} ${t("urlsRejected")}:\n${reasons}`);
    } else if (validUrls.length > 0) {
      showToast(`${validUrls.length} ${t("videosAdded")}`);
    }

    setInputText("");
  };

  const handleExportAll = async () => {
    const completedJobs = jobs.filter((job) => job.state === "completed" && job.transcript);

    for (const job of completedJobs) {
      if (job.transcript) {
        try {
          const filename = sanitizeFilename(job.transcript.title);
          const content = await exportTranscript(job.transcript, "txt");
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${filename}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Export failed:", error);
        }
      }
    }
  };

  const hasQueuedJobs = jobs.some((job) => job.state === "queued");
  const hasCompletedJobs = jobs.some((job) => job.state === "completed");
  const hasFailedJobs = jobs.some((job) => job.state === "failed");
  const isActive = queueState === "processing";
  const currentJob = jobs.find((job) => job.id === jobs.find((j) => j.state !== "queued" && j.state !== "completed" && j.state !== "failed" && j.state !== "cancelled")?.id);

  return (
    <div className="batch-view">
      <div className="batch-header">
        <h2 className="batch-title">{t("batchTitle")}</h2>
      </div>

      <div className="batch-input-section">
        <label className="batch-input-label">{t("pasteUrls")}</label>
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={"https://youtube.com/watch?v=A\nhttps://youtube.com/watch?v=B\nhttps://youtu.be/C"}
          rows={6}
        />
        <div className="batch-input-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddUrls}
            disabled={!inputText.trim()}
          >
            {t("addUrls")}
          </Button>
          <div className="batch-primary-actions">
            {hasCompletedJobs && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportAll}
              >
                {t("exportAll")}
              </Button>
            )}
            {hasFailedJobs && (
              <Button
                variant="secondary"
                size="sm"
                onClick={clearCompleted}
              >
                {t("clearFinished")}
              </Button>
            )}
            {isActive ? (
              <Button
                variant="danger"
                size="sm"
                onClick={stopQueue}
              >
                {t("stopQueue")}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={startQueue}
                disabled={!hasQueuedJobs}
              >
                {t("startAll")}
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={cancelAllJobs}
              disabled={jobs.length === 0}
            >
              {t("cancelAll")}
            </Button>
          </div>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="batch-queue-section">
          <div className="batch-queue-header">
            <h3 className="batch-queue-title">{t("queue")}</h3>
            <span className="batch-queue-count">{jobs.length} {t("jobs")}</span>
          </div>

          <div className="batch-queue-list">
            {jobs.map((job) => (
              <BatchJobItem
                key={job.id}
                job={job}
                isCurrent={currentJob?.id === job.id}
                onCancel={() => cancelJob(job.id)}
                onRetry={() => retryJob(job.id)}
                onViewTranscript={() => {
                  if (job.transcript) {
                    onViewTranscript(job.transcript);
                  }
                }}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📎</div>
          <div className="empty-state-message">{t("emptyBatch")}</div>
        </div>
      )}
    </div>
  );
}

interface BatchJobItemProps {
  job: TranscriptionJob;
  isCurrent: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onViewTranscript: () => void;
  t: (key: any) => string;
}

function BatchJobItem({
  job,
  isCurrent,
  onCancel,
  onRetry,
  onViewTranscript,
  t,
}: BatchJobItemProps) {
  const icon = getStateIcon(job.state);
  const label = getStateLabel(job.state, t);
  const isActive = isCurrent && job.state !== "completed" && job.state !== "failed" && job.state !== "cancelled";

  return (
    <div className={`batch-job-item ${isActive ? "batch-job-active" : ""} ${job.state === "completed" ? "batch-job-completed" : ""} ${job.state === "failed" ? "batch-job-failed" : ""}`}>
      <div className="batch-job-header">
        <span className="batch-job-icon">{icon}</span>
        <span className="batch-job-title">
          {job.videoInfo?.title || job.url}
        </span>
      </div>

      <div className="batch-job-status">
        <span className={`batch-job-state batch-job-state-${job.state}`}>
          {label}
        </span>
        {job.state === "completed" && job.transcript?.source === "captions" && (
          <Badge variant="muted">{t("youtubeCaptions")}</Badge>
        )}
        {(job.state === "transcribing" || job.state === "downloading" || job.state === "loading-model") && (
          <Badge variant="accent">{t("whisperLabel")}</Badge>
        )}
        {(job.state === "transcribing" || job.state === "downloading") && job.progress !== undefined && (
          <div className="batch-job-progress">
            <div className="batch-job-progress-bar">
              <div
                className="batch-job-progress-fill"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <span className="batch-job-progress-text">{Math.round(job.progress)}%</span>
          </div>
        )}
        {job.videoInfo?.duration && (
          <span className="batch-job-duration">
            {formatDuration(job.videoInfo.duration)}
          </span>
        )}
      </div>

      {job.error && (
        <div className="batch-job-error">{job.error}</div>
      )}

      <div className="batch-job-actions">
        {job.state === "queued" && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("remove")}
          </Button>
        )}
        {isActive && (
          <Button variant="danger" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        {job.state === "failed" && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        )}
        {job.state === "completed" && (
          <Button variant="secondary" size="sm" onClick={onViewTranscript}>
            {t("openTranscript")}
          </Button>
        )}
      </div>
    </div>
  );
}
