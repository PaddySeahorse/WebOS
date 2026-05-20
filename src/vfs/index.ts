import { MemoryVfsAdapter } from './backends/memoryVfsAdapter'
import { createVfsAdapter } from './createVfsAdapter'
import type {
  VfsAdapter,
  VfsCopyMoveOptions,
  VfsDeleteOptions,
  VfsImportOptions,
  VfsMkdirOptions,
  VfsNode,
  VfsReadFileOptions,
  VfsSnapshot,
  VfsWriteFileData,
  VfsWriteFileOptions,
} from './types'

let activeAdapter: VfsAdapter = createVfsAdapter()
let initPromise: Promise<void> | null = null

const ensureReady = async () => {
  if (!initPromise) {
    initPromise = activeAdapter.init().catch(async () => {
      if (activeAdapter.id !== 'memory-vfs') {
        activeAdapter = new MemoryVfsAdapter()
        initPromise = activeAdapter.init()
        return initPromise
      }

      throw new Error('VFS initialization failed for all adapters.')
    })
  }

  await initPromise
}

export const vfs = {
  get id() {
    return activeAdapter.id
  },

  resolvePath(path: string, cwd?: string) {
    return activeAdapter.resolvePath(path, cwd)
  },

  async init() {
    await ensureReady()
  },

  async stat(path: string): Promise<VfsNode | null> {
    await ensureReady()
    return activeAdapter.stat(path)
  },

  async list(path: string): Promise<VfsNode[]> {
    await ensureReady()
    return activeAdapter.list(path)
  },

  async readFile(path: string, options?: VfsReadFileOptions): Promise<string | Uint8Array> {
    await ensureReady()
    return activeAdapter.readFile(path, options)
  },

  async writeFile(
    path: string,
    data: VfsWriteFileData,
    options?: VfsWriteFileOptions,
  ): Promise<VfsNode> {
    await ensureReady()
    return activeAdapter.writeFile(path, data, options)
  },

  async mkdir(path: string, options?: VfsMkdirOptions): Promise<VfsNode> {
    await ensureReady()
    return activeAdapter.mkdir(path, options)
  },

  async delete(path: string, options?: VfsDeleteOptions): Promise<void> {
    await ensureReady()
    return activeAdapter.delete(path, options)
  },

  async move(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void> {
    await ensureReady()
    return activeAdapter.move(sourcePath, targetPath, options)
  },

  async copy(sourcePath: string, targetPath: string, options?: VfsCopyMoveOptions): Promise<void> {
    await ensureReady()
    return activeAdapter.copy(sourcePath, targetPath, options)
  },

  async exportTree(rootPath?: string): Promise<VfsSnapshot> {
    await ensureReady()
    return activeAdapter.exportTree(rootPath)
  },

  async importTree(snapshot: VfsSnapshot, options?: VfsImportOptions): Promise<void> {
    await ensureReady()
    return activeAdapter.importTree(snapshot, options)
  },
}

export type { VfsAdapter, VfsNode, VfsSnapshot, VfsWriteFileData, VfsWriteFileOptions } from './types'
export { HOME_PATH, ROOT_PATH, TILDE_ALIAS, USER_HOME_PATH, VfsError } from './types'
