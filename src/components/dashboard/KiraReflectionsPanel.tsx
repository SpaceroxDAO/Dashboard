import { useAtom } from 'jotai';
import { BookOpen, Lightbulb, Target, Moon } from 'lucide-react';
import { kiraReflectionsAtom } from '@/store/atoms';

export function KiraReflectionsPanel() {
  const [reflections] = useAtom(kiraReflectionsAtom);
  if (!reflections) return null;
  const { dailyReflection, dreams } = reflections;
  if (!dailyReflection && !dreams) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <BookOpen className="w-4 h-4 text-signal-primary" />
        Reflections
        {dailyReflection?.date && <span className="ml-auto text-[10px] text-text-dim telemetry-value">{dailyReflection.date}</span>}
      </h2>

      {dailyReflection && (
        <div className="space-y-2">
          {dailyReflection.summary && (
            <div className="text-xs text-text-muted leading-relaxed">{dailyReflection.summary}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {dailyReflection.learnings.length > 0 && (
              <div className="bg-surface-hover/40 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Lightbulb className="w-3 h-3 text-signal-secondary" />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Learnings</span>
                </div>
                <div className="space-y-0.5">
                  {dailyReflection.learnings.map((l, i) => <div key={i} className="text-[11px] text-text-muted leading-snug">{l}</div>)}
                </div>
              </div>
            )}
            {dailyReflection.tomorrowsFocus.length > 0 && (
              <div className="bg-surface-hover/40 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Target className="w-3 h-3 text-signal-primary" />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Tomorrow</span>
                </div>
                <div className="space-y-0.5">
                  {dailyReflection.tomorrowsFocus.map((f, i) => (
                    <div key={i} className="text-[11px] text-text-muted leading-snug flex items-start gap-1">
                      <span className="text-signal-primary">-</span> {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {dreams && (
        <div className="mt-2 pt-1.5 border-t border-[var(--border-panel)]">
          <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Moon className="w-3 h-3" /> Dreams
          </h3>
          <div className="text-[11px] text-text-muted leading-snug whitespace-pre-line max-h-24 overflow-y-auto">{dreams}</div>
        </div>
      )}
    </div>
  );
}
