import { useState, useEffect, useCallback } from "react";
import "./App.css";
import { UrlInput } from "./components/UrlInput";
import { ProgressView } from "./components/ProgressView";
import { VideoPreview } from "./components/VideoPreview";
import { NoCaptions } from "./components/NoCaptions";
import { TranscriptView } from "./components/TranscriptView";
import { BatchView } from "./components/BatchView";
import { HistoryView } from "./components/HistoryView";
import { ModelSelector, getSavedModel, saveModel } from "./components/ModelSelector";
import { useTranscription } from "./hooks/useTranscription";
import { persistTranscript } from "./lib/persistence";
import { LanguageProvider, useLanguage } from "./lib/i18n";
import { ToastProvider } from "./components/Toast";
import type { Transcript } from "./types/transcript";

type ViewMode = "single" | "batch" | "history";

function AppContent() {
  const { t, lang, toggle } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [viewedTranscript, setViewedTranscript] = useState<Transcript | null>(null);
  const [selectedModel, setSelectedModel] = useState(getSavedModel);

  const {
    state,
    handleGetVideoInfo,
    handleGetCaptions,
    handleTranscribeFromNoCaptions,
    handleCancel,
    handleReset,
  } = useTranscription();

  const persistIfNeeded = useCallback(async (transcript: Transcript, url?: string) => {
    try {
      await persistTranscript(transcript, url);
    } catch (error) {
      console.error("Failed to persist transcript:", error);
    }
  }, []);

  useEffect(() => {
    if (state.type === "complete") {
      persistIfNeeded(state.transcript);
    }
  }, [state, persistIfNeeded]);

  const handleViewTranscript = (transcript: Transcript) => {
    setViewedTranscript(transcript);
    setViewMode("single");
  };

  const handleBackFromTranscript = () => {
    setViewedTranscript(null);
    setViewMode("history");
  };

  const renderSingleMode = () => {
    if (viewedTranscript) {
      return (
        <TranscriptView
          transcript={viewedTranscript}
          onReset={handleBackFromTranscript}
        />
      );
    }

    if (state.type === "idle") {
      return (
        <div className="idle-view">
          <p className="app-subtitle">
            {t("appSubtitle")}
          </p>

          <UrlInput
            onSubmit={(url) => handleGetVideoInfo(url)}
            disabled={false}
          />

          <div className="idle-actions">
            <ModelSelector
              selectedModel={selectedModel}
              onSelect={(model) => {
                setSelectedModel(model);
                saveModel(model);
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector<HTMLInputElement>(".url-input");
                if (input?.value.trim()) handleGetVideoInfo(input.value.trim());
              }}
              className="transcribe-button"
            >
              {t("transcribe")}
            </button>
          </div>
        </div>
      );
    }

    if (state.type === "fetching-metadata") {
      return <ProgressView state={state} onCancel={handleReset} />;
    }

    if (state.type === "video-info") {
      return (
        <VideoPreview
          videoInfo={state.videoInfo}
          onStartTranscribe={() =>
            handleGetCaptions(state.url, state.videoInfo)
          }
          onReset={handleReset}
        />
      );
    }

    if (state.type === "fetching-captions") {
      return <ProgressView state={state} onCancel={handleReset} />;
    }

    if (state.type === "no-captions") {
      return (
        <NoCaptions
          videoInfo={state.videoInfo}
          url={state.url}
          onTranscribe={handleTranscribeFromNoCaptions}
          onReset={handleReset}
        />
      );
    }

    if (state.type === "complete") {
      return (
        <TranscriptView
          transcript={state.transcript}
          onReset={handleReset}
        />
      );
    }

    if (state.type === "error") {
      return (
        <div className="error-view">
          <div className="error-icon">!</div>
          <div className="error-message">{state.message}</div>
          <button onClick={handleReset} className="retry-button">
            {t("tryAgain")}
          </button>
        </div>
      );
    }

    if (state.type === "cancelled") {
      return (
        <div className="cancelled-view">
          <div className="cancelled-message">{t("cancelled")}</div>
          <button onClick={handleReset} className="retry-button">
            {t("tryAgain")}
          </button>
        </div>
      );
    }

    return <ProgressView state={state} onCancel={handleCancel} />;
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">YouTube Transcript</h1>
        <nav className="app-nav">
          <button
            onClick={() => {
              setViewMode("single");
              setViewedTranscript(null);
            }}
            className={`nav-button ${viewMode === "single" ? "nav-button-active" : ""}`}
          >
            {t("singleVideo")}
          </button>
          <button
            onClick={() => {
              setViewMode("batch");
              setViewedTranscript(null);
            }}
            className={`nav-button ${viewMode === "batch" ? "nav-button-active" : ""}`}
          >
            {t("batch")}
          </button>
          <button
            onClick={() => {
              setViewMode("history");
              setViewedTranscript(null);
            }}
            className={`nav-button ${viewMode === "history" ? "nav-button-active" : ""}`}
          >
            {t("history")}
          </button>
        </nav>
        <button onClick={toggle} className="lang-toggle">
          {lang === "zh" ? "EN" : "中"}
        </button>
      </header>

      <main className="app-main">
        {viewMode === "single" && renderSingleMode()}
        {viewMode === "batch" && (
          <BatchView onViewTranscript={handleViewTranscript} />
        )}
        {viewMode === "history" && (
          <HistoryView onViewTranscript={handleViewTranscript} />
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
