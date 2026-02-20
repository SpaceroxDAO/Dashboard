import { useAtom } from 'jotai';
import { Briefcase, ArrowRight } from 'lucide-react';
import { jobPipelineAtom } from '@/store/atoms';

const stageBadgeColors: Record<string, string> = {
  Lead: 'bg-signal-secondary/20 text-signal-secondary',
  Applied: 'bg-signal-primary/20 text-signal-primary',
  Interview: 'bg-signal-caution/20 text-signal-caution',
  Offer: 'bg-signal-online/20 text-signal-online',
};

const priorityDot: Record<string, string> = {
  high: 'bg-signal-alert',
  medium: 'bg-signal-caution',
  low: 'bg-signal-secondary',
};

export function JobPipeline() {
  const [jobs] = useAtom(jobPipelineAtom);

  if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-signal-primary" />
          Job Pipeline
        </h2>
        <div className="text-center py-3">
          <p className="text-xs text-text-dim">No active opportunities</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Briefcase className="w-4 h-4 text-signal-primary" />
        Job Pipeline
        <span className="ml-auto text-[10px] text-text-dim telemetry-value">{jobs.length} active</span>
      </h2>

      <div className="space-y-1">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center gap-2 py-1 border-b border-surface-hover/60 last:border-0">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[job.priority] || priorityDot.medium}`} />
            <span className="text-xs font-medium text-text-bright truncate">{job.company}</span>
            <span className={`text-[10px] px-1 py-px rounded ${stageBadgeColors[job.stage] || 'bg-surface-active text-text-muted'}`}>
              {job.stage}
            </span>
            {job.comp && (
              <span className="text-[10px] text-signal-online telemetry-value ml-auto flex-shrink-0">{job.comp}</span>
            )}
          </div>
        ))}
      </div>

      {jobs.some(j => j.next_action) && (
        <div className="mt-1.5 pt-1.5 border-t border-surface-hover/40 space-y-0.5">
          {jobs.filter(j => j.next_action).slice(0, 3).map((job) => (
            <div key={`action-${job.id}`} className="flex items-center gap-1 text-[10px] text-text-dim">
              <ArrowRight className="w-2.5 h-2.5" />
              <span className="text-text-muted">{job.company}:</span>
              <span className="truncate">{job.next_action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
