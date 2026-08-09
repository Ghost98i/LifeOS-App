import React, { useState, useEffect } from 'react';
import { playSound } from '../lib/audio';

export const RestTimer: React.FC = () => {
  const [seconds, setSeconds] = useState(60);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      playSound('beep');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft]);

  const startRest = (sec: number) => {
    playSound('click');
    setSeconds(sec);
    setTimeLeft(sec);
    setIsActive(true);
  };

  const stopTimer = () => {
    playSound('click');
    setIsActive(false);
    setTimeLeft(0);
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-xs text-[var(--text)] flex items-center gap-1.5">
          ⏱️ Temporizador de Descanso entre Series
        </span>
        {isActive && (
          <span className="text-xs font-mono font-bold text-emerald-500 animate-pulse">
            Descansando...
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[30, 60, 90, 120, 180].map((s) => (
            <button
              key={s}
              onClick={() => startRest(s)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isActive && seconds === s
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--blue)]'
              }`}
            >
              {s >= 60 ? `${s / 60}m` : `${s}s`}
            </button>
          ))}
        </div>

        {isActive ? (
          <div className="flex items-center gap-2">
            <span className="text-xl font-mono font-extrabold text-[var(--text)] px-3 py-1 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              {timeLeft}s
            </span>
            <button
              onClick={stopTimer}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/20 cursor-pointer"
            >
              Detener
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-[var(--text-faint)]">
            Elegí tiempo para iniciar la cuenta regresiva con sonido.
          </span>
        )}
      </div>
    </div>
  );
};
