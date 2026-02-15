import { useState } from 'react';
import { useAtom } from 'jotai';
import { Plus, Check, Circle, Flag, Calendar, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';
import { todosAtom, allTodosAtom, activeTodosAtom, completedTodosAtom, addToastAtom } from '@/store/atoms';
import type { Todo } from '@/types';

function TodoItem({ todo, onToggle }: { todo: Todo; onToggle: (id: string) => void }) {
  const priorityColors = {
    high: 'text-signal-alert',
    medium: 'text-signal-caution',
    low: 'text-text-dim',
  };

  const formatDate = (date?: Date) => {
    if (!date) return null;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = todo.dueDate && !todo.completed && todo.dueDate < new Date();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={`flex items-start gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors ${
        todo.completed ? 'opacity-60' : ''
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          todo.completed
            ? 'bg-signal-online border-signal-online'
            : 'border-text-dim hover:border-signal-primary'
        }`}
      >
        {todo.completed && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-medium ${
              todo.completed ? 'text-text-dim line-through' : 'text-text-bright'
            }`}
          >
            {todo.title}
          </span>
          {todo.priority === 'high' && !todo.completed && (
            <Flag className={`w-3.5 h-3.5 ${priorityColors.high}`} />
          )}
        </div>
        {todo.description && (
          <p className="text-sm text-text-muted mt-0.5 line-clamp-1">
            {todo.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1">
          {todo.category && (
            <span className="text-xs text-text-dim">{todo.category}</span>
          )}
          {todo.dueDate && (
            <span
              className={`text-xs flex items-center gap-1 ${
                isOverdue ? 'text-signal-alert' : 'text-text-dim'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {formatDate(todo.dueDate)}
            </span>
          )}
        </div>
      </div>

      {/* Priority indicator */}
      <div className={`w-1 h-8 rounded-full ${
        todo.priority === 'high' ? 'bg-signal-alert' :
        todo.priority === 'medium' ? 'bg-signal-caution' : 'bg-surface-hover'
      }`} />
    </motion.div>
  );
}

export function TodosPage() {
  const [todos] = useAtom(todosAtom);
  const [, setAllTodos] = useAtom(allTodosAtom);
  const [activeTodos] = useAtom(activeTodosAtom);
  const [completedTodos] = useAtom(completedTodosAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [showCompleted, setShowCompleted] = useState(false);

  const handleToggle = (id: string) => {
    setAllTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date() : undefined }
          : t
      )
    );
    const todo = todos.find((t) => t.id === id);
    if (todo && !todo.completed) {
      addToast({ message: `Completed: ${todo.title}`, type: 'success' });
    }
  };

  // Sort by priority (high first) then by due date
  const sortedActiveTodos = [...activeTodos].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    if (a.dueDate && b.dueDate) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    }
    return a.dueDate ? -1 : 1;
  });

  return (
    <PageContainer
      title="To-Do List"
      actions={
        <Button icon={<Plus className="w-4 h-4" />}>Add Task</Button>
      }
    >
      <div className="space-y-6">
        {/* Active todos */}
        <div className="bg-surface-elevated rounded-xl p-4 panel-glow">
          <div className="flex items-center gap-2 mb-3">
            <Circle className="w-4 h-4 text-signal-primary" />
            <h2 className="font-medium text-text-bright">
              Active ({activeTodos.length})
            </h2>
          </div>

          {sortedActiveTodos.length > 0 ? (
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {sortedActiveTodos.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-8 text-text-dim">
              <Check className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>All caught up!</p>
            </div>
          )}
        </div>

        {/* Completed todos */}
        {completedTodos.length > 0 && (
          <div className="bg-surface-elevated rounded-xl overflow-hidden panel-glow">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full flex items-center gap-2 p-4 hover:bg-surface-hover transition-colors"
            >
              <Check className="w-4 h-4 text-signal-online" />
              <span className="font-medium text-text-bright">
                Completed ({completedTodos.length})
              </span>
              <motion.div
                animate={{ rotate: showCompleted ? 180 : 0 }}
                className="ml-auto text-text-dim"
              >
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-[var(--color-border-panel)] px-4 pb-4 space-y-1">
                    {completedTodos.map((todo) => (
                      <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
