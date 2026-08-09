import React, { useState, useEffect, useRef } from 'react';
import { playSound, startAmbientNoise, stopAmbientNoise, setAmbientVolume } from '../lib/audio';

interface FocusTimerProps {
  onSessionComplete?: (minutesLogged: number) => void;
}

export const FocusTimer: React.FC<FocusTimerProps> = ({ onSessionComplete }) => {
  const [minutesSetting, setMinutesSetting] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isAmbientActive, setIsAmbientActive] = useState(false);
  const [ambientType, setAmbientType] = useState<'rain' | 'brown' | 'white'>('rain');
  const [volume, setVolume] = useState(0.04);
  const [completedSessions, setCompletedSessions] = useState(0);

  const initialSecondsRef = useRef(25 * 60);

  useEffect(() => {
    let timer: any = null;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      playSound('beep');
      const loggedMin = Math.round(initialSecondsRef.current / 60);
      setCompletedSessions((c) => c + 1);
      if (onSessionComplete) {
        onSessionComplete(loggedMin);
      }
      if (isAmbientActive) {
        stopAmbientNoise();
        setIsAmbientActive(false);
      }
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, timeLeft, onSessionComplete, isAmbientActive]);

  const handleStartPause = () => {
    if (!isRunning) {
      playSound('click');
      setIsRunning(true);
      if (isAmbientActive) {
        startAmbientNoise(ambientType);
      }
    } else {
      playSound('click');
      setIsRunning(false);
      if (isAmbientActive) {
        stopAmbientNoise();
      }
    }
  };

  const handleReset = (newMins?: number) => {
    playSound('click');
    setIsRunning(false);
    if (isAmbientActive) {
      stopAmbientNoise();
      setIsAmbientActive(false);
    }
    const mins = newMins || minutesSetting;
    setMinutesSetting(mins);
    initialSecondsRef.current = mins * 60;
    setTimeLeft(mins * 60);
  };

  const toggleAmbient = () => {
    if (isAmbientActive) {
      stopAmbientNoise();
      setIsAmbientActive(false);
    } else {
      setIsAmbientActive(true);
      startAmbientNoise(ambientType);
      setAmbientVolume(volume);
    }
  };

  const handleAmbientTypeChange = (type: 'rain' | 'brown' | 'white') => {
    setAmbientType(type);
    if (isAmbientActive) {
      startAmbientNoise(type);
      setAmbientVolume(volume);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setAmbientVolume(val);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPct =
    initialSecondsRef.current > 0
      ? ((initialSecondsRef.current - timeLeft) / initialSecondsRef.current) * 100
      : 0;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-[var(--text)] flex items-center gap-2">
            ⏱️ Temporizador Pomodoro & Enfoque
          </h3>
          <p className="text-xs text-[var(--text-soft)]">
            Sesiones de concentración profunda con sonido ambiente sintetizado.
          </p>
        </div>
        {completedSessions > 0 && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-[var(--blue)] border border-blue-500/20">
            🔥 {completedSessions} {completedSessions === 1 ? 'sesión completada' : 'sesiones completadas'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-2">
        {/* Timer Display & Controls */}
        <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-3 relative overflow-hidden">
          {/* Progress bar background */}
          <div
            className="absolute bottom-0 left-0 h-1 bg-[var(--blue)] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />

          <span className="text-4xl font-extrabold font-mono tracking-wider text-[var(--text)]">
            {formatTime(timeLeft)}
          </span>

          {/* Preset Buttons */}
          <div className="flex gap-1.5 text-xs">
            {[15, 25, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => handleReset(m)}
                className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  minutesSetting === m && !isRunning
                    ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                    : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleStartPause}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer transition-opacity ${
                isRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[var(--blue)] hover:opacity-90'
              }`}
            >
              {isRunning ? '⏸ Pausar' : '▶ Iniciar Enfoque'}
            </button>
            <button
              onClick={() => handleReset()}
              className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)] text-xs font-semibold rounded-xl hover:text-[var(--text)] cursor-pointer"
            >
              ↺ Reiniciar
            </button>
          </div>
        </div>

        {/* Ambient Sound Synthesizer */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--text)] flex items-center gap-1.5">
              🎧 Sonido de Fondo Concentración
            </span>
            <button
              onClick={toggleAmbient}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                isAmbientActive
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-[var(--card)] text-[var(--text-soft)] border border-[var(--border)] hover:text-[var(--text)]'
              }`}
            >
              {isAmbientActive ? '🔊 Reproduciendo' : '🔇 Silencioso'}
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            {[
              { id: 'rain', label: '🌧 Lluvia suave' },
              { id: 'brown', label: '🌊 Ruido Mar' },
              { id: 'white', label: '💨 Ruido Blanco' },
            ].map((snd) => (
              <button
                key={snd.id}
                onClick={() => handleAmbientTypeChange(snd.id as any)}
                className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer text-center ${
                  ambientType === snd.id
                    ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                    : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)]'
                }`}
              >
                {snd.label}
              </button>
            ))}
          </div>

          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[10px] text-[var(--text-faint)]">
              <span>Volumen ambiente</span>
              <span className="font-mono">{Math.round(volume * 1000)}%</span>
            </div>
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.005"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full accent-[var(--blue)] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
