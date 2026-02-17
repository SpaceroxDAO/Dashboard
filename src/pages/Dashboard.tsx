import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';
import {
  StatsGrid,
  QuickActions,
  FinnSupervisionPanel,
  SystemMonitoringPanel,
  KiraReflectionsPanel,
} from '@/components/dashboard';
import {
  CostBreakdown,
  SystemHealth,
  ActivityHeatmap,
  LiveFeed,
  ServiceControls,
  RateLimits,
} from '@/components/monitoring';
import { activeAgentAtom, quickActionsAtom, addToastAtom, lastUpdatedAtom, isRefreshingAtom } from '@/store/atoms';
import { useDataLoader } from '@/hooks';
import { executeQuickAction } from '@/services/api';
import type { QuickAction } from '@/types';

export function DashboardPage() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const [quickActions] = useAtom(quickActionsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [lastUpdated] = useAtom(lastUpdatedAtom);
  const [isRefreshing] = useAtom(isRefreshingAtom);
  const { loadLiveData } = useDataLoader();

  const isKira = activeAgent?.type === 'kira';

  const handleRefresh = useCallback(async () => {
    const connected = await loadLiveData();
    addToast({
      message: connected ? 'Dashboard refreshed with live data' : 'Dashboard refreshed (offline mode)',
      type: connected ? 'success' : 'info',
    });
  }, [loadLiveData, addToast]);

  const handleQuickAction = useCallback(async (action: QuickAction) => {
    const result = await executeQuickAction(action.id);
    if (result.success) {
      addToast({
        message: `${action.label} completed`,
        type: 'success',
      });
      // Refresh data since script may have updated files
      await loadLiveData();
    } else {
      throw new Error(result.error || 'Execution failed');
    }
  }, [addToast, loadLiveData]);

  const handleToast = useCallback((msg: string, type: 'success' | 'error') => {
    addToast({ message: msg, type });
  }, [addToast]);

  const formatLastUpdated = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header with refresh */}
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm text-text-dim">
            Updated {formatLastUpdated(lastUpdated)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            Refresh
          </Button>
        </div>

        {/* Live Feed — top of dashboard for both agents */}
        <LiveFeed />

        {/* Stats Grid */}
        <StatsGrid />

        {/* Health disabled */}

        {/* JobPipeline + PeopleWidget moved to Personal page */}

        {/* Kira-specific panels */}
        {isKira && (
          <>
            <FinnSupervisionPanel />
            <SystemMonitoringPanel />
            <KiraReflectionsPanel />
          </>
        )}

        {/* HabitsWidget moved to Personal page */}

        {/* Monitoring Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CostBreakdown />
          <SystemHealth />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityHeatmap />
          <div className="space-y-6">
            <RateLimits />
            <ServiceControls onToast={handleToast} />
          </div>
        </div>

        {/* Quick actions */}
        {quickActions.length > 0 && (
          <QuickActions actions={quickActions} onAction={handleQuickAction} />
        )}
      </div>
    </PageContainer>
  );
}
