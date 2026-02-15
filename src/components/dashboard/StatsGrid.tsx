import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom } from 'jotai';
import { FolderOpen, Clock, Zap, Mail, Loader2, RefreshCw } from 'lucide-react';
import { StatCard } from './StatCard';
import { Card } from '@/components/ui';
import { activeAgentAtom, agentsAtom, memoryCategoriesAtom, cronsAtom, skillsAtom } from '@/store/atoms';

// Skeleton stat card for loading state
function StatCardSkeleton() {
  return (
    <Card className="flex flex-col h-full animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-surface-active/50 w-9 h-9"></div>
      </div>
      <div className="mb-1">
        <div className="w-16 h-8 bg-surface-active/50 rounded"></div>
      </div>
      <div className="w-20 h-4 bg-surface-active/50 rounded mb-1"></div>
      <div className="w-24 h-3 bg-surface-active/50 rounded mt-1"></div>
    </Card>
  );
}

export function StatsGrid() {
  const navigate = useNavigate();
  const [activeAgent] = useAtom(activeAgentAtom);
  const [agents] = useAtom(agentsAtom);
  const [memoryCategories] = useAtom(memoryCategoriesAtom);
  const [crons] = useAtom(cronsAtom);
  const [skills] = useAtom(skillsAtom);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [justRefreshed, setJustRefreshed] = useState(false);

  // Keyboard shortcut: 'r' to refresh stats
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    // Only trigger if not typing in an input
    if (e.key === 'r' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      handleRefresh();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Show loading state while agents are loading
  if (agents.length === 0) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  // Show empty state if no active agent selected
  if (!activeAgent) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-col items-center justify-center h-full py-8 text-center">
            <Loader2 className="w-8 h-8 text-signal-primary animate-spin mb-2" />
            <p className="text-sm text-text-dim">Loading stats...</p>
          </Card>
        ))}
      </div>
    );
  }

  // Derive counts from live atom data; fall back to agent.stats
  const liveMemoryCount = memoryCategories.reduce((sum, cat) => sum + cat.files.length, 0);
  const liveCronCount = crons.length;
  const liveSkillCount = skills.length;

  const memoryCount = liveMemoryCount > 0 ? liveMemoryCount : activeAgent.stats.memoryCount;
  const cronCount = liveCronCount > 0 ? liveCronCount : activeAgent.stats.cronCount;
  const skillCount = liveSkillCount > 0 ? liveSkillCount : activeAgent.stats.skillCount;

  const stats = [
    {
      value: memoryCount,
      label: 'Memory Files',
      subtitle: 'Next: daily-notes',
      icon: <FolderOpen className="w-5 h-5" />,
      onClick: () => navigate('/memory'),
    },
    {
      value: cronCount,
      label: 'Cron Jobs',
      subtitle: 'Active schedules',
      icon: <Clock className="w-5 h-5" />,
      onClick: () => navigate('/crons'),
    },
    {
      value: skillCount,
      label: 'Skills',
      subtitle: 'Enabled features',
      icon: <Zap className="w-5 h-5" />,
      onClick: () => navigate('/skills'),
    },
    {
      value: activeAgent.stats.unreadEmails ?? 0,
      label: 'Emails',
      subtitle: 'Unread messages',
      icon: <Mail className="w-5 h-5" />,
      trend: activeAgent.stats.unreadEmails && activeAgent.stats.unreadEmails > 0
        ? { value: activeAgent.stats.unreadEmails, direction: 'up' as const }
        : undefined,
    },
  ];

  const handleRefresh = () => {
    setLastRefresh(new Date());
    // Flash the "Live" indicator to show refresh happened
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 600);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 gap-2">
        <h3 className="text-sm font-medium text-text-muted flex-shrink-0">Live Stats</h3>
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded-md transition-all duration-300 ${justRefreshed ? 'bg-signal-online/20 scale-105' : ''}`}>
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-online opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-online"></span>
            </span>
            <span className="text-xs text-text-dim truncate hidden xs:inline">Live —</span>
            <span className="text-xs text-text-dim telemetry-value">{formatTime(lastRefresh)}</span>
          </span>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md hover:bg-surface-active flex-shrink-0"
            title="Refresh stats (press 'r')"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-text-muted ${justRefreshed ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
}
