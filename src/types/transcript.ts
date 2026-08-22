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
  downloadTime?: number;
  transcribeTime?: number;
}

export interface VideoInfo {
  id: string;
  title: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  language?: string;
}

export interface ProgressUpdate {
  stage: string;
  progress: number;
  extra?: {
    elapsed_s?: number;
    eta_s?: number;
    speed?: string;
  };
}

export type JobState =
  | { type: "idle" }
  | { type: "preparing" }
  | { type: "fetching-metadata" }
  | { type: "video-info"; videoInfo: VideoInfo; url: string }
  | { type: "fetching-captions"; url: string }
  | { type: "no-captions"; url: string; videoInfo: VideoInfo }
  | { type: "downloading"; progress?: number; elapsed_s?: number; eta_s?: number; speed?: string }
  | { type: "loading-model" }
  | { type: "transcribing"; progress: number }
  | { type: "processing" }
  | { type: "complete"; transcript: Transcript }
  | { type: "cancelled" }
  | { type: "error"; message: string };

export type TranscriptionJobState =
  | "queued"
  | "fetching-metadata"
  | "fetching-captions"
  | "downloading"
  | "loading-model"
  | "transcribing"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TranscriptionJob {
  id: string;
  url: string;
  state: TranscriptionJobState;
  progress?: number;
  stage?: string;
  videoInfo?: VideoInfo;
  transcript?: Transcript;
  error?: string;
  elapsed_s?: number;
  eta_s?: number;
  speed?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type QueueState =
  | "idle"
  | "processing"
  | "paused"
  | "completed"
  | "failed";
