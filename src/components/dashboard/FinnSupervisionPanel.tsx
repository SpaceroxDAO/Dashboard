import { useAtom } from 'jotai';
import { Eye, Brain, CheckCircle, XCircle, TrendingUp, AlertTriangle, Gauge } from 'lucide-react';
import { finnSupervisionAtom } from '@/store/atoms';

function MoodGauge({ label, value, max = 10 }: { label: string; value: number | null; max?: number }) {
  if (value === null) return null;
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'bg-signal-online' : pct >= 40 ? 'bg-signal-caution' : 'bg-signal-alert';

  return (
    <div className="flex-1 min-w-[70px]">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-text-muted">{label}</span>
        <span className="text-[10px] font-medium text-text-bright telemetry-value">{value}/{max}</span>
      </div>
      <div className="h-1 bg-surface-active rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FinnSupervisionPanel() {
  const [supervision] = useAtom(finnSupervisionAtom);

  if (!supervision) return null;
  const { mood, workload, qaVerdict, tracking } = supervision;
  if (!mood && !workload && !qaVerdict && !tracking) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Eye className="w-4 h-4 text-signal-primary" />
        Finn Supervision
        {mood?.date && <span className="ml-auto text-[10px] text-text-dim telemetry-value">{mood.date}</span>}
      </h2>

      {mood && (
        <div className="mb-2">
          <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Brain className="w-3 h-3" /> Mood
          </h3>
          <div className="flex flex-wrap gap-2">
            <MoodGauge label="Stress" value={mood.stress} />
            <MoodGauge label="Clarity" value={mood.clarity} />
            <MoodGauge label="Engage" value={mood.engagement} />
            <MoodGauge label="Conf" value={mood.confidence} />
          </div>
          {mood.verdict && (
            <div className="mt-1 text-[11px] text-text-muted">
              <span className="text-text-bright font-medium">Verdict:</span> {mood.verdict}
            </div>
          )}
          {mood.actionRequired && mood.actionRequired !== 'None' && (
            <div className="mt-0.5 text-[11px] text-signal-caution flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> {mood.actionRequired}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {workload && (
          <div className="bg-surface-hover/40 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Gauge className="w-3 h-3 text-signal-secondary" />
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Workload</span>
            </div>
            <div className="text-xs font-medium text-text-bright">{workload.verdict}</div>
            <div className={`text-[10px] mt-0.5 ${
              workload.riskLevel === 'Low' ? 'text-signal-online' : workload.riskLevel === 'Medium' ? 'text-signal-caution' : 'text-signal-alert'
            }`}>
              Risk: {workload.riskLevel}
              {workload.confidence !== null && <span className="text-text-dim ml-1 telemetry-value">({workload.confidence}%)</span>}
            </div>
            {workload.indicators.length > 0 && (
              <div className="mt-1 space-y-px">
                {workload.indicators.map((ind, i) => (
                  <div key={i} className="text-[10px] text-text-dim flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full flex-shrink-0 ${
                      ind.status === 'OK' || ind.status === 'Normal' ? 'bg-signal-online' : ind.status === 'Warning' ? 'bg-signal-caution' : 'bg-signal-alert'
                    }`} />
                    {ind.metric}: {ind.status}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {qaVerdict && (
          <div className="bg-surface-hover/40 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              {qaVerdict.passed ? <CheckCircle className="w-3 h-3 text-signal-online" /> : <XCircle className="w-3 h-3 text-signal-alert" />}
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">QA</span>
            </div>
            <div className={`text-xs font-medium ${qaVerdict.passed ? 'text-signal-online' : 'text-signal-alert'}`}>{qaVerdict.verdict}</div>
            <div className="text-[10px] text-text-dim">{qaVerdict.date}</div>
            {qaVerdict.issues.length > 0 && (
              <div className="mt-1 space-y-px">
                {qaVerdict.issues.map((issue, i) => (
                  <div key={i} className="text-[10px] text-signal-caution">- {issue}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tracking && (
        <div className="mt-2 pt-1.5 border-t border-[var(--border-panel)]">
          <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Tracking
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {tracking.strengths.length > 0 && (
              <div>
                <div className="text-[10px] text-signal-online mb-0.5">Strengths</div>
                {tracking.strengths.map((s, i) => <div key={i} className="text-[10px] text-text-muted truncate">+ {s}</div>)}
              </div>
            )}
            {tracking.opportunities.length > 0 && (
              <div>
                <div className="text-[10px] text-signal-caution mb-0.5">Opportunities</div>
                {tracking.opportunities.map((o, i) => <div key={i} className="text-[10px] text-text-muted truncate">- {o}</div>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
