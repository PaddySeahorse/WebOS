import { create } from 'zustand'

export interface DesktopBounds {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type AppId = 'welcome' | 'notes' | 'about' | 'settings'
export type AppCategory = 'System' | 'Productivity' | 'Utilities'

export interface AppDefinition {
  id: AppId
  title: string
  icon: string
  category: AppCategory
  description: string
  defaultSize: {
    width: number
    height: number
  }
}

export interface AppWindow extends Rect {
  id: string
  title: string
  app: AppId
  minimized: boolean
  maximized: boolean
  zIndex: number
  restoreRect?: Rect
}

export interface Workspace {
  id: string
  name: string
  windows: AppWindow[]
}

export interface WallpaperOption {
  id: string
  name: string
  background: string
}

interface WindowManagerState {
  workspaces: Workspace[]
  activeWorkspaceId: string
  pinnedAppIds: AppId[]
  currentWallpaperId: string
  windowSeed: number
  openApp: (appId: AppId, bounds: DesktopBounds) => void
  launchOrFocusApp: (appId: AppId, bounds: DesktopBounds) => void
  focusWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number, bounds: DesktopBounds) => void
  resizeWindow: (id: string, width: number, height: number, bounds: DesktopBounds) => void
  toggleMinimize: (id: string) => void
  restoreWindow: (id: string) => void
  toggleMaximize: (id: string, bounds: DesktopBounds) => void
  closeWindow: (id: string) => void
  switchWorkspace: (id: string) => void
  setWallpaper: (wallpaperId: string) => void
}

const MIN_WINDOW_WIDTH = 260
const MIN_WINDOW_HEIGHT = 180
const WINDOW_CASCADE_OFFSET = 26

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const nextZIndex = (windows: AppWindow[]) =>
  windows.reduce((maxZ, candidate) => Math.max(maxZ, candidate.zIndex), 0) + 1

export const APP_DEFINITIONS: AppDefinition[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: '🪟',
    category: 'System',
    description: 'Overview of desktop controls and shortcuts.',
    defaultSize: { width: 500, height: 340 },
  },
  {
    id: 'notes',
    title: 'Quick Notes',
    icon: '📝',
    category: 'Productivity',
    description: 'Capture rough notes while testing the shell.',
    defaultSize: { width: 430, height: 300 },
  },
  {
    id: 'about',
    title: 'About WebOS',
    icon: 'ℹ️',
    category: 'Utilities',
    description: 'Project status, stack, and roadmap progress.',
    defaultSize: { width: 410, height: 280 },
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: '⚙️',
    category: 'System',
    description: 'System settings placeholder for Phase 2.',
    defaultSize: { width: 440, height: 320 },
  },
]

const APP_LOOKUP = APP_DEFINITIONS.reduce<Record<AppId, AppDefinition>>((lookup, appDefinition) => {
  lookup[appDefinition.id] = appDefinition
  return lookup
}, {} as Record<AppId, AppDefinition>)

export const WALLPAPER_OPTIONS: WallpaperOption[] = [
  {
    id: 'aurora',
    name: 'Aurora Night',
    background:
      'radial-gradient(circle at 18% 22%, rgba(56, 189, 248, 0.22), transparent 40%), radial-gradient(circle at 85% 12%, rgba(251, 113, 133, 0.22), transparent 42%), radial-gradient(circle at 10% 90%, rgba(129, 140, 248, 0.18), transparent 35%), linear-gradient(150deg, #0b1222 0%, #101a31 55%, #11192b 100%)',
  },
  {
    id: 'sunrise',
    name: 'Sunrise Cloud',
    background:
      'radial-gradient(circle at 16% 18%, rgba(254, 249, 195, 0.35), transparent 38%), radial-gradient(circle at 88% 24%, rgba(253, 164, 175, 0.28), transparent 36%), linear-gradient(150deg, #3c3572 0%, #5a63b1 44%, #ea7a95 72%, #f9be77 100%)',
  },
  {
    id: 'forest',
    name: 'Forest Dawn',
    background:
      'radial-gradient(circle at 22% 18%, rgba(134, 239, 172, 0.24), transparent 40%), radial-gradient(circle at 80% 20%, rgba(110, 231, 183, 0.2), transparent 38%), linear-gradient(140deg, #041f17 0%, #0f3d31 50%, #1e5b46 100%)',
  },
]

export const WORKSPACE_PRESETS = [
  { id: 'workspace-1', name: 'Workspace 1' },
  { id: 'workspace-2', name: 'Workspace 2' },
  { id: 'workspace-3', name: 'Workspace 3' },
]

const getAppDefinition = (appId: AppId) => APP_LOOKUP[appId]

const createWindowForApp = (
  appId: AppId,
  seed: number,
  existingWindowCount: number,
  bounds: DesktopBounds,
  zIndex: number,
): AppWindow => {
  const appDefinition = getAppDefinition(appId)

  const maxWidth = Math.max(MIN_WINDOW_WIDTH, bounds.width - 28)
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT, bounds.height - 28)

  const width = clamp(appDefinition.defaultSize.width, MIN_WINDOW_WIDTH, maxWidth)
  const height = clamp(appDefinition.defaultSize.height, MIN_WINDOW_HEIGHT, maxHeight)

  const cascadeIndex = existingWindowCount % 6
  const x = clamp(72 + cascadeIndex * WINDOW_CASCADE_OFFSET, 0, Math.max(0, bounds.width - width))
  const y = clamp(66 + cascadeIndex * WINDOW_CASCADE_OFFSET, 0, Math.max(0, bounds.height - height))

  return {
    id: `${appId}-window-${seed}`,
    title: appDefinition.title,
    app: appId,
    x,
    y,
    width,
    height,
    minimized: false,
    maximized: false,
    zIndex,
  }
}

const updateWorkspaceWindows = (
  workspaces: Workspace[],
  activeWorkspaceId: string,
  updateWindows: (windows: AppWindow[]) => AppWindow[],
) =>
  workspaces.map((workspace) =>
    workspace.id === activeWorkspaceId ? { ...workspace, windows: updateWindows(workspace.windows) } : workspace,
  )

const starterBounds: DesktopBounds = {
  width: 1120,
  height: 760,
}

const initialPrimaryWindows: AppWindow[] = [
  createWindowForApp('welcome', 1, 0, starterBounds, 1),
  createWindowForApp('notes', 2, 1, starterBounds, 2),
]

const initialWorkspaces: Workspace[] = WORKSPACE_PRESETS.map((workspace) => ({
  ...workspace,
  windows: workspace.id === 'workspace-1' ? initialPrimaryWindows : [],
}))

export const useWindowManagerStore = create<WindowManagerState>((set, get) => ({
  workspaces: initialWorkspaces,
  activeWorkspaceId: WORKSPACE_PRESETS[0].id,
  pinnedAppIds: ['welcome', 'notes', 'about', 'settings'],
  currentWallpaperId: WALLPAPER_OPTIONS[0].id,
  windowSeed: 2,

  openApp: (appId, bounds) => {
    set((state) => {
      const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)

      if (!activeWorkspace) {
        return state
      }

      const nextSeed = state.windowSeed + 1
      const newWindow = createWindowForApp(
        appId,
        nextSeed,
        activeWorkspace.windows.length,
        bounds,
        nextZIndex(activeWorkspace.windows),
      )

      return {
        windowSeed: nextSeed,
        workspaces: updateWorkspaceWindows(state.workspaces, state.activeWorkspaceId, (windows) => [
          ...windows,
          newWindow,
        ]),
      }
    })
  },

  launchOrFocusApp: (appId, bounds) => {
    set((state) => {
      const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)

      if (!activeWorkspace) {
        return state
      }

      const windowsForApp = activeWorkspace.windows
        .filter((windowData) => windowData.app === appId)
        .sort((first, second) => second.zIndex - first.zIndex)

      if (windowsForApp.length === 0) {
        const nextSeed = state.windowSeed + 1
        const newWindow = createWindowForApp(
          appId,
          nextSeed,
          activeWorkspace.windows.length,
          bounds,
          nextZIndex(activeWorkspace.windows),
        )

        return {
          windowSeed: nextSeed,
          workspaces: updateWorkspaceWindows(state.workspaces, state.activeWorkspaceId, (windows) => [
            ...windows,
            newWindow,
          ]),
        }
      }

      const targetWindowId = windowsForApp[0].id
      const topZIndex = nextZIndex(activeWorkspace.windows)

      return {
        workspaces: updateWorkspaceWindows(state.workspaces, state.activeWorkspaceId, (windows) =>
          windows.map((windowData) =>
            windowData.id === targetWindowId
              ? {
                  ...windowData,
                  minimized: false,
                  zIndex: topZIndex,
                }
              : windowData,
          ),
        ),
      }
    })
  },

  focusWindow: (id) => {
    const { workspaces, activeWorkspaceId } = get()
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)

    if (!activeWorkspace) {
      return
    }

    const topZIndex = nextZIndex(activeWorkspace.windows)

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.map((windowData) =>
          windowData.id === id ? { ...windowData, minimized: false, zIndex: topZIndex } : windowData,
        ),
      ),
    })
  },

  moveWindow: (id, x, y, bounds) => {
    const { workspaces, activeWorkspaceId } = get()

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.map((windowData) => {
          if (windowData.id !== id || windowData.maximized) {
            return windowData
          }

          const maxX = Math.max(0, bounds.width - windowData.width)
          const maxY = Math.max(0, bounds.height - windowData.height)

          return {
            ...windowData,
            x: clamp(x, 0, maxX),
            y: clamp(y, 0, maxY),
          }
        }),
      ),
    })
  },

  resizeWindow: (id, width, height, bounds) => {
    const { workspaces, activeWorkspaceId } = get()

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.map((windowData) => {
          if (windowData.id !== id || windowData.maximized) {
            return windowData
          }

          const maxWidth = Math.max(MIN_WINDOW_WIDTH, bounds.width - windowData.x)
          const maxHeight = Math.max(MIN_WINDOW_HEIGHT, bounds.height - windowData.y)

          return {
            ...windowData,
            width: clamp(width, MIN_WINDOW_WIDTH, maxWidth),
            height: clamp(height, MIN_WINDOW_HEIGHT, maxHeight),
          }
        }),
      ),
    })
  },

  toggleMinimize: (id) => {
    const { workspaces, activeWorkspaceId } = get()

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.map((windowData) =>
          windowData.id === id
            ? {
                ...windowData,
                minimized: !windowData.minimized,
              }
            : windowData,
        ),
      ),
    })
  },

  restoreWindow: (id) => {
    const { workspaces, activeWorkspaceId } = get()
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)

    if (!activeWorkspace) {
      return
    }

    const topZIndex = nextZIndex(activeWorkspace.windows)

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.map((windowData) =>
          windowData.id === id
            ? {
                ...windowData,
                minimized: false,
                zIndex: topZIndex,
              }
            : windowData,
        ),
      ),
    })
  },

  toggleMaximize: (id, bounds) => {
    const { workspaces, activeWorkspaceId } = get()
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)

    if (!activeWorkspace) {
      return
    }

    const topZIndex = nextZIndex(activeWorkspace.windows)

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.map((windowData) => {
          if (windowData.id !== id) {
            return windowData
          }

          if (windowData.maximized && windowData.restoreRect) {
            return {
              ...windowData,
              ...windowData.restoreRect,
              maximized: false,
              minimized: false,
              zIndex: topZIndex,
              restoreRect: undefined,
            }
          }

          return {
            ...windowData,
            x: 0,
            y: 0,
            width: bounds.width,
            height: bounds.height,
            maximized: true,
            minimized: false,
            zIndex: topZIndex,
            restoreRect: {
              x: windowData.x,
              y: windowData.y,
              width: windowData.width,
              height: windowData.height,
            },
          }
        }),
      ),
    })
  },

  closeWindow: (id) => {
    const { workspaces, activeWorkspaceId } = get()

    set({
      workspaces: updateWorkspaceWindows(workspaces, activeWorkspaceId, (windows) =>
        windows.filter((windowData) => windowData.id !== id),
      ),
    })
  },

  switchWorkspace: (id) => {
    const { workspaces } = get()

    if (!workspaces.some((workspace) => workspace.id === id)) {
      return
    }

    set({
      activeWorkspaceId: id,
    })
  },

  setWallpaper: (wallpaperId) => {
    if (!WALLPAPER_OPTIONS.some((wallpaperOption) => wallpaperOption.id === wallpaperId)) {
      return
    }

    set({
      currentWallpaperId: wallpaperId,
    })
  },
}))
