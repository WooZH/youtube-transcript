import { useEffect, useState } from "react";
import type { VideoInfo } from "../types/transcript";
import { Button } from "./primitives";
import { useLanguage } from "../lib/i18n";
import { checkModelDownloaded } from "../lib/api";

interface NoCaptionsProps {
  videoInfo: VideoInfo;
  url: string;
  selectedModel: string;
  onTranscribe: (url: string) => void;
  onReset: () => void;
}

export function NoCaptions({ videoInfo, url, selectedModel, onTranscribe, onReset }: NoCaptionsProps) {
  const { t } = useLanguage();
  const [modelDownloaded, setModelDownloaded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    checkModelDownloaded(selectedModel)
      .then((ok) => {
        if (!cancelled) setModelDownloaded(ok);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedModel]);

  return (
    <div className="empty-state">
      <div className="empty-state-icon">🔇</div>
      <div className="empty-state-title">{t("noCaptions")}</div>
      <div className="empty-state-message">{t("noCaptionsDesc")}</div>

      <div className="empty-state-action">
        <Button
          variant="primary"
          onClick={() => onTranscribe(url)}
        >
          {t("transcribeLocal")}
        </Button>
      </div>

      {!modelDownloaded && (
        <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-tertiary)" }}>
          {t("whisperHint")}
        </div>
      )}

      <div style={{ marginTop: "var(--space-4)" }}>
        <Button variant="ghost" size="sm" onClick={onReset}>
          {t("tryAnother")}
        </Button>
      </div>

      <div className="no-captions-video-info">
        <span className="video-title-small">{videoInfo.title}</span>
      </div>
    </div>
  );
}
