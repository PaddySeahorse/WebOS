export const ROOT_PATH = '/'
export const HOME_PATH = '/home'
export const USER_HOME_PATH = '/home/webos-user'
export const TILDE_ALIAS = '~'

export type VfsNodeType = 'file' | 'directory'

export type VfsFileKind =
  | 'text'
  | 'code'
  | 'config'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'document'
  | 'binary'
  | 'unknown'

export interface VfsNode {
  path: string
  parentPath: string | null
  name: string
  type: VfsNodeType
  writable: boolean
  size: number
  createdAt: number
  updatedAt: number
  extension?: string
  mimeType?: string
  kind?: VfsFileKind
}

export interface VfsReadFileOptions {
  encoding?: 'utf-8' | 'raw'
}

export type VfsWriteFileData = string | ArrayBuffer | Uint8Array

export interface VfsWriteFileOptions {
  create?: boolean
  overwrite?: boolean
}

export interface VfsDeleteOptions {
  recursive?: boolean
}

export interface VfsMkdirOptions {
  recursive?: boolean
}

export interface VfsImportOptions {
  overwrite?: boolean
}

export interface VfsCopyMoveOptions {
  overwrite?: boolean
}

export interface SerializedVfsNode {
  path: string
  type: VfsNodeType
  writable: boolean
  createdAt: number
  updatedAt: number
  extension?: string
  mimeType?: string
  kind?: VfsFileKind
  size?: number
  contentBase64?: string
}

export interface VfsSnapshot {
  version: 1
  exportedAt: number
  rootPath: string
  nodes: SerializedVfsNode[]
}

export interface VfsAdapter {
  readonly id: string
  init(): Promise<void>
  resolvePath(inputPath: string, cwd?: string): string
  stat(path: string): Promise<VfsNode | null>
  list(path: string): Promise<VfsNode[]>
  readFile(path: string, options?: VfsReadFileOptions): Promise<string | Uint8Array>
  writeFile(path: string, data: VfsWriteFileData, options?: VfsWriteFileOptions): Promise<VfsNode>
  mkdir(path: string, options?: VfsMkdirOptions): Promise<VfsNode>
  delete(path: string, options?: VfsDeleteOptions): Promise<void>
  move(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void>
  copy(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void>
  exportTree(rootPath?: string): Promise<VfsSnapshot>
  importTree(snapshot: VfsSnapshot, options?: VfsImportOptions): Promise<void>
}

export class VfsError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'VfsError'
    this.code = code
  }
}
