import type { VfsFileKind } from './types'

interface FileTypeDescriptor {
  mimeType: string
  kind: VfsFileKind
}

const FILE_TYPE_BY_EXTENSION: Record<string, FileTypeDescriptor> = {
  txt: { mimeType: 'text/plain', kind: 'text' },
  md: { mimeType: 'text/markdown', kind: 'document' },
  json: { mimeType: 'application/json', kind: 'config' },
  yaml: { mimeType: 'application/yaml', kind: 'config' },
  yml: { mimeType: 'application/yaml', kind: 'config' },
  toml: { mimeType: 'application/toml', kind: 'config' },
  ini: { mimeType: 'text/plain', kind: 'config' },
  env: { mimeType: 'text/plain', kind: 'config' },
  js: { mimeType: 'text/javascript', kind: 'code' },
  ts: { mimeType: 'text/typescript', kind: 'code' },
  jsx: { mimeType: 'text/jsx', kind: 'code' },
  tsx: { mimeType: 'text/tsx', kind: 'code' },
  css: { mimeType: 'text/css', kind: 'code' },
  html: { mimeType: 'text/html', kind: 'code' },
  svg: { mimeType: 'image/svg+xml', kind: 'image' },
  png: { mimeType: 'image/png', kind: 'image' },
  jpg: { mimeType: 'image/jpeg', kind: 'image' },
  jpeg: { mimeType: 'image/jpeg', kind: 'image' },
  gif: { mimeType: 'image/gif', kind: 'image' },
  webp: { mimeType: 'image/webp', kind: 'image' },
  mp3: { mimeType: 'audio/mpeg', kind: 'audio' },
  wav: { mimeType: 'audio/wav', kind: 'audio' },
  mp4: { mimeType: 'video/mp4', kind: 'video' },
  webm: { mimeType: 'video/webm', kind: 'video' },
  zip: { mimeType: 'application/zip', kind: 'archive' },
  gz: { mimeType: 'application/gzip', kind: 'archive' },
  tar: { mimeType: 'application/x-tar', kind: 'archive' },
  pdf: { mimeType: 'application/pdf', kind: 'document' },
}

const descriptorFromMime = (mimeType: string): FileTypeDescriptor => {
  if (mimeType.startsWith('text/')) {
    return { mimeType, kind: 'text' }
  }

  if (mimeType.startsWith('image/')) {
    return { mimeType, kind: 'image' }
  }

  if (mimeType.startsWith('audio/')) {
    return { mimeType, kind: 'audio' }
  }

  if (mimeType.startsWith('video/')) {
    return { mimeType, kind: 'video' }
  }

  return { mimeType, kind: 'binary' }
}

export interface DetectedFileType {
  extension: string
  mimeType: string
  kind: VfsFileKind
}

export const detectFileType = (name: string, mimeTypeHint?: string): DetectedFileType => {
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''

  if (extension && FILE_TYPE_BY_EXTENSION[extension]) {
    const descriptor = FILE_TYPE_BY_EXTENSION[extension]
    return {
      extension,
      mimeType: descriptor.mimeType,
      kind: descriptor.kind,
    }
  }

  if (mimeTypeHint) {
    const descriptor = descriptorFromMime(mimeTypeHint)
    return {
      extension,
      mimeType: descriptor.mimeType,
      kind: descriptor.kind,
    }
  }

  return {
    extension,
    mimeType: 'application/octet-stream',
    kind: extension ? 'binary' : 'unknown',
  }
}
