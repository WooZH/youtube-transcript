import { useState, useEffect, useCallback, useRef } from "react";
import type { Transcript, TranscriptSegment } from "../types/transcript";
import {
  transcribeLocally,
  isNativeHostAvailable,
  type ProgressUpdate,
} from "../lib/native-transcribe";

const STAGE_LABELS: Record<string, string> = {
  preparing: "Preparing...",
  downloading: "Downloading audio...",
  "loading-model": "Loading Whisper...",
  transcribing: "Transcribing...",
  processing: "Processing transcript...",
  "fetching-metadata": "Fetching metadata...",
  "fetching-captions": "Fetching captions...",
  complete: "Complete",
};

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":");
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseFloat(seconds)
    );
  } else if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return parseInt(minutes, 10) * 60 + parseFloat(seconds);
  }
  return 0;
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (match) => entities[match] || match);
}

function cleanText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText: string };
  kind?: string;
}

function getVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.youtube.com") {
      if (parsed.pathname.startsWith("/watch")) {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/shorts/")[1];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function fetchActiveTabUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_URL" }, (response) => {
      resolve(response?.url || null);
    });
  });
}

async function getCaptionTracks(): Promise<CaptionTrack[]> {
  try {
    const url = await fetchActiveTabUrl();
    if (!url) return [];
    const videoId = getVideoIdFromUrl(url);
    if (!videoId) return [];

    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();

    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionTracksMatch) return [];

    const captionTracks = JSON.parse(captionTracksMatch[1]);
    return captionTracks;
  } catch (error) {
    console.error("Failed to get caption tracks:", error);
    return [];
  }
}

function selectLanguage(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;

  const browserLang = navigator.language.split("-")[0];

  const exactMatch = tracks.find((t) => t.languageCode === browserLang);
  if (exactMatch) return exactMatch;

  const englishMatch = tracks.find((t) => t.languageCode === "en");
  if (englishMatch) return englishMatch;

  const chineseMatch = tracks.find((t) => t.languageCode.startsWith("zh"));
  if (chineseMatch) return chineseMatch;

  return tracks[0];
}

async function fetchCaptions(track: CaptionTrack): Promise<string> {
  const response = await fetch(track.baseUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch captions");
  }
  return response.text();
}

function parseCaptionsXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  const textRegex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;

  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const text = cleanText(match[3]);

    if (text) {
      segments.push({
        id: segments.length,
        start,
        end: start + duration,
        text,
      });
    }
  }

  return segments;
}

function getVideoInfoFromPage(): { title: string; channel: string; duration: number } | null {
  const titleElement = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string");
  const title = titleElement?.textContent?.trim() || document.title.replace(" - YouTube", "").trim();

  const channelElement = document.querySelector("#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a");
  const channel = channelElement?.textContent?.trim() || "";

  const durationElement = document.querySelector(".ytp-time-duration");
  const durationText = durationElement?.textContent || "0:00";
  const duration = parseTimestamp(durationText);

  return { title, channel, duration };
}

export function Popup() {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number>(0);
  const [activeSegment, setActiveSegment] = useState<number | null>(null);
  const segmentsRef = useRef<HTMLDivElement>(null);

  const [localTranscribing, setLocalTranscribing] = useState(false);
  const [localStage, setLocalStage] = useState("");
  const [localProgress, setLocalProgress] = useState(0);
  const [noCaptions, setNoCaptions] = useState(false);
  const cancelRef = useRef<{ cancel: () => void } | null>(null);

  const loadTranscript = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setNoCaptions(false);

      const url = await fetchActiveTabUrl();
      if (!url || !getVideoIdFromUrl(url)) {
        setError("No video detected.");
        setLoading(false);
        return;
      }

      const tracks = await getCaptionTracks();
      if (tracks.length === 0) {
        setNoCaptions(true);
        setError("No captions available.");
        setLoading(false);
        return;
      }

      const selectedTrack = selectLanguage(tracks);
      if (!selectedTrack) {
        setNoCaptions(true);
        setError("No captions available.");
        setLoading(false);
        return;
      }

      const captionXml = await fetchCaptions(selectedTrack);
      const segments = parseCaptionsXml(captionXml);

      if (segments.length === 0) {
        setNoCaptions(true);
        setError("No captions available.");
        setLoading(false);
        return;
      }

      const videoInfo = getVideoInfoFromPage();
      const text = segments.map((s) => s.text).join("\n\n");

      setTranscript({
        videoId: getVideoIdFromUrl(url) || "",
        title: videoInfo?.title || document.title,
        channel: videoInfo?.channel,
        duration: videoInfo?.duration,
        language: selectedTrack.languageCode,
        source: "captions",
        segments,
        text,
      });
    } catch (err) {
      setError("Unable to load transcript.");
      console.error("Failed to load transcript:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTranscript();
  }, [loadTranscript]);

  useEffect(() => {
    if (!transcript) {
      setSearchResults(0);
      return;
    }

    if (!searchQuery.trim()) {
      setSearchResults(0);
      return;
    }

    const query = searchQuery.toLowerCase();
    const count = transcript.segments.filter((s) =>
      s.text.toLowerCase().includes(query)
    ).length;
    setSearchResults(count);
  }, [searchQuery, transcript]);

  const handleTranscribeLocally = useCallback(async () => {
    const videoUrl = await fetchActiveTabUrl();
    if (!videoUrl) {
      setError("Unable to detect video URL.");
      return;
    }

    setLocalTranscribing(true);
    setLocalStage("preparing");
    setLocalProgress(0);

    const result = transcribeLocally({
      url: videoUrl,
      onProgress: (update: ProgressUpdate) => {
        setLocalStage(update.stage);
        setLocalProgress(update.progress);
      },
      onResult: (t: Transcript) => {
        setTranscript(t);
        setLocalTranscribing(false);
        setLocalStage("");
        setLocalProgress(0);
        setNoCaptions(false);
        setError(null);
      },
      onError: (msg: string) => {
        setLocalTranscribing(false);
        setLocalStage("");
        setLocalProgress(0);
        setError(msg);
      },
      onCancelled: () => {
        setLocalTranscribing(false);
        setLocalStage("");
        setLocalProgress(0);
      },
    });

    cancelRef.current = result;
  }, []);

  const handleCancelLocal = useCallback(() => {
    cancelRef.current?.cancel();
    cancelRef.current = null;
  }, []);

  const handleSeekTo = (seconds: number) => {
    const video = document.querySelector("video");
    if (video) {
      video.currentTime = seconds;
    } else {
      window.location.hash = `t=${Math.floor(seconds)}`;
    }
  };

  const handleCopy = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript.text);
  };

  const handleCopyWithTimestamps = () => {
    if (!transcript) return;
    const text = transcript.segments
      .map((s) => `[${formatTimestamp(s.start)}] ${s.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  const getHighlightedText = (text: string) => {
    if (!searchQuery.trim()) {
      return text;
    }

    const query = searchQuery.toLowerCase();
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));

    return parts.map((part, i) =>
      part.toLowerCase() === query ? (
        <mark key={i} style={{ background: "rgba(255, 200, 0, 0.3)", borderRadius: "2px" }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (loading && !localTranscribing) {
    return (
      <div className="transcript-container">
        <div className="transcript-loading">
          <div className="spinner" />
          <span>Loading transcript...</span>
        </div>
      </div>
    );
  }

  if (localTranscribing) {
    const stageLabel = STAGE_LABELS[localStage] || localStage;
    return (
      <div className="transcript-container">
        <div className="transcript-header">
          <div className="transcript-meta">Local transcription</div>
        </div>
        <div className="local-transcription">
          <div className="local-stage">{stageLabel}</div>
          <div className="local-progress-bar">
            <div
              className="local-progress-fill"
              style={{ width: `${localProgress}%` }}
            />
          </div>
          <div className="local-progress-text">{Math.round(localProgress)}%</div>
          <button onClick={handleCancelLocal} className="cancel-button">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (error && !transcript) {
    return (
      <div className="transcript-container">
        <div className="transcript-error">
          <p>{error}</p>
          {error === "Unable to load transcript." && (
            <button onClick={loadTranscript} className="retry-button">
              Retry
            </button>
          )}
          {noCaptions && isNativeHostAvailable() && (
            <div className="local-transcription-prompt">
              <p>This video can be transcribed locally.</p>
              <button onClick={handleTranscribeLocally} className="transcribe-button">
                Transcribe Locally
              </button>
            </div>
          )}
          {noCaptions && !isNativeHostAvailable() && (
            <p className="error-hint">
              Local transcription requires the YouTube Transcript Mac app.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="transcript-container">
        <div className="transcript-error">
          <p>Unable to load transcript.</p>
          <button onClick={loadTranscript} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const sourceLabel = transcript.source === "whisper"
    ? `Local Whisper · ${transcript.language?.toUpperCase() || "Unknown"}`
    : `YouTube Captions · ${transcript.language?.toUpperCase() || "Unknown"}`;

  return (
    <div className="transcript-container">
      <div className="transcript-header">
        <div className="transcript-title">{transcript.title}</div>
        <div className="transcript-meta">{sourceLabel}</div>
        <div className="transcript-actions">
          <button onClick={handleCopy} className="action-button">
            Copy
          </button>
          <button onClick={handleCopyWithTimestamps} className="action-button">
            Copy timestamps
          </button>
        </div>
      </div>

      <div className="transcript-search">
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <span className="search-count">{searchResults} results</span>
        )}
      </div>

      <div className="transcript-segments" ref={segmentsRef}>
        {transcript.segments.map((segment) => (
          <div
            key={segment.id}
            className={`segment ${activeSegment === segment.id ? "segment-active" : ""}`}
            onClick={() => {
              setActiveSegment(segment.id);
              handleSeekTo(segment.start);
            }}
          >
            <span className="segment-timestamp">
              {formatTimestamp(segment.start)}
            </span>
            <span className="segment-text">
              {getHighlightedText(segment.text)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
