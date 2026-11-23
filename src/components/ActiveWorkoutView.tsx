import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { ExerciseEquipment, GymActiveTimer, GymSession, GymSet, MuscleGroup } from '../types';
import { EXERCISE_EQUIPMENT_OPTIONS, inferExerciseEquipment, inferMuscleGroup } from '../lib/gymMigration';
import {
  areAllSessionSetsCompleted,
  findNextPendingExerciseIndex,
  getPerformedGymVolume,
  isExerciseCompleted,
} from '../lib/gymFlows';
import {
  getProgressiveOverloadSuggestion,
  isProgressingOverPrevious,
  type ExerciseGhostSet,
  type ExerciseMetricTarget,
} from '../lib/gymMetrics';
import type { WakeLockStatus } from '../lib/wakeLock';
import { AppIcon } from './AppIcon';
import { CompletionCheck } from './ui/CompletionCheck';
import { playTimerCountdownTone } from '../lib/audio';
import {
  getRestTimerSnapshot,
  triggerRestTimerCompletionAlert,
} from '../lib/gymRestTimer';
import { GymExerciseArtwork } from './visual/GymExerciseArtwork';

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
  previousGhostSets?: Array<{ weight: number; reps: number; type?: 'normal' | 'warmup' }> | null;
  wakeLockStatus?: WakeLockStatus;
  completionMotion?: { setKey: string; nonce: number } | null;
  restTimer?: React.ReactNode;
  activeTimer?: GymActiveTimer | null;
  showQuickRestAdjustments?: boolean;
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
  onAddExercise: (payload: AddExercisePayload) => boolean | void;
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
  onSkipRestTimer?: () => boolean | void;
  onCompleteRestTimer?: () => boolean | void;
  onToggleMinimizeRest?: () => void;
}

const controlClass =
  'min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text)] outline-none transition-colors focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20';

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

const RING_RADIUS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~282.74

export const ActiveWorkoutView: React.FC<ActiveWorkoutViewProps> = ({
  session,
  exerciseIndex,
  setIndex,
  previousSet,
  previousSessionBest,
  previousGhostSets,
  wakeLockStatus,
  restTimer,
  activeTimer,
  showQuickRestAdjustments = true,
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
  const allSetsCompleted = areAllSessionSetsCompleted(session);
  const nextPendingExerciseIndex = findNextPendingExerciseIndex(session, safeExerciseIndex);
  const nextPendingExercise = nextPendingExerciseIndex >= 0 ? session.exercises[nextPendingExerciseIndex] : undefined;
  const completedExercisesCount = session.exercises.filter((item) => isExerciseCompleted(item)).length;
  const equipment = exercise
    ? exercise.equipment || (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : 'mancuerna')
    : 'mancuerna';
  const visualEquipment = exercise?.equipment || (exercise?.barWeight && exercise.barWeight > 0 ? 'barra' : undefined);
  const barWeight = exercise?.barWeight ?? (equipment === 'barra' ? 20 : 0);
  const sessionTitle = session.weekLabel?.trim() || 'Entrenamiento activo';
  const overloadSuggestion = useMemo(
    () =>
      getProgressiveOverloadSuggestion({
        previousSet: previousSet
          ? { setIndex: safeSetIndex, weight: previousSet.weight, reps: previousSet.reps }
          : null,
        previousGhostSets: previousGhostSets
          ? (previousGhostSets.map((s, idx) => ({
              setIndex: idx,
              weight: s.weight,
              reps: s.reps,
              type: s.type,
            })) as ExerciseGhostSet[])
          : null,
        equipment,
        currentSetType: currentSet?.type,
      }),
    [previousSet, safeSetIndex, previousGhostSets, equipment, currentSet?.type]
  );
  const isProgressing = currentSet
    ? isProgressingOverPrevious(
        currentSet,
        previousSet ? { setIndex: safeSetIndex, weight: previousSet.weight, reps: previousSet.reps } : null
      )
    : false;

  // Precision countdown + positive overtime clock derived directly from endsAt timestamp
  const isPaused = Boolean(activeTimer?.pausedAt);
  const timerEndsAt = activeTimer?.endsAt;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timerSnapshot = getRestTimerSnapshot(activeTimer, nowMs);
  const isOvertime = Boolean(timerSnapshot?.isOvertime);

  const lastChimeSecondRef = useRef<number | null>(null);

  // Rest state determination
  const isTimerRunning = Boolean(activeTimer);
  const restingExerciseIndex = activeTimer?.exerciseIndex ?? safeExerciseIndex;
  const restingExercise = session.exercises[restingExerciseIndex] ?? exercise;

  useEffect(() => {
    setIsReviewingPreviousSet(false);
    lastChimeSecondRef.current = null;
  }, [activeTimer?.setId, activeTimer?.exerciseId, activeTimer?.endsAt, isPaused]);

  useEffect(() => {
    if (!timerEndsAt) return;
    const tick = () => {
      const now = Date.now();
      setNowMs(now);

      const snap = getRestTimerSnapshot(activeTimer, now);
      if (!snap || isPaused) return;

      if (
        !snap.isOvertime
        && snap.remainingSeconds <= 3
        && snap.remainingSeconds >= 1
        && lastChimeSecondRef.current !== snap.remainingSeconds
      ) {
        lastChimeSecondRef.current = snap.remainingSeconds;
        playTimerCountdownTone(snap.remainingSeconds);
      }

      if (snap.isOvertime && activeTimer) {
        triggerRestTimerCompletionAlert(
          activeTimer,
          { exerciseName: restingExercise?.name, sessionName: sessionTitle },
          now
        );
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
  }, [timerEndsAt, isPaused, activeTimer, restingExercise?.name, sessionTitle]);

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
    const saved = onAddExercise({
      name,
      muscleGroup: newExerciseMuscle,
      equipment: newExerciseEquipment,
      barWeight: newExerciseEquipment === 'barra' ? newExerciseBar : 0,
      initialWeight: newExerciseWeight,
      initialReps: newExerciseReps,
    });
    if (saved === false) return;
    setNewExerciseName('');
  };

  const isRestingThisExercise = isTimerRunning && restingExerciseIndex === safeExerciseIndex;
  const isRestPhaseActive = isRestingThisExercise && !activeTimer?.minimized && !isReviewingPreviousSet;

  // Completed set (for contextual review and next effort preview)
  const completedSetIndex = restingExercise?.sets?.findIndex((s) => s.id === activeTimer?.setId) ?? (safeSetIndex > 0 ? safeSetIndex - 1 : 0);
  const completedSet = restingExercise?.sets?.[completedSetIndex >= 0 ? completedSetIndex : 0] ?? currentSet;

  // Next effort preview calculation (bound strictly to the real rest event)
  let nextEffortTarget = '';
  let nextEffortTitle = '';
  let nextEffortButtonText = isOvertime ? 'Descartar aviso' : 'Saltar descanso';

  if (activeTimer?.kind === 'exercise') {
    const targetExIdx = typeof activeTimer.targetExerciseIndex === 'number'
      ? activeTimer.targetExerciseIndex
      : findNextPendingExerciseIndex(session, restingExerciseIndex);
    if (targetExIdx >= 0 && targetExIdx < session.exercises.length) {
      const nextEx = session.exercises[targetExIdx];
      const nextSetIdx = nextEx.sets?.findIndex((s) => !s.completed) ?? 0;
      const nextSet = nextEx.sets?.[nextSetIdx >= 0 ? nextSetIdx : 0];
      nextEffortTarget = nextSet ? `${nextSet.weight} kg × ${nextSet.reps} reps` : '';
      nextEffortTitle = `Siguiente ejercicio: ${nextEx.name}${nextSet ? ` · Serie ${nextSetIdx + 1} de ${nextEx.sets.length}` : ''}`;
      nextEffortButtonText = 'Pasar al siguiente ejercicio →';
    } else {
      nextEffortTitle = 'Todas las series completadas · Podés sumar más o finalizar manualmente';
      nextEffortButtonText = isOvertime ? 'Descartar aviso' : 'Cerrar descanso →';
    }
  } else {
    // kind === 'set'
    const pendingSetIdx = restingExercise?.sets?.findIndex((s) => !s.completed) ?? -1;
    if (pendingSetIdx >= 0) {
      const pendingSet = restingExercise.sets[pendingSetIdx];
      nextEffortTarget = `${pendingSet.weight} kg × ${pendingSet.reps} reps`;
      nextEffortTitle = `Serie ${pendingSetIdx + 1} de ${restingExercise.sets.length} · ${restingExercise.name}`;
      nextEffortButtonText = isOvertime ? 'Descartar aviso' : 'Saltar descanso';
    } else {
      const pendingExIdx = findNextPendingExerciseIndex(session, restingExerciseIndex);
      if (pendingExIdx >= 0) {
        const nextEx = session.exercises[pendingExIdx];
        const nextSetIdx = nextEx?.sets?.findIndex((s) => !s.completed) ?? 0;
        const nextSet = nextEx?.sets?.[nextSetIdx >= 0 ? nextSetIdx : 0];
        nextEffortTarget = nextSet ? `${nextSet.weight} kg × ${nextSet.reps} reps` : '';
        nextEffortTitle = `Siguiente ejercicio: ${nextEx.name}`;
        nextEffortButtonText = 'Pasar al siguiente ejercicio →';
      } else {
        nextEffortTitle = 'Todas las series completadas · Podés sumar más o finalizar manualmente';
        nextEffortButtonText = isOvertime ? 'Descartar aviso' : 'Cerrar descanso →';
      }
    }
  }

  // Timer dial metrics
  const timerProgress = timerSnapshot?.progressRatio ?? 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - timerProgress);
  const formattedTimer = timerSnapshot?.formatted ?? '00:00';

  const handleSkipOrAdvance = () => {
    setIsReviewingPreviousSet(false);
    // Finalizar la sesión solo ocurre por acción explícita del usuario en "Finalizar entrenamiento".
    if (onSkipRestTimer) onSkipRestTimer();
    else if (onCompleteRestTimer) onCompleteRestTimer();
  };

  const handleReviewCompletedSet = () => {
    setIsReviewingPreviousSet(true);
    if (completedSetIndex >= 0) {
      onSelectSet(completedSetIndex);
    }
  };

  const compactRestBar = (
    <div className="gym-rest-sticky-bar w-full" data-gym-rest-compact-bar="true" data-rest-state={isOvertime ? 'overtime' : 'active'}>
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-[var(--card)]/95 p-3 shadow-md backdrop-blur-md transition-colors ${
          isOvertime
            ? 'border-[#F59E0B]/50 ring-1 ring-[#F59E0B]/20'
            : 'border-[#4F46E5]/35 ring-1 ring-[#4F46E5]/10'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs ${
              isOvertime
                ? 'bg-[#F59E0B]/15 text-amber-600 dark:text-[#F59E0B]'
                : 'bg-[#4F46E5]/12 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-indigo-300'
            }`}
          >
            <AppIcon name={isPaused ? 'pause' : 'clock'} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <span
              className={`block text-[10px] font-black uppercase tracking-wider truncate ${
                isOvertime
                  ? 'text-amber-600 dark:text-[#F59E0B]'
                  : 'text-[#4F46E5] dark:text-indigo-300'
              }`}
            >
              {isOvertime
                ? (isPaused ? 'Exceso · En pausa' : 'Descanso excedido')
                : isPaused
                  ? 'En pausa'
                  : (activeTimer?.kind === 'exercise' ? 'Cambio estación' : 'Descanso activo')}
            </span>
            <strong
              className={`block text-base font-black tabular-nums ${
                isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : 'text-[var(--text)]'
              }`}
            >
              {formattedTimer}
            </strong>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {!isOvertime && onTogglePauseRestTimer && (
            <button
              type="button"
              onClick={onTogglePauseRestTimer}
              className="min-h-11 px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text)]"
              aria-label={isPaused ? 'Reanudar' : 'Pausar'}
            >
              <AppIcon name={isPaused ? 'play' : 'pause'} className="h-3.5 w-3.5 inline mr-1" />
              {isPaused ? 'Seguir' : 'Pausa'}
            </button>
          )}
          {!isOvertime && onAdjustRestTimer && showQuickRestAdjustments && (
            <button
              type="button"
              onClick={() => onAdjustRestTimer(30)}
              className="min-h-11 px-2 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-soft)]"
            >
              +30s
            </button>
          )}
          {onToggleMinimizeRest && !isOvertime && (
            <button
              type="button"
              onClick={() => {
                if (isReviewingPreviousSet) setIsReviewingPreviousSet(false);
                if (activeTimer?.minimized) onToggleMinimizeRest();
                else if (!isRestingThisExercise) selectExercise(restingExerciseIndex);
              }}
              className="min-h-11 px-2.5 py-1.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-xs font-bold text-white shadow-xs"
            >
              Ver
            </button>
          )}
          <button
            type="button"
            onClick={handleSkipOrAdvance}
            aria-label={isOvertime ? 'Descartar aviso de descanso excedido' : 'Saltar descanso'}
            className={
              isOvertime
                ? 'min-h-11 px-3 py-1.5 rounded-xl border border-[#F59E0B]/55 bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 text-xs font-bold text-amber-700 dark:text-[#F59E0B]'
                : 'min-h-11 px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)]'
            }
          >
            {isOvertime ? 'Descartar' : 'Saltar'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <section data-active-workout-view className="gym-workout-shell w-full min-w-0 space-y-4 overflow-x-clip">
      {/* 1. Barra Superior Operativa */}
      <header className="gym-workout-topbar flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="gym-live-label" title={wakeLockStatus === 'active' ? 'La pantalla permanece activa mientras entrenás o descansás' : undefined}>
            <span aria-hidden="true" /> Sesión activa{wakeLockStatus === 'active' ? ' · Pantalla activa' : ''}
          </p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="break-words text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">{sessionTitle}</h1>
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-soft)]">
              {progress.completed}/{progress.total} series realizadas
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Iniciado {session.startedAt || 'hoy'} · Volumen efectivo: {getPerformedGymVolume(session).toLocaleString('es-UY')} kg (sin aproximaciones)
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
              <AppIcon name="checkCircle" className="h-4 w-4 text-[var(--gym-visual-accent)]" />
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
        <>
          {isTimerRunning && (!isRestPhaseActive || isOvertime) && (
            <div className="sticky top-[68px] z-20 lg:hidden" data-gym-rest-mobile-sticky="true">
              {compactRestBar}
            </div>
          )}
        <div className="gym-active-layout grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* COCKPIT PRINCIPAL */}
          <main data-active-set-editor className="gym-cockpit-wrap min-w-0 lg:col-span-2">
            {progress.total > 0 && (
              <div className="gym-cockpit-progress" aria-hidden="true">
                <div
                  className="gym-cockpit-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%` }}
                />
              </div>
            )}
            {allSetsCompleted && (
              <div
                data-workout-all-completed
                role="status"
                className="flex flex-col gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                    <AppIcon name="checkCircle" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                      Todas las series completadas ({progress.completed}/{progress.total})
                    </p>
                    <p className="text-xs text-[var(--text-soft)]">
                      La sesión sigue abierta: podés agregar series o ejercicios extra, o cerrar cuando quieras.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onFinish}
                  className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-500"
                >
                  <AppIcon name="checkCircle" className="h-4 w-4" />
                  <span>Finalizar entrenamiento</span>
                </button>
              </div>
            )}
            {/* Aviso Contextual si el usuario navega a otro ejercicio mientras corre un descanso */}
            {!isRestingThisExercise && isTimerRunning && (
              <div
                className={`gym-rest-origin-note flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                  isOvertime
                    ? 'bg-[#F59E0B]/10 border-[#F59E0B]/35'
                    : 'bg-[#4F46E5]/10 border-[#4F46E5]/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AppIcon
                    name="clock"
                    className={`h-4 w-4 shrink-0 ${
                      isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : 'text-[#4F46E5] dark:text-indigo-400'
                    }`}
                  />
                  <span className="font-semibold text-[var(--text)]">
                    {isOvertime ? 'Descanso excedido de ' : 'Descanso de '}
                    {restingExercise.name}:{' '}
                    <strong
                      className={`tabular-nums font-bold ${
                        isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : 'text-[#4F46E5] dark:text-indigo-400'
                      }`}
                    >
                      {formattedTimer}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => selectExercise(restingExerciseIndex)}
                    className={`min-h-11 font-bold hover:underline ${
                      isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : 'text-[#4F46E5] dark:text-indigo-400'
                    }`}
                  >
                    Ver descanso
                  </button>
                  <button
                    type="button"
                    onClick={() => onSkipRestTimer?.()}
                    className="min-h-11 rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 py-1 font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
                  >
                    {isOvertime ? 'Listo' : 'Saltar'}
                  </button>
                </div>
              </div>
            )}

            {/* Aviso si está revisando una serie completada durante un descanso */}
            {isReviewingPreviousSet && isTimerRunning && (
              <div className="gym-rest-origin-note flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-xs">
                <span className="font-semibold text-[var(--text-soft)]">
                  Revisando Serie {completedSetIndex + 1} ({completedSet.weight} kg × {completedSet.reps}) · {isOvertime ? 'Exceso' : 'Descanso'}: <strong className={`tabular-nums ${isOvertime ? 'text-amber-600 dark:text-[#F59E0B]' : ''}`}>{formattedTimer}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsReviewingPreviousSet(false);
                    const firstIncomplete = exercise.sets?.findIndex((s) => !s.completed) ?? -1;
                    if (firstIncomplete >= 0) onSelectSet(firstIncomplete);
                  }}
                  className="min-h-11 font-bold text-[#4F46E5] dark:text-indigo-400 hover:underline ml-2"
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
                    <AppIcon name="chevronLeft" className="h-4 w-4" />
                  </button>
                  <span className="c-pager-label"><span className="hidden sm:inline">Ejercicio </span>{safeExerciseIndex + 1} de {session.exercises.length}</span>
                  <button
                    type="button"
                    className="c-pager-btn min-h-11"
                    onClick={() => selectExercise(safeExerciseIndex + 1)}
                    disabled={safeExerciseIndex >= session.exercises.length - 1}
                    aria-label="Ejercicio siguiente"
                    title="Ejercicio siguiente"
                  >
                    <AppIcon name="chevronRight" className="h-4 w-4" />
                  </button>
                </div>

                <div className="c-header-tools">
                  {equipment === 'barra' && currentSet && (
                    <button
                      type="button"
                      className="c-tool-btn min-h-11"
                      onClick={() => onOpenCalculator(safeExerciseIndex, safeSetIndex, Number(currentSet.weight) || 40, barWeight)}
                      title="Calculadora gráfica de discos de barra"
                      aria-label="Calcular discos"
                    >
                      <AppIcon name="dumbbell" className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Discos</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="c-tool-btn min-h-11"
                    onClick={() => onOpenHistory({ exerciseId: exercise.id, exerciseName: exercise.name })}
                    title="Historial de marcas y récords personales"
                    aria-label="Historial del ejercicio"
                  >
                    <AppIcon name="history" className="h-4 w-4" />
                    <span className="hidden sm:inline">Historial</span>
                  </button>
                </div>
              </div>

              {/* Fila Principal: Badge Biomecánico y Título a Ancho Completo */}
              <div className="c-header-main-row">
                <div className="c-art-badge" aria-hidden="true">
                  <GymExerciseArtwork
                    name={exercise.name}
                    equipment={visualEquipment}
                    icon={exercise.icon || undefined}
                    className="c-art-badge-icon"
                  />
                </div>
                <div className="c-meta">
                  <h2 className="c-exercise-title">{exercise.name}</h2>
                  <div className="c-meta-sub">
                    <span className="c-meta-muscle">{exercise.muscleGroup || 'General'}</span>
                    {currentSet && (
                      <button
                        type="button"
                        onClick={() => onUpdateCurrentSet({ type: currentSet.type === 'warmup' ? 'normal' : 'warmup' })}
                        className={`c-warmup-pill min-h-11 cursor-pointer ${currentSet.type === 'warmup' ? 'is-warmup' : ''}`}
                        aria-label={`Tipo de serie: ${currentSet.type === 'warmup' ? 'aproximación; cambiar a efectiva' : 'efectiva; cambiar a aproximación'}`}
                        title={currentSet.type === 'warmup' ? 'Serie de aproximación · Clic para hacerla efectiva' : 'Serie efectiva · Clic para marcar como aproximación'}
                      >
                        <span>{currentSet.type === 'warmup' ? 'Aproximación' : 'Efectiva'}</span>
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

                  return (
                    <button
                      key={set.id || idx}
                      type="button"
                      onClick={() => onSelectSet(idx)}
                      className={`c-set-pill group min-h-[44px] min-w-[44px] active:scale-90 ${isSelected ? 'is-active' : ''} ${isDone ? 'is-done' : ''} ${isWarmup ? 'is-warmup' : ''}`}
                      title={`Serie ${idx + 1}: ${set.weight} kg × ${set.reps} repeticiones`}
                      aria-label={`Serie ${idx + 1}: ${set.weight} kilogramos, ${set.reps} repeticiones${isDone ? ', realizada' : ', pendiente'}`}
                      aria-pressed={isSelected}
                    >
                      <div className="c-set-pill-top">
                        <span className={isDone ? 'opacity-75' : ''}>{isWarmup ? 'Aprox.' : `Serie ${idx + 1}`}</span>
                        <CompletionCheck checked={isDone} size="sm" />
                      </div>
                      <div className={`c-set-pill-weight ${isDone ? 'opacity-75' : ''}`}>{set.weight} kg <span aria-hidden="true">×</span> {set.reps}</div>
                      {!isDone && !isWarmup && previousGhostSets?.[idx] && (
                        <div className="c-set-pill-ghost">Ant: {previousGhostSets[idx].weight}×{previousGhostSets[idx].reps}</div>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => onAddSet(safeExerciseIndex)}
                  className="c-set-pill min-h-11 border-dashed border-[var(--border-strong)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[#4F46E5]"
                  title="Agregar serie a este ejercicio"
                  aria-label="Agregar serie"
                >
                  <AppIcon name="plus" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 2. ESCENARIO CENTRAL DINÁMICO: siempre visible en escritorio y en exceso; en móvil solo se oculta durante cuenta regresiva activa */}
            <div className={`c-stage-card c-logging-phase ${isRestPhaseActive && !isOvertime ? 'is-rest-hidden-mobile hidden lg:flex' : ''}`}>
                {currentSet ? (
                  <>
                    <p className="c-set-position">Serie {safeSetIndex + 1} de {sets.length}<span>{currentSet.completed ? 'Registrada' : 'Por registrar'}</span></p>
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
                        <div className="c-steppers-row grid grid-cols-2 gap-2 w-full max-w-xs">
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
                        <div className="c-steppers-row grid grid-cols-2 gap-2 w-full max-w-xs">
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
                        {plateDescription(equipment, Number(currentSet.weight) || 0, barWeight)}
                      </span>
                      {previousSet ? (
                        <>
                          <div className="c-prev-best-pill">
                          <span>
                            Última vez · serie {safeSetIndex + 1}: <strong>{previousSet.weight} kg × {previousSet.reps}</strong>
                            {previousSessionBest && <span className="c-previous-best">Mejor serie efectiva de esa sesión: {previousSessionBest}</span>}
                          </span>
                            <span className="c-copy-link-wrap shrink-0">
                              <button
                                type="button"
                                onClick={() => onUpdateCurrentSet({ weight: previousSet.weight, reps: previousSet.reps })}
                                className="c-copy-link min-h-11"
                                title="Copiar valores de la sesión anterior"
                              >
                                Copiar
                              </button>
                            </span>
                          </div>
                          {overloadSuggestion && !currentSet.completed && (
                            Number(currentSet.weight) === overloadSuggestion.weight && Number(currentSet.reps) === overloadSuggestion.reps ? (
                              <div className="c-overload-pill is-applied">
                                <span>
                                  Meta progresiva activa: <strong>{overloadSuggestion.weight} kg × {overloadSuggestion.reps}</strong> ({overloadSuggestion.deltaLabel})
                                </span>
                              </div>
                            ) : isProgressing ? (
                              <div className="c-overload-pill is-applied">
                                <span>Superando última marca en esta serie</span>
                              </div>
                            ) : (
                              <div className="c-overload-pill">
                                <span>
                                  Sobrecarga sugerida: <strong>{overloadSuggestion.weight} kg × {overloadSuggestion.reps}</strong> ({overloadSuggestion.deltaLabel})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onUpdateCurrentSet({ weight: overloadSuggestion.weight, reps: overloadSuggestion.reps })}
                                  className="c-copy-link min-h-11"
                                  title={overloadSuggestion.reason}
                                >
                                  Progresar
                                </button>
                              </div>
                            )
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-[var(--text-soft)]">Sin referencia para esta serie.{previousSessionBest && <span className="c-previous-best">Mejor serie efectiva de esa sesión: {previousSessionBest}</span>}</span>
                      )}
                    </div>

                    {/* Botón Primario Dominante */}
                    <button
                      type="button"
                      onClick={onToggleCurrentSet}
                      className={`c-primary-cta w-full min-h-[50px] min-w-[44px] h-auto py-3 px-4 leading-snug ${currentSet.completed ? 'is-completed' : ''}`}
                    >
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {currentSet.completed
                          ? `Serie ${safeSetIndex + 1} completada · Tocar para desmarcar`
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
                      className="mt-3 min-h-11 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] px-4 text-sm font-bold text-white"
                    >
                      Agregar serie
                    </button>
                  </div>
                )}
            </div>

            {/* Compatibilidad: si existe restTimer legacy y no activeTimer */}
            {!activeTimer && restTimer && (
              <div className="w-full pt-1">{restTimer}</div>
            )}
          </main>

          {/* PANEL LATERAL / ESCRITORIO: Rest Timer protagonista, Resumen y Configuración */}
          <aside className="gym-workout-aside min-w-0 space-y-4 lg:col-span-1 lg:sticky lg:top-20 self-start">
            {/* 1. BLOQUE REST TIMER */}
            {isRestPhaseActive ? (
              <div
                data-rest-state={isOvertime ? 'overtime' : 'active'}
                className={`c-stage-card c-rest-phase rounded-2xl border bg-[var(--card)] p-4 sm:p-5 lg:p-3.5 xl:p-5 shadow-xs transition-colors ${
                  isOvertime ? 'is-overtime is-overtime-hidden-mobile !border-[#F59E0B]/45' : 'border-[var(--border)]'
                }`}
              >
                {/* Centro Focal del Cronómetro de Recuperación */}
                <div className="c-rest-focal-center flex flex-col items-center gap-3 sm:gap-4 text-center">
                  <span
                    className={`c-rest-label ${
                      isOvertime ? '!bg-[#F59E0B]/15 !text-amber-600 dark:!text-[#F59E0B]' : ''
                    }`}
                  >
                    {isOvertime
                      ? (isPaused ? 'Exceso · En pausa' : 'Descanso excedido')
                      : isPaused
                        ? 'Descanso en pausa'
                        : (activeTimer?.kind === 'exercise' ? 'Cambio de ejercicio' : 'Descanso entre series')}
                  </span>

                  <div className="c-rest-timer-wrap relative mx-auto grid place-items-center w-36 h-36 sm:w-48 sm:h-48 lg:w-full lg:h-auto lg:max-w-[256px] aspect-square">
                    <div className="c-rest-ring absolute inset-0 -rotate-90">
                      <svg viewBox="0 0 100 100" className="c-timer-svg w-full h-full" aria-hidden="true">
                        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="3" className="c-timer-track" />
                        <circle
                          cx="50"
                          cy="50"
                          r={RING_RADIUS}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeDasharray={RING_CIRCUMFERENCE}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          className={`c-timer-progress ${isOvertime ? '!text-[#F59E0B] overtime-bar-pulse' : ''}`}
                        />
                      </svg>
                    </div>
                    <div
                      className={`c-rest-timer-text relative z-10 font-sans font-bold tabular-nums leading-none ${
                        isOvertime
                          ? 'text-[1.65rem] sm:text-[2.65rem] xl:text-[2.95rem] tracking-[-0.045em] !text-amber-600 dark:!text-[#F59E0B]'
                          : 'text-3xl sm:text-5xl xl:text-[3.5rem] tracking-[-0.04em] text-[var(--gym-visual-accent)]'
                      }`}
                      role="timer"
                      aria-label={isOvertime ? 'Tiempo de descanso excedido' : 'Tiempo de descanso restante'}
                    >
                      {formattedTimer.startsWith('+') ? (
                        <>
                          <span className="inline-block text-[0.78em] font-semibold mr-[0.02em] align-[0.04em]">+</span>
                          {formattedTimer.slice(1)}
                        </>
                      ) : (
                        formattedTimer
                      )}
                    </div>
                  </div>

                  {!isOvertime && (
                    <div className="c-rest-details w-full">
                      {/* Ajustes Rápidos de Tiempo */}
                      <div className="c-rest-adjust-row grid grid-cols-2 gap-2 w-full">
                        {onTogglePauseRestTimer && (
                          <button
                            type="button"
                            className={`c-rest-time-btn min-h-11 ${isPaused ? 'is-paused' : ''}`}
                            onClick={onTogglePauseRestTimer}
                            aria-label={isPaused ? 'Reanudar descanso' : 'Pausar descanso'}
                          >
                            <AppIcon name={isPaused ? 'play' : 'pause'} className="h-3.5 w-3.5 mr-1" />
                            {isPaused ? 'Reanudar' : 'Pausar'}
                          </button>
                        )}
                        {showQuickRestAdjustments && (
                          <button
                            type="button"
                            className="c-rest-time-btn min-h-11"
                            onClick={() => onAdjustRestTimer?.(-30)}
                            aria-label="Restar 30 segundos"
                          >
                            −30s
                          </button>
                        )}
                        {showQuickRestAdjustments && (
                          <button
                            type="button"
                            className="c-rest-time-btn min-h-11"
                            onClick={() => onAdjustRestTimer?.(30)}
                            aria-label="Sumar 30 segundos"
                          >
                            +30s
                          </button>
                        )}
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
                  )}
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
                  className={`c-primary-cta c-next-effort-cta w-full min-h-[50px] h-auto py-3 px-4 leading-snug ${
                    isOvertime ? '!border-[#F59E0B]/55 !bg-[#F59E0B]/15 hover:!bg-[#F59E0B]/25 !text-amber-700 dark:!text-[#F59E0B] !shadow-none' : ''
                  }`}
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
                    <AppIcon name="edit" className="h-4 w-4 shrink-0" />
                    Revisar o corregir Serie {completedSetIndex + 1} ({completedSet.weight} kg × {completedSet.reps})
                  </button>
                </div>
              </div>
            ) : isTimerRunning ? (
              /* Barra compacta en escritorio (en móvil se muestra sticky arriba del ejercicio) */
              <div className="hidden lg:block">
                {compactRestBar}
              </div>
            ) : !restTimer ? (
              <div className="gym-rest-idle-card flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gym-visual-soft)] text-[var(--gym-visual-accent)]">
                    <AppIcon name="clock" className="h-5 w-5" />
                  </span>
                  <p className="text-xs font-medium text-[var(--text-soft)]">
                    Descanso listo · sin temporizador activo
                  </p>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label="Ajustes de descanso"
                    className="min-h-11 shrink-0 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)] hover:border-[var(--gym-visual-accent)] hover:text-[var(--gym-visual-accent)]"
                  >
                    Ajustes
                  </button>
                )}
              </div>
            ) : null}
            <div className="gym-session-summary rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">Resumen de la sesión</h3>
                  <p className="text-xs text-[var(--text-soft)]">{progress.completed} de {progress.total} series realizadas</p>
                </div>
                {nextPendingExercise ? (
                  <button
                    type="button"
                    onClick={() => selectExercise(nextPendingExerciseIndex)}
                    className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:bg-[#4F46E5]/10"
                  >
                    Siguiente pendiente
                  </button>
                ) : allSetsCompleted ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <AppIcon name="checkCircle" className="h-3.5 w-3.5" />
                    Completo
                  </span>
                ) : null}
              </div>

              {nextPendingExercise && (
                <p className="gym-session-next-exercise text-xs text-[var(--text-soft)]">
                  Después: {nextPendingExercise.name}
                </p>
              )}

              <details className="group mt-3 border-t border-[var(--border)] pt-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text)]">
                  <span>Lista de ejercicios ({completedExercisesCount}/{session.exercises.length} completados)</span>
                  <AppIcon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                  {session.exercises.map((item, index) => {
                    const done = item.sets?.filter((set) => set.completed).length || 0;
                    const total = item.sets?.length || 0;
                    const isDoneExercise = total > 0 && isExerciseCompleted(item);
                    const isCurrent = index === safeExerciseIndex;
                    return (
                      <button
                        key={item.id || `${item.name}-outline-${index}`}
                        type="button"
                        onClick={() => selectExercise(index)}
                        aria-current={isCurrent ? 'step' : undefined}
                        aria-label={`${index + 1}. ${item.name}, ${done} de ${total} series, ${isDoneExercise ? 'completado' : 'pendiente'}`}
                        data-exercise-status={isDoneExercise ? 'completed' : 'pending'}
                        className={`group flex min-h-[44px] min-w-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm transition-colors ${
                          isCurrent
                            ? 'bg-[#4F46E5]/12 font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/18 dark:text-indigo-300'
                            : isDoneExercise
                              ? 'text-[var(--text)] hover:bg-[var(--surface-muted)]'
                              : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <CompletionCheck checked={isDoneExercise} size="sm" />
                          <span className={`min-w-0 break-words ${isDoneExercise ? 'opacity-60 line-through decoration-slate-400/60' : ''}`}>
                            {index + 1}. {item.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              isDoneExercise
                                ? 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {isDoneExercise ? 'Listo' : 'Pendiente'}
                          </span>
                          <span className="tabular-nums text-xs">{done}/{total}</span>
                        </span>
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
                    aria-label="Equipamiento del ejercicio"
                    value={equipment}
                    onChange={(event) => onUpdateEquipment(safeExerciseIndex, event.target.value as ExerciseEquipment)}
                    className={`${controlClass} w-full`}
                  >
                    {EXERCISE_EQUIPMENT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  {equipment === 'barra' && (
                    <select aria-label="Peso de la barra" value={barWeight} onChange={(event) => onUpdateBarWeight(safeExerciseIndex, Number(event.target.value))} className={`${controlClass} w-full`}>
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
                        className="min-h-11 rounded-xl border border-[var(--border)] text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:bg-[#4F46E5]/10"
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
                  <div className="flex items-center gap-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--gym-visual-accent)] ring-1 ring-inset ring-[var(--border)]">
                      <GymExerciseArtwork
                        name={newExerciseName.trim() || newExerciseMuscle}
                        equipment={newExerciseName.trim() ? newExerciseEquipment : undefined}
                        compact
                      />
                    </span>
                    <input
                      list="active-gym-exercise-suggestions"
                      value={newExerciseName}
                      onChange={(event) => {
                        const name = event.target.value;
                        setNewExerciseName(name);
                        if (name.trim()) {
                          setNewExerciseMuscle(inferMuscleGroup(name));
                          const inferred = inferExerciseEquipment(name);
                          setNewExerciseEquipment(inferred.equipment);
                          setNewExerciseBar(inferred.barWeight);
                        }
                      }}
                      placeholder="Ej: Curls, Martillo, Bench press..."
                      aria-label="Nombre del ejercicio"
                      className={`${controlClass} flex-1 min-w-0`}
                    />
                  </div>
                  <datalist id="active-gym-exercise-suggestions">
                    {exerciseSuggestions.map((item) => <option key={item} value={item} />)}
                  </datalist>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <select aria-label="Grupo muscular del nuevo ejercicio" value={newExerciseMuscle} onChange={(event) => setNewExerciseMuscle(event.target.value as MuscleGroup)} className={`${controlClass} w-full`}>
                      {['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select aria-label="Equipamiento del nuevo ejercicio" value={newExerciseEquipment} onChange={(event) => setNewExerciseEquipment(event.target.value as ExerciseEquipment)} className={`${controlClass} w-full`}>
                      {EXERCISE_EQUIPMENT_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs text-[var(--text-soft)]">Peso<input type="number" min="0" step="0.25" value={newExerciseWeight} onChange={(event) => setNewExerciseWeight(Number(event.target.value) || 0)} className={`${controlClass} w-full`} /></label>
                    <label className="space-y-1 text-xs text-[var(--text-soft)]">Reps<input type="number" min="1" value={newExerciseReps} onChange={(event) => setNewExerciseReps(Number(event.target.value) || 1)} className={`${controlClass} w-full`} /></label>
                  </div>
                  <button type="submit" className="min-h-11 w-full rounded-xl bg-[#4F46E5] text-sm font-bold text-white hover:bg-[#4338CA] dark:hover:bg-[#6366F1]">Agregar ejercicio</button>
                </form>
              </div>
            </details>
          </aside>
        </div>
        </>
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
            <button type="submit" className="min-h-12 rounded-xl bg-[#4F46E5] px-4 text-sm font-bold text-white hover:bg-[#4338CA] dark:hover:bg-[#6366F1] sm:col-span-2">Agregar ejercicio</button>
          </form>
        </div>
      )}
    </section>
  );
};
