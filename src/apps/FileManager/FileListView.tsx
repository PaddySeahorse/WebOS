import React from 'react';
import { vfs, type VfsNode } from '../../vfs';

interface FileListViewProps {
  entries: VfsNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onNavigate: (path: string) => void;
}

export const FileListView: React.FC<FileListViewProps> = ({
  entries,
  selectedPath,
  onSelect,
  onNavigate,
}) => {
  const onDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/vfs-path', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, entry: VfsNode) => {
    if (entry.type === 'directory') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const onDrop = async (e: React.DragEvent, targetEntry: VfsNode) => {
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData('text/vfs-path');
    if (!sourcePath || sourcePath === targetEntry.path) return;

    try {
      const sourceName = sourcePath.split('/').pop();
      const targetPath = `${targetEntry.path}/${sourceName}`;
      await vfs.move(sourcePath, targetPath);
      // We need a way to refresh. Maybe a callback?
      // For now, let's assume the parent will handle refresh if we had a move listener.
      // Actually, FileManagerApp.tsx should probably provide a onMove callback.
      window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: targetEntry.path } }));
    } catch (error) {
      console.error('Move failed', error);
      alert('Move failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="file-list-view" aria-label="Directory listing">
      {entries.map((entry) => (
        <button
          key={entry.path}
          type="button"
          className={`entry-row ${selectedPath === entry.path ? 'selected' : ''}`}
          onClick={() => onSelect(entry.path)}
          onDoubleClick={() => {
            if (entry.type === 'directory') {
              onNavigate(entry.path);
            }
          }}
          draggable
          onDragStart={(e) => onDragStart(e, entry.path)}
          onDragOver={(e) => onDragOver(e, entry)}
          onDrop={(e) => onDrop(e, entry)}
        >
          <span className="entry-label">
            {entry.type === 'directory' ? '📁' : '📄'} {entry.name}
          </span>
          <span className="entry-meta">
             {entry.size} bytes | {entry.writable ? 'rw' : 'ro'}
          </span>
        </button>
      ))}

      {entries.length === 0 && <p className="empty-list">No files in this folder.</p>}
    </div>
  );
};
