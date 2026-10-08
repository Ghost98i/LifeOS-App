import React, { useState } from 'react';
import type { ExerciseEquipment, GymSession, GymSet, MuscleGroup } from '../types';
import { EXERCISE_EQUIPMENT_OPTIONS, inferExerciseEquipment, inferMuscleGroup } from '../lib/gymMigration';
import { getPerformedGymVolume } from '../lib/gymFlows';
import { AppIcon } from './AppIcon';

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

interface ActiveWorkoutViewProps {
  session: GymSession;
  exerciseIndex: number;
  setIndex: number;
  previousSet?: PreviousSetReference | null;
  previousSessionBest?: string | null;
  restTimer?: React.ReactNode;
  exerciseSuggestions: string[];
  onSelectExercise: (exerciseIndex: number) => void;
  onSelectSet: (setIndex: number) => void;
  onAdjustWeight: (delta: number) => void;
  onAdjustReps: (delta: number) => void;
  onUpdateCurrentSet: (updates: Partial<GymSet>) => void;
  onToggleCurrentSet: () => void;
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
  onOpenHistory: (exerciseName: string) => void;
  onOpenHistoryTab: () => void;
  onOpenProgressTab: () => void;
  onFinish: () => void;
  onDeleteSession: () => void;
  onSaveAsTemplate: () => void;
  onEditSessionDate: (date: string) => void;
  onEditSessionWeek: (weekLabel: string) => void;
}

const controlClass =
  'min-h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition-colors focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-soft)]';

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
    return `${Math.max(0, (weight - barWeight) / 2)} kg por lado · barra de ${barWeight} kg`;
  }
  if (equipment === 'mancuerna') return `Mancuerna de ${weight} kg`;
  if (equipment === 'polea') return `Polea · ${weight} kg`;
  if (equipment === 'maquina') return `Máquina · ${weight} kg`;
  if (equipment === 'corporal') return weight > 0 ? `Peso corporal + ${weight} kg` : 'Peso corporal';
  return `${weight} kg`;
}

export const ActiveWorkoutView: React.FC<ActiveWorkoutViewProps> = ({
  session,
  exerciseIndex,
  setIndex,
  previousSet,
  previousSessionBest,
  restTimer,
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
  onFinish,
  onDeleteSession,
  onSaveAsTemplate,
  onEditSessionDate,
  onEditSessionWeek,
}) => {
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscle, setNewExerciseMuscle] = useState<MuscleGroup>('Pecho');
  const [newExerciseEquipment, setNewExerciseEquipment] = useState<ExerciseEquipment>('barra');
  const [newExerciseBar, setNewExerciseBar] = useState(20);
  const [newExerciseWeight, setNewExerciseWeight] = useState(40);
  const [newExerciseReps, setNewExerciseReps] = useState(10);

  const safeExerciseIndex = Math.max(0, Math.min(exerciseIndex, session.exercises.length - 1));
  const exercise = session.exercises[safeExerciseIndex];
  const sets = exercise?.sets || [];
  const safeSetIndex = Math.max(0, Math.min(setIndex, Math.max(0, sets.length - 1)));
  const currentSet = sets[safeSetIndex];
  const progress = setProgress(session);
  const completedExerciseSets = sets.filter((set) => set.completed).length;
  const exerciseComplete = sets.length > 0 && completedExerciseSets === sets.length;
  const nextExercise = session.exercises[safeExerciseIndex + 1];
  const equipment = exercise
    ? exercise.equipment || (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : 'mancuerna')
    : 'mancuerna';
  const barWeight = exercise?.barWeight ?? (equipment === 'barra' ? 20 : 0);
  const sessionTitle = session.weekLabel?.trim() || 'Entrenamiento activo';

  const selectExercise = (index: number) => {
    const selectedExercise = session.exercises[index];
    const firstIncomplete = selectedExercise?.sets?.findIndex((set) => !set.completed) ?? -1;
    onSelectExercise(index);
    onSelectSet(firstIncomplete >= 0 ? firstIncomplete : 0);
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

  return (
    <section data-active-workout-view className="mx-auto w-full min-w-0 max-w-[1180px] space-y-4 overflow-x-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--blue)]">Sesión activa</p>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">{sessionTitle}</h1>
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-soft)]">
              {progress.completed}/{progress.total} series
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Iniciado {session.startedAt || 'hoy'} · {getPerformedGymVolume(session)} kg realizados
          </p>
        </div>

        <details className="group relative shrink-0">
          <summary
            aria-label="Opciones de la sesión"
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            <AppIcon name="more" className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl">
              <button
                type="button"
                onClick={onOpenHistoryTab}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
              >
                <AppIcon name="calendar" className="h-4 w-4 text-[var(--text-soft)]" />
                Abrir historial
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
        <>
          <nav aria-label="Ejercicios de la sesión" className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Ejercicio anterior"
                disabled={safeExerciseIndex === 0}
                onClick={() => selectExercise(safeExerciseIndex - 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] transition-colors hover:border-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <AppIcon name="chevronLeft" className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-xs text-[var(--text-faint)]">
                  Ejercicio {safeExerciseIndex + 1} de {session.exercises.length}
                </p>
                <h2 className="truncate text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">{exercise.name}</h2>
                {nextExercise && <p className="truncate text-xs text-[var(--text-soft)]">Después: {nextExercise.name}</p>}
              </div>
              <button
                type="button"
                aria-label="Ejercicio siguiente"
                disabled={safeExerciseIndex >= session.exercises.length - 1}
                onClick={() => selectExercise(safeExerciseIndex + 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] transition-colors hover:border-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <AppIcon name="chevronRight" className="h-5 w-5" />
              </button>
            </div>

            <div className="no-scrollbar hidden gap-2 overflow-x-auto pb-1 sm:flex">
              {session.exercises.map((item, index) => {
                const done = item.sets?.filter((set) => set.completed).length || 0;
                const total = item.sets?.length || 0;
                const selected = index === safeExerciseIndex;
                const allDone = total > 0 && done === total;
                return (
                  <button
                    key={item.id || `${item.name}-${index}`}
                    type="button"
                    onClick={() => selectExercise(index)}
                    className={`min-h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      selected
                        ? 'border-[var(--blue)] bg-[var(--blue)] text-white'
                        : allDone
                          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)]'
                    }`}
                  >
                    {index + 1}. {item.name} · {done}/{total}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,820px)_minmax(260px,1fr)]">
            <main data-active-set-editor className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-soft)]">Serie {safeSetIndex + 1} de {sets.length}</p>
                  <p className="mt-1 text-xs text-[var(--text-faint)]">
                    {plateDescription(equipment, Number(currentSet?.weight) || 0, barWeight)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHistory(exercise.name)}
                  className="min-h-11 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:text-[var(--blue)]"
                >
                  Historial
                </button>
              </div>

              {previousSet && (
                <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-faint)]">Última vez · serie {safeSetIndex + 1}</p>
                    <p className="font-mono text-sm font-bold text-[var(--text)]">
                      {previousSet.weight} kg × {previousSet.reps} reps
                    </p>
                    {previousSessionBest && (
                      <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">
                        Mejor serie de esa sesión: {previousSessionBest}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateCurrentSet({ weight: previousSet.weight, reps: previousSet.reps })}
                    className="min-h-11 shrink-0 rounded-xl bg-[var(--blue-soft)] px-3 text-xs font-bold text-[var(--blue)] transition-colors hover:bg-[var(--blue)] hover:text-white"
                  >
                    Usar valores
                  </button>
                </div>
              )}

              {currentSet ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <fieldset className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-2.5">
                      <legend className="px-1 text-xs font-semibold text-[var(--text-soft)]">Peso · kg</legend>
                      <input
                        aria-label="Peso en kilogramos"
                        type="number"
                        min="0"
                        step="0.25"
                        inputMode="decimal"
                        value={currentSet.weight}
                        onChange={(event) => onUpdateCurrentSet({ weight: Math.max(0, Number(event.target.value) || 0) })}
                        className="mt-1 h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-2 text-center font-mono text-xl font-bold text-[var(--text)] outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-soft)]"
                      />
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          aria-label="Restar 2,5 kg"
                          onClick={() => onAdjustWeight(-2.5)}
                          className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
                        >
                          −2,5
                        </button>
                        <button
                          type="button"
                          aria-label="Sumar 2,5 kg"
                          onClick={() => onAdjustWeight(2.5)}
                          className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
                        >
                          +2,5
                        </button>
                      </div>
                    </fieldset>

                    <fieldset className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-2.5">
                      <legend className="px-1 text-xs font-semibold text-[var(--text-soft)]">Repeticiones</legend>
                      <input
                        aria-label="Repeticiones"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={currentSet.reps}
                        onChange={(event) => onUpdateCurrentSet({ reps: Math.max(1, Number(event.target.value) || 1) })}
                        className="mt-1 h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-2 text-center font-mono text-xl font-bold text-[var(--text)] outline-none focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-soft)]"
                      />
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          aria-label="Restar una repetición"
                          onClick={() => onAdjustReps(-1)}
                          className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
                        >
                          −1
                        </button>
                        <button
                          type="button"
                          aria-label="Sumar una repetición"
                          onClick={() => onAdjustReps(1)}
                          className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
                        >
                          +1
                        </button>
                      </div>
                    </fieldset>
                  </div>

                  <button
                    type="button"
                    onClick={onToggleCurrentSet}
                    className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors active:scale-[0.99] ${
                      currentSet.completed
                        ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-[var(--blue)] text-white shadow-sm hover:bg-[var(--blue-hover)]'
                    }`}
                  >
                    <AppIcon name={currentSet.completed ? 'checkCircle' : 'check'} className="h-5 w-5" />
                    {currentSet.completed
                      ? `Serie ${safeSetIndex + 1} completada · desmarcar`
                      : `Completar serie ${safeSetIndex + 1} · ${currentSet.weight} kg × ${currentSet.reps}`}
                  </button>

                  {currentSet.completed && exerciseComplete && (
                    <p className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      {nextExercise ? `Ejercicio completo. Sigue ${nextExercise.name}.` : 'Último ejercicio completo.'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-5 text-center">
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

              {sets.length > 0 && (
                <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Series del ejercicio">
                  {sets.map((set, index) => (
                    <button
                      key={set.id || index}
                      type="button"
                      onClick={() => onSelectSet(index)}
                      className={`min-h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                        index === safeSetIndex
                          ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg-elevated)]'
                          : set.completed
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)]'
                      }`}
                    >
                      Serie {index + 1} · {set.weight} × {set.reps} {set.completed ? '· Hecha' : ''}
                    </button>
                  ))}
                </div>
              )}
            </main>

            <aside className="min-w-0 space-y-3">
              {restTimer}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">Sesión</h3>
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
                    Ver ejercicios
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

              <details className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text)]">
                  Ajustes y mantenimiento
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
                    <p className="text-xs font-semibold text-[var(--text)]">Agregar ejercicio</p>
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
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
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
