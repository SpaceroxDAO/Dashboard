import { useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import {
  agentsAtom,
  allMemoryCategoriesAtom,
  allDNACategoriesAtom,
  allCronsAtom,
  allSkillsAtom,
  healthDataAtom,
  allGoalsAtom,
  allTodosAtom,
  allMissionsAtom,
  timelineEventsAtom,
  quickActionsAtom,
  connectionStatusAtom,
  lastUpdatedAtom,
  isRefreshingAtom,
  // New atoms
  peopleTrackerAtom,
  jobPipelineAtom,
  calendarEventsAtom,
  insightsDataAtom,
  socialBatteryAtom,
  habitStreaksAtom,
  cronHealthAtom,
  currentModeAtom,
  ideasAtom,
  tokenStatusAtom,
  billsAtom,
  checkpointAtom,
  kiraCheckpointAtom,
  kiraCronHealthAtom,
  mealPlanAtom,
  frictionPointsAtom,
  // Kira supervision
  finnSupervisionAtom,
  systemMonitoringAtom,
  kiraReflectionsAtom,
  // Kanban conflict guards
  kanbanDirtyAtom,
  kanbanDraggingAtom,
} from '@/store/atoms';
import {
  checkApiHealth,
  getAgentMemory,
  getDNAFiles,
  getDashboardData,
} from '@/services/api';
import {
  mockTimelineEvents,
} from '@/mocks';
import type { Agent, MemoryCategory, DNACategory, HealthData, Skill, Todo, TimelineEvent, CronJob, Goal, Mission, QuickAction } from '@/types';

// Real agent definitions
const agents: Agent[] = [
  {
    id: 'finn',
    name: 'Finn',
    type: 'finn',
    emoji: '\u{1F98A}',
    status: 'online',
    lastActive: new Date(),
    config: {
      url: 'ws://localhost:18789',
      token: '',
      features: ['chat', 'memory', 'crons', 'skills', 'health', 'location'],
    },
    stats: { memoryCount: 0, cronCount: 0, skillCount: 0 },
  },
  {
    id: 'kira',
    name: 'Kira',
    type: 'kira',
    emoji: '\u{1F989}',
    status: 'online',
    lastActive: new Date(),
    config: {
      url: 'wss://discord.bot.api',
      token: '',
      features: ['chat', 'memory', 'crons', 'skills'],
    },
    stats: { memoryCount: 0, cronCount: 0, skillCount: 0 },
  },
];

/**
 * Shared data-loading hook.
 * Fetches real data from the API server (via Tailscale Funnel in prod).
 * Falls back to mock data when the server is unreachable.
 */
export function useDataLoader() {
  const [, setAgents] = useAtom(agentsAtom);
  const [, setAllMemoryCategories] = useAtom(allMemoryCategoriesAtom);
  const [, setAllDNACategories] = useAtom(allDNACategoriesAtom);
  const [, setAllCrons] = useAtom(allCronsAtom);
  const [, setAllSkills] = useAtom(allSkillsAtom);
  const [, setHealthData] = useAtom(healthDataAtom);
  const [, setAllGoals] = useAtom(allGoalsAtom);
  const [, setAllTodos] = useAtom(allTodosAtom);
  const [, setAllMissions] = useAtom(allMissionsAtom);
  const [, setTimelineEvents] = useAtom(timelineEventsAtom);
  const [, setQuickActions] = useAtom(quickActionsAtom);
  const [, setConnectionStatus] = useAtom(connectionStatusAtom);
  const [, setLastUpdated] = useAtom(lastUpdatedAtom);
  const [isRefreshing, setIsRefreshing] = useAtom(isRefreshingAtom);
  // New atoms
  const [, setPeopleTracker] = useAtom(peopleTrackerAtom);
  const [, setJobPipeline] = useAtom(jobPipelineAtom);
  const [, setCalendarEvents] = useAtom(calendarEventsAtom);
  const [, setInsightsData] = useAtom(insightsDataAtom);
  const [, setSocialBattery] = useAtom(socialBatteryAtom);
  const [, setHabitStreaks] = useAtom(habitStreaksAtom);
  const [, setCronHealth] = useAtom(cronHealthAtom);
  const [, setCurrentMode] = useAtom(currentModeAtom);
  const [, setIdeas] = useAtom(ideasAtom);
  const [, setTokenStatus] = useAtom(tokenStatusAtom);
  const [, setBills] = useAtom(billsAtom);
  const [, setCheckpoint] = useAtom(checkpointAtom);
  const [, setKiraCheckpoint] = useAtom(kiraCheckpointAtom);
  const [, setKiraCronHealth] = useAtom(kiraCronHealthAtom);
  const [, setFinnSupervision] = useAtom(finnSupervisionAtom);
  const [, setSystemMonitoring] = useAtom(systemMonitoringAtom);
  const [, setKiraReflections] = useAtom(kiraReflectionsAtom);
  const [, setMealPlan] = useAtom(mealPlanAtom);
  const [, setFrictionPoints] = useAtom(frictionPointsAtom);
  const [kanbanDirty] = useAtom(kanbanDirtyAtom);
  const [kanbanDragging] = useAtom(kanbanDraggingAtom);

  const loadingRef = useRef(false);

  const loadLiveData = useCallback(async (): Promise<boolean> => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    setIsRefreshing(true);

    try {
      const isHealthy = await checkApiHealth();
      setConnectionStatus(isHealthy ? 'connected' : 'disconnected');

      if (!isHealthy) {
        // API offline — seed with mock data
        seedMockData();
        setAgents(agentsWithMockStats());
        setLastUpdated(new Date());
        return false;
      }

      // Fetch BOTH agents' data in parallel
      const [finnData, kiraData, finnMemory, kiraMemory, finnDNA, kiraDNA] = await Promise.all([
        getDashboardData('finn').catch(() => null),
        getDashboardData('kira').catch(() => null),
        getAgentMemory('finn').catch(() => null),
        getAgentMemory('kira').catch(() => null),
        getDNAFiles().catch(() => null),
        getDNAFiles('kira').catch(() => null),
      ]);

      // ── Live health data (fixed: pick record with MOST data) ──
      if (finnData?.health && finnData.health.length > 0) {
        const scored = finnData.health.map(h => ({
          record: h,
          score: (h.sleep.score > 0 ? 1 : 0) + (h.readiness.score > 0 ? 1 : 0) +
                 (h.activity.score > 0 ? 1 : 0) + (h.heartRate.restingHr > 0 ? 1 : 0) +
                 h.sleep.score + h.readiness.score,
        }));
        scored.sort((a, b) => b.score - a.score);
        const latest = scored[0].record;

        const healthData: HealthData = {
          date: latest.date,
          sleep: { score: latest.sleep.score, duration: 0, efficiency: 0, restfulness: 0 },
          readiness: { score: latest.readiness.score, hrv: latest.readiness.hrv, bodyTemperature: 0, recoveryIndex: 0 },
          activity: { score: latest.activity.score, steps: 0, calories: 0, activeMinutes: 0 },
          heartRate: { restingHr: latest.heartRate.restingHr, average: 0, min: 0, max: 0 },
        };
        setHealthData([healthData]);
      }

      // ── Merge skills from both agents ──
      const allSkills: Skill[] = [];
      if (finnData?.skills && finnData.skills.length > 0) {
        allSkills.push(...(finnData.skills as Skill[]));
      }
      if (kiraData?.skills && kiraData.skills.length > 0) {
        allSkills.push(...(kiraData.skills as Skill[]));
      }
      setAllSkills(allSkills);

      // ── Merge tasks/todos from both agents (skip if kanban is mid-mutation) ──
      if (!kanbanDirty && !kanbanDragging) {
        const allTodos: Todo[] = [];
        for (const data of [finnData, kiraData]) {
          if (data?.tasks && data.tasks.length > 0) {
            allTodos.push(...data.tasks.map(t => ({
              id: t.id,
              agentId: t.agentId,
              title: t.title,
              completed: t.completed,
              priority: t.priority,
              category: t.category,
              createdAt: new Date(t.createdAt),
            })));
          }
        }
        setAllTodos(allTodos);
      }

      // ── Live stats from both agents ──
      const updatedAgents = agents.map((agent) => {
        const data = agent.id === 'finn' ? finnData : kiraData;
        if (data?.stats) {
          return {
            ...agent,
            stats: {
              memoryCount: data.stats.memoryCount,
              cronCount: data.stats.cronCount ?? data.stats.scriptCount,
              skillCount: data.stats.skillCount,
            },
          };
        }
        return agent;
      });
      setAgents(updatedAgents);

      // ── Finn-specific data sources ──
      if (finnData) {
        setPeopleTracker(finnData.peopleTracker);
        setJobPipeline(finnData.jobPipeline || []);
        setCalendarEvents(finnData.calendarEvents || []);
        setInsightsData(finnData.insights);
        setSocialBattery(finnData.socialBattery);
        setHabitStreaks(finnData.habitStreaks || []);
        setIdeas(finnData.ideas || []);
        setTokenStatus(finnData.tokenStatus);
        setBills(finnData.bills || []);
        setMealPlan(finnData.mealPlan);
        setFrictionPoints(finnData.frictionPoints || []);
      }

      // ── Kira supervision data ──
      if (kiraData) {
        setFinnSupervision(kiraData.finnSupervision || null);
        setSystemMonitoring(kiraData.systemMonitoring || null);
        setKiraReflections(kiraData.kiraReflections || null);
      }

      // ── Store checkpoint & cron health per agent ──
      setCheckpoint(finnData?.checkpoint || null);
      setKiraCheckpoint(kiraData?.checkpoint || null);
      setCronHealth(finnData?.cronHealth || null);
      setKiraCronHealth(kiraData?.cronHealth || null);
      setCurrentMode(finnData?.currentMode || kiraData?.currentMode || null);

      // ── Build timeline from real calendar events ──
      if (finnData?.calendarEvents && finnData.calendarEvents.length > 0) {
        const now = new Date();
        const upcoming = finnData.calendarEvents
          .filter(e => new Date(e.start) >= now)
          .slice(0, 8)
          .map((e, i): TimelineEvent => ({
            id: `cal-${i}`,
            time: new Date(e.start),
            title: e.subject,
            type: 'event',
            status: 'pending',
          }));
        if (upcoming.length > 0) {
          setTimelineEvents(upcoming);
        } else {
          setTimelineEvents(mockTimelineEvents);
        }
      } else {
        setTimelineEvents(mockTimelineEvents);
      }

      // ── Live crons from both agents ──
      const allCrons: CronJob[] = [];
      if (finnData?.crons && finnData.crons.length > 0) {
        allCrons.push(...finnData.crons.map(c => ({
          id: c.id,
          agentId: c.agentId || 'finn',
          name: c.name,
          description: c.description,
          schedule: { cron: c.schedule.cron, timezone: c.schedule.timezone, humanReadable: c.schedule.humanReadable },
          status: (c.status || 'active') as 'active' | 'paused' | 'running' | 'error',
          taskGroup: c.taskGroup,
          executionHistory: [],
        })));
      }
      if (kiraData?.crons && kiraData.crons.length > 0) {
        allCrons.push(...kiraData.crons.map(c => ({
          id: c.id,
          agentId: c.agentId || 'kira',
          name: c.name,
          description: c.description,
          schedule: { cron: c.schedule.cron, timezone: c.schedule.timezone, humanReadable: c.schedule.humanReadable },
          status: (c.status || 'active') as 'active' | 'paused' | 'running' | 'error',
          taskGroup: c.taskGroup,
          executionHistory: [],
        })));
      }
      setAllCrons(allCrons);

      // ── Live goals ──
      if (finnData?.goals && finnData.goals.length > 0) {
        const liveGoals: Goal[] = finnData.goals.map(g => ({
          id: g.id,
          agentId: g.agentId || 'finn',
          title: g.title,
          description: g.description,
          category: g.category,
          progress: g.progress,
          status: (g.status || 'active') as 'active' | 'completed' | 'paused',
          milestones: g.milestones.map(m => ({
            id: m.id,
            title: m.title,
            completed: m.completed,
          })),
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        setAllGoals(liveGoals);
      }

      // ── Live missions ──
      if (finnData?.missions && finnData.missions.length > 0) {
        const liveMissions: Mission[] = finnData.missions.map(m => ({
          id: m.id,
          agentId: m.agentId || 'finn',
          name: m.name,
          description: m.description,
          status: (m.status || 'active') as Mission['status'],
          progress: m.progress,
          goalId: m.goalId,
          goalTitle: m.goalTitle,
          keyResults: m.keyResults,
          createdAt: new Date(),
        }));
        setAllMissions(liveMissions);
      }

      // ── Live quick actions ──
      if (finnData?.quickActions && finnData.quickActions.length > 0) {
        const liveActions: QuickAction[] = finnData.quickActions.map(a => ({
          id: a.id,
          label: a.label,
          icon: a.icon,
          action: 'run_script',
        }));
        setQuickActions(liveActions);
      }

      // ── Memory categories from both agents ──
      const liveMemory: MemoryCategory[] = [];
      if (finnMemory) {
        for (const c of finnMemory) {
          liveMemory.push({ ...c, agentId: 'finn' } as MemoryCategory);
        }
      }
      if (kiraMemory) {
        for (const c of kiraMemory) {
          liveMemory.push({ ...c, agentId: 'kira' } as MemoryCategory);
        }
      }
      setAllMemoryCategories(liveMemory);

      // ── DNA categories from both agents ──
      const allDNA: DNACategory[] = [];
      if (finnDNA && finnDNA.length > 0) {
        allDNA.push(...buildDNACategoriesFromFiles(finnDNA, 'finn'));
      }
      if (kiraDNA && kiraDNA.length > 0) {
        allDNA.push(...buildDNACategoriesFromFiles(kiraDNA, 'kira'));
      }
      setAllDNACategories(allDNA);

      setLastUpdated(new Date());
      return true;
    } catch {
      setConnectionStatus('disconnected');
      seedMockData();
      setAgents(agentsWithMockStats());
      setLastUpdated(new Date());
      return false;
    } finally {
      loadingRef.current = false;
      setIsRefreshing(false);
    }
  }, [setAgents, setAllMemoryCategories, setAllDNACategories, setAllCrons, setAllSkills, setHealthData, setAllGoals, setAllTodos, setAllMissions, setTimelineEvents, setQuickActions, setConnectionStatus, setLastUpdated, setIsRefreshing, setPeopleTracker, setJobPipeline, setCalendarEvents, setInsightsData, setSocialBattery, setHabitStreaks, setCronHealth, setCurrentMode, setIdeas, setTokenStatus, setBills, setCheckpoint, setKiraCheckpoint, setKiraCronHealth, setMealPlan, setFrictionPoints, setFinnSupervision, setSystemMonitoring, setKiraReflections, kanbanDirty, kanbanDragging]);

  /** Seed atoms with mock data when API is offline */
  function seedMockData() {
    setTimelineEvents(mockTimelineEvents);
  }

  function agentsWithMockStats(): Agent[] {
    return agents.map((agent) => ({
      ...agent,
      stats: {
        ...agent.stats,
        cronCount: 0,
        skillCount: 0,
      },
    }));
  }

  return { loadLiveData, isRefreshing };
}

/**
 * Transform flat DNA file list from the API into categorized DNACategory[]
 */
function buildDNACategoriesFromFiles(files: Array<{ id: string; name: string; path: string; lastModified: Date; size: number }>, agentId: string): DNACategory[] {
  const identityNames = ['IDENTITY.md', 'SOUL.md', 'USER.md'];
  const behaviorNames = ['AGENTS.md', 'TOOLS.md', 'HEARTBEAT.md'];

  const categorize = (name: string): 'identity' | 'user' | 'behavior' | 'system' => {
    if (identityNames.includes(name)) return 'identity';
    if (behaviorNames.includes(name)) return 'behavior';
    return 'system';
  };

  const toDNAFile = (f: typeof files[number]) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    category: categorize(f.name),
    lastModified: new Date(f.lastModified),
  });

  const identity = files.filter(f => identityNames.includes(f.name)).map(toDNAFile);
  const behavior = files.filter(f => behaviorNames.includes(f.name)).map(toDNAFile);
  const categorized = new Set([...identityNames, ...behaviorNames]);
  const system = files.filter(f => !categorized.has(f.name)).map(toDNAFile);

  const categories: DNACategory[] = [];

  if (identity.length > 0) {
    categories.push({
      id: `${agentId}-identity`,
      agentId,
      name: 'Identity',
      description: 'Core identity, personality, and trust hierarchy',
      files: identity,
    });
  }
  if (behavior.length > 0) {
    categories.push({
      id: `${agentId}-behavior`,
      agentId,
      name: 'Behavior',
      description: 'Agent guidelines, tools, and proactive behaviors',
      files: behavior,
    });
  }
  if (system.length > 0) {
    categories.push({
      id: `${agentId}-system`,
      agentId,
      name: 'System',
      description: 'Architecture, security, memory, and network configuration',
      files: system,
    });
  }

  return categories;
}
