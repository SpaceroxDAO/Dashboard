import { useAtom } from 'jotai';
import { Flame, Lightbulb } from 'lucide-react';
import { habitStreaksAtom, ideasAtom } from '@/store/atoms';

export function HabitsWidget() {
  const [streaks] = useAtom(habitStreaksAtom);
  const [ideas] = useAtom(ideasAtom);

  const hasStreaks = streaks && streaks.length > 0;
  const hasIdeas = ideas && ideas.length > 0;

  if (!hasStreaks && !hasIdeas) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Flame className="w-5 h-5 text-signal-primary" />
        Habits & Ideas
      </h2>

      {/* Habit Streaks */}
      {hasStreaks && (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Active Streaks</h3>
          <div className="flex flex-wrap gap-2">
            {streaks.map((streak) => (
              <div
                key={streak.name}
                className="flex items-center gap-1.5 bg-surface-hover/60 rounded-md px-2.5 py-1.5"
              >
                <Flame className={`w-3 h-3 ${streak.streak >= 3 ? 'text-signal-caution' : 'text-text-dim'}`} />
                <span className="text-xs text-text-bright capitalize">{streak.name}</span>
                <span className="text-xs text-signal-primary telemetry-value font-medium">{streak.streak}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Ideas */}
      {hasIdeas && (
        <div>
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            Ideas ({ideas.length})
          </h3>
          <div className="space-y-1.5">
            {ideas.slice(0, 4).map((idea) => (
              <div key={idea.id} className="flex items-start gap-2 text-xs">
                <Lightbulb className="w-3 h-3 text-signal-secondary mt-0.5 flex-shrink-0" />
                <span className="text-text-muted truncate">{idea.idea}</span>
                {idea.heat > 1 && (
                  <span className="text-signal-caution telemetry-value flex-shrink-0">{idea.heat}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
