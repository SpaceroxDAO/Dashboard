import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Edit2, Eye, Save, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useFileApi } from '@/hooks/useFileApi';
interface ViewerFile {
  id: string;
  name: string;
  path: string;
  lastModified: Date | string;
}

interface MarkdownViewerProps {
  file: ViewerFile | null;
  content: string | null;
  loading?: boolean;
  onContentChange?: (content: string) => void;
}

export function MarkdownViewer({ file, content, loading, onContentChange }: MarkdownViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { apiAvailable, writeFile } = useFileApi();

  // Sync edit content when file changes
  useEffect(() => {
    setEditContent(content || '');
    setIsEditing(false);
    setSaveError(null);
  }, [file?.id, content]);

  const handleCopy = async () => {
    const textToCopy = isEditing ? editContent : content;
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
    }
  };

  const handleEdit = () => {
    setEditContent(content || '');
    setIsEditing(true);
    setSaveError(null);
  };

  const handleCancel = () => {
    setEditContent(content || '');
    setIsEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!file) return;

    setSaving(true);
    setSaveError(null);

    try {
      const success = await writeFile(file.path, editContent);
      if (success) {
        onContentChange?.(editContent);
        setIsEditing(false);
      } else {
        setSaveError(apiAvailable === false
          ? 'API not available. Run "npm run dev:full" to enable file editing.'
          : 'Failed to save file'
        );
      }
    } catch {
      setSaveError('Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="h-6 bg-surface-hover rounded w-3/4" />
          <div className="h-4 bg-surface-hover rounded w-full" />
          <div className="h-4 bg-surface-hover rounded w-5/6" />
          <div className="h-4 bg-surface-hover rounded w-4/6" />
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-dim">
        <p>Select a file to view its contents</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-panel)] bg-surface-elevated rounded-t-lg">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium text-text-bright truncate">{file.name}</h3>
          {isEditing && (
            <span className="px-2 py-0.5 text-xs bg-signal-caution/20 text-signal-caution rounded">Editing</span>
          )}
          {apiAvailable === false && (
            <span className="px-2 py-0.5 text-xs bg-text-dim/20 text-text-dim rounded" title="Run 'npm run dev:full' to enable editing">
              Read-only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Copy className="w-4 h-4" />} onClick={handleCopy}>
            <span className="hidden sm:inline">Copy</span>
          </Button>
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} onClick={handleCancel}>
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                onClick={handleSave}
                disabled={saving}
              >
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button variant="ghost" size="sm" icon={<X className="w-4 h-4" />} onClick={handleCancel}>
                <span className="hidden sm:inline">Cancel</span>
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" icon={<Edit2 className="w-4 h-4" />} onClick={handleEdit}>
              <span className="hidden sm:inline">Edit</span>
            </Button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-signal-alert/10 text-signal-alert text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto bg-surface-elevated">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 lg:p-6 bg-transparent text-text-bright font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div className="p-4 lg:p-6 prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-text-dim bg-surface-elevated border-t border-[var(--color-border-panel)] rounded-b-lg">
        <span>
          Last modified: {new Date(file.lastModified).toLocaleDateString()} at{' '}
          {new Date(file.lastModified).toLocaleTimeString()}
        </span>
        <span className="font-mono">{file.path}</span>
      </div>
    </div>
  );
}
