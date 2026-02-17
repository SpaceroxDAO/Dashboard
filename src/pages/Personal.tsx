import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { User } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import {
  HealthSummary,
  QuickActions,
  JobPipeline,
  PeopleWidget,
  HabitsWidget,
  FinanceWidget,
} from '@/components/dashboard';
import { latestHealthAtom, quickActionsAtom, addToastAtom } from '@/store/atoms';
import { useDataLoader } from '@/hooks';
import { executeQuickAction } from '@/services/api';
import type { QuickAction } from '@/types';

export function PersonalPage() {
  const [healthData] = useAtom(latestHealthAtom);
  const [quickActions] = useAtom(quickActionsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const { loadLiveData } = useDataLoader();

  const handleQuickAction = useCallback(async (action: QuickAction) => {
    const result = await executeQuickAction(action.id);
    if (result.success) {
      addToast({ message: `${action.label} completed`, type: 'success' });
      await loadLiveData();
    } else {
      throw new Error(result.error || 'Execution failed');
    }
  }, [addToast, loadLiveData]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <User className="w-6 h-6 text-signal-primary" />
          <h1 className="text-xl font-bold text-text-bright">Personal</h1>
        </div>

        <QuickActions actions={quickActions} onAction={handleQuickAction} />

        <HealthSummary data={healthData} />

        <FinanceWidget />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <JobPipeline />
          <PeopleWidget />
        </div>

        <HabitsWidget />
      </div>
    </PageContainer>
  );
}
