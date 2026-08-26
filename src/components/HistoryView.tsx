import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Transcript } from "../types/transcript";
import type { TranscriptMetadata, TranscriptData } from "../lib/api";
import { Button, Input, Badge } from "./primitives";
import { useLanguage } from "../lib/i18n";
import { useToast } from "./Toast";

interface HistoryViewProps {
  onViewTranscript: (transcript: Transcript) => void;
}

export function HistoryView({ onViewTranscript }: HistoryViewProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<TranscriptMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<TranscriptMetadata[]>("list_transcripts");
      setEntries(result);
    } catch (e) {
      console.error("Failed to load history:", e);
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("delete_transcript", { transcriptId: id });
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      showToast(t("deleted"));
    } catch (err) {
      console.error("Delete failed:", err);
      showToast(t("deleteFailed"));
    }
  };

  const handleOpenTranscript = async (entry: TranscriptMetadata) => {
    try {
      const [, data] = await invoke<[TranscriptMetadata, TranscriptData]>("get_transcript_data", { transcriptId: entry.id });

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
      console.error("Failed to open transcript:", err);
      showToast(t("loadError2"));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t("today");
    if (diffDays === 1) return t("yesterday");
    if (diffDays < 7) return t("last7Days");
    return t("older");
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const groupByDate = (items: TranscriptMetadata[]) => {
    const groups: Record<string, TranscriptMetadata[]> = {};
    for (const item of items) {
      const label = formatDate(item.createdAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    }
    return Object.entries(groups);
  };

  const filteredEntries = searchQuery.trim()
    ? entries.filter(
        (entry) =>
          entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (entry.channel && entry.channel.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : entries;

  const groupedEntries = groupByDate(filteredEntries);

  if (loading) {
    return (
      <div className="history-view">
        <div className="history-loading">
          <div className="progress-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-view">
        <div className="history-error">
          <p>{error}</p>
          <Button variant="primary" onClick={loadHistory}>
            {t("refresh")}
          </Button>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="history-view">
        <div className="history-header">
          <h2 className="history-title">{t("historyTitle")}</h2>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-message">{t("noHistory")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-view">
      <div className="history-header">
        <h2 className="history-title">{t("historyTitle")}</h2>
        <div className="history-header-actions">
          <Input
            inputSize="sm"
            placeholder={t("searchHistory")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button variant="ghost" size="sm" onClick={loadHistory}>
            {t("refresh")}
          </Button>
        </div>
      </div>

      {searchQuery.trim() && filteredEntries.length === 0 && (
        <div className="history-list-empty">
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-message">{t("noMatch")}</div>
          </div>
        </div>
      )}

      {groupedEntries.map(([label, groupEntries]) => (
        <div key={label} className="history-date-group">
          <div className="history-date-label">{label}</div>
          {groupEntries.map((entry) => (
            <div
              key={entry.id}
              className="history-item"
              onClick={() => handleOpenTranscript(entry)}
            >
              {entry.videoId && (
                <img
                  className="history-item-thumb"
                  src={`https://img.youtube.com/vi/${entry.videoId}/mqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="history-item-content">
                <div className="history-item-title">{entry.title}</div>
                <div className="history-item-meta">
                  {entry.channel && (
                    <>
                      <span className="history-item-channel">{entry.channel}</span>
                      <span className="history-item-separator">·</span>
                    </>
                  )}
                  {entry.duration != null && (
                    <>
                      <span className="history-item-duration">{formatDuration(entry.duration)}</span>
                      <span className="history-item-separator">·</span>
                    </>
                  )}
                  <Badge
                    variant={entry.source === "whisper" ? "accent" : "muted"}
                  >
                    {entry.source === "whisper"
                      ? t("whisperLabel")
                      : t("youtubeCaptions")}
                  </Badge>
                </div>
                {(entry.downloadTime != null || entry.transcribeTime != null) && (
                  <div className="history-item-timing">
                    {entry.downloadTime != null && (
                      <span>{t("dlLabel")}: {formatDuration(entry.downloadTime)}</span>
                    )}
                    {entry.transcribeTime != null && (
                      <span>{t("trLabel")}: {formatDuration(entry.transcribeTime)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="history-item-actions" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(entry.id, e)}
                >
                  {t("deleteConfirm")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
