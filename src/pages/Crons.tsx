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
    if (result.success) addToast({ message: `Cron "${cronId}" executed`, type: 'success' });
    else addToast({ message: result.error || 'Execution failed', type: 'error' });
    if (selectedCron?.id === cronId) setRunResult({ output: result.output, error: result.error });
  }, [addToast, selectedCron]);

  const handleToggle = useCallback(async (_cronId: string, enabled: boolean) => {
    addToast({ message: `Cron ${enabled ? 'enabling' : 'disabling'} requires gateway configuration`, type: 'info' });
  }, [addToast]);

  const handleEdit = useCallback((cron: CronJob) => { setSelectedCron(cron); setRunResult(null); }, []);

  const groups: Record<string, CronJob[]> = {};
  for (const cron of crons) { const g = cron.taskGroup || 'General'; if (!groups[g]) groups[g] = []; groups[g].push(cron); }
  const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

  const totalCrons = crons.length;
  const errorCrons = crons.filter(c => c.status === 'error').length;

  return (
    <PageContainer
      title={`Cron Jobs (${totalCrons})`}
      actions={errorCrons > 0 ? <Badge variant="error"><AlertTriangle className="w-2.5 h-2.5 mr-0.5 inline" />{errorCrons} issues</Badge> : null}
    >
      <div className="space-y-3">
        {groupEntries.length > 0 ? (
          groupEntries.map(([group, groupCrons]) => (
            <div key={group}>
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                {group} <span className="text-text-dim">({groupCrons.length})</span>
              </h3>
              <div className="space-y-1.5">
                {groupCrons.map((cron) => <CronItem key={cron.id} cron={cron} onRun={handleRun} onToggle={handleToggle} onEdit={handleEdit} />)}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-text-dim"><p className="text-xs">No cron jobs configured</p></div>
        )}
      </div>

      {selectedCron && (
        <DetailModal isOpen={!!selectedCron} onClose={() => { setSelectedCron(null); setRunResult(null); }}
          title={selectedCron.name} subtitle={selectedCron.schedule.humanReadable} icon={<Clock className="w-4 h-4" />}
          headerActions={<Button variant="secondary" size="sm" onClick={() => handleRun(selectedCron.id)}>Run Now</Button>}>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-text-dim mb-px">Status</div>
                <Badge variant={selectedCron.status === 'active' ? 'success' : selectedCron.status === 'error' ? 'error' : 'default'}>{selectedCron.status}</Badge>
              </div>
              <div>
                <div className="text-[10px] text-text-dim mb-px">Cron</div>
                <div className="text-xs text-text-bright font-mono">{selectedCron.schedule.cron}</div>
              </div>
              <div>
                <div className="text-[10px] text-text-dim mb-px">Timezone</div>
                <div className="text-xs text-text-bright">{selectedCron.schedule.timezone}</div>
              </div>
              <div>
                <div className="text-[10px] text-text-dim mb-px">Group</div>
                <div className="text-xs text-text-bright">{selectedCron.taskGroup || 'General'}</div>
              </div>
            </div>
            {selectedCron.description && (
              <div>
                <h4 className="text-xs font-medium text-text-muted mb-0.5">Description</h4>
                <p className="text-xs text-text-bright">{selectedCron.description}</p>
              </div>
            )}
            {runResult && (
              <div>
                <h4 className="text-xs font-medium text-text-muted mb-0.5 flex items-center gap-1"><Terminal className="w-3.5 h-3.5" /> Result</h4>
                {runResult.error && <div className="bg-signal-alert/10 border border-signal-alert/20 rounded-lg p-2 text-xs text-signal-alert whitespace-pre-wrap font-mono">{runResult.error}</div>}
                {runResult.output && <div className="bg-surface-base rounded-lg p-2 text-xs text-text-bright whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{runResult.output}</div>}
              </div>
            )}
          </div>
        </DetailModal>
      )}
    </PageContainer>
  );
}
