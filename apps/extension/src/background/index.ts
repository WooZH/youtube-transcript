chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_SIDEBAR") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  }

  if (message.type === "GET_VIDEO_ID") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url);
          let videoId = null;
          if (url.hostname === "www.youtube.com") {
            if (url.pathname.startsWith("/watch")) {
              videoId = url.searchParams.get("v");
            } else if (url.pathname.startsWith("/shorts/")) {
              videoId = url.pathname.split("/shorts/")[1];
            }
          }
          sendResponse({ videoId });
        } catch {
          sendResponse({ videoId: null });
        }
      } else {
        sendResponse({ videoId: null });
      }
    });
    return true;
  }

  if (message.type === "FETCH_CAPTIONS") {
    fetch(message.url)
      .then((r) => r.text())
      .then((text) => sendResponse({ text }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  if (message.type === "GET_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || null });
    });
    return true;
  }
});
