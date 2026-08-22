import { useState } from "react";
import type { Transcript } from "../types/transcript";
import { exportTranscript } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import { useToast } from "./Toast";

interface ExportMenuProps {
  transcript: Transcript;
}

export function ExportMenu({ transcript }: ExportMenuProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = async (format: "txt" | "srt" | "json") => {
    try {
      await exportTranscript(transcript, format);
      showToast(t("exportSuccess"));
    } catch (error) {
      if (error !== "Export cancelled") {
        console.error("Export failed:", error);
      }
    }
    setIsOpen(false);
  };

  return (
    <div className="export-menu-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="action-button"
      >
        {t("export")}
      </button>

      {isOpen && (
        <>
          <div className="export-overlay" onClick={() => setIsOpen(false)} />
          <div className="export-menu">
            <button onClick={() => handleExport("txt")} className="export-option">
              TXT
            </button>
            <button onClick={() => handleExport("srt")} className="export-option">
              SRT
            </button>
            <button onClick={() => handleExport("json")} className="export-option">
              JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
