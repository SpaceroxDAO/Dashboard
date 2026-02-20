import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  Server, Cpu, Activity, Wifi, WifiOff, Globe, Zap,
  Database, Bot, AlertTriangle, CheckCircle,
  ExternalLink, LogOut,
} from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { agentsAtom, connectionStatusAtom } from '@/store/atoms';
import type { SystemInfoResponse } from '@/services/api';

const API_BASE = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://lumes-virtual-machine.tailf846b2.ts.net/dashboard-api'
    : 'http://localhost:3001'
);

export function SettingsPage() {
  const [agents] = useAtom(agentsAtom);
  const [connectionStatus] = useAtom(connectionStatusAtom);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSystemInfo() {
      try {
        const res = await fetch(`${API_BASE}/api/system-info`);
        if (res.ok) setSystemInfo(await res.json());
      } catch { /* API unavailable */ }
      finally { setLoading(false); }
    }
    fetchSystemInfo();
  }, []);

  return (
    <PageContainer title="System Admin">
      <div className="space-y-3 max-w-3xl">
        {/* Connection Status */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="w-4 h-4 text-signal-primary" />
            <h2 className="text-sm font-semibold text-text-bright">Connection</h2>
            <Badge variant={connectionStatus === 'connected' ? 'success' : 'error'}>{connectionStatus}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-hover rounded-md p-2">
              <div className="text-[10px] text-text-dim mb-0.5">API</div>
              <div className="flex items-center gap-1.5">
                {connectionStatus === 'connected' ? <CheckCircle className="w-3 h-3 text-signal-online" /> : <WifiOff className="w-3 h-3 text-signal-alert" />}
                <span className="text-xs text-text-bright">:3001</span>
              </div>
            </div>
            <div className="bg-surface-hover rounded-md p-2">
              <div className="text-[10px] text-text-dim mb-0.5">Tailscale</div>
              <div className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-signal-primary" /><span className="text-xs text-text-bright">Active</span></div>
            </div>
            <div className="bg-surface-hover rounded-md p-2">
              <div className="text-[10px] text-text-dim mb-0.5">Vercel</div>
              <div className="flex items-center gap-1.5"><ExternalLink className="w-3 h-3 text-signal-primary" /><span className="text-xs text-text-bright">Prod</span></div>
            </div>
          </div>
        </Card>

        {/* Active Agents */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-signal-primary" />
            <h2 className="text-sm font-semibold text-text-bright">Agents</h2>
            <Badge variant="info">{systemInfo?.agents?.length || agents.length}</Badge>
          </div>
          <div className="space-y-2">
            {(systemInfo?.agents || agents.map(a => ({
              id: a.id, name: a.name, emoji: a.emoji, status: a.status,
              model: 'Unknown', platform: 'Unknown', features: a.config.features, stats: a.stats,
            }))).map((agent) => (
              <div key={agent.id} className="bg-surface-hover rounded-md p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">{agent.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-text-bright">{agent.name}</span>
                      <Badge variant={agent.status === 'online' ? 'success' : 'error'}>{agent.status}</Badge>
                    </div>
                    <div className="text-[10px] text-text-dim">{agent.model || 'Unknown'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  <div className="bg-surface-base rounded p-1.5"><div className="text-text-dim">Platform</div><div className="text-text-bright mt-px">{agent.platform || '?'}</div></div>
                  <div className="bg-surface-base rounded p-1.5"><div className="text-text-dim">Features</div><div className="text-text-bright mt-px">{agent.features?.length || 0}</div></div>
                  {agent.stats && typeof agent.stats === 'object' && 'memoryFiles' in agent.stats ? (
                    <>
                      <div className="bg-surface-base rounded p-1.5"><div className="text-text-dim">Memory</div><div className="text-text-bright mt-px">{(agent.stats as Record<string, number>).memoryFiles || 0}</div></div>
                      <div className="bg-surface-base rounded p-1.5"><div className="text-text-dim">Scripts</div><div className="text-text-bright mt-px">{(agent.stats as Record<string, number>).scripts || 0}</div></div>
                    </>
                  ) : (
                    <>
                      <div className="bg-surface-base rounded p-1.5"><div className="text-text-dim">Memory</div><div className="text-text-bright mt-px">{(agent.stats as Record<string, number>).memoryCount || 0}</div></div>
                      <div className="bg-surface-base rounded p-1.5"><div className="text-text-dim">Skills</div><div className="text-text-bright mt-px">{(agent.stats as Record<string, number>).skillCount || 0}</div></div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Integrations */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-signal-primary" />
            <h2 className="text-sm font-semibold text-text-bright">Integrations</h2>
          </div>
          {systemInfo?.integrations ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {systemInfo.integrations.map((integration) => (
                <div key={integration.name} className="flex items-center gap-2 bg-surface-hover rounded-md p-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${integration.status === 'active' ? 'bg-signal-online' : 'bg-text-dim'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-bright">{integration.name}</div>
                    <div className="text-[10px] text-text-dim truncate">{integration.description}</div>
                  </div>
                  <Badge variant={integration.status === 'active' ? 'success' : 'default'}>{integration.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-dim">{loading ? 'Loading...' : 'Connect to API to view'}</div>
          )}
        </Card>

        {/* Infrastructure */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-signal-primary" />
            <h2 className="text-sm font-semibold text-text-bright">Infrastructure</h2>
          </div>
          <div className="space-y-0 text-xs">
            {[
              ['API Server', 'Express.js on :3001'],
              ['Frontend', 'React 19 + Vite + Vercel'],
              ['Networking', 'Tailscale Funnel (HTTPS)'],
              ['State', 'Jotai (atomic)'],
              ['Crons', `${systemInfo?.infrastructure?.gateway?.cronsConfigured || '?'} configured`],
              ['Polling', '30 seconds'],
            ].map(([label, value], i, arr) => (
              <div key={label} className={`flex justify-between py-1 ${i < arr.length - 1 ? 'border-b border-[var(--color-border-panel)]' : ''}`}>
                <span className="text-text-muted">{label}</span>
                <span className="text-text-bright">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Cron Health */}
        {systemInfo?.cronHealth && (
          <Card>
            <div className="flex items-center gap-2 mb-2">
              {systemInfo.cronHealth.alert ? <AlertTriangle className="w-4 h-4 text-signal-alert" /> : <Activity className="w-4 h-4 text-signal-online" />}
              <h2 className="text-sm font-semibold text-text-bright">Cron Health</h2>
              <Badge variant={systemInfo.cronHealth.alert ? 'error' : 'success'}>{systemInfo.cronHealth.alert ? 'Alert' : 'OK'}</Badge>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: systemInfo.cronHealth.failures, l: 'Failures', c: 'text-signal-alert' },
                { v: systemInfo.cronHealth.zombies, l: 'Zombies', c: 'text-signal-caution' },
                { v: systemInfo.cronHealth.stalled, l: 'Stalled', c: 'text-signal-caution' },
                { v: systemInfo.cronHealth.never_run, l: 'Never Run', c: 'text-text-dim' },
              ].map(({ v, l, c }) => (
                <div key={l} className="bg-surface-hover rounded-md p-2 text-center">
                  <div className={`text-lg font-bold ${c} telemetry-value`}>{v}</div>
                  <div className="text-[10px] text-text-dim">{l}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1.5">{systemInfo.cronHealth.message}</p>
          </Card>
        )}

        {/* Token Status */}
        {systemInfo?.tokenStatus && (
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-signal-primary" />
              <h2 className="text-sm font-semibold text-text-bright">Tokens</h2>
            </div>
            <div className="space-y-0 text-xs">
              {[
                ['Model', systemInfo.tokenStatus.model || '?'],
                ['Daily', systemInfo.tokenStatus.dailyRemaining || 'N/A'],
                ['Weekly', systemInfo.tokenStatus.weeklyRemaining || 'N/A'],
                ['Context', systemInfo.tokenStatus.contextWindow || 'N/A'],
                ['Compactions', String(systemInfo.tokenStatus.compactions)],
              ].map(([label, value], i, arr) => (
                <div key={label} className={`flex justify-between py-1 ${i < arr.length - 1 ? 'border-b border-[var(--color-border-panel)]' : ''}`}>
                  <span className="text-text-muted">{label}</span>
                  <span className="text-text-bright">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* About */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-signal-primary" />
            <h2 className="text-sm font-semibold text-text-bright">About</h2>
          </div>
          <div className="space-y-0 text-xs">
            {[
              ['Dashboard', 'Agent Command Center v1.0'],
              ['Stack', 'React 19 + TS + Vite'],
              ['Build', new Date().toISOString().split('T')[0]],
            ].map(([label, value], i, arr) => (
              <div key={label} className={`flex justify-between py-1 ${i < arr.length - 1 ? 'border-b border-[var(--color-border-panel)]' : ''}`}>
                <span className="text-text-muted">{label}</span>
                <span className="text-text-bright">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-signal-alert hover:bg-signal-alert/10 transition-colors">
            <LogOut className="w-4 h-4" /><span className="text-sm font-medium">Sign Out</span>
          </button>
        </Card>
      </div>
    </PageContainer>
  );
}
