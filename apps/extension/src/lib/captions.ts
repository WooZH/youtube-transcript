import type { Transcript, TranscriptSegment, CaptionTrack } from "../types/transcript";

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

export function getVideoId(): string | null {
  const url = new URL(window.location.href);
  
  if (url.hostname === "www.youtube.com") {
    if (url.pathname.startsWith("/watch")) {
      return url.searchParams.get("v");
    }
    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/shorts/")[1];
    }
  }
  
  return null;
}

export function getVideoInfo(): { title: string; channel: string; duration: number } | null {
  const titleElement = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string");
  const title = titleElement?.textContent?.trim() || document.title.replace(" - YouTube", "").trim();
  
  const channelElement = document.querySelector("#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a");
  const channel = channelElement?.textContent?.trim() || "";
  
  const durationElement = document.querySelector(".ytp-time-duration");
  const durationText = durationElement?.textContent || "0:00";
  const duration = parseTimestamp(durationText);
  
  return { title, channel, duration };
}

export async function getCaptionTracks(): Promise<CaptionTrack[]> {
  try {
    const videoId = getVideoId();
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

export async function fetchCaptions(track: CaptionTrack): Promise<string> {
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

export async function extractTranscript(): Promise<Transcript | null> {
  const videoId = getVideoId();
  if (!videoId) return null;
  
  const tracks = await getCaptionTracks();
  if (tracks.length === 0) return null;
  
  const selectedTrack = selectLanguage(tracks);
  if (!selectedTrack) return null;
  
  const captionXml = await fetchCaptions(selectedTrack);
  const segments = parseCaptionsXml(captionXml);
  
  if (segments.length === 0) return null;
  
  const videoInfo = getVideoInfo();
  
  const text = segments.map((s) => s.text).join("\n\n");
  
  return {
    videoId,
    title: videoInfo?.title || document.title,
    channel: videoInfo?.channel,
    duration: videoInfo?.duration,
    language: selectedTrack.languageCode,
    source: "captions",
    segments,
    text,
  };
}
