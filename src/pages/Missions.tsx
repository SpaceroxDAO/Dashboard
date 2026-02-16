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
      {/* Mission Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 hover:bg-surface-hover transition-colors text-left"
      >
        <div className={`mt-0.5 ${config.color}`}>
          <Target className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-text-bright">{mission.name}</h3>
            <Badge variant={config.badge}>
              {mission.status || 'active'}
            </Badge>
          </div>
          {mission.description && (
            <p className="text-sm text-text-muted mt-0.5 line-clamp-1">{mission.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2">
            {/* Progress bar */}
            <div className="flex-1 max-w-[200px]">
              <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-signal-primary rounded-full"
                />
              </div>
            </div>
            <span className="text-xs text-text-dim">{progress}%</span>
            {totalKR > 0 && (
              <span className="text-xs text-text-dim">
                {completedKR}/{totalKR} key results
              </span>
            )}
          </div>
          {mission.goalTitle && (
            <p className="text-xs text-text-dim mt-1.5">
              Goal: {mission.goalTitle}
            </p>
          )}
        </div>
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          className="text-text-dim mt-1"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.div>
      </button>

      {/* Key Results */}
      <AnimatePresence>
        {expanded && mission.keyResults && mission.keyResults.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-border-panel)] px-4 py-3 space-y-2">
              <div className="text-xs font-medium text-text-dim uppercase tracking-wide mb-2">
                Key Results
              </div>
              {mission.keyResults.map((kr) => (
                <div key={kr.id} className="flex items-center gap-3 py-1">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      kr.completed
                        ? 'bg-signal-online border-signal-online'
                        : 'border-text-dim'
                    }`}
                  >
                    {kr.completed && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span
                    className={`text-sm ${
                      kr.completed ? 'text-text-dim line-through' : 'text-text-bright'
                    }`}
                  >
                    {kr.title}
                  </span>
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

  // Group active missions by linked goal
  const missionsByGoal: Record<string, Mission[]> = {};
  for (const mission of activeMissions) {
    const goalKey = mission.goalTitle || 'Unlinked';
    if (!missionsByGoal[goalKey]) missionsByGoal[goalKey] = [];
    missionsByGoal[goalKey].push(mission);
  }

  return (
    <PageContainer
      title="Missions"
      actions={
        <Button icon={<Plus className="w-4 h-4" />}>
          Add Mission
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Active Missions */}
        {Object.entries(missionsByGoal).length > 0 ? (
          Object.entries(missionsByGoal).map(([goalTitle, goalMissions]) => (
            <div key={goalTitle}>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-signal-primary" />
                <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide">
                  {goalTitle}
                </h2>
                <span className="text-xs text-text-dim">({goalMissions.length})</span>
              </div>
              <div className="space-y-2">
                {goalMissions.map((mission) => (
                  <MissionItem key={mission.id} mission={mission} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-surface-elevated rounded-lg p-8 text-center text-text-dim panel-glow">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No active missions</p>
            <p className="text-xs mt-2">Missions are mid-level objectives that break down your goals into achievable chunks.</p>
            <Button className="mt-4" icon={<Plus className="w-4 h-4" />}>
              Create your first mission
            </Button>
          </div>
        )}

        {/* Completed Missions */}
        {completedMissions.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 mb-3 text-sm font-medium text-text-muted hover:text-text-bright transition-colors"
            >
              <motion.div animate={{ rotate: showCompleted ? 0 : -90 }}>
                <ChevronDown className="w-4 h-4" />
              </motion.div>
              <span>Completed / Paused ({completedMissions.length})</span>
            </button>

            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  {completedMissions.map((mission) => (
                    <MissionItem key={mission.id} mission={mission} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
