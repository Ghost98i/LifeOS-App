import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildGymStarterTemplates,
  GYM_STARTER_PACKS,
  type GymStarterPackId,
} from './gymStarterTemplates';
import { GYM_ICON_REGISTRY, isGymIconName } from './gymIconRegistry';
import { isRoutineIconName } from '../types';
import { defaultState } from './storage';
import { GimnasioView } from '../components/GimnasioView';

test('gymStarterTemplates — contrato RoutineTemplate, 3 series normal, warmup en compuestos, descansos e íconos válidos', () => {
  assert.equal(GYM_STARTER_PACKS.length, 3);
  const packIds: GymStarterPackId[] = ['full-body-3', 'torso-pierna-4', 'split-clasico-5'];
  const allIds = new Set<string>();

  for (const packId of packIds) {
    const firstRun = buildGymStarterTemplates(packId);
    const secondRun = buildGymStarterTemplates(packId);

    const expectedRoutines =
      packId === 'full-body-3' ? 2 : packId === 'torso-pierna-4' ? 4 : 3;
    assert.equal(firstRun.length, expectedRoutines);

    const warmupCount = firstRun
      .flatMap((r) => r.exercises)
      .filter((ex) => ex.sets.some((s) => s.type === 'warmup')).length;
    assert.ok(warmupCount >= 3, `Expected warmup sets in compound exercises for ${packId}`);

    for (const template of [...firstRun, ...secondRun]) {
      assert.ok(template.id && !allIds.has(template.id), `Duplicate routine id: ${template.id}`);
      allIds.add(template.id);
      assert.ok(template.name.trim().length > 0);
      assert.ok(Array.isArray(template.days) && template.days.length > 0);

      const routineIcon = template.appearance?.icon;
      assert.ok(routineIcon, `Missing routine icon for ${template.name}`);
      assert.equal(isRoutineIconName(routineIcon), true, `Invalid RoutineIconName: ${routineIcon}`);
      assert.equal(isGymIconName(routineIcon), true, `Invalid GymIconName for routine: ${routineIcon}`);
      assert.ok(GYM_ICON_REGISTRY[routineIcon].src, `Routine icon has null src: ${routineIcon}`);

      assert.ok(template.exercises.length >= 5, `Expected >=5 exercises in ${template.name}`);
      for (const exercise of template.exercises) {
        assert.ok(exercise.id && !allIds.has(exercise.id), `Duplicate exercise id: ${exercise.id}`);
        allIds.add(exercise.id);
        assert.ok(exercise.equipment, `Missing equipment in ${exercise.name}`);
        assert.ok(exercise.muscleGroup, `Missing muscleGroup in ${exercise.name}`);
        assert.ok(exercise.icon, `Missing icon in ${exercise.name}`);
        assert.equal(isGymIconName(exercise.icon), true, `Invalid exercise GymIconName: ${exercise.icon}`);
        assert.ok(GYM_ICON_REGISTRY[exercise.icon].src, `Exercise icon has null src: ${exercise.icon}`);
        assert.equal(exercise.restSecondsMode, 'custom');
        assert.ok(typeof exercise.restSeconds === 'number' && exercise.restSeconds >= 60);
        assert.ok(typeof exercise.reps === 'string' && exercise.reps.trim().length > 0);

        const normalSets = exercise.sets.filter((s) => s.type === 'normal');
        const warmupSets = exercise.sets.filter((s) => s.type === 'warmup');
        assert.equal(normalSets.length, 3, `Expected exactly 3 normal sets in ${exercise.name}`);
        assert.ok(warmupSets.length <= 1, `Expected at most 1 warmup set in ${exercise.name}`);
        if (warmupSets.length === 1) {
          assert.equal(exercise.sets[0].type, 'warmup', `Warmup set must be first in ${exercise.name}`);
        }

        for (const set of exercise.sets) {
          assert.ok(set.id && !allIds.has(set.id), `Duplicate set id: ${set.id}`);
          allIds.add(set.id);
          assert.equal(set.weight, 0);
          assert.ok(Number.isInteger(set.reps) && set.reps >= 8 && set.reps <= 15);
        }
      }
    }
  }
});

test('gymStarterTemplates — días asignados, warmups y descansos exactos por programa', () => {
  const fullBody = buildGymStarterTemplates('full-body-3');
  assert.deepEqual(
    fullBody.map((r) => [r.name, r.days]),
    [
      ['Full Body A', ['lunes', 'viernes']],
      ['Full Body B', ['miercoles']],
    ]
  );
  assert.equal(fullBody[0].exercises[0].sets[0].type, 'warmup');
  assert.equal(fullBody[0].exercises[0].restSeconds, 120);

  const torsoPierna = buildGymStarterTemplates('torso-pierna-4');
  assert.deepEqual(
    torsoPierna.map((r) => [r.name, r.days]),
    [
      ['Torso A', ['lunes']],
      ['Piernas A', ['martes']],
      ['Torso B', ['jueves']],
      ['Piernas B', ['viernes']],
    ]
  );

  const split = buildGymStarterTemplates('split-clasico-5');
  assert.deepEqual(
    split.map((r) => [r.name, r.days]),
    [
      ['Espalda / Bíceps', ['lunes', 'jueves']],
      ['Pecho / Tríceps', ['martes', 'viernes']],
      ['Piernas', ['miercoles']],
    ]
  );
  for (const routine of split) {
    for (const ex of routine.exercises) {
      assert.equal(ex.restSeconds, 180);
    }
  }
  const hackSquat = split[2].exercises.find((e) => e.name === 'Hack squat');
  assert.ok(hackSquat);
  assert.equal(hackSquat.sets[0].type, 'warmup');
  assert.equal(hackSquat.sets[0].reps, 10);
  assert.equal(hackSquat.sets[1].reps, 9);
});

test('GimnasioView — muestra arranque guiado con Guía rápida cuando no hay rutinas y acceso discreto cuando ya existen', () => {
  const freshState = defaultState();
  freshState.gym.routineTemplates = [];
  freshState.gym.sessions = [];

  const emptyHtml = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state: freshState,
      onUpdateState: () => true,
      storageUserId: null,
      onOpenNote: () => {},
    })
  );

  assert.match(emptyHtml, /Registrar tus cargas y descansos es lo que convierte entrenar en progresar\./);
  assert.match(emptyHtml, /Full Body · 3 días/);
  assert.match(emptyHtml, /Torso \/ Pierna · 4 días/);
  assert.match(emptyHtml, /Split 5 días/);
  assert.match(emptyHtml, /Guía rápida/);
  assert.match(emptyHtml, /Crear mi propia rutina/);
  assert.match(emptyHtml, /Entrenar libre hoy/);

  const populatedState = defaultState();
  populatedState.gym.routineTemplates = buildGymStarterTemplates('full-body-3');

  const populatedTrainHtml = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state: populatedState,
      onUpdateState: () => true,
      storageUserId: null,
      onOpenNote: () => {},
    })
  );
  assert.doesNotMatch(populatedTrainHtml, /data-gym-starter-panel/);

  const populatedRoutinesHtml = renderToStaticMarkup(
    React.createElement(GimnasioView, {
      state: populatedState,
      onUpdateState: () => true,
      storageUserId: null,
      onOpenNote: () => {},
      initialTab: 'entrenar',
      initialEditingTemplateId: populatedState.gym.routineTemplates[0].id,
    })
  );
  assert.match(populatedRoutinesHtml, /Cargar plantilla inicial/);
});
