# WebOS (Phase 1 — Task 1)

This workspace implements the first Phase 1 roadmap task:

- ✅ Window manager with draggable windows
- ✅ Resizable windows (bottom-right resize handle)
- ✅ Minimize / maximize / restore / close controls
- ✅ Z-index focus handling (active window comes to front)
- ✅ Two demo windows to validate behavior

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown by Vite (default: `http://localhost:5173`).

## Build check

```bash
npm run build
```

## Key implementation files

- `src/store/windowManagerStore.ts` — Zustand window state + actions
- `src/App.tsx` — desktop shell and window components
- `src/App.css` — desktop and window manager styling
