import { useAtom } from 'jotai';
import { Calendar, Clock, ChevronRight } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { calendarEventsAtom } from '@/store/atoms';

export function SchedulePage() {
  const [calendarEvents] = useAtom(calendarEventsAtom);

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Group events by day
  const eventsByDay: Record<string, typeof calendarEvents> = {};
  for (const event of calendarEvents) {
    const day = new Date(event.start).toISOString().split('T')[0];
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(event);
  }

  // Sort days and take upcoming 7 days
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
      <div className="space-y-4 max-w-2xl">
        {/* Info banner */}
        {sortedDays.length > 0 ? (
          sortedDays.map((day) => (
            <div key={day}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-signal-primary" />
                <h2 className="text-sm font-medium text-text-bright">{formatDay(day)}</h2>
                <Badge variant={day === today ? 'info' : 'default'}>
                  {eventsByDay[day].length} event{eventsByDay[day].length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Events for this day */}
              <div className="space-y-2 ml-6">
                {eventsByDay[day]
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                  .map((event, i) => (
                    <div
                      key={`${day}-${i}`}
                      className={`bg-surface-elevated rounded-lg p-3 panel-glow ${
                        isPast(event.end || event.start) ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-text-dim min-w-[100px]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatTime(event.start)}</span>
                          {event.end && (
                            <>
                              <ChevronRight className="w-3 h-3" />
                              <span>{formatTime(event.end)}</span>
                            </>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-bright">{event.subject}</p>
                        </div>
                        {isPast(event.end || event.start) && (
                          <Badge variant="default">Past</Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <Card>
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-text-dim opacity-50" />
              <p className="text-text-muted">No upcoming calendar events</p>
              <p className="text-xs text-text-dim mt-2">
                Events will appear here once Finn syncs your calendars during the morning briefing.
              </p>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
