import { useAtom } from 'jotai';
import { Flame, Lightbulb } from 'lucide-react';
import { habitStreaksAtom, ideasAtom } from '@/store/atoms';

export function HabitsWidget() {
  const [streaks] = useAtom(habitStreaksAtom);
  const [ideas] = useAtom(ideasAtom);

  const hasStreaks = streaks && streaks.length > 0;
  const hasIdeas = ideas && ideas.length > 0;

  if (!hasStreaks && !hasIdeas) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-signal-primary" />
          Habits & Ideas
        </h2>
        <div className="text-center py-2">
          <p className="text-xs text-text-dim">No streaks or ideas yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Flame className="w-4 h-4 text-signal-primary" />
        Habits & Ideas
      </h2>

      <div className="flex flex-col sm:flex-row gap-3">
        {hasStreaks && (
          <div className="flex-1">
            <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">Streaks</h3>
            <div className="flex flex-wrap gap-1">
              {streaks.map((streak) => (
                <div key={streak.name} className="flex items-center gap-1 bg-surface-hover/60 rounded px-1.5 py-0.5">
                  <Flame className={`w-2.5 h-2.5 ${streak.streak >= 3 ? 'text-signal-caution' : 'text-text-dim'}`} />
                  <span className="text-[11px] text-text-bright capitalize">{streak.name}</span>
                  <span className="text-[11px] text-signal-primary telemetry-value font-medium">{streak.streak}d</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasIdeas && (
          <div className="flex-1">
            <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">
              Ideas ({ideas.length})
            </h3>
            <div className="space-y-0.5">
              {ideas.slice(0, 4).map((idea) => (
                <div key={idea.id} className="flex items-start gap-1 text-[11px]">
                  <Lightbulb className="w-2.5 h-2.5 text-signal-secondary mt-0.5 flex-shrink-0" />
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
    </div>
  );
}
