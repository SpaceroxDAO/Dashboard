import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { Agent, MemoryCategory, CronJob, Skill, HealthData, ConnectionStatus, Goal, Todo, Mission, DNACategory, TimelineEvent, QuickAction } from '@/types';

// Persisted atoms (localStorage)
export const activeAgentIdAtom = atomWithStorage<string>('activeAgentId', 'finn');
export const sidebarCollapsedAtom = atomWithStorage<boolean>('sidebarCollapsed', false);
export const themeAtom = atomWithStorage<'dark' | 'light' | 'system'>('theme', 'dark');

// Runtime atoms
export const agentsAtom = atom<Agent[]>([]);
export const activeAgentAtom = atom((get) => {
  const agents = get(agentsAtom);
  const id = get(activeAgentIdAtom);
  return agents.find((a) => a.id === id) ?? null;
});

// Memory atoms
export const allMemoryCategoriesAtom = atom<MemoryCategory[]>([]);
export const memoryCategoriesAtom = atom((get) => {
  const categories = get(allMemoryCategoriesAtom);
  const agentId = get(activeAgentIdAtom);
  return categories.filter((c) => c.agentId === agentId);
});
export const selectedMemoryIdAtom = atom<string | null>(null);
export const memorySearchQueryAtom = atom<string>('');
export const expandedCategoryIdsAtom = atom<string[]>([]);

// Cron atoms
export const allCronsAtom = atom<CronJob[]>([]);
export const cronsAtom = atom((get) => {
  const crons = get(allCronsAtom);
  const agentId = get(activeAgentIdAtom);
  return crons.filter((c) => c.agentId === agentId);
});
export const cronGroupsAtom = atom((get) => {
  const crons = get(cronsAtom);
  const groups: Record<string, CronJob[]> = {};
  crons.forEach((cron) => {
    const group = cron.taskGroup || 'Uncategorized';
    if (!groups[group]) groups[group] = [];
    groups[group].push(cron);
  });
  return groups;
});

// Skill atoms
export const allSkillsAtom = atom<Skill[]>([]);
export const skillsAtom = atom((get) => {
  const skills = get(allSkillsAtom);
  const agentId = get(activeAgentIdAtom);
  return skills.filter((s) => s.agentId === agentId);
});
export const skillsByCategoryAtom = atom((get) => {
  const skills = get(skillsAtom);
  const categories: Record<string, Skill[]> = {};
  skills.forEach((skill) => {
    if (!categories[skill.category]) categories[skill.category] = [];
    categories[skill.category].push(skill);
  });
  return categories;
});

// Health atoms
export const healthDataAtom = atom<HealthData[]>([]);
export const latestHealthAtom = atom((get) => {
  const data = get(healthDataAtom);
  return data[0] ?? null;
});

// UI State
export const connectionStatusAtom = atom<ConnectionStatus>('disconnected');
export const toastsAtom = atom<Toast[]>([]);

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

// Toast helpers
export const addToastAtom = atom(null, (get, set, toast: Omit<Toast, 'id'>) => {
  const id = Math.random().toString(36).slice(2);
  set(toastsAtom, [...get(toastsAtom), { ...toast, id }]);
  setTimeout(() => {
    set(toastsAtom, get(toastsAtom).filter((t) => t.id !== id));
  }, toast.duration ?? 3000);
});

export const removeToastAtom = atom(null, (get, set, id: string) => {
  set(toastsAtom, get(toastsAtom).filter((t) => t.id !== id));
});

// Goals atoms
export const allGoalsAtom = atom<Goal[]>([]);
export const goalsAtom = atom((get) => {
  const goals = get(allGoalsAtom);
  const agentId = get(activeAgentIdAtom);
  return goals.filter((g) => g.agentId === agentId);
});
export const goalsByCategoryAtom = atom((get) => {
  const goals = get(goalsAtom);
  const categories: Record<string, Goal[]> = {};
  goals.forEach((goal) => {
    if (!categories[goal.category]) categories[goal.category] = [];
    categories[goal.category].push(goal);
  });
  return categories;
});

// To-Do atoms
export const allTodosAtom = atom<Todo[]>([]);
export const todosAtom = atom((get) => {
  const todos = get(allTodosAtom);
  const agentId = get(activeAgentIdAtom);
  return todos.filter((t) => t.agentId === agentId);
});
export const activeTodosAtom = atom((get) => {
  return get(todosAtom).filter((t) => !t.completed);
});
export const completedTodosAtom = atom((get) => {
  return get(todosAtom).filter((t) => t.completed);
});

// Mission atoms
export const allMissionsAtom = atom<Mission[]>([]);
export const missionsAtom = atom((get) => {
  const missions = get(allMissionsAtom);
  const agentId = get(activeAgentIdAtom);
  return missions.filter((m) => m.agentId === agentId);
});
export const activeMissionsAtom = atom((get) => {
  return get(missionsAtom).filter((m) => m.status === 'running' || m.status === 'queued');
});
export const missionHistoryAtom = atom((get) => {
  return get(missionsAtom).filter((m) => m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled');
});

// DNA atoms
export const allDNACategoriesAtom = atom<DNACategory[]>([]);
export const dnaCategoriesAtom = atom((get) => {
  const categories = get(allDNACategoriesAtom);
  const agentId = get(activeAgentIdAtom);
  return categories.filter((c) => c.agentId === agentId);
});
export const selectedDNAIdAtom = atom<string | null>(null);

// Timeline & Quick Actions atoms
export const timelineEventsAtom = atom<TimelineEvent[]>([]);
export const quickActionsAtom = atom<QuickAction[]>([]);

// Dashboard state
export const lastUpdatedAtom = atom<Date>(new Date());
export const isRefreshingAtom = atom<boolean>(false);
