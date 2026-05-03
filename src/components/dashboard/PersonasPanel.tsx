import { useState, useEffect } from 'react';
import { Bot, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

const STORAGE_KEY = 'finn-active-persona';

interface Persona {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  tools: string[];
}

const PERSONAS: Persona[] = [
  {
    id: 'sage',
    name: 'Sage',
    icon: '🧠',
    tagline: 'Deep thinking & research',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
    description: 'Long-form analysis, knowledge synthesis, thoughtful reasoning over speed.',
    tools: ['memory', 'knowledge-synthesis', 'continuous-learning'],
  },
  {
    id: 'trader',
    name: 'Trader',
    icon: '📈',
    tagline: 'Finance & market focus',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    description: 'Market monitoring, portfolio analysis, YNAB updates, financial decisions.',
    tools: ['ynab', 'finance', 'daily-dashboard'],
  },
  {
    id: 'builder',
    name: 'Builder',
    icon: '⚡',
    tagline: 'Code & ship mode',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    description: 'Active coding, PRs, nightly builds, technical problem solving.',
    tools: ['coding-agent', 'github-pr-monitor', 'nightly-build'],
  },
  {
    id: 'scribe',
    name: 'Scribe',
    icon: '✍️',
    tagline: 'Writing & communication',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    description: 'Drafting, emails, podcast notes, creative writing, LinkedIn content.',
    tools: ['email-podcast', 'linkedin', 'moltbook'],
  },
  {
    id: 'ops',
    name: 'Ops',
    icon: '🛠️',
    tagline: 'System & automation',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    description: 'Cron management, skill maintenance, memory hygiene, system health.',
    tools: ['task-sync', 'skill-reviewer', 'memory-recency'],
  },
];

function buildPrompt(persona: Persona): string {
  return `Act as ${persona.name} mode: ${persona.tagline}. Focus tools: ${persona.tools.join(', ')}.`;
}

interface PersonaCardProps {
  persona: Persona;
  isActive: boolean;
  onActivate: (persona: Persona) => void;
}

function PersonaCard({ persona, isActive, onActivate }: PersonaCardProps) {
  return (
    <div
      className={`
        relative flex flex-col gap-1 p-2 rounded-lg border transition-colors
        ${isActive
          ? `${persona.bgColor} ${persona.borderColor}`
          : 'bg-surface-hover/30 border-transparent hover:border-[var(--border-panel)]'}
      `}
    >
      {/* Active badge */}
      {isActive && (
        <span
          className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold ${persona.color} ${persona.bgColor}`}
        >
          <Check className="w-2 h-2" />
          Active
        </span>
      )}

      {/* Icon */}
      <div className="text-2xl leading-none text-center select-none">{persona.icon}</div>

      {/* Name + tagline */}
      <div className="text-center">
        <div className={`text-[11px] font-semibold ${isActive ? persona.color : 'text-text-bright'}`}>
          {persona.name}
        </div>
        <div className="text-[10px] text-text-dim leading-snug">{persona.tagline}</div>
      </div>

      {/* Description */}
      <p className="text-[10px] text-text-muted leading-snug line-clamp-2">
        {persona.description}
      </p>

      {/* Tool chips */}
      <div className="flex flex-wrap gap-0.5">
        {persona.tools.map((tool) => (
          <span
            key={tool}
            className="text-[9px] px-1 py-0.5 rounded bg-surface-active text-text-dim leading-none"
          >
            {tool}
          </span>
        ))}
      </div>

      {/* Activate button */}
      <button
        className={`
          mt-auto text-[10px] px-2 py-0.5 rounded transition-colors font-medium
          ${isActive
            ? `${persona.color} ${persona.bgColor} opacity-60 cursor-default`
            : 'bg-surface-active hover:bg-surface-hover text-text-muted hover:text-text-bright'}
        `}
        onClick={() => onActivate(persona)}
        disabled={isActive}
        aria-label={`Activate ${persona.name} persona`}
      >
        {isActive ? 'Active' : 'Activate'}
      </button>
    </div>
  );
}

export function PersonasPanel() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const [open, setOpen] = useState(false);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Read persisted persona on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setActivePersonaId(stored);
  }, []);

  const agentId = activeAgent?.id ?? '';
  if (agentId !== 'finn') return null;

  const activePersona = PERSONAS.find((p) => p.id === activePersonaId) ?? null;

  function handleActivate(persona: Persona) {
    setActivePersonaId(persona.id);
    localStorage.setItem(STORAGE_KEY, persona.id);

    const prompt = buildPrompt(persona);
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // clipboard API may fail in some environments — silently ignore
    });
  }

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      {/* Header */}
      <button
        className="w-full flex items-center gap-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-text-bright flex items-center gap-1.5 flex-1 min-w-0">
          <Bot className="w-4 h-4 text-signal-primary shrink-0" />
          Personas
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-active text-text-dim">
            {activePersona ? activePersona.name : 'General'}
          </span>
          {copied && (
            <span className="text-[10px] text-signal-online font-normal ml-1">Copied!</span>
          )}
        </h2>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-text-dim shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-dim shrink-0" />
        )}
      </button>

      {/* Expanded grid */}
      {open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {PERSONAS.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              isActive={persona.id === activePersonaId}
              onActivate={handleActivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
