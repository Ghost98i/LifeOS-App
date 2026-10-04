import React from 'react';
import type { GymSession } from '../types';
import type { NewPRRecord } from '../lib/gymMetrics';
import { calculateSessionDuration } from '../lib/gymMetrics';
import { sessionVolume } from '../lib/gymMigration';
import { AppIcon } from './AppIcon';
import { fmtDate } from '../lib/storage';

interface WorkoutSummaryModalProps {
  session: GymSession;
  newPRs: NewPRRecord[];
  onClose: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  session,
  newPRs,
  onClose,
}) => {
  const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      previousFocusedElementRef.current = document.activeElement;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusedElementRef.current && typeof previousFocusedElementRef.current.focus === 'function') {
        previousFocusedElementRef.current.focus();
      }
    };
  }, [onClose]);

  const duration = calculateSessionDuration(session.startedAt, session.finishedAt);
  const totalExercises = (session.exercises || []).length;
  const completedSets = session.exercises.reduce(
    (acc, ex) => acc + (ex.sets || []).filter((s) => s.completed).length,
    0
  );
  const totalSets = session.exercises.reduce((acc, ex) => acc + (ex.sets || []).length, 0);
  const totalVolume = completedSets > 0
    ? session.exercises.reduce(
        (acc, ex) =>
          acc +
          (ex.sets || [])
            .filter((s) => s.completed)
            .reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0),
        0
      )
    : sessionVolume(session);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-summary-title"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center space-y-1.5 pt-1">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 text-2xl shadow-inner mb-1">
            🏆
          </span>
          <h2 id="workout-summary-title" className="text-xl font-black text-[var(--text)] tracking-tight">
            ¡Entrenamiento Completado!
          </h2>
          <p className="text-xs text-[var(--text-soft)]">
            {fmtDate(session.date)} {session.finishedAt ? `· Finalizado a las ${session.finishedAt}` : ''}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Duración
            </span>
            <strong className="block text-sm font-extrabold text-[var(--text)] mt-0.5 font-mono">
              {duration.formatted}
            </strong>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Volumen
            </span>
            <strong className="block text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
              {totalVolume.toLocaleString('es-UY')} <span className="text-[10px] font-normal">kg</span>
            </strong>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Series
            </span>
            <strong className="block text-sm font-extrabold text-[var(--text)] mt-0.5 font-mono">
              {completedSets}/{totalSets}
            </strong>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Ejercicios
            </span>
            <strong className="block text-sm font-extrabold text-[var(--text)] mt-0.5 font-mono">
              {totalExercises}
            </strong>
          </div>
        </div>

        {/* PRs Section */}
        {newPRs.length > 0 ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <AppIcon name="trophy" className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                ¡{newPRs.length} Nuevo(s) Récord(s) Personales!
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {newPRs.map((pr, idx) => (
                <div
                  key={`${pr.exerciseName}-${pr.type}-${idx}`}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--card)] border border-amber-500/20 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-extrabold text-[var(--text)] block truncate">
                      {pr.exerciseName}
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      {pr.typeLabel}
                    </span>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <span className="font-extrabold text-[var(--text)] text-xs block">
                      {pr.label}
                    </span>
                    {pr.previousValue !== undefined && pr.previousValue > 0 && (
                      <span className="text-[10px] text-[var(--text-faint)]">
                        Ant: {pr.previousValue}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-center">
            <p className="text-xs text-[var(--text-soft)]">
              Entrenamiento consistente completado. ¡Gran trabajo acumulando volumen!
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Continuar</span>
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
