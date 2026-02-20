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
  milestone: Milestone; goalId: string;
  onToggle: (goalId: string, milestoneId: string) => void; toggling: string | null;
}) {
  const isToggling = toggling === milestone.id;
  return (
    <button
      onClick={() => onToggle(goalId, milestone.id)}
      disabled={isToggling}
      className="flex items-center gap-2 py-1 w-full text-left hover:bg-surface-hover/50 rounded px-1 -mx-1 transition-colors disabled:opacity-50"
    >
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
        milestone.completed ? 'bg-signal-online border-signal-online' : 'border-text-dim hover:border-signal-primary'
      }`}>
        {isToggling ? <Loader2 className="w-2.5 h-2.5 animate-spin text-white" /> : milestone.completed ? <Check className="w-2.5 h-2.5 text-white" /> : null}
      </div>
      <span className={`text-xs ${milestone.completed ? 'text-text-dim line-through' : 'text-text-bright'}`}>{milestone.title}</span>
    </button>
  );
}

function GoalItem({
  goal, onToggleMilestone, togglingMilestone,
}: {
  goal: Goal; onToggleMilestone: (goalId: string, milestoneId: string) => void; togglingMilestone: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const completedMilestones = goal.milestones.filter((m) => m.completed).length;
  const totalMilestones = goal.milestones.length;
  const statusColors = { active: 'text-signal-primary', completed: 'text-signal-online', paused: 'text-text-dim' };

  return (
    <div className="bg-surface-elevated rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 p-2.5 hover:bg-surface-hover transition-colors text-left">
        <div className={`${statusColors[goal.status]}`}><Target className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-xs font-medium text-text-bright">{goal.title}</h3>
            {goal.status === 'completed' && <Badge variant="success">Done</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 max-w-[160px]">
              <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${goal.progress}%` }} className="h-full bg-signal-primary rounded-full" />
              </div>
            </div>
            <span className="text-[10px] text-text-dim telemetry-value">{goal.progress}%</span>
            <span className="text-[10px] text-text-dim">{completedMilestones}/{totalMilestones}</span>
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="text-text-dim">
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-[var(--color-border-panel)] px-2.5 py-2 space-y-0.5">
              {goal.milestones.map((milestone) => (
                <MilestoneItem key={milestone.id} milestone={milestone} goalId={goal.id} onToggle={onToggleMilestone} toggling={togglingMilestone} />
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
  const [expandedCategories, setExpandedCategories] = useState<string[]>(Object.keys(goalsByCategory));
  const [togglingMilestone, setTogglingMilestone] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', category: '', description: '' });
  const [creating, setCreating] = useState(false);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]);
  };

  const handleToggleMilestone = useCallback(async (goalId: string, milestoneId: string) => {
    setTogglingMilestone(milestoneId);
    try {
      const result = await toggleMilestone(goalId, milestoneId);
      setAllGoals(result.goals.map(g => ({ ...g, agentId: agentId || 'finn', status: g.status as 'active' | 'completed' | 'paused', milestones: g.milestones, createdAt: new Date(), updatedAt: new Date() })));
    } catch { addToast({ message: 'Failed to toggle milestone', type: 'error' }); }
    finally { setTogglingMilestone(null); }
  }, [setAllGoals, addToast, agentId]);

  const handleCreateGoal = useCallback(async () => {
    if (!newGoal.title.trim() || !newGoal.category.trim()) { addToast({ message: 'Title and category required', type: 'error' }); return; }
    setCreating(true);
    try {
      const result = await createGoal(newGoal.title, newGoal.category, newGoal.description);
      setAllGoals(result.goals.map(g => ({ ...g, agentId: agentId || 'finn', status: g.status as 'active' | 'completed' | 'paused', milestones: g.milestones, createdAt: new Date(), updatedAt: new Date() })));
      addToast({ message: `Goal "${newGoal.title}" created`, type: 'success' });
      setShowAddGoal(false); setNewGoal({ title: '', category: '', description: '' });
      if (!expandedCategories.includes(newGoal.category)) setExpandedCategories(prev => [...prev, newGoal.category]);
    } catch { addToast({ message: 'Failed to create goal', type: 'error' }); }
    finally { setCreating(false); }
  }, [newGoal, setAllGoals, addToast, agentId, expandedCategories]);

  const categoryEntries = Object.entries(goalsByCategory);
  const existingCategories = [...new Set(categoryEntries.map(([cat]) => cat))];

  return (
    <PageContainer title="Goals" actions={<Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAddGoal(true)}>Add Goal</Button>}>
      {categoryEntries.length > 0 ? (
        <div className="space-y-3">
          {categoryEntries.map(([category, goals]) => (
            <div key={category}>
              <button onClick={() => toggleCategory(category)} className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-text-muted uppercase tracking-wide hover:text-text-bright transition-colors">
                <motion.span animate={{ rotate: expandedCategories.includes(category) ? 90 : 0 }}><ChevronRight className="w-3.5 h-3.5" /></motion.span>
                {category} <span className="text-text-dim">({goals.length})</span>
              </button>
              <AnimatePresence>
                {expandedCategories.includes(category) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden">
                    {goals.map((goal) => <GoalItem key={goal.id} goal={goal} onToggleMilestone={handleToggleMilestone} togglingMilestone={togglingMilestone} />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-text-dim">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No goals set yet</p>
          <Button className="mt-3" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAddGoal(true)}>Create your first goal</Button>
        </div>
      )}

      <DetailModal isOpen={showAddGoal} onClose={() => setShowAddGoal(false)} title="New Goal" icon={<Target className="w-4 h-4" />} size="md"
        footer={
          <div className="flex items-center gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowAddGoal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCreateGoal} disabled={creating || !newGoal.title.trim() || !newGoal.category.trim()}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}Create
            </Button>
          </div>
        }>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Title</label>
            <input type="text" value={newGoal.title} onChange={(e) => setNewGoal(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g., Launch SaaS product"
              className="w-full bg-surface-base border border-[var(--color-border-panel)] rounded-lg px-3 py-2 text-sm text-text-bright placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-signal-primary/50" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
            <input type="text" value={newGoal.category} onChange={(e) => setNewGoal(prev => ({ ...prev, category: e.target.value }))} placeholder="e.g., Financial, Career" list="goal-categories"
              className="w-full bg-surface-base border border-[var(--color-border-panel)] rounded-lg px-3 py-2 text-sm text-text-bright placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-signal-primary/50" />
            <datalist id="goal-categories">{existingCategories.map(cat => <option key={cat} value={cat} />)}</datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Description (optional)</label>
            <textarea value={newGoal.description} onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))} placeholder="What does achieving this look like?" rows={2}
              className="w-full bg-surface-base border border-[var(--color-border-panel)] rounded-lg px-3 py-2 text-sm text-text-bright placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-signal-primary/50 resize-none" />
          </div>
        </div>
      </DetailModal>
    </PageContainer>
  );
}
