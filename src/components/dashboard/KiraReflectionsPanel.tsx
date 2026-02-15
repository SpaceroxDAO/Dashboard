import { useAtom } from 'jotai';
import { BookOpen, Lightbulb, Target, Moon } from 'lucide-react';
import { kiraReflectionsAtom } from '@/store/atoms';

export function KiraReflectionsPanel() {
  const [reflections] = useAtom(kiraReflectionsAtom);

  if (!reflections) return null;

  const { dailyReflection, dreams } = reflections;
  const hasData = dailyReflection || dreams;
  if (!hasData) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-signal-primary" />
        Reflections
        {dailyReflection?.date && (
          <span className="ml-auto text-xs text-text-dim telemetry-value">{dailyReflection.date}</span>
        )}
      </h2>

      {dailyReflection && (
        <div className="space-y-3">
          {/* Summary */}
          {dailyReflection.summary && (
            <div className="text-sm text-text-muted leading-relaxed">
              {dailyReflection.summary}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Learnings */}
            {dailyReflection.learnings.length > 0 && (
              <div className="bg-surface-hover/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-signal-secondary" />
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Learnings</span>
                </div>
                <div className="space-y-1">
                  {dailyReflection.learnings.map((learning, i) => (
                    <div key={i} className="text-xs text-text-muted leading-relaxed">
                      {learning}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tomorrow's Focus */}
            {dailyReflection.tomorrowsFocus.length > 0 && (
              <div className="bg-surface-hover/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Target className="w-3.5 h-3.5 text-signal-primary" />
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Tomorrow's Focus</span>
                </div>
                <div className="space-y-1">
                  {dailyReflection.tomorrowsFocus.map((focus, i) => (
                    <div key={i} className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
                      <span className="text-signal-primary mt-0.5">-</span>
                      {focus}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dreams */}
      {dreams && (
        <div className="mt-4 pt-3 border-t border-[var(--border-panel)]">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Moon className="w-3.5 h-3.5" />
            Dreams & Aspirations
          </h3>
          <div className="text-xs text-text-muted leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
            {dreams}
          </div>
        </div>
      )}
    </div>
  );
}
