import { useState, useEffect, useCallback } from "react";
import type { Transcript } from "../types/transcript";
import {
  listTranscripts,
  searchTranscripts,
  getTranscriptData,
  deleteTranscript,
  type TranscriptMetadata,
} from "../lib/api";
import { formatDuration } from "../lib/format";
import { useLanguage } from "../lib/i18n";

function formatDate(timestamp: number, t: (key: string) => string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return t("today");
  } else if (days === 1) {
    return t("yesterday");
  } else if (days < 7) {
    return t("last7Days");
  } else {
    return t("older");
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function groupByDate(items: TranscriptMetadata[], t: (key: string) => string): Map<string, TranscriptMetadata[]> {
  const groups = new Map<string, TranscriptMetadata[]>();

  for (const item of items) {
    const label = formatDate(item.createdAt, t);
    const existing = groups.get(label) || [];
    existing.push(item);
    groups.set(label, existing);
  }

  return groups;
}

interface HistoryViewProps {
  onViewTranscript: (transcript: Transcript) => void;
}

export function HistoryView({ onViewTranscript }: HistoryViewProps) {
  const { t } = useLanguage();
  const [transcripts, setTranscripts] = useState<TranscriptMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTranscripts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = searchQuery
        ? await searchTranscripts(searchQuery)
        : await listTranscripts();
      setTranscripts(data);
    } catch (err) {
      setError(t("loadError"));
      console.error("Failed to load transcripts:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, t]);

  useEffect(() => {
    loadTranscripts();
  }, [loadTranscripts]);

  const handleOpen = async (metadata: TranscriptMetadata) => {
    try {
      const { data } = await getTranscriptData(metadata.id);
      const transcript: Transcript = {
        videoId: data.videoId,
        title: data.title,
        channel: data.channel,
        duration: data.duration,
        language: data.language,
        source: data.source as "captions" | "whisper",
        segments: data.segments,
        text: data.text,
      };
      onViewTranscript(transcript);
    } catch (err) {
      setError(t("loadError2"));
      console.error("Failed to load transcript:", err);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`${t("deleteConfirm")} "${title}"?`)) return;
    try {
      await deleteTranscript(id);
      setTranscripts((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("Failed to delete transcript:", err);
    }
  };

  const groupedTranscripts = groupByDate(transcripts, t);

  return (
    <div className="history-view">
      <div className="history-header">
        <h2 className="history-title">{t("historyTitle")}</h2>
        <button
          className="history-refresh-button"
          onClick={loadTranscripts}
          title={t("refresh")}
        >
          ↻
        </button>
      </div>

      <div className="history-search">
        <input
          type="text"
          className="history-search-input"
          placeholder={t("searchHistory")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="history-loading">
          <div className="progress-spinner" />
        </div>
      )}

      {error && (
        <div className="history-error">
          <p>{error}</p>
          <button onClick={loadTranscripts} className="retry-button">
            {t("tryAgain")}
          </button>
        </div>
      )}

      {!isLoading && !error && transcripts.length === 0 && (
        <div className="history-empty">
          <p className="history-empty-text">
            {searchQuery
              ? t("noMatch")
              : t("noHistory")}
          </p>
        </div>
      )}

      {!isLoading && !error && transcripts.length > 0 && (
        <div className="history-list">
          {Array.from(groupedTranscripts.entries()).map(([label, items]) => (
            <div key={label} className="history-group">
              <div className="history-group-header">
                <h3 className="history-group-label">{label}</h3>
                <div className="history-group-divider" />
              </div>

              {items.map((metadata) => (
                <HistoryItem
                  key={metadata.id}
                  metadata={metadata}
                  onOpen={() => handleOpen(metadata)}
                  onDelete={() => handleDelete(metadata.id, metadata.title)}
                  t={t}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface HistoryItemProps {
  metadata: TranscriptMetadata;
  onOpen: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

function HistoryItem({ metadata, onOpen, onDelete, t }: HistoryItemProps) {
  return (
    <div className="history-item">
      <div className="history-item-content" onClick={onOpen}>
        <div className="history-item-title">{metadata.title}</div>
        <div className="history-item-meta">
          {metadata.channel && (
            <span className="history-item-channel">{metadata.channel}</span>
          )}
          <span className="history-item-separator">·</span>
          {metadata.duration && (
            <span className="history-item-duration">
              {formatDuration(metadata.duration)}
            </span>
          )}
          <span className="history-item-separator">·</span>
          <span className="history-item-source">
            {metadata.source === "captions" ? t("captions") : t("whisperLabel")}
          </span>
          {(metadata.downloadTime || metadata.transcribeTime) && (
            <>
              <span className="history-item-separator">·</span>
              <span className="history-item-timing">
                {metadata.downloadTime && `${t("dlLabel")}: ${formatTime(metadata.downloadTime)}`}
                {metadata.downloadTime && metadata.transcribeTime && " "}
                {metadata.transcribeTime && `${t("trLabel")}: ${formatTime(metadata.transcribeTime)}`}
              </span>
            </>
          )}
        </div>
      </div>
      <button
        className="history-item-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={t("deleteConfirm")}
      >
        ×
      </button>
    </div>
  );
}
