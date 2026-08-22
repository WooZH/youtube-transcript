export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  videoId: string;
  title: string;
  channel?: string;
  duration?: number;
  language?: string;
  source: "captions" | "whisper";
  segments: TranscriptSegment[];
  text: string;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: {
    simpleText: string;
  };
  kind?: string;
}
