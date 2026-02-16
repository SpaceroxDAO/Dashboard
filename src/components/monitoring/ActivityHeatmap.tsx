import { useState, useEffect } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { getActivityHeatmap } from '@/services/api';
import type { HeatmapData } from '@/services/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getIntensityClass(value: number, max: number): string {
  if (value === 0) return 'bg-surface-hover';
  const ratio = value / max;
  if (ratio > 0.75) return 'bg-signal-primary';
  if (ratio > 0.5) return 'bg-signal-primary/70';
  if (ratio > 0.25) return 'bg-signal-primary/40';
  return 'bg-signal-primary/20';
}

export function ActivityHeatmap() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActivityHeatmap()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
      </Card>
    );
  }

  if (!data) return null;

  const maxVal = Math.max(...data.grid.flat()) || 1;

  // Daily contribution grid (last 30 days)
  const dailyEntries = Object.entries(data.dailyActivity).sort(([a], [b]) => a.localeCompare(b));
  const dailyMax = Math.max(...Object.values(data.dailyActivity), 1);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Activity (30d)
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="default">{data.totalSessions.toLocaleString()} sessions</Badge>
          <Badge variant="info">{data.totalMessages.toLocaleString()} msgs</Badge>
        </div>
      </div>

      {/* Hour x Day heatmap grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {HOURS.filter((_, i) => i % 3 === 0).map(h => (
              <div key={h} className="text-[9px] text-text-dim" style={{ width: `${(3 / 24) * 100}%` }}>
                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
              </div>
            ))}
          </div>
          {/* Grid rows */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-1 mb-0.5">
              <span className="text-[10px] text-text-dim w-8 text-right flex-shrink-0">{day}</span>
              <div className="flex gap-px flex-1">
                {HOURS.map(hour => {
                  const val = data.grid[dayIdx][hour];
                  return (
                    <div
                      key={hour}
                      className={`flex-1 h-3 rounded-[2px] ${getIntensityClass(val, maxVal)} transition-colors`}
                      title={`${day} ${hour}:00 — ${val} messages`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily activity bar chart */}
      {dailyEntries.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border-panel)]">
          <div className="text-xs text-text-dim mb-2">Daily messages</div>
          <div className="flex items-end gap-px h-10">
            {dailyEntries.map(([date, count]) => {
              const heightPct = (count / dailyMax) * 100;
              return (
                <div
                  key={date}
                  className="flex-1 bg-signal-primary/60 rounded-t-sm hover:bg-signal-primary transition-colors"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`${date}: ${count} messages`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-text-dim mt-1">
            <span>{dailyEntries[0]?.[0]?.slice(5)}</span>
            <span>Peak: {DAYS[data.peakDay]} {data.peakHour}:00</span>
            <span>{dailyEntries[dailyEntries.length - 1]?.[0]?.slice(5)}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-1 mt-3 justify-end">
        <span className="text-[9px] text-text-dim">Less</span>
        <div className="w-3 h-3 rounded-[2px] bg-surface-hover" />
        <div className="w-3 h-3 rounded-[2px] bg-signal-primary/20" />
        <div className="w-3 h-3 rounded-[2px] bg-signal-primary/40" />
        <div className="w-3 h-3 rounded-[2px] bg-signal-primary/70" />
        <div className="w-3 h-3 rounded-[2px] bg-signal-primary" />
        <span className="text-[9px] text-text-dim">More</span>
      </div>
    </Card>
  );
}
