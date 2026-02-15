import { useState, useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { ChevronRight, File, Sparkles, User, Settings, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageContainer } from '@/components/layout';
import { MarkdownViewer } from '@/components/memory';
import { useFileApi } from '@/hooks';
import { dnaCategoriesAtom, selectedDNAIdAtom, activeAgentIdAtom } from '@/store/atoms';
import type { DNAFile, DNACategory } from '@/types';

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  identity: Sparkles,
  user: User,
  behavior: Settings,
  system: Shield,
};

function DNAFileTree({
  categories,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  categories: DNACategory[];
  selectedId: string | null;
  expandedIds: string[];
  onSelect: (file: DNAFile) => void;
  onToggle: (categoryId: string) => void;
}) {
  return (
    <div className="space-y-1">
      {categories.map((category) => {
        const isExpanded = expandedIds.includes(category.id);
        const Icon = categoryIcons[category.id] || File;

        return (
          <div key={category.id}>
            {/* Category header */}
            <button
              onClick={() => onToggle(category.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left group"
            >
              <motion.span
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-text-dim"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.span>
              <Icon className="w-4 h-4 text-signal-primary" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-text-bright">
                  {category.name}
                </span>
                <p className="text-xs text-text-dim truncate">
                  {category.description}
                </p>
              </div>
              <span className="text-xs text-text-dim">({category.files.length})</span>
            </button>

            {/* Files */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="ml-4 pl-4 border-l border-[var(--color-border-panel)] space-y-0.5 py-1">
                    {category.files.map((file) => {
                      const isSelected = file.id === selectedId;

                      return (
                        <button
                          key={file.id}
                          onClick={() => onSelect(file)}
                          className={`
                            w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-left
                            ${isSelected
                              ? 'bg-signal-primary/20 text-signal-primary'
                              : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'
                            }
                          `}
                        >
                          <File className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-signal-primary ml-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function DNAPage() {
  const [categories] = useAtom(dnaCategoriesAtom);
  const [selectedId, setSelectedId] = useAtom(selectedDNAIdAtom);
  const [expandedIds, setExpandedIds] = useState<string[]>(['identity', 'behavior']);
  const [activeAgentId] = useAtom(activeAgentIdAtom);
  const [selectedFile, setSelectedFile] = useState<DNAFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { apiAvailable, readFile } = useFileApi();

  // Clear selection when agent changes
  useEffect(() => {
    setSelectedId(null);
    setSelectedFile(null);
    setContent(null);
    setExpandedIds(['identity', 'behavior']);
  }, [activeAgentId, setSelectedId]);

  const handleSelect = useCallback(async (file: DNAFile) => {
    setSelectedId(file.id);
    setSelectedFile(file);
    setLoading(true);

    if (apiAvailable) {
      const apiContent = await readFile(file.path);
      if (apiContent) {
        setContent(apiContent);
        setLoading(false);
        return;
      }
    }

    setContent(`*Could not load ${file.name} — API server is offline.*`);
    setLoading(false);
  }, [setSelectedId, apiAvailable, readFile]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  const handleToggle = useCallback((categoryId: string) => {
    setExpandedIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  }, []);

  return (
    <PageContainer title="DNA">
      <div className="mb-4 text-text-muted">
        <p>Agent identity, personality, and behavioral configuration</p>
      </div>

      <div className="h-[calc(100vh-12rem)] flex flex-col lg:flex-row gap-4">
        {/* Left panel - File Tree */}
        <div className="w-full lg:w-80 flex-shrink-0 bg-surface-elevated rounded-xl panel-glow p-4 overflow-auto">
          <DNAFileTree
            categories={categories}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onSelect={handleSelect}
            onToggle={handleToggle}
          />
        </div>

        {/* Right panel - Content */}
        <div className="flex-1 min-w-0">
          <MarkdownViewer
            file={selectedFile}
            content={content}
            loading={loading}
            onContentChange={handleContentChange}
          />
        </div>
      </div>
    </PageContainer>
  );
}
