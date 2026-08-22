# YouTube Transcript

一款 macOS 桌面应用，用于提取 YouTube 视频的转录文本/字幕。优先获取 YouTube 官方字幕（含自动生成字幕），无字幕时自动降级为本地 Whisper AI 离线转录——全程无需任何云服务或 API Key。

## 功能特性

- **单个视频转录**：粘贴链接 → 视频预览确认 → 抓取字幕；无字幕时可一键切换本地 Whisper 转录
- **本地 AI 转录**：基于 whisper.cpp 完全离线运行，支持 tiny/base/small/medium/large-v3 五档模型
- **批量模式**：多个 URL 排队串行处理
- **历史记录**：SQLite 本地存储，支持搜索与回看
- **导出**：TXT / SRT / JSON 三种格式，原生保存对话框
- **转录内搜索**与一键复制（纯文本 / 带时间戳）
- **实时进度**：音频下载（百分比/速度/剩余时间）、模型加载、逐段转录进度
- **中英双语界面**：一键切换

## 架构

```
React 前端 (src/)
    │  Tauri invoke + events
    ▼
Rust 后端 (src-tauri/)          Chrome 扩展 (apps/extension/)
    │  JSON Lines                    │  HTTP (127.0.0.1:18923)
    ▼  stdin/stdout 子进程           ▼
Python Worker (worker/)  ←──────────┘
  ├─ yt-dlp        音频下载 / 字幕抓取
  └─ pywhispercpp  本地 Whisper 转录
```

**技术栈**：React 19 + TypeScript + Vite 8 ｜ Tauri 2 (Rust: tokio / rusqlite / rfd) ｜ Python 3 (yt-dlp / pywhispercpp) ｜ Chrome Extension MV3

## 开发环境

### 前置要求

- Node.js + npm
- Rust 工具链
- Python 3 与 ffmpeg
- Python 依赖：`pip install -r worker/requirements.txt`（建议在 `worker/.venv` 建虚拟环境，应用会优先使用 `worker/.venv/bin/python3`）

### 常用命令

```bash
npm install

npm run dev            # 仅前端开发 (Vite)
npm run tauri dev      # 完整桌面应用开发模式
npm run lint           # oxlint 检查
npm run build          # 前端生产构建

npm run tauri build    # 生产构建桌面应用
./build-app.sh         # 构建 .app 并打包 worker/.venv 进 bundle，重打 DMG
                       # （注意：脚本内含本机绝对路径，需按环境调整）

# Chrome 扩展（apps/extension 有独立 package.json）
cd apps/extension && npm install && npm run build
```

## 本地 HTTP API

桌面应用启动后会在 `127.0.0.1:18923` 提供本地转录服务，供 Chrome 扩展或其他工具调用：

| 端点 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/transcribe` | 发起转录任务，返回 requestId |
| `GET /api/progress/{id}` | 查询任务进度 |
| `POST /api/cancel/{id}` | 取消任务 |

## 数据存储位置（macOS）

- 设置与数据库：`~/Library/Application Support/com.youtube-transcript.desktop/`
- Whisper 模型：`~/Library/Application Support/YouTube Transcript/models/whisper-cpp/`
- 转录临时文件：`~/Library/Caches/YouTube Transcript/jobs/`
