import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/layout';
import { KanbanBoard } from '@/components/kanban';

export function TodosPage() {
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get('project') || undefined;

  return (
    <PageContainer title="Task Board">
      <KanbanBoard initialProjectFilter={projectFilter} />
    </PageContainer>
  );
}
