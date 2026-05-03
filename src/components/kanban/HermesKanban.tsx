import { useState, useEffect } from 'react';
import { Layers, Zap, Clock, Play, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface KanbanTask {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  priority: number;
  created_at: number;
  completed_at: number | null;
  run_count: number;
  spawn_failures: number;
  last_spawn_error: string | null;
}

interface KanbanData {
  tasks: KanbanTask[];
  stats: Record<string, number>;
}

const COLUMNS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}> = [
  { id: 'triage',  label: 'Triage',  icon: Layers,        color: 'text-text-dim',         bg: 'bg-surface-base' },
  { id: 'todo',    label: 'Todo',    icon: Clock,         color: 'text-blue-400',         bg: 'bg-blue-400/10' },
  { id: 'ready',   label: 'Ready',   icon: Zap,           color: 'text-cyan-400',         bg: 'bg-cyan-400/10' },
  { id: 'running', label: 'Running', icon: Play,          color: 'text-amber-400',        bg: 'bg-amber-400/10' },
  { id: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'text-signal-danger',    bg: 'bg-signal-danger/10' },
  { id: 'done',    label: 'Done',    icon: CheckCircle,   color: 'text-signal-online',    bg: 'bg-signal-online/10' },
];

function formatAge(epochSecs: number): string {
  const ms = Date.now() - epochSecs * 1000;
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function TaskCard({ task }: { task: KanbanTask }) {
  const hasError = !!task.last_spawn_error;
  return (
    <div className={`p-2 rounded-lg border text-[11px] space-y-0.5 ${hasError ? 'border-signal-danger/30 bg-signal-danger/5' : 'border-[var(--color-border-panel)] bg-surface-base'}`}>
      <p className="text-text-bright font-medium leading-snug line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-2 text-text-dim">
        {task.assignee && <span className="text-signal-primary">{task.assignee}</span>}
        <span>{formatAge(task.created_at)}</span>
        {task.run_count > 0 && <span>{task.run_count} run{task.run_count !== 1 ? 's' : ''}</span>}
        {task.spawn_failures > 0 && <span className="text-signal-danger">{task.spawn_failures} fail{task.spawn_failures !== 1 ? 's' : ''}</span>}
      </div>
      {hasError && (
        <p className="text-signal-danger leading-snug line-clamp-1">{task.last_spawn_error}</p>
      )}
    </div>
  );
}

export function HermesKanban() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';

  useEffect(() => {
    if (agentId !== 'finn') { setLoading(false); return; }
    fetch(`${API_BASE}/api/agents/${agentId}/kanban`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [agentId]);

  if (agentId !== 'finn' || loading) return null;

  const isEmpty = !data || data.tasks.length === 0;
  const activeCount = data ? (data.stats.running || 0) + (data.stats.ready || 0) : 0;

  return (
    <div className="bg-surface-elevated rounded-xl border border-[var(--color-border-panel)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-signal-primary" />
          <span className="text-sm font-semibold text-text-bright">Hermes Tasks</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/20 text-amber-400">
              {activeCount} active
            </span>
          )}
          {isEmpty && (
            <span className="text-[10px] text-text-dim">— no tasks yet</span>
          )}
        </div>
        {collapsed
          ? <ChevronDown className="w-3.5 h-3.5 text-text-dim" />
          : <ChevronUp className="w-3.5 h-3.5 text-text-dim" />
        }
      </button>

      {!collapsed && (
        <div className="px-3 pb-3">
          {isEmpty ? (
            /* Empty state — explain the system */
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
              {COLUMNS.map(col => {
                const Icon = col.icon;
                return (
                  <div key={col.id} className={`rounded-lg p-2 text-center ${col.bg} border border-[var(--color-border-panel)]`}>
                    <Icon className={`w-4 h-4 mx-auto mb-1 ${col.color}`} />
                    <p className={`text-[10px] font-semibold ${col.color}`}>{col.label}</p>
                    <p className="text-[9px] text-text-dim mt-0.5">0</p>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Task columns */
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
              {COLUMNS.map(col => {
                const Icon = col.icon;
                const colTasks = data!.tasks.filter(t => t.status === col.id);
                const count = data!.stats[col.id] || 0;
                return (
                  <div key={col.id} className="space-y-1.5">
                    <div className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg ${col.bg}`}>
                      <Icon className={`w-3 h-3 ${col.color}`} />
                      <span className={`text-[10px] font-semibold ${col.color}`}>{col.label}</span>
                      {count > 0 && (
                        <span className={`ml-auto text-[10px] font-bold ${col.color}`}>{count}</span>
                      )}
                    </div>
                    {colTasks.slice(0, 5).map(t => <TaskCard key={t.id} task={t} />)}
                    {count > 5 && (
                      <p className="text-[10px] text-text-dim text-center">+{count - 5} more</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
