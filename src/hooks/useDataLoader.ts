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
  mealPlanAtom,
  frictionPointsAtom,
} from '@/store/atoms';
import {
  checkApiHealth,
  getAgentMemory,
  getDNAFiles,
  getDashboardData,
} from '@/services/api';
import {
  mockCrons,
  mockGoals,
  mockMissions,
  mockTimelineEvents,
  mockQuickActions,
} from '@/mocks';
import type { Agent, MemoryCategory, DNACategory, HealthData, Skill, Todo, TimelineEvent } from '@/types';

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
  const [, setMealPlan] = useAtom(mealPlanAtom);
  const [, setFrictionPoints] = useAtom(frictionPointsAtom);

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

      // Fetch everything from the live API in parallel
      const [dashboardData, finnMemory, kiraMemory, finnDNA, kiraDNA] = await Promise.all([
        getDashboardData().catch(() => null),
        getAgentMemory('finn').catch(() => null),
        getAgentMemory('kira').catch(() => null),
        getDNAFiles().catch(() => null),
        getDNAFiles('kira').catch(() => null),
      ]);

      // ── Live health data (fixed: pick record with MOST data) ──
      if (dashboardData?.health && dashboardData.health.length > 0) {
        const scored = dashboardData.health.map(h => ({
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

      // ── Live skills ──
      if (dashboardData?.skills && dashboardData.skills.length > 0) {
        setAllSkills(dashboardData.skills as Skill[]);
      }

      // ── Live tasks → todos ──
      if (dashboardData?.tasks && dashboardData.tasks.length > 0) {
        const todos: Todo[] = dashboardData.tasks.map(t => ({
          id: t.id,
          agentId: t.agentId,
          title: t.title,
          completed: t.completed,
          priority: t.priority,
          category: t.category,
          createdAt: new Date(t.createdAt),
        }));
        setAllTodos(todos);
      }

      // ── Live stats ──
      const updatedAgents = agents.map((agent) => {
        if (agent.id === 'finn' && dashboardData?.stats) {
          return {
            ...agent,
            stats: {
              memoryCount: dashboardData.stats.memoryCount,
              cronCount: dashboardData.stats.scriptCount,
              skillCount: dashboardData.stats.skillCount,
            },
          };
        }
        return agent;
      });
      setAgents(updatedAgents);

      // ── ALL new data sources from API ──
      if (dashboardData) {
        setPeopleTracker(dashboardData.peopleTracker);
        setJobPipeline(dashboardData.jobPipeline || []);
        setCalendarEvents(dashboardData.calendarEvents || []);
        setInsightsData(dashboardData.insights);
        setSocialBattery(dashboardData.socialBattery);
        setHabitStreaks(dashboardData.habitStreaks || []);
        setCronHealth(dashboardData.cronHealth);
        setCurrentMode(dashboardData.currentMode);
        setIdeas(dashboardData.ideas || []);
        setTokenStatus(dashboardData.tokenStatus);
        setBills(dashboardData.bills || []);
        setCheckpoint(dashboardData.checkpoint);
        setMealPlan(dashboardData.mealPlan);
        setFrictionPoints(dashboardData.frictionPoints || []);
      }

      // ── Build timeline from real calendar events ──
      if (dashboardData?.calendarEvents && dashboardData.calendarEvents.length > 0) {
        const now = new Date();
        const upcoming = dashboardData.calendarEvents
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

      // ── Data without API endpoints yet — use mocks ──
      setAllCrons(mockCrons);
      setAllGoals(mockGoals);
      setAllMissions(mockMissions);
      setQuickActions(mockQuickActions);

      // ── Memory categories ──
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

      // ── DNA categories ──
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
  }, [setAgents, setAllMemoryCategories, setAllDNACategories, setAllCrons, setAllSkills, setHealthData, setAllGoals, setAllTodos, setAllMissions, setTimelineEvents, setQuickActions, setConnectionStatus, setLastUpdated, setIsRefreshing, setPeopleTracker, setJobPipeline, setCalendarEvents, setInsightsData, setSocialBattery, setHabitStreaks, setCronHealth, setCurrentMode, setIdeas, setTokenStatus, setBills, setCheckpoint, setMealPlan, setFrictionPoints]);

  /** Seed all atoms that don't have live API endpoints with mock data */
  function seedMockData() {
    setAllCrons(mockCrons);
    setAllGoals(mockGoals);
    setAllMissions(mockMissions);
    setTimelineEvents(mockTimelineEvents);
    setQuickActions(mockQuickActions);
  }

  function agentsWithMockStats(): Agent[] {
    return agents.map((agent) => {
      const agentCrons = mockCrons.filter((c) => c.agentId === agent.id);
      return {
        ...agent,
        stats: {
          ...agent.stats,
          cronCount: agentCrons.length,
          skillCount: 0,
        },
      };
    });
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
