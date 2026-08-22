import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Lang = "zh" | "en";

const translations = {
  // App.tsx
  appSubtitle: { zh: "从 YouTube 视频中提取字幕", en: "Extract transcripts from YouTube videos" },
  testWorker: { zh: "测试 Worker", en: "Test Worker" },
  tryAgain: { zh: "重试", en: "Try Again" },
  cancelled: { zh: "已取消", en: "Cancelled" },
  singleVideo: { zh: "单个视频", en: "Single Video" },
  batch: { zh: "批量", en: "Batch" },
  history: { zh: "历史记录", en: "History" },

  // UrlInput
  enterUrl: { zh: "请输入链接", en: "Please enter a URL" },
  validUrl: { zh: "请输入有效的 YouTube 链接", en: "Please enter a valid YouTube URL" },
  pasteUrl: { zh: "粘贴 YouTube 链接", en: "Paste YouTube URL" },
  transcribe: { zh: "转录", en: "Transcribe" },

  // ProgressView
  preparing: { zh: "准备中", en: "Preparing" },
  fetchingMetadata: { zh: "获取视频信息", en: "Fetching video info" },
  fetchingCaptions: { zh: "检查字幕", en: "Checking captions" },
  downloading: { zh: "下载音频", en: "Downloading audio" },
  loadingModel: { zh: "加载模型", en: "Loading model" },
  transcribingStage: { zh: "转录中", en: "Transcribing" },
  processing: { zh: "处理字幕", en: "Processing transcript" },
  elapsed: { zh: "已用时", en: "Elapsed" },
  remaining: { zh: "剩余", en: "Remaining" },
  cancel: { zh: "取消", en: "Cancel" },

  // VideoPreview
  back: { zh: "返回", en: "Back" },

  // NoCaptions
  noCaptions: { zh: "无可用字幕", en: "No captions available" },
  noCaptionsDesc: { zh: "此视频没有可用的 YouTube 字幕。", en: "This video doesn't provide usable YouTube captions." },
  transcribeLocal: { zh: "使用本地 Whisper 转录", en: "Transcribe with Local Whisper" },
  whisperHint: { zh: "本地 Whisper 转录需要下载一次模型。", en: "Local Whisper transcription requires a one-time model download." },
  tryAnother: { zh: "尝试其他视频", en: "Try Another Video" },

  // ModelSelector
  model: { zh: "模型", en: "Model" },
  tiny: { zh: "极速", en: "Tiny" },
  tinyDesc: { zh: "最快，基础精度。适合快速草稿。", en: "Fastest, basic accuracy. Good for quick drafts." },
  base: { zh: "基础", en: "Base" },
  baseDesc: { zh: "速度与质量的良好平衡。", en: "Good balance of speed and quality." },
  small: { zh: "推荐", en: "Small" },
  smallDesc: { zh: "推荐。精度好，速度合理。", en: "Recommended. Good accuracy, reasonable speed." },
  medium: { zh: "高精度", en: "Medium" },
  mediumDesc: { zh: "高精度，转录较慢。", en: "High accuracy, slower transcription." },
  large: { zh: "最佳", en: "Large V3" },
  largeDesc: { zh: "最佳精度，需要更多时间和内存。", en: "Best accuracy, requires more time and memory." },
  downloaded: { zh: "已下载", en: "Downloaded" },
  selectModel: { zh: "选择模型", en: "Select Model" },
  exportSuccess: { zh: "导出成功", en: "Export successful" },
  exportFailed: { zh: "导出失败", en: "Export failed" },
  speed: { zh: "速度", en: "Speed" },
  accuracy: { zh: "精度", en: "Accuracy" },

  // TranscriptView
  youtubeCaptions: { zh: "YouTube 字幕", en: "YouTube Captions" },
  whisperLabel: { zh: "Whisper", en: "Whisper" },
  copyText: { zh: "复制纯文本", en: "Copy text only" },
  copied: { zh: "已复制！", en: "Copied!" },
  copy: { zh: "复制", en: "Copy" },
  copyTimestamps: { zh: "带时间戳复制", en: "Copy with timestamps" },
  newBtn: { zh: "新建", en: "New" },

  // TranscriptSearch
  searchPlaceholder: { zh: "搜索字幕...", en: "Search transcript..." },
  prevMatch: { zh: "上一个", en: "Previous match" },
  nextMatch: { zh: "下一个", en: "Next match" },
  results: { zh: "条结果", en: "results" },

  // ExportMenu
  export: { zh: "导出", en: "Export" },

  // BatchView
  batchTitle: { zh: "批量转录", en: "Batch Transcription" },
  pasteUrls: { zh: "粘贴 YouTube 链接", en: "Paste YouTube URLs" },
  addUrls: { zh: "添加链接", en: "Add URLs" },
  exportAll: { zh: "全部导出", en: "Export All" },
  clearFinished: { zh: "清除已完成", en: "Clear Finished" },
  stopQueue: { zh: "停止队列", en: "Stop Queue" },
  startAll: { zh: "全部开始", en: "Start All" },
  cancelAll: { zh: "全部取消", en: "Cancel All" },
  queue: { zh: "队列", en: "Queue" },
  jobs: { zh: "个任务", en: "jobs" },
  emptyBatch: { zh: "在上方粘贴 YouTube 链接开始批量转录", en: "Paste YouTube URLs above to start batch transcription" },
  captions: { zh: "字幕", en: "Captions" },
  localWhisper: { zh: "本地 Whisper", en: "Local Whisper" },
  remove: { zh: "删除", en: "Remove" },
  retry: { zh: "重试", en: "Retry" },
  openTranscript: { zh: "查看字幕", en: "Open Transcript" },
  waiting: { zh: "等待中", en: "Waiting" },
  fetchingInfo: { zh: "获取信息", en: "Fetching info" },
  checkingCaptions: { zh: "检查字幕", en: "Checking captions" },
  downloadingAudio: { zh: "下载音频", en: "Downloading audio" },
  loadingModelState: { zh: "加载模型", en: "Loading model" },
  transcribingState: { zh: "转录中", en: "Transcribing" },
  processingState: { zh: "处理中", en: "Processing" },
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  invalidYouTubeUrl: { zh: "不是 YouTube 链接", en: "Not a YouTube URL" },
  invalidUrl: { zh: "无效链接", en: "Invalid URL" },
  videosAdded: { zh: "个视频已添加", en: "videos added" },
  urlsRejected: { zh: "个链接被拒绝", en: "URLs rejected" },

  // HistoryView
  historyTitle: { zh: "历史记录", en: "History" },
  refresh: { zh: "刷新", en: "Refresh" },
  searchHistory: { zh: "搜索字幕...", en: "Search transcripts..." },
  noMatch: { zh: "没有匹配的字幕", en: "No transcripts match your search" },
  noHistory: { zh: "暂无字幕。完成一次转录后会显示在这里。", en: "No transcripts yet. Complete a transcription to see it here." },
  today: { zh: "今天", en: "Today" },
  yesterday: { zh: "昨天", en: "Yesterday" },
  last7Days: { zh: "近 7 天", en: "Previous 7 Days" },
  older: { zh: "更早", en: "Older" },
  deleteConfirm: { zh: "删除", en: "Delete" },
  deleted: { zh: "已删除", en: "Deleted" },
  deleteFailed: { zh: "删除失败", en: "Delete failed" },
  loadError: { zh: "无法打开本地历史记录。", en: "Unable to open local history." },
  loadError2: { zh: "无法加载此字幕。", en: "This transcript could not be loaded." },
  dlLabel: { zh: "下载", en: "DL" },
  trLabel: { zh: "转录", en: "TR" },
} as const;

type TranslationKey = keyof typeof translations;

interface LanguageContextType {
  lang: Lang;
  toggle: () => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("yt-lang") as Lang) || "zh";
    } catch {
      return "zh";
    }
  });

  const toggle = useCallback(() => {
    setLang((prev) => {
      const next = prev === "zh" ? "en" : "zh";
      try { localStorage.setItem("yt-lang", next); } catch {}
      return next;
    });
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[key][lang];
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
