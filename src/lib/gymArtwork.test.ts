import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGymArtworkKind } from '../components/visual/GymExerciseArtwork';
import { getRoutineIdentity } from './gymAppearance';
import { GYM_ICON_DEFINITIONS, GYM_ICON_REGISTRY } from './gymIconRegistry';
import { inferExerciseEquipment, inferMuscleGroup } from './gymMigration';

test('Gym V1 maps only high-confidence movement and equipment matches', () => {
  assert.equal(resolveGymArtworkKind('Press banca', 'barra'), 'gym-bench-press');
  assert.equal(resolveGymArtworkKind('Press banca inclinado', 'barra'), 'gym-incline-bench-press');
  assert.equal(resolveGymArtworkKind('Jalón al pecho', 'polea'), 'gym-lat-pulldown');
  assert.equal(resolveGymArtworkKind('Remo en polea baja', 'polea'), 'gym-seated-row');
  assert.equal(resolveGymArtworkKind('Pec deck', 'maquina'), 'gym-pec-deck');
  assert.equal(resolveGymArtworkKind('Prensa de piernas', 'maquina'), 'gym-leg-press');
  assert.equal(resolveGymArtworkKind('Press de hombros sentado', 'maquina'), 'gym-shoulder-press');
  assert.equal(resolveGymArtworkKind('Dominadas', 'corporal'), 'gym-pull-ups');
  assert.equal(resolveGymArtworkKind('Fondos en paralelas', 'corporal'), 'gym-power-tower');
  assert.equal(resolveGymArtworkKind('Peso muerto rumano', 'barra'), 'gym-deadlift');
  assert.equal(resolveGymArtworkKind('Curl martillo', 'mancuerna'), 'gym-curls');
  assert.equal(resolveGymArtworkKind('Curl predicador', 'barra'), 'gym-biceps');
  assert.equal(resolveGymArtworkKind('Press francés', 'barra'), 'gym-triceps');
  assert.equal(resolveGymArtworkKind('Flexiones de brazos', 'corporal'), 'gym-pushups');
  assert.equal(resolveGymArtworkKind('Plancha abdominal', 'corporal'), 'gym-plank');
  assert.equal(resolveGymArtworkKind('Crunch abdominal', 'corporal'), 'gym-abs');
  assert.equal(resolveGymArtworkKind('Estiramiento', 'corporal'), 'gym-stretching');
  assert.equal(resolveGymArtworkKind('Clean and jerk', 'barra'), 'gym-weightlifting');
  assert.equal(resolveGymArtworkKind('Chest press en máquina', 'maquina'), 'gym-torso');
  assert.equal(resolveGymArtworkKind('Curl femoral acostado', 'maquina'), 'gym-hamstrings');
  assert.equal(resolveGymArtworkKind('Elevación de talones', 'maquina'), 'gym-calves');
});

test('structured equipment wins over ambiguous free-form exercise names', () => {
  assert.equal(resolveGymArtworkKind('Press banca con mancuernas', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'barra'), 'gym-barbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'polea'), 'gym-cable-machine');
  assert.equal(resolveGymArtworkKind('Ejercicio personalizado', 'maquina'), 'gym-fallback');
  assert.equal(resolveGymArtworkKind('Ejercicio personalizado', undefined), 'gym-fallback');
});

test('the registry exposes 34 local SVG resources plus a neutral fallback', () => {
  const resources = GYM_ICON_DEFINITIONS.filter((definition) => definition.src);
  assert.equal(resources.length, 34);
  assert.equal(GYM_ICON_REGISTRY['gym-fallback'].src, null);
  for (const definition of resources) {
    assert.match(definition.src || '', /gym-icons\/v1\/[a-z0-9-]+\.svg$/);
  }
  assert.equal(GYM_ICON_REGISTRY['gym-adjustable-bench'].licenseStatus, 'pending-attribution');
});

test('bilingual singular/plural and case-insensitive terms infer muscle, equipment, and icon sensibly', () => {
  for (const variant of ['curl', 'CURLS', 'martillo', 'Martillos', 'hammer curls']) {
    assert.equal(inferMuscleGroup(variant), 'Brazos', `muscle for ${variant}`);
    assert.equal(inferExerciseEquipment(variant).equipment, 'mancuerna', `equipment for ${variant}`);
    assert.equal(resolveGymArtworkKind(variant, inferExerciseEquipment(variant).equipment), 'gym-curls', `icon for ${variant}`);
  }

  for (const variant of ['pecho', 'PECHO', 'bench press', 'Bench Presses', 'push', 'Push Day']) {
    assert.equal(inferMuscleGroup(variant), 'Pecho', `muscle for ${variant}`);
  }
  assert.equal(resolveGymArtworkKind('Bench Press', inferExerciseEquipment('Bench Press').equipment), 'gym-bench-press');
  assert.equal(resolveGymArtworkKind('PECHO', undefined), 'gym-bench-press');
  assert.equal(resolveGymArtworkKind('Push', undefined), 'gym-bench-press');

  for (const variant of ['leg day', 'LEG DAYS', 'piernas', 'legs']) {
    assert.equal(inferMuscleGroup(variant), 'Piernas', `muscle for ${variant}`);
    assert.equal(resolveGymArtworkKind(variant, undefined), 'gym-leg-press', `icon for ${variant}`);
  }
  assert.equal(resolveGymArtworkKind('squats', inferExerciseEquipment('squats').equipment), 'gym-squat-rack');

  for (const variant of ['pull', 'PULL DAY', 'espalda', 'jalones']) {
    assert.equal(inferMuscleGroup(variant), 'Espalda', `muscle for ${variant}`);
    assert.equal(resolveGymArtworkKind(variant, undefined), 'gym-lat-pulldown', `icon for ${variant}`);
  }

  assert.equal(getRoutineIdentity([], 'Leg Day').icon, 'gym-leg-press');
  assert.equal(getRoutineIdentity([], 'PULL').icon, 'gym-lat-pulldown');
  assert.equal(getRoutineIdentity([], 'Push Day').icon, 'gym-bench-press');
  assert.equal(getRoutineIdentity([], 'Pecho').icon, 'gym-bench-press');
});
