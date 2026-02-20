import { useState, useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { PageContainer } from '@/components/layout';
import { FileTree, MarkdownViewer, SearchBar } from '@/components/memory';
import { useFileApi } from '@/hooks';
import {
  memoryCategoriesAtom, selectedMemoryIdAtom, memorySearchQueryAtom,
  expandedCategoryIdsAtom, activeAgentIdAtom,
} from '@/store/atoms';
import type { MemoryFile } from '@/types';

export function MemoryPage() {
  const [categories] = useAtom(memoryCategoriesAtom);
  const [selectedId, setSelectedId] = useAtom(selectedMemoryIdAtom);
  const [searchQuery, setSearchQuery] = useAtom(memorySearchQueryAtom);
  const [expandedIds, setExpandedIds] = useAtom(expandedCategoryIdsAtom);
  const [activeAgentId] = useAtom(activeAgentIdAtom);
  const { apiAvailable, readFile } = useFileApi();

  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setSelectedId(null); setSelectedFile(null); setContent(null); setExpandedIds([]); }, [activeAgentId, setSelectedId, setExpandedIds]);

  const handleSelect = useCallback(async (file: MemoryFile) => {
    setSelectedId(file.id); setSelectedFile(file); setLoading(true);
    if (apiAvailable) { const c = await readFile(file.path); if (c) { setContent(c); setLoading(false); return; } }
    setContent(`*Could not load ${file.name} — API offline.*`); setLoading(false);
  }, [setSelectedId, apiAvailable, readFile]);

  const handleContentChange = useCallback((newContent: string) => { setContent(newContent); }, []);
  const handleToggle = useCallback((categoryId: string) => {
    setExpandedIds((prev) => prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]);
  }, [setExpandedIds]);

  const filteredCategories = searchQuery
    ? categories.map((cat) => ({ ...cat, files: cat.files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase())) })).filter((cat) => cat.files.length > 0)
    : categories;

  return (
    <PageContainer title="Memory Browser">
      <div className="min-h-[50vh] lg:h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-3">
        <div className="w-full lg:w-72 flex-shrink-0 bg-surface-elevated rounded-xl panel-glow p-2.5 overflow-hidden flex flex-col max-h-64 lg:max-h-none">
          <div className="mb-2">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search memory files..." />
          </div>
          <div className="flex-1 overflow-auto">
            <FileTree categories={filteredCategories} selectedId={selectedId} expandedIds={expandedIds} onSelect={handleSelect} onToggle={handleToggle} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <MarkdownViewer file={selectedFile} content={content} loading={loading} onContentChange={handleContentChange} />
        </div>
      </div>
    </PageContainer>
  );
}
