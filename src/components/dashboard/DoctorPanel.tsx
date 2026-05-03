import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Stethoscope, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface CheckItem {
  status: 'pass' | 'warn' | 'fail';
  label: string;
}

interface Category {
  name: string;
  items: CheckItem[];
}

interface DoctorData {
  categories: Category[];
  summary: { pass: number; warn: number; fail: number };
}

function StatusIcon({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  if (status === 'pass') return <CheckCircle className="w-3 h-3 text-signal-online shrink-0" />;
  if (status === 'warn') return <AlertTriangle className="w-3 h-3 text-signal-caution shrink-0" />;
  return <XCircle className="w-3 h-3 text-signal-alert shrink-0" />;
}

export function DoctorPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DoctorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';

  function fetchDoctor(bustCache = false) {
    setLoading(true);
    setError(false);
    const url = bustCache
      ? `${API_BASE}/api/agents/${agentId}/doctor?t=${Date.now()}`
      : `${API_BASE}/api/agents/${agentId}/doctor`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      fetchDoctor();
    }
  }

  if (agentId !== 'finn') return null;

  const summary = data?.summary;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={handleToggle}
          aria-expanded={open}
        >
          <h2 className="text-sm font-semibold text-text-bright flex items-center gap-1.5 flex-1 min-w-0">
            <Stethoscope className="w-4 h-4 text-signal-primary shrink-0" />
            System Doctor
            {summary && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                summary.fail > 0
                  ? 'bg-signal-alert/20 text-signal-alert'
                  : summary.warn > 0
                    ? 'bg-signal-caution/20 text-signal-caution'
                    : 'bg-signal-online/20 text-signal-online'
              }`}>
                {summary.fail > 0
                  ? `${summary.fail} failure${summary.fail !== 1 ? 's' : ''}`
                  : summary.warn > 0
                    ? `${summary.warn} warning${summary.warn !== 1 ? 's' : ''}`
                    : 'All clear'}
              </span>
            )}
            {!summary && !loading && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-active text-text-dim">
                — checks
              </span>
            )}
          </h2>
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 text-text-dim animate-spin shrink-0" />
          ) : open ? (
            <ChevronUp className="w-3.5 h-3.5 text-text-dim shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-text-dim shrink-0" />
          )}
        </button>

        {/* Run Check button — only when panel is open */}
        {open && (
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-hover/60 hover:bg-surface-hover text-[10px] text-text-muted hover:text-text-bright transition-colors shrink-0 disabled:opacity-50"
            onClick={() => fetchDoctor(true)}
            disabled={loading}
            aria-label="Run doctor check"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Run Check
          </button>
        )}
      </div>

      {/* Expanded content */}
      {open && (
        <div className="mt-3 space-y-3">
          {loading && !data && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
            </div>
          )}

          {error && !loading && (
            <p className="text-xs text-text-dim text-center py-4">Failed to load checks</p>
          )}

          {data && (
            <>
              {/* Summary counts */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] text-signal-online">
                  <CheckCircle className="w-3 h-3" /> {data.summary.pass} passed
                </span>
                {data.summary.warn > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-signal-caution">
                    <AlertTriangle className="w-3 h-3" /> {data.summary.warn} warned
                  </span>
                )}
                {data.summary.fail > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-signal-alert">
                    <XCircle className="w-3 h-3" /> {data.summary.fail} failed
                  </span>
                )}
              </div>

              {/* Category groups */}
              <div className="space-y-2">
                {data.categories.map(cat => (
                  <div key={cat.name} className="p-2 bg-surface-base/50 rounded-lg">
                    <div className="text-[9px] text-text-dim uppercase tracking-wide mb-1.5">{cat.name}</div>
                    <div className="space-y-1">
                      {cat.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <StatusIcon status={item.status} />
                          <span className={`text-[11px] leading-snug ${
                            item.status === 'fail'
                              ? 'text-signal-alert'
                              : item.status === 'warn'
                                ? 'text-signal-caution'
                                : 'text-text-muted'
                          }`}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
