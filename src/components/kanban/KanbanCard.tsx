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

const PROJECT_COLORS: Record<string, string> = {
  'teach-charlie': 'bg-blue-500/20 text-blue-400',
  'job-search': 'bg-emerald-500/20 text-emerald-400',
  'cognigy': 'bg-purple-500/20 text-purple-400',
  'personal': 'bg-gray-500/20 text-gray-400',
};

function getProjectColor(project: string): string {
  if (PROJECT_COLORS[project]) return PROJECT_COLORS[project];
  // Hash-based fallback for unknown projects
  const colors = [
    'bg-pink-500/20 text-pink-400',
    'bg-amber-500/20 text-amber-400',
    'bg-cyan-500/20 text-cyan-400',
    'bg-rose-500/20 text-rose-400',
    'bg-teal-500/20 text-teal-400',
    'bg-indigo-500/20 text-indigo-400',
  ];
  let hash = 0;
  for (let i = 0; i < project.length; i++) hash = ((hash << 5) - hash + project.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

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
        {task.project && (
          <span className={`inline-block text-[10px] leading-none px-1.5 py-0.5 rounded-full mt-1 ${getProjectColor(task.project)}`}>
            {task.project}
          </span>
        )}
        {task.category && (
          <span className="block text-xs text-text-dim mt-0.5 truncate">{task.category}</span>
        )}
      </div>

      {/* Priority dot */}
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${priorityDot[task.priority] || priorityDot.medium}`} />
    </motion.div>
  );
}
