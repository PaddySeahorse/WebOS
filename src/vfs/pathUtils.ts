import { ROOT_PATH, TILDE_ALIAS, USER_HOME_PATH, VfsError } from './types'

const normalizeSlashes = (value: string) => value.replace(/\\+/g, '/').replace(/\/+/g, '/')

const trimTrailingSlash = (value: string) => {
  if (value === ROOT_PATH) {
    return ROOT_PATH
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

const expandAlias = (value: string) => {
  if (value === TILDE_ALIAS) {
    return USER_HOME_PATH
  }

  if (value.startsWith(`${TILDE_ALIAS}/`)) {
    return `${USER_HOME_PATH}${value.slice(1)}`
  }

  return value
}

export const resolvePath = (inputPath: string, cwd = USER_HOME_PATH): string => {
  const raw = inputPath.trim()

  if (!raw) {
    throw new VfsError('INVALID_PATH', 'Path cannot be empty.')
  }

  const expandedInput = expandAlias(normalizeSlashes(raw))
  const expandedCwd = expandAlias(normalizeSlashes(cwd || USER_HOME_PATH))

  const absolute = expandedInput.startsWith('/') ? expandedInput : `${expandedCwd}/${expandedInput}`

  const parts = absolute.split('/')
  const resolved: string[] = []

  for (const part of parts) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      if (resolved.length === 0) {
        throw new VfsError('INVALID_PATH', `Path escapes root: ${inputPath}`)
      }
      resolved.pop()
      continue
    }

    resolved.push(part)
  }

  const normalized = `/${resolved.join('/')}`
  return trimTrailingSlash(normalized)
}

export const getParentPath = (path: string): string | null => {
  if (path === ROOT_PATH) {
    return null
  }

  const segments = path.split('/').filter(Boolean)

  if (segments.length <= 1) {
    return ROOT_PATH
  }

  return `/${segments.slice(0, -1).join('/')}`
}

export const getBaseName = (path: string): string => {
  if (path === ROOT_PATH) {
    return ROOT_PATH
  }

  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ROOT_PATH
}

export const isDescendantPath = (candidate: string, parent: string): boolean => {
  if (parent === ROOT_PATH) {
    return candidate !== ROOT_PATH && candidate.startsWith('/')
  }

  return candidate.startsWith(`${parent}/`)
}

export const assertNoSelfOrDescendantMove = (sourcePath: string, targetPath: string) => {
  if (sourcePath === targetPath || isDescendantPath(targetPath, sourcePath)) {
    throw new VfsError('INVALID_MOVE', 'Cannot move a directory into itself or one of its children.')
  }
}

export const pathDepth = (path: string) => {
  if (path === ROOT_PATH) {
    return 0
  }

  return path.split('/').filter(Boolean).length
}

export const isPathWithin = (path: string, basePath: string) => {
  return path === basePath || isDescendantPath(path, basePath)
}
