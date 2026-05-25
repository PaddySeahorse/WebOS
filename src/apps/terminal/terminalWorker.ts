/// <reference lib="webworker" />

import type {
  MainToWorkerMessage,
  MainToWorkerVfsResponseMessage,
  SerializedWorkerError,
  TerminalVfsMethod,
  WorkerToMainCommandResultMessage,
  WorkerToMainMessage,
  WorkerToMainSessionReadyMessage,
} from './types'

const USER_HOME_PATH = '/home/webos-user'

interface WorkerVfsNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

interface SessionState {
  cwd: string
  queue: Promise<void>
}

const workerScope = self as DedicatedWorkerGlobalScope
const sessions = new Map<string, SessionState>()
const pendingRequests = new Map<string, PendingRequest>()
let requestSeed = 0

const decoder = new TextDecoder()

const postMessageToMain = (message: WorkerToMainMessage) => {
  workerScope.postMessage(message)
}

const toDisplayPath = (path: string) => {
  if (path === USER_HOME_PATH) {
    return '~'
  }

  if (path.startsWith(`${USER_HOME_PATH}/`)) {
    return `~${path.slice(USER_HOME_PATH.length)}`
  }

  return path
}

const createPrompt = (cwd: string) => `webos:${toDisplayPath(cwd)}$ `

const serializeError = (error: unknown): SerializedWorkerError => {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { message?: unknown; name?: unknown; code?: unknown }

    return {
      message:
        typeof maybeError.message === 'string'
          ? maybeError.message
          : 'Unknown VFS error from host process.',
      name: typeof maybeError.name === 'string' ? maybeError.name : undefined,
      code: typeof maybeError.code === 'string' ? maybeError.code : undefined,
    }
  }

  return {
    message: String(error),
  }
}

const callVfs = <TResult>(method: TerminalVfsMethod, args: unknown[]): Promise<TResult> => {
  const requestId = `vfs-${requestSeed}`
  requestSeed += 1

  postMessageToMain({
    type: 'vfs-request',
    requestId,
    method,
    args,
  })

  return new Promise<TResult>((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve: (value) => resolve(value as TResult),
      reject,
    })
  })
}

const resolvePath = (inputPath: string, cwd: string) => {
  return callVfs<string>('resolvePath', [inputPath, cwd])
}

const readFileAsText = async (path: string) => {
  const content = await callVfs<string | Uint8Array>('readFile', [path])

  if (typeof content === 'string') {
    return content
  }

  return decoder.decode(content)
}

const tokenizeCommand = (input: string): string[] => {
  const tokens: string[] = []
  let current = ''
  let quote: 'single' | 'double' | null = null
  let escapeNext = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (escapeNext) {
      current += char
      escapeNext = false
      continue
    }

    if (char === '\\' && quote !== 'single') {
      escapeNext = true
      continue
    }

    if (quote === 'single') {
      if (char === "'") {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (quote === 'double') {
      if (char === '"') {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === "'") {
      quote = 'single'
      continue
    }

    if (char === '"') {
      quote = 'double'
      continue
    }

    if (char === '>') {
      if (current) {
        tokens.push(current)
        current = ''
      }

      if (input[index + 1] === '>') {
        tokens.push('>>')
        index += 1
      } else {
        tokens.push('>')
      }
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

const runLs = async (cwd: string, args: string[]) => {
  const targetPath = await resolvePath(args[0] ?? '.', cwd)
  const node = await callVfs<WorkerVfsNode | null>('stat', [targetPath])

  if (!node) {
    throw new Error(`No such file or directory: ${args[0] ?? targetPath}`)
  }

  if (node.type === 'file') {
    return node.name
  }

  const entries = await callVfs<WorkerVfsNode[]>('list', [targetPath])

  if (entries.length === 0) {
    return ''
  }

  return entries
    .map((entry) => (entry.type === 'directory' ? `${entry.name}/` : entry.name))
    .join('  ')
}

const runCd = async (session: SessionState, args: string[]) => {
  const targetPath = await resolvePath(args[0] ?? USER_HOME_PATH, session.cwd)
  const node = await callVfs<WorkerVfsNode | null>('stat', [targetPath])

  if (!node) {
    throw new Error(`No such directory: ${args[0] ?? targetPath}`)
  }

  if (node.type !== 'directory') {
    throw new Error(`Not a directory: ${args[0] ?? targetPath}`)
  }

  session.cwd = targetPath
  return ''
}

const runCat = async (cwd: string, args: string[]) => {
  if (!args[0]) {
    throw new Error('Usage: cat <file>')
  }

  const filePath = await resolvePath(args[0], cwd)
  const node = await callVfs<WorkerVfsNode | null>('stat', [filePath])

  if (!node) {
    throw new Error(`No such file: ${args[0]}`)
  }

  if (node.type !== 'file') {
    throw new Error(`Not a file: ${args[0]}`)
  }

  return readFileAsText(filePath)
}

const runMkdir = async (cwd: string, args: string[]) => {
  if (args.length === 0) {
    throw new Error('Usage: mkdir [-p] <directory ...>')
  }

  let recursive = false
  const targets: string[] = []

  for (const token of args) {
    if (token === '-p') {
      recursive = true
      continue
    }

    targets.push(token)
  }

  if (targets.length === 0) {
    throw new Error('Usage: mkdir [-p] <directory ...>')
  }

  for (const target of targets) {
    const path = await resolvePath(target, cwd)
    await callVfs('mkdir', [path, { recursive }])
  }

  return ''
}

const runRm = async (cwd: string, args: string[]) => {
  if (args.length === 0) {
    throw new Error('Usage: rm [-r] <path ...>')
  }

  let recursive = false
  const targets: string[] = []

  for (const token of args) {
    if (token === '-r' || token === '-rf' || token === '-fr') {
      recursive = true
      continue
    }

    targets.push(token)
  }

  if (targets.length === 0) {
    throw new Error('Usage: rm [-r] <path ...>')
  }

  for (const target of targets) {
    const path = await resolvePath(target, cwd)
    const node = await callVfs<WorkerVfsNode | null>('stat', [path])

    if (!node) {
      throw new Error(`No such file or directory: ${target}`)
    }

    if (node.type === 'directory' && !recursive) {
      throw new Error(`Cannot remove directory without -r: ${target}`)
    }

    await callVfs('delete', [path, { recursive }])
  }

  return ''
}

const runEcho = async (cwd: string, args: string[]) => {
  if (args.length === 0) {
    return ''
  }

  const redirectIndex = args.findIndex((token) => token === '>' || token === '>>')

  if (redirectIndex === -1) {
    return args.join(' ')
  }

  const operator = args[redirectIndex]
  const targetTokens = args.slice(redirectIndex + 1)

  if (targetTokens.length !== 1) {
    throw new Error('Usage: echo <text> [> or >>] <file>')
  }

  const text = args.slice(0, redirectIndex).join(' ')
  const targetPath = await resolvePath(targetTokens[0], cwd)

  let contentToWrite = `${text}\n`

  if (operator === '>>') {
    try {
      const existing = await readFileAsText(targetPath)
      contentToWrite = `${existing}${contentToWrite}`
    } catch {
      contentToWrite = `${text}\n`
    }
  }

  await callVfs('writeFile', [targetPath, contentToWrite, { create: true, overwrite: true }])
  return ''
}

const runHelp = () => {
  return [
    'WebOS Terminal commands:',
    '  help                   Show this help text.',
    '  clear                  Clear terminal output.',
    '  pwd                    Print current working directory.',
    '  ls [path]              List files/directories.',
    '  cd [path]              Change directory.',
    '  cat <file>             Print file contents.',
    '  mkdir [-p] <dir ...>   Create directories.',
    '  rm [-r] <path ...>     Remove file or directory.',
    '  echo <text>            Print text.',
    '  echo <text> > <file>   Write text into a file.',
    '  echo <text> >> <file>  Append text into a file.',
  ].join('\n')
}

const executeCommand = async (
  sessionId: string,
  input: string,
): Promise<WorkerToMainCommandResultMessage> => {
  const session = sessions.get(sessionId)

  if (!session) {
    throw new Error(`Unknown terminal session: ${sessionId}`)
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return {
      type: 'command-result',
      sessionId,
      output: '',
      prompt: createPrompt(session.cwd),
      cwd: session.cwd,
    }
  }

  const tokens = tokenizeCommand(trimmed)
  const command = tokens[0]
  const args = tokens.slice(1)

  try {
    switch (command) {
      case 'help':
        return {
          type: 'command-result',
          sessionId,
          output: runHelp(),
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      case 'clear':
        return {
          type: 'command-result',
          sessionId,
          output: '',
          clear: true,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      case 'pwd':
        return {
          type: 'command-result',
          sessionId,
          output: session.cwd,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      case 'ls': {
        const output = await runLs(session.cwd, args)
        return {
          type: 'command-result',
          sessionId,
          output,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      }
      case 'cd': {
        const output = await runCd(session, args)
        return {
          type: 'command-result',
          sessionId,
          output,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      }
      case 'cat': {
        const output = await runCat(session.cwd, args)
        return {
          type: 'command-result',
          sessionId,
          output,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      }
      case 'mkdir': {
        const output = await runMkdir(session.cwd, args)
        return {
          type: 'command-result',
          sessionId,
          output,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      }
      case 'rm': {
        const output = await runRm(session.cwd, args)
        return {
          type: 'command-result',
          sessionId,
          output,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      }
      case 'echo': {
        const output = await runEcho(session.cwd, args)
        return {
          type: 'command-result',
          sessionId,
          output,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
      }
      default:
        return {
          type: 'command-result',
          sessionId,
          output: `Command not found: ${command}. Run "help" for available commands.`,
          prompt: createPrompt(session.cwd),
          cwd: session.cwd,
        }
    }
  } catch (error) {
    const details = serializeError(error)
    const codePrefix = details.code ? `${details.code}: ` : ''

    return {
      type: 'command-result',
      sessionId,
      output: `${codePrefix}${details.message}`,
      prompt: createPrompt(session.cwd),
      cwd: session.cwd,
    }
  }
}

const queueCommand = (sessionId: string, input: string) => {
  const session = sessions.get(sessionId)

  if (!session) {
    return
  }

  session.queue = session.queue
    .catch(() => undefined)
    .then(async () => {
      const result = await executeCommand(sessionId, input)
      postMessageToMain(result)
    })
}

const createSession = (sessionId: string) => {
  sessions.set(sessionId, {
    cwd: USER_HOME_PATH,
    queue: Promise.resolve(),
  })

  const readyMessage: WorkerToMainSessionReadyMessage = {
    type: 'session-ready',
    sessionId,
    banner: 'WebOS Terminal (xterm + worker backend)\nType "help" to list commands.',
    prompt: createPrompt(USER_HOME_PATH),
    cwd: USER_HOME_PATH,
  }

  postMessageToMain(readyMessage)
}

const resolvePendingRequest = (message: MainToWorkerVfsResponseMessage) => {
  const pending = pendingRequests.get(message.requestId)

  if (!pending) {
    return
  }

  pendingRequests.delete(message.requestId)

  if (message.ok) {
    pending.resolve(message.result)
    return
  }

  const error = new Error(message.error?.message ?? 'Unknown VFS error') as Error & { code?: string }
  error.name = message.error?.name ?? 'VfsHostError'
  error.code = message.error?.code
  pending.reject(error)
}

workerScope.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data

  switch (message.type) {
    case 'session-create': {
      createSession(message.sessionId)
      return
    }
    case 'session-close': {
      sessions.delete(message.sessionId)
      return
    }
    case 'command': {
      queueCommand(message.sessionId, message.input)
      return
    }
    case 'vfs-response': {
      resolvePendingRequest(message)
      return
    }
    default: {
      const exhaustive: never = message
      throw new Error(`Unhandled worker message: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export {}
