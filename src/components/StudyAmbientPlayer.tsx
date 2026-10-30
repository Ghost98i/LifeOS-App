import React, { useEffect, useRef, useState } from 'react';
import { AMBIENT_PRESETS, getSavedAmbientConfig, saveAmbientConfig, playConfiguredAmbients,
  stopAllAmbientNoise, isAnyAmbientNoisePlaying, isSoundEnabled, type AmbientMixerConfig, type AmbientSoundType } from '../lib/audio';

const labels: Record<AmbientSoundType, string> = { rain: 'Lluvia', brown: 'Ruido marrón', white: 'Ruido blanco' };
const types: AmbientSoundType[] = ['rain', 'brown', 'white'];

export function StudyAmbientPlayer({ running }: { running: boolean }) {
  const [config, setConfig] = useState(getSavedAmbientConfig);
  const [requested, setRequested] = useState(false);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(isSoundEnabled);
  const [, tick] = useState(0);
  const previousRunning = useRef(running);
  const requestedRef = useRef(false);
  useEffect(() => {
    const update = () => tick(value => value + 1);
    const updatePreference = () => {
      const enabled = isSoundEnabled(); setSoundEnabled(enabled);
      if (!enabled) { requestedRef.current = false; setRequested(false); setManual(false); stopAllAmbientNoise(); }
    };
    window.addEventListener('lifeos-audio-state', update);
    window.addEventListener('lifeos-sound-preference', updatePreference);
    return () => { requestedRef.current = false; window.removeEventListener('lifeos-audio-state', update); window.removeEventListener('lifeos-sound-preference', updatePreference); stopAllAmbientNoise(); };
  }, []);
  useEffect(() => {
    const changed = previousRunning.current !== running;
    previousRunning.current = running;
    if (changed) { setManual(false); if (!running) requestedRef.current = false; }
    if (soundEnabled && requested && (running || (manual && !changed))) playConfiguredAmbients(config);
    else stopAllAmbientNoise();
    tick(value => value + 1);
  }, [running, manual, requested, config, soundEnabled]);
  const selected = AMBIENT_PRESETS.find(preset => types.every(type => preset.config[type].enabled === config[type].enabled));
  const enabled = types.some(type => config[type].enabled);
  const volume = Math.max(0, ...types.filter(type => config[type].enabled).map(type => config[type].volume));
  const playing = isAnyAmbientNoisePlaying();
  const change = (next: AmbientMixerConfig) => { setConfig(next); saveAmbientConfig(next); setError(''); };
  const toggle = () => {
    setError('');
    if (playing) {
      requestedRef.current = false; setRequested(false); setManual(false); stopAllAmbientNoise();
    } else {
      // Resume directly in the gesture. A suspended context is never labelled playing.
      requestedRef.current = true; setRequested(true); setManual(!running); playConfiguredAmbients(config);
      window.setTimeout(() => {
        if (requestedRef.current && !isAnyAmbientNoisePlaying()) setError('No se pudo iniciar el audio. Volvé a pulsar Reproducir para intentarlo.');
        tick(value => value + 1);
      }, 350);
    }
  };
  return <section aria-label="Sonidos de concentración" className="border-t border-[var(--border)] pt-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-[var(--text)]">Sonidos de concentración</h3>
      <span role="status" className="text-sm text-[var(--text-soft)]">{playing ? 'Reproduciendo' : 'En pausa'}</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
      <label className="space-y-1 text-sm text-[var(--text-soft)]">Ambiente
        <select aria-label="Ambiente" value={selected?.id || 'custom'} onChange={event => {
          const preset = AMBIENT_PRESETS.find(item => item.id === event.target.value);
          if (preset) change(structuredClone(preset.config) as AmbientMixerConfig);
        }} className="block w-full min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[var(--text)]">
          {!selected && <option value="custom">{enabled ? 'Mezcla personalizada' : 'Sin sonido'}</option>}
          {AMBIENT_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={!enabled || !soundEnabled} onClick={toggle} className="min-h-11 rounded-xl bg-[var(--blue)] px-4 text-sm font-semibold text-white disabled:opacity-50">{playing ? 'Pausar sonido' : 'Reproducir'}</button>
    </div>
    <label className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-soft)]">Volumen <output>{Math.round(volume * 100)}%</output>
      <input aria-label="Volumen del ambiente" type="range" min="0" max="1" step="0.01" value={volume} disabled={!enabled} className="min-h-9 min-w-32 flex-1 accent-[var(--blue)]" onChange={event => {
        const value = Number(event.target.value);
        change(Object.fromEntries(types.map(type => [type, { ...config[type], volume: config[type].enabled ? (volume > 0 ? config[type].volume / volume * value : value) : config[type].volume }])) as AmbientMixerConfig);
      }} />
    </label>
    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    {!soundEnabled && <p className="text-sm text-[var(--text-soft)]">Los sonidos están silenciados. Activálos en la barra superior para reproducir un ambiente.</p>}
    <details className="text-sm text-[var(--text-soft)]">
      <summary className="cursor-pointer min-h-9">Mezclar sonidos</summary>
      <div className="space-y-3 pt-2">{types.map(type => <div key={type} className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 min-w-36"><input type="checkbox" checked={config[type].enabled} onChange={() => change({ ...config, [type]: { ...config[type], enabled: !config[type].enabled } })} />{labels[type]}</label>
        <input aria-label={`Volumen de ${labels[type].toLocaleLowerCase('es')}`} type="range" min="0" max="1" step="0.01" value={config[type].volume} disabled={!config[type].enabled} onChange={event => change({ ...config, [type]: { ...config[type], volume: Number(event.target.value) } })} className="min-h-9 flex-1 min-w-32 accent-[var(--blue)]" />
      </div>)}</div>
    </details>
    <p className="text-sm text-[var(--text-faint)]">Sonidos sintetizados, disponibles sin conexión. Se pausan con la sesión y al salir de Estudios.</p>
  </section>;
}
