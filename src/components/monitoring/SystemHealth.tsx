import { useState, useEffect } from 'react';
import { Cpu, HardDrive, MemoryStick, Activity, Loader2 } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { getSystemHealth } from '@/services/api';
import type { SystemHealthResponse } from '@/services/api';

function Sparkline({ data, color, height = 28, width = 80 }: { data: number[]; color: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)}TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)}MB`;
  return `${(bytes / 1e3).toFixed(0)}KB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getColor(pct: number): string {
  if (pct >= 90) return 'var(--color-signal-alert)';
  if (pct >= 70) return 'var(--color-signal-warning)';
  return 'var(--color-signal-online)';
}

function MetricRow({ icon, label, value, percent, sparkData, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  percent: number;
  sparkData: number[];
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-text-dim flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">{label}</span>
          <span className="text-xs text-text-bright font-mono">{value}</span>
        </div>
        <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <Sparkline data={sparkData} color={color} />
    </div>
  );
}

export function SystemHealth() {
  const [data, setData] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      getSystemHealth()
        .then(setData)
        .catch(() => {});
    };
    load();
    setLoading(false);

    // Refresh every 60 seconds
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <Card className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
      </Card>
    );
  }

  if (!data) return null;

  const { current, history } = data;
  const cpuHistory = history.map(h => h.cpu);
  const memHistory = history.map(h => h.memPercent);
  const diskHistory = history.map(h => h.diskPercent);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <Activity className="w-4 h-4" /> System Health
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="default">up {formatUptime(data.uptime)}</Badge>
          <Badge variant="info">{data.cpuCount} cores</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <MetricRow
          icon={<Cpu className="w-4 h-4" />}
          label="CPU"
          value={`${current.cpu}%`}
          percent={current.cpu}
          sparkData={cpuHistory}
          color={getColor(current.cpu)}
        />
        <MetricRow
          icon={<MemoryStick className="w-4 h-4" />}
          label="RAM"
          value={`${formatBytes(current.memUsed)} / ${formatBytes(current.memTotal)}`}
          percent={current.memPercent}
          sparkData={memHistory}
          color={getColor(current.memPercent)}
        />
        <MetricRow
          icon={<HardDrive className="w-4 h-4" />}
          label="Disk"
          value={`${formatBytes(current.diskUsed)} / ${formatBytes(current.diskTotal)}`}
          percent={current.diskPercent}
          sparkData={diskHistory}
          color={getColor(current.diskPercent)}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-border-panel)] flex items-center justify-between text-[10px] text-text-dim">
        <span>{data.hostname}</span>
        <span>{data.platform}</span>
        <span>Load: {current.loadAvg.map(l => l.toFixed(1)).join(' / ')}</span>
      </div>
    </Card>
  );
}
