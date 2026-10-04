import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTaskDependencies,
  isTaskBlocked,
  getBlockingTasks,
  getDirectDependents,
  getUnblockedCountIfCompleted,
  canToggleTask,
  cleanDanglingDependencies,
  type UnifiedTask,
} from './taskDependencies';

function makeTask(
  id: string,
  text: string,
  done: boolean,
  dependsOn: string[] = []
): UnifiedTask {
  return {
    id,
    text,
    done,
    type: 'extra',
    dependsOn,
  };
}

test('validateTaskDependencies: rejects self-dependency', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['t1', makeTask('t1', 'Tarea 1', false)],
  ]);

  const res = validateTaskDependencies('t1', ['t1'], tasks);
  assert.equal(res.valid, false);
  assert.match(res.error || '', /no puede depender de sí misma/i);
});

test('validateTaskDependencies: allows valid linear dependency', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['t1', makeTask('t1', 'Comprar pintura', false)],
    ['t2', makeTask('t2', 'Pintar pared', false)],
  ]);

  const res = validateTaskDependencies('t2', ['t1'], tasks);
  assert.equal(res.valid, true);
  assert.equal(res.error, undefined);
});

test('validateTaskDependencies: detects direct circular dependency (A -> B -> A)', () => {
  // t1 depends on t2. If we try to make t2 depend on t1, it must be rejected!
  const tasks = new Map<string, UnifiedTask>([
    ['t1', makeTask('t1', 'Tarea 1', false, ['t2'])],
    ['t2', makeTask('t2', 'Tarea 2', false, [])],
  ]);

  const res = validateTaskDependencies('t2', ['t1'], tasks);
  assert.equal(res.valid, false);
  assert.match(res.error || '', /dependencia circular/i);
});

test('validateTaskDependencies: detects transitive circular dependency (A -> B -> C -> A)', () => {
  // t1 depends on t2, t2 depends on t3.
  // If we try to make t3 depend on t1:
  const tasks = new Map<string, UnifiedTask>([
    ['t1', makeTask('t1', 'Paso 1', false, ['t2'])],
    ['t2', makeTask('t2', 'Paso 2', false, ['t3'])],
    ['t3', makeTask('t3', 'Paso 3', false, [])],
  ]);

  const res = validateTaskDependencies('t3', ['t1'], tasks);
  assert.equal(res.valid, false);
  assert.match(res.error || '', /dependencia circular/i);
});

test('isTaskBlocked: returns true when any dependency is incomplete', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['dep1', makeTask('dep1', 'Dependencia 1', true)],
    ['dep2', makeTask('dep2', 'Dependencia 2', false)],
    ['target', makeTask('target', 'Tarea final', false, ['dep1', 'dep2'])],
  ]);

  assert.equal(isTaskBlocked('target', tasks), true);
  const blockers = getBlockingTasks('target', tasks);
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].id, 'dep2');
});

test('isTaskBlocked: returns false when all dependencies are completed', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['dep1', makeTask('dep1', 'Dependencia 1', true)],
    ['dep2', makeTask('dep2', 'Dependencia 2', true)],
    ['target', makeTask('target', 'Tarea final', false, ['dep1', 'dep2'])],
  ]);

  assert.equal(isTaskBlocked('target', tasks), false);
  assert.equal(getBlockingTasks('target', tasks).length, 0);
});

test('isTaskBlocked: returns false if dependency is missing/deleted', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['target', makeTask('target', 'Tarea final', false, ['deleted-task-id'])],
  ]);

  assert.equal(isTaskBlocked('target', tasks), false);
});

test('getDirectDependents & getUnblockedCountIfCompleted: correctly calculates unblocked impact', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['depA', makeTask('depA', 'Preparar base', false)],
    ['child1', makeTask('child1', 'Subtarea 1', false, ['depA'])],
    ['otherDep', makeTask('otherDep', 'Otra cosa', false)],
    ['child2', makeTask('child2', 'Subtarea 2', false, ['depA', 'otherDep'])],
  ]);

  const direct = getDirectDependents('depA', tasks);
  assert.equal(direct.length, 2);

  // If depA is completed:
  // - child1 only depends on depA -> becomes unblocked!
  // - child2 depends on depA and otherDep (incomplete) -> remains blocked!
  // So unblocked count must be exactly 1.
  const unblockedCount = getUnblockedCountIfCompleted('depA', tasks);
  assert.equal(unblockedCount, 1);
});

test('canToggleTask: warns if blocked', () => {
  const tasks = new Map<string, UnifiedTask>([
    ['dep', makeTask('dep', 'Requisito', false)],
    ['task', makeTask('task', 'Objetivo', false, ['dep'])],
  ]);

  const check = canToggleTask('task', tasks);
  assert.equal(check.allowed, false);
  assert.equal(check.blockingTasks.length, 1);
  assert.equal(check.blockingTasks[0].text, 'Requisito');
});

test('cleanDanglingDependencies: filters out dead IDs', () => {
  const existing = new Set(['id1', 'id2']);
  const cleaned = cleanDanglingDependencies(['id1', 'deadId', 'id2', 'unknown'], existing);
  assert.deepEqual(cleaned, ['id1', 'id2']);
});
