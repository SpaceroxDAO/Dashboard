import { useState } from 'react';
import { useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, TrendingDown, Zap, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import { getCosts } from '@/services/api';
import { activeAgentIdAtom } from '@/store/atoms';

function Sparkline({ data, color = 'var(--color-signal-primary)', height = 32 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function CostBreakdown() {
  const [agentId] = useAtom(activeAgentIdAtom);
  const [showLedger, setShowLedger] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['costs', agentId, 30],
    queryFn: () => getCosts(30, agentId),
    refetchInterval: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
      </Card>
    );
  }

  if (!data) return null;

  const dailyEntries = Object.entries(data.dailyCosts).sort(([a], [b]) => a.localeCompare(b));
  const dailyValues = dailyEntries.map(([, v]) => v);
  const models = Object.entries(data.modelBreakdown)
    .filter(([name]) => name !== 'unknown')
    .sort(([, a], [, b]) => b.tokens - a.tokens);

  // Finn: subscription plan — GPT-5.5 via ChatGPT Pro. Show API-equivalent cost.
  const isFinnSubscriptionView = agentId === 'finn';

  // Kira: token-centric view (free tier, totalCost is always 0)
  const isKiraTokenView = agentId === 'kira' && data.totalCost === 0 && data.totalInputTokens > 0;

  if (isFinnSubscriptionView) {
    const totalTokens = data.totalInputTokens + data.totalOutputTokens;
    const totalMessages = data.recentSessions.reduce((s, r) => s + r.messageCount, 0);
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> API Equivalent Cost (30d)
          </h3>
          <Badge variant="info">ChatGPT Pro sub</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <div className="text-xl font-semibold text-text-bright">{formatCost(data.totalCost)}</div>
            <div className="text-xs text-text-dim flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Est. API cost
            </div>
          </div>
          <div>
            <div className="text-xl font-semibold text-text-bright">{formatCost(data.monthlyProjection)}</div>
            <div className="text-xs text-text-dim">Monthly proj.</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-text-bright">{data.recentSessions.length}</div>
            <div className="text-xs text-text-dim">Sessions ({totalMessages} msgs)</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-text-bright">{formatTokens(totalTokens)}</div>
            <div className="text-xs text-text-dim">Tokens est.</div>
          </div>
        </div>

        {dailyValues.length >= 2 && (
          <div className="mb-4">
            <div className="text-xs text-text-dim mb-1">Daily API equivalent spend</div>
            <Sparkline data={dailyValues} height={40} />
            <div className="flex justify-between text-[10px] text-text-dim mt-1">
              <span>{dailyEntries[0]?.[0]?.slice(5)}</span>
              <span>{dailyEntries[dailyEntries.length - 1]?.[0]?.slice(5)}</span>
            </div>
          </div>
        )}

        {models.length > 0 && (
          <div>
            <div className="text-xs text-text-dim mb-2">By model</div>
            <div className="space-y-1.5">
              {models.map(([name, info]) => {
                const pct = data.totalCost > 0 ? (info.cost / data.totalCost) * 100 : 0;
                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-text-bright truncate font-mono">{name}</span>
                        <span className="text-text-dim flex-shrink-0 ml-2">{formatCost(info.cost)}</span>
                      </div>
                      <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          className="h-full bg-signal-primary rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cache efficiency */}
        {(data.totalCacheReadTokens > 0 || data.totalCacheSavings > 0) && (
          <div className="mt-3 p-2 bg-surface-base/50 rounded-lg">
            <div className="text-xs text-text-dim mb-1.5">Cache efficiency</div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-signal-online">{formatCost(data.totalCacheSavings)}</div>
                <div className="text-[10px] text-text-dim">saved</div>
              </div>
              <div>
                <div className="text-sm font-medium text-text-bright">{formatTokens(data.totalCacheReadTokens)}</div>
                <div className="text-[10px] text-text-dim">cache hits</div>
              </div>
              <div>
                {(() => {
                  const total = data.totalInputTokens + data.totalCacheReadTokens;
                  const hitRate = total > 0 ? Math.round((data.totalCacheReadTokens / total) * 100) : 0;
                  return (
                    <>
                      <div className="text-sm font-medium text-text-bright">{hitRate}%</div>
                      <div className="text-[10px] text-text-dim">hit rate</div>
                    </>
                  );
                })()}
              </div>
            </div>
            {(() => {
              const total = data.totalInputTokens + data.totalCacheReadTokens;
              const hitRate = total > 0 ? Math.round((data.totalCacheReadTokens / total) * 100) : 0;
              return hitRate > 0 ? (
                <div className="mt-1.5 h-1 bg-surface-hover rounded-full overflow-hidden">
                  <div className="h-full bg-signal-online rounded-full" style={{ width: `${hitRate}%` }} />
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* Cost ledger */}
        {data.recentSessions.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowLedger(v => !v)}
              className="flex items-center gap-1 text-xs text-text-dim hover:text-text-bright transition-colors w-full"
            >
              {showLedger ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Session ledger ({data.recentSessions.length} sessions)
            </button>
            {showLedger && (
              <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[9px] text-text-dim uppercase tracking-wide pb-1 sticky top-0 bg-surface-elevated">
                  <span>Date</span>
                  <span>Model</span>
                  <span className="text-right">Tokens</span>
                  <span className="text-right">Cost</span>
                </div>
                {data.recentSessions
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((s) => (
                    <div key={s.sessionId} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-0.5">
                      <span className="text-[10px] text-text-dim tabular-nums">{s.date.slice(5)}</span>
                      <span className="text-[10px] text-text-muted font-mono truncate">{s.model.replace('claude-', '').replace('gpt-', '')}</span>
                      <span className="text-[10px] text-text-muted tabular-nums text-right">{formatTokens(s.inputTokens + s.outputTokens)}</span>
                      <span className="text-[10px] text-text-bright tabular-nums text-right">{formatCost(s.totalCost)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {data.recentSessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-text-dim text-sm">
            <Zap className="w-8 h-8 mb-2 opacity-30" />
            <p>No sessions yet</p>
          </div>
        )}
      </Card>
    );
  }

  if (isKiraTokenView) {
    const totalTokens = data.totalInputTokens + data.totalOutputTokens;
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
            <Zap className="w-4 h-4" /> Token Usage (30d)
          </h3>
          <Badge variant="info">Free tier</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <div className="text-xl font-semibold text-text-bright">{formatTokens(data.totalInputTokens)}</div>
            <div className="text-xs text-text-dim">Input tokens</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-text-bright">{formatTokens(data.totalOutputTokens)}</div>
            <div className="text-xs text-text-dim">Output tokens</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-signal-online">{formatTokens(totalTokens)}</div>
            <div className="text-xs text-text-dim">Total tokens</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-text-bright">{data.recentSessions.length}</div>
            <div className="text-xs text-text-dim">Sessions</div>
          </div>
        </div>

        {dailyValues.length >= 2 && (
          <div className="mb-4">
            <div className="text-xs text-text-dim mb-1">Daily tokens</div>
            <Sparkline data={dailyValues} height={40} />
            <div className="flex justify-between text-[10px] text-text-dim mt-1">
              <span>{dailyEntries[0]?.[0]?.slice(5)}</span>
              <span>{dailyEntries[dailyEntries.length - 1]?.[0]?.slice(5)}</span>
            </div>
          </div>
        )}

        {models.length > 0 && (
          <div>
            <div className="text-xs text-text-dim mb-2">By model</div>
            <div className="space-y-1.5">
              {models.map(([name, info]) => {
                const pct = totalTokens > 0 ? (info.tokens / totalTokens) * 100 : 0;
                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-text-bright truncate font-mono">{name}</span>
                        <span className="text-text-dim flex-shrink-0 ml-2">{formatTokens(info.tokens)}</span>
                      </div>
                      <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          className="h-full bg-signal-primary rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cache efficiency */}
        {(data.totalCacheReadTokens > 0 || data.totalCacheSavings > 0) && (
          <div className="mt-3 p-2 bg-surface-base/50 rounded-lg">
            <div className="text-xs text-text-dim mb-1.5">Cache efficiency</div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-signal-online">{formatCost(data.totalCacheSavings)}</div>
                <div className="text-[10px] text-text-dim">saved</div>
              </div>
              <div>
                <div className="text-sm font-medium text-text-bright">{formatTokens(data.totalCacheReadTokens)}</div>
                <div className="text-[10px] text-text-dim">cache hits</div>
              </div>
              <div>
                {(() => {
                  const total = data.totalInputTokens + data.totalCacheReadTokens;
                  const hitRate = total > 0 ? Math.round((data.totalCacheReadTokens / total) * 100) : 0;
                  return (
                    <>
                      <div className="text-sm font-medium text-text-bright">{hitRate}%</div>
                      <div className="text-[10px] text-text-dim">hit rate</div>
                    </>
                  );
                })()}
              </div>
            </div>
            {(() => {
              const total = data.totalInputTokens + data.totalCacheReadTokens;
              const hitRate = total > 0 ? Math.round((data.totalCacheReadTokens / total) * 100) : 0;
              return hitRate > 0 ? (
                <div className="mt-1.5 h-1 bg-surface-hover rounded-full overflow-hidden">
                  <div className="h-full bg-signal-online rounded-full" style={{ width: `${hitRate}%` }} />
                </div>
              ) : null;
            })()}
          </div>
        )}
      </Card>
    );
  }

  // Kira empty state: no data at all
  const isEmpty = data.totalCost === 0 && data.totalInputTokens === 0 && data.recentSessions.length === 0;
  if (isEmpty && agentId === 'kira') {
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
            <Zap className="w-4 h-4" /> Token Usage (30d)
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-text-dim text-sm">
          <Zap className="w-8 h-8 mb-2 opacity-30" />
          <p>No session data found</p>
          <p className="text-xs mt-1">Kira may be offline</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Cost Tracking (30d)
        </h3>
        <Badge variant="info">{formatCost(data.dailyBurnRate)}/day</Badge>
      </div>

      {/* Top-line metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-xl font-semibold text-text-bright">{formatCost(data.totalCost)}</div>
          <div className="text-xs text-text-dim">Total spent</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-signal-online">{formatCost(data.totalCacheSavings)}</div>
          <div className="text-xs text-text-dim flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Cache savings
          </div>
        </div>
        <div>
          <div className="text-xl font-semibold text-text-bright">{formatCost(data.monthlyProjection)}</div>
          <div className="text-xs text-text-dim flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Monthly proj.
          </div>
        </div>
        <div>
          <div className="text-xl font-semibold text-text-bright">{formatTokens(data.totalCacheReadTokens)}</div>
          <div className="text-xs text-text-dim flex items-center gap-1">
            <Zap className="w-3 h-3" /> Cached tokens
          </div>
        </div>
      </div>

      {/* Daily cost sparkline */}
      {dailyValues.length >= 2 && (
        <div className="mb-4">
          <div className="text-xs text-text-dim mb-1">Daily spend</div>
          <Sparkline data={dailyValues} height={40} />
          <div className="flex justify-between text-[10px] text-text-dim mt-1">
            <span>{dailyEntries[0]?.[0]?.slice(5)}</span>
            <span>{dailyEntries[dailyEntries.length - 1]?.[0]?.slice(5)}</span>
          </div>
        </div>
      )}

      {/* Model breakdown */}
      {models.length > 0 && (
        <div>
          <div className="text-xs text-text-dim mb-2">By model</div>
          <div className="space-y-1.5">
            {models.map(([name, info]) => {
              const pct = data.totalCost > 0 ? (info.cost / data.totalCost) * 100 : 0;
              return (
                <div key={name} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-text-bright truncate font-mono">{name.replace('claude-', '')}</span>
                      <span className="text-text-dim flex-shrink-0 ml-2">{formatCost(info.cost)}</span>
                    </div>
                    <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        className="h-full bg-signal-primary rounded-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cache efficiency */}
      {(data.totalCacheReadTokens > 0 || data.totalCacheSavings > 0) && (
        <div className="mt-3 p-2 bg-surface-base/50 rounded-lg">
          <div className="text-xs text-text-dim mb-1.5">Cache efficiency</div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-signal-online">{formatCost(data.totalCacheSavings)}</div>
              <div className="text-[10px] text-text-dim">saved</div>
            </div>
            <div>
              <div className="text-sm font-medium text-text-bright">{formatTokens(data.totalCacheReadTokens)}</div>
              <div className="text-[10px] text-text-dim">cache hits</div>
            </div>
            <div>
              {(() => {
                const total = data.totalInputTokens + data.totalCacheReadTokens;
                const hitRate = total > 0 ? Math.round((data.totalCacheReadTokens / total) * 100) : 0;
                return (
                  <>
                    <div className="text-sm font-medium text-text-bright">{hitRate}%</div>
                    <div className="text-[10px] text-text-dim">hit rate</div>
                  </>
                );
              })()}
            </div>
          </div>
          {(() => {
            const total = data.totalInputTokens + data.totalCacheReadTokens;
            const hitRate = total > 0 ? Math.round((data.totalCacheReadTokens / total) * 100) : 0;
            return hitRate > 0 ? (
              <div className="mt-1.5 h-1 bg-surface-hover rounded-full overflow-hidden">
                <div className="h-full bg-signal-online rounded-full" style={{ width: `${hitRate}%` }} />
              </div>
            ) : null;
          })()}
        </div>
      )}
    </Card>
  );
}
