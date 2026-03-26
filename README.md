<h1 align="center">
  <br>
  <picture>
    <source srcset="public/app-icon.png">
    <img alt="Image Studio">
  </picture>
  <br>
  Image Studio
  <br>
</h1>

Open-source desktop application for image optimization with AI-powered tools. Built for privacy - all processing happens locally on your device.

## Release

- Download latest release:
  <a href="https://github.com/mouktardev/Image-studio-app/releases">
  <img src="https://img.shields.io/github/v/release/mouktardev/Image-studio-app"
           alt="Current Version">
  </a>
  <a href="https://github.com/mouktardev/Image-studio-app/releases">
  <img src="https://img.shields.io/badge/Windows-0078D6"
           alt="Windows Support">
  </a>
- Release notes: [https://github.com/mouktardev/Image-studio-app/releases](https://github.com/mouktardev/Image-studio-app/releases)
- Available now: Windows installers (`.exe`, `.msi`)
- Coming soon: macOS and Linux versions.

## Features

- **Image Compression** - Optimize images with adjustable quality settings and bounded concurrency
- **Batch Processing** - Process multiple images simultaneously with progress tracking
- **AI-Powered upscale** - Local AI processing for image upscale
- **SQLite Database** - Persistent storage for image metadata and compression history
- **Auto-Updater** - Built-in update mechanism to keep the app current
- **Modern UI** - Clean, responsive interface with dark/light theme support
- **Privacy-First** - All processing happens locally - no data leaves your device

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Tauri v2 (Rust)
- **Database**: SQLite via SQLx
- **UI**: shadcn/ui, Tailwind CSS v4, Radix UI
- **State Management**: TinyBase
- **Routing**: TanStack Router

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+) - Package manager
- [Rust](https://www.rust-lang.org/) - For Tauri backend
- [Node.js](https://nodejs.org/) (LTS) - For development tools

### Installation

```bash
# Clone the repository
git clone https://github.com/mouktardev/Image-studio-app.git
cd Image-studio-app

# Install dependencies
bun install

# Run in development mode
bun run tauri dev
```

### Building

```bash
# Build for production (creates installers)
bun run tauri build
```

## Usage

1. **Add Images** - Drag and drop images or use the file picker
2. **Configure Settings** - Adjust quality, format, and other options
3. **Process** - Compress or convert your images
4. **Export** - Save optimized images to your desired location

## Release

- Latest release: [![GitHub release](https://img.shields.io/github/v/release/mouktardev/Image-studio-app?style=flat-square)](https://github.com/mouktardev/Image-studio-app/releases/latest)

## Release Process

This project uses a streamlined release workflow:

### Step 1: Bump Version

Update the version across all configuration files:

```bash
# Auto-bump patch version (0.1.1 -> 0.1.2)
bun run bump --patch

# Or bump minor/major
bun run bump --minor  # 0.1.1 -> 0.2.0
bun run bump --major  # 0.1.1 -> 1.0.0

# Or specify exact version
bun run bump 0.2.0
```

This updates:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

### Step 2: Review & Commit

1. Review the version changes.
2. Stage and commit the changes.
3. Push to origin.

### Step 3: Push Tag

Create and push the version tag to trigger the GitHub Actions release:

```bash
bun run push-tag
```

This will:

- Create a git tag (e.g., `v0.1.2`)
- Push the tag to origin
- Trigger the release workflow that builds and publishes the app

### Automatic Releases

Pushing a tag automatically:

- Builds the app for Windows (NSIS and MSI installers)
- Creates a GitHub release with downloadable artifacts draft

## Scripts

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `bun run dev`          | Start development server        |
| `bun run build`        | Build frontend for production   |
| `bun run tauri dev`    | Start Tauri in development mode |
| `bun run tauri build`  | Build Tauri app for production  |
| `bun run bump --patch` | Bump patch version              |
| `bun run bump --minor` | Bump minor version              |
| `bun run bump --major` | Bump major version              |
| `bun run bump x.x.x`   | Set specific version            |
| `bun run push-tag`     | Create and push version tag     |
| `bun run lint`         | Run ESLint                      |
| `bun run lint:fix`     | Fix ESLint issues               |
| `bun run format`       | Format code with Prettier       |

## Project Structure

```
├── src/                   # Frontend React source
├── src-tauri/             # Tauri backend (Rust)
│   ├── src/               # Rust source code
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── scripts/               # Build and release scripts
├── .github/workflows/     # GitHub Actions
└── package.json           # Node dependencies
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

### Roadmap (planned)

- [ ] Add advanced **Format Conversion** options.
- [ ] Add image editor.
