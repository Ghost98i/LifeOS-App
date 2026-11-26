import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { playTimerCountdownTone } from '../lib/audio';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  applyGymRestTimerAdjustment,
  getGymSettings,
  setGymRestTimerRemaining,
  toggleGymRestTimerPause,
} from '../lib/gymFlows';
import {
  getRestTimerSnapshot,
  resolveRestTimerContext,
  triggerRestTimerCompletionAlert,
} from '../lib/gymRestTimer';

interface GymRestTimerBarProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onComplete?: () => boolean | void;
  onSkip?: () => boolean | void;
  onOpenSettings?: () => void;
  nextExerciseName?: string | null;
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isMinimized, setIsMinimized] = useState(() => Boolean(timer?.minimized));
  const [isManualEditorOpen, setIsManualEditorOpen] = useState(false);
  const [manualSeconds, setManualSeconds] = useState(60);
  const manualDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isManualEditorOpen, manualDialogRef, () => setIsManualEditorOpen(false));
  const lastChimeSecondRef = useRef<number | null>(null);

  useEffect(() => {
    lastChimeSecondRef.current = null;
    setIsMinimized(Boolean(timer?.minimized));
  }, [timerEndsAt, timer?.setId, timer?.exerciseId, timer?.minimized, isPaused]);

  const triggerDismiss = useCallback(() => {
    if (onSkip) return onSkip();
    if (onComplete) return onComplete();
    return onUpdateState((draft) => { draft.gym.activeTimer = null; });
  }, [onComplete, onSkip, onUpdateState]);

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
      const now = Date.now();
      setNowMs(now);
      const snap = getRestTimerSnapshot(timer, now);
      if (!snap || isPaused) return;

      if (
        !snap.isOvertime
        && snap.remainingSeconds <= 3
        && snap.remainingSeconds >= 1
        && lastChimeSecondRef.current !== snap.remainingSeconds
      ) {
        lastChimeSecondRef.current = snap.remainingSeconds;
        playTimerCountdownTone(snap.remainingSeconds);
      }
      if (snap.isOvertime && timer) {
        const ctx = resolveRestTimerContext(timer, state.gym.sessions);
        triggerRestTimerCompletionAlert(timer, ctx, now);
      }
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
  }, [timerEndsAt, isPaused, timer, state.gym.sessions]);

  const snapshot = getRestTimerSnapshot(timer, nowMs);
  const settings = getGymSettings(state.gym);

  const adjustTimer = (deltaSeconds: number) => {
    if (!timer) return;
    lastChimeSecondRef.current = null;
    if (applyGymRestTimerAdjustment(timer, deltaSeconds).completed) {
      triggerDismiss();
      return;
    }
    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      const res = applyGymRestTimerAdjustment(draft.gym.activeTimer, deltaSeconds);
      draft.gym.activeTimer = res.timer;
    });
  };

  const toggleMinimize = () => {
    const next = !isMinimized;
    const saved = onUpdateState((draft) => {
      if (draft.gym.activeTimer) draft.gym.activeTimer.minimized = next;
    });
    if (saved !== false) setIsMinimized(next);
  };

  const openManualEditor = () => {
    setManualSeconds(Math.max(1, snapshot?.remainingSeconds || 60));
    setIsManualEditorOpen(true);
  };

  const applyManualEdit = () => {
    const nextSeconds = Math.max(1, Math.round(manualSeconds) || 1);
    const saved = onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      draft.gym.activeTimer = setGymRestTimerRemaining(draft.gym.activeTimer, nextSeconds, Date.now());
    });
    if (saved === false) return;
    setIsManualEditorOpen(false);
  };

  if (!timer || !snapshot) return null;

  const isOvertime = snapshot.isOvertime;
  const formatted = snapshot.formatted;
  const progress = snapshot.progressRatio;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const urgency = isOvertime ? 'overtime' : snapshot.remainingSeconds <= 5 ? 'critical' : snapshot.remainingSeconds <= 15 ? 'ending' : isExerciseRest ? 'long' : 'normal';

  const manualEditor = isManualEditorOpen ? (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs" onClick={() => setIsManualEditorOpen(false)}>
      <div ref={manualDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gym-manual-rest-title" className="flex w-full sm:max-w-xs max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />
        <div className="shrink-0 border-b border-[var(--border)]/60 px-5 py-3.5 sm:pt-4">
          <h3 id="gym-manual-rest-title" className="text-base font-black text-[var(--text)]">Editar descanso en curso</h3>
          <p className="mt-1 text-xs text-[var(--text-soft)]">Elegí cuánto descanso queda. El tiempo se contará desde ahora.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <label className="block text-xs font-bold text-[var(--text-soft)]">
            Segundos restantes
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={manualSeconds}
              onChange={(event) => setManualSeconds(Math.max(1, Number(event.target.value) || 1))}
              className="celestian-clean-field mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-lg font-black tabular-nums text-[var(--text)]"
            />
          </label>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)]/60 bg-[var(--card)] px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-3.5">
          <button type="button" onClick={() => setIsManualEditorOpen(false)} className="min-h-11 rounded-xl px-3 text-xs font-bold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]">Cancelar</button>
          <button type="button" onClick={applyManualEdit} className="min-h-11 rounded-xl bg-[#4F46E5] px-4 text-xs font-bold text-white hover:bg-[#4338CA]">Aplicar</button>
        </div>
      </div>
    </div>
  ) : null;

  if (isMinimized) {
    return (
      <>
      <section aria-label="Temporizador de descanso minimizado" data-rest-state={isOvertime ? 'overtime' : 'active'} className={`gym-rest-mini ${isOvertime ? 'border-[#F59E0B]/45' : ''}`}>
        <button type="button" onClick={toggleMinimize} className="gym-rest-mini-main" title="Expandir temporizador">
          <span className={`gym-rest-mini-ring gym-rest-${urgency} ${isOvertime ? 'text-[#F59E0B]' : 'text-[#4F46E5]'}`} aria-hidden="true">
            <svg viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" className="gym-rest-track" />
              <circle cx="22" cy="22" r="18" className={`gym-rest-progress ${isOvertime ? 'overtime-bar-pulse' : ''}`} pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - progress)} />
            </svg>
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-[10px] font-black uppercase tracking-[0.16em] ${isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : 'text-[var(--text-faint)]'}`}>
              {isOvertime ? 'Descanso excedido' : (isExerciseRest ? 'Cambio de ejercicio' : 'Recuperación')}
            </span>
            <strong className={`block text-lg font-black tabular-nums tracking-tight ${isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : 'text-[var(--text)]'}`}>{formatted}</strong>
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          {!isOvertime && <button type="button" onClick={togglePause} className="gym-rest-mini-action" aria-label={isPaused ? 'Reanudar' : 'Pausar'}>{isPaused ? 'Seguir' : 'Pausa'}</button>}
          {!isOvertime && settings.showQuickRestAdjustments && <button type="button" onClick={() => adjustTimer(-30)} className="gym-rest-mini-action">−30</button>}
          {!isOvertime && settings.showQuickRestAdjustments && <button type="button" onClick={() => adjustTimer(30)} className="gym-rest-mini-action">+30</button>}
          {!isOvertime && settings.allowManualRestEditing && <button type="button" onClick={openManualEditor} className="gym-rest-mini-action">Editar</button>}
          <button
            type="button"
            onClick={triggerDismiss}
            className={isOvertime
              ? 'min-h-11 rounded-xl border border-[#F59E0B]/55 bg-[#F59E0B]/15 px-3 text-xs font-bold text-amber-700 dark:text-[#F59E0B]'
              : 'gym-rest-mini-skip'}
          >
            {isOvertime ? 'Listo' : 'Saltar'}
          </button>
        </div>
      </section>
      {manualEditor}
      </>
    );
  }

  return (
    <>
    <section
      aria-label={isOvertime ? 'Descanso excedido' : (isExerciseRest ? 'Descanso largo entre ejercicios' : 'Descanso entre series')}
      data-rest-state={isOvertime ? 'overtime' : 'active'}
      className={`gym-rest-card gym-rest-${urgency} ${isOvertime ? '!border-[#F59E0B]/45' : ''}`}
    >
      <div className="gym-rest-copy">
        <div className="flex items-center gap-2">
          <span className={`gym-rest-kicker ${isOvertime ? '!text-amber-600 dark:!text-[#F59E0B]' : ''}`}>
            <AppIcon name="stopwatch" className="h-4 w-4" />
            {isOvertime ? 'Descanso excedido' : (isExerciseRest ? 'Descanso largo' : 'Descanso')}
          </span>
          {!isOvertime && isExerciseRest && <span className="gym-rest-badge">Cambio</span>}
        </div>
        <h3 className="mt-3 text-xl font-black tracking-tight text-[var(--text)]">
          {isOvertime ? 'Tiempo cumplido' : (isExerciseRest ? 'Cambiá de estación' : 'Recuperá el aire')}
        </h3>
        <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--text-soft)]">
          {isOvertime
            ? 'Tu descanso ya terminó. Tocá Listo o completá tu próxima serie cuando quieras.'
            : isExerciseRest && nextExerciseName
              ? <>Después sigue <strong className="text-[var(--text)]">{nextExerciseName}</strong>.</>
              : 'El descanso sigue en este dispositivo aunque salgas de Gimnasio.'}
        </p>
        {!isOvertime && settings.showQuickRestAdjustments && <div className="mt-4 hidden items-center gap-2 sm:flex">
          <button type="button" onClick={() => adjustTimer(-30)} className="gym-rest-action">−30 s</button>
          <button type="button" onClick={() => adjustTimer(30)} className="gym-rest-action">+30 s</button>
        </div>}
      </div>

      <div className={`gym-rest-dial ${isOvertime ? 'text-[#F59E0B]' : ''}`} aria-live="polite" aria-atomic="true">
        <svg viewBox="0 0 148 148" aria-hidden="true">
          <circle cx="74" cy="74" r={RING_RADIUS} className="gym-rest-track" />
          <circle cx="74" cy="74" r={RING_RADIUS} className={`gym-rest-progress ${isOvertime ? 'overtime-bar-pulse' : ''}`} strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={dashOffset} />
        </svg>
        <div className="gym-rest-time">
          <strong
            className={`font-sans font-bold tabular-nums leading-none ${
              isOvertime
                ? '!text-[18px] tracking-[-0.045em] text-amber-600 dark:text-[#F59E0B]'
                : 'tracking-[-0.035em]'
            }`}
          >
            {formatted.startsWith('+') ? (
              <>
                <span className="inline-block text-[0.78em] font-semibold mr-[0.01em] align-[0.03em]">+</span>
                {formatted.slice(1)}
              </>
            ) : (
              formatted
            )}
          </strong>
          <span>{isOvertime ? 'excedido' : 'restante'}</span>
        </div>
      </div>

      <div className="gym-rest-controls">
        {!isOvertime && settings.showQuickRestAdjustments && <div className="grid grid-cols-2 gap-2 sm:hidden">
          <button type="button" onClick={() => adjustTimer(-30)} className="gym-rest-action">−30 s</button>
          <button type="button" onClick={() => adjustTimer(30)} className="gym-rest-action">+30 s</button>
        </div>}
        <button
          type="button"
          onClick={triggerDismiss}
          className={isOvertime
            ? 'min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#F59E0B]/55 bg-[#F59E0B]/15 px-4 text-sm font-bold text-amber-700 hover:bg-[#F59E0B]/25 dark:text-[#F59E0B]'
            : 'gym-rest-skip'}
        >
          {isOvertime ? 'Listo' : 'Saltar descanso'}
          <AppIcon name="arrowRight" className="h-4 w-4" />
        </button>
        <div className="flex items-center justify-center gap-1">
          {!isOvertime && (
            <button type="button" onClick={togglePause} className="gym-rest-quiet-action font-bold text-[#4F46E5] dark:text-indigo-400">
              {isPaused ? 'Reanudar' : 'Pausar'}
            </button>
          )}
          {onOpenSettings && <button type="button" onClick={onOpenSettings} className="gym-rest-quiet-action">Ajustes</button>}
          {!isOvertime && settings.allowManualRestEditing && <button type="button" onClick={openManualEditor} className="gym-rest-quiet-action">Editar tiempo</button>}
          <button type="button" onClick={toggleMinimize} className="gym-rest-quiet-action">Minimizar</button>
        </div>
      </div>
    </section>
    {manualEditor}
    </>
  );
};
