import { useAtom } from 'jotai';
import { Monitor, AlertOctagon, Clock, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { systemMonitoringAtom } from '@/store/atoms';

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === 'critical' ? 'bg-signal-alert' :
    severity === 'warning' ? 'bg-signal-caution' :
    'bg-signal-online';
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function StatusIcon({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower.includes('ok') || lower.includes('healthy') || lower.includes('online') || lower.includes('normal') || lower === 'active') {
    return <CheckCircle className="w-3.5 h-3.5 text-signal-online" />;
  }
  if (lower.includes('warn') || lower.includes('degraded') || lower.includes('stale')) {
    return <AlertTriangle className="w-3.5 h-3.5 text-signal-caution" />;
  }
  if (lower.includes('fail') || lower.includes('down') || lower.includes('error') || lower.includes('critical')) {
    return <XCircle className="w-3.5 h-3.5 text-signal-alert" />;
  }
  return <CheckCircle className="w-3.5 h-3.5 text-text-dim" />;
}

export function SystemMonitoringPanel() {
  const [monitoring] = useAtom(systemMonitoringAtom);

  if (!monitoring) return null;

  const { morningCheck, p0Alert, cronReport, syncStatus } = monitoring;
  const hasData = morningCheck || p0Alert || cronReport || syncStatus;
  if (!hasData) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Monitor className="w-5 h-5 text-signal-primary" />
        System Monitoring
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Morning Systems Check */}
        {morningCheck && (
          <div className="bg-surface-hover/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-signal-secondary" />
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Morning Check</span>
              <span className="ml-auto text-xs text-text-dim telemetry-value">{morningCheck.date}</span>
            </div>
            <div className="space-y-1.5">
              {morningCheck.components.map((comp, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <SeverityDot severity={comp.severity} />
                  <span className="text-text-muted flex-1">{comp.name}</span>
                  <span className="text-text-bright">{comp.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sync Status */}
        {syncStatus && (
          <div className="bg-surface-hover/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 text-signal-secondary" />
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Sync Status</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <StatusIcon status={syncStatus.status} />
              <span className="text-sm font-medium text-text-bright">{syncStatus.status}</span>
            </div>
            {syncStatus.kiraOnlyContext.length > 0 && (
              <div className="mb-1.5">
                <div className="text-xs text-signal-primary mb-0.5">Kira-only context:</div>
                {syncStatus.kiraOnlyContext.map((ctx, i) => (
                  <div key={i} className="text-xs text-text-dim truncate pl-2">{ctx}</div>
                ))}
              </div>
            )}
            {syncStatus.finnOnlyContext.length > 0 && (
              <div>
                <div className="text-xs text-signal-caution mb-0.5">Finn-only context:</div>
                {syncStatus.finnOnlyContext.map((ctx, i) => (
                  <div key={i} className="text-xs text-text-dim truncate pl-2">{ctx}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* P0 Alert (full width, stands out) */}
      {p0Alert && (
        <div className={`mt-3 rounded-lg p-3 border ${
          p0Alert.resolved
            ? 'bg-surface-hover/40 border-[var(--border-panel)]'
            : 'bg-signal-alert/5 border-signal-alert/30'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className={`w-4 h-4 ${p0Alert.resolved ? 'text-signal-online' : 'text-signal-alert'}`} />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">P0 Alert</span>
            <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${
              p0Alert.resolved
                ? 'bg-signal-online/20 text-signal-online'
                : 'bg-signal-alert/20 text-signal-alert'
            }`}>
              {p0Alert.resolved ? 'Resolved' : p0Alert.status}
            </span>
          </div>
          <div className="text-sm text-text-bright">{p0Alert.alert}</div>
          <div className="text-xs text-text-dim mt-1">{p0Alert.time}</div>
          {p0Alert.systems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {p0Alert.systems.map((sys, i) => (
                <div key={i} className="flex items-center gap-1 text-xs">
                  <StatusIcon status={sys.status} />
                  <span className="text-text-muted">{sys.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cron Report */}
      {cronReport && (
        <div className="mt-3 bg-surface-hover/40 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-signal-secondary" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Cron Report</span>
            <span className="ml-auto text-xs text-text-dim telemetry-value">{cronReport.period}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>
              <span className="text-text-dim">VM Status: </span>
              <span className="text-text-bright">{cronReport.vmStatus}</span>
            </div>
            <div>
              <span className="text-text-dim">Recovery: </span>
              <span className="text-text-bright telemetry-value">{cronReport.recoveryTime}</span>
            </div>
          </div>
          {cronReport.affectedCrons.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-text-dim">Affected Crons:</div>
              {cronReport.affectedCrons.map((cron, i) => (
                <div key={i} className="flex items-center gap-2 text-xs pl-2">
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
