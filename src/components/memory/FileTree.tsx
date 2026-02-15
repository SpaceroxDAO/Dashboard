import { ChevronRight, File, Folder } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MemoryCategory, MemoryFile } from '@/types';

interface FileTreeProps {
  categories: MemoryCategory[];
  selectedId: string | null;
  expandedIds: string[];
  onSelect: (file: MemoryFile) => void;
  onToggle: (categoryId: string) => void;
}

export function FileTree({ categories, selectedId, expandedIds, onSelect, onToggle }: FileTreeProps) {
  return (
    <div className="space-y-1">
      {categories.map((category) => {
        const isExpanded = expandedIds.includes(category.id);

        return (
          <div key={category.id}>
            {/* Category header */}
            <button
              onClick={() => onToggle(category.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left group"
            >
              <motion.span
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-text-dim"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.span>
              <Folder className="w-4 h-4 text-signal-primary" />
              <span className="flex-1 font-medium text-sm text-text-bright uppercase tracking-wide">
                {category.name}
              </span>
              <span className="text-xs text-text-dim">({category.count})</span>
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
