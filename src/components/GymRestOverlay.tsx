import React, { useEffect, useMemo, useState } from 'react';
import type { LifeOSState } from '../types';
import { playSound } from '../lib/audio';
import { isModuleEnabled } from '../lib/moduleVisibility';

interface GymRestOverlayProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onOpenGym: () => void;
}

function remainingSeconds(endsAt?: number): number {
  return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
}

export const GymRestOverlay: React.FC<GymRestOverlayProps> = ({ state, onUpdateState, onOpenGym }) => {
  const timer = state.gym.activeTimer;
  const timerEndsAt = timer?.endsAt;
  const [left, setLeft] = useState(() => remainingSeconds(timer?.endsAt));
  const [announcedEnd, setAnnouncedEnd] = useState(false);

  useEffect(() => {
    setLeft(remainingSeconds(timerEndsAt));
    setAnnouncedEnd(false);
    if (!timerEndsAt) return;
    const interval = window.setInterval(() => setLeft(remainingSeconds(timerEndsAt)), 250);
    return () => window.clearInterval(interval);
  }, [timerEndsAt]);

  useEffect(() => {
    if (!timer || left > 0 || announcedEnd) return;
    setAnnouncedEnd(true);
    playSound('beep');
    onUpdateState((draft) => { draft.gym.activeTimer = null; });
  }, [announcedEnd, left, onUpdateState, timer]);

  const progress = useMemo(() => timer ? Math.max(0, Math.min(100, (left / Math.max(1, timer.durationSeconds)) * 100)) : 0, [left, timer]);
  if (!isModuleEnabled(state, 'gimnasio') || !timer || left <= 0) return null;

  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const change = (delta: number) => onUpdateState((draft) => {
    if (!draft.gym.activeTimer) return;
    draft.gym.activeTimer.endsAt = Math.max(Date.now(), draft.gym.activeTimer.endsAt + delta * 1000);
    draft.gym.activeTimer.durationSeconds = Math.max(1, draft.gym.activeTimer.durationSeconds + delta);
  });

  return (
    <aside className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-[65] overflow-hidden rounded-2xl border border-blue-400/30 bg-slate-950/95 text-white shadow-2xl backdrop-blur-md sm:bottom-5 sm:left-auto sm:right-5 sm:w-[360px]">
      <div className="h-1 bg-white/10"><div className="h-full bg-blue-400 transition-all" style={{ width: `${progress}%` }} /></div>
      <div className="flex items-center gap-3 p-3">
        <button onClick={onOpenGym} className="min-w-0 flex-1 text-left">
          <span className="block text-[10px] font-black uppercase tracking-widest text-blue-300">Descanso</span>
          <strong className="font-mono text-2xl">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</strong>
        </button>
        <button onClick={() => change(30)} className="h-10 rounded-xl bg-white/10 px-3 text-xs font-black">+30 s</button>
        <button onClick={() => onUpdateState((draft) => { draft.gym.activeTimer = null; })} className="h-10 rounded-xl bg-rose-500/20 px-3 text-xs font-black text-rose-200">Detener</button>
      </div>
    </aside>
  );
};
