import React, { useEffect, useMemo, useState } from 'react';
import type { GymActiveTimer, LifeOSState } from '../types';
import { playSound } from '../lib/audio';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { applyGymRestTimerAdjustment, getGymSettings, toggleGymRestTimerPause } from '../lib/gymFlows';

interface GymRestOverlayProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onOpenGym: () => void;
}

function remainingSeconds(timer?: GymActiveTimer | null): number {
  if (!timer) return 0;
  if (timer.pausedAt) return timer.remainingSecondsWhenPaused ?? Math.max(0, Math.ceil((timer.endsAt - timer.pausedAt) / 1000));
  return Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
}

export const GymRestOverlay: React.FC<GymRestOverlayProps> = ({ state, onUpdateState, onOpenGym }) => {
  const timer = state.gym.activeTimer;
  const isExerciseRest = timer?.kind === 'exercise';
  const settings = getGymSettings(state.gym);
  const [left, setLeft] = useState(() => remainingSeconds(timer));
  const [announcedEnd, setAnnouncedEnd] = useState(false);

  useEffect(() => {
    setLeft(remainingSeconds(timer));
    setAnnouncedEnd(false);
    if (!timer || timer.pausedAt) return;
    const refresh = () => setLeft(remainingSeconds(timer));
    const interval = window.setInterval(refresh, 250);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [timer]);

  useEffect(() => {
    if (!timer || timer.pausedAt || remainingSeconds(timer) > 0 || left > 0 || announcedEnd) return;
    setAnnouncedEnd(true);
    playSound('beep');
    onUpdateState((draft) => {
      if (draft.gym.activeTimer?.endsAt === timer.endsAt && !draft.gym.activeTimer.pausedAt) draft.gym.activeTimer = null;
    });
  }, [announcedEnd, left, onUpdateState, timer]);

  const progress = useMemo(() => timer ? Math.max(0, Math.min(100, (left / Math.max(1, timer.durationSeconds)) * 100)) : 0, [left, timer]);
  if (!isModuleEnabled(state, 'gimnasio') || !timer || left <= 0) return null;

  const minutes = Math.floor(left / 60);
  const seconds = left % 60;

  const change = (delta: number) => {
    if (!timer) return;
    onUpdateState((draft) => {
      if (!draft.gym.activeTimer) return;
      const result = applyGymRestTimerAdjustment(draft.gym.activeTimer, delta);
      draft.gym.activeTimer = result.timer;
    });
  };

  return (
    <aside
      aria-label="Temporizador de descanso en segundo plano"
      className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-[65] overflow-hidden rounded-2xl border border-blue-400/30 bg-slate-950/95 text-white shadow-2xl backdrop-blur-md lg:bottom-5 sm:left-auto sm:right-5 sm:w-[380px]"
    >
      <div className="h-1 bg-white/10">
        <div
          className={`h-full transition-all ${isExerciseRest ? 'bg-amber-400' : 'bg-blue-400'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <button type="button" onClick={onOpenGym} className="min-w-0 flex-1 text-left cursor-pointer">
          <span className={`block text-[10px] font-black uppercase tracking-widest ${isExerciseRest ? 'text-amber-300' : 'text-blue-300'}`}>
            {isExerciseRest ? 'Descanso ejercicios' : 'Descanso series'}
            {timer.pausedAt ? ' · En pausa' : ''}
          </span>
          <strong className="text-2xl font-bold tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </strong>
        </button>

        <div className="flex items-center gap-1.5">
          <button type="button" aria-label={timer.pausedAt ? 'Reanudar descanso' : 'Pausar descanso'} onClick={() => onUpdateState(draft => {
            if (draft.gym.activeTimer) draft.gym.activeTimer = toggleGymRestTimerPause(draft.gym.activeTimer);
          })} className="min-h-11 rounded-xl bg-white/10 px-2.5 text-xs font-bold hover:bg-white/20">
            {timer.pausedAt ? 'Reanudar' : 'Pausar'}
          </button>
          {settings.showQuickRestAdjustments && <button
            type="button"
            onClick={() => change(-30)}
            className="min-h-10 rounded-xl bg-white/10 px-2.5 text-xs font-black transition-colors hover:bg-white/20 active:scale-95"
          >
            −30s
          </button>}
          {settings.showQuickRestAdjustments && <button
            type="button"
            onClick={() => change(30)}
            className="min-h-10 rounded-xl bg-white/10 px-2.5 text-xs font-black transition-colors hover:bg-white/20 active:scale-95"
          >
            +30s
          </button>}
          <button
            type="button"
            onClick={() => onUpdateState((draft) => { draft.gym.activeTimer = null; })}
            className="min-h-10 rounded-xl bg-[var(--blue)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--blue-hover)] active:scale-95"
          >
            Saltar
          </button>
        </div>
      </div>
    </aside>
  );
};
