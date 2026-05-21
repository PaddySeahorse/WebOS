import React, { useEffect, useState } from 'react';
import { vfs, type VfsNode } from '../../vfs';

interface FileTreeProps {
  onSelect: (path: string) => void;
  selectedPath: string | null;
}

interface TreeItemProps {
  node: VfsNode;
  level: number;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}

const TreeItem: React.FC<TreeItemProps> = ({ node, level, onSelect, selectedPath }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<VfsNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const hasChildren = node.type === 'directory';

  const refreshChildren = async () => {
    setIsLoading(true);
    try {
      const result = await vfs.list(node.path);
      setChildren(result);
    } catch (error) {
      console.error('Failed to list directory', error);
    } finally {
      setIsLoading(false);
    }
  }

  const toggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && children.length === 0) {
      await refreshChildren();
    }
    setIsExpanded(!isExpanded);
  };

  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/vfs-path', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    if (node.type === 'directory') {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourcePath = e.dataTransfer.getData('text/vfs-path');
    if (!sourcePath || sourcePath === node.path) return;

    try {
      const sourceName = sourcePath.split('/').pop();
      const targetPath = `${node.path}/${sourceName}`;
      await vfs.move(sourcePath, targetPath);
      window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: node.path } }));
      // If expanded, refresh children
      if (isExpanded) {
        await refreshChildren();
      }
    } catch (error) {
      console.error('Move failed', error);
      alert('Move failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="tree-item-container">
      <div 
        className={`tree-item ${selectedPath === node.path ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 12}px` }}
        onClick={() => onSelect(node.path)}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {hasChildren && (
          <span className="expand-icon" onClick={toggleExpand}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="expand-spacer" />}
        <span className="node-icon">{node.type === 'directory' ? '📁' : '📄'}</span>
        <span className="node-name">{node.name}</span>
      </div>
      {isExpanded && (
        <div className="tree-children">
          {isLoading ? (
            <div className="tree-loading" style={{ paddingLeft: `${(level + 1) * 12 + 16}px` }}>
              Loading...
            </div>
          ) : (
            children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                level={level + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))
          )}
          {!isLoading && children.length === 0 && (
            <div className="tree-empty" style={{ paddingLeft: `${(level + 1) * 12 + 16}px` }}>
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({ onSelect, selectedPath }) => {
  const [rootEntries, setRootEntries] = useState<VfsNode[]>([]);

  useEffect(() => {
    const loadRoot = async () => {
      try {
        const root = await vfs.list('/');
        setRootEntries(root);
      } catch (error) {
        console.error('Failed to load root', error);
      }
    };
    loadRoot();
  }, []);

  return (
    <div className="file-tree">
      {rootEntries.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          level={0}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
};
