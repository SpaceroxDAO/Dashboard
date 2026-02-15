import { useAtom } from 'jotai';
import { Plus } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';
import { CronItem } from '@/components/crons';
import { cronsAtom, addToastAtom } from '@/store/atoms';
import type { CronJob } from '@/types';

export function CronsPage() {
  const [crons] = useAtom(cronsAtom);
  const [, addToast] = useAtom(addToastAtom);

  const handleRun = async (cronId: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    addToast({ message: `Cron "${cronId}" executed successfully`, type: 'success' });
  };

  const handleToggle = async (cronId: string, enabled: boolean) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    addToast({
      message: `Cron "${cronId}" ${enabled ? 'enabled' : 'disabled'}`,
      type: 'info',
    });
  };

  const handleEdit = (cron: CronJob) => {
    addToast({ message: `Edit modal for "${cron.name}" would open here`, type: 'info' });
  };

  // Sort crons: active first, then by next run time
  const sortedCrons = [...crons].sort((a, b) => {
    if (a.status === 'paused' && b.status !== 'paused') return 1;
    if (a.status !== 'paused' && b.status === 'paused') return -1;
    if (a.nextRun && b.nextRun) {
      return a.nextRun.getTime() - b.nextRun.getTime();
    }
    return 0;
  });

  return (
    <PageContainer
      title="Cron Jobs"
      actions={
        <Button icon={<Plus className="w-4 h-4" />}>
          Add New
        </Button>
      }
    >
      <div className="space-y-3">
        {sortedCrons.length > 0 ? (
          sortedCrons.map((cron) => (
            <CronItem
              key={cron.id}
              cron={cron}
              onRun={handleRun}
              onToggle={handleToggle}
              onEdit={handleEdit}
            />
          ))
        ) : (
          <div className="text-center py-12 text-text-dim">
            <p>No cron jobs configured</p>
            <Button className="mt-4" icon={<Plus className="w-4 h-4" />}>
              Create your first cron job
            </Button>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
