import React, { useMemo, useState } from 'react';
import type { GymSession, LifeOSState, MuscleGroup } from '../types';
import type { ExerciseMetricTarget } from '../lib/gymMetrics';
import { inferMuscleGroup } from '../lib/gymMigration';
import { calculate1RM, getUnifiedGymProgressMetrics, normalizeExerciseName } from '../lib/gymMetrics';
import { fmtDate, todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { ContextualHelp } from './ContextualHelp';

interface PersonalRecordsCardProps {
  state: LifeOSState;
  onSelectExercise?: (target: ExerciseMetricTarget) => void;
}

const MUSCLE_GROUPS: MuscleGroup[] = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'];

export function estimate1RM(weight: number, reps: number): number {
  return calculate1RM(weight, reps);
}

const MUSCLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Pecho: { bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/20' },
  Espalda: { bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/20' },
  Piernas: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
  Hombros: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
  Brazos: { bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/20' },
  Core: { bg: 'bg-teal-500/10 dark:bg-teal-500/20', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-500/20' },
  Cardio: { bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/20' },
  Otros: { bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-500/20' },
};

export const PersonalRecordsCard: React.FC<PersonalRecordsCardProps> = React.memo(({ state, onSelectExercise }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const progress = useMemo(
    () => getUnifiedGymProgressMetrics(state.gym.sessions, todayISO()),
    [state.gym.sessions]
  );
  const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos');
  const [search, setSearch] = useState('');

  const prList = useMemo(() => {
    const sessionById = new Map<string, GymSession>(state.gym.sessions.map((s) => [s.id, s]));
    return progress.exercises.flatMap((exercise) => {
      const best = exercise.bestSet;
      if (!best) return [];
      const normTarget = normalizeExerciseName(exercise.exerciseName);
      const storedMuscle = sessionById
        .get(best.sessionId)
        ?.exercises.find((candidate) => normalizeExerciseName(candidate.name) === normTarget)?.muscleGroup;
      const inferred = inferMuscleGroup(exercise.exerciseName);
      const muscle = (storedMuscle === 'Pecho' && inferred === 'Espalda')
        ? 'Espalda'
        : (storedMuscle || inferred);
      return [{
        key: exercise.key,
        exerciseId: exercise.exerciseId,
        name: exercise.exerciseName,
        muscle,
        weight: best.weight,
        reps: best.reps,
        date: best.date,
        est1RM: best.e1RM,
      }];
    }).sort((a, b) => b.weight - a.weight || b.est1RM - a.est1RM);
  }, [progress.exercises, state.gym.sessions]);

  const filteredPRs = useMemo(() => {
    return prList.filter((item) => {
      const matchMuscle = selectedMuscle === 'Todos' || item.muscle === selectedMuscle;
      const matchSearch = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase());
      return matchMuscle && matchSearch;
    });
  }, [prList, selectedMuscle, search]);

  const totalPRs = prList.length;
  const visiblePRs = isExpanded ? filteredPRs : prList.slice(0, 6);

  return (
    <section className="surface overflow-hidden p-4 sm:p-6 space-y-4 shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AppIcon name="trophy" className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text)]">Récords Personales (PRs)</h2>
              {totalPRs > 0 && (
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {totalPRs} {totalPRs === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
              )}
              <ContextualHelp label="Qué muestra Récords Personales">
                Un récord por cada ejercicio único que realizaste: toma tu serie efectiva con mayor peso levantado y calcula su 1RM estimado (fórmula de Epley hasta 12 repeticiones). Tocá cualquier tarjeta para abrir su ficha completa.
              </ContextualHelp>
            </div>
          </div>
        </div>

        {totalPRs > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-xs sm:text-sm font-bold text-[var(--blue)] hover:underline cursor-pointer shrink-0"
          >
            {isExpanded ? 'Contraer ↑' : `Ver todos (${totalPRs}) →`}
          </button>
        )}
      </div>

      {totalPRs === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-5 text-center text-sm text-[var(--text-soft)]">
          Completá tu primer entrenamiento para registrar tus récords automáticamente.
        </div>
      ) : (
        <div className="space-y-4">
          {isExpanded && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="relative min-w-[180px] flex-1">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar ejercicio..."
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] py-2 pl-9 pr-3 text-sm outline-hidden focus:border-[var(--blue)] transition-colors"
                  />
                  <span className="absolute left-3 top-2.5 text-[var(--text-faint)]">
                    <AppIcon name="search" className="h-4 w-4" />
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer self-end sm:self-auto"
                >
                  Cerrar filtros ↑
                </button>
              </div>

              {/* Muscle Group Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedMuscle('Todos')}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    selectedMuscle === 'Todos'
                      ? 'bg-[var(--blue)] text-white shadow-2xs'
                      : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  Todos ({totalPRs})
                </button>
                {MUSCLE_GROUPS.map((group) => {
                  const count = prList.filter((p) => p.muscle === group).length;
                  if (count === 0 && selectedMuscle !== group) return null;
                  return (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setSelectedMuscle(group)}
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        selectedMuscle === group
                          ? 'bg-[var(--blue)] text-white shadow-2xs'
                          : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                      }`}
                    >
                      {group} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Readable Card Grid (used in both default and expanded views) */}
          {visiblePRs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--text-soft)]">
              No se encontraron ejercicios con los filtros seleccionados.
            </div>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${isExpanded ? 'max-h-[440px] overflow-y-auto pr-1' : ''}`}>
              {visiblePRs.map((item, index) => {
                const muscleStyle = MUSCLE_COLORS[item.muscle] || MUSCLE_COLORS.Otros;
                const isTop3 = index < 3 && (!isExpanded || (selectedMuscle === 'Todos' && !search));

                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => onSelectExercise?.({ exerciseId: item.exerciseId, exerciseName: item.name })}
                    className={`w-full text-left rounded-2xl border bg-[var(--card)] p-3.5 sm:p-4 space-y-2 transition ${
                      onSelectExercise
                        ? 'cursor-pointer hover:border-[var(--blue)] hover:bg-[var(--surface-muted)]/40 shadow-2xs'
                        : 'hover:border-[var(--border-hover)]'
                    } ${
                      isTop3 ? 'border-indigo-500/35' : 'border-[var(--border)]'
                    }`}
                    title={onSelectExercise ? `Ver ficha e historial de ${item.name}` : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] sm:text-[11px] font-bold border ${muscleStyle.bg} ${muscleStyle.text} ${muscleStyle.border}`}
                      >
                        {item.muscle}
                      </span>
                      <span className="text-xs text-[var(--text-faint)] tabular-nums">
                        {fmtDate(item.date)}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-[15px] font-bold text-[var(--text)] truncate" title={item.name}>
                      {item.name}
                    </h3>

                    <div className="flex items-baseline justify-between pt-1.5 border-t border-[var(--border)]/60 tabular-nums">
                      <div>
                        <strong className="text-base sm:text-lg font-black text-[var(--text)]">
                          {item.weight} <span className="text-xs font-semibold text-[var(--text-soft)]">kg</span>
                        </strong>
                        <span className="text-xs font-semibold text-[var(--text-soft)] ml-1.5">
                          × {item.reps}
                        </span>
                      </div>
                      {item.est1RM > 0 && (
                        <span className="text-[11px] font-bold text-[var(--blue)] bg-[var(--blue-soft)] border border-[var(--blue)]/20 px-2 py-0.5 rounded-lg">
                          ~{item.est1RM} kg 1RM
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isExpanded && totalPRs > 6 && (
            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--blue)] transition cursor-pointer"
              >
                Ver los {totalPRs - 6} ejercicios restantes y buscador →
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
PersonalRecordsCard.displayName = 'PersonalRecordsCard';
