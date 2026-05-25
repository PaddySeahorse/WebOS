export type TerminalVfsMethod =
  | 'resolvePath'
  | 'stat'
  | 'list'
  | 'readFile'
  | 'mkdir'
  | 'delete'
  | 'writeFile'

export interface SerializedWorkerError {
  message: string
  name?: string
  code?: string
}

export interface WorkerVfsRequestMessage {
  type: 'vfs-request'
  requestId: string
  method: TerminalVfsMethod
  args: unknown[]
}

export interface MainToWorkerSessionCreateMessage {
  type: 'session-create'
  sessionId: string
}

export interface MainToWorkerSessionCloseMessage {
  type: 'session-close'
  sessionId: string
}

export interface MainToWorkerCommandMessage {
  type: 'command'
  sessionId: string
  input: string
}

export interface MainToWorkerVfsResponseMessage {
  type: 'vfs-response'
  requestId: string
  ok: boolean
  result?: unknown
  error?: SerializedWorkerError
}

export type MainToWorkerMessage =
  | MainToWorkerSessionCreateMessage
  | MainToWorkerSessionCloseMessage
  | MainToWorkerCommandMessage
  | MainToWorkerVfsResponseMessage

export interface WorkerToMainSessionReadyMessage {
  type: 'session-ready'
  sessionId: string
  banner: string
  prompt: string
  cwd: string
}

export interface WorkerToMainCommandResultMessage {
  type: 'command-result'
  sessionId: string
  output: string
  prompt: string
  cwd: string
  clear?: boolean
}

export type WorkerToMainMessage =
  | WorkerToMainSessionReadyMessage
  | WorkerToMainCommandResultMessage
  | WorkerVfsRequestMessage
