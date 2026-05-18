# WebOS — Development Roadmap

> A browser-based desktop environment that runs entirely in the browser — no server-side OS required. Think of it as a ChromeOS-like experience, built as a web app.

---

## Phase 1 — Desktop Shell (MVP)

**Goal:** A functional desktop environment with window management and app launcher.

- [ ] **Window Manager** — draggable, resizable windows with minimize/maximize/close controls
- [ ] **Taskbar / Dock** — pinned and running app indicators, window thumbnails
- [ ] **App Launcher / Start Menu** — searchable app grid with categories
- [ ] **Desktop** — wallpaper, icons, right-click context menu
- [ ] **Multi-workspace support** — virtual desktops with switchable contexts
- [ ] **PWA shell** — `manifest.json` + Service Worker for installability and offline shell

**Tech:** React / Vue 3, TypeScript, Vite, Zustand (state), Tailwind CSS, CSS Modules

**Deliverable:** A live preview at `localhost` that boots into a desktop with a few demo app windows.

---

## Phase 2 — Core Applications

**Goal:** Essential built-in apps that make the desktop usable day-to-day.

### File Manager
- [ ] Tree view + breadcrumb navigation
- [ ] Create, rename, delete, move files/folders
- [ ] Grid / list view toggles
- [ ] Drag-and-drop between folders
- [ ] Backend: Origin Private File System (OPFS) + IndexedDB for metadata

### Terminal
- [ ] xterm.js integration with Web Worker backend
- [ ] Built-in command set (`ls`, `cd`, `cat`, `mkdir`, `rm`, `echo`, `clear`, `help`)
- [ ] Tab support (multiple terminal sessions)
- [ ] Theme support (dracula, solarized, etc.)

### Settings Panel
- [ ] Wallpaper picker (solid colors, gradients, custom images)
- [ ] Theme switcher (light / dark / accent color)
- [ ] Language / locale
- [ ] Keyboard shortcuts configuration
- [ ] About / system info

### Text Editor
- [ ] Basic code/text editing with syntax highlighting (CodeMirror / Monaco)
- [ ] File open/save via File Manager integration
- [ ] Multiple tabs

**Deliverable:** A usable daily-driver desktop with 4+ functional apps.

---

## Phase 3 — Advanced Platform Features

**Goal:** Turn the desktop into a real platform.

- [ ] **App Store / App Catalog** — discover, install, and launch third-party web apps
  - Apps run in sandboxed iframes with `postMessage` IPC
  - Manifest format for app metadata (name, icon, permissions, entry point)
- [ ] **Drag-and-Drop** — drag files from File Manager into apps, cross-app file transfers
- [ ] **Notification Center** — stacked notifications with do-not-disturb mode
- [ ] **Global Search** — ⌘+Space / Ctrl+Space (Spotlight-style)
- [ ] **Clipboard Manager** — clipboard history with sync between apps
- [ ] **Lock Screen** — with PIN / password (client-side only, stored in IndexedDB)
- [ ] **Offline Support** — Service Worker cache strategies for all built-in apps
- [ ] **Screenshot Tool** — capture region, window, or full desktop

**Deliverable:** Feature-complete desktop platform ready for third-party app development.

---

## Phase 4 — Ecosystem & Polish

**Goal:** Enable third-party development and production-ready quality.

- [ ] **WebOS SDK** — publish `@webos/sdk` with:
  - `create-webos-app` scaffolding CLI
  - IPC client library for app-to-desktop communication
  - DevTools panel for debugging apps
- [ ] **App Permissions System** — granular controls (filesystem, notifications, clipboard, network)
- [ ] **Keyboard Shortcut Manager** — user-configurable global and per-app shortcuts
- [ ] **Multi-user Profiles** — isolated IndexedDB stores per profile
- [ ] **Themes & Extensions System** — community-contributed themes via CSS vars
- [ ] **Performance Optimization**
  - Virtual scrolling for file lists
  - Window composition with `will-change` and GPU acceleration
  - Lazy-loading unused apps from memory
- [ ] **Accessibility** — screen reader support, keyboard navigation, high-contrast mode
- [ ] **i18n** — full internationalization framework with community translations

**Deliverable:** Developer docs, CLI tools, and a prototype app store with at least one sample third-party app.

---

## Future / Stretch Goals

- [ ] **Collaborative Desktop** — WebRTC-based shared sessions (pair programming, remote help)
- [ ] **Cloud Sync** — optional backend to sync desktop state across devices
- [ ] **Mobile/Tablet Layout** — responsive shell for smaller screens
- [ ] **Docker/Container Integration** — run real Linux containers via WASM or remote API
- [ ] **WebAssembly Runtime** — run native-compiled apps in the browser via WASM

---

## Technical Stack (Recommended)

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| UI Framework | React 18+ (or Vue 3) |
| Build Tool | Vite |
| State Management | Zustand / Jotai |
| Window Manager | Custom (React Portal + CSS transforms) |
| Terminal | xterm.js |
| Text Editor | CodeMirror 6 |
| Virtual FS | OPFS + IndexedDB |
| Styling | Tailwind CSS |
| PWA | Workbox + vite-plugin-pwa |
| Monorepo | pnpm workspaces |
| Testing | Vitest + Playwright |

---

## Milestones

| Milestone | Target | Description |
|-----------|--------|-------------|
| M1 | Phase 1 done | Desktop boots with windows and taskbar |
| M2 | Phase 2 done | 4 core apps functional |
| M3 | Phase 3 done | App store, notifications, lock screen |
| M4 | Phase 4 done | SDK published, third-party app demo |
| M5 | v1.0 | Stable, documented, public beta |

---

*This roadmap is a living document. Priorities may shift as the project evolves.*
