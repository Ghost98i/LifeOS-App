import test from 'node:test';
import assert from 'node:assert/strict';
import { isSoundEnabled, setSoundEnabled, playSound } from './audio';

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
    assert.equal(Math.max(...levels), 0.12, 'existing success volume is unchanged');
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
