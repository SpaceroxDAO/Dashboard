import { PageContainer } from '@/components/layout';
import { KanbanBoard } from '@/components/kanban';

export function TodosPage() {
  return (
    <PageContainer title="Task Board">
      <KanbanBoard />
    </PageContainer>
  );
}
