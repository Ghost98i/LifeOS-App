import type { EffortLevel, LifeOSState } from '../types';

export interface UnifiedTask {
  id: string;
  text: string;
  done: boolean;
  type: 'extra' | 'project_task';
  date?: string;
  dueDate?: string;
  time?: string;
  durationMinutes?: number;
  priority?: 'alta' | 'media' | 'baja';
  effort?: EffortLevel;
  dependsOn: string[];
  projectId?: string;
  projectName?: string;
  linkedType?: 'study' | 'gym' | 'calendar' | 'project' | null;
  linkedId?: string | null;
}

export function getUnifiedTaskList(state: LifeOSState): UnifiedTask[] {
  const list: UnifiedTask[] = [];

  // 1. Standalone today extras
  (state.todayExtras || []).forEach((extra) => {
    list.push({
      id: extra.id,
      text: extra.text,
      done: Boolean(extra.done),
      type: 'extra',
      date: extra.date,
      dueDate: extra.dueDate,
      time: extra.time,
      durationMinutes: extra.durationMinutes,
      priority: extra.priority,
      effort: extra.effort,
      dependsOn: Array.isArray(extra.dependsOn) ? extra.dependsOn : [],
      linkedType: extra.linkedType,
      linkedId: extra.linkedId,
    });
  });

  // 2. Project subtasks
  (state.projects || []).forEach((p) => {
    (p.tasks || []).forEach((t) => {
      list.push({
        id: t.id,
        text: t.text,
        done: Boolean(t.done),
        type: 'project_task',
        dueDate: t.dueDate,
        priority: t.priority || 'media',
        effort: t.effort || 'medium',
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        projectId: p.id,
        projectName: p.name,
      });
    });
  });

  return list;
}

export function getUnifiedTaskMap(
  stateOrList: LifeOSState | UnifiedTask[]
): Map<string, UnifiedTask> {
  const map = new Map<string, UnifiedTask>();
  const list = Array.isArray(stateOrList) ? stateOrList : getUnifiedTaskList(stateOrList);
  for (const task of list) {
    map.set(task.id, task);
  }
  return map;
}

function toMap(
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): Map<string, UnifiedTask> {
  if (allTasks instanceof Map) return allTasks;
  return getUnifiedTaskMap(allTasks);
}

/**
 * Validates whether assigning targetDepIds as dependencies of taskId is valid.
 * Checks for:
 * 1. Self-dependency (taskId depending on itself).
 * 2. Circular dependencies (direct or transitive cycles A -> B -> ... -> A).
 */
export function validateTaskDependencies(
  taskId: string,
  targetDepIds: string[],
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): { valid: boolean; error?: string } {
  const map = toMap(allTasks);

  // 1. Self dependency
  if (targetDepIds.includes(taskId)) {
    return {
      valid: false,
      error: 'Una tarea no puede depender de sí misma.',
    };
  }

  // 2. Cycle detection via DFS
  // A cycle exists if any task in targetDepIds can reach taskId by traversing its dependencies.
  const visited = new Set<string>();

  function reachesTaskId(currentId: string): boolean {
    if (currentId === taskId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const task = map.get(currentId);
    if (!task || !task.dependsOn || task.dependsOn.length === 0) return false;

    for (const nextDepId of task.dependsOn) {
      if (reachesTaskId(nextDepId)) {
        return true;
      }
    }
    return false;
  }

  for (const depId of targetDepIds) {
    visited.clear();
    if (reachesTaskId(depId)) {
      const depName = map.get(depId)?.text || depId;
      return {
        valid: false,
        error: `Dependencia circular detectada con "${depName}".`,
      };
    }
  }

  return { valid: true };
}

/**
 * Checks if a task is currently blocked by at least one pending (incomplete) prerequisite task.
 */
export function isTaskBlocked(
  taskOrId: string | UnifiedTask,
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): boolean {
  const map = toMap(allTasks);
  const task = typeof taskOrId === 'string' ? map.get(taskOrId) : taskOrId;
  if (!task || !task.dependsOn || task.dependsOn.length === 0) return false;

  for (const depId of task.dependsOn) {
    const dep = map.get(depId);
    if (dep && !dep.done) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the list of incomplete tasks that are currently blocking this task.
 */
export function getBlockingTasks(
  taskOrId: string | UnifiedTask,
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): UnifiedTask[] {
  const map = toMap(allTasks);
  const task = typeof taskOrId === 'string' ? map.get(taskOrId) : taskOrId;
  if (!task || !task.dependsOn || task.dependsOn.length === 0) return [];

  const blocking: UnifiedTask[] = [];
  for (const depId of task.dependsOn) {
    const dep = map.get(depId);
    if (dep && !dep.done) {
      blocking.push(dep);
    }
  }
  return blocking;
}

/**
 * Returns tasks that directly depend on the specified taskId and are still incomplete.
 */
export function getDirectDependents(
  taskId: string,
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): UnifiedTask[] {
  const map = toMap(allTasks);
  const dependents: UnifiedTask[] = [];

  for (const task of map.values()) {
    if (!task.done && task.dependsOn.includes(taskId)) {
      dependents.push(task);
    }
  }

  return dependents;
}

/**
 * Calculates how many tasks would become completely unblocked if taskId is completed.
 */
export function getUnblockedCountIfCompleted(
  taskId: string,
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): number {
  const map = toMap(allTasks);
  const directDependents = getDirectDependents(taskId, map);
  let count = 0;

  for (const dependent of directDependents) {
    const otherBlockers = dependent.dependsOn.filter((id) => id !== taskId);
    const stillBlocked = otherBlockers.some((id) => {
      const dep = map.get(id);
      return dep && !dep.done;
    });
    if (!stillBlocked) {
      count++;
    }
  }

  return count;
}

/**
 * Checks whether a task can be toggled without unfulfilled dependencies.
 */
export function canToggleTask(
  taskId: string,
  allTasks: Map<string, UnifiedTask> | UnifiedTask[] | LifeOSState
): { allowed: boolean; blockingTasks: UnifiedTask[] } {
  const blockingTasks = getBlockingTasks(taskId, allTasks);
  return {
    allowed: blockingTasks.length === 0,
    blockingTasks,
  };
}

/**
 * Strips out dependency IDs that no longer exist in the system (e.g. deleted entities).
 */
export function cleanDanglingDependencies(
  dependsOn: string[] | undefined,
  existingIds: Set<string>
): string[] {
  if (!Array.isArray(dependsOn)) return [];
  return dependsOn.filter((id) => existingIds.has(id));
}
