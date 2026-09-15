import React, { useMemo, useState } from 'react';
import type { LifeOSState, MuscleGroup } from '../types';
import { calcPRs, PRInfo } from '../lib/calculations';
import { inferMuscleGroup } from '../lib/gymMigration';
import { fmtDate } from '../lib/storage';
import { AppIcon } from './AppIcon';

interface PersonalRecordsCardProps {
  state: LifeOSState;
}

const MUSCLE_GROUPS: MuscleGroup[] = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'];

export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0) return 0;
  if (reps <= 1) return weight;
  // Brzycki formula: weight * (36 / (37 - reps)) or Epley: weight * (1 + reps / 30)
  return Math.round(weight * (1 + reps / 30));
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

export const PersonalRecordsCard: React.FC<PersonalRecordsCardProps> = ({ state }) => {
  const prs = useMemo(() => calcPRs(state), [state]);
  const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos');
  const [search, setSearch] = useState('');

  const completedSessions = useMemo(
    () => state.gym.sessions.filter((s) => s.status === 'completed'),
    [state.gym.sessions]
  );

  const prList = useMemo(() => {
    return Object.entries(prs).map(([name, pr]: [string, PRInfo]) => {
      const storedMuscle = completedSessions
        .flatMap((s) => s.exercises)
        .find((e) => e.name.toLowerCase() === name.toLowerCase())?.muscleGroup;
      const muscle = storedMuscle || inferMuscleGroup(name);
      const est1RM = estimate1RM(pr.weight, pr.reps);
      return {
        name,
        muscle,
        weight: pr.weight,
        reps: pr.reps,
        date: pr.date,
        est1RM,
      };
    }).sort((a, b) => b.weight - a.weight || b.est1RM - a.est1RM);
  }, [prs, completedSessions]);

  const filteredPRs = useMemo(() => {
    return prList.filter((item) => {
      const matchMuscle = selectedMuscle === 'Todos' || item.muscle === selectedMuscle;
      const matchSearch = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase());
      return matchMuscle && matchSearch;
    });
  }, [prList, selectedMuscle, search]);

  const totalPRs = prList.length;

  return (
    <section className="surface overflow-hidden p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AppIcon name="trophy" className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text)]">Récords Personales (PRs)</h2>
              <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                {totalPRs} marcas
              </span>
            </div>
            <p className="text-xs text-[var(--text-soft)]">
              Tus mejores levantamientos con estimación de 1RM calculada.
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative min-w-[200px]">
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
      </div>

      {/* Filter tabs by Muscle Group */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedMuscle('Todos')}
          className={`shrink-0 rounded-lg px-3 py-1.5 font-semibold transition-all ${
            selectedMuscle === 'Todos'
              ? 'bg-[var(--text)] text-[var(--bg-elevated)] shadow-xs'
              : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)]'
          }`}
        >
          Todos ({totalPRs})
        </button>
        {MUSCLE_GROUPS.map((group) => {
          const count = prList.filter((p) => p.muscle === group).length;
          if (count === 0 && selectedMuscle !== group) return null;
          const isSelected = selectedMuscle === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => setSelectedMuscle(group)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 font-semibold transition-all ${
                isSelected
                  ? 'bg-[var(--text)] text-[var(--bg-elevated)] shadow-xs'
                  : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              {group} ({count})
            </button>
          );
        })}
      </div>

      {/* Visual PR Cards Grid */}
      {filteredPRs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center text-xs text-[var(--text-soft)]">
          {totalPRs === 0
            ? 'Completá tu primer entrenamiento para que tus récords aparezcan aquí automáticamente.'
            : 'No se encontraron ejercicios con los filtros seleccionados.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPRs.map((item, index) => {
            const muscleStyle = MUSCLE_COLORS[item.muscle] || MUSCLE_COLORS.Otros;
            const isTop3 = index < 3 && selectedMuscle === 'Todos' && !search;

            return (
              <div
                key={item.name}
                className={`relative rounded-2xl border bg-[var(--card)] p-4 shadow-xs hover:border-[var(--blue)]/40 transition-all ${
                  isTop3 ? 'border-amber-500/30' : 'border-[var(--border)]'
                }`}
              >
                {/* Top Badge */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${muscleStyle.bg} ${muscleStyle.text} ${muscleStyle.border}`}
                  >
                    {item.muscle}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
                    <AppIcon name="calendar" className="h-3 w-3" />
                    <span>{fmtDate(item.date)}</span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="mt-2.5 font-bold text-sm text-[var(--text)] truncate" title={item.name}>
                  {item.name}
                </h3>

                {/* Big Stat */}
                <div className="mt-3 flex items-baseline justify-between border-t border-[var(--border)]/60 pt-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                      Récord
                    </span>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <strong className="text-xl font-extrabold font-mono text-[var(--text)]">
                        {item.weight} <span className="text-xs font-semibold">kg</span>
                      </strong>
                      <span className="text-xs font-semibold text-[var(--text-soft)]">
                        × {item.reps} {item.reps === 1 ? 'rep' : 'reps'}
                      </span>
                    </div>
                  </div>

                  {item.est1RM > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                        1RM Estimado
                      </span>
                      <strong className="mt-0.5 inline-block text-sm font-bold font-mono text-[var(--blue)] bg-[var(--blue-soft)] px-2 py-0.5 rounded-md">
                        ~{item.est1RM} kg
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
