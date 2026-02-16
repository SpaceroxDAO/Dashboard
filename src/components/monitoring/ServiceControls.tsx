import { useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Server, RotateCcw, Loader2, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { getServices, restartService } from '@/services/api';
import { activeAgentIdAtom } from '@/store/atoms';

const statusConfig = {
  running: { icon: CheckCircle, color: 'text-signal-online', badge: 'success' as const },
  stopped: { icon: XCircle, color: 'text-signal-alert', badge: 'error' as const },
  unknown: { icon: HelpCircle, color: 'text-text-dim', badge: 'default' as const },
};

export function ServiceControls({ onToast }: { onToast?: (msg: string, type: 'success' | 'error') => void }) {
  const [agentId] = useAtom(activeAgentIdAtom);
  const queryClient = useQueryClient();
  const [restarting, setRestarting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['services', agentId],
    queryFn: () => getServices(agentId).then(d => d.services),
    refetchInterval: 30_000,
  });
  const services = data ?? [];

  const handleRestart = useCallback(async (name: string) => {
    setRestarting(name);
    try {
      const result = await restartService(name);
      if (result.success) {
        onToast?.(`Service "${name}" restarted`, 'success');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['services', agentId] });
        }, 3000);
      }
    } catch {
      onToast?.(`Failed to restart "${name}"`, 'error');
    } finally {
      setRestarting(null);
    }
  }, [onToast, agentId, queryClient]);

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
      </Card>
    );
  }

  const isKira = agentId === 'kira';

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <Server className="w-4 h-4" /> Services
        </h3>
        <Badge variant="info">{services.filter(s => s.status === 'running').length}/{services.length} running</Badge>
      </div>

      <div className="space-y-2">
        {services.map(service => {
          const config = statusConfig[service.status];
          const StatusIcon = config.icon;
          const isRestarting = restarting === service.name;
          // Only show restart for Finn's api-server
          const canRestart = !isKira && service.name === 'api-server';

          return (
            <div
              key={service.name}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface-base"
            >
              <StatusIcon className={`w-4 h-4 ${config.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-bright font-mono truncate">{service.name}</span>
                  <Badge variant={config.badge}>{service.status}</Badge>
                </div>
                <div className="text-[10px] text-text-dim truncate">
                  {service.description}
                  {service.pid && ` (pid: ${service.pid})`}
                  {service.uptime && ` — up ${service.uptime}`}
                </div>
              </div>
              {canRestart && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={isRestarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  onClick={() => handleRestart(service.name)}
                  disabled={isRestarting}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
