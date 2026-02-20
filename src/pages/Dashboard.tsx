import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';
import {
  StatsGrid,
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
import { activeAgentAtom, addToastAtom, lastUpdatedAtom, isRefreshingAtom } from '@/store/atoms';
import { useDataLoader } from '@/hooks';

export function DashboardPage() {
  const [activeAgent] = useAtom(activeAgentAtom);
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
      <div className="space-y-3">
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-text-dim">Updated {formatLastUpdated(lastUpdated)}</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            Refresh
          </Button>
        </div>

        <LiveFeed />
        <StatsGrid />

        {isKira && (
          <>
            <FinnSupervisionPanel />
            <SystemMonitoringPanel />
            <KiraReflectionsPanel />
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CostBreakdown />
          <SystemHealth />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ActivityHeatmap />
          <div className="space-y-3">
            <RateLimits />
            <ServiceControls onToast={handleToast} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
