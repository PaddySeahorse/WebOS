import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ITerminalOptions } from '@xterm/xterm'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWindowManagerStore } from '../store/windowManagerStore'
import { USER_HOME_PATH, VfsError, type VfsWriteFileData, type VfsWriteFileOptions, vfs } from '../vfs'
import type {
  MainToWorkerMessage,
  SerializedWorkerError,
  WorkerToMainMessage,
  WorkerVfsRequestMessage,
} from './terminal/types'

interface TerminalTab {
  id: string
  title: string
  cwd: string
  prompt: string
}

interface TerminalRuntime {
  terminal: Terminal
  fitAddon: FitAddon
  inputBuffer: string
  history: string[]
  historyIndex: number
  prompt: string
}

type TerminalThemeId = 'dracula' | 'solarized-dark' | 'solarized-light' | 'nord'

const TERMINAL_THEME_OPTIONS: {
  id: TerminalThemeId
  label: string
  value: NonNullable<ITerminalOptions['theme']>
}[] = [
  {
    id: 'dracula',
    label: 'Dracula',
    value: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    value: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    value: {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#586e75',
      selectionBackground: '#eee8d5',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    value: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
  },
]

const FALLBACK_PROMPT = 'webos:~$ '

const toTerminalOutput = (value: string) => value.replace(/\n/g, '\r\n')

const isPrintableInput = (value: string) => /[\x20-\x7e]/.test(value)

const getThemeValue = (themeId: TerminalThemeId) => {
  return TERMINAL_THEME_OPTIONS.find((theme) => theme.id === themeId)?.value ?? TERMINAL_THEME_OPTIONS[0].value
}

const serializeError = (error: unknown): SerializedWorkerError => {
  if (error instanceof VfsError) {
    return {
      message: error.message,
      name: error.name,
      code: error.code,
    }
  }

  if (error instanceof Error) {
    const maybeCode = error as Error & { code?: string }

    return {
      message: error.message,
      name: error.name,
      code: maybeCode.code,
    }
  }

  return {
    message: String(error),
  }
}

const createTabId = () => `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const buildTabTitle = (index: number, cwd: string) => {
  if (cwd === USER_HOME_PATH) {
    return `Tab ${index} · ~`
  }

  if (cwd.startsWith(`${USER_HOME_PATH}/`)) {
    return `Tab ${index} · ~${cwd.slice(USER_HOME_PATH.length)}`
  }

  return `Tab ${index} · ${cwd}`
}

export function TerminalApp() {
  const systemTheme = useWindowManagerStore((state) => state.theme)
  const [themeId, setThemeId] = useState<TerminalThemeId>(
    systemTheme === 'light' ? 'solarized-light' : 'dracula',
  )
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [terminalFontSize, setTerminalFontSize] = useState(13)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const tabCounterRef = useRef(1)
  const workerRef = useRef<Worker | null>(null)
  const containerByTabRef = useRef(new Map<string, HTMLDivElement>())
  const runtimeByTabRef = useRef(new Map<string, TerminalRuntime>())

  const selectedTheme = useMemo(() => getThemeValue(themeId), [themeId])

  const applyThemeToAll = useCallback(() => {
    for (const runtime of runtimeByTabRef.current.values()) {
      runtime.terminal.options.theme = selectedTheme
    }
  }, [selectedTheme])

  const postMessageToWorker = useCallback((message: MainToWorkerMessage) => {
    workerRef.current?.postMessage(message)
  }, [])

  const writePrompt = useCallback((tabId: string, prompt: string) => {
    const runtime = runtimeByTabRef.current.get(tabId)

    if (!runtime) {
      return
    }

    runtime.prompt = prompt
    runtime.historyIndex = runtime.history.length
    runtime.terminal.write(prompt)
  }, [])

  const replaceCurrentInput = useCallback((runtime: TerminalRuntime, nextValue: string) => {
    runtime.inputBuffer = nextValue
    runtime.terminal.write('\u001b[2K\r')
    runtime.terminal.write(runtime.prompt + nextValue)
  }, [])

  const handleTerminalInput = useCallback(
    (tabId: string, rawInput: string) => {
      const runtime = runtimeByTabRef.current.get(tabId)

      if (!runtime) {
        return
      }

      if (rawInput === '\u001b[A') {
        if (runtime.history.length === 0) {
          return
        }

        runtime.historyIndex = Math.max(0, runtime.historyIndex - 1)
        replaceCurrentInput(runtime, runtime.history[runtime.historyIndex] ?? '')
        return
      }

      if (rawInput === '\u001b[B') {
        if (runtime.history.length === 0) {
          return
        }

        runtime.historyIndex = Math.min(runtime.history.length, runtime.historyIndex + 1)
        const nextValue =
          runtime.historyIndex >= runtime.history.length ? '' : runtime.history[runtime.historyIndex] ?? ''
        replaceCurrentInput(runtime, nextValue)
        return
      }

      if (rawInput === '\u0003') {
        runtime.inputBuffer = ''
        runtime.historyIndex = runtime.history.length
        runtime.terminal.write('^C\r\n')
        runtime.terminal.write(runtime.prompt)
        return
      }

      for (const character of rawInput) {
        if (character === '\r') {
          const command = runtime.inputBuffer
          runtime.inputBuffer = ''

          if (command.trim()) {
            runtime.history.push(command)
          }

          runtime.historyIndex = runtime.history.length
          runtime.terminal.write('\r\n')

          postMessageToWorker({
            type: 'command',
            sessionId: tabId,
            input: command,
          })

          continue
        }

        if (character === '\u007f') {
          if (!runtime.inputBuffer) {
            continue
          }

          runtime.inputBuffer = runtime.inputBuffer.slice(0, -1)
          runtime.terminal.write('\b \b')
          continue
        }

        if (!isPrintableInput(character)) {
          continue
        }

        runtime.inputBuffer += character
        runtime.terminal.write(character)
      }
    },
    [postMessageToWorker, replaceCurrentInput],
  )

  const createRuntimeForTab = useCallback(
    (tabId: string) => {
      const container = containerByTabRef.current.get(tabId)

      if (!container || runtimeByTabRef.current.has(tabId)) {
        return
      }

      const terminal = new Terminal({
        cursorBlink: true,
        theme: selectedTheme,
        fontSize: terminalFontSize,
        lineHeight: 1.3,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      })
      const fitAddon = new FitAddon()

      terminal.loadAddon(fitAddon)
      terminal.open(container)
      fitAddon.fit()

      terminal.onData((input) => {
        handleTerminalInput(tabId, input)
      })

      runtimeByTabRef.current.set(tabId, {
        terminal,
        fitAddon,
        inputBuffer: '',
        history: [],
        historyIndex: 0,
        prompt: FALLBACK_PROMPT,
      })
    },
    [handleTerminalInput, selectedTheme],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const runtime = runtimeByTabRef.current.get(tabId)
      runtime?.terminal.dispose()
      runtimeByTabRef.current.delete(tabId)
      containerByTabRef.current.delete(tabId)

      postMessageToWorker({
        type: 'session-close',
        sessionId: tabId,
      })

      setTabs((previousTabs) => {
        const closedIndex = previousTabs.findIndex((tab) => tab.id === tabId)
        const nextTabs = previousTabs.filter((tab) => tab.id !== tabId)

        if (activeTabId === tabId) {
          const fallbackTab = nextTabs[closedIndex] ?? nextTabs[closedIndex - 1] ?? null
          setActiveTabId(fallbackTab?.id ?? null)
        }

        return nextTabs.map((tab, index) => ({
          ...tab,
          title: buildTabTitle(index + 1, tab.cwd),
        }))
      })
    },
    [activeTabId, postMessageToWorker],
  )

  const createTab = useCallback(() => {
    const tabId = createTabId()
    const tabNumber = tabCounterRef.current
    tabCounterRef.current += 1

    setTabs((previousTabs) => [
      ...previousTabs,
      {
        id: tabId,
        title: buildTabTitle(tabNumber, USER_HOME_PATH),
        cwd: USER_HOME_PATH,
        prompt: FALLBACK_PROMPT,
      },
    ])

    setActiveTabId(tabId)
    postMessageToWorker({ type: 'session-create', sessionId: tabId })
  }, [postMessageToWorker])

  const handleVfsRequest = useCallback(
    async (message: WorkerVfsRequestMessage) => {
      const method = message.method
      const args = message.args

      try {
        let result: unknown

        switch (method) {
          case 'resolvePath': {
            const [inputPath, cwd] = args as [string, string | undefined]
            result = vfs.resolvePath(inputPath, cwd)
            break
          }
          case 'stat': {
            const [path] = args as [string]
            result = await vfs.stat(path)
            break
          }
          case 'list': {
            const [path] = args as [string]
            result = await vfs.list(path)
            break
          }
          case 'readFile': {
            const [path] = args as [string]
            result = await vfs.readFile(path)
            break
          }
          case 'mkdir': {
            const [path, options] = args as [string, { recursive?: boolean } | undefined]
            result = await vfs.mkdir(path, options)
            break
          }
          case 'delete': {
            const [path, options] = args as [string, { recursive?: boolean } | undefined]
            result = await vfs.delete(path, options)
            break
          }
          case 'writeFile': {
            const [path, data, options] = args as [string, VfsWriteFileData, VfsWriteFileOptions | undefined]
            result = await vfs.writeFile(path, data, options)
            break
          }
          default: {
            const exhaustiveMethod: never = method
            throw new Error(`Unhandled VFS method: ${String(exhaustiveMethod)}`)
          }
        }

        postMessageToWorker({
          type: 'vfs-response',
          requestId: message.requestId,
          ok: true,
          result,
        })
      } catch (error) {
        postMessageToWorker({
          type: 'vfs-response',
          requestId: message.requestId,
          ok: false,
          error: serializeError(error),
        })
      }
    },
    [postMessageToWorker],
  )

  useEffect(() => {
    void vfs.init()

    const runtimes = runtimeByTabRef.current
    const containers = containerByTabRef.current

    const worker = new Worker(new URL('./terminal/terminalWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const message = event.data

      if (message.type === 'vfs-request') {
        void handleVfsRequest(message)
        return
      }

      if (message.type === 'session-ready') {
        setTabs((previousTabs) =>
          previousTabs.map((tab, index) =>
            tab.id === message.sessionId
              ? {
                  ...tab,
                  cwd: message.cwd,
                  prompt: message.prompt,
                  title: buildTabTitle(index + 1, message.cwd),
                }
              : tab,
          ),
        )

        const runtime = runtimeByTabRef.current.get(message.sessionId)

        if (runtime) {
          runtime.terminal.write(toTerminalOutput(`${message.banner}\n`))
          writePrompt(message.sessionId, message.prompt)
        }

        return
      }

      if (message.type === 'command-result') {
        const runtime = runtimeByTabRef.current.get(message.sessionId)

        if (!runtime) {
          return
        }

        if (message.clear) {
          runtime.terminal.clear()
        }

        if (message.output) {
          runtime.terminal.write(toTerminalOutput(`${message.output}\n`))
        }

        writePrompt(message.sessionId, message.prompt)

        setTabs((previousTabs) =>
          previousTabs.map((tab, index) =>
            tab.id === message.sessionId
              ? {
                  ...tab,
                  cwd: message.cwd,
                  prompt: message.prompt,
                  title: buildTabTitle(index + 1, message.cwd),
                }
              : tab,
          ),
        )
      }
    }

    createTab()

    return () => {
      worker.terminate()
      workerRef.current = null

      for (const runtime of runtimes.values()) {
        runtime.terminal.dispose()
      }

      runtimes.clear()
      containers.clear()
    }
  }, [createTab, handleVfsRequest, writePrompt])

  useEffect(() => {
    for (const tab of tabs) {
      createRuntimeForTab(tab.id)
    }
  }, [tabs, createRuntimeForTab])

  useEffect(() => {
    for (const runtime of runtimeByTabRef.current.values()) {
      runtime.terminal.options.fontSize = terminalFontSize
      window.requestAnimationFrame(() => {
        runtime.fitAddon.fit()
      })
    }
  }, [terminalFontSize])

  useEffect(() => {
    applyThemeToAll()
  }, [applyThemeToAll])

  useEffect(() => {
    if (!activeTabId) {
      return
    }

    const runtime = runtimeByTabRef.current.get(activeTabId)

    if (!runtime) {
      return
    }

    window.requestAnimationFrame(() => {
      runtime.fitAddon.fit()
      runtime.terminal.focus()
    })
  }, [activeTabId, tabs.length])

  useEffect(() => {
    const root = rootRef.current

    if (!root) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!activeTabId) {
        return
      }

      const runtime = runtimeByTabRef.current.get(activeTabId)
      runtime?.fitAddon.fit()
    })

    resizeObserver.observe(root)

    return () => {
      resizeObserver.disconnect()
    }
  }, [activeTabId])

  const sendKey = (key: string) => {
    if (activeTabId) {
      handleTerminalInput(activeTabId, key)
    }
  }

  return (
    <div className="terminal-app" ref={rootRef}>
      <header className="terminal-toolbar">
        <div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`terminal-tab ${tab.id === activeTabId ? 'is-active' : ''}`}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span>{tab.title}</span>
              <span
                className="terminal-tab-close"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    closeTab(tab.id)
                  }
                }}
                aria-label={`Close ${tab.title}`}
              >
                ×
              </span>
            </button>
          ))}

          <button type="button" className="terminal-tab terminal-tab-add" onClick={createTab}>
            + New
          </button>
        </div>

        <div className="terminal-controls">
          <div className="terminal-zoom-controls">
            <button onClick={() => setTerminalFontSize(prev => Math.max(8, prev - 1))} title="Zoom Out">-</button>
            <span className="terminal-font-size">{terminalFontSize}px</span>
            <button onClick={() => setTerminalFontSize(prev => Math.min(30, prev + 1))} title="Zoom In">+</button>
          </div>

          <label className="terminal-theme-select">
            Theme
            <select value={themeId} onChange={(event) => setThemeId(event.target.value as TerminalThemeId)}>
              {TERMINAL_THEME_OPTIONS.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="terminal-touch-bar">
        <button onClick={() => sendKey('\u001b')}>Esc</button>
        <button onClick={() => sendKey('\t')}>Tab</button>
        <button onClick={() => sendKey('\u001b[A')}>↑</button>
        <button onClick={() => sendKey('\u001b[B')}>↓</button>
        <button onClick={() => sendKey('\u0003')}>Ctrl+C</button>
        <button onClick={() => sendKey('\u000c')}>Clear</button>
      </div>

      <div className="terminal-panels">
        {tabs.map((tab) => (
          <section
            key={tab.id}
            className={`terminal-panel ${tab.id === activeTabId ? 'is-active' : ''}`}
            aria-hidden={tab.id !== activeTabId}
          >
            <div
              className="terminal-screen"
              ref={(node) => {
                if (node) {
                  containerByTabRef.current.set(tab.id, node)
                  createRuntimeForTab(tab.id)
                } else {
                  containerByTabRef.current.delete(tab.id)
                }
              }}
            />
          </section>
        ))}

        {tabs.length === 0 && (
          <div className="terminal-empty-state">
            <p>No terminal tabs open.</p>
            <button type="button" onClick={createTab}>
              Open Terminal Tab
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
