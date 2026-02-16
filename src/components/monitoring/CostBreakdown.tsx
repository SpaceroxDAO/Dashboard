import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Zap, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import { getCosts } from '@/services/api';
import type { CostSummary } from '@/services/api';

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
  const [data, setData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCosts(30)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
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
    .sort(([, a], [, b]) => b.cost - a.cost);

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
    </Card>
  );
}
