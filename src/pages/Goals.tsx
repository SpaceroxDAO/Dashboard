import { useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import { Plus, ChevronRight, Check, Target, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageContainer } from '@/components/layout';
import { Button, Badge, DetailModal } from '@/components/ui';
import { goalsByCategoryAtom, allGoalsAtom, addToastAtom, activeAgentIdAtom } from '@/store/atoms';
import { toggleMilestone, createGoal } from '@/services/api';
import type { Goal, Milestone } from '@/types';

function MilestoneItem({
  milestone, goalId, onToggle, toggling,
}: {
  milestone: Milestone;
  goalId: string;
  onToggle: (goalId: string, milestoneId: string) => void;
  toggling: string | null;
}) {
  const isToggling = toggling === milestone.id;

  return (
    <button
      onClick={() => onToggle(goalId, milestone.id)}
      disabled={isToggling}
      className="flex items-center gap-3 py-1.5 w-full text-left hover:bg-surface-hover/50 rounded px-1 -mx-1 transition-colors disabled:opacity-50"
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          milestone.completed
            ? 'bg-signal-online border-signal-online'
            : 'border-text-dim hover:border-signal-primary'
        }`}
      >
        {isToggling ? (
          <Loader2 className="w-3 h-3 animate-spin text-white" />
        ) : milestone.completed ? (
          <Check className="w-3 h-3 text-white" />
        ) : null}
      </div>
      <span
        className={`text-sm ${
          milestone.completed ? 'text-text-dim line-through' : 'text-text-bright'
        }`}
      >
        {milestone.title}
      </span>
    </button>
  );
}

function GoalItem({
  goal, onToggleMilestone, togglingMilestone,
}: {
  goal: Goal;
  onToggleMilestone: (goalId: string, milestoneId: string) => void;
  togglingMilestone: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const completedMilestones = goal.milestones.filter((m) => m.completed).length;
  const totalMilestones = goal.milestones.length;

  const statusColors = {
    active: 'text-signal-primary',
    completed: 'text-signal-online',
    paused: 'text-text-dim',
  };

  return (
    <div className="bg-surface-elevated rounded-lg overflow-hidden">
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
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          className="text-text-dim mt-1"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-border-panel)] px-4 py-3 space-y-1">
              {goal.milestones.map((milestone) => (
                <MilestoneItem
                  key={milestone.id}
                  milestone={milestone}
                  goalId={goal.id}
                  onToggle={onToggleMilestone}
                  toggling={togglingMilestone}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function GoalsPage() {
  const [goalsByCategory] = useAtom(goalsByCategoryAtom);
  const [, setAllGoals] = useAtom(allGoalsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [agentId] = useAtom(activeAgentIdAtom);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    Object.keys(goalsByCategory)
  );
  const [togglingMilestone, setTogglingMilestone] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', category: '', description: '' });
  const [creating, setCreating] = useState(false);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleToggleMilestone = useCallback(async (goalId: string, milestoneId: string) => {
    setTogglingMilestone(milestoneId);
    try {
      const result = await toggleMilestone(goalId, milestoneId);
      // Update goals atom with fresh data from server
      setAllGoals(result.goals.map(g => ({
        ...g,
        agentId: agentId || 'finn',
        status: g.status as 'active' | 'completed' | 'paused',
        milestones: g.milestones,
        createdAt: new Date(),
        updatedAt: new Date(),
      })));
    } catch {
      addToast({ message: 'Failed to toggle milestone', type: 'error' });
    } finally {
      setTogglingMilestone(null);
    }
  }, [setAllGoals, addToast, agentId]);

  const handleCreateGoal = useCallback(async () => {
    if (!newGoal.title.trim() || !newGoal.category.trim()) {
      addToast({ message: 'Title and category are required', type: 'error' });
      return;
    }
    setCreating(true);
    try {
      const result = await createGoal(newGoal.title, newGoal.category, newGoal.description);
      setAllGoals(result.goals.map(g => ({
        ...g,
        agentId: agentId || 'finn',
        status: g.status as 'active' | 'completed' | 'paused',
        milestones: g.milestones,
        createdAt: new Date(),
        updatedAt: new Date(),
      })));
      addToast({ message: `Goal "${newGoal.title}" created`, type: 'success' });
      setShowAddGoal(false);
      setNewGoal({ title: '', category: '', description: '' });
      // Expand the new category
      if (!expandedCategories.includes(newGoal.category)) {
        setExpandedCategories(prev => [...prev, newGoal.category]);
      }
    } catch {
      addToast({ message: 'Failed to create goal', type: 'error' });
    } finally {
      setCreating(false);
    }
  }, [newGoal, setAllGoals, addToast, agentId, expandedCategories]);

  const categoryEntries = Object.entries(goalsByCategory);

  // Collect existing categories for the dropdown
  const existingCategories = [...new Set(categoryEntries.map(([cat]) => cat))];

  return (
    <PageContainer
      title="Goals"
      actions={
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddGoal(true)}>
          Add Goal
        </Button>
      }
    >
      {categoryEntries.length > 0 ? (
        <div className="space-y-4">
          {categoryEntries.map(([category, goals]) => (
            <div key={category}>
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

              <AnimatePresence>
                {expandedCategories.includes(category) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {goals.map((goal) => (
                      <GoalItem
                        key={goal.id}
                        goal={goal}
                        onToggleMilestone={handleToggleMilestone}
                        togglingMilestone={togglingMilestone}
                      />
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
          <Button className="mt-4" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddGoal(true)}>
            Create your first goal
          </Button>
        </div>
      )}

      {/* Add Goal Modal */}
      <DetailModal
        isOpen={showAddGoal}
        onClose={() => setShowAddGoal(false)}
        title="New Goal"
        icon={<Target className="w-5 h-5" />}
        size="md"
        footer={
          <div className="flex items-center gap-3 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowAddGoal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateGoal}
              disabled={creating || !newGoal.title.trim() || !newGoal.category.trim()}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Create Goal
            </Button>
          </div>
        }
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Title</label>
            <input
              type="text"
              value={newGoal.title}
              onChange={(e) => setNewGoal(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Launch SaaS product"
              className="w-full bg-surface-base border border-[var(--color-border-panel)] rounded-lg px-4 py-2.5 text-text-bright placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-signal-primary/50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Category</label>
            <input
              type="text"
              value={newGoal.category}
              onChange={(e) => setNewGoal(prev => ({ ...prev, category: e.target.value }))}
              placeholder="e.g., Financial, Career, Health"
              list="goal-categories"
              className="w-full bg-surface-base border border-[var(--color-border-panel)] rounded-lg px-4 py-2.5 text-text-bright placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-signal-primary/50"
            />
            <datalist id="goal-categories">
              {existingCategories.map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Description (optional)</label>
            <textarea
              value={newGoal.description}
              onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What does achieving this goal look like?"
              rows={3}
              className="w-full bg-surface-base border border-[var(--color-border-panel)] rounded-lg px-4 py-2.5 text-text-bright placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-signal-primary/50 resize-none"
            />
          </div>
        </div>
      </DetailModal>
    </PageContainer>
  );
}
