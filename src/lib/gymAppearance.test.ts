import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRoutineIdentity,
  inferAutomaticRoutineIdentity,
  ROUTINE_ICON_OPTIONS,
  shouldShowRoutineCategory,
} from './gymAppearance';
import {
  duplicateGymTemplate,
  startGymSession,
  updateGymTemplate,
} from './gymFlows';
import { migrateGym } from './gymMigration';
import { mergeGymState, stampGymMutation } from './gymSync';
import type { Gym, RoutineTemplate } from '../types';

function createGymWithTemplate(template: Partial<RoutineTemplate> = {}): Gym {
  const tpl: RoutineTemplate = {
    id: template.id || 'tpl-chest',
    name: template.name || 'Pecho y Tríceps',
    days: template.days || ['lunes'],
    exercises: template.exercises || [
      { id: 'ex-1', name: 'Press banca', muscleGroup: 'Pecho', sets: [] },
      { id: 'ex-2', name: 'Aperturas', muscleGroup: 'Pecho', sets: [] },
    ],
    ...(template.appearance ? { appearance: template.appearance } : {}),
  };
  return {
    sessions: [],
    weight: [],
    measurements: [],
    routineTemplates: [tpl],
    restDays: [],
    activeTimer: null,
  };
}

test('legacy → auto: plantilla sin metadata visual se comporta como auto', () => {
  const legacyData = {
    routineTemplates: [
      {
        id: 'legacy-1',
        name: 'Piernas intensas',
        exercises: [{ name: 'Sentadilla', muscleGroup: 'Piernas', reps: '4x10' }],
      },
    ],
  };
  const migrated = migrateGym(legacyData);
  const template = migrated.routineTemplates[0];

  assert.equal(template.appearance, undefined);
  const identity = getRoutineIdentity(template.exercises, template.name, template.appearance);
  assert.equal(identity.isCustomIcon, false);
  assert.equal(identity.icon, 'activity'); // Piernas -> activity
});

test('auto mantiene icono derivado según musculatura dominante y nombre', () => {
  const chestIdentity = inferAutomaticRoutineIdentity(
    [{ id: '1', name: 'Press banca', muscleGroup: 'Pecho', sets: [] }],
    'Rutina A'
  );
  assert.equal(chestIdentity.icon, 'target');
  assert.equal(chestIdentity.label, 'Pecho');

  const backIdentity = inferAutomaticRoutineIdentity(
    [{ id: '2', name: 'Dominadas', muscleGroup: 'Espalda', sets: [] }],
    'Rutina B'
  );
  assert.equal(backIdentity.icon, 'repeat');
  assert.equal(backIdentity.label, 'Espalda');

  const legsIdentity = inferAutomaticRoutineIdentity(
    [{ id: '3', name: 'Sentadilla', muscleGroup: 'Piernas', sets: [] }],
    'Rutina C'
  );
  assert.equal(legsIdentity.icon, 'activity');
  assert.equal(legsIdentity.label, 'Piernas');

  const coreIdentity = inferAutomaticRoutineIdentity(
    [{ id: '4', name: 'Plancha', muscleGroup: 'Core', sets: [] }],
    'Rutina D'
  );
  assert.equal(coreIdentity.icon, 'shield');
  assert.equal(coreIdentity.label, 'Core');

  const defaultIdentity = inferAutomaticRoutineIdentity(
    [{ id: '5', name: 'Movilidad general', muscleGroup: 'Otros', sets: [] }],
    'General'
  );
  assert.equal(defaultIdentity.icon, 'dumbbell');
});

test('override persiste: asignar icono personalizable actualiza el template y se duplica limpiamente', () => {
  const gym = createGymWithTemplate();
  assert.equal(gym.routineTemplates[0].appearance, undefined);

  const updated = updateGymTemplate(gym, 'tpl-chest', {
    appearance: { icon: 'zap' },
  });
  assert.equal(updated, true);
  assert.deepEqual(gym.routineTemplates[0].appearance, { icon: 'zap' });

  const duplicated = duplicateGymTemplate(gym, 'tpl-chest');
  assert.ok(duplicated);
  assert.deepEqual(duplicated.appearance, { icon: 'zap' });
  assert.notEqual(duplicated.appearance, gym.routineTemplates[0].appearance);
});

test('override gana sobre auto: si existe override se usa el icono elegido', () => {
  const gym = createGymWithTemplate({
    appearance: { icon: 'flame' },
  });
  const template = gym.routineTemplates[0];

  const identity = getRoutineIdentity(template.exercises, template.name, template.appearance);
  assert.equal(identity.isCustomIcon, true);
  assert.equal(identity.icon, 'flame');
  assert.equal(identity.label, 'Pecho'); // Preserva pertenencia muscular
});

test('volver a auto elimina override limpiamente', () => {
  const gym = createGymWithTemplate({
    appearance: { icon: 'trophy' },
  });
  assert.deepEqual(gym.routineTemplates[0].appearance, { icon: 'trophy' });

  // Revertir a auto pasando appearance: null
  const resetSuccess = updateGymTemplate(gym, 'tpl-chest', { appearance: null });
  assert.equal(resetSuccess, true);
  assert.equal('appearance' in gym.routineTemplates[0], false);
  assert.equal(gym.routineTemplates[0].appearance, undefined);

  const identity = getRoutineIdentity(
    gym.routineTemplates[0].exercises,
    gym.routineTemplates[0].name,
    gym.routineTemplates[0].appearance
  );
  assert.equal(identity.isCustomIcon, false);
  assert.equal(identity.icon, 'target'); // Regresa a auto
});

test('sync concurrente converge con semántica Lamport y aisla la apariencia', () => {
  const base = createGymWithTemplate();
  const baseCloneA = structuredClone(base);
  const baseCloneB = structuredClone(base);

  // Device A asigna icono 'trophy'
  updateGymTemplate(baseCloneA, 'tpl-chest', { appearance: { icon: 'trophy' } });
  stampGymMutation(base, baseCloneA, 'device-a');

  // Device B asigna icono 'scale'
  updateGymTemplate(baseCloneB, 'tpl-chest', { appearance: { icon: 'scale' } });
  stampGymMutation(base, baseCloneB, 'device-b');

  const mergedAB = mergeGymState(baseCloneA, baseCloneB, base);
  const mergedBA = mergeGymState(baseCloneB, baseCloneA, base);

  // Convergencia determinista y conmutativa
  assert.equal(mergedAB.routineTemplates.length, 1);
  assert.deepEqual(mergedAB.routineTemplates[0].appearance, mergedBA.routineTemplates[0].appearance);
  assert.ok(
    mergedAB.routineTemplates[0].appearance?.icon === 'trophy' ||
    mergedAB.routineTemplates[0].appearance?.icon === 'scale'
  );

  // Sesiones no fueron tocadas por el merge de plantillas
  assert.equal(mergedAB.sessions.length, 0);
});

test('apariencia no altera snapshots históricos de sesiones ya creadas', () => {
  const gym = createGymWithTemplate();
  const { session } = startGymSession(gym, {
    templateId: 'tpl-chest',
    date: '2026-10-08',
    startedAt: '10:00:00',
  });

  const sessionExercisesSnapshot = structuredClone(session.exercises);

  // Modificar apariencia de la rutina
  updateGymTemplate(gym, 'tpl-chest', { appearance: { icon: 'sparkles' } });
  assert.deepEqual(gym.routineTemplates[0].appearance, { icon: 'sparkles' });

  // La sesión histórica mantiene sus ejercicios y propiedades sin alteración
  assert.deepEqual(session.exercises, sessionExercisesSnapshot);
  assert.equal((session as unknown as Record<string, unknown>).appearance, undefined);

  // Revertir plantilla a auto tampoco altera la sesión existente
  updateGymTemplate(gym, 'tpl-chest', { appearance: null });
  assert.deepEqual(session.exercises, sessionExercisesSnapshot);
});

test('limpieza de redundancias en metadata de rutinas', () => {
  // Redundancias exactas o de raíz plural/singular deben ocultarse
  assert.equal(shouldShowRoutineCategory('Pecho', 'Pecho'), false);
  assert.equal(shouldShowRoutineCategory('Espalda', 'Espalda'), false);
  assert.equal(shouldShowRoutineCategory('Pierna', 'Piernas'), false);
  assert.equal(shouldShowRoutineCategory('Piernas', 'Piernas'), false);
  assert.equal(shouldShowRoutineCategory('Pecho y Tríceps', 'Pecho'), false);
  assert.equal(shouldShowRoutineCategory('Rutina de Espalda', 'Espalda'), false);
  assert.equal(shouldShowRoutineCategory('Full Body', 'Entrenamiento'), false);

  // Casos informativos reales no redundantes deben mostrarse
  assert.equal(shouldShowRoutineCategory('Día 1', 'Pecho'), true);
  assert.equal(shouldShowRoutineCategory('Fuerza A', 'Espalda'), true);
  assert.equal(shouldShowRoutineCategory('Torsos y Brazos', 'Piernas'), true);
});

test('catálogo de iconos curados no contiene emojis y todos son válidos', () => {
  assert.ok(ROUTINE_ICON_OPTIONS.length >= 8 && ROUTINE_ICON_OPTIONS.length <= 12);
  for (const opt of ROUTINE_ICON_OPTIONS) {
    assert.match(opt.name, /^[a-zA-Z0-9]+$/);
    assert.ok(opt.label.length > 0);
  }
});

test('iconos desconocidos no rompen la app y caen limpiamente a auto sin generar metadata', () => {
  // 1. En getRoutineIdentity con icono desconocido
  const invalidAppearance = { icon: 'alien_ufo_unsupported' as unknown as any };
  const identity = getRoutineIdentity(
    [{ id: '1', name: 'Press banca', muscleGroup: 'Pecho', sets: [] }],
    'Pecho',
    invalidAppearance
  );
  assert.equal(identity.isCustomIcon, false);
  assert.equal(identity.icon, 'target'); // Cae al heurístico automático de pecho

  // 2. En migración de datos con icono desconocido
  const legacyWithUnknown = {
    routineTemplates: [
      {
        id: 'legacy-unknown',
        name: 'Piernas',
        exercises: [{ name: 'Sentadilla', muscleGroup: 'Piernas' }],
        appearance: { icon: 'super_custom_unknown_icon' },
      },
    ],
  };
  const migrated = migrateGym(legacyWithUnknown);
  assert.equal(migrated.routineTemplates[0].appearance, undefined);
  assert.equal(migrated._sync, undefined); // No genera metadata por leer/migrar

  // 3. En updateGymTemplate con icono inválido
  const gym = createGymWithTemplate({ appearance: { icon: 'zap' } });
  updateGymTemplate(gym, 'tpl-chest', { appearance: { icon: 'non_existent_icon' as any } });
  assert.equal(gym.routineTemplates[0].appearance, undefined);

  // 4. En mergeGymState con icono desconocido proveniente de remote
  const base = createGymWithTemplate();
  const remote = createGymWithTemplate();
  (remote.routineTemplates[0] as any).appearance = { icon: 'unknown_remote_icon' };
  const merged = mergeGymState(base, remote, base);
  assert.equal(merged.routineTemplates[0].appearance, undefined);
});

