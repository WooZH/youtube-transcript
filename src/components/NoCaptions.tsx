import type { VideoInfo } from "../types/transcript";
import { ModelSelector, getSavedModel, saveModel } from "./ModelSelector";
import { useState } from "react";
import { useLanguage } from "../lib/i18n";

interface NoCaptionsProps {
  videoInfo: VideoInfo;
  url: string;
  onTranscribe: (url: string, model?: string) => void;
  onReset: () => void;
}

export function NoCaptions({ videoInfo, url, onTranscribe, onReset }: NoCaptionsProps) {
  const { t } = useLanguage();
  const [selectedModel, setSelectedModel] = useState(getSavedModel);

  return (
    <div className="no-captions-view">
      <div className="no-captions-icon">○</div>
      <h2 className="no-captions-title">{t("noCaptions")}</h2>
      <p className="no-captions-message">
        {t("noCaptionsDesc")}
      </p>

      <ModelSelector
        selectedModel={selectedModel}
        onSelect={(model) => {
          setSelectedModel(model);
          saveModel(model);
        }}
      />

      <div className="no-captions-actions">
        <button
          onClick={() => onTranscribe(url, selectedModel)}
          className="transcribe-button"
        >
          {t("transcribeLocal")}
        </button>
      </div>
      <p className="no-captions-hint">
        {t("whisperHint")}
      </p>
      <div className="no-captions-video-info">
        <span className="video-title-small">{videoInfo.title}</span>
      </div>
      <button onClick={onReset} className="retry-button">
        {t("tryAnother")}
      </button>
    </div>
  );
}
