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

# Chrome 扩展（apps/extension 有独立 package.json）
cd apps/extension && npm install && npm run build
```

## 打包分发

| 目标平台 | 命令 | 产物 |
|---|---|---|
| Apple Silicon (arm64) | `./build-app.sh tiny small` | 每个模型变体一个 DMG |
| Intel Mac (x86_64) | `TARGET=x86_64-apple-darwin ./build-app.sh small` | x86_64 DMG |
| Windows | GitHub Actions 手动触发 | NSIS 安装包（.exe） |

每个 DMG/安装包内置**指定的一款 Whisper 模型**，离线转录开箱即用；不传参数默认 `small`。

### 各平台前置条件

- **macOS (arm64)**：`worker/.venv` 虚拟环境 + 系统 PATH 中有 ffmpeg
- **macOS (Intel 构建)**：需安装 Rosetta 2，并用 x86_64 Python 建独立虚拟环境：
  ```bash
  arch -x86_64 /usr/bin/python3 -m venv worker/.venv-x86_64
  arch -x86_64 worker/.venv-x86_64/bin/pip install -r worker/requirements.txt
  ```
- **Windows**：无法从 macOS 交叉编译，通过 GitHub Actions 构建：
  1. 打开仓库 → Actions → **Build Windows Installer** → Run workflow
  2. 选择要内置的 Whisper 模型，等待构建完成
  3. 从 Artifacts 下载 NSIS 安装包（内置 ffmpeg.exe，无需用户安装依赖）

### 模型来源

构建脚本从本地模型目录读取（`~/Library/Application Support/YouTube Transcript/models/whisper-cpp/`），缺失时可手动下载：

```bash
curl -L -o "$HOME/Library/Application Support/YouTube Transcript/models/whisper-cpp/ggml-tiny.bin" \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
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
