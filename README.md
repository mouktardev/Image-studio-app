# Image Studio

A modern desktop application for image compression and management built with Tauri, React, and SQLite.

## Features

- **Image Compression** - Compress images with bounded concurrency for optimal performance
- **SQLite Database** - Local storage for image metadata and compression history
- **Theme Support** - Light and dark mode with customizable themes
- **Modern UI** - Clean interface built with shadcn/ui components
- **Atomic File Operations** - Safe file saving to prevent data corruption

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Tauri (Rust)
- **Database**: SQLite (via rusqlite)
- **UI**: shadcn/ui, Tailwind CSS
- **State**: TinyBase

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) - Package manager
- [Rust](https://www.rust-lang.org/) - For Tauri backend
- [Node.js](https://nodejs.org/) - For development tools

### Installation

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev
```

### Building

```bash
# Build for production
bun run tauri build
```

## Usage

1. **Add Images** - Drag and drop or select images to add to the library
2. **Compress** - Select images and choose compression settings
3. **Manage** - View compression history and manage your image collection

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Roadmap

These are the next areas we're planning to improve:

- [ ] Add **AI-powered upscaling** (optional upscaling/compression presets)
- [ ] Improve **batch compression workflow** (progress UI + cancel support)

<!-- > Want to contribute? Open an issue or submit a pull request with your ideas! -->
