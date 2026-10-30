import type { LifeOSState, ViewType } from '../types';
import { getUnifiedTaskList } from './taskDependencies';
import { isModuleEnabled } from './moduleVisibility';

export interface AgendaTaskReference { source: 'extra' | 'project_task'; id: string; projectId?: string; }
export interface DatedAgendaTask extends AgendaTaskReference {
  key: string;
  name: string;
  date: string;
  scheduledDate?: string;
  dueDate?: string;
  time?: string;
  done: boolean;
  isDeadline: boolean;
  projectName?: string;
}

/** Exact recorded local dates only; never infer a date or a financial intent from a title. */
export function getDatedAgendaTasks(state: LifeOSState, date: string): DatedAgendaTask[] {
  if (!isModuleEnabled(state, 'agenda')) return [];
  const tasks = new Map<string, DatedAgendaTask>();
  for (const task of getUnifiedTaskList(state)) {
    if (task.type === 'project_task' && !isModuleEnabled(state, 'notas')) continue;
    if (task.date !== date && task.dueDate !== date) continue;
    const key = `${task.type}-${task.projectId || ''}-${task.id}`;
    if (tasks.has(key)) continue;
    tasks.set(key, { key, source: task.type, id: task.id, projectId: task.projectId, projectName: task.projectName, name: task.text,
      date, scheduledDate: task.date, dueDate: task.dueDate, time: task.date === date ? task.time : undefined, done: task.done, isDeadline: task.dueDate === date });
  }
  return [...tasks.values()];
}

export function datedTaskDestination(task: AgendaTaskReference): { view: ViewType; options: { tab?: string; focusId: string } } {
  return task.source === 'extra'
    ? { view: 'dashboard', options: { focusId: `today-extra-${task.id}` } }
    : { view: 'notas', options: { tab: 'proyectos', focusId: `project-task-${task.id}` } };
}

export function agendaTaskFocusId(task: AgendaTaskReference, date: string): string {
  return `agenda-task-${task.source}-${task.id}-${date}`;
}
