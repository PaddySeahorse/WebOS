import { MemoryVfsAdapter } from './backends/memoryVfsAdapter'
import { OpfsIndexedDbVfsAdapter } from './backends/opfsIndexedDbVfsAdapter'
import type { VfsAdapter } from './types'

export const createVfsAdapter = (): VfsAdapter => {
  if (typeof window !== 'undefined') {
    return new OpfsIndexedDbVfsAdapter()
  }

  return new MemoryVfsAdapter()
}
