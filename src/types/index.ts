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

// Mission Types
export interface Mission {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  output?: string;
  error?: string;
  cronId?: string;
  skillId?: string;
}

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
