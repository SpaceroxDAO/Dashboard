import { useState } from 'react';
import { FileText, Plus, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';

interface Report {
  id: string; title: string; type: 'adhoc' | 'scheduled'; status: 'pending' | 'running' | 'complete';
  createdAt: string; schedule?: string; summary?: string;
}

export function ReportsPage() {
  const [reports] = useState<Report[]>([]);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'adhoc' | 'scheduled'>('adhoc');
  const [newPrompt, setNewPrompt] = useState('');

  const handleCreateReport = () => { setShowNewReport(false); setNewTitle(''); setNewPrompt(''); };

  return (
    <PageContainer>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-signal-primary" />
            <h1 className="text-lg font-bold text-text-bright">Reports</h1>
          </div>
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowNewReport(true)}>New Report</Button>
        </div>

        {showNewReport && (
          <div className="p-3 rounded-xl bg-surface-elevated border border-[var(--color-border-panel)] space-y-3">
            <h2 className="text-xs font-semibold text-text-bright">Request a Report</h2>
            <div>
              <label className="block text-[10px] text-text-dim mb-0.5">Title</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g., Weekly Launch Metrics"
                className="w-full bg-surface-base text-xs text-text-bright placeholder-text-dim px-2.5 py-1.5 rounded-lg border border-[var(--color-border-panel)] outline-none focus:border-signal-primary" />
            </div>
            <div>
              <label className="block text-[10px] text-text-dim mb-0.5">Type</label>
              <div className="flex gap-1.5">
                <button onClick={() => setNewType('adhoc')} className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                  newType === 'adhoc' ? 'border-signal-primary bg-signal-primary/10 text-signal-primary' : 'border-[var(--color-border-panel)] text-text-muted hover:text-text-bright'}`}>One-time</button>
                <button onClick={() => setNewType('scheduled')} className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                  newType === 'scheduled' ? 'border-signal-primary bg-signal-primary/10 text-signal-primary' : 'border-[var(--color-border-panel)] text-text-muted hover:text-text-bright'}`}>Scheduled</button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-text-dim mb-0.5">What should the report cover?</label>
              <textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="Describe what data or analysis you want..." rows={2}
                className="w-full bg-surface-base text-xs text-text-bright placeholder-text-dim px-2.5 py-1.5 rounded-lg border border-[var(--color-border-panel)] outline-none focus:border-signal-primary resize-none" />
            </div>
            <div className="flex gap-1.5 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowNewReport(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleCreateReport} disabled={!newTitle.trim() || !newPrompt.trim()}>Request</Button>
            </div>
          </div>
        )}

        {reports.length > 0 ? (
          <div className="space-y-1.5">
            {reports.map((report) => (
              <div key={report.id} className="p-2.5 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)] hover:border-[var(--color-border-bright)] transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-text-bright">{report.title}</h3>
                    <p className="text-[10px] text-text-dim mt-0.5">{report.summary || 'Processing...'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {report.status === 'complete' && <CheckCircle className="w-3.5 h-3.5 text-signal-online" />}
                    {report.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-signal-caution animate-spin" />}
                    {report.status === 'pending' && <Clock className="w-3.5 h-3.5 text-text-dim" />}
                    <span className={`text-[10px] px-1.5 py-px rounded-full ${
                      report.type === 'scheduled' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>{report.type === 'scheduled' ? 'Scheduled' : 'One-time'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-dim">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs mb-0.5">No reports yet</p>
            <p className="text-[10px]">Request ad-hoc research or set up scheduled reports.</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
