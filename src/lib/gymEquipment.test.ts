import assert from 'node:assert/strict';
import test from 'node:test';
import type { GymSession, RoutineTemplate } from '../types';
import {
  inferExerciseEquipment,
  migrateExercise,
  normalizeAllGymSessions,
  propagateExerciseConfiguration,
} from './gymMigration';

test('inferExerciseEquipment clasifica mancuernas correctamente y asigna 0 kg de barra', () => {
  const ex1 = inferExerciseEquipment('Elevaciones laterales con mancuernas');
  assert.equal(ex1.equipment, 'mancuerna');
  assert.equal(ex1.barWeight, 0);

  const ex2 = inferExerciseEquipment('Aperturas con mancuernas');
  assert.equal(ex2.equipment, 'mancuerna');
  assert.equal(ex2.barWeight, 0);

  const ex3 = inferExerciseEquipment('Curl martillo con mancuerna');
  assert.equal(ex3.equipment, 'mancuerna');
  assert.equal(ex3.barWeight, 0);
});

test('inferExerciseEquipment clasifica poleas y cables correctamente con 0 kg de barra', () => {
  const ex1 = inferExerciseEquipment('Jalón al pecho en polea');
  assert.equal(ex1.equipment, 'polea');
  assert.equal(ex1.barWeight, 0);

  const ex2 = inferExerciseEquipment('Extensión de tríceps en polea');
  assert.equal(ex2.equipment, 'polea');
  assert.equal(ex2.barWeight, 0);

  const ex3 = inferExerciseEquipment('Face pull en polea');
  assert.equal(ex3.equipment, 'polea');
  assert.equal(ex3.barWeight, 0);
});

test('inferExerciseEquipment clasifica máquinas y peso corporal', () => {
  const ex1 = inferExerciseEquipment('Prensa de piernas 45');
  assert.equal(ex1.equipment, 'maquina');
  assert.equal(ex1.barWeight, 0);

  const ex2 = inferExerciseEquipment('Dominadas pronas');
  assert.equal(ex2.equipment, 'corporal');
  assert.equal(ex2.barWeight, 0);

  const ex3 = inferExerciseEquipment('Fondos en paralelas');
  assert.equal(ex3.equipment, 'corporal');
  assert.equal(ex3.barWeight, 0);
});

test('inferExerciseEquipment clasifica barras con sus respectivos pesos estándar', () => {
  const ex1 = inferExerciseEquipment('Press banca plano con barra');
  assert.equal(ex1.equipment, 'barra');
  assert.equal(ex1.barWeight, 20);

  const ex2 = inferExerciseEquipment('Sentadilla trasera');
  assert.equal(ex2.equipment, 'barra');
  assert.equal(ex2.barWeight, 20);

  const ex3 = inferExerciseEquipment('Press francés con barra W');
  assert.equal(ex3.equipment, 'barra');
  assert.equal(ex3.barWeight, 10);
});

test('migrateExercise auto-corrige ejercicios de mancuerna heredados con barWeight 20 a 0', () => {
  const migrated = migrateExercise(
    {
      name: 'Elevaciones laterales',
      barWeight: 20,
      sets: [{ reps: 12, weight: 10 }],
    },
    'session-1',
    0
  );

  assert.equal(migrated.equipment, 'mancuerna');
  assert.equal(migrated.barWeight, 0);
  assert.equal(migrated.sets[0].weight, 10);
});

test('normalizeAllGymSessions actualiza en lote todo un mes de sesiones históricas', () => {
  const pastSessions: GymSession[] = [
    {
      id: 's-1',
      date: '2026-08-15',
      exercises: [
        { id: 'e1', name: 'Elevaciones laterales con mancuernas', barWeight: 20, sets: [{ id: 'set1', weight: 8, reps: 12 }] },
        { id: 'e2', name: 'Press banca', barWeight: 20, sets: [{ id: 'set2', weight: 80, reps: 8 }] },
        { id: 'e3', name: 'Extensión de tríceps en polea', barWeight: 20, sets: [{ id: 'set3', weight: 25, reps: 15 }] },
      ],
    },
    {
      id: 's-2',
      date: '2026-08-20',
      exercises: [
        { id: 'e4', name: 'Aperturas con mancuernas', barWeight: 20, sets: [{ id: 'set4', weight: 14, reps: 10 }] },
      ],
    },
  ];

  const result = normalizeAllGymSessions(pastSessions);
  assert.ok(result.affectedCount >= 3);

  const s1 = result.updatedSessions[0];
  assert.equal(s1.exercises[0].equipment, 'mancuerna');
  assert.equal(s1.exercises[0].barWeight, 0);

  assert.equal(s1.exercises[1].equipment, 'barra');
  assert.equal(s1.exercises[1].barWeight, 20);

  assert.equal(s1.exercises[2].equipment, 'polea');
  assert.equal(s1.exercises[2].barWeight, 0);

  const s2 = result.updatedSessions[1];
  assert.equal(s2.exercises[0].equipment, 'mancuerna');
  assert.equal(s2.exercises[0].barWeight, 0);
});

test('propagateExerciseConfiguration aplica cambios de equipamiento y barra retroactivamente a sesiones y plantillas', () => {
  const sessions: GymSession[] = [
    {
      id: 's-old',
      date: '2026-08-01',
      exercises: [
        { id: 'e-old', name: 'Curl de bíceps', barWeight: 20, sets: [{ id: 'st1', weight: 15, reps: 10 }] },
      ],
    },
  ];

  const templates: RoutineTemplate[] = [
    {
      id: 't-1',
      name: 'Brazos',
      exercises: [
        { id: 'te-1', name: 'Curl de bíceps', barWeight: 20, sets: [] },
      ],
    },
  ];

  const prop = propagateExerciseConfiguration(sessions, templates, 'Curl de bíceps', {
    equipment: 'mancuerna',
    barWeight: 0,
    muscleGroup: 'Brazos',
  });

  assert.equal(prop.affectedSessions, 1);
  assert.equal(prop.updatedSessions[0].exercises[0].equipment, 'mancuerna');
  assert.equal(prop.updatedSessions[0].exercises[0].barWeight, 0);
  assert.equal(prop.updatedTemplates[0].exercises[0].equipment, 'mancuerna');
  assert.equal(prop.updatedTemplates[0].exercises[0].barWeight, 0);
});
