import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { bodyCompositionEstimate, calculateFFMI, estimateRelativeFatMass } from './bodyComposition';

test('RFM usa altura, cintura y la constante de fórmula corporal', () => {
  assert.equal(estimateRelativeFatMass(180, 90, 'male'), 24);
  assert.equal(estimateRelativeFatMass(180, 90, 'female'), 36);
  assert.equal(estimateRelativeFatMass(0, 90, 'male'), null);
});

test('calcula masa magra y FFMI sin usar IMC', () => {
  const state = defaultState();
  state.profile.height = 180;
  state.profile.bodyCompositionSex = 'male';
  state.gym.weight.push({ date: '2026-08-10', kg: 90 });
  state.gym.measurements.push({ date: '2026-08-10', waist: 90 });

  const result = bodyCompositionEstimate(state);
  assert.ok(result);
  assert.equal(result.rfmPercent, 24);
  assert.equal(result.fatMassKg, 21.6);
  assert.equal(result.leanMassKg, 68.4);
  assert.ok(Math.abs(result.ffmi - 21.111) < 0.001);
  assert.ok(Math.abs(Number(calculateFFMI(90, 180, 24)) - 21.111) < 0.001);
});
