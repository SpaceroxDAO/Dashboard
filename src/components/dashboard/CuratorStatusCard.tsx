import { useState, useEffect } from 'react';
import { Scissors, Clock } from 'lucide-react';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface SkillEntry {
  name: string;
  activity: number;
  use: number;
  lastActivity: string;
}

interface CuratorData {
  enabled: boolean;
  runs: number;
  lastRun: string;
  lastSummary: string;
  interval: string;
  skills: {
    total: number;
    active: number;
    stale: number;
    archived: number;
  };
  mostActive: SkillEntry[];
  leastActive: SkillEntry[];
}

export function CuratorStatusCard() {
  const [data, setData] = useState<CuratorData | null>(null);
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';

  useEffect(() => {
    if (agentId !== 'finn') return;
    fetch(`${API_BASE}/api/agents/${agentId}/curator`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => null);
  }, [agentId]);

  if (agentId !== 'finn') return null;

  const topSkill = data?.mostActive?.[0] ?? null;
  const summaryExcerpt = data?.lastSummary
    ? data.lastSummary.slice(0, 80) + (data.lastSummary.length > 80 ? '…' : '')
    : null;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Scissors className="w-4 h-4 text-signal-primary" />
        Curator
        {data && (
          <span className="ml-auto flex items-center gap-1.5">
            {data.enabled ? (
              <span className="flex items-center gap-1 text-[10px] text-signal-online">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-online" />
                enabled
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-text-dim">
                <span className="w-1.5 h-1.5 rounded-full bg-text-dim" />
                paused
              </span>
            )}
          </span>
        )}
      </h2>

      {!data ? (
        <div className="flex items-center justify-center py-4">
          <Clock className="w-4 h-4 animate-pulse text-text-dim" />
        </div>
      ) : (
        <div className="space-y-2">
          {/* Skill counts */}
          <div className="flex gap-1.5">
            <span className="px-1.5 py-0.5 rounded-full bg-signal-online/20 text-signal-online text-[10px] font-medium">
              {data.skills.active} active
            </span>
            {data.skills.stale > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-signal-caution/20 text-signal-caution text-[10px] font-medium">
                {data.skills.stale} stale
              </span>
            )}
            {data.skills.archived > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-surface-active/60 text-text-dim text-[10px] font-medium">
                {data.skills.archived} archived
              </span>
            )}
          </div>

          {/* Last run + interval */}
          <div className="text-[10px] text-text-dim">
            {data.lastRun} · {data.interval}
          </div>

          {/* Summary excerpt */}
          {summaryExcerpt && (
            <div className="p-2 bg-surface-base/50 rounded-lg">
              <p className="text-[11px] text-text-muted leading-snug">{summaryExcerpt}</p>
            </div>
          )}

          {/* Top skill */}
          {topSkill && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="text-[9px] text-text-dim uppercase tracking-wide shrink-0">Top skill</div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[11px] text-text-bright truncate">{topSkill.name}</span>
                <span className="text-[10px] text-signal-secondary shrink-0">{topSkill.activity} events</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
