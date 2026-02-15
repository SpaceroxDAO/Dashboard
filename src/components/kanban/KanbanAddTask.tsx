import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { KanbanColumnId } from '@/types';

interface KanbanAddTaskProps {
  column: KanbanColumnId;
  onAdd: (title: string, column: KanbanColumnId, priority?: 'high' | 'medium' | 'low') => void;
}

export function KanbanAddTask({ column, onAdd }: KanbanAddTaskProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), column, priority);
    setTitle('');
    setPriority('medium');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setTitle('');
    }
  };

  return (
    <div className="mt-1">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="add-btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-text-dim hover:text-text-muted rounded-md hover:bg-surface-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add task
          </motion.button>
        ) : (
          <motion.form
            key="add-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="space-y-2 p-2 bg-surface-base rounded-lg border border-[var(--color-border-panel)]"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Task title..."
              autoFocus
              className="w-full bg-transparent text-sm text-text-bright placeholder-text-dim outline-none"
            />
            <div className="flex items-center justify-between">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                className="text-xs bg-surface-elevated text-text-muted border border-[var(--color-border-panel)] rounded px-1.5 py-0.5 outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setTitle(''); }}
                  className="p-1 text-text-dim hover:text-text-muted rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="px-2 py-0.5 text-xs bg-signal-primary text-white rounded hover:bg-signal-primary/80 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
