import { useState, useEffect } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui';
import { getRateLimits } from '@/services/api';
import type { RateLimits as RateLimitsData } from '@/services/api';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function RateLimits() {
  const [data, setData] = useState<RateLimitsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      getRateLimits()
        .then(setData)
        .catch(() => {});
    };
    load();
    setLoading(false);
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <Card className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <Shield className="w-4 h-4" /> Rate Limits
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-base rounded-lg p-3">
          <div className="text-xs text-text-dim mb-1">Last hour</div>
          <div className="text-lg font-semibold text-text-bright">{formatTokens(data.rolling1h.tokens)}</div>
          <div className="text-[10px] text-text-dim">{data.rolling1h.requests} requests</div>
        </div>
        <div className="bg-surface-base rounded-lg p-3">
          <div className="text-xs text-text-dim mb-1">Rolling 5h</div>
          <div className="text-lg font-semibold text-text-bright">{formatTokens(data.rolling5h.tokens)}</div>
          <div className="text-[10px] text-text-dim">{data.rolling5h.requests} requests</div>
        </div>
      </div>
    </Card>
  );
}
