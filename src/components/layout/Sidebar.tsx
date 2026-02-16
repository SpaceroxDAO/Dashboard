import { useAtom } from 'jotai';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  Zap,
  Clock,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Target,
  CheckSquare,
  ListTodo,
  Dna,
  Wifi,
  WifiOff,
  Loader2,
  Gauge,
} from 'lucide-react';
import { sidebarCollapsedAtom, activeAgentAtom, agentsAtom, activeAgentIdAtom, connectionStatusAtom, activeMissionsAtom } from '@/store/atoms';
import { X } from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/dna', icon: Dna, label: 'DNA' },
  { path: '/memory', icon: FolderOpen, label: 'Memory' },
  { path: '/skills', icon: Zap, label: 'Skills' },
  { path: '/crons', icon: Clock, label: 'Cron Jobs' },
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/goals', icon: Target, label: 'Goals' },
  { path: '/todos', icon: CheckSquare, label: 'To-Do List' },
  { path: '/missions', icon: ListTodo, label: 'Mission Queue', showBadge: true },
];

const bottomItems = [
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [agents] = useAtom(agentsAtom);
  const [activeAgent] = useAtom(activeAgentAtom);
  const [, setActiveAgentId] = useAtom(activeAgentIdAtom);
  const [connectionStatus] = useAtom(connectionStatusAtom);
  const [activeMissions] = useAtom(activeMissionsAtom);
  const location = useLocation();

  const runningMissions = activeMissions.filter((m) => m.status === 'running').length;

  const connectionConfig: Record<string, { icon: typeof Wifi; color: string; label: string; animate?: boolean }> = {
    connected: { icon: Wifi, color: 'text-signal-online', label: 'API Connected' },
    disconnected: { icon: WifiOff, color: 'text-text-dim', label: 'API Offline (read-only)' },
    connecting: { icon: Loader2, color: 'text-signal-caution', label: 'Connecting...', animate: true },
    error: { icon: WifiOff, color: 'text-signal-alert', label: 'API Error' },
  };

  const connConfig = connectionConfig[connectionStatus];
  const ConnIcon = connConfig.icon;

  const sidebarContent = (
    <>
      {/* Agent Switcher */}
      <div className="p-3 border-b border-[var(--color-border-panel)]">
        <div className="flex gap-1">
          {agents.map((agent) => {
            const isActive = agent.id === activeAgent?.id;
            return (
              <button
                key={agent.id}
                onClick={() => setActiveAgentId(agent.id)}
                className={`
                  flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg
                  ${isActive ? 'bg-signal-primary text-white shadow-[0_0_12px_var(--color-glow-primary)]' : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'}
                `}
              >
                <span className="text-lg">{agent.emoji}</span>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-sm truncate">{agent.name}</div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${agent.status === 'online' ? (isActive ? 'bg-white/70' : 'bg-signal-online radar-pulse') : 'bg-text-dim'}`} />
                    <span className={`text-[10px] capitalize ${isActive ? 'text-white/70' : ''}`}>{agent.status}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Connection Status */}
        <div className={`flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border-panel)] ${connConfig.color}`}>
          <ConnIcon className={`w-4 h-4 ${connConfig.animate ? 'animate-spin' : ''}`} />
          <span className="text-xs">{connConfig.label}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const showBadge = item.showBadge && runningMissions > 0;

            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onMobileClose}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg relative
                    ${isActive
                      ? 'nav-signal-active bg-signal-primary/10 text-signal-primary'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium">{item.label}</span>
                  {showBadge && (
                    <span className="ml-auto w-5 h-5 rounded-full bg-signal-primary text-white text-xs flex items-center justify-center">
                      {runningMissions}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-[var(--color-border-panel)] p-2">
        <ul className="space-y-1">
          <li>
            <a
              href="https://claude.ai/settings/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright"
            >
              <Gauge className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">Usage</span>
            </a>
          </li>
          {bottomItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onMobileClose}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg
                    ${isActive
                      ? 'nav-signal-active bg-signal-primary/10 text-signal-primary'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright">
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">Sign Out</span>
            </button>
          </li>
        </ul>

        {/* Version */}
        <div className="mt-3 pt-3 border-t border-[var(--color-border-panel)] text-center">
          <span className="text-[10px] text-text-dim/60 font-mono">
            v0.1.0 • {import.meta.env.MODE}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`
          lg:hidden fixed top-0 left-0 h-full w-72 bg-surface-elevated z-50 flex flex-col panel-glow
          transform transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Close button */}
        <button
          onClick={onMobileClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright"
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col bg-surface-elevated border-r border-[var(--color-border-panel)] h-screen sticky top-0
          ${collapsed ? 'w-16' : 'w-60'}
        `}
      >
        {/* Agent Switcher */}
        <div className={`${collapsed ? 'p-2' : 'p-3'} border-b border-[var(--color-border-panel)]`}>
          {collapsed ? (
            /* Collapsed: stack agent emojis vertically */
            <div className="flex flex-col gap-1 items-center">
              {agents.map((agent) => {
                const isActive = agent.id === activeAgent?.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setActiveAgentId(agent.id)}
                    className={`
                      w-10 h-10 rounded-lg flex items-center justify-center
                      ${isActive ? 'bg-signal-primary shadow-[0_0_12px_var(--color-glow-primary)]' : 'hover:bg-surface-hover'}
                    `}
                    title={agent.name}
                  >
                    <span className="text-lg">{agent.emoji}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Expanded: full agent switcher */
            <>
              <div className="flex gap-1">
                {agents.map((agent) => {
                  const isActive = agent.id === activeAgent?.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setActiveAgentId(agent.id)}
                      className={`
                        flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg
                        ${isActive ? 'bg-signal-primary text-white shadow-[0_0_12px_var(--color-glow-primary)]' : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'}
                      `}
                    >
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-semibold text-sm truncate">{agent.name}</div>
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${agent.status === 'online' ? (isActive ? 'bg-white/70' : 'bg-signal-online radar-pulse') : 'bg-text-dim'}`} />
                          <span className={`text-[10px] capitalize ${isActive ? 'text-white/70' : ''}`}>{agent.status}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Connection Status */}
              <div className={`flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border-panel)] ${connConfig.color}`}>
                <ConnIcon className={`w-4 h-4 ${connConfig.animate ? 'animate-spin' : ''}`} />
                <span className="text-xs">{connConfig.label}</span>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const showBadge = item.showBadge && runningMissions > 0;

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg relative
                      ${isActive
                        ? 'nav-signal-active bg-signal-primary/10 text-signal-primary'
                        : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span className="font-medium">{item.label}</span>}
                    {showBadge && (
                      <span className={`
                        ${collapsed ? 'absolute -top-1 -right-1' : 'ml-auto'}
                        w-5 h-5 rounded-full bg-signal-primary text-white text-xs flex items-center justify-center
                      `}>
                        {runningMissions}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-[var(--color-border-panel)] p-2">
          <ul className="space-y-1">
            <li>
              <a
                href="https://claude.ai/settings/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright"
                title={collapsed ? 'Usage' : undefined}
              >
                <Gauge className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium">Usage</span>}
              </a>
            </li>
            {bottomItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg
                      ${isActive
                        ? 'nav-signal-active bg-signal-primary/10 text-signal-primary'
                        : 'text-text-muted hover:bg-surface-hover hover:text-text-bright'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span className="font-medium">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-bright"
                title={collapsed ? 'Sign Out' : undefined}
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium">Sign Out</span>}
              </button>
            </li>
          </ul>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-2 rounded-lg text-text-dim hover:bg-surface-hover hover:text-text-muted"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span className="text-sm">Collapse</span>}
          </button>

          {/* Version */}
          {!collapsed && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border-panel)] text-center">
              <span className="text-[10px] text-text-dim/60 font-mono">
                v0.1.0 • {import.meta.env.MODE}
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
