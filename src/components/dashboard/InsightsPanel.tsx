import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface ToolEntry {
  name: string;
  calls: number;
  errors: number;
  lastUsed: string;
}

interface InsightsData {
  period: string;
  overview: {
    sessions: number;
    messages: number;
    toolCalls: number;
    userMessages: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    activeTime: string;
    avgSession: string;
    avgMsgsPerSession: number;
  };
  models: Array<{ name: string; sessions: number; tokens: number }>;
  platforms: Array<{ name: string; sessions: number; messages: number; tokens: number }>;
  topTools: ToolEntry[];
  activityByDay: Record<string, number>;
  peakHours: string[];
  activeDays: number;
  bestStreak: number;
  notableSessions: {
    longest: { duration: string; date: string; id: string };
    mostMessages: { count: number; date: string; id: string };
    mostTokens: { count: number; date: string; id: string };
    mostToolCalls: { count: number; date: string; id: string };
  };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function InsightsPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';

  useEffect(() => {
    if (agentId !== 'finn') return;
    setLoading(true);
    setError(false);
    fetch(`${API_BASE}/api/agents/${agentId}/insights?days=30`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (agentId !== 'finn') return null;

  const ov = data?.overview;
  const totalSessions = data?.platforms.reduce((s, p) => s + p.sessions, 0) ?? 1;

  // Mini bar chart max
  const dayValues = DAY_ORDER.map(d => data?.activityByDay?.[d] ?? 0);
  const maxDay = Math.max(...dayValues, 1);

  // Top 5 tools
  const topTools = data?.topTools?.slice(0, 5) ?? [];

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-1.5 text-left"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-text-bright flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-signal-primary text-base leading-none">&#8718;</span>
          Insights
          {ov && (
            <span className="text-[10px] text-text-dim font-normal truncate">
              {ov.sessions.toLocaleString()} sessions · {ov.toolCalls.toLocaleString()} tool calls · {fmt(ov.totalTokens)} tokens
            </span>
          )}
          {!data && !loading && (
            <span className="text-[10px] text-text-dim font-normal">30-day activity</span>
          )}
        </h2>
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-text-dim animate-spin shrink-0" />
        ) : open ? (
          <ChevronUp className="w-3.5 h-3.5 text-text-dim shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-dim shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="mt-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
            </div>
          )}

          {error && !loading && (
            <p className="text-xs text-text-dim text-center py-4">No insights yet</p>
          )}

          {data && !loading && (
            <>
              {/* Period */}
              <div className="text-[10px] text-text-dim">{data.period}</div>

              {/* Platform breakdown */}
              <div>
                <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Platforms</div>
                <div className="space-y-1.5">
                  {data.platforms.map(p => {
                    const pct = Math.round((p.sessions / totalSessions) * 100);
                    return (
                      <div key={p.name}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-text-bright capitalize">{p.name}</span>
                          <span className="text-[10px] text-text-dim">{p.sessions} sessions · {pct}%</span>
                        </div>
                        <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-signal-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Activity by day */}
              <div>
                <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Activity by day</div>
                <div className="flex items-end gap-1 h-10">
                  {DAY_ORDER.map((day, i) => {
                    const val = dayValues[i];
                    const heightPct = (val / maxDay) * 100;
                    return (
                      <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex items-end justify-center" style={{ height: '28px' }}>
                          <div
                            className="w-full rounded-sm bg-signal-primary/60 transition-all"
                            style={{ height: `${Math.max(heightPct, val > 0 ? 8 : 0)}%` }}
                            title={`${day}: ${val}`}
                          />
                        </div>
                        <span className="text-[9px] text-text-dim">{day.slice(0, 1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top tools */}
              {topTools.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Top tools</div>
                  <div className="space-y-0.5">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[9px] text-text-dim uppercase tracking-wide pb-1">
                      <span>Tool</span>
                      <span className="text-right">Calls</span>
                      <span className="text-right">Errors</span>
                    </div>
                    {topTools.map(t => (
                      <div key={t.name} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
                        <span className="text-[11px] text-text-bright truncate">{t.name}</span>
                        <span className="text-[11px] text-text-muted text-right tabular-nums">{t.calls.toLocaleString()}</span>
                        <span className={`text-[11px] text-right tabular-nums ${t.errors > 0 ? 'text-signal-caution' : 'text-text-dim'}`}>
                          {t.errors}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Peak hours */}
              {data.peakHours?.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider shrink-0">Peak hours</span>
                  <span className="text-[11px] text-text-muted">{data.peakHours.join(', ')}</span>
                </div>
              )}

              {/* Notable sessions */}
              <div>
                <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Notable sessions</div>
                <div className="space-y-1">
                  {[
                    { label: 'Longest', value: data.notableSessions.longest.duration, date: data.notableSessions.longest.date },
                    { label: 'Most messages', value: `${data.notableSessions.mostMessages.count}`, date: data.notableSessions.mostMessages.date },
                    { label: 'Most tokens', value: fmt(data.notableSessions.mostTokens.count), date: data.notableSessions.mostTokens.date },
                    { label: 'Most tool calls', value: `${data.notableSessions.mostToolCalls.count}`, date: data.notableSessions.mostToolCalls.date },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[11px] text-text-muted">{row.label}</span>
                      <span className="text-[11px] text-text-bright">
                        {row.value}
                        <span className="text-text-dim ml-1">{row.date}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
