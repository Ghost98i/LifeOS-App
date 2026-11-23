import test from 'node:test';
import assert from 'node:assert/strict';
import { isSoundEnabled, setSoundEnabled, playSound, playTimerCountdownTone } from './audio';

test('interaction audio respects mute, resumes before scheduling and recovers after closure', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>([['lifeos_ambient_mixer_v1', '{"rain":{"volume":0.23}}']]);
  let started = 0;
  let created = 0;
  let release: () => void = () => {};
  const contexts: FakeContext[] = [];
  const levels: number[] = [];
  class FakeContext {
    state = 'suspended';
    currentTime = 12;
    destination = {};
    constructor() { contexts.push(this); created++; }
    addEventListener() {}
    resume() { return new Promise<void>((resolve) => { release = () => { this.state = 'running'; resolve(); }; }); }
    createOscillator() {
      return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {},
        start: () => { assert.equal(this.state, 'running'); started++; }, stop() {} };
    }
    createGain() { return { connect() {}, gain: {
      setValueAtTime: (value: number) => levels.push(value),
      linearRampToValueAtTime: (value: number) => levels.push(value), exponentialRampToValueAtTime() {},
    } }; }
  }
  const target = new EventTarget();
  let preferenceEvents = 0;
  target.addEventListener('lifeos-sound-preference', () => preferenceEvents++);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(target, { AudioContext: FakeContext }) });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    setSoundEnabled(false);
    playSound('success');
    assert.equal(created, 0);
    assert.equal(isSoundEnabled(), false);
    setSoundEnabled(true);
    playSound('success');
    assert.equal(started, 0);
    release();
    await Promise.resolve();
    assert.equal(started, 4);
    assert.ok(levels.includes(0.28) && levels.includes(0.34), 'success uses 1:1 Doble Nota Corta peak gains');
    contexts.at(-1)!.state = 'interrupted';
    playSound('click');
    setSoundEnabled(false);
    release();
    await Promise.resolve();
    assert.equal(started, 4, 'mute during resume cancels the sound');
    contexts.at(-1)!.state = 'closed';
    setSoundEnabled(true);
    playSound('click');
    release();
    await Promise.resolve();
    assert.equal(created, 2);
    assert.equal(started, 5);
    assert.equal(preferenceEvents, 4);
    assert.equal(values.get('lifeos_ambient_mixer_v1'), '{"rain":{"volume":0.23}}');
    contexts.at(-1)!.state = 'closed';
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('playTimerCountdownTone plays G5 lead-in ticks for 3, 2, 1 and respects mute', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const oscs: Array<{ type: string; freq: number; start: number; stop: number }> = [];
  const linearRamps: Array<{ value: number; time: number }> = [];
  const expRamps: Array<{ value: number; time: number }> = [];

  class FakeContext {
    state = 'running';
    currentTime = 5;
    destination = {};
    addEventListener() {}
    resume() { return Promise.resolve(); }
    createDynamicsCompressor() {
      return {
        threshold: { setValueAtTime() {} },
        knee: { setValueAtTime() {} },
        ratio: { setValueAtTime() {} },
        attack: { setValueAtTime() {} },
        release: { setValueAtTime() {} },
        connect() {},
      };
    }
    createOscillator() {
      const rec = { type: 'sine', freq: 0, start: 0, stop: 0 };
      oscs.push(rec);
      return {
        get type() { return rec.type; },
        set type(v: string) { rec.type = v; },
        frequency: { setValueAtTime: (val: number) => { rec.freq = val; } },
        connect() {},
        start: (t: number) => { rec.start = t; },
        stop: (t: number) => { rec.stop = t; },
      };
    }
    createGain() {
      return {
        connect() {},
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime: (value: number, time: number) => { linearRamps.push({ value, time }); },
          exponentialRampToValueAtTime: (value: number, time: number) => { expRamps.push({ value, time }); },
        },
      };
    }
  }

  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(target, { AudioContext: FakeContext }) });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });

  try {
    setSoundEnabled(false);
    playTimerCountdownTone(3);
    assert.equal(oscs.length, 0, 'muted countdown must not synthesize audio');

    setSoundEnabled(true);
    playTimerCountdownTone(3);
    playTimerCountdownTone(2);
    playTimerCountdownTone(1);
    assert.equal(oscs.length, 6, 'each of 3, 2, 1 spawns sine + triangle G5');
    for (let i = 0; i < 6; i += 2) {
      assert.equal(oscs[i].type, 'sine');
      assert.equal(oscs[i + 1].type, 'triangle');
      assert.equal(oscs[i].freq, 783.99);
      assert.equal(oscs[i + 1].freq, 783.99);
      assert.equal(Math.round((oscs[i].stop - oscs[i].start) * 1000), 70);
    }
    assert.equal(linearRamps[0].value, 0.15);
    assert.equal(Math.round((linearRamps[0].time - 5) * 1000), 4);
    assert.ok(Math.abs(linearRamps[1].value - 0.15 * 0.22) < 1e-6);
    assert.equal(Math.round((expRamps[0].time - 5) * 1000), 55);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
