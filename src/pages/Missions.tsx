import { useState } from 'react';
import { useAtom } from 'jotai';
import { Target, ChevronRight, ChevronDown, Check, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageContainer } from '@/components/layout';
import { Button, Badge } from '@/components/ui';
import { missionsAtom } from '@/store/atoms';
import type { Mission } from '@/types';

function MissionItem({ mission }: { mission: Mission }) {
  const [expanded, setExpanded] = useState(false);
  const completedKR = mission.keyResults?.filter((kr) => kr.completed).length || 0;
  const totalKR = mission.keyResults?.length || 0;
  const progress = totalKR > 0 ? Math.round((completedKR / totalKR) * 100) : (mission.progress || 0);
  const statusConfig: Record<string, { color: string; badge: 'info' | 'success' | 'default' | 'warning' }> = {
    active: { color: 'text-signal-primary', badge: 'info' },
    completed: { color: 'text-signal-online', badge: 'success' },
    paused: { color: 'text-text-dim', badge: 'default' },
  };
  const config = statusConfig[mission.status || 'active'] || statusConfig.active;

  return (
    <div className="bg-surface-elevated rounded-lg overflow-hidden panel-glow">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 p-2.5 hover:bg-surface-hover transition-colors text-left">
        <div className={`${config.color}`}><Target className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-xs font-medium text-text-bright">{mission.name}</h3>
            <Badge variant={config.badge}>{mission.status || 'active'}</Badge>
          </div>
          {mission.description && <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{mission.description}</p>}
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 max-w-[160px]">
              <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-signal-primary rounded-full" />
              </div>
            </div>
            <span className="text-[10px] text-text-dim telemetry-value">{progress}%</span>
            {totalKR > 0 && <span className="text-[10px] text-text-dim">{completedKR}/{totalKR} KR</span>}
          </div>
          {mission.goalTitle && <p className="text-[10px] text-text-dim mt-0.5">Goal: {mission.goalTitle}</p>}
        </div>
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} className="text-text-dim"><ChevronRight className="w-3.5 h-3.5" /></motion.div>
      </button>
      <AnimatePresence>
        {expanded && mission.keyResults && mission.keyResults.length > 0 && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-[var(--color-border-panel)] px-2.5 py-2 space-y-1">
              <div className="text-[10px] font-medium text-text-dim uppercase tracking-wide mb-1">Key Results</div>
              {mission.keyResults.map((kr) => (
                <div key={kr.id} className="flex items-center gap-2 py-0.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${kr.completed ? 'bg-signal-online border-signal-online' : 'border-text-dim'}`}>
                    {kr.completed && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={`text-xs ${kr.completed ? 'text-text-dim line-through' : 'text-text-bright'}`}>{kr.title}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MissionsPage() {
  const [missions] = useAtom(missionsAtom);
  const [showCompleted, setShowCompleted] = useState(false);

  const activeMissions = missions.filter((m) => m.status === 'active' || m.status === 'running' || m.status === 'queued');
  const completedMissions = missions.filter((m) => m.status === 'completed' || m.status === 'paused');

  const missionsByGoal: Record<string, Mission[]> = {};
  for (const mission of activeMissions) {
    const goalKey = mission.goalTitle || 'Unlinked';
    if (!missionsByGoal[goalKey]) missionsByGoal[goalKey] = [];
    missionsByGoal[goalKey].push(mission);
  }

  return (
    <PageContainer title="Missions" actions={<Button icon={<Plus className="w-3.5 h-3.5" />}>Add Mission</Button>}>
      <div className="space-y-3">
        {Object.entries(missionsByGoal).length > 0 ? (
          Object.entries(missionsByGoal).map(([goalTitle, goalMissions]) => (
            <div key={goalTitle}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target className="w-3.5 h-3.5 text-signal-primary" />
                <h2 className="text-xs font-medium text-text-muted uppercase tracking-wide">{goalTitle}</h2>
                <span className="text-[10px] text-text-dim">({goalMissions.length})</span>
              </div>
              <div className="space-y-1.5">
                {goalMissions.map((mission) => <MissionItem key={mission.id} mission={mission} />)}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-surface-elevated rounded-lg p-6 text-center text-text-dim panel-glow">
            <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No active missions</p>
            <p className="text-[10px] mt-1">Missions break down goals into achievable chunks.</p>
            <Button className="mt-3" icon={<Plus className="w-3.5 h-3.5" />}>Create first mission</Button>
          </div>
        )}

        {completedMissions.length > 0 && (
          <div>
            <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-text-muted hover:text-text-bright transition-colors">
              <motion.div animate={{ rotate: showCompleted ? 0 : -90 }}><ChevronDown className="w-3.5 h-3.5" /></motion.div>
              Completed / Paused ({completedMissions.length})
            </button>
            <AnimatePresence>
              {showCompleted && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden">
                  {completedMissions.map((mission) => <MissionItem key={mission.id} mission={mission} />)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
