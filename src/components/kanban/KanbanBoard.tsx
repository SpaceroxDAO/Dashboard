import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Filter } from 'lucide-react';
import { useKanban } from '@/hooks/useKanban';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import type { KanbanColumnId, KanbanColumns, KanbanTask } from '@/types';

const COLUMN_ORDER: KanbanColumnId[] = ['inbox', 'in-progress', 'backlog', 'blocked', 'done'];

export function KanbanBoard() {
  const { columns, moveTask, toggleStatus, addTask, setDragging } = useKanban();
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  // Extract all unique projects from all columns
  const allProjects = useMemo(() => {
    const projects = new Set<string>();
    for (const col of COLUMN_ORDER) {
      for (const task of columns[col]) {
        if (task.project) projects.add(task.project);
      }
    }
    return Array.from(projects).sort();
  }, [columns]);

  // Filter columns
  const filteredColumns = useMemo(() => {
    if (!projectFilter) return columns;
    const filtered: KanbanColumns = {
      'inbox': [], 'in-progress': [], 'backlog': [], 'blocked': [], 'done': [],
    };
    for (const col of COLUMN_ORDER) {
      filtered[col] = columns[col].filter(t => t.project === projectFilter);
    }
    return filtered;
  }, [columns, projectFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Find which column a task ID belongs to
  const findColumn = useCallback((taskId: string): KanbanColumnId | null => {
    for (const col of COLUMN_ORDER) {
      if (columns[col].some(t => t.id === taskId)) return col;
    }
    return null;
  }, [columns]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const sourceCol = findColumn(active.id as string);
    if (sourceCol) {
      const task = columns[sourceCol].find(t => t.id === active.id);
      if (task) setActiveTask(task);
    }
    setDragging(true);
  }, [columns, findColumn, setDragging]);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual feedback is handled by droppable isOver state
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setDragging(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Determine target column -- over.id can be a column id or a task id
    let targetColumn: KanbanColumnId;
    let targetIndex: number | undefined;

    if (COLUMN_ORDER.includes(overId as KanbanColumnId)) {
      // Dropped on column itself
      targetColumn = overId as KanbanColumnId;
    } else {
      // Dropped over another task -- find its column
      const overCol = findColumn(overId);
      if (!overCol) return;
      targetColumn = overCol;
      targetIndex = columns[overCol].findIndex(t => t.id === overId);
    }

    const sourceColumn = findColumn(activeId);
    if (!sourceColumn) return;

    // No-op if same position
    if (sourceColumn === targetColumn) {
      const sourceIdx = columns[sourceColumn].findIndex(t => t.id === activeId);
      if (targetIndex === undefined || sourceIdx === targetIndex) return;
    }

    moveTask(activeId, targetColumn, targetIndex);
  }, [columns, findColumn, moveTask, setDragging]);

  const handleDragCancel = useCallback(() => {
    setActiveTask(null);
    setDragging(false);
  }, [setDragging]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {allProjects.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-text-dim" />
          <button
            onClick={() => setProjectFilter(null)}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              !projectFilter ? 'bg-signal-primary/20 text-signal-primary' : 'text-text-dim hover:text-text-muted'
            }`}
          >
            All
          </button>
          {allProjects.map(proj => (
            <button
              key={proj}
              onClick={() => setProjectFilter(projectFilter === proj ? null : proj)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                projectFilter === proj ? 'bg-signal-primary/20 text-signal-primary' : 'text-text-dim hover:text-text-muted'
              }`}
            >
              #{proj}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {COLUMN_ORDER.map((colId) => (
          <KanbanColumn
            key={colId}
            id={colId}
            tasks={filteredColumns[colId]}
            onToggle={toggleStatus}
            onAddTask={addTask}
            maxVisible={colId === 'done' ? 15 : undefined}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 opacity-90">
            <KanbanCard task={activeTask} onToggle={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
