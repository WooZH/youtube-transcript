import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../lib/i18n";
import { checkModelDownloaded } from "../lib/api";

export interface WhisperModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  speed: number;
  accuracy: number;
}

export const WHISPER_MODELS: WhisperModel[] = [
  { id: "tiny", name: "Tiny", size: "75 MB", sizeBytes: 75 * 1024 * 1024, speed: 5, accuracy: 2 },
  { id: "base", name: "Base", size: "142 MB", sizeBytes: 142 * 1024 * 1024, speed: 4, accuracy: 3 },
  { id: "small", name: "Small", size: "464 MB", sizeBytes: 464 * 1024 * 1024, speed: 3, accuracy: 4 },
  { id: "medium", name: "Medium", size: "1.5 GB", sizeBytes: 1500 * 1024 * 1024, speed: 2, accuracy: 4 },
  { id: "large-v3", name: "Large V3", size: "3 GB", sizeBytes: 3000 * 1024 * 1024, speed: 1, accuracy: 5 },
];

function RatingDots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="model-rating">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`rating-dot ${i < value ? "active" : ""}`} />
      ))}
    </span>
  );
}

interface ModelSelectorProps {
  selectedModel: string;
  onSelect: (modelId: string) => void;
}

const STORAGE_KEY = "youtube-transcript-model";

export function getSavedModel(): string {
  try { return localStorage.getItem(STORAGE_KEY) || "small"; } catch { return "small"; }
}

export function saveModel(modelId: string): void {
  try { localStorage.setItem(STORAGE_KEY, modelId); } catch {}
}

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});

  const current = WHISPER_MODELS.find((m) => m.id === selectedModel) || WHISPER_MODELS[2];

  useEffect(() => {
    let cancelled = false;
    async function checkAll() {
      const results: Record<string, boolean> = {};
      for (const m of WHISPER_MODELS) {
        try { results[m.id] = await checkModelDownloaded(m.id); } catch { results[m.id] = false; }
      }
      if (!cancelled) setDownloaded(results);
    }
    checkAll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className="model-selector-toggle" onClick={() => setOpen(true)} type="button">
        <span className="model-selector-label">{t("model")}:</span>
        <span className="model-selector-name">{current.name}</span>
        <span className="model-selector-size">{current.size}</span>
        {downloaded[current.id] && <span className="model-downloaded">✓</span>}
      </button>

      {open && createPortal(
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t("selectModel")}</h3>
              <button className="modal-close" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {WHISPER_MODELS.map((model) => (
                <button
                  key={model.id}
                  className={`modal-model-card ${model.id === selectedModel ? "selected" : ""}`}
                  onClick={() => { onSelect(model.id); setOpen(false); }}
                  type="button"
                >
                  <div className="modal-model-top">
                    <span className="modal-model-name">
                      {model.name}
                      {downloaded[model.id] && <span className="model-downloaded-tag">{t("downloaded")}</span>}
                    </span>
                    <span className="modal-model-size">{model.size}</span>
                  </div>
                  <div className="modal-model-ratings">
                    <span className="modal-model-rating">
                      {t("speed")} <RatingDots value={model.speed} />
                    </span>
                    <span className="modal-model-rating">
                      {t("accuracy")} <RatingDots value={model.accuracy} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
