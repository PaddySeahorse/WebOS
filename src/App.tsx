import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { AppWindow, DesktopBounds } from './store/windowManagerStore'
import { useWindowManagerStore } from './store/windowManagerStore'
import './App.css'

const MIN_DESKTOP_BOUNDS: DesktopBounds = {
  width: 800,
  height: 520,
}

function App() {
  const desktopRef = useRef<HTMLDivElement>(null)
  const [desktopBounds, setDesktopBounds] = useState<DesktopBounds>(MIN_DESKTOP_BOUNDS)

  const windows = useWindowManagerStore((state) => state.windows)
  const restoreWindow = useWindowManagerStore((state) => state.restoreWindow)

  useEffect(() => {
    const measureDesktop = () => {
      if (!desktopRef.current) {
        return
      }

      const { width, height } = desktopRef.current.getBoundingClientRect()
      setDesktopBounds({
        width: Math.max(MIN_DESKTOP_BOUNDS.width, Math.floor(width)),
        height: Math.max(MIN_DESKTOP_BOUNDS.height, Math.floor(height)),
      })
    }

    measureDesktop()

    const observer = new ResizeObserver(measureDesktop)

    if (desktopRef.current) {
      observer.observe(desktopRef.current)
    }

    window.addEventListener('resize', measureDesktop)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureDesktop)
    }
  }, [])

  const visibleWindows = useMemo(
    () =>
      windows
        .filter((windowData) => !windowData.minimized)
        .sort((first, second) => first.zIndex - second.zIndex),
    [windows],
  )

  const minimizedWindows = windows.filter((windowData) => windowData.minimized)

  return (
    <main className="desktop-shell" ref={desktopRef}>
      <div className="desktop-watermark">
        <h1>WebOS — Phase 1</h1>
        <p>Window Manager MVP: drag, resize, minimize, maximize, close.</p>
      </div>

      {visibleWindows.map((windowData) => (
        <WindowFrame key={windowData.id} windowData={windowData} desktopBounds={desktopBounds} />
      ))}

      {windows.length === 0 && (
        <div className="empty-state">
          <h2>No open windows</h2>
          <p>Window controls are working. Next task can wire these into a taskbar launcher.</p>
        </div>
      )}

      {minimizedWindows.length > 0 && (
        <div className="window-shelf" aria-label="Minimized windows">
          {minimizedWindows.map((windowData) => (
            <button
              type="button"
              key={windowData.id}
              className="shelf-item"
              onClick={() => restoreWindow(windowData.id)}
            >
              Restore: {windowData.title}
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

interface WindowFrameProps {
  windowData: AppWindow
  desktopBounds: DesktopBounds
}

function WindowFrame({ windowData, desktopBounds }: WindowFrameProps) {
  const focusWindow = useWindowManagerStore((state) => state.focusWindow)
  const moveWindow = useWindowManagerStore((state) => state.moveWindow)
  const resizeWindow = useWindowManagerStore((state) => state.resizeWindow)
  const toggleMinimize = useWindowManagerStore((state) => state.toggleMinimize)
  const toggleMaximize = useWindowManagerStore((state) => state.toggleMaximize)
  const closeWindow = useWindowManagerStore((state) => state.closeWindow)

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || windowData.maximized) {
      return
    }

    event.preventDefault()
    focusWindow(windowData.id)

    const startX = event.clientX
    const startY = event.clientY
    const initialX = windowData.x
    const initialY = windowData.y

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      moveWindow(windowData.id, initialX + deltaX, initialY + deltaY, desktopBounds)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || windowData.maximized) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    focusWindow(windowData.id)

    const startX = event.clientX
    const startY = event.clientY
    const initialWidth = windowData.width
    const initialHeight = windowData.height

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      resizeWindow(windowData.id, initialWidth + deltaX, initialHeight + deltaY, desktopBounds)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <article
      className={`window-frame ${windowData.maximized ? 'is-maximized' : ''}`}
      onPointerDown={() => focusWindow(windowData.id)}
      style={{
        left: `${windowData.x}px`,
        top: `${windowData.y}px`,
        width: `${windowData.width}px`,
        height: `${windowData.height}px`,
        zIndex: windowData.zIndex,
      }}
      role="dialog"
      aria-label={windowData.title}
    >
      <header
        className="window-titlebar"
        onPointerDown={beginDrag}
        onDoubleClick={() => toggleMaximize(windowData.id, desktopBounds)}
      >
        <span className="window-title">{windowData.title}</span>

        <div className="window-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            aria-label={`Minimize ${windowData.title}`}
            onClick={() => toggleMinimize(windowData.id)}
          >
            –
          </button>
          <button
            type="button"
            aria-label={windowData.maximized ? `Restore ${windowData.title}` : `Maximize ${windowData.title}`}
            onClick={() => toggleMaximize(windowData.id, desktopBounds)}
          >
            {windowData.maximized ? '❐' : '□'}
          </button>
          <button
            type="button"
            aria-label={`Close ${windowData.title}`}
            className="danger"
            onClick={() => closeWindow(windowData.id)}
          >
            ×
          </button>
        </div>
      </header>

      <section className="window-body">{renderWindowBody(windowData.app)}</section>

      {!windowData.maximized && (
        <div
          className="window-resize-handle"
          onPointerDown={beginResize}
          aria-hidden="true"
          title="Resize window"
        />
      )}
    </article>
  )
}

function renderWindowBody(app: AppWindow['app']) {
  if (app === 'welcome') {
    return (
      <div className="window-content">
        <h2>Desktop shell started ✅</h2>
        <ul>
          <li>Drag any window from the title bar.</li>
          <li>Resize from the lower-right corner.</li>
          <li>Use window controls for minimize, maximize/restore, and close.</li>
        </ul>
      </div>
    )
  }

  if (app === 'notes') {
    return (
      <div className="window-content">
        <h2>Quick Notes</h2>
        <p>
          This is a placeholder app window. In Phase 2 this can evolve into a full text editor.
        </p>
        <textarea
          defaultValue={`- MVP window manager is in place\n- Next task: taskbar / dock\n- Then app launcher`}
          aria-label="Quick notes"
        />
      </div>
    )
  }

  return (
    <div className="window-content">
      <h2>About</h2>
      <p>Demo app window.</p>
    </div>
  )
}

export default App
