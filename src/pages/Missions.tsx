import { useState } from 'react';
import { useAtom } from 'jotai';
import { RefreshCw, Play, Loader2, CheckCircle, XCircle, Clock, ChevronDown, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageContainer } from '@/components/layout';
import { Button, Badge } from '@/components/ui';
import { activeMissionsAtom, missionHistoryAtom } from '@/store/atoms';
import type { Mission } from '@/types';

function MissionItem({ mission }: { mission: Mission }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig: Record<string, { icon: typeof Clock; color: string; badge: 'default' | 'info' | 'success' | 'error' | 'warning'; label: string; animate?: boolean }> = {
    queued: { icon: Clock, color: 'text-text-dim', badge: 'default', label: 'Queued' },
    running: { icon: Loader2, color: 'text-signal-primary', badge: 'info', label: 'Running', animate: true },
    completed: { icon: CheckCircle, color: 'text-signal-online', badge: 'success', label: 'Completed' },
    failed: { icon: XCircle, color: 'text-signal-alert', badge: 'error', label: 'Failed' },
    cancelled: { icon: AlertCircle, color: 'text-signal-caution', badge: 'warning', label: 'Cancelled' },
  };

  const config = statusConfig[mission.status];
  const StatusIcon = config.icon;

  const formatTime = (date?: Date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return '';
    const endTime = end || new Date();
    const diff = endTime.getTime() - start.getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const hasDetails = mission.output || mission.error;

  return (
    <div className="bg-surface-elevated rounded-lg overflow-hidden panel-glow">
      <div
        className={`flex items-start gap-3 p-4 ${hasDetails ? 'cursor-pointer hover:bg-surface-hover' : ''} transition-colors`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Status icon */}
        <div className={`mt-0.5 ${config.color}`}>
          <StatusIcon className={`w-5 h-5 ${config.animate ? 'animate-spin' : ''}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-text-bright">{mission.name}</h3>
            <Badge variant={config.badge}>{config.label}</Badge>
          </div>
          {mission.description && (
            <p className="text-sm text-text-muted mt-0.5">{mission.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-text-dim">
            {mission.startedAt && (
              <span>Started: {formatTime(mission.startedAt)}</span>
            )}
            {mission.status === 'running' && mission.progress !== undefined && (
              <span>{mission.progress}%</span>
            )}
            {(mission.status === 'completed' || mission.status === 'failed') && mission.startedAt && (
              <span>Duration: {formatDuration(mission.startedAt, mission.completedAt)}</span>
            )}
          </div>

          {/* Progress bar for running missions */}
          {mission.status === 'running' && mission.progress !== undefined && (
            <div className="mt-2">
              <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${mission.progress}%` }}
                  className="h-full bg-signal-primary rounded-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Expand indicator */}
        {hasDetails && (
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            className="text-text-dim"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        )}
      </div>

      {/* Output/Error details */}
      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-border-panel)] p-4">
              {mission.output && (
                <div className="bg-surface-base rounded-lg p-3">
                  <pre className="text-sm text-text-muted whitespace-pre-wrap font-mono">
                    {mission.output}
                  </pre>
                </div>
              )}
              {mission.error && (
                <div className="bg-signal-alert/10 border border-signal-alert/20 rounded-lg p-3">
                  <pre className="text-sm text-signal-alert whitespace-pre-wrap font-mono">
                    {mission.error}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MissionsPage() {
  const [activeMissions] = useAtom(activeMissionsAtom);
  const [missionHistory] = useAtom(missionHistoryAtom);
  const [showHistory, setShowHistory] = useState(true);

  const runningCount = activeMissions.filter((m) => m.status === 'running').length;
  const queuedCount = activeMissions.filter((m) => m.status === 'queued').length;

  return (
    <PageContainer
      title="Mission Queue"
      actions={
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Active Missions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4 text-signal-primary" />
            <h2 className="font-medium text-text-bright">
              Active
            </h2>
            {runningCount > 0 && (
              <Badge variant="info">{runningCount} running</Badge>
            )}
            {queuedCount > 0 && (
              <Badge variant="default">{queuedCount} queued</Badge>
            )}
          </div>

          {activeMissions.length > 0 ? (
            <div className="space-y-2">
              {activeMissions.map((mission) => (
                <MissionItem key={mission.id} mission={mission} />
              ))}
            </div>
          ) : (
            <div className="bg-surface-elevated rounded-lg p-8 text-center text-text-dim panel-glow">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No active missions</p>
            </div>
          )}
        </div>

        {/* Mission History */}
        {missionHistory.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 mb-3 text-sm font-medium text-text-muted hover:text-text-bright transition-colors"
            >
              <motion.div animate={{ rotate: showHistory ? 0 : -90 }}>
                <ChevronDown className="w-4 h-4" />
              </motion.div>
              <span>History ({missionHistory.length})</span>
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  {missionHistory.map((mission) => (
                    <MissionItem key={mission.id} mission={mission} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
