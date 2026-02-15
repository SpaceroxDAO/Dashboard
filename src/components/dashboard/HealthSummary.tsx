import { Moon, Activity, Heart, Zap } from 'lucide-react';
import type { HealthData } from '@/types';

interface HealthSummaryProps {
  data: HealthData | null;
}

export function HealthSummary({ data }: HealthSummaryProps) {
  if (!data) {
    return (
      <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
        <h2 className="text-lg font-semibold text-text-bright mb-4">Health</h2>
        <div className="text-center py-4 text-text-dim">No health data available</div>
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
      case 'optimal':
        return 'text-signal-online';
      case 'good':
        return 'text-signal-primary';
      case 'fair':
        return 'text-signal-caution';
      default:
        return 'text-text-bright';
    }
  };

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4">Health</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg mb-2 bg-signal-primary/10 text-signal-primary">
              <metric.icon className="w-5 h-5" />
            </div>
            <div className={`text-base sm:text-lg font-bold telemetry-value ${getStatusColor(metric.status)}`}>
              {metric.value}
              {metric.unit && <span className="text-xs text-text-dim ml-0.5">{metric.unit}</span>}
            </div>
            <div className="text-xs text-text-muted">{metric.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
