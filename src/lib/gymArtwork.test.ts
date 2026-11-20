import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.equal(resolveGymArtworkKind('Sentadilla hack', 'maquina'), 'gym-hack-squat');
  assert.equal(resolveGymArtworkKind('Extensión de cuádriceps', 'maquina'), 'gym-leg-extension');
  assert.equal(resolveGymArtworkKind('Press de hombros sentado', 'maquina'), 'gym-shoulder-press');
  assert.equal(resolveGymArtworkKind('Dominadas', 'corporal'), 'gym-pull-ups');
  assert.equal(resolveGymArtworkKind('Fondos en paralelas', 'corporal'), 'gym-power-tower');
  assert.equal(resolveGymArtworkKind('Peso muerto rumano', 'barra'), 'gym-deadlift');
  assert.equal(resolveGymArtworkKind('Curl martillo', 'mancuerna'), 'gym-curls');
  assert.equal(resolveGymArtworkKind('Curl con barra EZ', 'barra'), 'gym-ez-bar');
  assert.equal(resolveGymArtworkKind('Curl predicador', 'barra'), 'gym-biceps');
  assert.equal(resolveGymArtworkKind('Press francés', 'barra'), 'gym-triceps');
  assert.equal(resolveGymArtworkKind('Extensión de tríceps en polea', 'polea'), 'gym-tricep-pushdown');
  assert.equal(resolveGymArtworkKind('Tríceps con cuerda', 'polea'), 'gym-tricep-pushdown');
  assert.equal(resolveGymArtworkKind('Flexiones de brazos', 'corporal'), 'gym-pushups');
  assert.equal(resolveGymArtworkKind('Plancha abdominal', 'corporal'), 'gym-plank');
  assert.equal(resolveGymArtworkKind('Crunch abdominal', 'corporal'), 'gym-abs');
  assert.equal(resolveGymArtworkKind('Estiramiento', 'corporal'), 'gym-stretching');
  assert.equal(resolveGymArtworkKind('Clean and jerk', 'barra'), 'gym-weightlifting');
  assert.equal(resolveGymArtworkKind('Chest press en máquina', 'maquina'), 'gym-torso');
  assert.equal(resolveGymArtworkKind('Curl femoral acostado', 'maquina'), 'gym-hamstrings');
  assert.equal(resolveGymArtworkKind('Curl femoral sentado', 'maquina'), 'gym-seated-leg-curl');
  assert.equal(resolveGymArtworkKind('Elevación de talones', 'maquina'), 'gym-calves');
  assert.equal(resolveGymArtworkKind('Banco ajustable', 'mancuerna'), 'gym-adjustable-bench');
});

test('structured equipment wins over ambiguous free-form exercise names', () => {
  assert.equal(resolveGymArtworkKind('Press banca con mancuernas', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'barra'), 'gym-barbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'polea'), 'gym-cable-machine');
  assert.equal(resolveGymArtworkKind('Ejercicio personalizado', 'maquina'), 'gym-fallback');
  assert.equal(resolveGymArtworkKind('Ejercicio personalizado', undefined), 'gym-fallback');
});

test('the registry exposes 39 original first-party equipment SVG resources plus a neutral fallback', async () => {
  const resources = GYM_ICON_DEFINITIONS.filter((definition) => definition.src);
  assert.equal(resources.length, 39);
  assert.equal(GYM_ICON_REGISTRY['gym-fallback'].src, null);
  for (const definition of resources) {
    assert.match(definition.src || '', /gym-icons\/v1\/[a-z0-9-]+\.svg$/);
    assert.equal(definition.licenseStatus, 'first-party-original');

    const fileName = (definition.src || '').split('/').pop()!;
    const raw = await readFile(new URL(`../../public/gym-icons/v1/${fileName}`, import.meta.url), 'utf8');
    assert.ok(!raw.includes('\r'), `${fileName} must use LF line endings`);
    assert.match(raw, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64" fill="none"(?: shape-rendering="geometricPrecision")?>/, `${fileName} must declare clean 64x64 viewBox`);
    assert.doesNotMatch(raw, /<script|Noun Project|Created by|font-family|xmlns:xlink/i, `${fileName} must not contain scripts or third-party metadata`);
    assert.doesNotMatch(raw, /#0F172A|#1E293B|#334155/i, `${fileName} must use the V2 high-contrast palette (no dark slate #0F172A/#1E293B/#334155)`);
    if (fileName === 'rest.svg') {
      assert.doesNotMatch(raw, /<rect\b/i, 'rest.svg must not render an outer box frame');
    }
  }
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
