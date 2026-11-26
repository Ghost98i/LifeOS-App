import React, { useEffect, useRef, useState } from 'react';
import type { LifeOSState } from '../types';
import { playTimerCountdownTone } from '../lib/audio';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { applyGymRestTimerAdjustment, getGymSettings, toggleGymRestTimerPause } from '../lib/gymFlows';
import {
  getRestTimerSnapshot,
  resolveRestTimerContext,
  triggerRestTimerCompletionAlert,
} from '../lib/gymRestTimer';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';

interface GymRestOverlayProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onOpenGym: () => void;
}

export const GymRestOverlay: React.FC<GymRestOverlayProps> = ({ state, onUpdateState, onOpenGym }) => {
  const timer = state.gym.activeTimer;
  const isExerciseRest = timer?.kind === 'exercise';
  const settings = getGymSettings(state.gym);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const lastChimeSecondRef = useRef<number | null>(null);

  const snapshot = getRestTimerSnapshot(timer, nowMs);
  const isOvertime = Boolean(snapshot?.isOvertime);
  const isPaused = Boolean(timer?.pausedAt);

  useEffect(() => {
    setNowMs(Date.now());
    lastChimeSecondRef.current = null;
    if (!timer || timer.pausedAt) return;

    const refresh = () => {
      const now = Date.now();
      setNowMs(now);
      const snap = getRestTimerSnapshot(timer, now);
      if (!snap) return;

      if (
        !snap.isOvertime
        && snap.remainingSeconds <= 3
        && snap.remainingSeconds >= 1
        && lastChimeSecondRef.current !== snap.remainingSeconds
      ) {
        lastChimeSecondRef.current = snap.remainingSeconds;
        playTimerCountdownTone(snap.remainingSeconds);
      }

      if (snap.isOvertime) {
        const ctx = resolveRestTimerContext(timer, state.gym.sessions);
        triggerRestTimerCompletionAlert(timer, ctx, now);
      }
    };

    refresh();
    const interval = window.setInterval(refresh, 250);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [timer, state.gym.sessions]);

  const isWakeLockNeeded = Boolean(isModuleEnabled(state, 'gimnasio') && timer && !isPaused && !isOvertime);
  useScreenWakeLock(isWakeLockNeeded);
  if (!isModuleEnabled(state, 'gimnasio') || !timer || !snapshot) return null;

  const change = (delta: number) => {
    if (!timer) return;
    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      const result = applyGymRestTimerAdjustment(draft.gym.activeTimer, delta);
      draft.gym.activeTimer = result.timer;
    });
  };

  const dismissTimer = () => {
    onUpdateState((draft) => {
      draft.gym.activeTimer = null;
    });
  };

  const statusLabel = isOvertime
    ? (isPaused ? 'Exceso · En pausa' : 'Descanso excedido')
    : `${isExerciseRest ? 'Descanso ejercicios' : 'Descanso series'}${isPaused ? ' · En pausa' : ''}`;

  return (
    <aside
      aria-label="Temporizador de descanso en segundo plano"
      data-gym-rest-dock="true"
      data-rest-state={isOvertime ? 'overtime' : 'active'}
      className={`fixed bottom-[calc(7.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[60] overflow-hidden rounded-2xl border backdrop-blur-md text-[var(--text)] transition-colors duration-300 md:bottom-5 sm:left-auto sm:right-5 sm:w-[392px] ${
        isOvertime
          ? 'border-[#F59E0B]/50 bg-white/95 ring-1 ring-[#F59E0B]/20 shadow-[0_14px_34px_-8px_rgba(245,158,11,0.22),0_4px_12px_-2px_rgba(15,23,42,0.10)] dark:border-[#F59E0B]/45 dark:bg-[#101B30]/95 dark:ring-[#F59E0B]/20 dark:shadow-[0_16px_38px_-6px_rgba(0,0,0,0.72)]'
          : 'border-slate-200/95 bg-white/95 ring-1 ring-[#4F46E5]/10 shadow-[0_14px_34px_-8px_rgba(15,23,42,0.20),0_4px_12px_-2px_rgba(15,23,42,0.08)] dark:border-white/[0.14] dark:bg-[#101B30]/95 dark:ring-[#4F46E5]/18 dark:shadow-[0_16px_38px_-6px_rgba(0,0,0,0.72)]'
      }`}
    >
      <div className="h-[3px] w-full bg-slate-200/80 dark:bg-white/[0.08] overflow-hidden">
        <div
          className={`h-full transition-[width,background-color] duration-200 ${
            isOvertime
              ? 'bg-[#F59E0B] overtime-bar-pulse'
              : 'bg-[#4F46E5]'
          }`}
          style={{ width: `${snapshot.progressPercent}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
        <button type="button" onClick={onOpenGym} className="min-w-0 flex-1 text-left cursor-pointer">
          <span
            className={`block text-[11px] font-semibold tracking-tight truncate transition-colors ${
              isOvertime
                ? 'text-amber-600 dark:text-[#F59E0B]'
                : 'text-[#4F46E5] dark:text-indigo-400'
            }`}
          >
            {statusLabel}
          </span>
          <strong
            className={`block font-sans text-[22px] sm:text-2xl font-bold tabular-nums leading-tight tracking-[-0.03em] mt-0.5 transition-colors ${
              isOvertime
                ? 'text-amber-600 dark:text-[#F59E0B]'
                : 'text-[var(--text)]'
            }`}
          >
            {snapshot.formatted.startsWith('+') ? (
              <>
                <span className="inline-block text-[0.82em] font-semibold mr-[0.02em] align-[0.03em]">+</span>
                {snapshot.formatted.slice(1)}
              </>
            ) : (
              snapshot.formatted
            )}
          </strong>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isOvertime && (
            <button
              type="button"
              aria-label={isPaused ? 'Reanudar descanso' : 'Pausar descanso'}
              onClick={() => onUpdateState((draft) => {
                if (draft.gym.activeTimer) draft.gym.activeTimer = toggleGymRestTimerPause(draft.gym.activeTimer);
              })}
              className="min-h-[44px] sm:min-h-10 rounded-xl border border-[var(--border)] bg-[var(--card-subtle)] px-2.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)] active:scale-95 transition-all cursor-pointer"
            >
              {isPaused ? 'Reanudar' : 'Pausar'}
            </button>
          )}
          {!isOvertime && settings.showQuickRestAdjustments && (
            <button
              type="button"
              onClick={() => change(-30)}
              className="min-h-[44px] min-w-[44px] sm:min-h-10 sm:min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-subtle)] px-2.5 text-xs font-semibold tabular-nums text-[var(--text)] transition-all hover:bg-[var(--surface-muted)] active:scale-95 cursor-pointer"
            >
              −30s
            </button>
          )}
          {!isOvertime && settings.showQuickRestAdjustments && (
            <button
              type="button"
              onClick={() => change(30)}
              className="min-h-[44px] min-w-[44px] sm:min-h-10 sm:min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-subtle)] px-2.5 text-xs font-semibold tabular-nums text-[var(--text)] transition-all hover:bg-[var(--surface-muted)] active:scale-95 cursor-pointer"
            >
              +30s
            </button>
          )}
          {isOvertime ? (
            <button
              type="button"
              onClick={dismissTimer}
              aria-label="Listo, cerrar descanso excedido"
              className="min-h-[44px] sm:min-h-10 rounded-xl border border-[#F59E0B]/55 bg-[#F59E0B]/15 px-3.5 text-xs font-semibold text-amber-700 transition-all hover:bg-[#F59E0B]/25 active:scale-95 dark:text-[#F59E0B] cursor-pointer whitespace-nowrap"
            >
              Listo
            </button>
          ) : (
            <button
              type="button"
              onClick={dismissTimer}
              className="min-h-[44px] sm:min-h-10 rounded-xl bg-[#4F46E5] px-3 text-xs font-semibold text-white transition-all hover:bg-[#4338CA] dark:hover:bg-[#6366F1] active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Saltar
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
