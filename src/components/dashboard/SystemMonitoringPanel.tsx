import { useAtom } from 'jotai';
import { Monitor, AlertOctagon, Clock, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { systemMonitoringAtom } from '@/store/atoms';

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === 'critical' ? 'bg-signal-alert' : severity === 'warning' ? 'bg-signal-caution' : 'bg-signal-online';
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />;
}

function StatusIcon({ status }: { status: string }) {
  const l = status.toLowerCase();
  if (l.includes('ok') || l.includes('healthy') || l.includes('online') || l.includes('normal') || l === 'active')
    return <CheckCircle className="w-3 h-3 text-signal-online" />;
  if (l.includes('warn') || l.includes('degraded') || l.includes('stale'))
    return <AlertTriangle className="w-3 h-3 text-signal-caution" />;
  if (l.includes('fail') || l.includes('down') || l.includes('error') || l.includes('critical'))
    return <XCircle className="w-3 h-3 text-signal-alert" />;
  return <CheckCircle className="w-3 h-3 text-text-dim" />;
}

export function SystemMonitoringPanel() {
  const [monitoring] = useAtom(systemMonitoringAtom);
  if (!monitoring) return null;
  const { morningCheck, p0Alert, cronReport, syncStatus } = monitoring;
  if (!morningCheck && !p0Alert && !cronReport && !syncStatus) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Monitor className="w-4 h-4 text-signal-primary" />
        System Monitoring
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {morningCheck && (
          <div className="bg-surface-hover/40 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3 h-3 text-signal-secondary" />
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Morning Check</span>
              <span className="ml-auto text-[10px] text-text-dim telemetry-value">{morningCheck.date}</span>
            </div>
            <div className="space-y-px">
              {morningCheck.components.map((comp, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <SeverityDot severity={comp.severity} />
                  <span className="text-text-muted flex-1">{comp.name}</span>
                  <span className="text-text-bright">{comp.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {syncStatus && (
          <div className="bg-surface-hover/40 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <RefreshCw className="w-3 h-3 text-signal-secondary" />
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Sync</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <StatusIcon status={syncStatus.status} />
              <span className="text-xs font-medium text-text-bright">{syncStatus.status}</span>
            </div>
            {syncStatus.kiraOnlyContext.length > 0 && (
              <div className="mb-1">
                <div className="text-[10px] text-signal-primary mb-px">Kira-only:</div>
                {syncStatus.kiraOnlyContext.map((ctx, i) => <div key={i} className="text-[10px] text-text-dim truncate pl-1.5">{ctx}</div>)}
              </div>
            )}
            {syncStatus.finnOnlyContext.length > 0 && (
              <div>
                <div className="text-[10px] text-signal-caution mb-px">Finn-only:</div>
                {syncStatus.finnOnlyContext.map((ctx, i) => <div key={i} className="text-[10px] text-text-dim truncate pl-1.5">{ctx}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {p0Alert && (
        <div className={`mt-2 rounded-lg p-2 border ${
          p0Alert.resolved ? 'bg-surface-hover/40 border-[var(--border-panel)]' : 'bg-signal-alert/5 border-signal-alert/30'
        }`}>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertOctagon className={`w-3 h-3 ${p0Alert.resolved ? 'text-signal-online' : 'text-signal-alert'}`} />
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">P0</span>
            <span className={`ml-auto text-[10px] px-1 py-px rounded ${
              p0Alert.resolved ? 'bg-signal-online/20 text-signal-online' : 'bg-signal-alert/20 text-signal-alert'
            }`}>{p0Alert.resolved ? 'Resolved' : p0Alert.status}</span>
          </div>
          <div className="text-xs text-text-bright">{p0Alert.alert}</div>
          {p0Alert.systems.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p0Alert.systems.map((sys, i) => (
                <div key={i} className="flex items-center gap-0.5 text-[10px]">
                  <StatusIcon status={sys.status} />
                  <span className="text-text-muted">{sys.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cronReport && (
        <div className="mt-2 bg-surface-hover/40 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-signal-secondary" />
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Cron Report</span>
            <span className="ml-auto text-[10px] text-text-dim telemetry-value">{cronReport.period}</span>
          </div>
          <div className="flex gap-3 text-[11px] mb-1">
            <div><span className="text-text-dim">VM: </span><span className="text-text-bright">{cronReport.vmStatus}</span></div>
            <div><span className="text-text-dim">Recovery: </span><span className="text-text-bright telemetry-value">{cronReport.recoveryTime}</span></div>
          </div>
          {cronReport.affectedCrons.length > 0 && (
            <div className="space-y-px">
              {cronReport.affectedCrons.map((cron, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] pl-1">
                  <StatusIcon status={cron.status} />
                  <span className="text-text-muted">{cron.name}</span>
                  <span className="text-text-dim ml-auto">{cron.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
