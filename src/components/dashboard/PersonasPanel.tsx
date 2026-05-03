import { useState, useEffect, useCallback } from 'react';
import { Bot, ChevronDown, ChevronUp, Check, Loader2 } from 'lucide-react';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';
import { API_BASE } from '@/services/api';

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
  return `[Persona: ${persona.name}] ${persona.description} Prioritize these skill areas: ${persona.tools.join(', ')}. This applies to this user conversation only — do not let this affect scheduled cron jobs or background tasks.`;
}

interface PersonaCardProps {
  persona: Persona;
  isActive: boolean;
  activating: boolean;
  onActivate: (persona: Persona) => void;
}

function PersonaCard({ persona, isActive, activating, onActivate }: PersonaCardProps) {
  return (
    <div
      className={`
        relative flex flex-col gap-1.5 p-2.5 rounded-lg border transition-all
        ${isActive
          ? `${persona.bgColor} ${persona.borderColor}`
          : 'bg-surface-hover/30 border-transparent hover:border-[var(--border-panel)]'}
      `}
    >
      {isActive && (
        <span className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold ${persona.color} ${persona.bgColor}`}>
          <Check className="w-2 h-2" /> Active
        </span>
      )}

      <div className="text-2xl leading-none text-center select-none">{persona.icon}</div>

      <div className="text-center">
        <div className={`text-[11px] font-semibold ${isActive ? persona.color : 'text-text-bright'}`}>
          {persona.name}
        </div>
        <div className="text-[10px] text-text-dim leading-snug">{persona.tagline}</div>
      </div>

      <p className="text-[10px] text-text-muted leading-snug line-clamp-2">{persona.description}</p>

      <div className="flex flex-wrap gap-0.5">
        {persona.tools.map(tool => (
          <span key={tool} className="text-[9px] px-1 py-0.5 rounded bg-surface-active text-text-dim leading-none">
            {tool}
          </span>
        ))}
      </div>

      <button
        className={`
          mt-auto text-[10px] px-2 py-1 rounded transition-colors font-medium flex items-center justify-center gap-1
          ${isActive
            ? `${persona.color} ${persona.bgColor} opacity-60 cursor-default`
            : 'bg-surface-active hover:bg-surface-hover text-text-muted hover:text-text-bright'}
        `}
        onClick={() => onActivate(persona)}
        disabled={isActive || activating}
      >
        {activating ? <Loader2 className="w-3 h-3 animate-spin" /> : isActive ? 'Active' : 'Activate'}
      </button>
    </div>
  );
}

export function PersonasPanel() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const [open, setOpen] = useState(false);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [activatedAt, setActivatedAt] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const agentId = activeAgent?.id ?? '';

  const loadPersona = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/agents/${agentId}/persona`);
      const d = await r.json();
      setActivePersonaId(d.active ?? null);
      setActivatedAt(d.activatedAt ?? null);
    } catch { /* offline */ }
  }, [agentId]);

  useEffect(() => {
    if (agentId !== 'finn') return;
    loadPersona();
  }, [agentId, loadPersona]);

  if (agentId !== 'finn') return null;

  const activePersona = PERSONAS.find(p => p.id === activePersonaId) ?? null;

  async function handleActivate(persona: Persona) {
    setActivating(true);
    setStatus(null);
    try {
      const r = await fetch(`${API_BASE}/api/agents/${agentId}/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: persona.id,
          name: persona.name,
          tagline: persona.tagline,
          prompt: buildPrompt(persona),
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setActivePersonaId(d.active ?? null);
      setActivatedAt(d.activatedAt ?? null);
      setStatus({ text: `${persona.name} mode active — Finn will adopt it on your next message`, ok: true });
    } catch {
      setStatus({ text: 'Failed to save', ok: false });
    } finally {
      setActivating(false);
      setTimeout(() => setStatus(null), 4000);
    }
  }

  async function handleDeactivate() {
    setActivating(true);
    try {
      await fetch(`${API_BASE}/api/agents/${agentId}/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'general', name: 'General', tagline: '', prompt: '' }),
      });
      setActivePersonaId(null);
      setActivatedAt(null);
      setStatus({ text: 'Returned to General mode', ok: true });
    } catch {
      setStatus({ text: 'Failed to save', ok: false });
    } finally {
      setActivating(false);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  const activatedTimeAgo = activatedAt ? (() => {
    const diff = Date.now() - new Date(activatedAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${hours}h ago`;
  })() : null;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <button
        className="w-full flex items-center gap-1.5 text-left"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-text-bright flex items-center gap-1.5 flex-1 min-w-0">
          <Bot className="w-4 h-4 text-signal-primary shrink-0" />
          Persona Mode
          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
            activePersona
              ? `${activePersona.bgColor} ${activePersona.color}`
              : 'bg-surface-active text-text-dim'
          }`}>
            {activePersona ? `${activePersona.icon} ${activePersona.name}` : 'General'}
          </span>
          {activePersona && activatedTimeAgo && (
            <span className="text-[10px] text-text-dim font-normal">activated {activatedTimeAgo}</span>
          )}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {activePersona && (
            <button
              onClick={e => { e.stopPropagation(); handleDeactivate(); }}
              className="text-[10px] text-text-dim hover:text-text-bright transition-colors px-1.5 py-0.5 rounded hover:bg-surface-hover"
            >
              Reset
            </button>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-text-dim" /> : <ChevronDown className="w-3.5 h-3.5 text-text-dim" />}
        </div>
      </button>

      {status && (
        <p className={`text-[11px] mt-1.5 ${status.ok ? 'text-signal-online' : 'text-signal-alert'}`}>
          {status.text}
        </p>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {PERSONAS.map(persona => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              isActive={persona.id === activePersonaId}
              activating={activating}
              onActivate={handleActivate}
            />
          ))}
        </div>
      )}

      {open && (
        <p className="mt-2 text-[10px] text-text-dim">
          Activating a mode writes to <span className="font-mono">~/.hermes/persona_mode.json</span> — Finn reads it at the start of your next conversation. Cron jobs are unaffected.
        </p>
      )}
    </div>
  );
}
