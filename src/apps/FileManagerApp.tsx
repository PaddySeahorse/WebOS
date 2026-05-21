import { useEffect, useState } from 'react'
import { USER_HOME_PATH, VfsError, type VfsNode, vfs } from '../vfs'
import { FileTree } from './FileManager/FileTree'
import { FileListView } from './FileManager/FileListView'
import { FileGridView } from './FileManager/FileGridView'

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

type ViewMode = 'list' | 'grid'

export function FileManagerApp() {
  const [activePath, setActivePath] = useState(USER_HOME_PATH)
  const [entries, setEntries] = useState<VfsNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFilePreview, setSelectedFilePreview] = useState('')
  const [adapterLabel, setAdapterLabel] = useState('')
  const [status, setStatus] = useState('Initializing VFS…')
  const [busy, setBusy] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showTree, setShowTree] = useState(true)

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
        // If the selected path is not in the new entries, we don't necessarily want to clear it
        // because it might be selected in the tree but not in the current folder view.
        // However, if we were in a folder and it got deleted, we should clear it.
        // For now, let's keep it if it still exists.
        const stillExists = await vfs.stat(selectedPath);
        if (!stillExists) {
            setSelectedPath(null)
            setSelectedFilePreview('')
        }
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
    const handleVfsChanged = () => {
        void refreshDirectory();
    };

    window.addEventListener('vfs-changed', handleVfsChanged);
    return () => window.removeEventListener('vfs-changed', handleVfsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  useEffect(() => {
    let cancelled = false

    const loadEntryAndPreview = async () => {
      if (!selectedPath) {
        setSelectedFilePreview('')
        return
      }

      try {
        const node = await vfs.stat(selectedPath)
        if (cancelled) return

        if (!node || node.type !== 'file') {
          setSelectedFilePreview('')
          return
        }

        const content = await vfs.readFile(node.path)

        if (!cancelled) {
          setSelectedFilePreview(typeof content === 'string' ? content : '[binary content]')
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedFilePreview(toErrorMessage(error))
        }
      }
    }

    void loadEntryAndPreview()

    return () => {
      cancelled = true
    }
  }, [selectedPath])

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
    if (!selectedPath) {
      return
    }

    const confirmed = window.confirm(`Delete ${selectedPath}?`)

    if (!confirmed) {
      return
    }

    try {
      setBusy(true)
      const node = await vfs.stat(selectedPath);
      await vfs.delete(selectedPath, { recursive: node?.type === 'directory' })
      setSelectedPath(null)
      setSelectedFilePreview('')
      setStatus(`Deleted: ${selectedPath}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const renameSelected = async () => {
    if (!selectedPath) {
      return
    }

    const node = await vfs.stat(selectedPath);
    if (!node) return;

    const nextName = window.prompt('Rename to', node.name)?.trim()

    if (!nextName || nextName === node.name) {
      return
    }

    const parentDir = selectedPath.split('/').slice(0, -1).join('/') || '/'
    const targetPath = `${parentDir}/${nextName}`

    try {
      setBusy(true)
      await vfs.move(selectedPath, targetPath)
      setSelectedPath(targetPath)
      setStatus(`Renamed to: ${nextName}`)
      await refreshDirectory()
    } catch (error) {
      setStatus(toErrorMessage(error))
      setBusy(false)
    }
  }

  const duplicateSelected = async () => {
    if (!selectedPath) {
      return
    }

    const node = await vfs.stat(selectedPath);
    if (!node) return;

    const suggestedName =
      node.type === 'directory'
        ? `${node.name}-copy`
        : node.name.replace(/(\.[^.]*)?$/, '-copy$1')

    const nextName = window.prompt('Copy as', suggestedName)?.trim()

    if (!nextName) {
      return
    }

    const parentDir = selectedPath.split('/').slice(0, -1).join('/') || '/'

    try {
      setBusy(true)
      await vfs.copy(selectedPath, `${parentDir}/${nextName}`)
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
        <button type="button" onClick={() => setShowTree(!showTree)}>
          {showTree ? 'Hide Tree' : 'Show Tree'}
        </button>
        <button type="button" onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>
          {viewMode === 'list' ? 'Grid View' : 'List View'}
        </button>
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
        <button type="button" onClick={createFolder} disabled={busy}>
          New Folder
        </button>
        <button type="button" onClick={createTextFile} disabled={busy}>
          New File
        </button>
        <button type="button" onClick={renameSelected} disabled={busy || !selectedPath}>
          Rename
        </button>
        <button type="button" onClick={duplicateSelected} disabled={busy || !selectedPath}>
          Copy
        </button>
        <button type="button" onClick={deleteSelected} disabled={busy || !selectedPath}>
          Delete
        </button>
        <div style={{ flex: 1 }} />
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

      <div className={`file-manager-layout ${showTree ? 'with-tree' : ''}`}>
        {showTree && (
          <aside className="file-manager-sidebar">
            <FileTree 
              onSelect={(path) => {
                setSelectedPath(path);
                vfs.stat(path).then(node => {
                  if (node?.type === 'directory') {
                    navigateTo(path);
                  }
                });
              }} 
              selectedPath={selectedPath} 
            />
          </aside>
        )}

        <main className="file-manager-list">
          {viewMode === 'list' ? (
            <FileListView 
              entries={entries} 
              selectedPath={selectedPath} 
              onSelect={setSelectedPath} 
              onNavigate={navigateTo} 
            />
          ) : (
            <FileGridView 
              entries={entries} 
              selectedPath={selectedPath} 
              onSelect={setSelectedPath} 
              onNavigate={navigateTo} 
            />
          )}
        </main>

        <section className="file-manager-preview" aria-label="Selection preview">
          {!selectedPath && <p>Select a file or folder to inspect metadata.</p>}

          {selectedPath && (
            <SelectionPreview path={selectedPath} previewContent={selectedFilePreview} />
          )}
        </section>
      </div>

      <footer className="file-manager-status">{status}</footer>
    </div>
  )
}

function SelectionPreview({ path, previewContent }: { path: string; previewContent: string }) {
  const [node, setNode] = useState<VfsNode | null>(null);

  useEffect(() => {
    vfs.stat(path).then(setNode);
  }, [path]);

  if (!node) return <div>Loading metadata...</div>;

  return (
    <>
      <h3>{node.name}</h3>
      <ul>
        <li>Path: {truncate(node.path)}</li>
        <li>Type: {node.type}</li>
        <li>Writable: {node.writable ? 'yes' : 'no'}</li>
        <li>Size: {node.size} bytes</li>
        <li>Kind: {node.kind ?? 'n/a'}</li>
        <li>MIME: {node.mimeType ?? 'n/a'}</li>
      </ul>

      {node.type === 'file' && (
        <textarea value={previewContent} readOnly aria-label="File preview" />
      )}
    </>
  );
}
