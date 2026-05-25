import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from 'react'
import type { AppDefinition, AppId, AppWindow, DesktopBounds } from './store/windowManagerStore'
import {
  APP_DEFINITIONS,
  WALLPAPER_OPTIONS,
  useWindowManagerStore,
} from './store/windowManagerStore'
import { SettingsPanel } from './SettingsPanel'
import { FileManagerApp } from './apps/FileManagerApp'
import { TextEditorApp } from './apps/TextEditorApp'
import { TerminalApp } from './apps/TerminalApp'
import './App.css'

const MIN_DESKTOP_BOUNDS: DesktopBounds = {
  width: 960,
  height: 640,
}

const TASKBAR_HEIGHT = 58
const DESKTOP_ICON_APPS: AppId[] = ['files', 'terminal', 'editor', 'settings']

interface ContextMenuState {
  x: number
  y: number
}

function App() {
  const desktopRef = useRef<HTMLDivElement>(null)
  const [desktopBounds, setDesktopBounds] = useState<DesktopBounds>(MIN_DESKTOP_BOUNDS)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [launcherQuery, setLauncherQuery] = useState('')
  const [hoveredDockAppId, setHoveredDockAppId] = useState<AppId | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [clockLabel, setClockLabel] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  )

  const workspaces = useWindowManagerStore((state) => state.workspaces)
  const activeWorkspaceId = useWindowManagerStore((state) => state.activeWorkspaceId)
  const pinnedAppIds = useWindowManagerStore((state) => state.pinnedAppIds)
  const currentWallpaperId = useWindowManagerStore((state) => state.currentWallpaperId)
  const theme = useWindowManagerStore((state) => state.theme)
  const accentColor = useWindowManagerStore((state) => state.accentColor)

  const openApp = useWindowManagerStore((state) => state.openApp)
  const launchOrFocusApp = useWindowManagerStore((state) => state.launchOrFocusApp)
  const restoreWindow = useWindowManagerStore((state) => state.restoreWindow)
  const focusWindow = useWindowManagerStore((state) => state.focusWindow)
  const switchWorkspace = useWindowManagerStore((state) => state.switchWorkspace)
  const setWallpaper = useWindowManagerStore((state) => state.setWallpaper)

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockLabel(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }, 15000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const closeFloatingPanels = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null

      if (!target) {
        return
      }

      if (launcherOpen && !target.closest('.launcher-panel') && !target.closest('.start-button')) {
        setLauncherOpen(false)
      }

      if (contextMenu && !target.closest('.desktop-context-menu')) {
        setContextMenu(null)
      }
    }

    window.addEventListener('pointerdown', closeFloatingPanels)

    return () => {
      window.removeEventListener('pointerdown', closeFloatingPanels)
    }
  }, [launcherOpen, contextMenu])

  const windowBounds = useMemo<DesktopBounds>(
    () => ({
      width: desktopBounds.width,
      height: Math.max(420, desktopBounds.height - TASKBAR_HEIGHT - 10),
    }),
    [desktopBounds],
  )

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      workspaces[0] ?? {
        id: 'workspace-fallback',
        name: 'Workspace',
        windows: [],
      },
    [workspaces, activeWorkspaceId],
  )

  const windows = activeWorkspace.windows

  const visibleWindows = useMemo(
    () =>
      windows
        .filter((windowData) => !windowData.minimized)
        .sort((first, second) => first.zIndex - second.zIndex),
    [windows],
  )

  const runningWindowsByApp = useMemo(() => {
    return windows.reduce<Record<AppId, AppWindow[]>>(
      (lookup, windowData) => {
        lookup[windowData.app].push(windowData)
        return lookup
      },
      {
        welcome: [],
        notes: [],
        about: [],
        settings: [],
        files: [],
        terminal: [],
        editor: [],
      },
    )
  }, [windows])

  const runningAppIds = useMemo(
    () =>
      Object.entries(runningWindowsByApp)
        .filter(([, appWindows]) => appWindows.length > 0)
        .map(([appId]) => appId as AppId),
    [runningWindowsByApp],
  )

  const dockAppIds = useMemo(() => {
    const all = [...pinnedAppIds, ...runningAppIds]
    return all.filter((appId, index) => all.indexOf(appId) === index)
  }, [pinnedAppIds, runningAppIds])

  const wallpaper = WALLPAPER_OPTIONS.find((wallpaperOption) => wallpaperOption.id === currentWallpaperId)

  const filteredApps = useMemo(() => {
    const query = launcherQuery.trim().toLowerCase()

    if (!query) {
      return APP_DEFINITIONS
    }

    return APP_DEFINITIONS.filter((appDefinition) => {
      const haystack = `${appDefinition.title} ${appDefinition.description} ${appDefinition.category}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [launcherQuery])

  const groupedLauncherApps = useMemo(() => {
    return filteredApps.reduce<Record<string, AppDefinition[]>>((groups, appDefinition) => {
      if (!groups[appDefinition.category]) {
        groups[appDefinition.category] = []
      }
      groups[appDefinition.category].push(appDefinition)
      return groups
    }, {})
  }, [filteredApps])

  const cycleWallpaper = () => {
    const currentIndex = WALLPAPER_OPTIONS.findIndex(
      (wallpaperOption) => wallpaperOption.id === currentWallpaperId,
    )
    const nextWallpaper = WALLPAPER_OPTIONS[(currentIndex + 1) % WALLPAPER_OPTIONS.length]
    setWallpaper(nextWallpaper.id)
  }

  const launchFromLauncher = (appId: AppId) => {
    launchOrFocusApp(appId, windowBounds)
    setLauncherOpen(false)
    setLauncherQuery('')
  }

  const launchFromDesktopIcon = (appId: AppId) => {
    openApp(appId, windowBounds)
    setContextMenu(null)
  }

  const handleDesktopContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement

    if (
      target.closest('.window-frame') ||
      target.closest('.taskbar') ||
      target.closest('.launcher-panel') ||
      target.closest('.desktop-context-menu')
    ) {
      return
    }

    event.preventDefault()
    setLauncherOpen(false)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    })
  }

  return (
    <main
      className="desktop-shell"
      style={
        {
          background: wallpaper?.background,
          '--accent-color': accentColor,
          '--window-bg':
            theme === 'dark' ? 'rgba(18, 24, 38, 0.92)' : 'rgba(240, 244, 255, 0.92)',
          '--text-color': theme === 'dark' ? '#e8f2ff' : '#1e293b',
          '--titlebar-bg':
            theme === 'dark'
              ? 'linear-gradient(180deg, rgba(48, 65, 101, 0.65), rgba(32, 45, 68, 0.8))'
              : 'linear-gradient(180deg, rgba(200, 210, 230, 0.65), rgba(180, 190, 210, 0.8))',
          '--border-color':
            theme === 'dark' ? 'rgba(144, 174, 215, 0.35)' : 'rgba(100, 120, 150, 0.35)',
        } as CSSProperties
      }
      ref={desktopRef}
      onContextMenu={handleDesktopContextMenu}
    >
      <div className="desktop-watermark">
        <h1>WebOS — Phase 2 Core Apps</h1>
        <p>{activeWorkspace.name} · VFS service layer is live with OPFS + IndexedDB storage.</p>
      </div>

      <aside className="desktop-icons" aria-label="Desktop icons">
        {DESKTOP_ICON_APPS.map((appId) => {
          const appDefinition = APP_DEFINITIONS.find((candidate) => candidate.id === appId)

          if (!appDefinition) {
            return null
          }

          return (
            <button
              key={appDefinition.id}
              type="button"
              className="desktop-icon"
              onDoubleClick={() => launchFromDesktopIcon(appDefinition.id)}
              title="Double-click to open"
            >
              <span className="desktop-icon-glyph" aria-hidden="true">
                {appDefinition.icon}
              </span>
              <span className="desktop-icon-label">{appDefinition.title}</span>
            </button>
          )
        })}
      </aside>

      {visibleWindows.map((windowData) => (
        <WindowFrame key={windowData.id} windowData={windowData} desktopBounds={windowBounds} />
      ))}

      {windows.length === 0 && (
        <div className="empty-state">
          <h2>No apps are open</h2>
          <p>Open apps from Start, desktop icons, or dock shortcuts.</p>
        </div>
      )}

      {launcherOpen && (
        <section className="launcher-panel" aria-label="Start menu">
          <header>
            <h2>App Launcher</h2>
            <input
              value={launcherQuery}
              onChange={(event) => setLauncherQuery(event.target.value)}
              placeholder="Search apps"
              aria-label="Search applications"
              autoFocus
            />
          </header>

          <div className="launcher-results">
            {Object.keys(groupedLauncherApps).length === 0 && (
              <p className="no-results">No matching apps for “{launcherQuery.trim()}”.</p>
            )}

            {(['System', 'Productivity', 'Utilities'] as const).map((categoryName) => {
              const appDefinitions = groupedLauncherApps[categoryName]

              if (!appDefinitions?.length) {
                return null
              }

              return (
                <section key={categoryName} className="launcher-category">
                  <h3>{categoryName}</h3>
                  <div className="launcher-grid">
                    {appDefinitions.map((appDefinition) => (
                      <button
                        key={appDefinition.id}
                        type="button"
                        className="launcher-item"
                        onClick={() => launchFromLauncher(appDefinition.id)}
                      >
                        <span className="launcher-item-icon" aria-hidden="true">
                          {appDefinition.icon}
                        </span>
                        <span className="launcher-item-title">{appDefinition.title}</span>
                        <span className="launcher-item-description">{appDefinition.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </section>
      )}

      {contextMenu && (
        <div
          className="desktop-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Desktop context menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setLauncherOpen(true)
              setContextMenu(null)
            }}
          >
            Open Start Menu
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openApp('notes', windowBounds)
              setContextMenu(null)
            }}
          >
            New Quick Note
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              cycleWallpaper()
              setContextMenu(null)
            }}
          >
            Next Wallpaper
          </button>
          <hr />
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="menuitemradio"
              aria-checked={workspace.id === activeWorkspaceId}
              onClick={() => {
                switchWorkspace(workspace.id)
                setContextMenu(null)
              }}
            >
              {workspace.id === activeWorkspaceId ? '✓ ' : ''}
              Switch to {workspace.name}
            </button>
          ))}
        </div>
      )}

      <footer className="taskbar">
        <div className="taskbar-left">
          <button
            type="button"
            className={`start-button ${launcherOpen ? 'is-open' : ''}`}
            onClick={() => {
              setLauncherOpen((isOpen) => !isOpen)
              setContextMenu(null)
            }}
          >
            ⊞ Start
          </button>

          <div className="workspace-switcher" aria-label="Workspaces">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                className={workspace.id === activeWorkspaceId ? 'is-active' : ''}
                onClick={() => {
                  switchWorkspace(workspace.id)
                  setContextMenu(null)
                }}
              >
                {workspace.name.split(' ')[1] ?? workspace.name}
              </button>
            ))}
          </div>
        </div>

        <nav className="dock" aria-label="Taskbar dock">
          {dockAppIds.map((appId) => {
            const appDefinition = APP_DEFINITIONS.find((candidate) => candidate.id === appId)

            if (!appDefinition) {
              return null
            }

            const appWindows = [...runningWindowsByApp[appId]].sort(
              (first, second) => second.zIndex - first.zIndex,
            )
            const isRunning = appWindows.length > 0
            const isPinned = pinnedAppIds.includes(appId)

            return (
              <div
                className="dock-item-wrapper"
                key={appId}
                onMouseEnter={() => setHoveredDockAppId(appId)}
                onMouseLeave={() => setHoveredDockAppId((current) => (current === appId ? null : current))}
              >
                <button
                  type="button"
                  className={`dock-item ${isRunning ? 'is-running' : ''}`}
                  onClick={() => launchOrFocusApp(appId, windowBounds)}
                  title={appDefinition.title}
                >
                  <span className="dock-item-icon" aria-hidden="true">
                    {appDefinition.icon}
                  </span>
                  <span className="dock-item-label">{appDefinition.title}</span>
                  {isRunning && <span className="running-indicator" aria-hidden="true" />}
                  {!isPinned && isRunning && (
                    <span className="running-count" aria-label={`${appWindows.length} running windows`}>
                      {appWindows.length}
                    </span>
                  )}
                </button>

                {hoveredDockAppId === appId && isRunning && (
                  <div className="thumbnail-popover" role="dialog" aria-label={`${appDefinition.title} windows`}>
                    {appWindows.map((windowData) => (
                      <button
                        type="button"
                        key={windowData.id}
                        className="thumbnail-item"
                        onClick={() => {
                          if (windowData.minimized) {
                            restoreWindow(windowData.id)
                          } else {
                            focusWindow(windowData.id)
                          }
                          setHoveredDockAppId(null)
                        }}
                      >
                        <strong>{windowData.title}</strong>
                        <span>{windowData.minimized ? 'Minimized' : 'Open'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="taskbar-clock" aria-label="Current time">
          {clockLabel}
        </div>
      </footer>
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
        <h2>Desktop shell is live ✅</h2>
        <ul>
          <li>Drag, resize, minimize, maximize, and close windows.</li>
          <li>Use the Start menu to search and launch apps by category.</li>
          <li>Switch virtual workspaces from the taskbar or desktop right-click menu.</li>
          <li>Hover dock items to view running-window thumbnails.</li>
        </ul>
      </div>
    )
  }

  if (app === 'notes') {
    return (
      <div className="window-content">
        <h2>Quick Notes</h2>
        <p>Placeholder app for typing rough notes while validating window behavior.</p>
        <textarea
          defaultValue={`- Phase 1 taskbar/dock complete\n- App launcher + categories complete\n- Desktop icons + context menu complete\n- Multi-workspace complete\n- PWA shell wired`}
          aria-label="Quick notes"
        />
      </div>
    )
  }

  if (app === 'settings') {
    return <SettingsPanel />
  }

  if (app === 'files') {
    return <FileManagerApp />
  }

  if (app === 'editor') {
    return <TextEditorApp />
  }

  if (app === 'terminal') {
    return <TerminalApp />
  }

  return (
    <div className="window-content">
      <h2>About WebOS</h2>
      <p>
        Browser desktop shell built with React + TypeScript + Zustand. This milestone finalizes Phase
        1 MVP experience.
      </p>
    </div>
  )
}

export default App
