import { useState } from 'react';
import { FileText, Plus, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';

interface Report {
  id: string;
  title: string;
  type: 'adhoc' | 'scheduled';
  status: 'pending' | 'running' | 'complete';
  createdAt: string;
  schedule?: string;
  summary?: string;
}

export function ReportsPage() {
  const [reports] = useState<Report[]>([]);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'adhoc' | 'scheduled'>('adhoc');
  const [newPrompt, setNewPrompt] = useState('');

  const handleCreateReport = () => {
    // TODO: POST to /api/reports when endpoint exists
    setShowNewReport(false);
    setNewTitle('');
    setNewPrompt('');
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-signal-primary" />
            <h1 className="text-xl font-bold text-text-bright">Reports</h1>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowNewReport(true)}
          >
            New Report
          </Button>
        </div>

        {/* New Report Form */}
        {showNewReport && (
          <div className="p-5 rounded-xl bg-surface-elevated border border-[var(--color-border-panel)] space-y-4">
            <h2 className="text-sm font-semibold text-text-bright">Request a Report</h2>

            <div>
              <label className="block text-xs text-text-dim mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Weekly Launch Metrics Summary"
                className="w-full bg-surface-base text-sm text-text-bright placeholder-text-dim px-3 py-2 rounded-lg border border-[var(--color-border-panel)] outline-none focus:border-signal-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-dim mb-1">Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewType('adhoc')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    newType === 'adhoc'
                      ? 'border-signal-primary bg-signal-primary/10 text-signal-primary'
                      : 'border-[var(--color-border-panel)] text-text-muted hover:text-text-bright'
                  }`}
                >
                  One-time
                </button>
                <button
                  onClick={() => setNewType('scheduled')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    newType === 'scheduled'
                      ? 'border-signal-primary bg-signal-primary/10 text-signal-primary'
                      : 'border-[var(--color-border-panel)] text-text-muted hover:text-text-bright'
                  }`}
                >
                  Scheduled
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-dim mb-1">What should the report cover?</label>
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Describe what data, analysis, or research you want..."
                rows={3}
                className="w-full bg-surface-base text-sm text-text-bright placeholder-text-dim px-3 py-2 rounded-lg border border-[var(--color-border-panel)] outline-none focus:border-signal-primary resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowNewReport(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateReport}
                disabled={!newTitle.trim() || !newPrompt.trim()}
              >
                Request Report
              </Button>
            </div>
          </div>
        )}

        {/* Reports List */}
        {reports.length > 0 ? (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-4 rounded-xl bg-surface-elevated border border-[var(--color-border-panel)] hover:border-[var(--color-border-bright)] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-bright">{report.title}</h3>
                    <p className="text-xs text-text-dim mt-1">{report.summary || 'Processing...'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {report.status === 'complete' && <CheckCircle className="w-4 h-4 text-signal-online" />}
                    {report.status === 'running' && <Loader2 className="w-4 h-4 text-signal-caution animate-spin" />}
                    {report.status === 'pending' && <Clock className="w-4 h-4 text-text-dim" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      report.type === 'scheduled' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {report.type === 'scheduled' ? 'Scheduled' : 'One-time'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-text-dim">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="mb-1">No reports yet</p>
            <p className="text-xs">Request ad-hoc research or set up scheduled reports from your agents.</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
