import { useAtom } from 'jotai';
import { motion } from 'framer-motion';
import { agentsAtom, activeAgentIdAtom } from '@/store/atoms';

export function AgentSwitcher() {
  const [agents] = useAtom(agentsAtom);
  const [activeAgentId, setActiveAgentId] = useAtom(activeAgentIdAtom);

  if (agents.length <= 1) return null;

  return (
    <div className="flex gap-1 sm:gap-2 p-1 bg-surface-elevated rounded-xl panel-glow">
      {agents.map((agent) => {
        const isActive = agent.id === activeAgentId;
        return (
          <button
            key={agent.id}
            onClick={() => setActiveAgentId(agent.id)}
            className={`
              relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium
              ${isActive ? 'text-white' : 'text-text-muted hover:text-text-bright'}
            `}
          >
            {isActive && (
              <motion.div
                layoutId="agent-switcher-bg"
                className="absolute inset-0 bg-signal-primary rounded-lg shadow-[0_0_12px_var(--color-glow-primary)]"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 text-base sm:text-lg">{agent.emoji}</span>
            <span className="relative z-10 text-sm sm:text-base">{agent.name}</span>
            <span
              className={`
                relative z-10 w-2 h-2 rounded-full
                ${agent.status === 'online' ? (isActive ? 'bg-white/80' : 'bg-signal-online radar-pulse') : 'bg-text-dim'}
              `}
            />
          </button>
        );
      })}
    </div>
  );
}
