import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom } from 'jotai';
import { FolderOpen, Clock, Zap, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { StatCard } from './StatCard';
import { Card } from '@/components/ui';
import { activeAgentAtom, agentsAtom, memoryCategoriesAtom, cronsAtom, skillsAtom, timelineEventsAtom } from '@/store/atoms';

function StatCardSkeleton() {
  return (
    <Card className="flex flex-col h-full animate-pulse">
      <div className="flex items-start justify-between mb-1.5">
        <div className="p-1.5 rounded-md bg-surface-active/50 w-7 h-7"></div>
      </div>
      <div className="w-12 h-6 bg-surface-active/50 rounded mb-0.5"></div>
      <div className="w-16 h-3 bg-surface-active/50 rounded"></div>
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
  const [timelineEvents] = useAtom(timelineEventsAtom);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [justRefreshed, setJustRefreshed] = useState(false);

  const handleRefresh = useCallback(() => {
    setLastRefresh(new Date());
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 600);
  }, []);

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (e.key === 'r' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      handleRefresh();
    }
  }, [handleRefresh]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  if (agents.length === 0) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
      </div>
    );
  }

  if (!activeAgent) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-col items-center justify-center h-full py-4 text-center">
            <Loader2 className="w-5 h-5 text-signal-primary animate-spin mb-1" />
            <p className="text-xs text-text-dim">Loading...</p>
          </Card>
        ))}
      </div>
    );
  }

  const liveMemoryCount = memoryCategories.reduce((sum, cat) => sum + cat.files.length, 0);
  const liveCronCount = crons.length;
  const liveSkillCount = skills.length;

  const memoryCount = liveMemoryCount > 0 ? liveMemoryCount : activeAgent.stats.memoryCount;
  const cronCount = liveCronCount > 0 ? liveCronCount : activeAgent.stats.cronCount;
  const skillCount = liveSkillCount > 0 ? liveSkillCount : activeAgent.stats.skillCount;

  const stats = [
    { value: memoryCount, label: 'Memory Files', subtitle: 'Active files', icon: <FolderOpen className="w-4 h-4" />, onClick: () => navigate('/memory') },
    { value: cronCount, label: 'Cron Jobs', subtitle: 'Active schedules', icon: <Clock className="w-4 h-4" />, onClick: () => navigate('/crons') },
    { value: skillCount, label: 'Skills', subtitle: 'Enabled features', icon: <Zap className="w-4 h-4" />, onClick: () => navigate('/skills') },
    { value: timelineEvents.length, label: 'Events', subtitle: "Today's upcoming", icon: <CalendarDays className="w-4 h-4" />, onClick: () => navigate('/schedule') },
  ];

  const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-xs font-medium text-text-muted">Live Stats</h3>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all duration-300 ${justRefreshed ? 'bg-signal-online/20 scale-105' : ''}`}>
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-online opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal-online"></span>
            </span>
            <span className="text-[10px] text-text-dim telemetry-value">{formatTime(lastRefresh)}</span>
          </span>
          <button onClick={handleRefresh} className="p-1 rounded hover:bg-surface-active" title="Refresh (r)">
            <RefreshCw className={`w-3 h-3 text-text-muted ${justRefreshed ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
