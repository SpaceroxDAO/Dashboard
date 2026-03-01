import { useState, useEffect } from 'react';
import { FileText, Plus, Clock, CheckCircle, Loader2, ChevronRight, AlertCircle, ExternalLink, Mail } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';

const API_BASE = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://lumes-virtual-machine.tailf846b2.ts.net/dashboard-api'
    : 'http://localhost:3001'
);

interface OutreachItem {
  from: string;
  role: string;
  company: string;
  date: string;
  unread: boolean;
  emailId?: string;
  gmailLink?: string;
  linkedinLink?: string;
}

interface JobAlert {
  title: string;
  company: string;
  date: string;
  emailId?: string;
  gmailLink?: string;
  jobLink?: string;
}

interface IndeedMatch {
  title: string;
  company: string;
  salary?: string;
  location?: string;
  date: string;
  emailId?: string;
  gmailLink?: string;
}

interface Interview {
  company: string;
  role: string;
  date: string;
  status: string;
  emailId?: string;
  gmailLink?: string;
}

interface ReportContent {
  unreadCount?: number;
  newInMails?: number;
  activeThreads?: number;
  jobAlerts?: number;
  directOutreach?: OutreachItem[];
  jobAlertsList?: JobAlert[];
  indeedMatches?: IndeedMatch[];
  interviews?: Interview[];
  actionItems?: string[];
}

interface Report {
  id: string;
  title: string;
  type: 'adhoc' | 'scheduled';
  status: 'pending' | 'running' | 'complete';
  createdAt: string;
  schedule?: string;
  summary?: string;
  content?: ReportContent;
  markdownPath?: string;
}

export function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewReport, setShowNewReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'adhoc' | 'scheduled'>('adhoc');
  const [newPrompt, setNewPrompt] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reports`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, type: newType, prompt: newPrompt }),
      });
      if (res.ok) {
        await fetchReports();
        setShowNewReport(false);
        setNewTitle('');
        setNewPrompt('');
      }
    } catch (error) {
      console.error('Failed to create report:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const LinkButton = ({ href, icon: Icon, label }: { href?: string; icon: any; label: string }) => {
    if (!href) return null;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-signal-primary/20 text-signal-primary hover:bg-signal-primary/30 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="w-3 h-3" />
        {label}
      </a>
    );
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-signal-primary" />
        </div>
      </PageContainer>
    );
  }

  if (selectedReport) {
    const content = selectedReport.content;
    return (
      <PageContainer>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedReport(null)} className="text-text-dim hover:text-text-bright">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <FileText className="w-5 h-5 text-signal-primary" />
            <h1 className="text-lg font-bold text-text-bright">{selectedReport.title}</h1>
          </div>

          <div className="text-[10px] text-text-dim">{formatDate(selectedReport.createdAt)}</div>

          {content && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <div className="text-lg font-bold text-signal-alert">{content.unreadCount || 0}</div>
                  <div className="text-[10px] text-text-dim">Unread</div>
                </div>
                <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <div className="text-lg font-bold text-signal-primary">{content.newInMails || 0}</div>
                  <div className="text-[10px] text-text-dim">InMails</div>
                </div>
                <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <div className="text-lg font-bold text-signal-online">{content.activeThreads || 0}</div>
                  <div className="text-[10px] text-text-dim">Active</div>
                </div>
                <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <div className="text-lg font-bold text-text-bright">{content.jobAlerts || 0}</div>
                  <div className="text-[10px] text-text-dim">Alerts</div>
                </div>
              </div>

              {/* Action Items */}
              {content.actionItems && content.actionItems.length > 0 && (
                <div className="p-3 rounded-lg bg-signal-alert/10 border border-signal-alert/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertCircle className="w-4 h-4 text-signal-alert" />
                    <h3 className="text-xs font-semibold text-signal-alert">Action Required</h3>
                  </div>
                  <ul className="space-y-1">
                    {content.actionItems.map((item, i) => (
                      <li key={i} className="text-xs text-text-bright flex items-start gap-1.5">
                        <span className="text-signal-alert">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Direct Outreach */}
              {content.directOutreach && content.directOutreach.length > 0 && (
                <div className="p-3 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <h3 className="text-xs font-semibold text-text-bright mb-2">Direct Recruiter Outreach</h3>
                  <div className="space-y-2">
                    {content.directOutreach.map((item, i) => (
                      <div key={i} className={`p-2 rounded-lg ${item.unread ? 'bg-signal-alert/10 border border-signal-alert/20' : 'bg-surface-base'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {item.unread && <span className="w-2 h-2 rounded-full bg-signal-alert flex-shrink-0"></span>}
                              <span className="font-medium text-xs text-text-bright truncate">{item.from}</span>
                            </div>
                            <p className="text-[10px] text-text-muted mt-0.5">{item.role} @ {item.company}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <LinkButton href={item.gmailLink} icon={Mail} label="Email" />
                            <LinkButton href={item.linkedinLink} icon={ExternalLink} label="LinkedIn" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Job Alerts */}
              {content.jobAlertsList && content.jobAlertsList.length > 0 && (
                <div className="p-3 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <h3 className="text-xs font-semibold text-text-bright mb-2">Job Alerts</h3>
                  <div className="space-y-2">
                    {content.jobAlertsList.map((item, i) => (
                      <div key={i} className="p-2 rounded-lg bg-surface-base">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-text-bright truncate">{item.title}</p>
                            <p className="text-[10px] text-text-dim">{item.company}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <LinkButton href={item.jobLink} icon={ExternalLink} label="Apply" />
                            <LinkButton href={item.gmailLink} icon={Mail} label="Email" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Indeed Matches */}
              {content.indeedMatches && content.indeedMatches.length > 0 && (
                <div className="p-3 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <h3 className="text-xs font-semibold text-text-bright mb-2">Indeed Matches</h3>
                  <div className="space-y-2">
                    {content.indeedMatches.map((item, i) => (
                      <div key={i} className="p-2 rounded-lg bg-surface-base">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-text-bright truncate">{item.title}</p>
                            <p className="text-[10px] text-text-dim">{item.company}</p>
                            {item.salary && <p className="text-[10px] text-signal-online font-medium">{item.salary}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <LinkButton href={item.gmailLink} icon={Mail} label="Email" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interviews */}
              {content.interviews && content.interviews.length > 0 && (
                <div className="p-3 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)]">
                  <h3 className="text-xs font-semibold text-text-bright mb-2">Interviews</h3>
                  <div className="space-y-2">
                    {content.interviews.map((item, i) => (
                      <div key={i} className="p-2 rounded-lg bg-surface-base">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-text-bright">{item.company} — {item.role}</p>
                            <p className="text-[10px] text-text-dim">{item.date}</p>
                            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated">{item.status}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <LinkButton href={item.gmailLink} icon={Mail} label="Email" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </PageContainer>
    );
  }

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
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g., Weekly Job Search Summary"
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
              <div 
                key={report.id} 
                onClick={() => setSelectedReport(report)}
                className="p-2.5 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)] hover:border-[var(--color-border-bright)] transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-text-bright">{report.title}</h3>
                    <p className="text-[10px] text-text-dim mt-0.5">{report.summary || 'Processing...'}</p>
                    <p className="text-[10px] text-text-dim mt-1">{formatDate(report.createdAt)}</p>
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
