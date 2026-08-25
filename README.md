# YouTube Transcript

**把任何 YouTube 视频变成可搜索、可导出的文字稿——完全在你的电脑上完成。**

粘贴视频链接，自动获取官方字幕；视频没有字幕？内置的 AI 引擎直接在本地为你转录语音。无需注册、无需 API Key、音视频数据永不离开你的设备。

## 为什么用它

- **隐私优先**：转录由本机 AI 引擎（whisper.cpp）完成，不连接任何云端服务，适合处理敏感内容
- **无字幕也能转**：官方字幕抓不到时，自动切换本地 AI 语音识别，多语言视频都能处理
- **开箱即用**：安装包内置转录模型，装完就能离线工作
- **一次拖一批**：批量粘贴多个链接，排队逐个处理，挂机等结果

## 功能一览

| 功能 | 说明 |
|---|---|
| 🎯 单视频转录 | 粘贴链接 → 视频预览确认 → 一键获取字幕或 AI 转录 |
| 🤖 本地 AI 转录 | 5 档模型自由选择，速度与精度按需平衡 |
| 📦 批量队列 | 多链接串行处理，实时进度（下载速度 / 剩余时间 / 逐段进度） |
| 🗂 历史记录 | 本地数据库保存所有转录，支持关键词搜索与回看 |
| 📤 多格式导出 | TXT / SRT / JSON，原生保存对话框 |
| 🔍 转录内搜索 | 结果内快速定位，一键复制纯文本或带时间戳文本 |
| 🌐 中英双语 | 界面一键切换 |
| 🧩 Chrome 扩展 | 在 YouTube 页面侧边栏直接查看转录（可选安装） |

## 下载

| 你的设备 | 选择版本 | 说明 |
|---|---|---|
| Mac（Apple Silicon / M 系列） | `YouTube Transcript_2.0.0_small_aarch64.dmg` | **推荐**，速度与精度均衡 |
| Mac（Apple Silicon / M 系列） | `..._tiny_aarch64.dmg` | 追求速度、磁盘紧张 |
| Intel Mac | `..._small_x86_64.dmg` / `..._tiny_x86_64.dmg` | 老款 Intel 芯片 Mac |
| Windows 10 / 11 | `YouTube Transcript_2.0.0_small_setup.exe` | 同上 |

从 [Releases 页面](https://github.com/WooZH/youtube-transcript/releases) 下载最新版本。

所有安装包均已内置转录模型与 ffmpeg，**无需安装任何额外依赖**。

> 首次打开提示"未验证的开发者"：右键点击应用 → **打开**（macOS），或在 SmartScreen 提示中点"仍要运行"（Windows）。

## 快速上手

1. **粘贴链接**：把 YouTube 视频地址粘进输入框
2. **确认视频**：核对缩略图和标题，点击转录
3. **拿走结果**：字幕自动抓取；无字幕时点击"本地转录"，完成后复制或导出

## AI 模型怎么选

| 模型 | 体积 | 速度 | 精度 | 适合 |
|---|---|---|---|---|
| Tiny | 75 MB | ★★★★★ | ★★ | 快速预览内容、配置较低的电脑 |
| Base | 142 MB | ★★★★ | ★★★ | 日常轻量使用 |
| **Small** ⭐ | 464 MB | ★★★ | ★★★★ | **大多数人的最佳选择** |
| Medium | 1.5 GB | ★★ | ★★★★ | 追求更高准确率 |
| Large V3 | 3 GB | ★ | ★★★★★ | 精度优先，专业用途 |

模型可在应用内随时切换；未内置的模型会在首次使用时自动下载到本机。

## 常见问题

**需要联网吗？**
抓取字幕和下载音频需要联网（毕竟视频在 YouTube 上）；AI 转录本身完全离线。

**我的视频内容会被上传吗？**
不会。音频下载到本机临时目录，转录在本机完成，结束后临时文件自动清理。

**视频没有字幕怎么办？**
应用会自动检测并提示切换到本地 AI 转录，一键完成。

**Mac 上还需要安装什么？**
不需要。安装包已内置 ffmpeg 与转录模型，开箱即用。（仅从源码开发运行时才需要系统安装 ffmpeg）

---

## 面向开发者

<details>
<summary>技术架构</summary>

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

</details>

<details>
<summary>开发环境</summary>

前置要求：Node.js + npm、Rust 工具链、Python 3、ffmpeg；Python 依赖装在 `worker/.venv`（应用优先使用它）。

```bash
npm install
npm run dev            # 仅前端开发 (Vite)
npm run tauri dev      # 完整桌面应用开发模式
npm run lint           # oxlint 检查
npm run build          # 前端生产构建

# Chrome 扩展（apps/extension 有独立 package.json）
cd apps/extension && npm install && npm run build
```

</details>

<details>
<summary>打包分发</summary>

| 目标平台 | 命令 | 产物 |
|---|---|---|
| Apple Silicon (arm64) | `./build-app.sh tiny small` | 每个模型变体一个 DMG |
| Intel Mac (x86_64) | `TARGET=x86_64-apple-darwin ./build-app.sh small` | x86_64 DMG |
| Windows | GitHub Actions 手动触发 | NSIS 安装包（.exe） |

- Intel 构建需 Rosetta 2 与 x86_64 虚拟环境：
  ```bash
  arch -x86_64 /usr/bin/python3 -m venv worker/.venv-x86_64
  arch -x86_64 worker/.venv-x86_64/bin/pip install -r worker/requirements.txt
  ```
- Windows 构建在 GitHub Actions 上进行：Actions → **Build Windows Installer** → Run workflow → 选模型 → 下载 Artifacts
- 构建脚本从 `~/Library/Application Support/YouTube Transcript/models/whisper-cpp/` 读取本地模型，缺失时可手动下载：
  ```bash
  curl -L -o "$HOME/Library/Application Support/YouTube Transcript/models/whisper-cpp/ggml-tiny.bin" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
  ```

</details>

<details>
<summary>本地 HTTP API 与数据位置</summary>

桌面应用启动后在 `127.0.0.1:18923` 提供本地转录服务（供 Chrome 扩展或其他工具调用）：

| 端点 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/transcribe` | 发起转录任务，返回 requestId |
| `GET /api/progress/{id}` | 查询任务进度 |
| `POST /api/cancel/{id}` | 取消任务 |

数据存储（macOS）：

- 设置与数据库：`~/Library/Application Support/com.youtube-transcript.desktop/`
- Whisper 模型：`~/Library/Application Support/YouTube Transcript/models/whisper-cpp/`
- 转录临时文件：`~/Library/Caches/YouTube Transcript/jobs/`

</details>
