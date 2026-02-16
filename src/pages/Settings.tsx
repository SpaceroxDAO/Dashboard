import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  Server, Cpu, Activity, Wifi, WifiOff, Globe, Zap,
  Database, Bot, AlertTriangle, CheckCircle,
  ExternalLink,
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
        if (res.ok) {
          const data = await res.json();
          setSystemInfo(data);
        }
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    fetchSystemInfo();
  }, []);

  return (
    <PageContainer title="System Admin">
      <div className="space-y-4 max-w-3xl">
        {/* Connection Status */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
              <Wifi className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-text-bright">Connection Status</h2>
            <Badge variant={connectionStatus === 'connected' ? 'success' : 'error'}>
              {connectionStatus}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface-hover rounded-lg p-3">
              <div className="text-xs text-text-dim mb-1">API Server</div>
              <div className="flex items-center gap-2">
                {connectionStatus === 'connected' ? (
                  <CheckCircle className="w-4 h-4 text-signal-online" />
                ) : (
                  <WifiOff className="w-4 h-4 text-signal-alert" />
                )}
                <span className="text-sm text-text-bright">localhost:3001</span>
              </div>
            </div>
            <div className="bg-surface-hover rounded-lg p-3">
              <div className="text-xs text-text-dim mb-1">Tailscale Funnel</div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-signal-primary" />
                <span className="text-sm text-text-bright truncate">Active</span>
              </div>
            </div>
            <div className="bg-surface-hover rounded-lg p-3">
              <div className="text-xs text-text-dim mb-1">Vercel Deploy</div>
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-signal-primary" />
                <span className="text-sm text-text-bright truncate">Production</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Active Agents */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
              <Bot className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-text-bright">Active Agents</h2>
            <Badge variant="info">{systemInfo?.agents?.length || agents.length} agents</Badge>
          </div>
          <div className="space-y-3">
            {(systemInfo?.agents || agents.map(a => ({
              id: a.id, name: a.name, emoji: a.emoji, status: a.status,
              model: 'Unknown', platform: 'Unknown',
              features: a.config.features, stats: a.stats,
            }))).map((agent) => (
              <div key={agent.id} className="bg-surface-hover rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{agent.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-bright">{agent.name}</span>
                      <Badge variant={agent.status === 'online' ? 'success' : 'error'}>
                        {agent.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-text-dim mt-0.5">{agent.model || 'Unknown model'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-surface-base rounded p-2">
                    <div className="text-text-dim">Platform</div>
                    <div className="text-text-bright mt-0.5">{agent.platform || 'Unknown'}</div>
                  </div>
                  <div className="bg-surface-base rounded p-2">
                    <div className="text-text-dim">Features</div>
                    <div className="text-text-bright mt-0.5">{agent.features?.length || 0}</div>
                  </div>
                  {agent.stats && typeof agent.stats === 'object' && 'memoryFiles' in agent.stats ? (
                    <>
                      <div className="bg-surface-base rounded p-2">
                        <div className="text-text-dim">Memory Files</div>
                        <div className="text-text-bright mt-0.5">{(agent.stats as Record<string, number>).memoryFiles || 0}</div>
                      </div>
                      <div className="bg-surface-base rounded p-2">
                        <div className="text-text-dim">Scripts</div>
                        <div className="text-text-bright mt-0.5">{(agent.stats as Record<string, number>).scripts || 0}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-surface-base rounded p-2">
                        <div className="text-text-dim">Memory</div>
                        <div className="text-text-bright mt-0.5">{(agent.stats as Record<string, number>).memoryCount || 0}</div>
                      </div>
                      <div className="bg-surface-base rounded p-2">
                        <div className="text-text-dim">Skills</div>
                        <div className="text-text-bright mt-0.5">{(agent.stats as Record<string, number>).skillCount || 0}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Integrations */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-text-bright">Integrations</h2>
          </div>
          {systemInfo?.integrations ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {systemInfo.integrations.map((integration) => (
                <div key={integration.name} className="flex items-center gap-3 bg-surface-hover rounded-lg p-3">
                  <div className={`w-2 h-2 rounded-full ${integration.status === 'active' ? 'bg-signal-online' : 'bg-text-dim'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-bright">{integration.name}</div>
                    <div className="text-xs text-text-dim truncate">{integration.description}</div>
                  </div>
                  <Badge variant={integration.status === 'active' ? 'success' : 'default'}>
                    {integration.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-text-dim">
              {loading ? 'Loading integrations...' : 'Connect to API to view integrations'}
            </div>
          )}
        </Card>

        {/* Infrastructure */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
              <Server className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-text-bright">Infrastructure</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">API Server</span>
              <span className="text-text-bright">Express.js on port 3001</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">Frontend</span>
              <span className="text-text-bright">React 19 + Vite + Vercel</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">Networking</span>
              <span className="text-text-bright">Tailscale Funnel (HTTPS)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">State Management</span>
              <span className="text-text-bright">Jotai (atomic)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">Gateway Crons</span>
              <span className="text-text-bright">{systemInfo?.infrastructure?.gateway?.cronsConfigured || '?'} configured</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-text-muted">Polling Interval</span>
              <span className="text-text-bright">30 seconds</span>
            </div>
          </div>
        </Card>

        {/* Cron Health */}
        {systemInfo?.cronHealth && (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${systemInfo.cronHealth.alert ? 'bg-signal-alert/10 text-signal-alert' : 'bg-surface-hover text-signal-online'}`}>
                {systemInfo.cronHealth.alert ? <AlertTriangle className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
              </div>
              <h2 className="font-semibold text-text-bright">Cron Health</h2>
              <Badge variant={systemInfo.cronHealth.alert ? 'error' : 'success'}>
                {systemInfo.cronHealth.alert ? 'Alert' : 'Healthy'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-surface-hover rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-signal-alert">{systemInfo.cronHealth.failures}</div>
                <div className="text-xs text-text-dim mt-1">Failures</div>
              </div>
              <div className="bg-surface-hover rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-signal-caution">{systemInfo.cronHealth.zombies}</div>
                <div className="text-xs text-text-dim mt-1">Zombies</div>
              </div>
              <div className="bg-surface-hover rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-signal-caution">{systemInfo.cronHealth.stalled}</div>
                <div className="text-xs text-text-dim mt-1">Stalled</div>
              </div>
              <div className="bg-surface-hover rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-text-dim">{systemInfo.cronHealth.never_run}</div>
                <div className="text-xs text-text-dim mt-1">Never Run</div>
              </div>
            </div>
            <p className="text-xs text-text-muted mt-3">{systemInfo.cronHealth.message}</p>
          </Card>
        )}

        {/* Token Status */}
        {systemInfo?.tokenStatus && (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
                <Cpu className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-text-bright">Token Status</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
                <span className="text-text-muted">Model</span>
                <span className="text-text-bright">{systemInfo.tokenStatus.model || 'Unknown'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
                <span className="text-text-muted">Daily Remaining</span>
                <span className="text-text-bright">{systemInfo.tokenStatus.dailyRemaining || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
                <span className="text-text-muted">Weekly Remaining</span>
                <span className="text-text-bright">{systemInfo.tokenStatus.weeklyRemaining || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
                <span className="text-text-muted">Context Window</span>
                <span className="text-text-bright">{systemInfo.tokenStatus.contextWindow || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-text-muted">Compactions</span>
                <span className="text-text-bright">{systemInfo.tokenStatus.compactions}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Version Info */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-text-bright">About</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">Dashboard</span>
              <span className="text-text-bright">Agent Command Center v1.0</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--color-border-panel)]">
              <span className="text-text-muted">Stack</span>
              <span className="text-text-bright">React 19 + TypeScript + Vite</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-text-muted">Build Date</span>
              <span className="text-text-bright">{new Date().toISOString().split('T')[0]}</span>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
