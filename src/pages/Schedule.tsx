import { useAtom } from 'jotai';
import { Calendar, Clock, ChevronRight } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { calendarEventsAtom } from '@/store/atoms';

export function SchedulePage() {
  const [calendarEvents] = useAtom(calendarEventsAtom);

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const eventsByDay: Record<string, typeof calendarEvents> = {};
  for (const event of calendarEvents) {
    const day = new Date(event.start).toISOString().split('T')[0];
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(event);
  }

  const sortedDays = Object.keys(eventsByDay).sort().filter(day => day >= today).slice(0, 7);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    if (dateStr === today) return 'Today';
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const isPast = (dateStr: string) => new Date(dateStr) < now;

  return (
    <PageContainer title="Schedule">
      <div className="space-y-3 max-w-2xl">
        {sortedDays.length > 0 ? (
          sortedDays.map((day) => (
            <div key={day}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-signal-primary" />
                <h2 className="text-xs font-medium text-text-bright">{formatDay(day)}</h2>
                <Badge variant={day === today ? 'info' : 'default'}>
                  {eventsByDay[day].length}
                </Badge>
              </div>
              <div className="space-y-1 ml-5">
                {eventsByDay[day]
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                  .map((event, i) => (
                    <div
                      key={`${day}-${i}`}
                      className={`flex items-center gap-2 py-1 border-b border-surface-hover/40 last:border-0 ${
                        isPast(event.end || event.start) ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[11px] text-text-dim min-w-[90px] telemetry-value">
                        <Clock className="w-3 h-3" />
                        {formatTime(event.start)}
                        {event.end && (
                          <>
                            <ChevronRight className="w-2.5 h-2.5" />
                            {formatTime(event.end)}
                          </>
                        )}
                      </div>
                      <p className="text-xs text-text-bright truncate">{event.subject}</p>
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <Card>
            <div className="text-center py-6">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-text-dim opacity-50" />
              <p className="text-xs text-text-muted">No upcoming calendar events</p>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
