import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGymArtworkKind } from '../components/visual/GymExerciseArtwork';
import { GYM_ICON_DEFINITIONS, GYM_ICON_REGISTRY } from './gymIconRegistry';

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
});

test('structured equipment wins over ambiguous free-form exercise names', () => {
  assert.equal(resolveGymArtworkKind('Press banca con mancuernas', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'barra'), 'gym-barbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'mancuerna'), 'gym-dumbbell');
  assert.equal(resolveGymArtworkKind('Curl de bíceps', 'polea'), 'gym-cable-machine');
  assert.equal(resolveGymArtworkKind('Ejercicio personalizado', 'maquina'), 'gym-fallback');
  assert.equal(resolveGymArtworkKind('Ejercicio personalizado', undefined), 'gym-fallback');
});

test('the registry exposes 22 local SVG resources plus a neutral fallback', () => {
  const resources = GYM_ICON_DEFINITIONS.filter((definition) => definition.src);
  assert.equal(resources.length, 22);
  assert.equal(GYM_ICON_REGISTRY['gym-fallback'].src, null);
  for (const definition of resources) {
    assert.match(definition.src || '', /gym-icons\/v1\/[a-z0-9-]+\.svg$/);
  }
  assert.equal(GYM_ICON_REGISTRY['gym-adjustable-bench'].licenseStatus, 'pending-attribution');
});

