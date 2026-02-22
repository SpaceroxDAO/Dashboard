import { useAtom } from 'jotai';
import { 
  Moon, Activity, Heart, Zap, TrendingUp, TrendingDown,
  AlertTriangle, Clock, Footprints, Brain, Battery
} from 'lucide-react';
import { healthExtendedAtom, healthDataAtom } from '@/store/atoms';

// Mini sparkline component
function Sparkline({ data, color = '#8B5CF6' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const padding = 2;
  
  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Sleep architecture donut
function SleepArchitecture({ deep, rem, light, targets }: { 
  deep: number; rem: number; light: number; 
  targets: { deep: number; rem: number } 
}) {
  const total = deep + rem + light;
  if (total === 0) return null;
  
  const deepPct = (deep / total) * 100;
  const remPct = (rem / total) * 100;
  
  const deepOk = deep >= targets.deep;
  const remOk = rem >= targets.rem;
  
  const gradient = `conic-gradient(
    #6366F1 0% ${deepPct}%,
    #8B5CF6 ${deepPct}% ${deepPct + remPct}%,
    #A78BFA ${deepPct + remPct}% 100%
  )`;
  
  return (
    <div className="flex items-center gap-2">
      <div 
        className="w-12 h-12 rounded-full relative"
        style={{ background: gradient }}
      >
        <div className="absolute inset-1.5 bg-surface-elevated rounded-full flex items-center justify-center">
          <span className="text-[9px] font-bold text-text-bright">{Math.round(total / 60)}h</span>
        </div>
      </div>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className={deepOk ? 'text-signal-success' : 'text-signal-caution'}>
            Deep {Math.round(deep)}m
          </span>
          {!deepOk && <span className="text-text-dim">(need {targets.deep}m)</span>}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className={remOk ? 'text-signal-success' : 'text-signal-caution'}>
            REM {Math.round(rem)}m
          </span>
          {!remOk && <span className="text-text-dim">(need {targets.rem}m)</span>}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-300" />
          <span className="text-text-muted">Light {Math.round(light)}m</span>
        </div>
      </div>
    </div>
  );
}

// Stress/Recovery balance bar
function StressRecoveryBar({ stress, recovery }: { stress: number; recovery: number }) {
  const total = stress + recovery || 1;
  const stressPct = (stress / total) * 100;
  const recoveryPct = (recovery / total) * 100;
  const isBalanced = recovery >= stress;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-text-dim">Stress vs Recovery</span>
        <span className={isBalanced ? 'text-signal-success' : 'text-signal-caution'}>
          {isBalanced ? 'Balanced' : 'High Stress'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-base flex overflow-hidden">
        <div 
          className="bg-signal-danger/70 transition-all"
          style={{ width: `${stressPct}%` }}
        />
        <div 
          className="bg-signal-success/70 transition-all"
          style={{ width: `${recoveryPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-text-dim">
        <span>😓 {Math.round(stress / 60)}h stress</span>
        <span>😌 {Math.round(recovery / 60)}h recovery</span>
      </div>
    </div>
  );
}

// Sleep debt indicator
function SleepDebtIndicator({ debtMinutes }: { debtMinutes: number }) {
  const debtHours = Math.abs(debtMinutes / 60);
  const isDeficit = debtMinutes > 0;
  
  return (
    <div className="bg-surface-base/50 rounded-lg p-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Clock className="w-3 h-3 text-signal-primary" />
        <span className="text-[10px] font-medium text-text-bright">Sleep Debt</span>
      </div>
      <div className={`text-sm font-bold ${isDeficit ? 'text-signal-caution' : 'text-signal-success'}`}>
        {isDeficit ? `-${debtHours.toFixed(1)}h` : `+${debtHours.toFixed(1)}h`}
      </div>
      <div className="text-[9px] text-text-dim">
        {isDeficit ? 'behind this week' : 'ahead this week'}
      </div>
    </div>
  );
}

// Steps progress ring
function StepsProgress({ current, target, weeklyTotal, lastWeekTotal }: { 
  current: number; target: number; weeklyTotal: number; lastWeekTotal: number 
}) {
  const pct = Math.min((current / target) * 100, 100);
  const weekChange = lastWeekTotal > 0 ? ((weeklyTotal - lastWeekTotal) / lastWeekTotal) * 100 : 0;
  const isUp = weekChange >= 0;
  
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90">
          <circle
            cx="24" cy="24" r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-surface-base"
          />
          <circle
            cx="24" cy="24" r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-signal-primary"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Footprints className="w-4 h-4 text-signal-primary" />
        </div>
      </div>
      <div>
        <div className="text-sm font-bold text-text-bright">{current.toLocaleString()}</div>
        <div className="text-[9px] text-text-dim">of {target.toLocaleString()} goal</div>
        <div className={`text-[9px] flex items-center gap-0.5 ${isUp ? 'text-signal-success' : 'text-signal-caution'}`}>
          {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {Math.abs(weekChange).toFixed(0)}% vs last week
        </div>
      </div>
    </div>
  );
}

// HRV trend with rolling average
function HRVTrend({ data }: { data: Array<{ date: string; hrv: number }> }) {
  if (!data || data.length < 2) return null;
  
  const latest = data[data.length - 1];
  const avg = data.reduce((a, b) => a + b.hrv, 0) / data.length;
  const trend = latest.hrv - avg;
  const isLow = trend < -5;
  
  return (
    <div className="bg-surface-base/50 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Heart className="w-3 h-3 text-signal-primary" />
          <span className="text-[10px] font-medium text-text-bright">HRV Trend</span>
        </div>
        <Sparkline data={data.map(d => d.hrv)} color={isLow ? '#F59E0B' : '#8B5CF6'} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-text-bright">{latest.hrv}ms</span>
        <span className={`text-[10px] ${trend >= 0 ? 'text-signal-success' : 'text-signal-caution'}`}>
          {trend >= 0 ? '+' : ''}{trend.toFixed(0)} vs avg
        </span>
      </div>
      {isLow && (
        <div className="text-[9px] text-signal-caution mt-1 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" />
          Below baseline — consider rest day
        </div>
      )}
    </div>
  );
}

// Insights card
function InsightsCard({ insights }: { insights: Array<{ type: string; message: string; severity: string }> }) {
  if (!insights || insights.length === 0) return null;
  
  const severityColors: Record<string, string> = {
    warning: 'border-signal-caution/30 bg-signal-caution/5',
    info: 'border-signal-primary/30 bg-signal-primary/5',
    success: 'border-signal-success/30 bg-signal-success/5',
  };
  
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 mb-1">
        <Brain className="w-3 h-3 text-signal-primary" />
        <span className="text-[10px] font-medium text-text-bright">Insights</span>
      </div>
      {insights.slice(0, 2).map((insight, i) => (
        <div 
          key={i}
          className={`text-[10px] p-1.5 rounded border ${severityColors[insight.severity] || severityColors.info}`}
        >
          {insight.message}
        </div>
      ))}
    </div>
  );
}

// Weekly comparison
function WeeklyComparison({ current, previous }: { 
  current: { sleep: number; readiness: number; activity: number; steps: number };
  previous: { sleep: number; readiness: number; activity: number; steps: number };
}) {
  const metrics = [
    { label: 'Sleep', curr: current.sleep, prev: previous.sleep },
    { label: 'Ready', curr: current.readiness, prev: previous.readiness },
    { label: 'Activity', curr: current.activity, prev: previous.activity },
  ];
  
  return (
    <div className="bg-surface-base/50 rounded-lg p-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Battery className="w-3 h-3 text-signal-primary" />
        <span className="text-[10px] font-medium text-text-bright">Week over Week</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {metrics.map(m => {
          const diff = m.curr - m.prev;
          const isUp = diff >= 0;
          return (
            <div key={m.label} className="text-center">
              <div className="text-[9px] text-text-dim">{m.label}</div>
              <div className="text-xs font-semibold text-text-bright">{m.curr}</div>
              <div className={`text-[9px] ${isUp ? 'text-signal-success' : 'text-signal-caution'}`}>
                {isUp ? '↑' : '↓'}{Math.abs(diff)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HealthWidgetV2() {
  const [healthData] = useAtom(healthDataAtom);
  const [extended] = useAtom(healthExtendedAtom);
  
  const latest = healthData?.[0];
  const hasExtended = extended && (extended.scoreTrends || extended.sleepArchitecture);
  
  if (!latest && !hasExtended) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-signal-primary" />
          Health
        </h2>
        <div className="text-center py-3">
          <p className="text-xs text-text-dim">No health data available</p>
        </div>
      </div>
    );
  }

  // Score trend data with sparklines
  const scoreTrends = extended?.scoreTrends || { sleep: [], readiness: [], activity: [] };
  
  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Activity className="w-4 h-4 text-signal-primary" />
        Health
        {extended?.lastUpdated && (
          <span className="ml-auto text-[10px] text-text-dim">
            {new Date(extended.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </h2>

      {/* Top row: Score cards with sparklines */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {[
          { label: 'Sleep', score: latest?.sleep?.score || extended?.latestScores?.sleep || 0, data: scoreTrends.sleep, icon: Moon },
          { label: 'Ready', score: latest?.readiness?.score || extended?.latestScores?.readiness || 0, data: scoreTrends.readiness, icon: Zap },
          { label: 'Active', score: extended?.latestScores?.activity || 0, data: scoreTrends.activity, icon: Activity },
        ].map(metric => (
          <div key={metric.label} className="bg-surface-base/50 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <metric.icon className="w-3 h-3 text-signal-primary" />
              <Sparkline data={metric.data} />
            </div>
            <div className="text-lg font-bold text-text-bright">{metric.score}</div>
            <div className="text-[9px] text-text-dim">{metric.label}</div>
          </div>
        ))}
      </div>

      {/* Sleep Architecture */}
      {extended?.sleepArchitecture && (
        <div className="bg-surface-base/50 rounded-lg p-2 mb-2">
          <SleepArchitecture 
            deep={extended.sleepArchitecture.deep}
            rem={extended.sleepArchitecture.rem}
            light={extended.sleepArchitecture.light}
            targets={{ deep: 90, rem: 90 }}
          />
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* Sleep Debt */}
        {extended?.sleepDebt !== undefined && (
          <SleepDebtIndicator debtMinutes={extended.sleepDebt} />
        )}
        
        {/* HRV Trend */}
        {extended?.hrvTrend && extended.hrvTrend.length > 0 && (
          <HRVTrend data={extended.hrvTrend} />
        )}
      </div>

      {/* Stress/Recovery Balance */}
      {extended?.stressBalance && (
        <div className="bg-surface-base/50 rounded-lg p-2 mb-2">
          <StressRecoveryBar 
            stress={extended.stressBalance.stressMinutes}
            recovery={extended.stressBalance.recoveryMinutes}
          />
        </div>
      )}

      {/* Steps Progress */}
      {extended?.stepsProgress && (
        <div className="bg-surface-base/50 rounded-lg p-2 mb-2">
          <StepsProgress 
            current={extended.stepsProgress.today}
            target={extended.stepsProgress.target}
            weeklyTotal={extended.stepsProgress.weeklyTotal}
            lastWeekTotal={extended.stepsProgress.lastWeekTotal}
          />
        </div>
      )}

      {/* Weekly Comparison */}
      {extended?.weeklyComparison && (
        <WeeklyComparison 
          current={extended.weeklyComparison.current}
          previous={extended.weeklyComparison.previous}
        />
      )}

      {/* Insights */}
      {extended?.insights && extended.insights.length > 0 && (
        <div className="mt-2">
          <InsightsCard insights={extended.insights} />
        </div>
      )}
    </div>
  );
}
