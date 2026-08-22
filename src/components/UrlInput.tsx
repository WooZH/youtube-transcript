import { useState, useCallback, forwardRef, useImperativeHandle, type KeyboardEvent } from "react";
import { useLanguage } from "../lib/i18n";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

export interface UrlInputHandle {
  getValue: () => string;
}

function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]+/,
  ];
  return patterns.some((p) => p.test(url));
}

export const UrlInput = forwardRef<UrlInputHandle, UrlInputProps>(
  function UrlInput({ onSubmit, disabled }, ref) {
    const { t } = useLanguage();
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");

    useImperativeHandle(ref, () => ({
      getValue: () => url.trim(),
    }));

    const submit = useCallback(() => {
      setError("");
      const trimmed = url.trim();
      if (!trimmed) { setError(t("enterUrl")); return; }
      if (!isValidYouTubeUrl(trimmed)) { setError(t("validUrl")); return; }
      onSubmit(trimmed);
    }, [url, onSubmit, t]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (e.key === "Enter") submit();
    }, [submit]);

    return (
      <div className="url-input-form">
        <div className="input-wrapper">
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            placeholder={t("pasteUrl")}
            disabled={disabled}
            className="url-input"
            autoFocus
          />
        </div>
        {error && <div className="input-error">{error}</div>}
      </div>
    );
  }
);
