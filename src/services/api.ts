/**
 * API service for connecting to the local file server
 *
 * When running locally with the API server (npm run dev:full),
 * this connects to the real file system at /Users/lume/clawd/
 *
 * When running standalone or on Vercel, falls back to mock data.
 */

const API_BASE = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://lumes-virtual-machine.tailf846b2.ts.net/dashboard-api'
    : 'http://localhost:3001'
);

export interface FileInfo {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  lastModified: Date;
}

export interface FileContent extends FileInfo {
  content: string;
}

export interface MemoryCategory {
  id: string;
  name: string;
  type: string;
  count: number;
  files: FileInfo[];
}

// Check if API is available
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Get memory files for an agent
export async function getAgentMemory(agentId: string): Promise<MemoryCategory[]> {
  const response = await fetch(`${API_BASE}/api/agents/${agentId}/memory`);
  if (!response.ok) {
    throw new Error('Failed to fetch agent memory');
  }
  const data = await response.json();
  return data.files;
}

// Get file content
export async function getFileContent(filePath: string): Promise<FileContent> {
  const response = await fetch(`${API_BASE}/api/files/${filePath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch file content');
  }
  return response.json();
}

// Update file content
export async function updateFileContent(filePath: string, content: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/api/files/${filePath}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error('Failed to update file');
  }
  return response.json();
}

// Get DNA files (optionally per-agent)
export async function getDNAFiles(agentId?: string): Promise<FileInfo[]> {
  const url = agentId ? `${API_BASE}/api/dna?agent=${agentId}` : `${API_BASE}/api/dna`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch DNA files');
  }
  const data = await response.json();
  return data.files;
}

// Get agent stats (computed from real files)
export interface AgentStatsResponse {
  memoryCount: number;
  cronCount: number;
  skillCount: number;
}

export async function getAgentStats(agentId: string): Promise<AgentStatsResponse> {
  const response = await fetch(`${API_BASE}/api/agents/${agentId}/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch agent stats');
  }
  return response.json();
}

// Get all dashboard data in a single request
import type {
  PeopleTracker, JobOpportunity, CalendarEvent, InsightsData,
  SocialBattery, HabitStreak, CronHealth, CurrentMode, Idea,
  TokenStatus, Bill, MealPlan, FrictionPoint, CheckpointData,
  FinnSupervision, SystemMonitoring, KiraReflections,
} from '@/types';

export interface DashboardDataResponse {
  health: Array<{
    date: string;
    sleep: { score: number };
    readiness: { score: number; hrv: number };
    activity: { score: number };
    heartRate: { restingHr: number };
  }>;
  skills: Array<{
    id: string;
    agentId: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    enabled: boolean;
    commands: string[];
  }>;
  tasks: Array<{
    id: string;
    agentId: string;
    title: string;
    completed: boolean;
    priority: 'high' | 'medium' | 'low';
    category: string;
    createdAt: string;
  }>;
  checkpoint: CheckpointData | null;
  stats: {
    memoryCount: number;
    skillCount: number;
    scriptCount: number;
  };
  // All data sources
  peopleTracker: PeopleTracker | null;
  jobPipeline: JobOpportunity[];
  calendarEvents: CalendarEvent[];
  insights: InsightsData | null;
  socialBattery: SocialBattery | null;
  habitStreaks: HabitStreak[];
  cronHealth: CronHealth | null;
  currentMode: CurrentMode | null;
  ideas: Idea[];
  tokenStatus: TokenStatus | null;
  bills: Bill[];
  mealPlan: MealPlan | null;
  frictionPoints: FrictionPoint[];
  // Kira-specific
  finnSupervision?: FinnSupervision;
  systemMonitoring?: SystemMonitoring;
  kiraReflections?: KiraReflections;
}

export async function getDashboardData(agentId?: string): Promise<DashboardDataResponse> {
  const url = agentId === 'kira'
    ? `${API_BASE}/api/dashboard/kira`
    : `${API_BASE}/api/dashboard`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard data');
  }
  return response.json();
}

// ─── Kanban Task Mutations ───

import type { KanbanColumnId, TaskStatus as KanbanTaskStatus } from '@/types';

export async function moveTask(
  taskId: string,
  agentId: string,
  targetColumn: KanbanColumnId,
  targetIndex?: number,
): Promise<{ success: boolean; fileHash: string }> {
  const response = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, targetColumn, targetIndex }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to move task');
  }
  return response.json();
}

export async function toggleTaskStatus(
  taskId: string,
  agentId: string,
  status: KanbanTaskStatus,
): Promise<{ success: boolean; fileHash: string }> {
  const response = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, status }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to toggle task status');
  }
  return response.json();
}

export async function createTask(
  agentId: string,
  title: string,
  column: KanbanColumnId,
  priority?: 'high' | 'medium' | 'low',
): Promise<{ success: boolean; fileHash: string }> {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, title, column, priority }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create task');
  }
  return response.json();
}
