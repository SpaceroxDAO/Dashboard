import { useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import { Clock, AlertTriangle, Terminal } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button, Badge, DetailModal } from '@/components/ui';
import { CronItem } from '@/components/crons';
import { cronsAtom, addToastAtom } from '@/store/atoms';
import { runCron } from '@/services/api';
import type { CronJob } from '@/types';

export function CronsPage() {
  const [crons] = useAtom(cronsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [selectedCron, setSelectedCron] = useState<CronJob | null>(null);
  const [runResult, setRunResult] = useState<{ output?: string; error?: string } | null>(null);

  const handleRun = useCallback(async (cronId: string) => {
    const result = await runCron(cronId);
    if (result.success) {
      addToast({ message: `Cron "${cronId}" executed successfully`, type: 'success' });
    } else {
      addToast({ message: result.error || 'Execution failed', type: 'error' });
    }
    // If the detail modal is open for this cron, show the result
    if (selectedCron?.id === cronId) {
      setRunResult({ output: result.output, error: result.error });
    }
  }, [addToast, selectedCron]);

  const handleToggle = useCallback(async (_cronId: string, enabled: boolean) => {
    // Cron toggling is not supported for gateway-managed crons
    addToast({
      message: `Cron ${enabled ? 'enabling' : 'disabling'} requires gateway configuration`,
      type: 'info',
    });
  }, [addToast]);

  const handleEdit = useCallback((cron: CronJob) => {
    setSelectedCron(cron);
    setRunResult(null);
  }, []);

  // Group crons by taskGroup
  const groups: Record<string, CronJob[]> = {};
  for (const cron of crons) {
    const group = cron.taskGroup || 'General';
    if (!groups[group]) groups[group] = [];
    groups[group].push(cron);
  }
  const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

  // Stats
  const totalCrons = crons.length;
  const errorCrons = crons.filter(c => c.status === 'error').length;

  return (
    <PageContainer
      title={`Cron Jobs (${totalCrons})`}
      actions={
        errorCrons > 0 ? (
          <Badge variant="error">
            <AlertTriangle className="w-3 h-3 mr-1 inline" />
            {errorCrons} issues
          </Badge>
        ) : null
      }
    >
      <div className="space-y-6">
        {groupEntries.length > 0 ? (
          groupEntries.map(([group, groupCrons]) => (
            <div key={group}>
              <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-2">
                {group} <span className="text-text-dim">({groupCrons.length})</span>
              </h3>
              <div className="space-y-2">
                {groupCrons.map((cron) => (
                  <CronItem
                    key={cron.id}
                    cron={cron}
                    onRun={handleRun}
                    onToggle={handleToggle}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-text-dim">
            <p>No cron jobs configured</p>
          </div>
        )}
      </div>

      {/* Cron Detail Modal */}
      {selectedCron && (
        <DetailModal
          isOpen={!!selectedCron}
          onClose={() => { setSelectedCron(null); setRunResult(null); }}
          title={selectedCron.name}
          subtitle={selectedCron.schedule.humanReadable}
          icon={<Clock className="w-5 h-5" />}
          headerActions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRun(selectedCron.id)}
            >
              Run Now
            </Button>
          }
        >
          <div className="p-6 space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-text-dim mb-0.5">Status</div>
                <Badge variant={selectedCron.status === 'active' ? 'success' : selectedCron.status === 'error' ? 'error' : 'default'}>
                  {selectedCron.status}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-text-dim mb-0.5">Cron Expression</div>
                <div className="text-sm text-text-bright font-mono">{selectedCron.schedule.cron}</div>
              </div>
              <div>
                <div className="text-xs text-text-dim mb-0.5">Timezone</div>
                <div className="text-sm text-text-bright">{selectedCron.schedule.timezone}</div>
              </div>
              <div>
                <div className="text-xs text-text-dim mb-0.5">Group</div>
                <div className="text-sm text-text-bright">{selectedCron.taskGroup || 'General'}</div>
              </div>
              {selectedCron.nextRun && (
                <div>
                  <div className="text-xs text-text-dim mb-0.5">Next Run</div>
                  <div className="text-sm text-text-bright">{selectedCron.nextRun.toLocaleString()}</div>
                </div>
              )}
              {selectedCron.lastRun && (
                <div>
                  <div className="text-xs text-text-dim mb-0.5">Last Run</div>
                  <div className="text-sm text-text-bright">{selectedCron.lastRun.toLocaleString()}</div>
                </div>
              )}
            </div>

            {/* Description */}
            {selectedCron.description && (
              <div>
                <h4 className="text-sm font-medium text-text-muted mb-1">Description</h4>
                <p className="text-sm text-text-bright">{selectedCron.description}</p>
              </div>
            )}

            {/* Run result */}
            {runResult && (
              <div>
                <h4 className="text-sm font-medium text-text-muted mb-1 flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> Last Execution Result
                </h4>
                {runResult.error && (
                  <div className="bg-signal-alert/10 border border-signal-alert/20 rounded-lg p-3 text-sm text-signal-alert whitespace-pre-wrap font-mono">
                    {runResult.error}
                  </div>
                )}
                {runResult.output && (
                  <div className="bg-surface-base rounded-lg p-3 text-sm text-text-bright whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                    {runResult.output}
                  </div>
                )}
              </div>
            )}
          </div>
        </DetailModal>
      )}
    </PageContainer>
  );
}
