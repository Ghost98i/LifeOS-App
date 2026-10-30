import { createAmbientSamples } from './ambientSynthesis';
// Web Audio API Synthesizer for LifeOS - Zero external MP3 dependency

let audioCtx: AudioContext | null = null;

function getAudioContext(autoResume = true): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
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

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('lifeos_sound_enabled') !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('lifeos_sound_enabled', enabled ? 'true' : 'false');
  window.dispatchEvent(new Event('lifeos-sound-preference'));
}

export function playSound(type: 'success' | 'coins' | 'beep' | 'night' | 'click'): void {
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
      // Pleasant double chime chord
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.06);
        gain.gain.setValueAtTime(0, now + idx * 0.06);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.36);
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
  const ctx = getAudioContext();

  // Gentle vibration if supported
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (secondsLeft > 0) {
        navigator.vibrate(40);
      } else {
        navigator.vibrate([100, 50, 150]);
      }
    } catch {
      // Ignore vibration errors on unsupported devices
    }
  }

  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    if (secondsLeft > 0) {
      // Short subtle tick beep for 3, 2, 1
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else {
      // High bright celebratory chime for 0s
      [880, 1174.66].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.1);
        gain.gain.setValueAtTime(0.15, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.26);
      });
    }
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
