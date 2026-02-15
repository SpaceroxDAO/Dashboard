import { useAtom } from 'jotai';
import { Eye, Brain, CheckCircle, XCircle, TrendingUp, AlertTriangle, Gauge } from 'lucide-react';
import { finnSupervisionAtom } from '@/store/atoms';

function MoodGauge({ label, value, max = 10 }: { label: string; value: number | null; max?: number }) {
  if (value === null) return null;
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'bg-signal-online' : pct >= 40 ? 'bg-signal-caution' : 'bg-signal-alert';

  return (
    <div className="flex-1 min-w-[80px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-xs font-medium text-text-bright telemetry-value">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FinnSupervisionPanel() {
  const [supervision] = useAtom(finnSupervisionAtom);

  if (!supervision) return null;

  const { mood, workload, qaVerdict, tracking } = supervision;
  const hasAnyData = mood || workload || qaVerdict || tracking;
  if (!hasAnyData) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Eye className="w-5 h-5 text-signal-primary" />
        Finn Supervision
        {mood?.date && (
          <span className="ml-auto text-xs text-text-dim telemetry-value">{mood.date}</span>
        )}
      </h2>

      {/* Mood Gauges */}
      {mood && (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            Mood Assessment
          </h3>
          <div className="flex flex-wrap gap-3">
            <MoodGauge label="Stress" value={mood.stress} />
            <MoodGauge label="Clarity" value={mood.clarity} />
            <MoodGauge label="Engagement" value={mood.engagement} />
            <MoodGauge label="Confidence" value={mood.confidence} />
          </div>
          {mood.verdict && (
            <div className="mt-2 text-xs text-text-muted">
              <span className="text-text-bright font-medium">Verdict:</span> {mood.verdict}
            </div>
          )}
          {mood.actionRequired && mood.actionRequired !== 'None' && (
            <div className="mt-1 text-xs text-signal-caution flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {mood.actionRequired}
            </div>
          )}
        </div>
      )}

      {/* Workload + QA Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Workload */}
        {workload && (
          <div className="bg-surface-hover/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-4 h-4 text-signal-secondary" />
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Workload</span>
            </div>
            <div className="text-sm font-medium text-text-bright">{workload.verdict}</div>
            <div className={`text-xs mt-1 ${
              workload.riskLevel === 'Low' ? 'text-signal-online' :
              workload.riskLevel === 'Medium' ? 'text-signal-caution' :
              'text-signal-alert'
            }`}>
              Risk: {workload.riskLevel}
              {workload.confidence !== null && (
                <span className="text-text-dim ml-2 telemetry-value">({workload.confidence}% conf)</span>
              )}
            </div>
            {workload.indicators.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {workload.indicators.map((ind, i) => (
                  <div key={i} className="text-xs text-text-dim flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      ind.status === 'OK' || ind.status === 'Normal' ? 'bg-signal-online' :
                      ind.status === 'Warning' ? 'bg-signal-caution' : 'bg-signal-alert'
                    }`} />
                    {ind.metric}: {ind.status}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QA Verdict */}
        {qaVerdict && (
          <div className="bg-surface-hover/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {qaVerdict.passed ? (
                <CheckCircle className="w-4 h-4 text-signal-online" />
              ) : (
                <XCircle className="w-4 h-4 text-signal-alert" />
              )}
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">QA Check</span>
            </div>
            <div className={`text-sm font-medium ${qaVerdict.passed ? 'text-signal-online' : 'text-signal-alert'}`}>
              {qaVerdict.verdict}
            </div>
            <div className="text-xs text-text-dim mt-0.5">{qaVerdict.date}</div>
            {qaVerdict.issues.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {qaVerdict.issues.map((issue, i) => (
                  <div key={i} className="text-xs text-signal-caution">- {issue}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tracking: Strengths & Opportunities */}
      {tracking && (
        <div className="mt-4 pt-3 border-t border-[var(--border-panel)]">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Performance Tracking
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tracking.strengths.length > 0 && (
              <div>
                <div className="text-xs text-signal-online mb-1">Strengths</div>
                {tracking.strengths.map((s, i) => (
                  <div key={i} className="text-xs text-text-muted truncate">+ {s}</div>
                ))}
              </div>
            )}
            {tracking.opportunities.length > 0 && (
              <div>
                <div className="text-xs text-signal-caution mb-1">Opportunities</div>
                {tracking.opportunities.map((o, i) => (
                  <div key={i} className="text-xs text-text-muted truncate">- {o}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
