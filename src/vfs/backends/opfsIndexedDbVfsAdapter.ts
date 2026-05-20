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

interface VfsNodeRecord extends VfsNode {
  opfsKey?: string
}

const DB_NAME = 'webos-vfs'
const DB_VERSION = 1
const NODE_STORE = 'nodes'
const INDEX_BY_PARENT = 'byParentPath'
const INDEX_BY_TYPE = 'byType'
const INDEX_BY_EXTENSION = 'byExtension'
const INDEX_BY_KIND = 'byKind'
const OPFS_FILES_DIRECTORY = 'webos-vfs-files'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }

  return `id-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

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
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

const createDirectoryRecord = (path: string, writable: boolean, timestamp: number): VfsNodeRecord => ({
  path,
  parentPath: getParentPath(path),
  name: getBaseName(path),
  type: 'directory',
  writable,
  size: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
})

const writableForPath = (path: string) => isPathWithin(path, USER_HOME_PATH)

const mapRecordToNode = (record: VfsNodeRecord): VfsNode => ({
  path: record.path,
  parentPath: record.parentPath,
  name: record.name,
  type: record.type,
  writable: record.writable,
  size: record.size,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  extension: record.extension,
  mimeType: record.mimeType,
  kind: record.kind,
})

export class OpfsIndexedDbVfsAdapter implements VfsAdapter {
  readonly id = 'opfs-indexeddb-vfs'
  private initPromise: Promise<void> | null = null
  private dbPromise: Promise<IDBDatabase> | null = null
  private opfsDirPromise: Promise<FileSystemDirectoryHandle> | null = null

  async init() {
    if (!this.initPromise) {
      this.initPromise = this.initializeInternal()
    }

    return this.initPromise
  }

  resolvePath(inputPath: string, cwd?: string): string {
    return resolvePath(inputPath, cwd)
  }

  async stat(path: string): Promise<VfsNode | null> {
    await this.init()
    const normalizedPath = this.resolvePath(path)
    const record = await this.getRecord(normalizedPath)
    return record ? mapRecordToNode(record) : null
  }

  async list(path: string): Promise<VfsNode[]> {
    await this.init()

    const normalizedPath = this.resolvePath(path)
    const record = await this.getRecord(normalizedPath)

    if (!record) {
      throw new VfsError('NOT_FOUND', `Directory not found: ${normalizedPath}`)
    }

    if (record.type !== 'directory') {
      throw new VfsError('NOT_A_DIRECTORY', `Path is not a directory: ${normalizedPath}`)
    }

    const children = await this.getChildren(normalizedPath)

    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }

      return a.name.localeCompare(b.name)
    })

    return children.map(mapRecordToNode)
  }

  async readFile(path: string, options?: VfsReadFileOptions): Promise<string | Uint8Array> {
    await this.init()

    const normalizedPath = this.resolvePath(path)
    const record = await this.getRecord(normalizedPath)

    if (!record || record.type !== 'file' || !record.opfsKey) {
      throw new VfsError('NOT_FOUND', `File not found: ${normalizedPath}`)
    }

    const bytes = await this.readOpfsFile(record.opfsKey)

    if (options?.encoding === 'raw') {
      return bytes
    }

    return decoder.decode(bytes)
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
      throw new VfsError('INVALID_PATH', 'Cannot write to root path.')
    }

    const parent = await this.getRecord(parentPath)

    if (!parent || parent.type !== 'directory') {
      throw new VfsError('NOT_FOUND', `Parent directory not found: ${parentPath}`)
    }

    this.assertWritable(normalizedPath)

    const existing = await this.getRecord(normalizedPath)

    if (existing && existing.type === 'directory') {
      throw new VfsError('IS_DIRECTORY', `Cannot overwrite directory: ${normalizedPath}`)
    }

    if (!existing && options?.create === false) {
      throw new VfsError('NOT_FOUND', `File does not exist: ${normalizedPath}`)
    }

    if (existing && options?.overwrite === false) {
      throw new VfsError('ALREADY_EXISTS', `File already exists: ${normalizedPath}`)
    }

    const bytes = toUint8Array(data)
    const opfsKey = existing?.opfsKey ?? randomId()
    await this.writeOpfsFile(opfsKey, bytes)

    const now = Date.now()
    const detected = detectFileType(getBaseName(normalizedPath))

    const record: VfsNodeRecord = {
      path: normalizedPath,
      parentPath,
      name: getBaseName(normalizedPath),
      type: 'file',
      writable: true,
      size: bytes.byteLength,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      extension: detected.extension,
      mimeType: detected.mimeType,
      kind: detected.kind,
      opfsKey,
    }

    await this.putRecord(record)

    return mapRecordToNode(record)
  }

  async mkdir(path: string, options?: VfsMkdirOptions): Promise<VfsNode> {
    await this.init()

    const normalizedPath = this.resolvePath(path)

    if (normalizedPath === ROOT_PATH) {
      const root = await this.getRecord(ROOT_PATH)
      if (!root) {
        throw new VfsError('NOT_FOUND', 'Root path is missing from VFS store.')
      }
      return mapRecordToNode(root)
    }

    const existing = await this.getRecord(normalizedPath)

    if (existing) {
      if (existing.type === 'directory') {
        return mapRecordToNode(existing)
      }

      throw new VfsError('ALREADY_EXISTS', `A file already exists at path: ${normalizedPath}`)
    }

    const parentPath = getParentPath(normalizedPath)

    if (!parentPath) {
      throw new VfsError('INVALID_PATH', 'Invalid parent path.')
    }

    const ensureParentExists = async (nextParentPath: string): Promise<void> => {
      const parent = await this.getRecord(nextParentPath)

      if (parent) {
        if (parent.type !== 'directory') {
          throw new VfsError('NOT_A_DIRECTORY', `Parent is not a directory: ${nextParentPath}`)
        }

        return
      }

      if (!options?.recursive) {
        throw new VfsError('NOT_FOUND', `Parent directory not found: ${nextParentPath}`)
      }

      const parentOfParent = getParentPath(nextParentPath)

      if (!parentOfParent) {
        throw new VfsError('INVALID_PATH', `Invalid recursive parent path: ${nextParentPath}`)
      }

      await ensureParentExists(parentOfParent)
      this.assertWritable(nextParentPath)

      const now = Date.now()
      await this.putRecord(createDirectoryRecord(nextParentPath, true, now))
    }

    await ensureParentExists(parentPath)
    this.assertWritable(normalizedPath)

    const directory = createDirectoryRecord(normalizedPath, true, Date.now())
    await this.putRecord(directory)

    return mapRecordToNode(directory)
  }

  async delete(path: string, options?: VfsDeleteOptions): Promise<void> {
    await this.init()

    const normalizedPath = this.resolvePath(path)

    if (normalizedPath === ROOT_PATH || normalizedPath === HOME_PATH || normalizedPath === USER_HOME_PATH) {
      throw new VfsError('PERMISSION_DENIED', `Cannot delete protected directory: ${normalizedPath}`)
    }

    const target = await this.getRecord(normalizedPath)

    if (!target) {
      throw new VfsError('NOT_FOUND', `Path not found: ${normalizedPath}`)
    }

    this.assertWritable(normalizedPath)

    if (target.type === 'file') {
      if (target.opfsKey) {
        await this.deleteOpfsFile(target.opfsKey)
      }
      await this.deleteRecord(normalizedPath)
      return
    }

    const descendants = await this.getDescendants(normalizedPath)

    if (descendants.length > 0 && !options?.recursive) {
      throw new VfsError('DIRECTORY_NOT_EMPTY', `Directory is not empty: ${normalizedPath}`)
    }

    descendants.sort((a, b) => pathDepth(b.path) - pathDepth(a.path))

    for (const child of descendants) {
      if (child.type === 'file' && child.opfsKey) {
        await this.deleteOpfsFile(child.opfsKey)
      }

      await this.deleteRecord(child.path)
    }

    await this.deleteRecord(normalizedPath)
  }

  async move(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void> {
    await this.init()

    const source = this.resolvePath(sourcePath)
    const target = this.resolvePath(targetPath)

    if (source === ROOT_PATH || source === HOME_PATH || source === USER_HOME_PATH) {
      throw new VfsError('PERMISSION_DENIED', `Cannot move protected path: ${source}`)
    }

    assertNoSelfOrDescendantMove(source, target)

    const sourceRecord = await this.getRecord(source)

    if (!sourceRecord) {
      throw new VfsError('NOT_FOUND', `Source path not found: ${source}`)
    }

    this.assertWritable(source)
    this.assertWritable(target)

    const targetParentPath = getParentPath(target)

    if (!targetParentPath) {
      throw new VfsError('INVALID_PATH', 'Target path has invalid parent.')
    }

    const targetParent = await this.getRecord(targetParentPath)

    if (!targetParent || targetParent.type !== 'directory') {
      throw new VfsError('NOT_FOUND', `Target parent does not exist: ${targetParentPath}`)
    }

    const existingTarget = await this.getRecord(target)

    if (existingTarget && !options?.overwrite) {
      throw new VfsError('ALREADY_EXISTS', `Target already exists: ${target}`)
    }

    if (existingTarget) {
      await this.delete(target, { recursive: true })
    }

    const descendants = await this.getDescendants(source)
    const affectedRecords = [sourceRecord, ...descendants]

    affectedRecords.sort((a, b) => pathDepth(a.path) - pathDepth(b.path))

    const replacements: VfsNodeRecord[] = affectedRecords.map((record) => {
      const nextPath = record.path === source ? target : record.path.replace(source, target)
      return {
        ...record,
        path: nextPath,
        parentPath: getParentPath(nextPath),
        name: getBaseName(nextPath),
        writable: writableForPath(nextPath),
        updatedAt: Date.now(),
      }
    })

    for (const replacement of replacements) {
      await this.putRecord(replacement)
    }

    affectedRecords.sort((a, b) => pathDepth(b.path) - pathDepth(a.path))

    for (const oldRecord of affectedRecords) {
      await this.deleteRecord(oldRecord.path)
    }
  }

  async copy(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void> {
    await this.init()

    const source = this.resolvePath(sourcePath)
    const target = this.resolvePath(targetPath)

    const sourceRecord = await this.getRecord(source)

    if (!sourceRecord) {
      throw new VfsError('NOT_FOUND', `Source path not found: ${source}`)
    }

    this.assertWritable(target)

    const targetParentPath = getParentPath(target)

    if (!targetParentPath) {
      throw new VfsError('INVALID_PATH', 'Target parent path is invalid.')
    }

    const targetParent = await this.getRecord(targetParentPath)

    if (!targetParent || targetParent.type !== 'directory') {
      throw new VfsError('NOT_FOUND', `Target parent does not exist: ${targetParentPath}`)
    }

    const existingTarget = await this.getRecord(target)

    if (existingTarget && !options?.overwrite) {
      throw new VfsError('ALREADY_EXISTS', `Target already exists: ${target}`)
    }

    if (existingTarget) {
      await this.delete(target, { recursive: true })
    }

    const descendants = await this.getDescendants(source)
    const recordsToCopy = [sourceRecord, ...descendants]

    recordsToCopy.sort((a, b) => pathDepth(a.path) - pathDepth(b.path))

    for (const record of recordsToCopy) {
      const nextPath = record.path === source ? target : record.path.replace(source, target)
      const now = Date.now()

      if (record.type === 'directory') {
        await this.putRecord({
          ...record,
          path: nextPath,
          parentPath: getParentPath(nextPath),
          name: getBaseName(nextPath),
          writable: writableForPath(nextPath),
          createdAt: now,
          updatedAt: now,
        })
        continue
      }

      const sourceOpfsKey = record.opfsKey
      if (!sourceOpfsKey) {
        throw new VfsError('CORRUPTED_STATE', `File record has no OPFS key: ${record.path}`)
      }

      const content = await this.readOpfsFile(sourceOpfsKey)
      const targetOpfsKey = randomId()
      await this.writeOpfsFile(targetOpfsKey, content)

      await this.putRecord({
        ...record,
        path: nextPath,
        parentPath: getParentPath(nextPath),
        name: getBaseName(nextPath),
        writable: writableForPath(nextPath),
        createdAt: now,
        updatedAt: now,
        opfsKey: targetOpfsKey,
      })
    }
  }

  async exportTree(rootPath = ROOT_PATH): Promise<VfsSnapshot> {
    await this.init()

    const normalizedRootPath = this.resolvePath(rootPath)
    const rootRecord = await this.getRecord(normalizedRootPath)

    if (!rootRecord) {
      throw new VfsError('NOT_FOUND', `Root path not found: ${normalizedRootPath}`)
    }

    const allRecords = await this.getAllRecords()

    const records = allRecords
      .filter((record) => record.path === normalizedRootPath || isDescendantPath(record.path, normalizedRootPath))
      .sort((a, b) => pathDepth(a.path) - pathDepth(b.path))

    const nodes: SerializedVfsNode[] = []

    for (const record of records) {
      let contentBase64: string | undefined

      if (record.type === 'file' && record.opfsKey) {
        const bytes = await this.readOpfsFile(record.opfsKey)
        contentBase64 = bytesToBase64(bytes)
      }

      nodes.push({
        path: record.path,
        type: record.type,
        writable: record.writable,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        extension: record.extension,
        mimeType: record.mimeType,
        kind: record.kind,
        size: record.size,
        contentBase64,
      })
    }

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
      const existing = await this.getRecord(normalizedPath)

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

  private async initializeInternal() {
    if (!this.isSupported()) {
      throw new VfsError(
        'UNSUPPORTED',
        'This environment does not support OPFS + IndexedDB VFS. Falling back is required.',
      )
    }

    const rootRecord = await this.getRecord(ROOT_PATH)

    if (!rootRecord) {
      await this.seedFileSystem()
    }
  }

  private isSupported() {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>
    }

    return typeof indexedDB !== 'undefined' && typeof storage.getDirectory === 'function'
  }

  private async seedFileSystem() {
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

    for (const directoryPath of directories) {
      await this.putRecord(createDirectoryRecord(directoryPath, writableForPath(directoryPath), now))
    }

    await this.seedFile(
      '/system/README.txt',
      'WebOS system root is read-only. Write operations are allowed under /home/webos-user.',
      false,
      now,
    )

    await this.seedFile(
      `${USER_HOME_PATH}/Documents/welcome.txt`,
      'Welcome to WebOS Phase 2 VFS. This file is stored in OPFS and indexed through IndexedDB.',
      true,
      now,
    )
  }

  private async seedFile(path: string, content: string, writable: boolean, timestamp: number) {
    const bytes = encoder.encode(content)
    const opfsKey = randomId()
    await this.writeOpfsFile(opfsKey, bytes)

    const detected = detectFileType(getBaseName(path), 'text/plain')

    const record: VfsNodeRecord = {
      path,
      parentPath: getParentPath(path),
      name: getBaseName(path),
      type: 'file',
      writable,
      size: bytes.byteLength,
      createdAt: timestamp,
      updatedAt: timestamp,
      extension: detected.extension,
      mimeType: detected.mimeType,
      kind: detected.kind,
      opfsKey,
    }

    await this.putRecord(record)
  }

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(DB_NAME, DB_VERSION)

        openRequest.onupgradeneeded = () => {
          const db = openRequest.result

          if (!db.objectStoreNames.contains(NODE_STORE)) {
            const nodeStore = db.createObjectStore(NODE_STORE, { keyPath: 'path' })
            nodeStore.createIndex(INDEX_BY_PARENT, 'parentPath', { unique: false })
            nodeStore.createIndex(INDEX_BY_TYPE, 'type', { unique: false })
            nodeStore.createIndex(INDEX_BY_EXTENSION, 'extension', { unique: false })
            nodeStore.createIndex(INDEX_BY_KIND, 'kind', { unique: false })
          }
        }

        openRequest.onsuccess = () => {
          resolve(openRequest.result)
        }

        openRequest.onerror = () => {
          reject(openRequest.error)
        }
      })
    }

    return this.dbPromise
  }

  private async getOpfsDirectory() {
    if (!this.opfsDirPromise) {
      this.opfsDirPromise = (async () => {
        const storage = navigator.storage as StorageManager & {
          getDirectory?: () => Promise<FileSystemDirectoryHandle>
        }

        if (!storage.getDirectory) {
          throw new VfsError('UNSUPPORTED', 'StorageManager.getDirectory is unavailable in this browser.')
        }

        const rootHandle = await storage.getDirectory()
        return rootHandle.getDirectoryHandle(OPFS_FILES_DIRECTORY, { create: true })
      })()
    }

    return this.opfsDirPromise
  }

  private async request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private async transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  }

  private async getRecord(path: string): Promise<VfsNodeRecord | null> {
    const db = await this.getDb()
    const transaction = db.transaction(NODE_STORE, 'readonly')
    const request = transaction.objectStore(NODE_STORE).get(path)
    const result = await this.request(request)

    return result ?? null
  }

  private async getChildren(parentPath: string): Promise<VfsNodeRecord[]> {
    const db = await this.getDb()
    const transaction = db.transaction(NODE_STORE, 'readonly')
    const index = transaction.objectStore(NODE_STORE).index(INDEX_BY_PARENT)
    const request = index.getAll(parentPath)
    const result = await this.request(request)

    return result ?? []
  }

  private async getAllRecords(): Promise<VfsNodeRecord[]> {
    const db = await this.getDb()
    const transaction = db.transaction(NODE_STORE, 'readonly')
    const request = transaction.objectStore(NODE_STORE).getAll()
    const result = await this.request(request)

    return result ?? []
  }

  private async getDescendants(path: string): Promise<VfsNodeRecord[]> {
    const allRecords = await this.getAllRecords()
    return allRecords.filter((record) => isDescendantPath(record.path, path))
  }

  private async putRecord(record: VfsNodeRecord): Promise<void> {
    const db = await this.getDb()
    const transaction = db.transaction(NODE_STORE, 'readwrite')
    transaction.objectStore(NODE_STORE).put(record)
    await this.transactionDone(transaction)
  }

  private async deleteRecord(path: string): Promise<void> {
    const db = await this.getDb()
    const transaction = db.transaction(NODE_STORE, 'readwrite')
    transaction.objectStore(NODE_STORE).delete(path)
    await this.transactionDone(transaction)
  }

  private async writeOpfsFile(opfsKey: string, data: Uint8Array): Promise<void> {
    const directory = await this.getOpfsDirectory()
    const fileHandle = await directory.getFileHandle(opfsKey, { create: true })
    const writable = await fileHandle.createWritable()

    const buffer = new ArrayBuffer(data.byteLength)
    new Uint8Array(buffer).set(data)

    await writable.write(buffer)
    await writable.close()
  }

  private async readOpfsFile(opfsKey: string): Promise<Uint8Array> {
    const directory = await this.getOpfsDirectory()
    const fileHandle = await directory.getFileHandle(opfsKey)
    const file = await fileHandle.getFile()

    return new Uint8Array(await file.arrayBuffer())
  }

  private async deleteOpfsFile(opfsKey: string): Promise<void> {
    const directory = await this.getOpfsDirectory()

    try {
      await directory.removeEntry(opfsKey)
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError') {
        throw error
      }
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
