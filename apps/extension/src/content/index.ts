import { getVideoId } from "../lib/captions";

let currentVideoId: string | null = null;

function createTranscriptButton(): HTMLDivElement {
  const button = document.createElement("div");
  button.id = "yt-transcript-button";
  button.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      background: #0d1117;
      color: #e6edf3;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: all 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    ">
      Transcript
    </div>
  `;

  button.addEventListener("mouseenter", () => {
    const div = button.firstElementChild as HTMLDivElement;
    if (div) div.style.background = "#1f2937";
  });

  button.addEventListener("mouseleave", () => {
    const div = button.firstElementChild as HTMLDivElement;
    if (div) div.style.background = "#0d1117";
  });

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_SIDEBAR" });
  });

  return button;
}

function removeTranscriptButton(): void {
  const existing = document.getElementById("yt-transcript-button");
  if (existing) existing.remove();
}

function setupTranscriptButton(): void {
  const videoId = getVideoId();

  if (videoId !== currentVideoId) {
    currentVideoId = videoId;

    removeTranscriptButton();

    if (videoId) {
      const button = createTranscriptButton();
      document.body.appendChild(button);
    }
  }
}

function observeNavigation(): void {
  const observer = new MutationObserver(() => {
    setupTranscriptButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setupTranscriptButton();
}

window.addEventListener("yt-navigate-finish", () => {
  setupTranscriptButton();
});

window.addEventListener("popstate", () => {
  setupTranscriptButton();
});

observeNavigation();
