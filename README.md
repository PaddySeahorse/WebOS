# WebOS (Phase 1 — Desktop Shell MVP)

This workspace now completes all Phase 1 roadmap items.

## ✅ Implemented in this milestone

- Window manager with drag / resize / minimize / maximize / close
- Taskbar / dock with:
  - pinned app shortcuts
  - running app indicators
  - hover window thumbnails for running apps
- App launcher / Start menu with:
  - search
  - app categories
  - launch shortcuts
- Desktop shell with:
  - wallpaper support
  - desktop icons
  - right-click context menu
- Multi-workspace support (3 virtual desktops with isolated window contexts)
- PWA shell:
  - `manifest.webmanifest`
  - `sw.js` service worker
  - installable metadata + offline shell caching

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown by Vite (default: `http://localhost:5173`).

## Build checks

```bash
npm run lint
npm run build
```

## Key implementation files

- `src/store/windowManagerStore.ts` — app catalog, workspaces, wallpaper, and window manager state/actions
- `src/App.tsx` — desktop shell UI (windows, taskbar/dock, launcher, context menu)
- `src/App.css` — shell and window styling
- `public/manifest.webmanifest` + `public/sw.js` — PWA install/offline shell
