import React, { useMemo, useState } from 'react';
import type { LifeOSState, MuscleGroup } from '../types';
import type { ExerciseMetricTarget } from '../lib/gymMetrics';
import { inferMuscleGroup } from '../lib/gymMigration';
import { calculate1RM, getGymProgressMetrics } from '../lib/gymMetrics';
import { dedupeVisibleGymRecords } from '../lib/gymIdlePresentation';
import { fmtDate, todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';

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

export const PersonalRecordsCard: React.FC<PersonalRecordsCardProps> = ({ state, onSelectExercise }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const progress = useMemo(
    () => getGymProgressMetrics(state.gym.sessions, todayISO()),
    [state.gym.sessions]
  );
  const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos');
  const [search, setSearch] = useState('');

  const prList = useMemo(() => {
    return dedupeVisibleGymRecords(progress.exercises.flatMap((exercise) => {
      const best = exercise.bestSet;
      if (!best) return [];
      const storedMuscle = state.gym.sessions
        .find((session) => session.id === best.sessionId)
        ?.exercises.find((candidate) => exercise.exerciseId
          ? candidate.id === exercise.exerciseId
          : !candidate.id && candidate.name.trim().toLowerCase() === exercise.exerciseName.trim().toLowerCase()
        )?.muscleGroup;
      const muscle = storedMuscle || inferMuscleGroup(exercise.exerciseName);
      return {
        key: exercise.key,
        exerciseId: exercise.exerciseId,
        name: exercise.exerciseName,
        muscle,
        weight: best.weight,
        reps: best.reps,
        date: best.date,
        est1RM: best.e1RM,
      };
    }).sort((a, b) => b.weight - a.weight || b.est1RM - a.est1RM));
  }, [progress.exercises, state.gym.sessions]);

  const filteredPRs = useMemo(() => {
    return prList.filter((item) => {
      const matchMuscle = selectedMuscle === 'Todos' || item.muscle === selectedMuscle;
      const matchSearch = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase());
      return matchMuscle && matchSearch;
    });
  }, [prList, selectedMuscle, search]);

  const totalPRs = prList.length;
  const compactPRs = prList.slice(0, 4);

  return (
    <section className="surface overflow-hidden p-4 sm:p-5 space-y-3.5 shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AppIcon name="trophy" className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text)]">Récords Personales (PRs)</h2>
              {totalPRs > 0 && (
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.2 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  {totalPRs}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer shrink-0"
        >
          {isExpanded ? 'Contraer ↑' : `Ver todos (${totalPRs}) →`}
        </button>
      </div>

      {/* COMPACT VIEW (Default: 3-4 top records) */}
      {!isExpanded ? (
        <div className="space-y-2.5 pt-1">
          {totalPRs === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-5 text-center text-xs text-[var(--text-soft)]">
              Completá tu primer entrenamiento para registrar tus récords automáticamente.
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--border)]">
                {compactPRs.map((item) => {
                  const muscleStyle = MUSCLE_COLORS[item.muscle] || MUSCLE_COLORS.Otros;
                  return (
                    <div
                      key={item.key}
                      onClick={() => onSelectExercise?.({ exerciseId: item.exerciseId, exerciseName: item.name })}
                      className={`flex items-center justify-between py-2 transition ${
                        onSelectExercise ? 'cursor-pointer hover:bg-[var(--surface-muted)]/60 rounded-xl px-2 -mx-2' : ''
                      }`}
                      title={onSelectExercise ? `Ver historial de ${item.name}` : undefined}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold border shrink-0 ${muscleStyle.bg} ${muscleStyle.text} ${muscleStyle.border}`}
                        >
                          {item.muscle}
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] truncate">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 tabular-nums text-xs">
                        <strong className="font-extrabold text-[var(--text)]">
                          {item.weight} <span className="text-[10px] font-normal text-[var(--text-soft)]">kg</span>
                        </strong>
                        <span className="text-[11px] text-[var(--text-faint)]">
                          × {item.reps}
                        </span>
                        {item.est1RM > 0 && (
                          <span className="rounded bg-[var(--blue-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--blue)]">
                            ~{item.est1RM}kg 1RM
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPRs > 4 && (
                <div className="pt-1 text-right">
                  <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--blue)] transition cursor-pointer"
                  >
                    Ver los {totalPRs - 4} récords restantes y buscador →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* EXPANDED VIEW (With Search, Muscle Tabs & Complete Grid) */
        <div className="space-y-3.5 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            {/* Search input */}
            <div className="relative min-w-[180px] flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ejercicio..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] py-1.5 pl-8 pr-3 text-xs outline-hidden focus:border-[var(--blue)] transition-colors"
              />
              <span className="absolute left-2.5 top-2 text-[var(--text-faint)]">
                <AppIcon name="search" className="h-3.5 w-3.5" />
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer self-end sm:self-auto"
            >
              Cerrar lista ↑
            </button>
          </div>

          {/* Muscle Group Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedMuscle('Todos')}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                selectedMuscle === 'Todos'
                  ? 'bg-[var(--text)] text-[var(--bg-elevated)]'
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
                  className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                    selectedMuscle === group
                      ? 'bg-[var(--text)] text-[var(--bg-elevated)]'
                      : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  {group} ({count})
                </button>
              );
            })}
          </div>

          {/* Complete Grid */}
          {filteredPRs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-6 text-center text-xs text-[var(--text-soft)]">
              No se encontraron ejercicios con los filtros seleccionados.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredPRs.map((item, index) => {
                const muscleStyle = MUSCLE_COLORS[item.muscle] || MUSCLE_COLORS.Otros;
                const isTop3 = index < 3 && selectedMuscle === 'Todos' && !search;

                return (
                  <div
                    key={item.key}
                    onClick={() => onSelectExercise?.({ exerciseId: item.exerciseId, exerciseName: item.name })}
                    className={`rounded-xl border bg-[var(--card)] p-3 space-y-1.5 transition ${
                      onSelectExercise ? 'cursor-pointer hover:border-[var(--blue)] shadow-xs' : 'hover:border-[var(--border-hover)]'
                    } ${
                      isTop3 ? 'border-amber-500/30' : 'border-[var(--border)]'
                    }`}
                    title={onSelectExercise ? `Ver historial de ${item.name}` : undefined}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold border ${muscleStyle.bg} ${muscleStyle.text} ${muscleStyle.border}`}
                      >
                        {item.muscle}
                      </span>
                      <span className="text-[10px] text-[var(--text-faint)] tabular-nums">
                        {fmtDate(item.date)}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-[var(--text)] truncate" title={item.name}>
                      {item.name}
                    </h3>

                    <div className="flex items-baseline justify-between pt-1 border-t border-[var(--border)]/60 tabular-nums">
                      <div>
                        <strong className="text-sm font-extrabold text-[var(--text)]">
                          {item.weight} <span className="text-[10px]">kg</span>
                        </strong>
                        <span className="text-[10px] text-[var(--text-soft)] ml-1">
                          × {item.reps}
                        </span>
                      </div>
                      {item.est1RM > 0 && (
                        <span className="text-[10px] font-bold text-[var(--blue)] bg-[var(--blue-soft)] px-1.5 py-0.5 rounded">
                          ~{item.est1RM} kg 1RM
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
