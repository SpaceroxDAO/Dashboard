import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { User } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import {
  HealthWidgetV2,
  QuickActions,
  PeopleWidget,
  HabitsWidget,
  FinanceWidgetV2,
} from '@/components/dashboard';
import { quickActionsAtom, addToastAtom } from '@/store/atoms';
import { useDataLoader } from '@/hooks';
import { executeQuickAction } from '@/services/api';
import type { QuickAction } from '@/types';

export function PersonalPage() {
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
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-signal-primary" />
          <h1 className="text-lg font-bold text-text-bright">Personal</h1>
        </div>

        <HealthWidgetV2 />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FinanceWidgetV2 />
          <PeopleWidget />
        </div>

        <HabitsWidget />

        <QuickActions actions={quickActions} onAction={handleQuickAction} />
      </div>
    </PageContainer>
  );
}
