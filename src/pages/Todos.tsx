import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout';
import { KanbanBoard, HermesKanban } from '@/components/kanban';

export function TodosPage() {
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get('project') || undefined;

  return (
    <PageContainer title="Task Board">
      <div className="space-y-4">
        <HermesKanban />
        <KanbanBoard initialProjectFilter={projectFilter} />
      </div>
    </PageContainer>
  );
}
