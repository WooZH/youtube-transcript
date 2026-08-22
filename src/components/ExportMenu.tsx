import { useState, useEffect, useRef, useCallback } from "react";
import type { Transcript } from "../types/transcript";
import { exportTranscript } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import { useToast } from "./Toast";
import { Button } from "./primitives";

interface ExportMenuProps {
  transcript: Transcript;
}

type ExportFormat = "txt" | "srt" | "json";

const FORMATS: ExportFormat[] = ["txt", "srt", "json"];

export function ExportMenu({ transcript }: ExportMenuProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    try {
      await exportTranscript(transcript, format);
      showToast(t("exportSuccess"));
    } catch (error) {
      if (error !== "Export cancelled") {
        console.error("Export failed:", error);
        showToast(t("exportFailed"));
      }
    }
    setIsOpen(false);
  }, [transcript, showToast, t]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusIndex(0);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % FORMATS.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + FORMATS.length) % FORMATS.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleExport(FORMATS[focusIndex]);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusIndex, close, handleExport]);

  useEffect(() => {
    if (isOpen && optionRefs.current[focusIndex]) {
      optionRefs.current[focusIndex]?.focus();
    }
  }, [isOpen, focusIndex]);

  return (
    <div className="export-menu-container">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={() => { setIsOpen(!isOpen); setFocusIndex(0); }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {t("export")}
      </Button>

      {isOpen && (
        <>
          <div className="export-overlay" onClick={close} />
          <div ref={menuRef} className="export-menu" role="menu">
            {FORMATS.map((fmt, i) => (
              <button
                key={fmt}
                ref={(el) => { optionRefs.current[i] = el; }}
                onClick={() => handleExport(fmt)}
                className={`export-option ${i === focusIndex ? "export-option--focused" : ""}`}
                role="menuitem"
                tabIndex={-1}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
