// Agent Types
export interface Agent {
  id: string;
  name: string;
  type: 'finn' | 'kira';
  emoji: string;
  status: 'online' | 'offline' | 'error';
  lastActive: Date;
  config: AgentConfig;
  stats: AgentStats;
}

export interface AgentConfig {
  url: string;
  token: string;
  features: AgentFeature[];
}

export type AgentFeature = 'chat' | 'memory' | 'crons' | 'skills' | 'health' | 'location';

export interface AgentStats {
  memoryCount: number;
  cronCount: number;
  skillCount: number;
  unreadEmails?: number;
}

// Memory Types
export interface MemoryFile {
  id: string;
  path: string;
  name: string;
  type: MemoryType;
  content?: string;
  size: number;
  lastModified: Date;
  metadata?: Record<string, unknown>;
}

export type MemoryType = 'long-term' | 'daily-note' | 'reference' | 'state' | 'health' | 'location';

export interface MemoryCategory {
  id: string;
  agentId: string;
  name: string;
  type: MemoryType;
  files: MemoryFile[];
  count: number;
  expanded?: boolean;
}

// Cron Job Types
export interface CronJob {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  schedule: CronSchedule;
  status: CronStatus;
  lastRun?: Date;
  nextRun?: Date;
  taskGroup?: string;
  executionHistory: CronExecution[];
}

export type CronStatus = 'active' | 'paused' | 'running' | 'error';

export interface CronSchedule {
  cron: string;
  timezone: string;
  humanReadable: string;
}

export interface CronExecution {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'success' | 'failed' | 'timeout';
  output?: string;
  error?: string;
}

// Skill Types
export interface Skill {
  id: string;
  agentId: string;
  name: string;
  description: string;
  icon?: string;
  category: 'core' | 'integration' | 'custom';
  enabled: boolean;
  config?: Record<string, unknown>;
  commands?: string[];
  usageStats?: {
    totalUses: number;
    lastUsed?: Date;
    todayUses: number;
  };
}

// Health Types (Oura)
export interface HealthData {
  date: string;
  sleep: {
    score: number;
    duration: number;
    efficiency: number;
    restfulness: number;
  };
  readiness: {
    score: number;
    hrv: number;
    bodyTemperature: number;
    recoveryIndex: number;
  };
  activity: {
    score: number;
    steps: number;
    calories: number;
    activeMinutes: number;
  };
  heartRate: {
    average: number;
    min: number;
    max: number;
    restingHr: number;
  };
}

// Location Types
export interface LocationData {
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'findmy' | 'manual' | 'inferred';
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    formatted: string;
  };
  context?: 'home' | 'work' | 'other';
}

// UI Types
export interface TimelineEvent {
  id: string;
  time: Date;
  title: string;
  description?: string;
  type: 'cron' | 'event' | 'reminder';
  status: 'pending' | 'running' | 'completed' | 'failed';
  cronId?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  action: string;
  cronId?: string;
}

// Connection Types
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// Goal Types
export interface Goal {
  id: string;
  agentId: string;
  title: string;
  description?: string;
  category: string;
  progress: number; // 0-100
  status: 'active' | 'completed' | 'paused';
  milestones: Milestone[];
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
}

// To-Do Types
export interface Todo {
  id: string;
  agentId: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  category?: string;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
}

// Mission Types (hierarchical: Goals → Missions → Tasks)
export interface Mission {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'paused' | 'queued' | 'running' | 'failed' | 'cancelled';
  progress?: number;
  goalId?: string;
  goalTitle?: string;
  keyResults?: Array<{ id: string; title: string; completed: boolean }>;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  output?: string;
  error?: string;
  cronId?: string;
  skillId?: string;
}

// People Tracker Types
export interface TrackedPerson {
  name: string;
  relationship: string;
  location: string;
  contact_method: string;
  cadence_days: number;
  last_contact: string | null;
  notes: string;
}

export interface PeopleTracker {
  version: number;
  description: string;
  settings: { default_cadence_days: number; nudge_hour_eastern: number };
  people: TrackedPerson[];
}

// Job Pipeline Types
export interface JobOpportunity {
  id: string;
  company: string;
  role: string;
  stage: string;
  priority: 'high' | 'medium' | 'low';
  comp: string;
  source: string;
  created_at: string;
  last_activity: string;
  next_action: string;
  next_action_date: string;
  notes: string;
  prep_doc?: string;
  contacts: string[];
}

// Calendar Events Types
export interface CalendarEvent {
  subject: string;
  start: string;
  end: string;
}

// Insights Types
export interface Insight {
  id: string;
  title: string;
  category: string;
  what: string;
  relevance_score: number;
  source_id: number;
  created_at: string;
}

export interface InsightsData {
  generated_at: string;
  observation_count: number;
  insights: Insight[];
}

// Social Battery Types
export interface SocialBattery {
  current_level: number;
  max_level: number;
  personality_type: string;
  drain_rate: Record<string, number>;
  recharge_rate: Record<string, number>;
  last_updated: string | null;
  conference_mode: boolean;
  today_events: unknown[];
}

// Habits/Streaks Types
export interface HabitStreak {
  name: string;
  last_date: string;
  streak: number;
}

// Cron Health Types
export interface CronHealth {
  alert: boolean;
  failures: number;
  zombies: number;
  stalled: number;
  never_run: number;
  message: string;
}

// Current Mode Types
export interface CurrentMode {
  current_mode: string;
  set_at: string;
  auto_detected: boolean;
  mode_history: Array<{ mode: string; ended_at: string }>;
  stats: Record<string, number>;
}

// Ideas Types
export interface Idea {
  id: string;
  idea: string;
  category: string;
  tags: string[];
  created: string;
  updated: string;
  heat: number;
  views: number;
  notes: unknown[];
  connections: unknown[];
}

// Token Status Types
export interface TokenStatus {
  lastUpdated: string;
  dailyRemaining: string;
  weeklyRemaining: string;
  contextWindow: string;
  model: string;
  session: string;
  compactions: number;
}

// Bills Types
export interface Bill {
  provider: string;
  date: string;
  amount: string;
  dueDate: string;
  emailDate: string;
  subject: string;
}

// Checkpoint Types
export interface CheckpointData {
  content: string;
  lastModified: string;
  parsed: {
    sessionState: string[];
    todayActivity: string[];
    pendingTasks: string[];
    systems: string[];
    tokenStatus: string[];
  };
}

// Meal Plan Types
export interface MealPlan {
  title: string;
  weekRange: string;
  content: string;
}

// Friction Points Types
export interface FrictionPoint {
  name: string;
  priority: 'P1' | 'P2';
  status: string;
  issue: string;
}

// Kira Supervision Types
export interface FinnSupervision {
  mood: {
    date: string;
    stress: number | null;
    clarity: number | null;
    engagement: number | null;
    confidence: number | null;
    verdict: string;
    actionRequired: string;
  } | null;
  workload: {
    date: string;
    verdict: string;
    riskLevel: string;
    confidence: number | null;
    indicators: Array<{ metric: string; status: string }>;
  } | null;
  cronHealth: string | null;
  qaVerdict: {
    date: string;
    verdict: string;
    passed: boolean;
    issues: string[];
  } | null;
  tracking: {
    lastCheckIn: string;
    strengths: string[];
    opportunities: string[];
  } | null;
}

export interface SystemMonitoring {
  morningCheck: {
    date: string;
    components: Array<{ name: string; status: string; severity: string }>;
  } | null;
  p0Alert: {
    time: string;
    alert: string;
    status: string;
    systems: Array<{ name: string; status: string }>;
    resolved: boolean;
  } | null;
  cronReport: {
    generated: string;
    period: string;
    vmStatus: string;
    recoveryTime: string;
    affectedCrons: Array<{ name: string; status: string }>;
  } | null;
  syncStatus: {
    time: string;
    status: string;
    kiraOnlyContext: string[];
    finnOnlyContext: string[];
  } | null;
  healthLog: string | null;
}

export interface KiraReflections {
  dailyReflection: {
    date: string;
    learnings: string[];
    tomorrowsFocus: string[];
    summary: string;
  } | null;
  dreams: string | null;
}

// Kanban Types
export type KanbanColumnId = 'inbox' | 'in-progress' | 'backlog' | 'blocked' | 'done';
export type TaskStatus = 'incomplete' | 'in-progress' | 'done';

export interface KanbanTask {
  id: string;
  agentId: string;
  title: string;
  status: TaskStatus;
  priority: 'high' | 'medium' | 'low';
  category?: string;
  column: KanbanColumnId;
  description?: string;
}

export type KanbanColumns = Record<KanbanColumnId, KanbanTask[]>;

// DNA Types
export interface DNAFile {
  id: string;
  name: string;
  path: string;
  category: 'identity' | 'user' | 'behavior' | 'system';
  content?: string;
  lastModified: Date;
}

export interface DNACategory {
  id: string;
  agentId: string;
  name: string;
  description: string;
  files: DNAFile[];
}
