import { useCallback, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import {
  activeAgentIdAtom,
  kanbanTasksAtom,
  kanbanDirtyAtom,
  kanbanDraggingAtom,
  kanbanFileHashAtom,
  addToastAtom,
} from '@/store/atoms';
import {
  moveTask as apiMoveTask,
  toggleTaskStatus as apiToggleStatus,
  createTask as apiCreateTask,
} from '@/services/api';
import type { KanbanColumnId, KanbanColumns, KanbanTask, TaskStatus } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://lumes-virtual-machine.tailf846b2.ts.net/dashboard-api'
    : 'http://localhost:3001'
);

const EMPTY_COLUMNS: KanbanColumns = {
  'inbox': [],
  'in-progress': [],
  'backlog': [],
  'blocked': [],
  'done': [],
};

export function useKanban() {
  const [agentId] = useAtom(activeAgentIdAtom);
  const [allKanban, setAllKanban] = useAtom(kanbanTasksAtom);
  const [isDirty, setDirty] = useAtom(kanbanDirtyAtom);
  const [isDragging, setDragging] = useAtom(kanbanDraggingAtom);
  const [, setFileHashes] = useAtom(kanbanFileHashAtom);
  const [, addToast] = useAtom(addToastAtom);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const columns = allKanban[agentId] || EMPTY_COLUMNS;

  const setColumns = useCallback((cols: KanbanColumns) => {
    setAllKanban(prev => ({ ...prev, [agentId]: cols }));
  }, [agentId, setAllKanban]);

  // Fetch kanban data from server
  const fetchKanban = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/kanban?agentId=${agentId}`);
      if (!response.ok) return;
      const data = await response.json();
      setColumns(data.columns as KanbanColumns);
      setFileHashes(prev => ({ ...prev, [agentId]: data.fileHash }));
    } catch {
      // Silently fail -- dashboard will show cached data
    }
  }, [agentId, setColumns, setFileHashes]);

  // Load on agent change
  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  const markDirtyWithCooldown = useCallback((newHash: string) => {
    setFileHashes(prev => ({ ...prev, [agentId]: newHash }));
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => {
      setDirty(false);
    }, 2000);
  }, [agentId, setDirty, setFileHashes]);

  const moveTaskAction = useCallback(async (
    taskId: string,
    targetColumn: KanbanColumnId,
    targetIndex?: number,
  ) => {
    // Optimistic update
    const prevColumns = { ...columns };
    const newColumns: KanbanColumns = {
      'inbox': [...columns['inbox']],
      'in-progress': [...columns['in-progress']],
      'backlog': [...columns['backlog']],
      'blocked': [...columns['blocked']],
      'done': [...columns['done']],
    };

    // Find and remove the task from its current column
    let task: KanbanTask | undefined;
    for (const col of Object.keys(newColumns) as KanbanColumnId[]) {
      const idx = newColumns[col].findIndex(t => t.id === taskId);
      if (idx !== -1) {
        task = { ...newColumns[col][idx] };
        newColumns[col].splice(idx, 1);
        break;
      }
    }

    if (!task) return;

    // Update task status based on column
    task.column = targetColumn;
    if (targetColumn === 'done') task.status = 'done';
    else if (task.status === 'done') task.status = 'incomplete';

    // Insert at target position
    const insertAt = targetIndex !== undefined
      ? Math.min(targetIndex, newColumns[targetColumn].length)
      : newColumns[targetColumn].length;
    newColumns[targetColumn].splice(insertAt, 0, task);

    setDirty(true);
    setColumns(newColumns);

    try {
      const result = await apiMoveTask(taskId, agentId, targetColumn, targetIndex);
      markDirtyWithCooldown(result.fileHash);
    } catch (error: any) {
      // Revert
      setColumns(prevColumns);
      setDirty(false);
      addToast({ message: error.message || 'Failed to move task', type: 'error' });
    }
  }, [columns, agentId, setColumns, setDirty, addToast, markDirtyWithCooldown]);

  const toggleStatus = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    // Optimistic update
    const prevColumns = { ...columns };
    const newColumns: KanbanColumns = {
      'inbox': [...columns['inbox']],
      'in-progress': [...columns['in-progress']],
      'backlog': [...columns['backlog']],
      'blocked': [...columns['blocked']],
      'done': [...columns['done']],
    };

    for (const col of Object.keys(newColumns) as KanbanColumnId[]) {
      const idx = newColumns[col].findIndex(t => t.id === taskId);
      if (idx !== -1) {
        newColumns[col][idx] = { ...newColumns[col][idx], status: newStatus };
        break;
      }
    }

    setDirty(true);
    setColumns(newColumns);

    try {
      const result = await apiToggleStatus(taskId, agentId, newStatus);
      markDirtyWithCooldown(result.fileHash);
    } catch (error: any) {
      setColumns(prevColumns);
      setDirty(false);
      addToast({ message: error.message || 'Failed to update task', type: 'error' });
    }
  }, [columns, agentId, setColumns, setDirty, addToast, markDirtyWithCooldown]);

  const addTask = useCallback(async (
    title: string,
    column: KanbanColumnId = 'inbox',
    priority?: 'high' | 'medium' | 'low',
    project?: string,
  ) => {
    // Optimistic update -- create a temp task
    const tempId = `temp-${Date.now()}`;
    const tempTask: KanbanTask = {
      id: tempId,
      agentId,
      title,
      status: 'incomplete',
      priority: priority || 'medium',
      column,
      project,
    };

    const prevColumns = { ...columns };
    const newColumns: KanbanColumns = {
      'inbox': [...columns['inbox']],
      'in-progress': [...columns['in-progress']],
      'backlog': [...columns['backlog']],
      'blocked': [...columns['blocked']],
      'done': [...columns['done']],
    };
    newColumns[column].unshift(tempTask);

    setDirty(true);
    setColumns(newColumns);

    try {
      const result = await apiCreateTask(agentId, title, column, priority, project);
      markDirtyWithCooldown(result.fileHash);
      // Re-fetch to get the real task ID
      await fetchKanban();
      addToast({ message: `Added: ${title}`, type: 'success' });
    } catch (error: any) {
      setColumns(prevColumns);
      setDirty(false);
      addToast({ message: error.message || 'Failed to add task', type: 'error' });
    }
  }, [columns, agentId, setColumns, setDirty, addToast, markDirtyWithCooldown, fetchKanban]);

  return {
    columns,
    moveTask: moveTaskAction,
    toggleStatus,
    addTask,
    isDragging,
    setDragging,
    isDirty,
    fetchKanban,
  };
}
