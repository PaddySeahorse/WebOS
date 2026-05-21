import React from 'react';
import { vfs, type VfsNode } from '../../vfs';

interface FileGridViewProps {
  entries: VfsNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onNavigate: (path: string) => void;
}

export const FileGridView: React.FC<FileGridViewProps> = ({
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
      window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: targetEntry.path } }));
    } catch (error) {
      console.error('Move failed', error);
      alert('Move failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="file-grid-view" aria-label="Directory listing">
      {entries.map((entry) => (
        <div
          key={entry.path}
          className={`grid-item ${selectedPath === entry.path ? 'selected' : ''}`}
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
          <div className="grid-item-icon">
            {entry.type === 'directory' ? '📂' : '📄'}
          </div>
          <div className="grid-item-name">{entry.name}</div>
        </div>
      ))}

      {entries.length === 0 && <p className="empty-list">No files in this folder.</p>}
    </div>
  );
};
