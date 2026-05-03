import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronLeft, Loader2, Save, RotateCcw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { PageContainer } from '@/components/layout';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: string;
}

interface DirResponse {
  path: string;
  entries: FileEntry[];
}

interface FileContentResponse {
  path: string;
  content: string;
  size: number;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml',
    sh: 'shell', bash: 'shell', css: 'css', html: 'html', xml: 'xml',
    toml: 'ini', env: 'ini', txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}


function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path === '/' ? [] : path.replace(/^\//, '').split('/');
  return (
    <div className="flex items-center gap-1 text-xs text-text-dim flex-wrap">
      <button
        onClick={() => onNavigate('/')}
        className="hover:text-text-bright transition-colors font-mono"
      >
        ~/.hermes
      </button>
      {parts.map((part, i) => {
        const partPath = '/' + parts.slice(0, i + 1).join('/');
        return (
          <span key={partPath} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <button
              onClick={() => onNavigate(partPath)}
              className="hover:text-text-bright transition-colors font-mono"
            >
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export function FilesPage() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id ?? 'finn';

  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loadingDir, setLoadingDir] = useState(true);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const isDirty = fileContent !== originalContent;

  const loadDir = useCallback((path: string) => {
    setLoadingDir(true);
    fetch(`${API_BASE}/api/agents/${agentId}/files?path=${encodeURIComponent(path)}`)
      .then(r => r.ok ? r.json() : { entries: [] })
      .then((data: DirResponse) => setEntries(Array.isArray(data.entries) ? data.entries : []))
      .catch(() => setEntries([]))
      .finally(() => setLoadingDir(false));
  }, [agentId]);

  useEffect(() => {
    if (agentId !== 'finn') return;
    loadDir(currentPath);
  }, [agentId, currentPath, loadDir]);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setSelectedFile(null);
    setFileContent('');
    setOriginalContent('');
    setSaveMsg(null);
  };

  const openFile = (entry: FileEntry) => {
    if (entry.type === 'dir') {
      const next = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      navigateTo(next);
      return;
    }
    const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    setSelectedFile(filePath);
    setSaveMsg(null);
    setLoadingFile(true);
    fetch(`${API_BASE}/api/agents/${agentId}/files/content?path=${encodeURIComponent(filePath)}`)
      .then(r => r.ok ? r.json() : { content: '' })
      .then((data: FileContentResponse) => {
        const text = data.content ?? '';
        setFileContent(text);
        setOriginalContent(text);
      })
      .catch(() => { setFileContent(''); setOriginalContent(''); })
      .finally(() => setLoadingFile(false));
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/agents/${agentId}/files/content?path=${encodeURIComponent(selectedFile)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: fileContent }),
        }
      );
      if (r.ok) {
        setOriginalContent(fileContent);
        setSaveMsg({ text: 'Saved', ok: true });
      } else {
        setSaveMsg({ text: 'Save failed', ok: false });
      }
    } catch {
      setSaveMsg({ text: 'Save failed', ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const handleDiscard = () => {
    setFileContent(originalContent);
    setSaveMsg(null);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    navigateTo(parent);
  };

  if (agentId !== 'finn') {
    return (
      <PageContainer title="Files">
        <div className="text-center py-8 text-text-dim">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Files only available for Finn</p>
        </div>
      </PageContainer>
    );
  }

  const fileNameOnly = selectedFile ? selectedFile.split('/').pop() : '';

  return (
    <PageContainer title="Files">
      <div className={`flex gap-3 ${selectedFile ? 'lg:flex-row flex-col' : ''}`}>
        {/* Left panel — directory tree */}
        <div className={`${selectedFile ? 'lg:w-1/3' : 'w-full'} space-y-2`}>
          {/* Breadcrumb + back */}
          <div className="flex items-center gap-2">
            {currentPath !== '/' && (
              <button
                onClick={navigateUp}
                className="p-1 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright transition-colors"
                title="Up"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Breadcrumb path={currentPath} onNavigate={navigateTo} />
          </div>

          {/* Entries list */}
          {loadingDir ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-signal-primary" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-6 text-text-dim">
              <FolderOpen className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Empty directory</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {entries.map(entry => {
                const entryPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
                const isSelected = selectedFile === entryPath;
                return (
                  <button
                    key={entry.name}
                    onClick={() => openFile(entry)}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-signal-primary/10 border border-signal-primary/30'
                        : 'hover:bg-surface-hover border border-transparent'
                    }`}
                  >
                    {entry.type === 'dir' ? (
                      <FolderOpen className="w-4 h-4 text-signal-primary flex-shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                    )}
                    <span className={`text-xs truncate flex-1 ${isSelected ? 'text-signal-primary' : 'text-text-bright'}`}>
                      {entry.name}
                    </span>
                    <span className="text-[10px] text-text-dim flex-shrink-0 hidden sm:block">
                      {entry.type === 'file' ? formatSize(entry.size) : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel — editor */}
        {selectedFile && (
          <div className="lg:w-2/3 flex flex-col space-y-2">
            {/* Editor header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                <span className="text-xs font-mono text-text-bright truncate">
                  {fileNameOnly}
                  {isDirty && <span className="text-signal-caution ml-1">*</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {saveMsg && (
                  <span className={`text-[11px] ${saveMsg.ok ? 'text-signal-online' : 'text-red-400'}`}>
                    {saveMsg.text}
                  </span>
                )}
                {isDirty && (
                  <button
                    onClick={handleDiscard}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-muted hover:bg-surface-hover hover:text-text-bright transition-colors"
                    title="Discard changes"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Discard</span>
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isDirty && !saving
                      ? 'bg-signal-primary text-white hover:opacity-90'
                      : 'bg-surface-elevated text-text-dim cursor-not-allowed'
                  }`}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save'}</span>
                </button>
              </div>
            </div>

            {/* Editor */}
            {loadingFile ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-signal-primary" />
              </div>
            ) : (
              <div className="flex-1 w-full min-h-[60vh] rounded-xl overflow-hidden border border-[var(--color-border-panel)]">
                <Editor
                  height="60vh"
                  language={detectLanguage(fileNameOnly ?? '')}
                  value={fileContent}
                  onChange={(value) => setFileContent(value ?? '')}
                  theme="vs-dark"
                  options={{
                    fontSize: 12,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    renderLineHighlight: 'line',
                    padding: { top: 8, bottom: 8 },
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
