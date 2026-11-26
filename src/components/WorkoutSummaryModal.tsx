import React, { useMemo, useState } from 'react';
import type { GymSession } from '../types';
import type { NewPRRecord, SessionExercisePR } from '../lib/gymMetrics';
import {
  calculateSessionDuration,
  getCompletedGymSets,
  getPerformedGymVolume,
  groupSessionPRsByExercise,
} from '../lib/gymMetrics';
import { AppIcon } from './AppIcon';
import { fmtDate } from '../lib/storage';
import { LifeOSLottie } from './visual/LifeOSLottie';
import { useDialogFocus } from '../hooks/useDialogFocus';

const PR_BADGE_ORDER: NewPRRecord['type'][] = ['maxWeight', 'maxE1RM', 'maxVolume', 'maxReps'];
const PR_BADGE_LABELS: Record<NewPRRecord['type'], string> = {
  maxWeight: 'Peso',
  maxE1RM: '1RM',
  maxVolume: 'Volumen',
  maxReps: 'Reps',
};

function formatExercisePRBestSet(entry: SessionExercisePR): string {
  if (entry.bestSet) {
    if (entry.bestSet.weight > 0) {
      return `${entry.bestSet.weight} kg × ${entry.bestSet.reps}`;
    }
    return `${entry.bestSet.reps} reps`;
  }
  const withWeight = entry.records.find((r) => (r.weight || 0) > 0 && (r.reps || 0) > 0);
  if (withWeight) return `${withWeight.weight} kg × ${withWeight.reps}`;
  const withReps = entry.records.find((r) => (r.reps || 0) > 0);
  if (withReps) return `${withReps.reps} reps`;
  return entry.records[0]?.label || '';
}

interface WorkoutSummaryModalProps {
  session: GymSession;
  newPRs: NewPRRecord[];
  streakIncrease?: { previous: number; current: number } | null;
  onClose: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  session,
  newPRs,
  streakIncrease,
  onClose,
}) => {
  const [showAllPRs, setShowAllPRs] = useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose, '#gym-routine-choice');

  const completedSets = getCompletedGymSets(session).length;
  const duration = calculateSessionDuration(session.startedAt, session.finishedAt, session);
  const durationDisplay = duration.minutes > 0
    ? duration.formatted
    : (completedSets > 0 ? '< 1 min' : (session.startedAt && session.finishedAt ? duration.formatted : 'Sin registrar'));

  const totalExercises = (session.exercises || []).length;
  const totalSets = session.exercises.reduce((acc, ex) => acc + (ex.sets || []).length, 0);
  const totalVolume = getPerformedGymVolume(session);

  const groupedPRs = useMemo(
    () => groupSessionPRsByExercise(session, newPRs),
    [session, newPRs]
  );

  // Mostrar hasta 4 ejercicios inicialmente para evitar listas gigantes que rompan el viewport
  const displayedPRs = showAllPRs ? groupedPRs : groupedPRs.slice(0, 4);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-summary-title"
        className="gym-summary-modal flex flex-col w-full sm:max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />

        {/* Header Compacto y Estable */}
        <div className="shrink-0 px-5 pt-4 pb-3 text-center border-b border-[var(--border)]/40 bg-[var(--surface-muted)]/30">
          <div className="gym-summary-confirmation mx-auto flex h-11 w-11 items-center justify-center rounded-xl mb-1.5">
            <AppIcon name="checkCircle" className="h-6 w-6" />
          </div>
          <h2 id="workout-summary-title" className="text-lg sm:text-xl font-black text-[var(--text)] tracking-tight">
            Entrenamiento completado
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-soft)]">
            {fmtDate(session.date)} {session.finishedAt ? `· Finalizado a las ${session.finishedAt}` : ''}
          </p>
        </div>

        {/* Cuerpo Desplazable (Único contenedor con scroll natural) */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 sm:p-5 space-y-4">
          {/* Métricas Principales */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 sm:p-3 text-center">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Duración
              </span>
              <strong className="block text-sm font-extrabold text-[var(--text)] mt-0.5 tabular-nums">
                {durationDisplay}
              </strong>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 sm:p-3 text-center">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Volumen efectivo
              </span>
              <strong className="gym-summary-volume block text-sm font-extrabold mt-0.5 tabular-nums">
                {totalVolume.toLocaleString('es-UY')} <span className="text-[10px] font-normal">kg</span>
              </strong>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 sm:p-3 text-center">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Series
              </span>
              <strong className="block text-sm font-extrabold text-[var(--text)] mt-0.5 tabular-nums">
                {completedSets}/{totalSets}
              </strong>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 sm:p-3 text-center">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Ejercicios
              </span>
              <strong className="block text-sm font-extrabold text-[var(--text)] mt-0.5 tabular-nums">
                {totalExercises}
              </strong>
            </div>
          </div>

          {/* Sección de Récords Personales (1 fila por ejercicio único) */}
          {groupedPRs.length > 0 ? (
            <div className="gym-pr-celebration rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-amber-500/10 p-3.5 sm:p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <AppIcon name="trophy" className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Récords Personales
                    </span>
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-[var(--text)]">
                      {groupedPRs.length === 1 ? '¡1 nuevo PR!' : `¡${groupedPRs.length} nuevos PRs!`}
                    </h3>
                  </div>
                </div>

                {groupedPRs.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllPRs((prev) => !prev)}
                    className="text-[11px] font-bold text-amber-800 dark:text-amber-200 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  >
                    {showAllPRs ? 'Ver menos' : `Ver todos (${groupedPRs.length})`}
                  </button>
                )}
              </div>

              {/* Lista agrupada: 1 fila por ejercicio */}
              <div className="space-y-1.5">
                {displayedPRs.map((entry) => {
                  const typesSet = new Set(entry.records.map((r) => r.type));
                  const badges = PR_BADGE_ORDER.filter((type) => typesSet.has(type));
                  const bestLabel = formatExercisePRBestSet(entry);
                  return (
                    <div
                      key={entry.exerciseKey}
                      data-pr-exercise-row={entry.exerciseKey}
                      className="p-2.5 rounded-xl bg-[var(--card)] border border-amber-500/20 text-xs shadow-xs space-y-1.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-extrabold text-[var(--text)] min-w-0 truncate">
                          {entry.exerciseName}
                        </span>
                        {bestLabel && (
                          <span className="font-extrabold text-[var(--text)] tabular-nums shrink-0">
                            {bestLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {badges.map((type) => (
                          <span
                            key={type}
                            className="inline-flex items-center rounded-md border border-amber-500/25 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300"
                          >
                            {PR_BADGE_LABELS[type]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 text-center">
              <p className="text-xs text-[var(--text-soft)]">
                Sesión registrada. Tus series realizadas quedaron guardadas.
              </p>
            </div>
          )}

          {/* Celebración de Racha */}
          {streakIncrease && streakIncrease.current > streakIncrease.previous && (
            <div className="gym-streak-celebration flex items-center gap-3 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-3 sm:p-3.5">
              <LifeOSLottie
                src="/motion/gym-streak-fire.lottie"
                label="Racha de gimnasio aumentada"
                className="h-11 w-11 shrink-0"
                fallback={
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400">
                    <AppIcon name="flame" className="h-6 w-6" />
                  </span>
                }
              />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-300">
                  Consistencia real
                </p>
                <p className="text-sm font-black text-[var(--text)]">
                  {streakIncrease.current} día{streakIncrease.current === 1 ? '' : 's'} entrenado{streakIncrease.current === 1 ? '' : 's'} en continuidad
                </p>
                <p className="text-[11px] text-[var(--text-soft)]">
                  Los descansos conservan la continuidad sin sumar días entrenados.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer FIJO: El botón Continuar está SIEMPRE visible y accesible */}
        <div className="shrink-0 p-3.5 sm:p-4 border-t border-[var(--border)] bg-[var(--card)] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Continuar en Celestian"
            className="w-full min-h-12 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-sm font-bold transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Continuar</span>
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
