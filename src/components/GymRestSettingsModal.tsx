import React, { useEffect, useState } from 'react';
import type { GymSettings } from '../types';
import { AppIcon } from './AppIcon';

interface GymRestSettingsModalProps {
  settings: Required<GymSettings>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nextSettings: GymSettings) => void;
}

const SET_PRESETS = [60, 90, 120, 180];
const EXERCISE_PRESETS = [120, 180, 240, 300];

export const GymRestSettingsModal: React.FC<GymRestSettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
}) => {
  const [autoTimer, setAutoTimer] = useState(settings.autoTimerEnabled);
  const [setRest, setSetRest] = useState(settings.restBetweenSetsSeconds);
  const [exerciseRest, setExerciseRest] = useState(settings.restBetweenExercisesSeconds);
  const [showQuickAdjustments, setShowQuickAdjustments] = useState(settings.showQuickRestAdjustments);
  const [allowManualEditing, setAllowManualEditing] = useState(settings.allowManualRestEditing);

  useEffect(() => {
    if (isOpen) {
      setAutoTimer(settings.autoTimerEnabled);
      setSetRest(settings.restBetweenSetsSeconds);
      setExerciseRest(settings.restBetweenExercisesSeconds);
      setShowQuickAdjustments(settings.showQuickRestAdjustments);
      setAllowManualEditing(settings.allowManualRestEditing);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      autoTimerEnabled: autoTimer,
      restBetweenSetsSeconds: Math.min(600, Math.max(15, setRest || 120)),
      restBetweenExercisesSeconds: Math.min(600, Math.max(15, exerciseRest || 180)),
      showQuickRestAdjustments: showQuickAdjustments,
      allowManualRestEditing: allowManualEditing,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gym-rest-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]">
              <AppIcon name="stopwatch" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="gym-rest-settings-title" className="text-base font-bold text-[var(--text)]">
                Temporizador de descanso
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                Configurá el inicio automático y duraciones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>

        {/* Auto Timer Toggle */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
          <div className="min-w-0">
            <span className="text-sm font-bold text-[var(--text)] block">
              Descanso automático
            </span>
            <span className="text-xs text-[var(--text-soft)] block">
              Inicia la cuenta regresiva al completar cada serie
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoTimer}
            aria-label="Descanso automático"
            onClick={() => setAutoTimer((prev) => !prev)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
              autoTimer ? 'bg-[var(--blue)]' : 'bg-[var(--border-strong)]'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 translate-y-1 transform rounded-full bg-white shadow-md transition duration-200 ${
                autoTimer ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Rest between sets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="rest-sets-input" className="text-xs font-bold text-[var(--text)]">
              Descanso entre series
            </label>
            <span className="tabular-nums text-xs font-semibold text-[var(--text-soft)]">
              {setRest} segundos ({Math.floor(setRest / 60)}m {setRest % 60 ? `${setRest % 60}s` : ''})
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {SET_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => setSetRest(seconds)}
                className={`min-h-11 rounded-xl border text-xs font-bold transition-colors ${
                  setRest === seconds
                    ? 'border-[var(--blue)] bg-[var(--blue)] text-white shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <input
            id="rest-sets-input"
            type="number"
            min={15}
            max={600}
            step={15}
            value={setRest}
            onChange={(e) => setSetRest(Math.max(15, Math.min(600, Number(e.target.value) || 120)))}
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--blue)]"
          />
        </div>

        {/* Rest between exercises */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="rest-exercises-input" className="text-xs font-bold text-[var(--text)]">
              Descanso al terminar ejercicio
            </label>
            <span className="tabular-nums text-xs font-semibold text-[var(--text-soft)]">
              {exerciseRest} segundos ({Math.floor(exerciseRest / 60)}m {exerciseRest % 60 ? `${exerciseRest % 60}s` : ''})
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {EXERCISE_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => setExerciseRest(seconds)}
                className={`min-h-11 rounded-xl border text-xs font-bold transition-colors ${
                  exerciseRest === seconds
                    ? 'border-[var(--blue)] bg-[var(--blue)] text-white shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <input
            id="rest-exercises-input"
            type="number"
            min={15}
            max={600}
            step={15}
            value={exerciseRest}
            onChange={(e) => setExerciseRest(Math.max(15, Math.min(600, Number(e.target.value) || 180)))}
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--blue)]"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text)]">Mostrar ajustes rápidos</span>
              <span className="block text-xs text-[var(--text-soft)]">Muestra −30 s y +30 s mientras descansas</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showQuickAdjustments}
              aria-label="Mostrar ajustes rápidos de descanso"
              onClick={() => setShowQuickAdjustments((current) => !current)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
                showQuickAdjustments ? 'bg-[var(--blue)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 translate-y-1 rounded-full bg-white shadow-md transition duration-200 ${
                showQuickAdjustments ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text)]">Permitir edición manual</span>
              <span className="block text-xs text-[var(--text-soft)]">Añade una acción secundaria para editar el descanso en curso</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowManualEditing}
              aria-label="Permitir edición manual del descanso"
              onClick={() => setAllowManualEditing((current) => !current)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
                allowManualEditing ? 'bg-[var(--blue)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 translate-y-1 rounded-full bg-white shadow-md transition duration-200 ${
                allowManualEditing ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 text-xs font-bold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-11 rounded-xl bg-[var(--blue)] px-5 text-xs font-bold text-white shadow-xs hover:bg-[var(--blue-hover)]"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
};
