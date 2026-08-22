import type { Transcript } from "../types/transcript";
import { TranscriptSearch } from "./TranscriptSearch";
import { TranscriptSegment } from "./TranscriptSegment";
import { ExportMenu } from "./ExportMenu";
import { useState, useMemo, useRef, useCallback } from "react";
import { formatDuration } from "../lib/utils";
import { useLanguage } from "../lib/i18n";
import { Button } from "./primitives";

interface TranscriptViewProps {
  transcript: Transcript;
  onReset: () => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function TranscriptView({ transcript, onReset }: TranscriptViewProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const segmentsRef = useRef<HTMLDivElement>(null);

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return transcript.segments;

    const query = searchQuery.toLowerCase();
    return transcript.segments.filter((seg) =>
      seg.text.toLowerCase().includes(query)
    );
  }, [transcript.segments, searchQuery]);

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const query = searchQuery.toLowerCase();
    return transcript.segments.filter((seg) =>
      seg.text.toLowerCase().includes(query)
    ).length;
  }, [transcript.segments, searchQuery]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  }, []);

  const copyPlain = useCallback(() => {
    const text = transcript.segments
      .map((seg) => seg.text)
      .join("\n\n");
    copyToClipboard(text);
  }, [transcript.segments, copyToClipboard]);

  const copyWithTimestamps = useCallback(() => {
    const text = transcript.segments
      .map((seg) => `[${formatTimestamp(seg.start)}] ${seg.text}`)
      .join("\n\n");
    copyToClipboard(text);
  }, [transcript.segments, copyToClipboard]);

  const scrollToSegment = useCallback((segmentId: number) => {
    const el = segmentsRef.current?.querySelector(
      `[data-segment-id="${segmentId}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const sourceLabel = useMemo(() => {
    if (transcript.source === "captions") {
      return t("youtubeCaptions");
    }
    return t("whisperLabel");
  }, [transcript.source, t]);

  return (
    <div className="transcript-view">
      <div className="transcript-header">
        <div className="video-info">
          <h2 className="video-title">{transcript.title}</h2>
          {transcript.channel && (
            <div className="video-channel">{transcript.channel}</div>
          )}
          {transcript.duration && (
            <div className="video-meta">
              {formatDuration(transcript.duration)}
              {transcript.language && ` · ${transcript.language}`}
            </div>
          )}
        </div>

        <div className="source-badge">
          <span className="source-dot">●</span> {sourceLabel}
        </div>
      </div>

      <div className="transcript-toolbar">
        <TranscriptSearch
          query={searchQuery}
          onChange={setSearchQuery}
          matchCount={matchCount}
          onJumpToMatch={scrollToSegment}
          filteredSegments={filteredSegments}
        />

        <div className="toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={copyPlain}
            title={t("copyText")}
          >
            {copySuccess ? t("copied") : t("copy")}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={copyWithTimestamps}
            title={t("copyTimestamps")}
          >
            {t("copyTimestamps")}
          </Button>

          <ExportMenu transcript={transcript} />

          <Button variant="secondary" size="sm" onClick={onReset}>
            {t("newBtn")}
          </Button>
        </div>
      </div>

      <div className="transcript-segments" ref={segmentsRef}>
        {filteredSegments.map((seg) => (
          <TranscriptSegment
            key={seg.id}
            segment={seg}
            videoId={transcript.videoId}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </div>
  );
}
