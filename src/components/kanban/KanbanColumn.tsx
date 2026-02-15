import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence } from 'framer-motion';
import { Inbox, Play, List, Ban, CheckCircle } from 'lucide-react';
import { KanbanCard } from './KanbanCard';
import { KanbanAddTask } from './KanbanAddTask';
import type { KanbanColumnId, KanbanTask, TaskStatus } from '@/types';

const columnMeta: Record<KanbanColumnId, { label: string; icon: React.ReactNode; accent: string }> = {
  'inbox': { label: 'Inbox', icon: <Inbox className="w-3.5 h-3.5" />, accent: 'text-signal-primary' },
  'in-progress': { label: 'In Progress', icon: <Play className="w-3.5 h-3.5" />, accent: 'text-signal-caution' },
  'backlog': { label: 'Backlog', icon: <List className="w-3.5 h-3.5" />, accent: 'text-text-muted' },
  'blocked': { label: 'Blocked', icon: <Ban className="w-3.5 h-3.5" />, accent: 'text-signal-alert' },
  'done': { label: 'Done', icon: <CheckCircle className="w-3.5 h-3.5" />, accent: 'text-signal-online' },
};

interface KanbanColumnProps {
  id: KanbanColumnId;
  tasks: KanbanTask[];
  onToggle: (taskId: string, newStatus: TaskStatus) => void;
  onAddTask: (title: string, column: KanbanColumnId, priority?: 'high' | 'medium' | 'low') => void;
  maxVisible?: number;
}

export function KanbanColumn({ id, tasks, onToggle, onAddTask, maxVisible }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const meta = columnMeta[id];

  // For done column, only show recent tasks
  const visibleTasks = maxVisible ? tasks.slice(0, maxVisible) : tasks;
  const hiddenCount = maxVisible ? Math.max(0, tasks.length - maxVisible) : 0;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] max-w-[300px] flex-1 rounded-xl bg-surface-elevated p-3 transition-colors ${
        isOver ? 'ring-1 ring-signal-primary/40 bg-surface-hover' : ''
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={meta.accent}>{meta.icon}</span>
        <h3 className="text-sm font-medium text-text-bright">{meta.label}</h3>
        <span className="ml-auto text-xs text-text-dim bg-surface-hover rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-1.5 min-h-[40px]">
          <AnimatePresence mode="popLayout">
            {visibleTasks.map((task) => (
              <KanbanCard key={task.id} task={task} onToggle={onToggle} />
            ))}
          </AnimatePresence>
          {hiddenCount > 0 && (
            <div className="text-xs text-text-dim text-center py-1">
              +{hiddenCount} more
            </div>
          )}
          {tasks.length === 0 && (
            <div className="text-xs text-text-dim text-center py-4 opacity-50">
              No tasks
            </div>
          )}
        </div>
      </SortableContext>

      {/* Add task (not for done column) */}
      {id !== 'done' && (
        <KanbanAddTask column={id} onAdd={onAddTask} />
      )}
    </div>
  );
}
