import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { TimelineItem } from './TimelineItem';
import { Button } from '@/components/ui';
import type { TimelineEvent } from '@/types';

interface UpcomingEventsProps {
  events: TimelineEvent[];
  onRunCron?: (cronId: string) => Promise<void>;
}

export function UpcomingEvents({ events, onRunCron }: UpcomingEventsProps) {
  const navigate = useNavigate();

  // Get events in the next 24 hours, sorted by time
  const upcomingEvents = events
    .filter((e) => {
      const now = new Date();
      const diff = e.time.getTime() - now.getTime();
      return diff > 0 && diff < 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => a.time.getTime() - b.time.getTime())
    .slice(0, 5);

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-bright">Upcoming (24h)</h2>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight className="w-4 h-4" />}
          onClick={() => navigate('/schedule')}
        >
          See All
        </Button>
      </div>

      {/* Timeline */}
      {upcomingEvents.length > 0 ? (
        <div>
          {upcomingEvents.map((event, index) => (
            <TimelineItem
              key={event.id}
              event={event}
              onRun={onRunCron}
              isLast={index === upcomingEvents.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-text-dim">
          No upcoming events in the next 24 hours
        </div>
      )}
    </div>
  );
}
