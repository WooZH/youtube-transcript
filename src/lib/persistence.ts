import type { Transcript } from "../types/transcript";
import {
  saveTranscript,
  type TranscriptMetadata,
  type TranscriptData,
} from "./api";

function generateId(): string {
  return crypto.randomUUID();
}

export async function persistTranscript(
  transcript: Transcript,
  url?: string
): Promise<void> {
  try {
    const videoId = transcript.videoId;
    const now = Date.now();

    const metadata: TranscriptMetadata = {
      id: generateId(),
      videoId,
      url: url || `https://www.youtube.com/watch?v=${videoId}`,
      title: transcript.title,
      channel: transcript.channel,
      duration: transcript.duration,
      language: transcript.language,
      source: transcript.source,
      createdAt: now,
      updatedAt: now,
      status: "completed",
      downloadTime: transcript.downloadTime,
      transcribeTime: transcript.transcribeTime,
    };

    const data: TranscriptData = {
      videoId: transcript.videoId,
      title: transcript.title,
      channel: transcript.channel,
      duration: transcript.duration,
      language: transcript.language,
      source: transcript.source,
      segments: transcript.segments,
      text: transcript.text,
    };

    await saveTranscript(metadata, data);
  } catch (error) {
    console.error("Failed to persist transcript:", error);
  }
}
