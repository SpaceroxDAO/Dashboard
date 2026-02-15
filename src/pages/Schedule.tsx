import { useState } from 'react';
import { useAtom } from 'jotai';
import { RefreshCw, Clock, MapPin, Briefcase, Heart, Mail } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';
import { AccordionGroup } from '@/components/crons';
import { cronGroupsAtom, addToastAtom } from '@/store/atoms';

const groupIcons: Record<string, React.ReactNode> = {
  'Daily Briefings': <Clock className="w-4 h-4" />,
  'Location': <MapPin className="w-4 h-4" />,
  'Self-Optimization': <Briefcase className="w-4 h-4" />,
  'Health': <Heart className="w-4 h-4" />,
  'Communication': <Mail className="w-4 h-4" />,
};

export function SchedulePage() {
  const [cronGroups] = useAtom(cronGroupsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Self-Optimization']);

  const handleRun = async (cronId: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    addToast({ message: `Cron "${cronId}" executed successfully`, type: 'success' });
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) =>
      prev.includes(group)
        ? prev.filter((g) => g !== group)
        : [...prev, group]
    );
  };

  const groupEntries = Object.entries(cronGroups).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <PageContainer
      title="Schedule"
      actions={
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-3">
        {groupEntries.length > 0 ? (
          groupEntries.map(([group, crons]) => (
            <AccordionGroup
              key={group}
              title={group}
              count={crons.length}
              icon={groupIcons[group]}
              expanded={expandedGroups.includes(group)}
              onToggle={() => toggleGroup(group)}
            >
              <div className="space-y-2">
                {crons.map((cron) => (
                  <div key={cron.id} className="bg-surface-base rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-medium text-text-bright truncate">
                          {cron.name}
                        </h4>
                        <p className="text-xs text-text-dim mt-0.5">
                          {cron.schedule.humanReadable}
                        </p>
                        {cron.description && (
                          <p className="text-sm text-text-muted mt-1 line-clamp-1">
                            {cron.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRun(cron.id)}
                      >
                        Run
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionGroup>
          ))
        ) : (
          <div className="text-center py-12 text-text-dim">
            <p>No scheduled tasks</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
