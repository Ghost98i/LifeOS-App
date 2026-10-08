import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { playTimerCountdownTone } from '../lib/audio';

interface GymRestTimerBarProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

function remainingSeconds(endsAt?: number): number {
  return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
}

export const GymRestTimerBar: React.FC<GymRestTimerBarProps> = ({
  state,
  onUpdateState,
}) => {
  const timer = state.gym.activeTimer;
  const timerEndsAt = timer?.endsAt;
  const [left, setLeft] = useState(() => remainingSeconds(timer?.endsAt));
  const [isPaused, setIsPaused] = useState(false);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);

  // Keep track of countdown beeps (3s, 2s, 1s, 0s) to avoid duplicate sound triggers
  const lastChimeSecondRef = useRef<number | null>(null);

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
        onUpdateState((draft) => {
          draft.gym.activeTimer = null;
        });
      }
    };

    const interval = window.setInterval(tick, 250);

    // Immediate update when waking from background or screen unlock
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
  }, [timerEndsAt, isPaused, onUpdateState]);

  const progress = useMemo(() => {
    if (!timer || timer.durationSeconds <= 0) return 0;
    const current = isPaused && pausedLeft !== null ? pausedLeft : left;
    return Math.max(0, Math.min(100, (current / timer.durationSeconds) * 100));
  }, [left, timer, isPaused, pausedLeft]);

  const adjustTimer = (deltaSeconds: number) => {
    lastChimeSecondRef.current = null;
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
      lastChimeSecondRef.current = null;
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
    lastChimeSecondRef.current = null;
    onUpdateState((draft) => {
      draft.gym.activeTimer = null;
    });
  };

  const isRunning = Boolean(timer && (left > 0 || (isPaused && pausedLeft !== null)));
  const displaySeconds = isPaused && pausedLeft !== null ? pausedLeft : left;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;

  if (!isRunning) return null;

  return (
    <section
      aria-label="Descanso entre series"
      className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]"
    >
      <div className="h-1 bg-[var(--border)]">
        <div
          className={`h-full transition-[width] duration-300 ${
            displaySeconds <= 5 ? 'bg-rose-500' : displaySeconds <= 10 ? 'bg-amber-500' : 'bg-[var(--blue)]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]">
            <AppIcon name="clock" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-soft)]">
              {isPaused ? 'Descanso en pausa' : 'Descanso'}
            </p>
            <strong className="block font-mono text-2xl font-bold tabular-nums text-[var(--text)]">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </strong>
          </div>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePause}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
          >
            {isPaused ? <><AppIcon name="play" className="h-4 w-4" /> Reanudar</> : <><AppIcon name="pause" className="h-4 w-4" /> Pausa</>}
          </button>
          <button
            type="button"
            onClick={() => adjustTimer(30)}
            className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
          >
            +30 s
          </button>
          <button
            type="button"
            onClick={stopTimer}
            className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--blue-soft)]"
          >
            Omitir
          </button>
        </div>
      </div>
    </section>
  );
};
