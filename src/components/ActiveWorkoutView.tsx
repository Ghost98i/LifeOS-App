import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseEquipment, GymActiveTimer, GymSession, GymSet, MuscleGroup } from '../types';
import { EXERCISE_EQUIPMENT_OPTIONS, inferExerciseEquipment, inferMuscleGroup } from '../lib/gymMigration';
import { getPerformedGymVolume } from '../lib/gymFlows';
import type { ExerciseMetricTarget } from '../lib/gymMetrics';
import { AppIcon } from './AppIcon';
import { playSound, playTimerCountdownTone } from '../lib/audio';
import { showToast } from '../lib/toast';
import { GymExerciseArtwork } from './visual/GymExerciseArtwork';
import { LifeOSLottie } from './visual/LifeOSLottie';
import { motionItemKey } from '../lib/motion';

interface PreviousSetReference {
  weight: number;
  reps: number;
}

interface AddExercisePayload {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: ExerciseEquipment;
  barWeight: number;
  initialWeight: number;
  initialReps: number;
}

export interface ActiveWorkoutViewProps {
  session: GymSession;
  exerciseIndex: number;
  setIndex: number;
  previousSet?: PreviousSetReference | null;
  previousSessionBest?: string | null;
  previousGhostSets?: Array<{ weight: number; reps: number }> | null;
  completionMotion?: { setKey: string; nonce: number } | null;
  restTimer?: React.ReactNode;
  activeTimer?: GymActiveTimer | null;
  exerciseSuggestions: string[];
  onSelectExercise: (exerciseIndex: number) => void;
  onSelectSet: (setIndex: number) => void;
  onAdjustWeight: (delta: number) => void;
  onAdjustReps: (delta: number) => void;
  onUpdateCurrentSet: (updates: Partial<GymSet>) => void;
  onToggleCurrentSet: () => void;
  onToggleSet?: (setIndex: number) => void;
  onUpdateSetByIndex?: (setIndex: number, updates: Partial<GymSet>) => void;
  onAddSet: (exerciseIndex: number) => void;
  onDeleteSet: (exerciseIndex: number, setIndex: number) => void;
  onAddExercise: (payload: AddExercisePayload) => void;
  onDeleteExercise: (exerciseIndex: number) => void;
  onUpdateEquipment: (exerciseIndex: number, equipment: ExerciseEquipment, barWeight?: number) => void;
  onUpdateBarWeight: (exerciseIndex: number, barWeight: number) => void;
  onPropagateExercise: (
    name: string,
    config: { equipment: ExerciseEquipment; barWeight: number; muscleGroup?: MuscleGroup }
  ) => void;
  onOpenCalculator: (exerciseIndex: number, setIndex: number, initialWeight: number, barWeight: number) => void;
  onOpenHistory: (target: ExerciseMetricTarget) => void;
  onOpenHistoryTab: () => void;
  onOpenProgressTab: () => void;
  onOpenSettings?: () => void;
  onFinish: () => void;
  onDeleteSession: () => void;
  onSaveAsTemplate: () => void;
  onEditSessionDate: (date: string) => void;
  onEditSessionWeek: (weekLabel: string) => void;
  onEditSessionTimes?: (startedAt: string | null, finishedAt: string | null) => void;
  onAdjustRestTimer?: (deltaSeconds: number) => void;
  onTogglePauseRestTimer?: () => void;
  onSkipRestTimer?: () => void;
  onCompleteRestTimer?: () => void;
  onToggleMinimizeRest?: () => void;
}

const controlClass =
  'min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text)] outline-none transition-colors focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-soft)]';

function setProgress(session: GymSession) {
  return session.exercises.reduce(
    (acc, exercise) => {
      acc.total += exercise.sets?.length || 0;
      acc.completed += exercise.sets?.filter((set) => set.completed === true).length || 0;
      return acc;
    },
    { completed: 0, total: 0 }
  );
}

function plateDescription(equipment: ExerciseEquipment, weight: number, barWeight: number) {
  if (equipment === 'barra' && barWeight > 0) {
    const perSide = Math.max(0, (weight - barWeight) / 2);
    return `${perSide} kg por lado · barra de ${barWeight} kg`;
  }
  if (equipment === 'mancuerna') return `Mancuerna de ${weight} kg`;
  if (equipment === 'polea') return `Polea · ${weight} kg`;
  if (equipment === 'maquina') return `Máquina · ${weight} kg`;
  if (equipment === 'corporal') return weight > 0 ? `Peso corporal + ${weight} kg` : 'Peso corporal';
  return `${weight} kg`;
}

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~276.46

export const ActiveWorkoutView: React.FC<ActiveWorkoutViewProps> = ({
  session,
  exerciseIndex,
  setIndex,
  previousSet,
  previousSessionBest,
  completionMotion,
  restTimer,
  activeTimer,
  exerciseSuggestions,
  onSelectExercise,
  onSelectSet,
  onAdjustWeight,
  onAdjustReps,
  onUpdateCurrentSet,
  onToggleCurrentSet,
  onAddSet,
  onDeleteSet,
  onAddExercise,
  onDeleteExercise,
  onUpdateEquipment,
  onUpdateBarWeight,
  onPropagateExercise,
  onOpenCalculator,
  onOpenHistory,
  onOpenHistoryTab,
  onOpenProgressTab,
  onOpenSettings,
  onFinish,
  onDeleteSession,
  onSaveAsTemplate,
  onEditSessionDate,
  onEditSessionWeek,
  onEditSessionTimes,
  onAdjustRestTimer,
  onTogglePauseRestTimer,
  onSkipRestTimer,
  onCompleteRestTimer,
  onToggleMinimizeRest,
}) => {
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscle, setNewExerciseMuscle] = useState<MuscleGroup>('Pecho');
  const [newExerciseEquipment, setNewExerciseEquipment] = useState<ExerciseEquipment>('barra');
  const [newExerciseBar, setNewExerciseBar] = useState(20);
  const [newExerciseWeight, setNewExerciseWeight] = useState(40);
  const [newExerciseReps, setNewExerciseReps] = useState(10);
  const [isReviewingPreviousSet, setIsReviewingPreviousSet] = useState(false);

  const safeExerciseIndex = Math.max(0, Math.min(exerciseIndex, session.exercises.length - 1));
  const exercise = session.exercises[safeExerciseIndex];
  const sets = useMemo(() => exercise?.sets || [], [exercise?.sets]);
  const safeSetIndex = Math.max(0, Math.min(setIndex, Math.max(0, sets.length - 1)));
  const currentSet = sets[safeSetIndex];
  const progress = setProgress(session);
  const nextExercise = session.exercises[safeExerciseIndex + 1];
  const equipment = exercise
    ? exercise.equipment || (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : 'mancuerna')
    : 'mancuerna';
  const visualEquipment = exercise?.equipment || (exercise?.barWeight && exercise.barWeight > 0 ? 'barra' : undefined);
  const barWeight = exercise?.barWeight ?? (equipment === 'barra' ? 20 : 0);
  const sessionTitle = session.weekLabel?.trim() || 'Entrenamiento activo';

  // Precision countdown clock derived directly from endsAt timestamp
  const isPaused = Boolean(activeTimer?.pausedAt);
  const timerEndsAt = activeTimer?.endsAt;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const left = timerEndsAt
    ? (isPaused
        ? (activeTimer?.remainingSecondsWhenPaused ?? Math.max(0, Math.ceil((timerEndsAt - (activeTimer?.pausedAt ?? nowMs)) / 1000)))
        : Math.max(0, Math.ceil((timerEndsAt - nowMs) / 1000)))
    : 0;

  const lastChimeSecondRef = useRef<number | null>(null);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    setIsReviewingPreviousSet(false);
    hasFinishedRef.current = false;
    lastChimeSecondRef.current = null;
  }, [activeTimer?.setId, activeTimer?.exerciseId, activeTimer?.endsAt, isPaused]);

  useEffect(() => {
    if (!timerEndsAt) return;
    const tick = () => {
      const now = Date.now();
      setNowMs(now);

      const remaining = isPaused
        ? (activeTimer?.remainingSecondsWhenPaused ?? Math.max(0, Math.ceil((timerEndsAt - (activeTimer?.pausedAt ?? now)) / 1000)))
        : Math.max(0, Math.ceil((timerEndsAt - now) / 1000));

      if (!isPaused && remaining <= 3 && remaining >= 0 && lastChimeSecondRef.current !== remaining) {
        lastChimeSecondRef.current = remaining;
        playTimerCountdownTone(remaining);
      }

      if (!isPaused && remaining <= 0) {
        if (!hasFinishedRef.current) {
          hasFinishedRef.current = true;
          playSound('success');
          showToast('Descanso finalizado. ¡Siguiente serie lista!', 'info');
          if (onCompleteRestTimer) onCompleteRestTimer();
          else if (onSkipRestTimer) onSkipRestTimer();
        }
      }
    };

    const interval = window.setInterval(tick, 250);
    tick();

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
  }, [timerEndsAt, isPaused, activeTimer?.pausedAt, activeTimer?.remainingSecondsWhenPaused, onCompleteRestTimer, onSkipRestTimer]);

  const selectExercise = (index: number) => {
    const selectedExercise = session.exercises[index];
    const firstIncomplete = selectedExercise?.sets?.findIndex((set) => !set.completed) ?? -1;
    onSelectExercise(index);
    onSelectSet(firstIncomplete >= 0 ? firstIncomplete : 0);
    setIsReviewingPreviousSet(false);
  };

  const submitExercise = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newExerciseName.trim();
    if (!name) return;
    onAddExercise({
      name,
      muscleGroup: newExerciseMuscle,
      equipment: newExerciseEquipment,
      barWeight: newExerciseEquipment === 'barra' ? newExerciseBar : 0,
      initialWeight: newExerciseWeight,
      initialReps: newExerciseReps,
    });
    setNewExerciseName('');
  };

  // Rest state determination
  const isTimerRunning = Boolean(activeTimer && left > 0);
  const restingExerciseIndex = activeTimer?.exerciseIndex ?? safeExerciseIndex;
  const isRestingThisExercise = isTimerRunning && restingExerciseIndex === safeExerciseIndex;
  const isRestPhaseActive = isRestingThisExercise && !activeTimer?.minimized && !isReviewingPreviousSet;

  // Resting exercise and completed set (for contextual review and next effort preview)
  const restingExercise = session.exercises[restingExerciseIndex] ?? exercise;
  const completedSetIndex = restingExercise?.sets?.findIndex((s) => s.id === activeTimer?.setId) ?? (safeSetIndex > 0 ? safeSetIndex - 1 : 0);
  const completedSet = restingExercise?.sets?.[completedSetIndex >= 0 ? completedSetIndex : 0] ?? currentSet;

  // Next effort preview calculation (bound strictly to the real rest event)
  let nextEffortTarget = '';
  let nextEffortTitle = '';
  let nextEffortButtonText = 'Comenzar siguiente serie →';

  if (activeTimer?.kind === 'exercise') {
    const targetExIdx = typeof activeTimer.targetExerciseIndex === 'number'
      ? activeTimer.targetExerciseIndex
      : restingExerciseIndex + 1;
    if (targetExIdx < session.exercises.length) {
      const nextEx = session.exercises[targetExIdx];
      const nextSetIdx = nextEx.sets?.findIndex((s) => !s.completed) ?? 0;
      const nextSet = nextEx.sets?.[nextSetIdx >= 0 ? nextSetIdx : 0];
      nextEffortTarget = nextSet ? `${nextSet.weight} kg × ${nextSet.reps} reps` : '';
      nextEffortTitle = `Siguiente ejercicio: ${nextEx.name}${nextSet ? ` · Serie ${nextSetIdx + 1} de ${nextEx.sets.length}` : ''}`;
      nextEffortButtonText = 'Pasar al siguiente ejercicio →';
    } else {
      nextEffortTitle = '¡Último ejercicio completado! Sesión lista para finalizar';
      nextEffortButtonText = 'Finalizar sesión →';
    }
  } else {
    // kind === 'set'
    const pendingSetIdx = restingExercise?.sets?.findIndex((s) => !s.completed) ?? -1;
    if (pendingSetIdx >= 0) {
      const pendingSet = restingExercise.sets[pendingSetIdx];
      nextEffortTarget = `${pendingSet.weight} kg × ${pendingSet.reps} reps`;
      nextEffortTitle = `Serie ${pendingSetIdx + 1} de ${restingExercise.sets.length} · ${restingExercise.name}`;
      nextEffortButtonText = `Comenzar Serie ${pendingSetIdx + 1} Ahora →`;
    } else if (restingExerciseIndex < session.exercises.length - 1) {
      const nextEx = session.exercises[restingExerciseIndex + 1];
      const nextSet = nextEx?.sets?.[0];
      nextEffortTarget = nextSet ? `${nextSet.weight} kg × ${nextSet.reps} reps` : '';
      nextEffortTitle = `Siguiente ejercicio: ${nextEx.name}`;
      nextEffortButtonText = 'Pasar al siguiente ejercicio →';
    } else {
      nextEffortTitle = 'Todas las series de la sesión han sido completadas';
      nextEffortButtonText = 'Finalizar sesión →';
    }
  }

  // Timer dial metrics
  const timerDuration = activeTimer?.durationSeconds || 90;
  const timerProgress = Math.max(0, Math.min(1, left / timerDuration));
  const dashOffset = RING_CIRCUMFERENCE * (1 - timerProgress);
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const formattedTimer = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleSkipOrAdvance = () => {
    setIsReviewingPreviousSet(false);
    if (nextEffortButtonText.includes('Finalizar sesión')) {
      if (onSkipRestTimer) onSkipRestTimer();
      onFinish();
    } else {
      if (onSkipRestTimer) onSkipRestTimer();
      else if (onCompleteRestTimer) onCompleteRestTimer();
    }
  };

  const handleReviewCompletedSet = () => {
    setIsReviewingPreviousSet(true);
    if (completedSetIndex >= 0) {
      onSelectSet(completedSetIndex);
    }
  };

  return (
    <section data-active-workout-view className="gym-workout-shell mx-auto w-full min-w-0 max-w-[1240px] space-y-4 overflow-x-hidden">
      {/* 1. Barra Superior Operativa */}
      <header className="gym-workout-topbar flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="gym-live-label"><span aria-hidden="true" /> Sesión activa</p>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">{sessionTitle}</h1>
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-soft)]">
              {progress.completed}/{progress.total} series
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Iniciado {session.startedAt || 'hoy'} · {getPerformedGymVolume(session).toLocaleString('es-UY')} kg realizados
          </p>
        </div>

        <details className="group relative shrink-0">
          <summary
            aria-label="Acciones de la sesión: finalizar o salir sin perder datos"
            className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            <AppIcon name="more" className="h-4 w-4" />
            Acciones
          </summary>
          <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
              >
                <AppIcon name="clock" className="h-4 w-4 text-[var(--text-soft)]" />
                Ajustes de descanso
              </button>
            )}
            <button
              type="button"
              onClick={onOpenHistoryTab}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
            >
              <AppIcon name="calendar" className="h-4 w-4 text-[var(--text-soft)]" />
              Salir sin finalizar · conservar sesión
            </button>
            <button
              type="button"
              onClick={onOpenProgressTab}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
            >
              <AppIcon name="activity" className="h-4 w-4 text-[var(--text-soft)]" />
              Ver progreso
            </button>
            <button
              type="button"
              onClick={onFinish}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
            >
              <AppIcon name="checkCircle" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Finalizar sesión
            </button>
            <button
              type="button"
              onClick={onSaveAsTemplate}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
            >
              <AppIcon name="note" className="h-4 w-4 text-[var(--text-soft)]" />
              Guardar como plantilla
            </button>
            <button
              type="button"
              onClick={onDeleteSession}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
            >
              <AppIcon name="trash" className="h-4 w-4" />
              Eliminar sesión
            </button>
          </div>
        </details>
      </header>

      {exercise ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,780px)_minmax(320px,1fr)]">
          {/* COCKPIT PRINCIPAL */}
          <main data-active-set-editor className="gym-cockpit-wrap min-w-0 space-y-3">
            {/* Aviso Contextual si el usuario navega a otro ejercicio mientras corre un descanso */}
            {!isRestingThisExercise && isTimerRunning && (
              <div className="flex items-center justify-between rounded-xl bg-[var(--blue-soft)] border border-[var(--blue)]/30 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <AppIcon name="clock" className="h-4 w-4 text-[var(--blue)] shrink-0" />
                  <span className="font-semibold text-[var(--text)]">
                    Descanso de {restingExercise.name}: <strong className="tabular-nums font-bold text-[var(--blue)]">{formattedTimer}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => selectExercise(restingExerciseIndex)}
                    className="min-h-11 font-bold text-[var(--blue)] hover:underline"
                  >
                    Ver descanso
                  </button>
                  <button
                    type="button"
                    onClick={() => onSkipRestTimer?.()}
                    className="min-h-11 rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 py-1 font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
                  >
                    Saltar
                  </button>
                </div>
              </div>
            )}

            {/* Aviso si está revisando una serie completada durante un descanso */}
            {isReviewingPreviousSet && isTimerRunning && (
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 text-xs">
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  Revisando Serie {completedSetIndex + 1} ({completedSet.weight} kg × {completedSet.reps}) · Descanso: <strong className="tabular-nums">{formattedTimer}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsReviewingPreviousSet(false);
                    const firstIncomplete = exercise.sets?.findIndex((s) => !s.completed) ?? -1;
                    if (firstIncomplete >= 0) onSelectSet(firstIncomplete);
                  }}
                  className="min-h-11 font-bold text-[var(--blue)] hover:underline ml-2"
                >
                  Volver al descanso →
                </button>
              </div>
            )}

            {/* 1. NÚCLEO ESTABLE: Header Card */}
            <div className="c-header-card">
              {/* Fila Superior: Paginador de Sesión y Herramientas Contextuales */}
              <div className="c-header-utility-row">
                <div className="c-nav-pager">
                  <button
                    type="button"
                    className="c-pager-btn min-h-11"
                    onClick={() => selectExercise(safeExerciseIndex - 1)}
                    disabled={safeExerciseIndex === 0}
                    aria-label="Ejercicio anterior"
                    title="Ejercicio anterior"
                  >
                    ‹
                  </button>
                  <span className="c-pager-label">Ejercicio {safeExerciseIndex + 1} de {session.exercises.length}</span>
                  <button
                    type="button"
                    className="c-pager-btn min-h-11"
                    onClick={() => selectExercise(safeExerciseIndex + 1)}
                    disabled={safeExerciseIndex >= session.exercises.length - 1}
                    aria-label="Ejercicio siguiente"
                    title="Ejercicio siguiente"
                  >
                    ›
                  </button>
                </div>

                <div className="c-header-tools">
                  {equipment === 'barra' && currentSet && (
                    <button
                      type="button"
                      className="c-tool-btn min-h-11"
                      onClick={() => onOpenCalculator(safeExerciseIndex, safeSetIndex, Number(currentSet.weight) || 40, barWeight)}
                      title="Calculadora gráfica de discos de barra"
                    >
                      <AppIcon name="dumbbell" className="h-3.5 w-3.5" />
                      <span>Discos</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="c-tool-btn min-h-11"
                    onClick={() => onOpenHistory({ exerciseId: exercise.id, exerciseName: exercise.name })}
                    title="Historial de marcas y récords personales"
                  >
                    <AppIcon name="activity" className="h-3.5 w-3.5" />
                    <span>PRs</span>
                  </button>
                </div>
              </div>

              {/* Fila Principal: Badge Biomecánico y Título a Ancho Completo */}
              <div className="c-header-main-row">
                <div className="c-art-badge" aria-hidden="true">
                  <GymExerciseArtwork name={exercise.name} equipment={visualEquipment} className="c-art-badge-icon" />
                </div>
                <div className="c-meta">
                  <h2 className="c-exercise-title">{exercise.name}</h2>
                  <div className="c-meta-sub">
                    <span>{exercise.muscleGroup || 'General'}</span>
                    <span>· {plateDescription(equipment, Number(currentSet?.weight) || 0, barWeight)}</span>
                    {nextExercise && <span className="opacity-75">· Después: {nextExercise.name}</span>}
                    {currentSet && (
                      <button
                        type="button"
                        onClick={() => onUpdateCurrentSet({ type: currentSet.type === 'warmup' ? 'normal' : 'warmup' })}
                        className={`c-warmup-pill min-h-11 cursor-pointer ${currentSet.type === 'warmup' ? '' : 'opacity-60 bg-[var(--surface-muted)] text-[var(--text-soft)] border-[var(--border)]'}`}
                        title={currentSet.type === 'warmup' ? 'Serie de aproximación · Clic para hacerla efectiva' : 'Serie efectiva · Clic para marcar como aproximación'}
                      >
                        {currentSet.type === 'warmup' ? 'Aproximación' : 'Efectiva'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tira Táctil de Series Unificada */}
              <div className="c-series-strip" aria-label="Series del ejercicio">
                {sets.map((set, idx) => {
                  const isSelected = idx === safeSetIndex;
                  const isDone = Boolean(set.completed);
                  const isWarmup = set.type === 'warmup';
                  const setMotionKey = motionItemKey(exercise.id, set.id, idx);
                  const showCompletionMotion = completionMotion?.setKey === setMotionKey;

                  return (
                    <button
                      key={set.id || idx}
                      type="button"
                      onClick={() => onSelectSet(idx)}
                      className={`c-set-pill min-h-11 ${isSelected ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
                      title={`Serie ${idx + 1}: ${set.weight} kg × ${set.reps} repeticiones`}
                      aria-label={`Serie ${idx + 1}: ${set.weight} kilogramos, ${set.reps} repeticiones${isDone ? ', realizada' : ', pendiente'}`}
                    >
                      <div className="c-set-pill-top">
                        <span>{isWarmup ? 'Apx' : `S${idx + 1}`}</span>
                        {isDone && (
                          showCompletionMotion ? (
                            <LifeOSLottie
                              key={completionMotion.nonce}
                              src="/motion/lifeos-micro-check-violet.json"
                              size={14}
                              speed={1.35}
                              decorative
                              className="shrink-0"
                              fallback={<span className="c-check">✓</span>}
                            />
                          ) : (
                            <span className="c-check">✓</span>
                          )
                        )}
                      </div>
                      <div className="c-set-pill-weight">{set.weight} kg <span aria-hidden="true">×</span> {set.reps}</div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => onAddSet(safeExerciseIndex)}
                  className="c-set-pill min-h-11 border-dashed border-[var(--border-strong)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--blue)]"
                  title="Agregar serie a este ejercicio"
                  aria-label="Agregar serie"
                >
                  <AppIcon name="plus" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 2. ESCENARIO CENTRAL DINÁMICO (Foco por Fase) */}
            {!isRestPhaseActive ? (
              /* FASE DE REGISTRO: Prioridad visual en Peso, Reps, Steppers y CTA dominante */
              <div className="c-stage-card c-logging-phase">
                {currentSet ? (
                  <>
                    <div className="c-load-grid">
                      {/* Columna de Peso */}
                      <div className="c-load-col">
                        <div className="c-load-label-row">
                          <span className="c-load-label">Peso total</span>
                          <span className="c-load-unit">kg</span>
                        </div>
                        <input
                          aria-label="Peso en kilogramos"
                          type="number"
                          min="0"
                          step="0.25"
                          inputMode="decimal"
                          value={currentSet.weight}
                          onChange={(e) => onUpdateCurrentSet({ weight: Math.max(0, Number(e.target.value) || 0) })}
                          className="c-load-input min-h-14"
                        />
                        <div className="c-steppers-row">
                          <button
                            type="button"
                            aria-label="Restar 2,5 kg"
                            onClick={() => onAdjustWeight(-2.5)}
                            className="c-stepper-btn min-h-11"
                          >
                            −2.5
                          </button>
                          <button
                            type="button"
                            aria-label="Sumar 2,5 kg"
                            onClick={() => onAdjustWeight(2.5)}
                            className="c-stepper-btn min-h-11"
                          >
                            +2.5
                          </button>
                        </div>
                      </div>

                      {/* Columna de Repeticiones */}
                      <div className="c-load-col">
                        <div className="c-load-label-row">
                          <span className="c-load-label">Repeticiones</span>
                          <span className="c-load-unit">reps</span>
                        </div>
                        <input
                          aria-label="Repeticiones"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={currentSet.reps}
                          onChange={(e) => onUpdateCurrentSet({ reps: Math.max(1, Number(e.target.value) || 1) })}
                          className="c-load-input min-h-14"
                        />
                        <div className="c-steppers-row">
                          <button
                            type="button"
                            aria-label="Restar una repetición"
                            onClick={() => onAdjustReps(-1)}
                            className="c-stepper-btn min-h-11"
                          >
                            −1
                          </button>
                          <button
                            type="button"
                            aria-label="Sumar una repetición"
                            onClick={() => onAdjustReps(1)}
                            className="c-stepper-btn min-h-11"
                          >
                            +1
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Barra Contextual de Carga & Referencia Previa */}
                    <div className="c-load-context-row">
                      <span className="c-context-plate-desc" title={plateDescription(equipment, Number(currentSet.weight) || 0, barWeight)}>
                        ⚙️ {plateDescription(equipment, Number(currentSet.weight) || 0, barWeight)}
                      </span>
                      {previousSet ? (
                        <div className="c-prev-best-pill">
                          <span>
                            Última vez · serie {safeSetIndex + 1}: <strong>{previousSet.weight} kg × {previousSet.reps}</strong>
                            {previousSessionBest && <span className="opacity-80"> (Mejor serie efectiva de esa sesión: {previousSessionBest})</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateCurrentSet({ weight: previousSet.weight, reps: previousSet.reps })}
                            className="c-copy-link min-h-11"
                            title="Copiar valores de la sesión anterior"
                          >
                            Copiar
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-faint)]">Primera sesión</span>
                      )}
                    </div>

                    {/* Botón Primario Dominante */}
                    <button
                      type="button"
                      onClick={onToggleCurrentSet}
                      className={`c-primary-cta min-h-14 ${currentSet.completed ? 'is-completed' : ''}`}
                    >
                      <AppIcon name={currentSet.completed ? 'checkCircle' : 'check'} className="h-5 w-5" />
                      <span>
                        {currentSet.completed
                          ? `✓ Serie ${safeSetIndex + 1} completada · Tocar para desmarcar`
                          : `Completar serie ${safeSetIndex + 1} · ${currentSet.weight} kg × ${currentSet.reps}`}
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center">
                    <p className="text-sm text-[var(--text-soft)]">Este ejercicio todavía no tiene series.</p>
                    <button
                      type="button"
                      onClick={() => onAddSet(safeExerciseIndex)}
                      className="mt-3 min-h-11 rounded-xl bg-[var(--blue)] px-4 text-sm font-bold text-white"
                    >
                      Agregar serie
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* FASE DE DESCANSO: Protagonismo en Cronómetro, Próximo Esfuerzo y Revisión */
              <div className="c-stage-card c-rest-phase">
                {/* Centro Focal del Cronómetro de Recuperación */}
                <div className="c-rest-focal-center">
                  <span className="c-rest-label">
                    {isPaused
                      ? '⏸ Descanso en pausa'
                      : (activeTimer?.kind === 'exercise' ? 'Cambio de ejercicio' : 'Descanso entre series')}
                  </span>

                  <div className="c-rest-timer-wrap">
                    <div className="c-rest-ring">
                      <svg viewBox="0 0 100 100" className="c-timer-svg" aria-hidden="true">
                        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-[var(--border)] opacity-30" />
                        <circle
                          cx="50"
                          cy="50"
                          r={RING_RADIUS}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="5"
                          strokeDasharray={RING_CIRCUMFERENCE}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          className="text-[var(--blue)] transition-all duration-300"
                        />
                      </svg>
                    </div>
                    <div className="c-rest-timer-text" aria-live="polite">
                      {formattedTimer}
                    </div>
                  </div>

                  {/* Ajustes Rápidos de Tiempo */}
                  <div className="c-rest-adjust-row">
                    {onTogglePauseRestTimer && (
                      <button
                        type="button"
                        className={`c-rest-time-btn min-h-11 ${isPaused ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold' : ''}`}
                        onClick={onTogglePauseRestTimer}
                        aria-label={isPaused ? 'Reanudar descanso' : 'Pausar descanso'}
                      >
                        <AppIcon name={isPaused ? 'play' : 'pause'} className="h-3.5 w-3.5 mr-1" />
                        {isPaused ? 'Reanudar' : 'Pausar'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="c-rest-time-btn min-h-11"
                      onClick={() => onAdjustRestTimer?.(-30)}
                      aria-label="Restar 30 segundos"
                    >
                      −30s
                    </button>
                    <button
                      type="button"
                      className="c-rest-time-btn min-h-11"
                      onClick={() => onAdjustRestTimer?.(30)}
                      aria-label="Sumar 30 segundos"
                    >
                      +30s
                    </button>
                    {onToggleMinimizeRest && (
                      <button
                        type="button"
                        className="c-rest-time-btn min-h-11 text-xs font-semibold"
                        onClick={onToggleMinimizeRest}
                      >
                        Minimizar
                      </button>
                    )}
                  </div>
                </div>

                {/* Tarjeta de Anticipación del Próximo Esfuerzo */}
                <div className="c-next-effort-card">
                  <div className="c-next-effort-header">
                    <span className="c-next-effort-eyebrow">Próximo esfuerzo</span>
                    {nextEffortTarget && (
                      <span className="c-next-effort-target">{nextEffortTarget}</span>
                    )}
                  </div>
                  <div className="c-next-effort-title">
                    {nextEffortTitle}
                  </div>
                </div>

                {/* Acción Primaria de Descanso */}
                <button
                  type="button"
                  className="c-primary-cta min-h-14"
                  onClick={handleSkipOrAdvance}
                >
                  <span>{nextEffortButtonText}</span>
                </button>

                {/* Enlace Discreto para Revisar la Serie Recién Guardada */}
                <div className="c-review-link-wrap">
                  <button
                    type="button"
                    className="c-review-link min-h-11"
                    onClick={handleReviewCompletedSet}
                  >
                    ✎ Revisar o corregir Serie {completedSetIndex + 1} ({completedSet.weight} kg × {completedSet.reps})
                  </button>
                </div>
              </div>
            )}

            {/* Barra flotante/fija si el temporizador está minimizado o en otro ejercicio */}
            {isTimerRunning && (!isRestPhaseActive || activeTimer?.minimized) && (
              <div className="gym-rest-sticky-bar sticky bottom-3 z-30 w-full pt-1">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--blue)]/40 bg-[var(--card)] p-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isPaused ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-[var(--blue-soft)] text-[var(--blue)]'} font-black text-xs`}>
                      <AppIcon name={isPaused ? 'pause' : 'clock'} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)] truncate">
                        {isPaused ? 'En pausa' : (activeTimer?.kind === 'exercise' ? 'Cambio estación' : 'Descanso activo')}
                      </span>
                      <strong className="block text-base font-black tabular-nums text-[var(--text)]">
                        {formattedTimer}
                      </strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onTogglePauseRestTimer && (
                      <button
                        type="button"
                        onClick={onTogglePauseRestTimer}
                        className="min-h-10 px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text)]"
                        aria-label={isPaused ? 'Reanudar' : 'Pausar'}
                      >
                        <AppIcon name={isPaused ? 'play' : 'pause'} className="h-3.5 w-3.5 inline mr-1" />
                        {isPaused ? 'Seguir' : 'Pausa'}
                      </button>
                    )}
                    {onAdjustRestTimer && (
                      <button
                        type="button"
                        onClick={() => onAdjustRestTimer(30)}
                        className="min-h-10 px-2 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-soft)]"
                      >
                        +30s
                      </button>
                    )}
                    {onToggleMinimizeRest && (
                      <button
                        type="button"
                        onClick={onToggleMinimizeRest}
                        className="min-h-10 px-2.5 py-1.5 rounded-xl bg-[var(--blue)] text-xs font-bold text-white shadow-xs"
                      >
                        Ver
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSkipOrAdvance}
                      className="min-h-10 px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)]"
                    >
                      Saltar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Compatibilidad: si existe restTimer legacy y no activeTimer */}
            {!activeTimer && restTimer && (
              <div className="w-full pt-1">{restTimer}</div>
            )}
          </main>

          {/* PANEL LATERAL / ESCRITORIO: Resumen y Configuración */}
          <aside className="min-w-0 space-y-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">Resumen de la sesión</h3>
                  <p className="text-xs text-[var(--text-soft)]">{progress.completed} de {progress.total} series realizadas</p>
                </div>
                {nextExercise && (
                  <button
                    type="button"
                    onClick={() => selectExercise(safeExerciseIndex + 1)}
                    className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[var(--blue)] hover:bg-[var(--blue-soft)]"
                  >
                    Siguiente
                  </button>
                )}
              </div>

              <details className="group mt-3 border-t border-[var(--border)] pt-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text)]">
                  <span>Lista de ejercicios ({session.exercises.length})</span>
                  <AppIcon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                  {session.exercises.map((item, index) => {
                    const done = item.sets?.filter((set) => set.completed).length || 0;
                    const total = item.sets?.length || 0;
                    return (
                      <button
                        key={item.id || `${item.name}-outline-${index}`}
                        type="button"
                        onClick={() => selectExercise(index)}
                        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors ${
                          index === safeExerciseIndex
                            ? 'bg-[var(--blue-soft)] font-semibold text-[var(--blue)]'
                            : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="truncate">{index + 1}. {item.name}</span>
                        <span className="shrink-0 tabular-nums">{done}/{total}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            </div>

            {/* Ajustes contextuales del ejercicio y sesión */}
            <details className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text-soft)] hover:text-[var(--text)]">
                <span className="flex items-center gap-2">
                  <AppIcon name="settings" className="h-4 w-4 text-[var(--text-faint)]" />
                  <span>Configurar ejercicio y sesión</span>
                </span>
                <AppIcon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>

              <div className="mt-3 space-y-4 border-t border-[var(--border)] pt-4">
                <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="space-y-1 text-xs text-[var(--text-soft)]">
                    Fecha
                    <input type="date" value={session.date} onChange={(event) => onEditSessionDate(event.target.value)} className={`${controlClass} w-full`} />
                  </label>
                  <label className="space-y-1 text-xs text-[var(--text-soft)]">
                    Etiqueta
                    <input value={session.weekLabel || ''} onChange={(event) => onEditSessionWeek(event.target.value)} placeholder="Semana o rutina" className={`${controlClass} w-full`} />
                  </label>
                  <label className="space-y-1 text-xs text-[var(--text-soft)]">
                    Inicio
                    <input
                      type="time"
                      value={session.startedAt || ''}
                      onChange={(event) => onEditSessionTimes?.(event.target.value || null, session.finishedAt || null)}
                      className={`${controlClass} w-full`}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[var(--text-soft)]">
                    Fin
                    <input
                      type="time"
                      value={session.finishedAt || ''}
                      onChange={(event) => onEditSessionTimes?.(session.startedAt || null, event.target.value || null)}
                      className={`${controlClass} w-full`}
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text)]">{exercise.name}</p>
                  <select
                    value={equipment}
                    onChange={(event) => onUpdateEquipment(safeExerciseIndex, event.target.value as ExerciseEquipment)}
                    className={`${controlClass} w-full`}
                  >
                    {EXERCISE_EQUIPMENT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  {equipment === 'barra' && (
                    <select value={barWeight} onChange={(event) => onUpdateBarWeight(safeExerciseIndex, Number(event.target.value))} className={`${controlClass} w-full`}>
                      <option value={20}>Barra olímpica · 20 kg</option>
                      <option value={15}>Barra técnica · 15 kg</option>
                      <option value={10}>Barra W / EZ · 10 kg</option>
                    </select>
                  )}
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    {equipment === 'barra' && currentSet && (
                      <button
                        type="button"
                        onClick={() => onOpenCalculator(safeExerciseIndex, safeSetIndex, Number(currentSet.weight) || 40, barWeight)}
                        className="min-h-11 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--blue)] hover:bg-[var(--blue-soft)]"
                      >
                        Calcular discos
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPropagateExercise(exercise.name, { equipment, barWeight, muscleGroup: exercise.muscleGroup as MuscleGroup })}
                      className="min-h-11 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
                    >
                      Aplicar al historial
                    </button>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <button type="button" onClick={() => onAddSet(safeExerciseIndex)} className="min-h-11 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]">Agregar serie</button>
                    {currentSet && (
                      <button type="button" onClick={() => onDeleteSet(safeExerciseIndex, safeSetIndex)} className="min-h-11 rounded-xl border border-rose-500/25 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300">Eliminar serie</button>
                    )}
                  </div>
                  <button type="button" onClick={() => onDeleteExercise(safeExerciseIndex)} className="min-h-11 w-full rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300">Eliminar ejercicio</button>
                </div>

                <form onSubmit={submitExercise} className="space-y-2 border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-semibold text-[var(--text)]">Agregar ejercicio a la sesión</p>
                  <input
                    list="active-gym-exercise-suggestions"
                    value={newExerciseName}
                    onChange={(event) => {
                      const name = event.target.value;
                      setNewExerciseName(name);
                      if (name) {
                        setNewExerciseMuscle(inferMuscleGroup(name));
                        const inferred = inferExerciseEquipment(name);
                        setNewExerciseEquipment(inferred.equipment);
                        setNewExerciseBar(inferred.barWeight);
                      }
                    }}
                    placeholder="Nombre del ejercicio"
                    className={`${controlClass} w-full`}
                  />
                  <datalist id="active-gym-exercise-suggestions">
                    {exerciseSuggestions.map((item) => <option key={item} value={item} />)}
                  </datalist>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <select value={newExerciseMuscle} onChange={(event) => setNewExerciseMuscle(event.target.value as MuscleGroup)} className={`${controlClass} w-full`}>
                      {['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select value={newExerciseEquipment} onChange={(event) => setNewExerciseEquipment(event.target.value as ExerciseEquipment)} className={`${controlClass} w-full`}>
                      {EXERCISE_EQUIPMENT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs text-[var(--text-soft)]">Peso<input type="number" min="0" step="0.25" value={newExerciseWeight} onChange={(event) => setNewExerciseWeight(Number(event.target.value) || 0)} className={`${controlClass} w-full`} /></label>
                    <label className="space-y-1 text-xs text-[var(--text-soft)]">Reps<input type="number" min="1" value={newExerciseReps} onChange={(event) => setNewExerciseReps(Number(event.target.value) || 1)} className={`${controlClass} w-full`} /></label>
                  </div>
                  <button type="submit" className="min-h-11 w-full rounded-xl bg-[var(--blue)] text-sm font-bold text-white hover:bg-[var(--blue-hover)]">Agregar ejercicio</button>
                </form>
              </div>
            </details>
          </aside>
        </div>
      ) : (
        /* Estado Sesión sin ejercicios */
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs">
          <h2 className="text-base font-bold text-[var(--text)]">Sesión sin ejercicios</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">Agregá el primero para empezar a registrar series.</p>
          <form onSubmit={submitExercise} className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
            <input
              list="active-gym-empty-suggestions"
              value={newExerciseName}
              onChange={(event) => {
                const name = event.target.value;
                setNewExerciseName(name);
                if (name) {
                  setNewExerciseMuscle(inferMuscleGroup(name));
                  const inferred = inferExerciseEquipment(name);
                  setNewExerciseEquipment(inferred.equipment);
                  setNewExerciseBar(inferred.barWeight);
                }
              }}
              placeholder="Nombre del ejercicio"
              aria-label="Nombre del primer ejercicio"
              className={`${controlClass} w-full sm:col-span-2`}
            />
            <datalist id="active-gym-empty-suggestions">
              {exerciseSuggestions.map((item) => <option key={item} value={item} />)}
            </datalist>
            <select aria-label="Grupo muscular" value={newExerciseMuscle} onChange={(event) => setNewExerciseMuscle(event.target.value as MuscleGroup)} className={`${controlClass} w-full`}>
              {['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'].map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Equipo" value={newExerciseEquipment} onChange={(event) => setNewExerciseEquipment(event.target.value as ExerciseEquipment)} className={`${controlClass} w-full`}>
              {EXERCISE_EQUIPMENT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <label className="space-y-1 text-xs text-[var(--text-soft)]">Peso inicial<input type="number" min="0" step="0.25" value={newExerciseWeight} onChange={(event) => setNewExerciseWeight(Number(event.target.value) || 0)} className={`${controlClass} w-full`} /></label>
            <label className="space-y-1 text-xs text-[var(--text-soft)]">Reps iniciales<input type="number" min="1" value={newExerciseReps} onChange={(event) => setNewExerciseReps(Number(event.target.value) || 1)} className={`${controlClass} w-full`} /></label>
            <button type="submit" className="min-h-12 rounded-xl bg-[var(--blue)] px-4 text-sm font-bold text-white hover:bg-[var(--blue-hover)] sm:col-span-2">Agregar ejercicio</button>
          </form>
        </div>
      )}
    </section>
  );
};
