import type { LifeOSState, Project, ProjectTask, TodayExtra } from '../types';
import { todayISO, uid } from './storage';

export interface SendProjectToTodayResult {
  added: boolean;
  reason?: 'empty' | 'duplicate' | 'already_due_today' | 'completed';
  extra?: TodayExtra;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

function hasDuplicateProjectExtraToday(
  extras: TodayExtra[],
  projectId: string,
  text: string,
  todayIso: string
): boolean {
  const needle = normalizeText(text);
  return extras.some(
    (extra) =>
      extra.date === todayIso &&
      !extra.done &&
      normalizeText(extra.text) === needle &&
      (extra.linkedType === 'project' ? extra.linkedId === projectId : true)
  );
}

/**
 * Sends a project's `nextStep` to `state.todayExtras` with explicit project traceability
 * (`linkedType: 'project'`, `linkedId: project.id`), avoiding duplicates on the same day.
 */
export function sendProjectNextStepToToday(
  state: LifeOSState,
  project: Project,
  todayIso: string = todayISO(),
  createId: () => string = uid
): SendProjectToTodayResult {
  const cleanStep = (project.nextStep || '').trim();
  if (!cleanStep) return { added: false, reason: 'empty' };

  if (!Array.isArray(state.todayExtras)) state.todayExtras = [];
  const text = `[${project.name}] ${cleanStep}`;

  if (hasDuplicateProjectExtraToday(state.todayExtras, project.id, text, todayIso)) {
    return { added: false, reason: 'duplicate' };
  }

  const extra: TodayExtra = {
    id: createId(),
    date: todayIso,
    text,
    priority: 'alta',
    done: false,
    effort: 'medium',
    linkedType: 'project',
    linkedId: project.id,
  };
  state.todayExtras.push(extra);
  return { added: true, extra };
}

/**
 * Sends an incomplete `ProjectTask` to `state.todayExtras` with explicit project traceability
 * (`linkedType: 'project'`, `linkedId: project.id`), avoiding duplicates on the same day
 * or when the task is already scheduled for today via `dueDate`.
 */
export function sendProjectTaskToToday(
  state: LifeOSState,
  project: Project,
  task: ProjectTask,
  todayIso: string = todayISO(),
  createId: () => string = uid
): SendProjectToTodayResult {
  if (task.done) return { added: false, reason: 'completed' };
  const cleanText = (task.text || '').trim();
  if (!cleanText) return { added: false, reason: 'empty' };
  if (task.dueDate === todayIso) return { added: false, reason: 'already_due_today' };

  if (!Array.isArray(state.todayExtras)) state.todayExtras = [];
  const text = `[${project.name}] ${cleanText}`;

  if (hasDuplicateProjectExtraToday(state.todayExtras, project.id, text, todayIso)) {
    return { added: false, reason: 'duplicate' };
  }

  const extra: TodayExtra = {
    id: createId(),
    date: todayIso,
    text,
    priority: task.priority || 'media',
    done: false,
    effort: task.effort || 'medium',
    linkedType: 'project',
    linkedId: project.id,
  };
  state.todayExtras.push(extra);
  return { added: true, extra };
}
