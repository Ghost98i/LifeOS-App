import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { playTimerCountdownTone } from '../lib/audio';

interface GymRestTimerBarProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onComplete?: () => void;
  onSkip?: () => void;
  onOpenSettings?: () => void;
  nextExerciseName?: string | null;
}

function remainingSeconds(endsAt?: number): number {
  return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
}

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
  const isExerciseRest = timer?.kind === 'exercise';
  const [left, setLeft] = useState(() => remainingSeconds(timerEndsAt));
  const [isPaused, setIsPaused] = useState(false);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [isMinimized, setIsMinimized] = useState(() => Boolean(timer?.minimized));

  const lastChimeSecondRef = useRef<number | null>(null);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    hasFinishedRef.current = false;
  }, [timerEndsAt, timer?.setId, timer?.exerciseId]);

  const triggerFinish = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    if (onComplete) {
      onComplete();
    } else {
      onUpdateState((draft) => {
        draft.gym.activeTimer = null;
      });
    }
  }, [onComplete, onUpdateState]);

  const handleSkip = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    if (onSkip) {
      onSkip();
    } else if (onComplete) {
      onComplete();
    } else {
      onUpdateState((draft) => {
        draft.gym.activeTimer = null;
      });
    }
  };

  // Sync timer with actual timestamps and handle tab wake-up
  useEffect(() => {
    if (isPaused) return;
    const initialRem = remainingSeconds(timerEndsAt);
    setLeft(initialRem);
    if (!timerEndsAt) return;

    const tick = () => {
      const rem = remainingSeconds(timerEndsAt);
      setLeft(rem);

      // Subtle audio & vibration countdown feedback at 3s, 2s, 1s, 0s
      if (rem <= 3 && rem >= 0 && lastChimeSecondRef.current !== rem) {
        lastChimeSecondRef.current = rem;
        playTimerCountdownTone(rem);
      }

      if (rem <= 0) {
        triggerFinish();
      }
    };

    const interval = window.setInterval(tick, 250);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [timerEndsAt, isPaused, triggerFinish]);

  const progress = useMemo(() => {
    if (!timer || timer.durationSeconds <= 0) return 0;
    const current = isPaused && pausedLeft !== null ? pausedLeft : left;
    return Math.max(0, Math.min(100, (current / timer.durationSeconds) * 100));
  }, [left, timer, isPaused, pausedLeft]);

  const adjustTimer = (deltaSeconds: number) => {
    lastChimeSecondRef.current = null;
    if (isPaused && pausedLeft !== null) {
      const next = pausedLeft + deltaSeconds;
      if (next <= 0) {
        setIsPaused(false);
        setPausedLeft(null);
        triggerFinish();
        return;
      }
      setPausedLeft(next);
      return;
    }

    if (!timer) return;
    const now = Date.now();
    const remainingMs = timer.endsAt - now;
    const deltaMs = deltaSeconds * 1000;

    if (deltaSeconds < 0 && remainingMs + deltaMs <= 0) {
      triggerFinish();
      return;
    }

    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      draft.gym.activeTimer.endsAt = Math.max(now, draft.gym.activeTimer.endsAt + deltaMs);
      draft.gym.activeTimer.durationSeconds = Math.max(1, draft.gym.activeTimer.durationSeconds + deltaSeconds);
    });
  };

  const togglePause = () => {
    if (!timer) return;
    if (isPaused) {
      const remaining = pausedLeft ?? left;
      setIsPaused(false);
      setPausedLeft(null);
      lastChimeSecondRef.current = null;
      onUpdateState((draft) => {
        if (draft.gym.activeTimer) {
          draft.gym.activeTimer.endsAt = Date.now() + remaining * 1000;
        }
      });
    } else {
      setPausedLeft(left);
      setIsPaused(true);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      onUpdateState((draft) => {
        if (draft.gym.activeTimer) {
          draft.gym.activeTimer.minimized = next;
        }
      });
      return next;
    });
  };

  const isRunning = Boolean(timer && (left > 0 || (isPaused && pausedLeft !== null)));
  const displaySeconds = isPaused && pausedLeft !== null ? pausedLeft : left;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;

  if (!isRunning) return null;

  if (isMinimized) {
    return (
      <section
        aria-label="Temporizador de descanso minimizado"
        className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleMinimize}
            className="flex min-w-0 items-center gap-2 text-left cursor-pointer"
            title="Expandir timer"
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              isExerciseRest ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-[var(--blue-soft)] text-[var(--blue)]'
            }`}>
              <AppIcon name="clock" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold text-[var(--text-soft)] truncate">
                {isExerciseRest ? 'Entre ejercicios' : 'Entre series'}
              </span>
              <strong className="block font-mono text-base font-bold tabular-nums text-[var(--text)]">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </strong>
            </div>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustTimer(-30)}
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)] active:scale-95"
            >
              −30s
            </button>
            <button
              type="button"
              onClick={() => adjustTimer(30)}
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)] active:scale-95"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="min-h-11 rounded-lg bg-[var(--blue)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--blue-hover)] active:scale-95"
            >
              Saltar
            </button>
            <button
              type="button"
              onClick={toggleMinimize}
              aria-label="Expandir temporizador"
              className="flex min-h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]"
            >
              <AppIcon name="chevronDown" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={isExerciseRest ? 'Descanso entre ejercicios' : 'Descanso entre series'}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xs"
    >
      <div className="h-1.5 bg-[var(--border)]">
        <div
          className={`h-full transition-[width] duration-300 ${
            displaySeconds <= 5
              ? 'bg-rose-500'
              : displaySeconds <= 10
              ? 'bg-amber-500'
              : isExerciseRest
              ? 'bg-amber-500'
              : 'bg-[var(--blue)]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              isExerciseRest
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-[var(--blue-soft)] text-[var(--blue)]'
            }`}>
              <AppIcon name="clock" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-[var(--text-soft)]">
                  {isPaused
                    ? 'Descanso en pausa'
                    : isExerciseRest
                    ? 'Descanso entre ejercicios'
                    : 'Descanso entre series'}
                </span>
                {isExerciseRest && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                    Cambio
                  </span>
                )}
              </div>
              <strong className="block font-mono text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </strong>
              {isExerciseRest && nextExerciseName && (
                <p className="text-xs text-[var(--text-soft)] truncate mt-0.5">
                  Siguiente: <span className="font-semibold text-[var(--text)]">{nextExerciseName}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Ajustar tiempos de descanso"
                title="Configurar descansos"
                className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] transition-colors hover:text-[var(--text)]"
              >
                <AppIcon name="clock" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleMinimize}
              aria-label="Minimizar temporizador"
              title="Continuar en segundo plano"
              className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] transition-colors hover:text-[var(--text)]"
            >
              <AppIcon name="chevronUp" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => adjustTimer(-30)}
            className="flex-1 sm:flex-none min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)] active:scale-95"
          >
            −30 s
          </button>
          <button
            type="button"
            onClick={() => adjustTimer(30)}
            className="flex-1 sm:flex-none min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)] active:scale-95"
          >
            +30 s
          </button>
          <button
            type="button"
            onClick={togglePause}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
          >
            {isPaused ? <><AppIcon name="play" className="h-4 w-4" /> Reanudar</> : <><AppIcon name="pause" className="h-4 w-4" /> Pausa</>}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 min-h-11 rounded-xl bg-[var(--blue)] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[var(--blue-hover)] active:scale-95"
          >
            Saltar descanso
          </button>
        </div>
      </div>
    </section>
  );
};
