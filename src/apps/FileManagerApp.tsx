import { useEffect, useMemo, useState } from 'react'
import { USER_HOME_PATH, VfsError, type VfsNode, vfs } from '../vfs'

const truncate = (value: string, limit = 60) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value

const toErrorMessage = (error: unknown) => {
  if (error instanceof VfsError) {
    return `${error.code}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected VFS error.'
}

export function FileManagerApp() {
  const [activePath, setActivePath] = useState(USER_HOME_PATH)
  const [entries, setEntries] = useState<VfsNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFilePreview, setSelectedFilePreview] = useState('')
  const [adapterLabel, setAdapterLabel] = useState('')
  const [status, setStatus] = useState('Initializing VFS…')
  const [busy, setBusy] = useState(false)

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.path === selectedPath) ?? null,
    [entries, selectedPath],
  )

  const refreshDirectory = async (pathOverride?: string) => {
    const path = pathOverride ?? activePath
    setBusy(true)

    try {
      await vfs.init()
      setAdapterLabel(vfs.id)
      const nextEntries = await vfs.list(path)
      setEntries(nextEntries)
      setStatus(`Loaded ${path}`)

      if (selectedPath && !nextEntries.some((entry) => entry.path === selectedPath)) {
        setSelectedPath(null)
        setSelectedFilePreview('')
      }
    } catch (error) {
      setStatus(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshDirectory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath])

  useEffect(() => {
    if (!selectedEntry || selectedEntry.type !== 'file') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFilePreview('')
      return
    }

    let cancelled = false

    const loadPreview = async () => {
      try {
        const content = await vfs.readFile(selectedEntry.path)

        if (!cancelled) {
          setSelectedFilePreview(typeof content === 'string' ? content : '[binary content]')
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedFilePreview(toErrorMessage(error))
        }
      }
    }

    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [selectedEntry])

  const navigateTo = (path: string) => {
    setActivePath(path)
  }

  const navigateUp = () => {
    if (activePath === '/') {
      return
    }

    const parentPath = activePath.split('/').slice(0, -1).join('/') || '/'
    navigateTo(parentPath)
  }

  const createFolder = async () => {
    const input = window.prompt('New folder name')?.trim()

    if (!input) {
      return
    }

    try {
      setBusy(true)
      await vfs.mkdir(`${activePath}/${input}`)
      setStatus(`Folder created: ${input}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const createTextFile = async () => {
    const fileName = window.prompt('New file name', 'new-file.txt')?.trim()

    if (!fileName) {
      return
    }

    const content = window.prompt('File content', 'Hello WebOS VFS') ?? ''

    try {
      setBusy(true)
      await vfs.writeFile(`${activePath}/${fileName}`, content, { create: true, overwrite: false })
      setStatus(`File created: ${fileName}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (!selectedEntry) {
      return
    }

    const confirmed = window.confirm(`Delete ${selectedEntry.path}?`)

    if (!confirmed) {
      return
    }

    try {
      setBusy(true)
      await vfs.delete(selectedEntry.path, { recursive: selectedEntry.type === 'directory' })
      setSelectedPath(null)
      setSelectedFilePreview('')
      setStatus(`Deleted: ${selectedEntry.name}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const renameSelected = async () => {
    if (!selectedEntry) {
      return
    }

    const nextName = window.prompt('Rename to', selectedEntry.name)?.trim()

    if (!nextName || nextName === selectedEntry.name) {
      return
    }

    const targetPath = `${activePath}/${nextName}`

    try {
      setBusy(true)
      await vfs.move(selectedEntry.path, targetPath)
      setSelectedPath(targetPath)
      setStatus(`Renamed to: ${nextName}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const duplicateSelected = async () => {
    if (!selectedEntry) {
      return
    }

    const suggestedName =
      selectedEntry.type === 'directory'
        ? `${selectedEntry.name}-copy`
        : selectedEntry.name.replace(/(\.[^.]*)?$/, '-copy$1')

    const nextName = window.prompt('Copy as', suggestedName)?.trim()

    if (!nextName) {
      return
    }

    try {
      setBusy(true)
      await vfs.copy(selectedEntry.path, `${activePath}/${nextName}`)
      setStatus(`Copied as: ${nextName}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const exportSnapshot = async () => {
    try {
      setBusy(true)
      const snapshot = await vfs.exportTree(USER_HOME_PATH)
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
      setStatus('Snapshot copied to clipboard.')
    } catch (error) {
      setStatus(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const importSnapshot = async () => {
    const payload = window.prompt('Paste VFS snapshot JSON')

    if (!payload) {
      return
    }

    try {
      setBusy(true)
      const snapshot = JSON.parse(payload)
      await vfs.importTree(snapshot, { overwrite: false })
      setStatus('Snapshot imported.')
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <div className="file-manager">
      <header className="file-manager-toolbar">
        <button type="button" onClick={navigateUp} disabled={busy || activePath === '/'}>
          ⬆ Up
        </button>
        <button type="button" onClick={createFolder} disabled={busy}>
          New Folder
        </button>
        <button type="button" onClick={createTextFile} disabled={busy}>
          New File
        </button>
        <button type="button" onClick={renameSelected} disabled={busy || !selectedEntry}>
          Rename
        </button>
        <button type="button" onClick={duplicateSelected} disabled={busy || !selectedEntry}>
          Copy
        </button>
        <button type="button" onClick={deleteSelected} disabled={busy || !selectedEntry}>
          Delete
        </button>
        <button type="button" onClick={exportSnapshot} disabled={busy}>
          Export
        </button>
        <button type="button" onClick={importSnapshot} disabled={busy}>
          Import
        </button>
      </header>

      <p className="file-manager-meta">
        <strong>{activePath}</strong>
        <span>Adapter: {adapterLabel || 'pending'}</span>
      </p>

      <div className="file-manager-layout">
        <aside className="file-manager-list" aria-label="Directory listing">
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={`entry-row ${selectedPath === entry.path ? 'selected' : ''}`}
              onClick={() => setSelectedPath(entry.path)}
              onDoubleClick={() => {
                if (entry.type === 'directory') {
                  navigateTo(entry.path)
                }
              }}
            >
              <span className="entry-label">
                {entry.type === 'directory' ? '📁' : '📄'} {entry.name}
              </span>
              <span className="entry-meta">{entry.writable ? 'rw' : 'ro'}</span>
            </button>
          ))}

          {entries.length === 0 && <p className="empty-list">No files in this folder.</p>}
        </aside>

        <section className="file-manager-preview" aria-label="Selection preview">
          {!selectedEntry && <p>Select a file or folder to inspect metadata.</p>}

          {selectedEntry && (
            <>
              <h3>{selectedEntry.name}</h3>
              <ul>
                <li>Path: {truncate(selectedEntry.path)}</li>
                <li>Type: {selectedEntry.type}</li>
                <li>Writable: {selectedEntry.writable ? 'yes' : 'no'}</li>
                <li>Size: {selectedEntry.size} bytes</li>
                <li>Kind: {selectedEntry.kind ?? 'n/a'}</li>
                <li>MIME: {selectedEntry.mimeType ?? 'n/a'}</li>
              </ul>

              {selectedEntry.type === 'file' && (
                <textarea value={selectedFilePreview} readOnly aria-label="File preview" />
              )}
            </>
          )}
        </section>
      </div>

      <footer className="file-manager-status">{status}</footer>
    </div>
  )
}
