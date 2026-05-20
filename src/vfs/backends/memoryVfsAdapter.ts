import { detectFileType } from '../fileType'
import {
  assertNoSelfOrDescendantMove,
  getBaseName,
  getParentPath,
  isDescendantPath,
  isPathWithin,
  pathDepth,
  resolvePath,
} from '../pathUtils'
import {
  HOME_PATH,
  ROOT_PATH,
  USER_HOME_PATH,
  type SerializedVfsNode,
  type VfsAdapter,
  type VfsCopyMoveOptions,
  type VfsDeleteOptions,
  type VfsImportOptions,
  type VfsMkdirOptions,
  type VfsNode,
  type VfsReadFileOptions,
  type VfsSnapshot,
  type VfsWriteFileData,
  type VfsWriteFileOptions,
  VfsError,
} from '../types'

interface MemoryRecord extends VfsNode {
  content?: Uint8Array
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toUint8Array = (payload: VfsWriteFileData): Uint8Array => {
  if (typeof payload === 'string') {
    return encoder.encode(payload)
  }

  if (payload instanceof Uint8Array) {
    return payload
  }

  return new Uint8Array(payload)
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value)
  const output = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index)
  }

  return output
}

const createDirectoryNode = (path: string, writable: boolean, timestamp: number): MemoryRecord => ({
  path,
  parentPath: getParentPath(path),
  name: getBaseName(path),
  type: 'directory',
  writable,
  size: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
})

const getWritableFlag = (path: string) => isPathWithin(path, USER_HOME_PATH)

const createSeedFileNode = (path: string, content: string, timestamp: number, writable = false): MemoryRecord => {
  const bytes = encoder.encode(content)
  const type = detectFileType(getBaseName(path), 'text/plain')

  return {
    path,
    parentPath: getParentPath(path),
    name: getBaseName(path),
    type: 'file',
    writable,
    size: bytes.byteLength,
    createdAt: timestamp,
    updatedAt: timestamp,
    extension: type.extension,
    mimeType: type.mimeType,
    kind: type.kind,
    content: bytes,
  }
}

export class MemoryVfsAdapter implements VfsAdapter {
  readonly id = 'memory-vfs'
  private initialized = false
  private records = new Map<string, MemoryRecord>()

  async init() {
    if (this.initialized) {
      return
    }

    const now = Date.now()
    const directories = [
      ROOT_PATH,
      '/system',
      '/system/apps',
      '/system/config',
      HOME_PATH,
      USER_HOME_PATH,
      `${USER_HOME_PATH}/Desktop`,
      `${USER_HOME_PATH}/Documents`,
      `${USER_HOME_PATH}/Downloads`,
      `${USER_HOME_PATH}/Projects`,
    ]

    for (const path of directories) {
      this.records.set(path, createDirectoryNode(path, getWritableFlag(path), now))
    }

    const systemReadmePath = '/system/README.txt'
    this.records.set(
      systemReadmePath,
      createSeedFileNode(
        systemReadmePath,
        'WebOS system root is read-only. Use /home/webos-user for writable files.',
        now,
      ),
    )

    const userWelcomePath = `${USER_HOME_PATH}/Documents/welcome.txt`
    this.records.set(
      userWelcomePath,
      createSeedFileNode(
        userWelcomePath,
        'Welcome to WebOS Phase 2 VFS. This file lives in your writable user area.',
        now,
        true,
      ),
    )

    this.initialized = true
  }

  resolvePath(inputPath: string, cwd?: string): string {
    return resolvePath(inputPath, cwd)
  }

  async stat(path: string): Promise<VfsNode | null> {
    await this.init()
    return this.records.get(this.resolvePath(path)) ?? null
  }

  async list(path: string): Promise<VfsNode[]> {
    await this.init()
    const normalizedPath = this.resolvePath(path)
    const directory = this.records.get(normalizedPath)

    if (!directory) {
      throw new VfsError('NOT_FOUND', `Directory not found: ${normalizedPath}`)
    }

    if (directory.type !== 'directory') {
      throw new VfsError('NOT_A_DIRECTORY', `Path is not a directory: ${normalizedPath}`)
    }

    const entries = Array.from(this.records.values()).filter(
      (record) => record.parentPath === normalizedPath,
    )

    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return entries
  }

  async readFile(path: string, options?: VfsReadFileOptions): Promise<string | Uint8Array> {
    await this.init()
    const normalizedPath = this.resolvePath(path)
    const node = this.records.get(normalizedPath)

    if (!node || node.type !== 'file') {
      throw new VfsError('NOT_FOUND', `File not found: ${normalizedPath}`)
    }

    const content = node.content ?? new Uint8Array(0)

    if (options?.encoding === 'raw') {
      return content
    }

    return decoder.decode(content)
  }

  async writeFile(
    path: string,
    data: VfsWriteFileData,
    options?: VfsWriteFileOptions,
  ): Promise<VfsNode> {
    await this.init()

    const normalizedPath = this.resolvePath(path)
    const parentPath = getParentPath(normalizedPath)

    if (!parentPath) {
      throw new VfsError('INVALID_PATH', 'Cannot write to root.')
    }

    const parent = this.records.get(parentPath)

    if (!parent || parent.type !== 'directory') {
      throw new VfsError('NOT_FOUND', `Parent directory does not exist: ${parentPath}`)
    }

    this.assertWritable(normalizedPath)

    const existing = this.records.get(normalizedPath)

    if (existing && existing.type === 'directory') {
      throw new VfsError('IS_DIRECTORY', `Cannot overwrite directory: ${normalizedPath}`)
    }

    if (!existing && options?.create === false) {
      throw new VfsError('NOT_FOUND', `File does not exist: ${normalizedPath}`)
    }

    if (existing && options?.overwrite === false) {
      throw new VfsError('ALREADY_EXISTS', `File already exists: ${normalizedPath}`)
    }

    const content = toUint8Array(data)
    const now = Date.now()
    const detected = detectFileType(getBaseName(normalizedPath))

    const nextNode: MemoryRecord = {
      path: normalizedPath,
      parentPath,
      name: getBaseName(normalizedPath),
      type: 'file',
      writable: true,
      size: content.byteLength,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      extension: detected.extension,
      mimeType: detected.mimeType,
      kind: detected.kind,
      content,
    }

    this.records.set(normalizedPath, nextNode)

    return nextNode
  }

  async mkdir(path: string, options?: VfsMkdirOptions): Promise<VfsNode> {
    await this.init()

    const normalizedPath = this.resolvePath(path)

    if (normalizedPath === ROOT_PATH) {
      return this.records.get(ROOT_PATH) as VfsNode
    }

    const existing = this.records.get(normalizedPath)

    if (existing) {
      if (existing.type === 'directory') {
        return existing
      }

      throw new VfsError('ALREADY_EXISTS', `A file already exists at: ${normalizedPath}`)
    }

    const parentPath = getParentPath(normalizedPath)

    if (!parentPath) {
      throw new VfsError('INVALID_PATH', 'Cannot create root directory.')
    }

    const ensureParentDirectory = async (nextParent: string): Promise<void> => {
      const parentNode = this.records.get(nextParent)

      if (parentNode) {
        if (parentNode.type !== 'directory') {
          throw new VfsError('NOT_A_DIRECTORY', `Parent path is not a directory: ${nextParent}`)
        }

        return
      }

      if (!options?.recursive) {
        throw new VfsError('NOT_FOUND', `Parent directory does not exist: ${nextParent}`)
      }

      const parentOfParent = getParentPath(nextParent)

      if (!parentOfParent) {
        throw new VfsError('INVALID_PATH', `Invalid parent path: ${nextParent}`)
      }

      await ensureParentDirectory(parentOfParent)
      this.assertWritable(nextParent)

      const now = Date.now()
      this.records.set(nextParent, createDirectoryNode(nextParent, true, now))
    }

    await ensureParentDirectory(parentPath)
    this.assertWritable(normalizedPath)

    const now = Date.now()
    const directory = createDirectoryNode(normalizedPath, true, now)
    this.records.set(normalizedPath, directory)

    return directory
  }

  async delete(path: string, options?: VfsDeleteOptions): Promise<void> {
    await this.init()

    const normalizedPath = this.resolvePath(path)

    if (normalizedPath === ROOT_PATH || normalizedPath === USER_HOME_PATH || normalizedPath === HOME_PATH) {
      throw new VfsError('PERMISSION_DENIED', `Cannot delete protected directory: ${normalizedPath}`)
    }

    const target = this.records.get(normalizedPath)

    if (!target) {
      throw new VfsError('NOT_FOUND', `Path not found: ${normalizedPath}`)
    }

    this.assertWritable(normalizedPath)

    if (target.type === 'file') {
      this.records.delete(normalizedPath)
      return
    }

    const descendants = Array.from(this.records.keys()).filter((candidate) =>
      isDescendantPath(candidate, normalizedPath),
    )

    if (descendants.length > 0 && !options?.recursive) {
      throw new VfsError('DIRECTORY_NOT_EMPTY', `Directory is not empty: ${normalizedPath}`)
    }

    for (const descendant of descendants) {
      this.records.delete(descendant)
    }

    this.records.delete(normalizedPath)
  }

  async move(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void> {
    await this.init()

    const source = this.resolvePath(sourcePath)
    const target = this.resolvePath(targetPath)

    if (source === ROOT_PATH || source === USER_HOME_PATH || source === HOME_PATH) {
      throw new VfsError('PERMISSION_DENIED', `Cannot move protected path: ${source}`)
    }

    assertNoSelfOrDescendantMove(source, target)

    const sourceNode = this.records.get(source)

    if (!sourceNode) {
      throw new VfsError('NOT_FOUND', `Path not found: ${source}`)
    }

    this.assertWritable(source)
    this.assertWritable(target)

    const targetParentPath = getParentPath(target)

    if (!targetParentPath) {
      throw new VfsError('INVALID_PATH', 'Target parent is invalid.')
    }

    const targetParentNode = this.records.get(targetParentPath)

    if (!targetParentNode || targetParentNode.type !== 'directory') {
      throw new VfsError('NOT_FOUND', `Target parent does not exist: ${targetParentPath}`)
    }

    const existingTarget = this.records.get(target)

    if (existingTarget && !options?.overwrite) {
      throw new VfsError('ALREADY_EXISTS', `Target already exists: ${target}`)
    }

    if (existingTarget) {
      await this.delete(target, { recursive: true })
    }

    const affectedPaths = [
      source,
      ...Array.from(this.records.keys()).filter((candidate) => isDescendantPath(candidate, source)),
    ]

    affectedPaths.sort((a, b) => pathDepth(a) - pathDepth(b))

    const cloned = new Map<string, MemoryRecord>()

    for (const oldPath of affectedPaths) {
      const record = this.records.get(oldPath)

      if (!record) {
        continue
      }

      const replacementPath = oldPath === source ? target : oldPath.replace(source, target)
      const newParentPath = getParentPath(replacementPath)

      cloned.set(replacementPath, {
        ...record,
        path: replacementPath,
        parentPath: newParentPath,
        name: getBaseName(replacementPath),
        writable: getWritableFlag(replacementPath),
        updatedAt: Date.now(),
      })
    }

    for (const oldPath of affectedPaths) {
      this.records.delete(oldPath)
    }

    for (const [newPath, record] of cloned) {
      this.records.set(newPath, record)
    }
  }

  async copy(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void> {
    await this.init()

    const source = this.resolvePath(sourcePath)
    const target = this.resolvePath(targetPath)

    const sourceNode = this.records.get(source)

    if (!sourceNode) {
      throw new VfsError('NOT_FOUND', `Path not found: ${source}`)
    }

    this.assertWritable(target)

    const existingTarget = this.records.get(target)

    if (existingTarget && !options?.overwrite) {
      throw new VfsError('ALREADY_EXISTS', `Target already exists: ${target}`)
    }

    if (existingTarget) {
      await this.delete(target, { recursive: true })
    }

    const sourcePaths = [
      source,
      ...Array.from(this.records.keys()).filter((candidate) => isDescendantPath(candidate, source)),
    ]

    sourcePaths.sort((a, b) => pathDepth(a) - pathDepth(b))

    const now = Date.now()

    for (const oldPath of sourcePaths) {
      const record = this.records.get(oldPath)

      if (!record) {
        continue
      }

      const replacementPath = oldPath === source ? target : oldPath.replace(source, target)
      const clonedRecord: MemoryRecord = {
        ...record,
        path: replacementPath,
        parentPath: getParentPath(replacementPath),
        name: getBaseName(replacementPath),
        writable: getWritableFlag(replacementPath),
        createdAt: now,
        updatedAt: now,
      }

      if (record.content) {
        clonedRecord.content = new Uint8Array(record.content)
      }

      this.records.set(replacementPath, clonedRecord)
    }
  }

  async exportTree(rootPath = ROOT_PATH): Promise<VfsSnapshot> {
    await this.init()

    const normalizedRootPath = this.resolvePath(rootPath)
    const rootNode = this.records.get(normalizedRootPath)

    if (!rootNode) {
      throw new VfsError('NOT_FOUND', `Root path not found: ${normalizedRootPath}`)
    }

    const nodes: SerializedVfsNode[] = Array.from(this.records.values())
      .filter((record) => record.path === normalizedRootPath || isDescendantPath(record.path, normalizedRootPath))
      .sort((a, b) => pathDepth(a.path) - pathDepth(b.path))
      .map((record) => ({
        path: record.path,
        type: record.type,
        writable: record.writable,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        extension: record.extension,
        mimeType: record.mimeType,
        kind: record.kind,
        size: record.size,
        contentBase64: record.type === 'file' ? bytesToBase64(record.content ?? new Uint8Array(0)) : undefined,
      }))

    return {
      version: 1,
      exportedAt: Date.now(),
      rootPath: normalizedRootPath,
      nodes,
    }
  }

  async importTree(snapshot: VfsSnapshot, options?: VfsImportOptions): Promise<void> {
    await this.init()

    if (snapshot.version !== 1) {
      throw new VfsError('INVALID_SNAPSHOT', `Unsupported snapshot version: ${snapshot.version}`)
    }

    const nodes = [...snapshot.nodes].sort((a, b) => pathDepth(a.path) - pathDepth(b.path))

    for (const node of nodes) {
      const normalizedPath = this.resolvePath(node.path)
      const existing = this.records.get(normalizedPath)

      if (existing && !options?.overwrite) {
        continue
      }

      if (existing) {
        await this.delete(normalizedPath, { recursive: true })
      }

      if (node.type === 'directory') {
        await this.mkdir(normalizedPath, { recursive: true })
        continue
      }

      const bytes = node.contentBase64 ? base64ToBytes(node.contentBase64) : new Uint8Array(0)
      await this.writeFile(normalizedPath, bytes, { create: true, overwrite: true })
    }
  }

  private assertWritable(path: string) {
    if (!isPathWithin(path, USER_HOME_PATH)) {
      throw new VfsError(
        'PERMISSION_DENIED',
        `Path is read-only. Write operations are only allowed under ${USER_HOME_PATH}.`,
      )
    }
  }
}
