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

export interface AppWindow extends Rect {
  id: string
  title: string
  app: 'welcome' | 'notes' | 'about'
  minimized: boolean
  maximized: boolean
  zIndex: number
  restoreRect?: Rect
}

interface WindowManagerState {
  windows: AppWindow[]
  focusWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number, bounds: DesktopBounds) => void
  resizeWindow: (id: string, width: number, height: number, bounds: DesktopBounds) => void
  toggleMinimize: (id: string) => void
  restoreWindow: (id: string) => void
  toggleMaximize: (id: string, bounds: DesktopBounds) => void
  closeWindow: (id: string) => void
}

const MIN_WINDOW_WIDTH = 260
const MIN_WINDOW_HEIGHT = 180

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const nextZIndex = (windows: AppWindow[]) =>
  windows.reduce((maxZ, candidate) => Math.max(maxZ, candidate.zIndex), 0) + 1

const initialWindows: AppWindow[] = [
  {
    id: 'welcome-window',
    title: 'Welcome',
    app: 'welcome',
    x: 88,
    y: 72,
    width: 480,
    height: 320,
    minimized: false,
    maximized: false,
    zIndex: 1,
  },
  {
    id: 'notes-window',
    title: 'Quick Notes',
    app: 'notes',
    x: 300,
    y: 170,
    width: 400,
    height: 270,
    minimized: false,
    maximized: false,
    zIndex: 2,
  },
]

export const useWindowManagerStore = create<WindowManagerState>((set, get) => ({
  windows: initialWindows,

  focusWindow: (id) => {
    const { windows } = get()
    const topZIndex = nextZIndex(windows)

    set({
      windows: windows.map((windowData) =>
        windowData.id === id ? { ...windowData, zIndex: topZIndex } : windowData,
      ),
    })
  },

  moveWindow: (id, x, y, bounds) => {
    const { windows } = get()

    set({
      windows: windows.map((windowData) => {
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
    })
  },

  resizeWindow: (id, width, height, bounds) => {
    const { windows } = get()

    set({
      windows: windows.map((windowData) => {
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
    })
  },

  toggleMinimize: (id) => {
    const { windows } = get()

    set({
      windows: windows.map((windowData) =>
        windowData.id === id
          ? {
              ...windowData,
              minimized: !windowData.minimized,
            }
          : windowData,
      ),
    })
  },

  restoreWindow: (id) => {
    const { windows } = get()
    const topZIndex = nextZIndex(windows)

    set({
      windows: windows.map((windowData) =>
        windowData.id === id
          ? {
              ...windowData,
              minimized: false,
              zIndex: topZIndex,
            }
          : windowData,
      ),
    })
  },

  toggleMaximize: (id, bounds) => {
    const { windows } = get()
    const topZIndex = nextZIndex(windows)

    set({
      windows: windows.map((windowData) => {
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
    })
  },

  closeWindow: (id) => {
    const { windows } = get()

    set({
      windows: windows.filter((windowData) => windowData.id !== id),
    })
  },
}))
