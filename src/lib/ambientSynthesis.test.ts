import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbientSamples, AMBIENT_LOOP_SECONDS } from './ambientSynthesis';

test('ambient textures are finite, zero-centred, level-matched and repeatable offline', () => {
  for (const type of ['rain', 'brown', 'white'] as const) {
    const samples = createAmbientSamples(type, 8000, 51);
    assert.equal(samples.length, 8000 * AMBIENT_LOOP_SECONDS);
    assert.deepEqual(samples, createAmbientSamples(type, 8000, 51));
    let mean = 0, energy = 0, peak = 0, maxStep = 0;
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Number.isFinite(samples[i])); mean += samples[i]; energy += samples[i] ** 2;
      peak = Math.max(peak, Math.abs(samples[i]));
      if (i) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
    }
    assert.ok(Math.abs(mean / samples.length) < 1e-7);
    assert.ok(Math.abs(Math.sqrt(energy / samples.length) - 0.16) < 1e-6);
    assert.ok(peak < 1, `${type}: unclipped`);
    assert.ok(Math.abs(samples[0] - samples.at(-1)!) <= maxStep, `${type}: seam is within natural adjacent variation`);
  }
});

test('textures keep different spectra and independent stereo seeds', () => {
  const brown = createAmbientSamples('brown', 8000, 42);
  const white = createAmbientSamples('white', 8000, 42);
  const right = createAmbientSamples('white', 8000, 131);
  const steps = (samples: Float32Array) => samples.reduce((sum, value, i) => sum + (i ? (value - samples[i - 1]) ** 2 : 0), 0);
  assert.ok(steps(brown) < steps(white) * 0.15, 'brown keeps its lower-frequency character');
  const correlation = white.reduce((sum, value, i) => sum + value * right[i], 0) / (white.length * 0.16 ** 2);
  assert.ok(Math.abs(correlation) < 0.03, 'stereo seeds are decorrelated');
});
