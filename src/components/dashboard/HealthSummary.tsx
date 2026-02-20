import { Moon, Activity, Heart, Zap } from 'lucide-react';
import type { HealthData } from '@/types';

interface HealthSummaryProps {
  data: HealthData | null;
}

export function HealthSummary({ data }: HealthSummaryProps) {
  if (!data) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2">Health</h2>
        <div className="text-center py-3 text-xs text-text-dim">No health data available</div>
      </div>
    );
  }

  const metrics = [
    {
      icon: Moon,
      label: 'Sleep',
      value: data.sleep.score,
      status: data.sleep.score >= 75 ? 'optimal' : data.sleep.score >= 60 ? 'good' : 'fair',
    },
    {
      icon: Zap,
      label: 'Ready',
      value: data.readiness.score,
      status: data.readiness.score >= 75 ? 'optimal' : data.readiness.score >= 60 ? 'good' : 'fair',
    },
    {
      icon: Activity,
      label: 'HRV',
      value: data.readiness.hrv,
      unit: 'ms',
    },
    {
      icon: Heart,
      label: 'HR',
      value: data.heartRate.restingHr,
      unit: 'bpm',
    },
  ];

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'optimal': return 'text-signal-online';
      case 'good': return 'text-signal-primary';
      case 'fair': return 'text-signal-caution';
      default: return 'text-text-bright';
    }
  };

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2">Health</h2>
      <div className="grid grid-cols-4 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center gap-1.5">
            <metric.icon className="w-3.5 h-3.5 text-signal-primary flex-shrink-0" />
            <div>
              <div className={`text-sm font-bold telemetry-value leading-none ${getStatusColor(metric.status)}`}>
                {metric.value}
                {metric.unit && <span className="text-[10px] text-text-dim ml-0.5">{metric.unit}</span>}
              </div>
              <div className="text-[10px] text-text-muted leading-tight">{metric.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
