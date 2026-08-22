import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import { UrlInput, type UrlInputHandle } from "./components/UrlInput";
import { ProgressView } from "./components/ProgressView";
import { VideoPreview } from "./components/VideoPreview";
import { NoCaptions } from "./components/NoCaptions";
import { TranscriptView } from "./components/TranscriptView";
import { BatchView } from "./components/BatchView";
import { HistoryView } from "./components/HistoryView";
import { ModelSelector, getSavedModel, saveModel } from "./components/ModelSelector";
import { Button } from "./components/primitives";
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
  const urlInputRef = useRef<UrlInputHandle>(null);

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
            ref={urlInputRef}
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
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                const value = urlInputRef.current?.getValue();
                if (value) handleGetVideoInfo(value);
              }}
            >
              {t("transcribe")}
            </Button>
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
          selectedModel={selectedModel}
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
        <div className="error-state">
          <div className="error-state-icon">!</div>
          <div className="error-state-message">{state.message}</div>
          <Button variant="primary" size="lg" onClick={handleReset}>
            {t("tryAgain")}
          </Button>
        </div>
      );
    }

    if (state.type === "cancelled") {
      return (
        <div className="error-state">
          <div className="error-state-message">{t("cancelled")}</div>
          <Button variant="primary" size="lg" onClick={handleReset}>
            {t("tryAgain")}
          </Button>
        </div>
      );
    }

    return <ProgressView state={state} onCancel={handleCancel} />;
  };

  return (
    <div className="app">
      <header className="app-header">
        <nav className="app-nav">
          <Button
            variant="ghost"
            size="sm"
            active={viewMode === "single"}
            onClick={() => {
              setViewMode("single");
              setViewedTranscript(null);
            }}
          >
            {t("singleVideo")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            active={viewMode === "batch"}
            onClick={() => {
              setViewMode("batch");
              setViewedTranscript(null);
            }}
          >
            {t("batch")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            active={viewMode === "history"}
            onClick={() => {
              setViewMode("history");
              setViewedTranscript(null);
            }}
          >
            {t("history")}
          </Button>
        </nav>
        <Button variant="ghost" size="sm" onClick={toggle}>
          {lang === "zh" ? "EN" : "中"}
        </Button>
      </header>

      <main className="app-main">
        <div className="view-enter" key={viewMode}>
          {viewMode === "single" && renderSingleMode()}
          {viewMode === "batch" && (
            <BatchView onViewTranscript={handleViewTranscript} />
          )}
          {viewMode === "history" && (
            <HistoryView onViewTranscript={handleViewTranscript} />
          )}
        </div>
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
