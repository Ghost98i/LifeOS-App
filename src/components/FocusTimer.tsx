import React, { useState, useEffect, useRef, useMemo } from 'react';
import { playSound } from '../lib/audio';
import { StudyAmbientPlayer } from './StudyAmbientPlayer';
import { StudyActiveSession, StudySessionPhase } from '../types';
import { assessStudySession, getNextPomodoroPhase, formatStudyDuration, type PomodoroSessionConfig } from '../lib/studyFlows';

interface FocusTimerProps {
  targets?: { id: string; label: string }[];
  activeSession?: StudyActiveSession | null;
  onStartSession?: (
    minutes: number,
    targetSubjectId?: string | null,
    pomodoroConfig?: PomodoroSessionConfig
  ) => void;
  onPauseSession?: () => void;
  onResumeSession?: () => void;
  onResetSession?: (minutes?: number) => void;
  onFinishEarly?: (actualMinutes?: number) => void;
  onSessionComplete?: (sessionId: string, minutesLogged: number, phase?: StudySessionPhase) => void;
  onDiscardSession?: () => void;
  onAdvancePhase?: (sessionId: string, nextPhase: StudySessionPhase, nextCycle: number, nextMinutes: number, config: PomodoroSessionConfig) => void;
}

export const FocusTimer: React.FC<FocusTimerProps> = ({
  targets = [],
  activeSession,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onResetSession,
  onFinishEarly,
  onSessionComplete,
  onDiscardSession,
  onAdvancePhase,
}) => {
  // Configuración de fases Pomodoro
  const [phase, setPhase] = useState<StudySessionPhase>('focus');
  const [cycle, setCycle] = useState<number>(1);
  const totalCycles = 4;

  const [focusMinutes, setFocusMinutes] = useState(25);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(15);

  const [targetId, setTargetId] = useState('');

  const [recoveryOverride, setRecoveryOverride] = useState<{ sessionId: string; value: string } | null>(null);

  // Sincronizar targetId y fase con sesión activa si existe
  useEffect(() => {
    if (activeSession) {
      setTargetId(activeSession.targetSubjectId || '');
      if (activeSession.phase) {
        setPhase(activeSession.phase);
      }
      if (activeSession.cycle) {
        setCycle(activeSession.cycle);
      }
      if (activeSession.focusMinutes) setFocusMinutes(activeSession.focusMinutes);
      if (activeSession.shortBreakMinutes) setShortBreakMinutes(activeSession.shortBreakMinutes);
      if (activeSession.longBreakMinutes) setLongBreakMinutes(activeSession.longBreakMinutes);
      if (activeSession.phase === 'short_break') {
        setShortBreakMinutes(activeSession.plannedMinutes);
      } else if (activeSession.phase === 'long_break') {
        setLongBreakMinutes(activeSession.plannedMinutes);
      } else {
        setFocusMinutes(activeSession.plannedMinutes);
      }
    }
  }, [activeSession]);

  // Evaluación en tiempo real del estado de la sesión activa
  const [assessment, setAssessment] = useState(() =>
    activeSession ? assessStudySession(activeSession) : null
  );

  useEffect(() => {
    if (!activeSession) {
      setAssessment(null);
      return;
    }
    const update = () => {
      setAssessment(assessStudySession(activeSession));
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [activeSession]);

  const sessionRunning = activeSession?.status === 'running';
  const isRunning = sessionRunning && assessment?.status === 'running';
  const isPaused = activeSession?.status === 'paused';
  const isInterrupted = assessment?.status === 'interrupted_offline';
  const isCompletedPending = assessment?.status === 'completed';
  const isPendingReview = Boolean(isInterrupted || isCompletedPending);
  const isBreakPhase = activeSession?.phase === 'short_break' || activeSession?.phase === 'long_break';
  const confirmedMinutes = activeSession?.endsAt && activeSession.lastTickAt
    ? Math.max(0, Math.min(activeSession.plannedMinutes,
      Math.floor((activeSession.plannedMinutes * 60 - Math.max(0, Math.ceil((activeSession.endsAt - activeSession.lastTickAt) / 1000))) / 60)))
    : 0;
  const recoveryValue = recoveryOverride && activeSession && recoveryOverride.sessionId === activeSession.id
    ? recoveryOverride.value
    : String(confirmedMinutes);

  // Minutos asignados a la fase actual cuando no hay sesión activa
  const currentPhaseMinutes = useMemo(() => {
    if (phase === 'short_break') return shortBreakMinutes;
    if (phase === 'long_break') return longBreakMinutes;
    return focusMinutes;
  }, [phase, shortBreakMinutes, longBreakMinutes, focusMinutes]);

  // Segundos restantes a mostrar
  const timeLeft = useMemo(() => {
    if (assessment) return assessment.remainingSeconds;
    return currentPhaseMinutes * 60;
  }, [assessment, currentPhaseMinutes]);

  // Finalización automática al llegar a 0 en vivo
  const hasTriggeredCompleteRef = useRef(false);
  const prevRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!assessment) return;

    const prev = prevRemainingRef.current;
    prevRemainingRef.current = assessment.remainingSeconds;

    const isLiveCountdownFinished = prev !== null && prev > 0 && assessment.remainingSeconds === 0;

    if (
      sessionRunning &&
      !isInterrupted &&
      isLiveCountdownFinished &&
      !hasTriggeredCompleteRef.current
    ) {
      hasTriggeredCompleteRef.current = true;
      const finishedPhase = activeSession.phase || 'focus';

      if (finishedPhase === 'focus') {
        playSound('beep');
        const next = getNextPomodoroPhase('focus', cycle, totalCycles);
        setPhase(next.nextPhase);
        setCycle(next.nextCycle);
        const nextMins = next.nextPhase === 'long_break' ? longBreakMinutes : shortBreakMinutes;
        onAdvancePhase?.(activeSession.id, next.nextPhase, next.nextCycle, nextMins, {
          phase: next.nextPhase, cycle: next.nextCycle, totalCycles,
          focusMinutes, shortBreakMinutes, longBreakMinutes,
        });
      } else {
        // Fin de descanso: sonido suave y volver a enfoque
        playSound('night');
        const next = getNextPomodoroPhase(finishedPhase, cycle, totalCycles);
        setPhase(next.nextPhase);
        setCycle(next.nextCycle);
        onAdvancePhase?.(activeSession.id, next.nextPhase, next.nextCycle, focusMinutes, {
          phase: next.nextPhase, cycle: next.nextCycle, totalCycles,
          focusMinutes, shortBreakMinutes, longBreakMinutes,
        });
      }
    } else if (assessment.remainingSeconds > 0) {
      hasTriggeredCompleteRef.current = false;
    }
  }, [
    sessionRunning,
    assessment,
    isInterrupted,
    activeSession,
    cycle,
    totalCycles,
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    onSessionComplete,
    onAdvancePhase,
  ]);

  // Controles del temporizador
  const handleStartPause = () => {
    playSound('click');
    if (!activeSession) {
      const selectedSubId = targetId && targetId.trim() ? targetId.trim() : null;
      onStartSession?.(currentPhaseMinutes, selectedSubId, {
        phase,
        cycle,
        totalCycles,
        focusMinutes,
        shortBreakMinutes,
        longBreakMinutes,
      });
    } else if (isRunning) {
      onPauseSession?.();
    } else if (isPaused) {
      onResumeSession?.();
    }
  };

  const handleReset = (newMins?: number) => {
    playSound('click');
    const mins = newMins || currentPhaseMinutes;
    if (phase === 'focus') setFocusMinutes(mins);
    else if (phase === 'short_break') setShortBreakMinutes(mins);
    else setLongBreakMinutes(mins);
    onResetSession?.(mins);
  };

  const handleFinishEarly = () => {
    playSound('click');
    if ((activeSession?.phase || phase) === 'focus') {
      const elapsedMinutes = assessment ? assessment.effectiveMinutes : 0;
      onFinishEarly?.(elapsedMinutes);
    } else {
      // Omitir descanso y regresar a enfoque
      const next = getNextPomodoroPhase(phase, cycle, totalCycles);
      setPhase(next.nextPhase);
      setCycle(next.nextCycle);
      onResetSession?.(focusMinutes);
    }
  };

  const handleSelectPhase = (newPhase: StudySessionPhase) => {
    if (activeSession) return;
    playSound('click');
    setPhase(newPhase);
    let mins = focusMinutes;
    if (newPhase === 'short_break') mins = shortBreakMinutes;
    if (newPhase === 'long_break') mins = longBreakMinutes;
    onResetSession?.(mins);
  };

  const handleRecoverSession = () => {
    if (!activeSession) return;
    if (!isBreakPhase) {
      const minutes = isInterrupted ? Number(recoveryValue) : activeSession.plannedMinutes;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > activeSession.plannedMinutes) return;
      playSound('success');
      onSessionComplete?.(activeSession.id, minutes, 'focus');
    } else {
      const next = getNextPomodoroPhase(activeSession.phase || 'short_break', activeSession.cycle || cycle, totalCycles);
      setPhase(next.nextPhase);
      setCycle(next.nextCycle);
      onResetSession?.(focusMinutes);
    }
  };

  const handleDiscardSession = () => {
    playSound('click');
    onDiscardSession?.();
  };

  // Controles del Mezclador
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const plannedTotalSeconds = (activeSession?.plannedMinutes || currentPhaseMinutes) * 60;
  const progressPct =
    plannedTotalSeconds > 0
      ? Math.max(0, Math.min(100, ((plannedTotalSeconds - timeLeft) / plannedTotalSeconds) * 100))
      : 0;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Encabezado del Temporizador y Selector de Fases Pomodoro */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)]/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-base text-[var(--text)] tracking-tight">
              Enfoque
            </h3>
          </div>
        </div>

        {/* Indicador de Ciclos Pomodoro */}
        <div className="flex items-center gap-2 bg-[var(--surface-muted)] px-3 py-1.5 rounded-xl border border-[var(--border)] self-start sm:self-auto">
          <span className="text-xs font-semibold text-[var(--text-soft)]">
            Ciclo {cycle} de {totalCycles}
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalCycles }).map((_, idx) => {
              const pipNumber = idx + 1;
              const isPast = pipNumber < cycle;
              const isCurrent = pipNumber === cycle;
              return (
                <span
                  key={pipNumber}
                  title={`Ciclo ${pipNumber} de ${totalCycles}`}
                  className={`inline-block h-2.5 w-2.5 rounded-full transition-all ${
                    isCurrent
                      ? 'bg-indigo-600 dark:bg-indigo-400 ring-2 ring-indigo-500/30 scale-110'
                      : isPast
                      ? 'bg-emerald-500'
                      : 'bg-[var(--border)]'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Selector Rápido de Fase (Enfoque / Descanso Corto / Descanso Largo) */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={Boolean(activeSession)}
          onClick={() => handleSelectPhase('focus')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-70 ${
            phase === 'focus'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)]'
          }`}
        >
          <span>Enfoque</span>
        </button>

        <button
          type="button"
          disabled={Boolean(activeSession)}
          onClick={() => handleSelectPhase('short_break')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-70 ${
            phase === 'short_break'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)]'
          }`}
        >
          <span>Descanso corto</span>
        </button>

        <button
          type="button"
          disabled={Boolean(activeSession)}
          onClick={() => handleSelectPhase('long_break')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-70 ${
            phase === 'long_break'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)]'
          }`}
        >
          <span>Descanso largo</span>
        </button>
      </div>

      {/* Banner de recuperación para sesiones interrumpidas */}
      {(isInterrupted || isCompletedPending) && activeSession && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[var(--text)]">
              {isBreakPhase ? 'Descanso finalizado' : isInterrupted ? 'Sesión interrumpida' : 'Sesión completada'}
            </span>
            <span className="text-[11px] text-[var(--text-soft)]">
              Materia: <strong>{activeSession.targetSubjectName || 'General'}</strong>
            </span>
          </div>
          {isInterrupted && !isBreakPhase && (
            <label className="flex items-center gap-2 text-[11px] text-[var(--text-soft)]">
              Minutos efectivamente estudiados
              <input type="number" min="1" max={activeSession.plannedMinutes} value={recoveryValue}
                onChange={(event) => setRecoveryOverride({ sessionId: activeSession.id, value: event.target.value })}
                className="w-16 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[var(--text)]" />
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleDiscardSession}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-soft)] hover:text-red-500 font-semibold cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleRecoverSession}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer shadow-xs"
            >
              {isBreakPhase ? 'Continuar' : isInterrupted ? 'Registrar tiempo' : `Registrar ${formatStudyDuration(activeSession.plannedMinutes)}`}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CUERPO CENTRAL: Selector de Materia + Reloj Digital + Botones */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 flex flex-col items-center justify-center text-center space-y-4">
        {/* Barra de progreso inferior */}
        <div
          className={`absolute bottom-0 left-0 h-1.5 transition-all duration-300 ${
            phase === 'focus'
              ? 'bg-indigo-600 dark:bg-indigo-500'
              : phase === 'short_break'
              ? 'bg-emerald-500'
              : 'bg-teal-500'
          }`}
          style={{ width: `${progressPct}%` }}
        />

        {/* Selector directo de materia (siempre visible y accesible en área principal) */}
        <div className="w-full max-w-sm flex items-center justify-center gap-2">
          <label htmlFor="focus-subject-select" className="text-xs font-bold text-[var(--text-soft)] shrink-0">
            Materia:
          </label>
          <select
            id="focus-subject-select"
            disabled={Boolean(isRunning || isPaused)}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex-1 min-h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--text)] cursor-pointer disabled:opacity-60 focus:border-indigo-500 outline-hidden"
          >
            <option value="">General (sin materia asignada)</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </div>

        {/* Display de tiempo grande y claro */}
        <div className="py-2">
          <p className="mb-2 text-xs font-semibold text-[var(--text-soft)]">
            {phase === 'focus' ? 'Enfoque' : phase === 'short_break' ? 'Descanso corto' : 'Descanso largo'} · {activeSession?.plannedMinutes || currentPhaseMinutes} min
          </p>
          <div className="text-5xl sm:text-6xl font-black tabular-nums tracking-wider text-[var(--text)]">
            {formatTime(timeLeft)}
          </div>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isRunning
                  ? 'bg-emerald-500 animate-pulse'
                  : isPaused
                  ? 'bg-amber-400'
                  : 'bg-[var(--text-faint)]'
              }`}
            />
            <span className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wider">
              {isRunning
                ? phase === 'focus'
                  ? 'Concentración en curso'
                  : 'Descanso en curso'
                : isPaused
                ? 'En pausa'
                : phase === 'focus'
                ? 'Listo para estudiar'
                : 'Listo para descansar'}
            </span>
          </div>
        </div>

        {/* Presets rápidos de minutos para la fase actual */}
        {!isRunning && !isPaused && !isPendingReview && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1" aria-label="Elegir duración">
            {(phase === 'focus'
              ? [15, 25, 45, 60]
              : phase === 'short_break'
              ? [3, 5, 10]
              : [10, 15, 20, 30]
            ).map((m) => {
              const isSelected = currentPhaseMinutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleReset(m)}
                  className={`min-h-8 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500'
                      : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  {m} min
                </button>
              );
            })}
          </div>
        )}

        {/* Botones de acción principales */}
        {!isPendingReview && <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleStartPause}
            className={`min-h-11 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm cursor-pointer transition-all active:scale-95 ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-700'
                : phase === 'focus'
                ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isRunning
              ? '⏸ Pausar'
              : isPaused
              ? '▶ Reanudar'
              : phase === 'focus'
              ? '▶ Iniciar Enfoque'
              : '▶ Iniciar Descanso'}
          </button>

          {(isRunning || isPaused) && (
            <button
              type="button"
              onClick={handleFinishEarly}
              className="min-h-11 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-bold rounded-xl hover:border-indigo-500 cursor-pointer transition-colors"
              title={
                phase === 'focus'
                  ? 'Terminar y registrar el tiempo transcurrido hasta ahora'
                  : 'Omitir descanso y pasar al siguiente bloque'
              }
            >
              {phase === 'focus' ? 'Terminar ahora' : 'Omitir descanso'}
            </button>
          )}

          <button
            type="button"
            onClick={() => handleReset()}
            className="min-h-11 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)] text-xs font-semibold rounded-xl hover:text-[var(--text)] cursor-pointer transition-colors"
          >
            ↺ Reiniciar
          </button>
        </div>}
      </div>

      <StudyAmbientPlayer running={Boolean(isRunning)} />
    </div>
  );
};
