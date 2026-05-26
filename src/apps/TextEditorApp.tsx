import { useState, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { vfs } from '../vfs'
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'

interface EditorTab {
  id: string
  path: string | null
  content: string
  isDirty: boolean
  name: string
}

export function TextEditorApp(): ReactNode {
  const [tabs, setTabs] = useState<EditorTab[]>([
    { id: '1', path: null, content: '', isDirty: false, name: 'Untitled 1' }
  ])
  const [activeTabId, setActiveTabId] = useState<string>('1')
  const [status, setStatus] = useState<string>('Ready')
  const [nextTabId, setNextTabId] = useState(2)

  const activeTab = tabs.find(t => t.id === activeTabId)

  const getLanguageExtension = (filename: string) => {
    if (filename.endsWith('.js') || filename.endsWith('.ts') || filename.endsWith('.tsx') || filename.endsWith('.jsx')) {
      return [javascript({ jsx: true, typescript: true })]
    }
    if (filename.endsWith('.html')) return [html()]
    if (filename.endsWith('.css')) return [css()]
    if (filename.endsWith('.md')) return [markdown()]
    return []
  }

  const updateTab = (id: string, updates: Partial<EditorTab>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const handleContentChange = (val: string) => {
    if (activeTab) {
      updateTab(activeTab.id, { content: val, isDirty: true })
    }
  }

  const newTab = () => {
    const id = nextTabId.toString()
    setNextTabId(prev => prev + 1)
    setTabs(prev => [...prev, { id, path: null, content: '', isDirty: false, name: `Untitled ${id}` }])
    setActiveTabId(id)
  }

  const closeTab = (id: string, e: ReactMouseEvent) => {
    e.stopPropagation()
    const tabToClose = tabs.find(t => t.id === id)
    if (tabToClose?.isDirty) {
      if (!window.confirm(`Save changes to ${tabToClose.name}? (Click OK to discard)`)) {
        return
      }
    }
    const nextTabs = tabs.filter(t => t.id !== id)
    setTabs(nextTabs)
    if (activeTabId === id) {
      setActiveTabId(nextTabs.length > 0 ? nextTabs[0].id : '')
    }
  }

  const openFile = async () => {
    const path = window.prompt('Enter file path to open (e.g. /home/notes.txt):')
    if (!path) return
    try {
      setStatus(`Loading ${path}...`)
      const content = await vfs.readFile(path)
      const text = typeof content === 'string' ? content : new TextDecoder().decode(content)
      const parts = path.split('/')
      const name = parts[parts.length - 1]

      const id = nextTabId.toString()
      setNextTabId(prev => prev + 1)
      setTabs(prev => [...prev, { id, path, content: text, isDirty: false, name }])
      setActiveTabId(id)
      setStatus(`Opened ${path}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Error opening file')
    }
  }

  const saveFile = async () => {
    if (!activeTab) return
    let targetPath = activeTab.path
    if (!targetPath) {
      targetPath = window.prompt('Enter file path to save (e.g. /home/new.txt):')
      if (!targetPath) return
    }
    try {
      setStatus(`Saving ${targetPath}...`)
      await vfs.writeFile(targetPath, activeTab.content, { create: true, overwrite: true })
      const parts = targetPath.split('/')
      const name = parts[parts.length - 1]
      updateTab(activeTab.id, { path: targetPath, name, isDirty: false })
      setStatus(`Saved ${targetPath}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Error saving file')
    }
  }

  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTabId(tabs[0].id)
    }
  }, [tabs, activeTabId])

  const handleBlur = () => {
    if (activeTab?.isDirty && activeTab?.path) {
      void saveFile()
    }
  }

  return (
    <div className="text-editor">
      <header className="editor-toolbar">
        <button type="button" onClick={newTab}>New Tab</button>
        <button type="button" onClick={openFile}>Open</button>
        <button type="button" onClick={saveFile} disabled={!activeTab} style={{ opacity: !activeTab ? 0.5 : 1 }}>Save</button>
      </header>
      
      <nav className="editor-tabs">
        {tabs.map(tab => (
          <div 
            key={tab.id} 
            onClick={() => setActiveTabId(tab.id)}
            className={`editor-tab ${activeTabId === tab.id ? 'active' : ''}`}
          >
            <span>{tab.name}{tab.isDirty ? ' •' : ''}</span>
            <button 
              type="button"
              className="tab-close"
              onClick={(e) => closeTab(tab.id, e)}
            >
              ✕
            </button>
          </div>
        ))}
      </nav>

      <main className="editor-content">
        {activeTab ? (
          <div className="editor-wrapper">
            <CodeMirror
              value={activeTab.content}
              height="100%"
              theme={oneDark}
              extensions={getLanguageExtension(activeTab.name)}
              onChange={handleContentChange}
              onBlur={handleBlur}
              className="cm-editor-container"
            />
            {/* Mobile Selection Toolbar (Simulated as a permanent touch-bar for simplicity on mobile) */}
            <div className="editor-mobile-toolbar">
              <button title="Undo" onClick={() => document.execCommand('undo')}>↶</button>
              <button title="Redo" onClick={() => document.execCommand('redo')}>↷</button>
              <button title="Select All" onClick={() => {
                const el = document.querySelector('.cm-content') as HTMLElement
                if (el) el.focus()
                document.execCommand('selectAll')
              }}>∀</button>
              <button title="Copy" onClick={() => document.execCommand('copy')}>📋</button>
              <button title="Paste" onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  handleContentChange(activeTab.content + text)
                } catch (e) {
                  setStatus('Clipboard access denied')
                }
              }}>📥</button>
            </div>
          </div>
        ) : (
          <div className="editor-empty">
            No open files
          </div>
        )}
      </main>

      <footer className="editor-status">
        {status}
      </footer>
    </div>
  )
}
