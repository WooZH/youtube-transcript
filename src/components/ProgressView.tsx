import { Button } from "./primitives";
import { useLanguage } from "../lib/i18n";
import type { JobState } from "../types/transcript";

interface ProgressViewProps {
  state: JobState;
  onCancel: () => void;
}

export function ProgressView({ state, onCancel }: ProgressViewProps) {
  const { t } = useLanguage();

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const stageLabel = (() => {
    switch (state.type) {
      case "preparing": return t("preparing");
      case "fetching-metadata": return t("fetchingMetadata");
      case "fetching-captions": return t("fetchingCaptions");
      case "downloading": return t("downloading");
      case "loading-model": return t("loadingModel");
      case "transcribing": return t("transcribingStage");
      case "processing": return t("processing");
      default: return "";
    }
  })();

  const progress = (() => {
    if (state.type === "downloading") return state.progress ?? 0;
    if (state.type === "transcribing") return state.progress;
    return 0;
  })();

  const elapsed = (() => {
    if (state.type === "downloading") return state.elapsed_s;
    return undefined;
  })();

  const eta = (() => {
    if (state.type === "downloading") return state.eta_s;
    return undefined;
  })();

  return (
    <div className="progress-view">
      <div className="progress-stage">{stageLabel}</div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="progress-info">
        {elapsed !== undefined && (
          <span>{t("elapsed")}: {formatTime(elapsed)}</span>
        )}
        {eta !== undefined && (
          <span>{t("remaining")}: {formatTime(eta)}</span>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}
