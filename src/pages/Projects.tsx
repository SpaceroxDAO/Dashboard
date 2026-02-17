import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Inbox, Play, List, Ban, ArrowRight } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { useKanban } from '@/hooks/useKanban';
import type { KanbanColumnId } from '@/types';

const PROJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'teach-charlie': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'job-search': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'cognigy': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  'personal': { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
};

const FALLBACK_COLORS = [
  { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
  { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30' },
];

function getProjectColors(project: string) {
  if (PROJECT_COLORS[project]) return PROJECT_COLORS[project];
  let hash = 0;
  for (let i = 0; i < project.length; i++) hash = ((hash << 5) - hash + project.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

interface ProjectSummary {
  name: string;
  inbox: number;
  inProgress: number;
  backlog: number;
  blocked: number;
  done: number;
  total: number;
  active: number;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { columns } = useKanban();

  const projects = useMemo(() => {
    const map = new Map<string, ProjectSummary>();
    const COLS: KanbanColumnId[] = ['inbox', 'in-progress', 'backlog', 'blocked', 'done'];

    for (const col of COLS) {
      for (const task of columns[col]) {
        const tag = task.project || 'untagged';
        if (!map.has(tag)) {
          map.set(tag, { name: tag, inbox: 0, inProgress: 0, backlog: 0, blocked: 0, done: 0, total: 0, active: 0 });
        }
        const p = map.get(tag)!;
        p.total++;
        if (col === 'inbox') p.inbox++;
        else if (col === 'in-progress') p.inProgress++;
        else if (col === 'backlog') p.backlog++;
        else if (col === 'blocked') p.blocked++;
        else if (col === 'done') p.done++;
        if (col !== 'done') p.active++;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.active - a.active);
  }, [columns]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-6 h-6 text-signal-primary" />
          <h1 className="text-xl font-bold text-text-bright">Projects</h1>
          <span className="text-sm text-text-dim">{projects.length} projects</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const colors = getProjectColors(project.name);
            return (
              <button
                key={project.name}
                onClick={() => navigate(`/todos?project=${encodeURIComponent(project.name)}`)}
                className={`text-left p-5 rounded-xl border ${colors.border} ${colors.bg} hover:brightness-110 transition-all group`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className={`text-lg font-semibold ${colors.text}`}>
                    #{project.name}
                  </h2>
                  <ArrowRight className="w-4 h-4 text-text-dim group-hover:text-text-muted transition-colors" />
                </div>

                <div className="text-2xl font-bold text-text-bright mb-1">
                  {project.active} <span className="text-sm font-normal text-text-dim">active tasks</span>
                </div>

                <div className="flex gap-3 text-xs text-text-dim mt-3">
                  {project.inbox > 0 && (
                    <span className="flex items-center gap-1">
                      <Inbox className="w-3 h-3" /> {project.inbox}
                    </span>
                  )}
                  {project.inProgress > 0 && (
                    <span className="flex items-center gap-1">
                      <Play className="w-3 h-3" /> {project.inProgress}
                    </span>
                  )}
                  {project.backlog > 0 && (
                    <span className="flex items-center gap-1">
                      <List className="w-3 h-3" /> {project.backlog}
                    </span>
                  )}
                  {project.blocked > 0 && (
                    <span className="flex items-center gap-1 text-signal-alert">
                      <Ban className="w-3 h-3" /> {project.blocked}
                    </span>
                  )}
                </div>

                {project.done > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border-panel)]">
                    <div className="text-xs text-text-dim">
                      {project.done} completed
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {projects.length === 0 && (
          <div className="text-center py-12 text-text-dim">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No projects yet. Add #project-tag to tasks to organize them.</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
