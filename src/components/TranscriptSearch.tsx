import { useCallback, useState } from "react";
import type { TranscriptSegment } from "../types/transcript";
import { useLanguage } from "../lib/i18n";

interface TranscriptSearchProps {
  query: string;
  onChange: (query: string) => void;
  matchCount: number;
  onJumpToMatch: (segmentId: number) => void;
  filteredSegments: TranscriptSegment[];
}

export function TranscriptSearch({
  query,
  onChange,
  matchCount,
  onJumpToMatch,
  filteredSegments,
}: TranscriptSearchProps) {
  const { t } = useLanguage();
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const handleNextMatch = useCallback(() => {
    if (filteredSegments.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % filteredSegments.length;
    setCurrentMatchIndex(nextIndex);
    onJumpToMatch(filteredSegments[nextIndex].id);
  }, [currentMatchIndex, filteredSegments, onJumpToMatch]);

  const handlePrevMatch = useCallback(() => {
    if (filteredSegments.length === 0) return;
    const prevIndex =
      (currentMatchIndex - 1 + filteredSegments.length) %
      filteredSegments.length;
    setCurrentMatchIndex(prevIndex);
    onJumpToMatch(filteredSegments[prevIndex].id);
  }, [currentMatchIndex, filteredSegments, onJumpToMatch]);

  return (
    <div className="search-container">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          onChange(e.target.value);
          setCurrentMatchIndex(0);
        }}
        placeholder={t("searchPlaceholder")}
        className="search-input"
      />
      {query.trim() && matchCount > 0 && (
        <div className="search-nav">
          <span className="search-count">
            {currentMatchIndex + 1} / {matchCount}
          </span>
          <button
            onClick={handlePrevMatch}
            className="search-nav-button"
            title={t("prevMatch")}
          >
            ↑
          </button>
          <button
            onClick={handleNextMatch}
            className="search-nav-button"
            title={t("nextMatch")}
          >
            ↓
          </button>
        </div>
      )}
      {query.trim() && matchCount === 0 && (
        <span className="search-count">0 {t("results")}</span>
      )}
    </div>
  );
}
