import { useState } from 'react';
import { Play, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { TimelineEvent } from '@/types';

interface TimelineItemProps {
  event: TimelineEvent;
  onRun?: (cronId: string) => Promise<void>;
  isLast?: boolean;
}

export function TimelineItem({ event, onRun, isLast }: TimelineItemProps) {
  const [loading, setLoading] = useState(false);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const handleRun = async () => {
    if (!event.cronId || !onRun) return;
    setLoading(true);
    try {
      await onRun(event.cronId);
    } finally {
      setLoading(false);
    }
  };

  const statusIcon = {
    pending: null,
    running: <Loader2 className="w-4 h-4 animate-spin text-signal-primary" />,
    completed: <Check className="w-4 h-4 text-signal-online" />,
    failed: <X className="w-4 h-4 text-signal-alert" />,
  };

  return (
    <div className="flex gap-3 sm:gap-4">
      {/* Time column */}
      <div className="flex flex-col items-center">
        <div className="w-14 sm:w-16 text-center">
          <div className="text-xs sm:text-sm font-semibold text-text-bright telemetry-value">
            {formatTime(event.time)}
          </div>
          <div className="text-xs text-text-dim">
            {isToday(event.time) ? 'Today' : 'Tomorrow'}
          </div>
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-[var(--color-border-panel)] mt-2" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6 min-w-0">
        <div className="bg-surface-elevated rounded-lg p-3 sm:p-4 panel-glow">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm sm:text-base text-text-bright truncate">
                  {event.title}
                </h3>
                {statusIcon[event.status]}
              </div>
              {event.description && (
                <p className="text-xs sm:text-sm text-text-muted mt-1 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>

            {event.cronId && event.status === 'pending' && (
              <Button
                variant="secondary"
                size="sm"
                icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                onClick={handleRun}
                disabled={loading}
                className="flex-shrink-0"
              >
                <span className="hidden sm:inline">Run</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
