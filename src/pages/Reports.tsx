import { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, Moon, BarChart2, Brain, Loader2, Calendar } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { API_BASE } from '@/services/api';
import { useAtom } from 'jotai';
import { activeAgentAtom } from '@/store/atoms';

interface Reflection {
  id: string;
  filename: string;
  date: string;
  type: 'evening' | 'weekly' | 'learnings';
  title: string;
  excerpt: string;
}

const TYPE_ICONS = {
  evening: Moon,
  weekly: BarChart2,
  learnings: Brain,
};

const TYPE_COLORS = {
  evening: 'text-purple-400 bg-purple-400/10',
  weekly: 'text-signal-primary bg-signal-primary/10',
  learnings: 'text-signal-online bg-signal-online/10',
};

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function MarkdownView({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-xs text-text-muted leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-sm font-bold text-text-bright mt-2">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-xs font-semibold text-text-bright mt-2">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-[11px] font-semibold text-text-bright mt-1.5">{line.slice(4)}</h3>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <p key={i} className="pl-3 text-[11px]">• {line.slice(2)}</p>;
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-text-bright text-[11px]">{line.slice(2, -2)}</p>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="text-[11px]">{line}</p>;
      })}
    </div>
  );
}

export function ReportsPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [selected, setSelected] = useState<{ id: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';

  useEffect(() => {
    fetch(`${API_BASE}/api/agents/${agentId}/reflections`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setReflections(Array.isArray(data) ? data : []))
      .catch(() => setReflections([]))
      .finally(() => setLoading(false));
  }, [agentId]);

  const openReflection = async (id: string) => {
    setLoadingContent(true);
    try {
      const r = await fetch(`${API_BASE}/api/agents/${agentId}/reflections/${id}`);
      if (r.ok) {
        const data = await r.json();
        setSelected(data);
      }
    } finally {
      setLoadingContent(false);
    }
  };

  if (selected) {
    const reflection = reflections.find(r => r.id === selected.id);
    const Icon = reflection ? TYPE_ICONS[reflection.type] : Moon;
    return (
      <PageContainer>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(null)} className="text-text-dim hover:text-text-bright">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <Icon className="w-4 h-4 text-signal-primary" />
            <h1 className="text-sm font-bold text-text-bright truncate">{reflection?.title || selected.id}</h1>
          </div>
          {reflection && (
            <div className="flex items-center gap-1.5 text-[10px] text-text-dim">
              <Calendar className="w-3 h-3" />
              {formatDate(reflection.date)}
            </div>
          )}
          <div className="p-3 rounded-xl bg-surface-elevated border border-[var(--color-border-panel)]">
            <MarkdownView content={selected.content} />
          </div>
        </div>
      </PageContainer>
    );
  }

  const eveningCount = reflections.filter(r => r.type === 'evening').length;
  const weeklyCount = reflections.filter(r => r.type === 'weekly').length;

  return (
    <PageContainer>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-signal-primary" />
          <h1 className="text-lg font-bold text-text-bright">Journal</h1>
        </div>

        {!loading && reflections.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)] text-center">
              <div className="text-lg font-bold text-text-bright">{reflections.length}</div>
              <div className="text-[10px] text-text-dim">Total</div>
            </div>
            <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)] text-center">
              <div className="text-lg font-bold text-purple-400">{eveningCount}</div>
              <div className="text-[10px] text-text-dim">Evening</div>
            </div>
            <div className="p-2 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)] text-center">
              <div className="text-lg font-bold text-signal-primary">{weeklyCount}</div>
              <div className="text-[10px] text-text-dim">Weekly</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-signal-primary" />
          </div>
        ) : reflections.length === 0 ? (
          <div className="text-center py-8 text-text-dim">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs mb-0.5">No reflections yet</p>
            <p className="text-[10px]">Evening reflections and weekly reviews will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {reflections.map((r) => {
              const Icon = TYPE_ICONS[r.type];
              const colorClass = TYPE_COLORS[r.type];
              return (
                <button
                  key={r.id}
                  onClick={() => openReflection(r.id)}
                  disabled={loadingContent}
                  className="w-full text-left p-2.5 rounded-lg bg-surface-elevated border border-[var(--color-border-panel)] hover:border-[var(--color-border-bright)] transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-text-bright truncate">{r.title}</h3>
                        <span className="text-[10px] text-text-dim flex-shrink-0">{formatDate(r.date)}</span>
                      </div>
                      {r.excerpt && (
                        <p className="text-[10px] text-text-dim mt-0.5 line-clamp-2 leading-relaxed">{r.excerpt}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
