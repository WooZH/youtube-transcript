import type { VideoInfo } from "../types/transcript";
import { formatDuration } from "../lib/utils";
import { useLanguage } from "../lib/i18n";

interface VideoPreviewProps {
  videoInfo: VideoInfo;
  onStartTranscribe: () => void;
  onReset: () => void;
}

export function VideoPreview({
  videoInfo,
  onStartTranscribe,
  onReset,
}: VideoPreviewProps) {
  const { t } = useLanguage();

  return (
    <div className="video-preview">
      <div className="video-preview-content">
        {videoInfo.thumbnail && (
          <img
            src={videoInfo.thumbnail}
            alt={videoInfo.title}
            className="video-thumbnail"
          />
        )}

        <div className="video-details">
          <h2 className="video-title">{videoInfo.title}</h2>

          {videoInfo.channel && (
            <div className="video-channel">{videoInfo.channel}</div>
          )}

          <div className="video-meta">
            {videoInfo.duration && (
              <span>{formatDuration(videoInfo.duration)}</span>
            )}
            {videoInfo.language && (
              <span className="meta-separator">
                {videoInfo.duration ? " · " : ""}
                {videoInfo.language}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="video-preview-actions">
        <button onClick={onStartTranscribe} className="transcribe-button">
          {t("transcribe")}
        </button>
        <button onClick={onReset} className="action-button">
          {t("back")}
        </button>
      </div>
    </div>
  );
}
