import type { TranscriptSegment as Segment } from "../types/transcript";

interface TranscriptSegmentProps {
  segment: Segment;
  videoId: string;
  searchQuery: string;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="search-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function TranscriptSegment({
  segment,
  videoId,
  searchQuery,
}: TranscriptSegmentProps) {
  const openInYouTube = () => {
    const t = Math.floor(segment.start);
    window.open(
      `https://youtube.com/watch?v=${videoId}&t=${t}s`,
      "_blank"
    );
  };

  return (
    <div className="segment" data-segment-id={segment.id}>
      <button className="segment-timestamp" onClick={openInYouTube}>
        {formatTimestamp(segment.start)}
      </button>
      <div className="segment-text">
        {highlightText(segment.text, searchQuery)}
      </div>
    </div>
  );
}
