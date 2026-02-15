import { useState } from 'react';
import { useAtom } from 'jotai';
import { Plus, ChevronRight, Check, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageContainer } from '@/components/layout';
import { Button, Badge } from '@/components/ui';
import { goalsByCategoryAtom } from '@/store/atoms';
import type { Goal, Milestone } from '@/types';

function GoalItem({ goal }: { goal: Goal }) {
  const [expanded, setExpanded] = useState(false);

  const completedMilestones = goal.milestones.filter((m) => m.completed).length;
  const totalMilestones = goal.milestones.length;

  const statusColors = {
    active: 'text-signal-primary',
    completed: 'text-signal-online',
    paused: 'text-text-dim',
  };

  const formatDate = (date?: Date) => {
    if (!date) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-surface-elevated rounded-lg overflow-hidden">
      {/* Goal Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 hover:bg-surface-hover transition-colors text-left"
      >
        <div className={`mt-0.5 ${statusColors[goal.status]}`}>
          <Target className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-text-bright">{goal.title}</h3>
            {goal.status === 'completed' && (
              <Badge variant="success">Completed</Badge>
            )}
          </div>
          {goal.description && (
            <p className="text-sm text-text-muted mt-0.5 line-clamp-1">{goal.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2">
            {/* Progress bar */}
            <div className="flex-1 max-w-[200px]">
              <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${goal.progress}%` }}
                  className="h-full bg-signal-primary rounded-full"
                />
              </div>
            </div>
            <span className="text-xs text-text-dim">{goal.progress}%</span>
            <span className="text-xs text-text-dim">
              {completedMilestones}/{totalMilestones} milestones
            </span>
            {goal.dueDate && (
              <span className="text-xs text-text-dim">
                Due: {formatDate(goal.dueDate)}
              </span>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          className="text-text-dim mt-1"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.div>
      </button>

      {/* Milestones */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-border-panel)] px-4 py-3 space-y-2">
              {goal.milestones.map((milestone) => (
                <MilestoneItem key={milestone.id} milestone={milestone} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MilestoneItem({ milestone }: { milestone: Milestone }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          milestone.completed
            ? 'bg-signal-online border-signal-online'
            : 'border-text-dim'
        }`}
      >
        {milestone.completed && <Check className="w-3 h-3 text-white" />}
      </div>
      <span
        className={`text-sm ${
          milestone.completed ? 'text-text-dim line-through' : 'text-text-bright'
        }`}
      >
        {milestone.title}
      </span>
    </div>
  );
}

export function GoalsPage() {
  const [goalsByCategory] = useAtom(goalsByCategoryAtom);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    Object.keys(goalsByCategory)
  );

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const categoryEntries = Object.entries(goalsByCategory);

  return (
    <PageContainer
      title="Goals"
      actions={
        <Button icon={<Plus className="w-4 h-4" />}>Add Goal</Button>
      }
    >
      {categoryEntries.length > 0 ? (
        <div className="space-y-4">
          {categoryEntries.map(([category, goals]) => (
            <div key={category}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="flex items-center gap-2 mb-2 text-sm font-medium text-text-muted uppercase tracking-wide hover:text-text-bright transition-colors"
              >
                <motion.span
                  animate={{ rotate: expandedCategories.includes(category) ? 90 : 0 }}
                >
                  <ChevronRight className="w-4 h-4" />
                </motion.span>
                {category}
                <span className="text-text-dim">({goals.length})</span>
              </button>

              {/* Goals */}
              <AnimatePresence>
                {expandedCategories.includes(category) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {goals.map((goal) => (
                      <GoalItem key={goal.id} goal={goal} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-text-dim">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No goals set yet</p>
          <Button className="mt-4" icon={<Plus className="w-4 h-4" />}>
            Create your first goal
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
