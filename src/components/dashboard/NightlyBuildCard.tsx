import { useState, useEffect } from 'react';
import { Wrench, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface BuildLog {
  lastBuild: { date: string; friction: string; solution: string; status: string } | null;
  frictionCount: number;
}

export function NightlyBuildCard() {
  const [data, setData] = useState<BuildLog | null>(null);
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';

  useEffect(() => {
    fetch(`${API_BASE}/api/agents/${agentId}/build-log`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => null);
  }, [agentId]);

  const isOk = data?.lastBuild?.status?.includes('✅') || data?.lastBuild?.status?.toLowerCase().includes('complete');

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Wrench className="w-4 h-4 text-signal-primary" />
        Nightly Build
        {data && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-text-dim">
            {data.frictionCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-signal-caution/20 text-signal-caution font-medium">
                {data.frictionCount} queued
              </span>
            )}
          </span>
        )}
      </h2>

      {!data ? (
        <div className="flex items-center justify-center py-4">
          <Clock className="w-4 h-4 animate-pulse text-text-dim" />
        </div>
      ) : !data.lastBuild ? (
        <p className="text-xs text-text-dim text-center py-3">No builds yet</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {isOk
              ? <CheckCircle className="w-3.5 h-3.5 text-signal-online flex-shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 text-signal-caution flex-shrink-0" />}
            <span className="text-[10px] text-text-dim">{data.lastBuild.date}</span>
          </div>
          {data.lastBuild.friction && (
            <div className="p-2 bg-surface-base/50 rounded-lg">
              <div className="text-[9px] text-text-dim uppercase tracking-wide mb-0.5">Friction addressed</div>
              <p className="text-[11px] text-text-bright leading-snug line-clamp-2">{data.lastBuild.friction}</p>
            </div>
          )}
          {data.lastBuild.solution && (
            <div className="p-2 bg-surface-base/50 rounded-lg">
              <div className="text-[9px] text-text-dim uppercase tracking-wide mb-0.5">Solution</div>
              <p className="text-[11px] text-text-muted leading-snug line-clamp-2">{data.lastBuild.solution}</p>
            </div>
          )}
          {data.frictionCount === 0 && (
            <p className="text-[10px] text-signal-online text-center">Queue clear</p>
          )}
        </div>
      )}
    </div>
  );
}
