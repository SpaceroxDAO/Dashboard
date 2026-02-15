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

  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Briefcase className="w-5 h-5 text-signal-primary" />
        Job Pipeline
        <span className="ml-auto text-xs text-text-dim telemetry-value">{jobs.length} active</span>
      </h2>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="bg-surface-hover/40 rounded-lg p-3 flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priorityDot[job.priority] || priorityDot.medium}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-text-bright">{job.company}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${stageBadgeColors[job.stage] || 'bg-surface-active text-text-muted'}`}>
                  {job.stage}
                </span>
              </div>
              <div className="text-xs text-text-muted mt-0.5">{job.role}</div>
              {job.comp && (
                <div className="text-xs text-signal-online telemetry-value mt-1">{job.comp}</div>
              )}
              {job.next_action && (
                <div className="text-xs text-text-dim mt-1 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  {job.next_action}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
