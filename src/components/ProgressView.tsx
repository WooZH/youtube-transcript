import type { JobState } from "../types/transcript";
import { useLanguage } from "../lib/i18n";

interface ProgressViewProps {
  state: JobState;
  onCancel: () => void;
}

export function ProgressView({ state, onCancel }: ProgressViewProps) {
  const { t } = useLanguage();

  if (state.type === "idle" || state.type === "complete" || state.type === "error" || state.type === "cancelled") {
    return null;
  }

  const stage = state.type;
  const stageKey = stage === "fetching-metadata" ? "fetchingMetadata"
    : stage === "fetching-captions" ? "fetchingCaptions"
    : stage === "downloading" ? "downloading"
    : stage === "loading-model" ? "loadingModel"
    : stage === "transcribing" ? "transcribingStage"
    : stage === "processing" ? "processing"
    : "preparing";
  const label = t(stageKey as any);
  const progress = (state.type === "transcribing" || state.type === "downloading") ? state.progress : undefined;

  const elapsed_s = state.type === "downloading" ? state.elapsed_s : undefined;
  const eta_s = state.type === "downloading" ? state.eta_s : undefined;
  const speed = state.type === "downloading" ? state.speed : undefined;

  return (
    <div className="progress-view">
      <div className="progress-stage">{label}</div>

      {progress !== undefined && (
        <>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-percent">{Math.round(progress)}%</div>
        </>
      )}

      {elapsed_s !== undefined && (
        <div className="progress-timing">
          {elapsed_s !== undefined && (
            <span className="timing-elapsed">{t("elapsed")}: {formatTime(elapsed_s)}</span>
          )}
          {eta_s !== undefined && eta_s > 0 && (
            <span className="timing-eta">{t("remaining")}: {formatTime(eta_s)}</span>
          )}
          {speed && (
            <span className="timing-speed">{speed}</span>
          )}
        </div>
      )}

      {(stage === "preparing" ||
        stage === "fetching-metadata" ||
        stage === "fetching-captions" ||
        stage === "downloading" ||
        stage === "loading-model") && (
        <div className="progress-spinner" />
      )}

      <button onClick={onCancel} className="cancel-button">
        {t("cancel")}
      </button>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}
