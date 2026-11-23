import { createAmbientSamples } from './ambientSynthesis';
// Web Audio API Synthesizer for LifeOS - Zero external MP3 dependency

let audioCtx: AudioContext | null = null;
let fxMasterGain: GainNode | null = null;
let fxOwnerCtx: AudioContext | null = null;
const FX_MASTER_VOLUME = 0.75;

function getAudioContext(autoResume = true): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      fxMasterGain = null;
      fxOwnerCtx = null;
      audioCtx.addEventListener('statechange', () => {
        window.dispatchEvent(new Event('lifeos-audio-state'));
      });
    }
  }
  if (autoResume && audioCtx && (audioCtx.state as string) !== 'running') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getFxOutputNode(ctx: AudioContext): AudioNode {
  if (fxMasterGain && fxOwnerCtx === ctx) {
    return fxMasterGain;
  }
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(FX_MASTER_VOLUME, ctx.currentTime);
  if (typeof ctx.createDynamicsCompressor === 'function') {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, ctx.currentTime);
    compressor.knee.setValueAtTime(16, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.15, ctx.currentTime);
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
  } else {
    masterGain.connect(ctx.destination);
  }
  fxMasterGain = masterGain;
  fxOwnerCtx = ctx;
  return masterGain;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem('lifeos_sound_enabled') !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem('lifeos_sound_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('lifeos-sound-preference'));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export type SoundType = 'success' | 'coins' | 'beep' | 'night' | 'click' | 'restComplete';

export function playSound(type: SoundType): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext(false);
    if (!ctx) return;
    // Resume within the gesture, then schedule against the running clock.
    // Safari may report "interrupted" after returning from the background.
    if ((ctx.state as string) !== 'running') {
      void ctx.resume().then(() => {
        if (ctx.state === 'running' && isSoundEnabled()) playSound(type);
      }).catch((err) => console.warn('Unable to resume interaction audio:', err));
      return;
    }
    const now = ctx.currentTime;

    if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'success') {
      // Exact 1:1 port of "Doble Nota Corta" (indigo-chime) from Celestian Sound Lab:
      // Two soft-attack sine+triangle notes: E5 (659.25Hz, 0ms) -> B5 (987.77Hz, 65ms), ~170ms total
      const fxOut = getFxOutputNode(ctx);
      const notes = [
        { freq: 659.25, start: 0, dur: 0.105, peak: 0.28 },
        { freq: 987.77, start: 0.065, dur: 0.125, peak: 0.34 },
      ];
      notes.forEach((n) => {
        const t0 = now + n.start;
        const oscS = ctx.createOscillator();
        const oscT = ctx.createOscillator();
        const gS = ctx.createGain();
        const gT = ctx.createGain();

        oscS.type = 'sine';
        oscT.type = 'triangle';
        oscS.frequency.setValueAtTime(n.freq, t0);
        oscT.frequency.setValueAtTime(n.freq, t0);

        gS.gain.setValueAtTime(0.0001, t0);
        gS.gain.linearRampToValueAtTime(n.peak, t0 + 0.008);
        gS.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);

        gT.gain.setValueAtTime(0.0001, t0);
        gT.gain.linearRampToValueAtTime(n.peak * 0.28, t0 + 0.008);
        gT.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur * 0.85);

        oscS.connect(gS);
        oscT.connect(gT);
        gS.connect(fxOut);
        gT.connect(fxOut);

        oscS.start(t0);
        oscT.start(t0);
        oscS.stop(t0 + n.dur + 0.015);
        oscT.stop(t0 + n.dur + 0.015);
      });
    } else if (type === 'restComplete') {
      // Exact 1:1 port of "Tríada Ascendente" (short-triad) from Celestian Sound Lab:
      // 3 fast staccato sine/triangle notes: C6 (1046.5Hz, 0ms), E6 (1318.5Hz, 95ms), G6 (1567.98Hz, 190ms)
      const fxOut = getFxOutputNode(ctx);
      const notes = [
        { freq: 1046.5, start: 0, dur: 0.095, peak: 0.28 },
        { freq: 1318.5, start: 0.095, dur: 0.095, peak: 0.32 },
        { freq: 1567.98, start: 0.19, dur: 0.145, peak: 0.38 },
      ];
      notes.forEach((n) => {
        const t0 = now + n.start;
        const oscS = ctx.createOscillator();
        const oscT = ctx.createOscillator();
        const gS = ctx.createGain();
        const gT = ctx.createGain();

        oscS.type = 'sine';
        oscT.type = 'triangle';
        oscS.frequency.setValueAtTime(n.freq, t0);
        oscT.frequency.setValueAtTime(n.freq, t0);

        gS.gain.setValueAtTime(0.0001, t0);
        gS.gain.linearRampToValueAtTime(n.peak, t0 + 0.005);
        gS.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);

        gT.gain.setValueAtTime(0.0001, t0);
        gT.gain.linearRampToValueAtTime(n.peak * 0.32, t0 + 0.005);
        gT.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur * 0.85);

        oscS.connect(gS);
        oscT.connect(gT);
        gS.connect(fxOut);
        gT.connect(fxOut);

        oscS.start(t0);
        oscT.start(t0);
        oscS.stop(t0 + n.dur + 0.02);
        oscT.stop(t0 + n.dur + 0.02);
      });
    } else if (type === 'coins') {
      // Metallic coins sound
      const freqs = [987.77, 1318.51, 1567.98];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.05);
        gain.gain.setValueAtTime(0.1, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.21);
      });
    } else if (type === 'beep') {
      // Timer alarm / finish beep
      [880, 880, 1174.66].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.12);
        gain.gain.setValueAtTime(0.15, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.11);
      });
    } else if (type === 'night') {
      // Calm ambient night chime
      const freqs = [329.63, 440, 523.25, 659.25]; // E4, A4, C5, E5
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.12);
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.82);
      });
    }
  } catch (err) {
    console.error('Error playing sound:', err);
  }
}

export function playTimerCountdownTone(secondsLeft: number): void {
  if (!isSoundEnabled()) return;

  if (secondsLeft <= 0) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([120, 70, 120]);
      } catch {
        // Ignore vibration errors on unsupported devices
      }
    }
    playSound('restComplete');
    return;
  }

  try {
    const ctx = getAudioContext(false);
    if (!ctx) return;
    if ((ctx.state as string) !== 'running') {
      void ctx.resume().catch(() => {});
      return;
    }

    // Dominant of C Major (G5 = 783.99 Hz) leading cleanly into C6-E6-G6 triad at 00:00.
    const now = ctx.currentTime;
    const fxOut = getFxOutputNode(ctx);
    const freq = 783.99;
    const peak = 0.15;
    const dur = 0.055;

    const oscS = ctx.createOscillator();
    const oscT = ctx.createOscillator();
    const gS = ctx.createGain();
    const gT = ctx.createGain();

    oscS.type = 'sine';
    oscT.type = 'triangle';
    oscS.frequency.setValueAtTime(freq, now);
    oscT.frequency.setValueAtTime(freq, now);

    gS.gain.setValueAtTime(0.0001, now);
    gS.gain.linearRampToValueAtTime(peak, now + 0.004);
    gS.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    gT.gain.setValueAtTime(0.0001, now);
    gT.gain.linearRampToValueAtTime(peak * 0.22, now + 0.004);
    gT.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    oscS.connect(gS);
    oscT.connect(gT);
    gS.connect(fxOut);
    gT.connect(fxOut);

    oscS.start(now);
    oscT.start(now);
    oscS.stop(now + dur + 0.015);
    oscT.stop(now + dur + 0.015);
  } catch (err) {
    console.error('Error playing countdown sound:', err);
  }
}

// Ambient Noise Mixer - Multi-track synthesized Web Audio API (Zero external MP3 dependency)
export type AmbientSoundType = 'rain' | 'brown' | 'white';

export interface AmbientTrackConfig {
  enabled: boolean;
  volume: number; // 0.0 to 1.0 (normalized slider value)
}

export type AmbientMixerConfig = Record<AmbientSoundType, AmbientTrackConfig>;

export const DEFAULT_AMBIENT_CONFIG: AmbientMixerConfig = {
  rain: { enabled: true, volume: 0.5 },
  brown: { enabled: false, volume: 0.5 },
  white: { enabled: false, volume: 0.3 },
};

export const AMBIENT_PRESETS = [
  {
    id: 'rain_brown',
    label: 'Lluvia + Ruido marrón',
    icon: '🌧️+🌊',
    config: {
      rain: { enabled: true, volume: 0.5 },
      brown: { enabled: true, volume: 0.5 },
      white: { enabled: false, volume: 0.3 },
    },
  },
  {
    id: 'deep_brown',
    label: 'Ruido marrón',
    icon: '🌊',
    config: {
      rain: { enabled: false, volume: 0.5 },
      brown: { enabled: true, volume: 0.7 },
      white: { enabled: false, volume: 0.3 },
    },
  },
  {
    id: 'soft_rain',
    label: 'Lluvia suave',
    icon: '🌧️',
    config: {
      rain: { enabled: true, volume: 0.6 },
      brown: { enabled: false, volume: 0.5 },
      white: { enabled: false, volume: 0.3 },
    },
  },
  {
    id: 'pure_white',
    label: 'Ruido blanco',
    icon: '💨',
    config: {
      rain: { enabled: false, volume: 0.5 },
      brown: { enabled: false, volume: 0.5 },
      white: { enabled: true, volume: 0.35 },
    },
  },
] as const;

const STORAGE_KEY = 'lifeos_ambient_mixer_v1';

export function getSavedAmbientConfig(): AmbientMixerConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_AMBIENT_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AMBIENT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      rain: {
        enabled: Boolean(parsed.rain?.enabled),
        volume: Number.isFinite(parsed.rain?.volume) ? Math.max(0, Math.min(1, parsed.rain.volume)) : 0.5,
      },
      brown: {
        enabled: Boolean(parsed.brown?.enabled),
        volume: Number.isFinite(parsed.brown?.volume) ? Math.max(0, Math.min(1, parsed.brown.volume)) : 0.5,
      },
      white: {
        enabled: Boolean(parsed.white?.enabled),
        volume: Number.isFinite(parsed.white?.volume) ? Math.max(0, Math.min(1, parsed.white.volume)) : 0.3,
      },
    };
  } catch {
    return { ...DEFAULT_AMBIENT_CONFIG };
  }
}

export function saveAmbientConfig(config: AmbientMixerConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

interface ActiveTrack {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  type: AmbientSoundType;
}
const activeAmbientTracks = new Map<AmbientSoundType, ActiveTrack>();
const ambientBuffers = new Map<string, AudioBuffer>();
const clampVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const getTrackMaxGain = (_type: AmbientSoundType) => 0.12;

function rampAmbientGain(param: AudioParam, value: number, ctx: AudioContext, seconds = 0.2) {
  const now = ctx.currentTime;
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
  else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
  param.linearRampToValueAtTime(value, now + seconds);
}

export function startAmbientTrack(type: AmbientSoundType, volume = 0.5): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const existing = activeAmbientTracks.get(type);
  if (existing?.source.context === ctx) {
    rampAmbientGain(existing.gain.gain, clampVolume(volume) * getTrackMaxGain(type), ctx);
    return;
  }
  if (existing) { stopAmbientTrack(type); }
  try {
    const key = `${type}:${ctx.sampleRate}`;
    let buffer = ambientBuffers.get(key);
    if (!buffer) {
      buffer = ctx.createBuffer(2, ctx.sampleRate * 12, ctx.sampleRate);
      buffer.copyToChannel(createAmbientSamples(type, ctx.sampleRate, 314159), 0);
      buffer.copyToChannel(createAmbientSamples(type, ctx.sampleRate, 271828), 1);
      ambientBuffers.set(key, buffer);
    }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = ctx.createBiquadFilter();
    // Gentle spectral shaping, rather than turning white noise into a narrow tone.
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(type === 'brown' ? 800 : type === 'rain' ? 6000 : 16000, ctx.currentTime);
    filter.Q.setValueAtTime(0.5, ctx.currentTime);
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start();
    activeAmbientTracks.set(type, { source, filter, gain, type });
    rampAmbientGain(gain.gain, clampVolume(volume) * getTrackMaxGain(type), ctx, 0.3);
  } catch (err) { console.error(`Error starting ambient sound track (${type}):`, err); }
}

export function stopAmbientTrack(type: AmbientSoundType): void {
  const track = activeAmbientTracks.get(type);
  if (!track) return;
  activeAmbientTracks.delete(type);
  try {
    const ctx = track.source.context as AudioContext;
    if (ctx.state === 'running') {
      rampAmbientGain(track.gain.gain, 0, ctx, 0.25);
      track.source.stop(ctx.currentTime + 0.27);
    } else { track.source.stop(); track.source.disconnect(); track.filter.disconnect(); track.gain.disconnect(); }
  } catch { track.source.disconnect(); track.filter.disconnect(); track.gain.disconnect(); }
}

export function setAmbientTrackVolume(type: AmbientSoundType, volume: number): void {
  const track = activeAmbientTracks.get(type);
  if (track && audioCtx) rampAmbientGain(track.gain.gain, clampVolume(volume) * getTrackMaxGain(type), audioCtx);
}

export function isAmbientTrackPlaying(type: AmbientSoundType): boolean {
  return audioCtx?.state === 'running' && activeAmbientTracks.has(type);
}

export function getPlayingAmbientTracks(): AmbientSoundType[] {
  return Array.from(activeAmbientTracks.keys());
}

export function playConfiguredAmbients(config: AmbientMixerConfig): void {
  const types: AmbientSoundType[] = ['rain', 'brown', 'white'];
  // Prepare/start the next texture before fading the previous one. Buffer creation
  // on a slower device must not leave a gap after the previous source has stopped.
  types.forEach((type) => {
    const trackConf = config[type];
    if (trackConf?.enabled) {
      startAmbientTrack(type, trackConf.volume);
    }
  });
  types.filter(type => !config[type]?.enabled).forEach(stopAmbientTrack);
}

export function stopAllAmbientNoise(): void {
  const types = Array.from(activeAmbientTracks.keys());
  types.forEach((type) => stopAmbientTrack(type));
  activeAmbientTracks.clear();
}

export function isAnyAmbientNoisePlaying(): boolean {
  return audioCtx?.state === 'running' && activeAmbientTracks.size > 0;
}

// Legacy wrappers for backwards compatibility
export function startAmbientNoise(type: 'white' | 'rain' | 'brown' = 'rain'): void {
  stopAllAmbientNoise();
  startAmbientTrack(type, 0.5);
}

export function setAmbientVolume(val: number): void {
  // val is 0.0 to 0.2 in old code, scale to 0.0-1.0
  const normalized = Math.min(1, val * 5);
  activeAmbientTracks.forEach((_, type) => {
    setAmbientTrackVolume(type, normalized);
  });
}

export function stopAmbientNoise(): void {
  stopAllAmbientNoise();
}

export function isAmbientNoisePlaying(): boolean {
  return isAnyAmbientNoisePlaying();
}
