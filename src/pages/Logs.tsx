import { useState, useEffect, useRef } from 'react';
import { ScrollText, RefreshCw, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

type LogFile = 'agent' | 'errors' | 'gateway';
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
type LogSince = '30m' | '1h' | '2h' | '6h' | '1d';
type LogComponent = 'gateway' | 'agent' | 'tools' | 'cli' | 'cron';

interface LogResponse {
  log: LogFile;
  lines: string[];
  count: number;
}

function getLineColor(line: string): string {
  if (line.includes(' ERROR ') || line.startsWith('ERROR')) return 'text-red-400';
  if (line.includes(' WARNING ') || line.startsWith('WARNING')) return 'text-yellow-400';
  if (line.includes(' DEBUG ') || line.startsWith('DEBUG')) return 'text-text-dim';
  return 'text-text-muted';
}

export function LogsPage() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id ?? 'finn';

  const [logFile, setLogFile] = useState<LogFile>('agent');
  const [lines, setLines] = useState<number>(100);
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [since, setSince] = useState<LogSince | ''>('');
  const [component, setComponent] = useState<LogComponent | ''>('');

  const [logLines, setLogLines] = useState<string[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('log', logFile);
    params.set('lines', String(lines));
    if (level) params.set('level', level);
    if (since) params.set('since', since);
    if (component) params.set('component', component);

    fetch(`${API_BASE}/api/agents/${agentId}/logs?${params.toString()}`)
      .then(r => r.ok ? r.json() : { lines: [], count: 0 })
      .then((data: LogResponse) => {
        setLogLines(Array.isArray(data.lines) ? data.lines : []);
        setCount(typeof data.count === 'number' ? data.count : 0);
      })
      .catch(() => { setLogLines([]); setCount(0); })
      .finally(() => setLoading(false));
  };

  // Debounced fetch on filter change
  useEffect(() => {
    if (agentId !== 'finn') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchLogs, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, logFile, lines, level, since, component, refreshTick]);

  if (agentId !== 'finn') {
    return (
      <PageContainer title="Logs">
        <div className="text-center py-8 text-text-dim">
          <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Logs only available for Finn</p>
        </div>
      </PageContainer>
    );
  }

  const selectClass =
    'bg-surface-elevated border border-[var(--color-border-panel)] text-text-bright text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-signal-primary';

  return (
    <PageContainer
      title={`Logs${!loading ? ` (${count})` : ''}`}
      actions={
        <button
          onClick={() => setRefreshTick(t => t + 1)}
          className="p-1.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="space-y-3">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Log file tabs */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--color-border-panel)]">
            {(['agent', 'errors', 'gateway'] as LogFile[]).map(lf => (
              <button
                key={lf}
                onClick={() => setLogFile(lf)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  logFile === lf
                    ? 'bg-signal-primary text-white'
                    : 'bg-surface-elevated text-text-muted hover:text-text-bright'
                }`}
              >
                {lf}
              </button>
            ))}
          </div>

          <select
            value={lines}
            onChange={e => setLines(Number(e.target.value))}
            className={selectClass}
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
            <option value={500}>500 lines</option>
          </select>

          <select
            value={level}
            onChange={e => setLevel(e.target.value as LogLevel | '')}
            className={selectClass}
          >
            <option value="">All levels</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>

          <select
            value={since}
            onChange={e => setSince(e.target.value as LogSince | '')}
            className={selectClass}
          >
            <option value="">All time</option>
            <option value="30m">30m</option>
            <option value="1h">1h</option>
            <option value="2h">2h</option>
            <option value="6h">6h</option>
            <option value="1d">1d</option>
          </select>

          <select
            value={component}
            onChange={e => setComponent(e.target.value as LogComponent | '')}
            className={selectClass}
          >
            <option value="">All components</option>
            <option value="gateway">gateway</option>
            <option value="agent">agent</option>
            <option value="tools">tools</option>
            <option value="cli">cli</option>
            <option value="cron">cron</option>
          </select>
        </div>

        {/* Log output */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-signal-primary" />
          </div>
        ) : logLines.length === 0 ? (
          <div className="text-center py-8 text-text-dim">
            <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No logs</p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-base border border-[var(--color-border-panel)] p-3 overflow-x-auto max-h-[calc(100vh-220px)] overflow-y-auto">
            <pre className="text-xs font-mono leading-relaxed">
              {logLines.map((line, i) => (
                <div key={i} className={getLineColor(line)}>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
