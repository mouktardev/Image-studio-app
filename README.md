<h1 align="center">
  <br>
  <picture>
    <source srcset="public/app-icon.png">
    <img alt="localstudio">
  </picture>
  <br>
  localstudio
  <br>
</h1>

Open-source desktop application for image and video optimization with AI-powered tools. Built for privacy - all processing happens locally on your device.

> [!WARNING]
> ⚠️ This is an experimental build and still contains bugs, unfinished features, and possible instability.

## Release

- Download latest release:
  <a href="https://github.com/mouktardev/localstudio/releases">
  <img src="https://img.shields.io/github/v/release/mouktardev/localstudio"
           alt="Current Version">
  </a>
  <a href="https://github.com/mouktardev/localstudio/releases">
  <img src="https://img.shields.io/badge/Windows-0078D6"
           alt="Windows Support">
  </a>
- Release notes: [https://github.com/mouktardev/localstudio/releases](https://github.com/mouktardev/localstudio/releases)
- Available now: Windows installers (`.exe`, `.msi`)
- Coming soon: macOS and Linux versions.

## Features

- **Image Compression** - Optimize images with adjustable quality settings and bounded concurrency
- **Video Compression** - Compress videos with quality presets (Ultra Fast to Very Slow) using FFmpeg
- **Format Conversion** - Convert images (JPEG, PNG, WebP) and videos (MP4, WebM, MOV, GIF) between formats
- **Background Removal** - AI-powered background removal for images and videos
- **Batch Processing** - Process multiple images/videos simultaneously with per-item progress tracking
- **AI-Powered upscale** - Local AI processing for image upscale
- **SQLite Database** - Persistent storage for image/video metadata and processing history
- **Auto-Updater** - Built-in update mechanism to keep the app current
- **Modern UI** - Clean, responsive interface with dark/light theme support
- **Privacy-First** - All processing happens locally - no data leaves your device

## AI Models and FFmpeg

LocalStudio uses small ONNX models for image AI tasks and FFmpeg for video processing. When you first run the app, you can choose which of these assets to download, and they are then cached locally in the app data directory so they are available offline afterward.

| Process                        | Model / Tool                     | Storage location                                    | Estimated size |
| ------------------------------ | -------------------------------- | --------------------------------------------------- | -------------- |
| Background removal             | Bria RMBG v1.4 (`bria-rmbg-1.4`) | App data folder → `models/briaai-RMBG-1.4.onnx`     | ~167 MB        |
| Image upscaling (2x)           | Real-ESRGAN x2 (`realesrgan-x2`) | App data folder → `models/swin2SR-classicalx2.onnx` | ~51 MB         |
| Image upscaling (4x)           | Real-ESRGAN x4 (`realesrgan-x4`) | App data folder → `models/swin2SR-realworldx4.onnx` | ~51 MB         |
| Video compression / conversion | ffmpeg + ffplay + ffprobe        | App data folder → `ffmpeg/`                         | ~291 MB        |

> Notes: The app will reuse the cached files when available instead of downloading them again.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Tauri v2 (Rust)
- **Database**: SQLite via SQLx
- **UI**: shadcn/ui, Tailwind CSS v4, Radix UI
- **State Management**: TinyBase
- **Routing**: TanStack Router

## License

MIT License - see [LICENSE](LICENSE) file for details.

### Roadmap (planned)

- [ ] Add image editor.
- [ ] Add video editor with advanced effects.

### Bugs (fix)

- gif upscale issue.
- webm video player not playing.
