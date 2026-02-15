import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Check, Circle } from 'lucide-react';
import { motion } from 'framer-motion';
import type { KanbanTask, TaskStatus } from '@/types';

const priorityDot: Record<string, string> = {
  high: 'bg-signal-alert',
  medium: 'bg-signal-caution',
  low: 'bg-text-dim',
};

interface KanbanCardProps {
  task: KanbanTask;
  onToggle: (taskId: string, newStatus: TaskStatus) => void;
}

export function KanbanCard({ task, onToggle }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleToggle = () => {
    const newStatus: TaskStatus = task.status === 'done' ? 'incomplete' : 'done';
    onToggle(task.id, newStatus);
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group flex items-start gap-2 p-2.5 rounded-lg bg-surface-base border border-[var(--color-border-panel)] hover:border-[var(--color-border-bright)] transition-colors ${
        isDragging ? 'shadow-lg ring-1 ring-signal-primary/30 z-50' : ''
      } ${task.status === 'done' ? 'opacity-60' : ''}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab active:cursor-grabbing text-text-dim opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        tabIndex={-1}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Checkbox */}
      <button
        onClick={handleToggle}
        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.status === 'done'
            ? 'bg-signal-online border-signal-online'
            : 'border-text-dim hover:border-signal-primary'
        }`}
      >
        {task.status === 'done' && <Check className="w-2.5 h-2.5 text-white" />}
        {task.status === 'in-progress' && <Circle className="w-2 h-2 text-signal-caution fill-signal-caution" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm leading-snug ${
            task.status === 'done' ? 'text-text-dim line-through' : 'text-text-bright'
          }`}
        >
          {task.title}
        </span>
        {task.category && (
          <span className="block text-xs text-text-dim mt-0.5 truncate">{task.category}</span>
        )}
      </div>

      {/* Priority dot */}
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${priorityDot[task.priority] || priorityDot.medium}`} />
    </motion.div>
  );
}
