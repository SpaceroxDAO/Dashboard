import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';
import {
  StatsGrid,
  HealthSummary,
  UpcomingEvents,
  QuickActions,
  SystemStatus,
  JobPipeline,
  PeopleWidget,
  HabitsWidget,
  FinnSupervisionPanel,
  SystemMonitoringPanel,
  KiraReflectionsPanel,
} from '@/components/dashboard';
import { activeAgentAtom, latestHealthAtom, timelineEventsAtom, quickActionsAtom, addToastAtom, lastUpdatedAtom, isRefreshingAtom } from '@/store/atoms';
import { useDataLoader } from '@/hooks';
import { executeQuickAction } from '@/services/api';
import type { QuickAction } from '@/types';

export function DashboardPage() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const [healthData] = useAtom(latestHealthAtom);
  const [timelineEvents] = useAtom(timelineEventsAtom);
  const [quickActions] = useAtom(quickActionsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [lastUpdated] = useAtom(lastUpdatedAtom);
  const [isRefreshing] = useAtom(isRefreshingAtom);
  const { loadLiveData } = useDataLoader();

  const isFinn = activeAgent?.type === 'finn';
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

        {/* Stats Grid */}
        <StatsGrid />

        {/* System Status (both agents — checkpoint, cron health, mode) */}
        <SystemStatus />

        {/* ── Finn-specific panels ── */}
        {isFinn && healthData && (
          <HealthSummary data={healthData} />
        )}

        {isFinn && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <JobPipeline />
            <PeopleWidget />
          </div>
        )}

        {/* ── Kira-specific panels ── */}
        {isKira && (
          <>
            <FinnSupervisionPanel />
            <SystemMonitoringPanel />
            <KiraReflectionsPanel />
          </>
        )}

        {/* Two-column layout for timeline + habits/events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {timelineEvents.length > 0 && (
            <UpcomingEvents events={timelineEvents} />
          )}
          {isFinn && <HabitsWidget />}
        </div>

        {/* Quick actions */}
        {quickActions.length > 0 && (
          <QuickActions actions={quickActions} onAction={handleQuickAction} />
        )}
      </div>
    </PageContainer>
  );
}
