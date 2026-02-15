import { useState } from 'react';
import { Play, Pause, Edit, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button, Badge } from '@/components/ui';
import type { CronJob } from '@/types';

interface CronItemProps {
  cron: CronJob;
  onRun?: (cronId: string) => Promise<void>;
  onToggle?: (cronId: string, enabled: boolean) => Promise<void>;
  onEdit?: (cron: CronJob) => void;
}

export function CronItem({ cron, onRun, onToggle, onEdit }: CronItemProps) {
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleRun = async () => {
    if (!onRun) return;
    setLoading(true);
    try {
      await onRun(cron.id);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!onToggle) return;
    setToggling(true);
    try {
      await onToggle(cron.id, cron.status === 'paused');
    } finally {
      setToggling(false);
    }
  };

  const statusConfig = {
    active: { icon: CheckCircle, color: 'text-signal-online', badge: 'success' as const },
    paused: { icon: Pause, color: 'text-text-dim', badge: 'default' as const },
    running: { icon: Loader2, color: 'text-signal-primary', badge: 'info' as const },
    error: { icon: XCircle, color: 'text-signal-alert', badge: 'error' as const },
  };

  const config = statusConfig[cron.status];
  const StatusIcon = config.icon;

  const formatNextRun = (date?: Date) => {
    if (!date) return 'Not scheduled';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === date.toDateString();

    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (isToday) return `Today @ ${time}`;
    if (isTomorrow) return `Tomorrow @ ${time}`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` @ ${time}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-elevated panel-glow rounded-xl p-3 sm:p-4 hover:bg-surface-hover transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          {/* Status icon */}
          <div className={`mt-0.5 ${config.color} flex-shrink-0`}>
            <StatusIcon className={`w-5 h-5 ${cron.status === 'running' ? 'animate-spin' : ''}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm sm:text-base text-text-bright">{cron.name}</h3>
              <Badge variant={config.badge}>{cron.status}</Badge>
            </div>

            {cron.description && (
              <p className="text-xs sm:text-sm text-text-muted mt-1 line-clamp-2">{cron.description}</p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-2 text-xs text-text-dim">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{cron.schedule.humanReadable}</span>
              </div>
              <div className="truncate">
                <span className="text-text-muted">Next:</span> {formatNextRun(cron.nextRun)}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-8 sm:ml-0 flex-shrink-0">
          {cron.status === 'paused' ? (
            <Button
              variant="ghost"
              size="sm"
              icon={toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              onClick={handleToggle}
              disabled={toggling}
            >
              Enable
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                onClick={handleRun}
                disabled={loading || cron.status === 'running'}
              >
                <span className="hidden xs:inline">Run</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Edit className="w-4 h-4" />}
                onClick={() => onEdit?.(cron)}
              />
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
