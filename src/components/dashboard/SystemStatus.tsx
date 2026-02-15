import { useAtom } from 'jotai';
import { Activity, AlertTriangle, Battery, Brain, Cpu, Shield } from 'lucide-react';
import { activeCheckpointAtom, activeCronHealthAtom, tokenStatusAtom, currentModeAtom, socialBatteryAtom } from '@/store/atoms';

export function SystemStatus() {
  const [checkpoint] = useAtom(activeCheckpointAtom);
  const [cronHealth] = useAtom(activeCronHealthAtom);
  const [tokenStatus] = useAtom(tokenStatusAtom);
  const [currentMode] = useAtom(currentModeAtom);
  const [socialBattery] = useAtom(socialBatteryAtom);

  const hasData = checkpoint || cronHealth || tokenStatus || currentMode;
  if (!hasData) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5 text-signal-primary" />
        System Status
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Current Mode */}
        {currentMode && (
          <div className="bg-surface-hover/50 rounded-lg p-3 text-center">
            <Cpu className="w-4 h-4 text-signal-secondary mx-auto mb-1.5" />
            <div className="text-sm font-medium text-text-bright capitalize telemetry-value">
              {currentMode.current_mode}
            </div>
            <div className="text-xs text-text-dim mt-0.5">Mode</div>
          </div>
        )}

        {/* Token Budget */}
        {tokenStatus && (
          <div className="bg-surface-hover/50 rounded-lg p-3 text-center">
            <Activity className="w-4 h-4 text-signal-primary mx-auto mb-1.5" />
            <div className="text-sm font-medium text-text-bright telemetry-value">
              {tokenStatus.dailyRemaining}
            </div>
            <div className="text-xs text-text-dim mt-0.5">Daily Budget</div>
          </div>
        )}

        {/* Cron Health */}
        {cronHealth && (
          <div className={`bg-surface-hover/50 rounded-lg p-3 text-center ${cronHealth.alert ? 'border border-signal-caution/30' : ''}`}>
            {cronHealth.alert ? (
              <AlertTriangle className="w-4 h-4 text-signal-caution mx-auto mb-1.5" />
            ) : (
              <Activity className="w-4 h-4 text-signal-online mx-auto mb-1.5" />
            )}
            <div className="text-sm font-medium text-text-bright telemetry-value">
              {cronHealth.failures}F / {cronHealth.zombies}Z
            </div>
            <div className="text-xs text-text-dim mt-0.5">Cron Issues</div>
          </div>
        )}

        {/* Social Battery */}
        {socialBattery && (
          <div className="bg-surface-hover/50 rounded-lg p-3 text-center">
            <Battery className="w-4 h-4 text-signal-secondary mx-auto mb-1.5" />
            <div className="text-sm font-medium text-text-bright telemetry-value">
              {socialBattery.current_level}/{socialBattery.max_level}
            </div>
            <div className="text-xs text-text-dim mt-0.5">Social Battery</div>
          </div>
        )}

        {/* Checkpoint Status */}
        {checkpoint && (
          <div className="bg-surface-hover/50 rounded-lg p-3 text-center">
            <Brain className="w-4 h-4 text-signal-primary mx-auto mb-1.5" />
            <div className="text-sm font-medium text-text-bright">
              {checkpoint.parsed.systems.length > 0 ? 'Active' : 'Idle'}
            </div>
            <div className="text-xs text-text-dim mt-0.5">Session</div>
          </div>
        )}
      </div>

      {/* Checkpoint activity log */}
      {checkpoint && checkpoint.parsed.todayActivity.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--border-panel)]">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Recent Activity</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {checkpoint.parsed.todayActivity.slice(0, 5).map((activity, i) => (
              <div key={i} className="text-xs text-text-muted truncate">
                {activity}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
