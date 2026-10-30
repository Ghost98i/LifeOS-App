import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GymActiveTimer, LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { playTimerCountdownTone } from '../lib/audio';
import {
  applyGymRestTimerAdjustment,
  getGymSettings,
  setGymRestTimerRemaining,
  toggleGymRestTimerPause,
} from '../lib/gymFlows';

interface GymRestTimerBarProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onComplete?: () => void;
  onSkip?: () => void;
  onOpenSettings?: () => void;
  nextExerciseName?: string | null;
}

function remainingSeconds(timer?: GymActiveTimer | null): number {
  if (!timer?.endsAt) return 0;
  if (timer.pausedAt) {
    return timer.remainingSecondsWhenPaused ?? Math.max(0, Math.ceil((timer.endsAt - timer.pausedAt) / 1000));
  }
  return Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
}

const RING_RADIUS = 62;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const GymRestTimerBar: React.FC<GymRestTimerBarProps> = ({
  state,
  onUpdateState,
  onComplete,
  onSkip,
  onOpenSettings,
  nextExerciseName,
}) => {
  const timer = state.gym.activeTimer;
  const timerEndsAt = timer?.endsAt;
  const isPaused = Boolean(timer?.pausedAt);
  const isExerciseRest = timer?.kind === 'exercise';
  const [left, setLeft] = useState(() => remainingSeconds(timer));
  const [isMinimized, setIsMinimized] = useState(() => Boolean(timer?.minimized));
  const [isManualEditorOpen, setIsManualEditorOpen] = useState(false);
  const [manualSeconds, setManualSeconds] = useState(60);
  const lastChimeSecondRef = useRef<number | null>(null);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    hasFinishedRef.current = false;
    lastChimeSecondRef.current = null;
    setIsMinimized(Boolean(timer?.minimized));
  }, [timerEndsAt, timer?.setId, timer?.exerciseId, timer?.minimized, isPaused]);

  const triggerFinish = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    if (onComplete) onComplete();
    else onUpdateState((draft) => { draft.gym.activeTimer = null; });
  }, [onComplete, onUpdateState]);

  const handleSkip = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    if (onSkip) onSkip();
    else if (onComplete) onComplete();
    else onUpdateState((draft) => { draft.gym.activeTimer = null; });
  };

  const togglePause = () => {
    onUpdateState((draft) => {
      if (draft.gym.activeTimer) {
        draft.gym.activeTimer = toggleGymRestTimerPause(draft.gym.activeTimer);
      }
    });
  };

  // The display is derived from the persisted timestamp on every tick and wake-up.
  // The SVG only visualizes that value; it is never used as a second clock.
  useEffect(() => {
    const tick = () => {
      const remaining = remainingSeconds(timer);
      setLeft(remaining);
      if (!isPaused && remaining <= 3 && remaining >= 0 && lastChimeSecondRef.current !== remaining) {
        lastChimeSecondRef.current = remaining;
        playTimerCountdownTone(remaining);
      }
      if (!isPaused && timerEndsAt && remaining <= 0) triggerFinish();
    };

    tick();
    if (!timerEndsAt || isPaused) return;
    const interval = window.setInterval(tick, 250);
    const handleWake = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [timerEndsAt, isPaused, timer, triggerFinish]);

  const progress = useMemo(() => {
    if (!timer || timer.durationSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, left / timer.durationSeconds));
  }, [left, timer]);
  const settings = getGymSettings(state.gym);

  const adjustTimer = (deltaSeconds: number) => {
    if (!timer) return;
    lastChimeSecondRef.current = null;
    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      const res = applyGymRestTimerAdjustment(draft.gym.activeTimer, deltaSeconds);
      if (res.completed) {
        triggerFinish();
      } else if (res.timer) {
        draft.gym.activeTimer = res.timer;
      }
    });
  };

  const toggleMinimize = () => {
    setIsMinimized((current) => {
      const next = !current;
      onUpdateState((draft) => {
        if (draft.gym.activeTimer) draft.gym.activeTimer.minimized = next;
      });
      return next;
    });
  };

  const openManualEditor = () => {
    setManualSeconds(Math.max(1, left));
    setIsManualEditorOpen(true);
  };

  const applyManualEdit = () => {
    const nextSeconds = Math.max(1, Math.round(manualSeconds) || 1);
    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      draft.gym.activeTimer = setGymRestTimerRemaining(draft.gym.activeTimer, nextSeconds, Date.now());
    });
    setIsManualEditorOpen(false);
  };

  if (!timer || left <= 0) return null;

  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const urgency = left <= 5 ? 'critical' : left <= 15 ? 'ending' : isExerciseRest ? 'long' : 'normal';
  const manualEditor = isManualEditorOpen ? (
    <div role="dialog" aria-modal="true" aria-labelledby="gym-manual-rest-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setIsManualEditorOpen(false)}>
      <div className="w-full max-w-xs space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div>
          <h3 id="gym-manual-rest-title" className="text-base font-black text-[var(--text)]">Editar descanso en curso</h3>
          <p className="mt-1 text-xs text-[var(--text-soft)]">Define el tiempo restante. El deadline se actualizará desde ahora.</p>
        </div>
        <label className="block text-xs font-bold text-[var(--text-soft)]">
          Segundos restantes
          <input
            autoFocus
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={manualSeconds}
            onChange={(event) => setManualSeconds(Math.max(1, Number(event.target.value) || 1))}
            className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-lg font-black tabular-nums text-[var(--text)] outline-none focus:border-[var(--blue)]"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setIsManualEditorOpen(false)} className="min-h-11 rounded-xl px-3 text-xs font-bold text-[var(--text-soft)]">Cancelar</button>
          <button type="button" onClick={applyManualEdit} className="min-h-11 rounded-xl bg-[var(--blue)] px-4 text-xs font-bold text-white">Aplicar</button>
        </div>
      </div>
    </div>
  ) : null;

  if (isMinimized) {
    return (
      <>
      <section aria-label="Temporizador de descanso minimizado" className="gym-rest-mini">
        <button type="button" onClick={toggleMinimize} className="gym-rest-mini-main" title="Expandir temporizador">
          <span className={`gym-rest-mini-ring gym-rest-${urgency}`} aria-hidden="true">
            <svg viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" className="gym-rest-track" />
              <circle cx="22" cy="22" r="18" className="gym-rest-progress" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - progress)} />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-faint)]">
              {isExerciseRest ? 'Cambio de ejercicio' : 'Recuperación'}
            </span>
            <strong className="block text-lg font-black tabular-nums tracking-tight text-[var(--text)]">{formatted}</strong>
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={togglePause} className="gym-rest-mini-action" aria-label={isPaused ? 'Reanudar' : 'Pausar'}>{isPaused ? 'Seguir' : 'Pausa'}</button>
          {settings.showQuickRestAdjustments && <button type="button" onClick={() => adjustTimer(-30)} className="gym-rest-mini-action">−30</button>}
          {settings.showQuickRestAdjustments && <button type="button" onClick={() => adjustTimer(30)} className="gym-rest-mini-action">+30</button>}
          {settings.allowManualRestEditing && <button type="button" onClick={openManualEditor} className="gym-rest-mini-action">Editar</button>}
          <button type="button" onClick={handleSkip} className="gym-rest-mini-skip">Saltar</button>
        </div>
      </section>
      {manualEditor}
      </>
    );
  }

  return (
    <>
    <section aria-label={isExerciseRest ? 'Descanso largo entre ejercicios' : 'Descanso entre series'} className={`gym-rest-card gym-rest-${urgency}`}>
      <div className="gym-rest-copy">
        <div className="flex items-center gap-2">
          <span className="gym-rest-kicker"><AppIcon name="stopwatch" className="h-4 w-4" />{isExerciseRest ? 'Descanso largo' : 'Descanso'}</span>
          {isExerciseRest && <span className="gym-rest-badge">Cambio</span>}
        </div>
        <h3 className="mt-3 text-xl font-black tracking-tight text-[var(--text)]">{isExerciseRest ? 'Cambiá de estación' : 'Recuperá el aire'}</h3>
        <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--text-soft)]">
          {isExerciseRest && nextExerciseName
            ? <>Después sigue <strong className="text-[var(--text)]">{nextExerciseName}</strong>.</>
            : 'El tiempo se mantiene sincronizado aunque salgas de Gimnasio.'}
        </p>
        {settings.showQuickRestAdjustments && <div className="mt-4 hidden items-center gap-2 sm:flex">
          <button type="button" onClick={() => adjustTimer(-30)} className="gym-rest-action">−30 s</button>
          <button type="button" onClick={() => adjustTimer(30)} className="gym-rest-action">+30 s</button>
        </div>}
      </div>

      <div className="gym-rest-dial" aria-live="polite" aria-atomic="true">
        <svg viewBox="0 0 148 148" aria-hidden="true">
          <circle cx="74" cy="74" r={RING_RADIUS} className="gym-rest-track" />
          <circle cx="74" cy="74" r={RING_RADIUS} className="gym-rest-progress" strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={dashOffset} />
        </svg>
        <div className="gym-rest-time"><strong>{formatted}</strong><span>restante</span></div>
      </div>

      <div className="gym-rest-controls">
        {settings.showQuickRestAdjustments && <div className="grid grid-cols-2 gap-2 sm:hidden">
          <button type="button" onClick={() => adjustTimer(-30)} className="gym-rest-action">−30 s</button>
          <button type="button" onClick={() => adjustTimer(30)} className="gym-rest-action">+30 s</button>
        </div>}
        <button type="button" onClick={handleSkip} className="gym-rest-skip">Saltar descanso<AppIcon name="arrowRight" className="h-4 w-4" /></button>
        <div className="flex items-center justify-center gap-1">
          <button type="button" onClick={togglePause} className="gym-rest-quiet-action font-bold text-[var(--blue)]">{isPaused ? 'Reanudar' : 'Pausar'}</button>
          {onOpenSettings && <button type="button" onClick={onOpenSettings} className="gym-rest-quiet-action">Ajustes</button>}
          {settings.allowManualRestEditing && <button type="button" onClick={openManualEditor} className="gym-rest-quiet-action">Editar tiempo</button>}
          <button type="button" onClick={toggleMinimize} className="gym-rest-quiet-action">Minimizar</button>
        </div>
      </div>
    </section>
    {manualEditor}
    </>
  );
};
