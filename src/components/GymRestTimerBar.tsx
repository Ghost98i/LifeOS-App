import React, { useEffect, useMemo, useState } from 'react';
import type { LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';

interface GymRestTimerBarProps {
  state: LifeOSState;
  sessionId: string;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

function remainingSeconds(endsAt?: number): number {
  return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
}

export const GymRestTimerBar: React.FC<GymRestTimerBarProps> = ({
  state,
  sessionId,
  onUpdateState,
}) => {
  const timer = state.gym.activeTimer;
  const timerEndsAt = timer?.endsAt;
  const [left, setLeft] = useState(() => remainingSeconds(timer?.endsAt));
  const [isPaused, setIsPaused] = useState(false);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);

  useEffect(() => {
    if (isPaused) return;
    setLeft(remainingSeconds(timerEndsAt));
    if (!timerEndsAt) return;
    const interval = window.setInterval(() => {
      const rem = remainingSeconds(timerEndsAt);
      setLeft(rem);
      if (rem <= 0) {
        playSound('beep');
        onUpdateState((draft) => {
          draft.gym.activeTimer = null;
        });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [timerEndsAt, isPaused, onUpdateState]);

  const progress = useMemo(() => {
    if (!timer || timer.durationSeconds <= 0) return 0;
    const current = isPaused && pausedLeft !== null ? pausedLeft : left;
    return Math.max(0, Math.min(100, (current / timer.durationSeconds) * 100));
  }, [left, timer, isPaused, pausedLeft]);

  const startTimer = (seconds: number) => {
    setIsPaused(false);
    setPausedLeft(null);
    onUpdateState((draft) => {
      draft.gym.activeTimer = {
        endsAt: Date.now() + seconds * 1000,
        durationSeconds: seconds,
        sessionId,
      };
    });
  };

  const adjustTimer = (deltaSeconds: number) => {
    if (isPaused && pausedLeft !== null) {
      const updated = Math.max(5, pausedLeft + deltaSeconds);
      setPausedLeft(updated);
      return;
    }
    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      draft.gym.activeTimer.endsAt = Math.max(Date.now(), draft.gym.activeTimer.endsAt + deltaSeconds * 1000);
      draft.gym.activeTimer.durationSeconds = Math.max(5, draft.gym.activeTimer.durationSeconds + deltaSeconds);
    });
  };

  const togglePause = () => {
    if (!timer) return;
    if (isPaused) {
      // Resume
      const remaining = pausedLeft ?? left;
      setIsPaused(false);
      setPausedLeft(null);
      onUpdateState((draft) => {
        if (draft.gym.activeTimer) {
          draft.gym.activeTimer.endsAt = Date.now() + remaining * 1000;
        }
      });
    } else {
      // Pause
      setPausedLeft(left);
      setIsPaused(true);
    }
  };

  const stopTimer = () => {
    setIsPaused(false);
    setPausedLeft(null);
    onUpdateState((draft) => {
      draft.gym.activeTimer = null;
    });
  };

  const resetTimer = () => {
    if (!timer) return;
    startTimer(timer.durationSeconds);
  };

  const isRunning = Boolean(timer && (left > 0 || (isPaused && pausedLeft !== null)));
  const displaySeconds = isPaused && pausedLeft !== null ? pausedLeft : left;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-4 shadow-xs">
      {isRunning ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)] animate-pulse">
                <AppIcon name="clock" className="h-5 w-5" />
              </span>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--blue)]">
                  {isPaused ? 'Descanso en pausa' : 'Descanso entre series'}
                </span>
                <div className="flex items-baseline gap-2">
                  <strong className="font-mono text-2xl sm:text-3xl font-extrabold text-[var(--text)]">
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                  </strong>
                  <span className="text-xs text-[var(--text-soft)]">
                    / {Math.floor(timer!.durationSeconds / 60)}m {timer!.durationSeconds % 60}s
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustTimer(-15)}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                title="Restar 15 segundos"
              >
                -15s
              </button>
              <button
                type="button"
                onClick={() => adjustTimer(15)}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                title="Sumar 15 segundos"
              >
                +15s
              </button>
              <button
                type="button"
                onClick={() => adjustTimer(30)}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                title="Sumar 30 segundos"
              >
                +30s
              </button>
              <button
                type="button"
                onClick={togglePause}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-colors inline-flex items-center gap-1"
              >
                {isPaused ? <><AppIcon name="play" className="h-3 w-3" /> Reanudar</> : <><AppIcon name="pause" className="h-3 w-3" /> Pausa</>}
              </button>
              <button
                type="button"
                onClick={resetTimer}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                title="Reiniciar temporizador"
              >
                <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={stopTimer}
                className="h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                Detener
              </button>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div
              className={`h-full transition-all duration-300 ${
                displaySeconds <= 10 ? 'bg-amber-500' : 'bg-[var(--blue)]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-soft)]">
              <AppIcon name="clock" className="h-4 w-4" />
            </span>
            <div>
              <span className="text-xs font-bold text-[var(--text)] block">Temporizador de descanso</span>
              <span className="text-[11px] text-[var(--text-soft)]">Tocá para iniciar el conteo rápido entre series</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[30, 60, 90, 120, 180].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => startTimer(sec)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--blue)] hover:text-white hover:border-[var(--blue)] transition-all cursor-pointer"
              >
                {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
