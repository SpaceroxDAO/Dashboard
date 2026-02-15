import { useState } from 'react';
import { useAtom } from 'jotai';
import { Menu, Bell, Wifi, WifiOff, X, ChevronDown } from 'lucide-react';
import { agentsAtom, activeAgentAtom, activeAgentIdAtom, connectionStatusAtom } from '@/store/atoms';

interface HeaderProps {
  title?: string;
  onMenuClick?: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const [agents] = useAtom(agentsAtom);
  const [activeAgent] = useAtom(activeAgentAtom);
  const [, setActiveAgentId] = useAtom(activeAgentIdAtom);
  const [connectionStatus] = useAtom(connectionStatusAtom);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  return (
    <header className="lg:hidden sticky top-0 left-0 right-0 w-full z-40 bg-surface-elevated border-b border-[var(--color-border-panel)]">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left side */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onMenuClick}
            className="p-2 -ml-2 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Agent toggle */}
          {activeAgent && (
            <div className="relative">
              <button
                onClick={() => setShowAgentPicker(!showAgentPicker)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover"
              >
                <span className="text-xl">{activeAgent.emoji}</span>
                <span className="font-semibold text-text-bright">{title || activeAgent.name}</span>
                <ChevronDown className="w-4 h-4 text-text-dim" />
              </button>

              {/* Agent picker dropdown */}
              {showAgentPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAgentPicker(false)} />
                  <div className="absolute left-0 top-full mt-1 w-48 bg-surface-elevated border border-[var(--color-border-panel)] rounded-lg shadow-lg z-50 overflow-hidden panel-glow">
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => {
                          setActiveAgentId(agent.id);
                          setShowAgentPicker(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover ${
                          agent.id === activeAgent.id ? 'bg-signal-primary/10' : ''
                        }`}
                      >
                        <span className="text-xl">{agent.emoji}</span>
                        <div className="flex-1 text-left">
                          <div className="font-medium text-text-bright">{agent.name}</div>
                          <div className="text-xs text-text-dim capitalize">{agent.status}</div>
                        </div>
                        {agent.id === activeAgent.id && (
                          <span className="w-2 h-2 rounded-full bg-signal-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Connection status */}
          <div
            className={`p-2 rounded-lg ${connectionStatus === 'connected' ? 'text-signal-online' : connectionStatus === 'connecting' ? 'text-signal-caution' : 'text-text-dim'}`}
            title={connectionStatus === 'connected' ? 'API Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'API Offline (read-only)'}
          >
            {connectionStatus === 'connected' ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright relative"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-signal-alert rounded-full" />
            </button>

            {/* Notifications dropdown */}
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface-elevated border border-[var(--color-border-panel)] rounded-lg shadow-lg z-50 overflow-hidden panel-glow">
                  <div className="flex items-center justify-between p-3 border-b border-[var(--color-border-panel)]">
                    <span className="font-semibold text-text-bright">Notifications</span>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="p-1 rounded text-text-dim hover:text-text-bright"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 text-center text-text-muted text-sm">
                    No new notifications
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
