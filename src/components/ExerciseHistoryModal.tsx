import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { GymSession } from '../types';
import { getExerciseHistory } from '../lib/gymMetrics';
import { AppIcon } from './AppIcon';
import { fmtDate } from '../lib/storage';

interface ExerciseHistoryModalProps {
  exerciseId?: string;
  exerciseName: string;
  sessions: GymSession[];
  onClose: () => void;
}

export const ExerciseHistoryModal: React.FC<ExerciseHistoryModalProps> = ({
  exerciseId,
  exerciseName,
  sessions,
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

  const history = useMemo(
    () => getExerciseHistory(sessions, { exerciseId, exerciseName }),
    [sessions, exerciseId, exerciseName]
  );

  const hasChartData = history.chartPoints.length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-history-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="exercise-history-title" className="text-lg font-black text-[var(--text)] tracking-tight truncate">
                {history.exerciseName}
              </h2>
              {history.muscleGroup && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
                  {history.muscleGroup}
                </span>
              )}
              {history.equipment && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 capitalize">
                  {history.equipment}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">
              {history.sessions.length} sesión(es) registrada(s) con este ejercicio
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
            title="Cerrar"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* 4 PR Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Max Weight */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Peso Máx.
            </span>
            <strong className="block text-sm font-black text-[var(--text)] tabular-nums mt-0.5">
              {history.prs.maxWeight ? `${history.prs.maxWeight.value} kg` : '—'}
            </strong>
            {history.prs.maxWeight?.reps ? (
              <span className="text-[10px] text-[var(--text-faint)]">
                × {history.prs.maxWeight.reps} reps
              </span>
            ) : null}
          </div>

          {/* Max e1RM */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              1RM Estimado
            </span>
            <strong className="block text-sm font-black text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
              {history.prs.maxE1RM ? `~${history.prs.maxE1RM.value} kg` : '—'}
            </strong>
            {history.prs.maxE1RM?.weight ? (
              <span className="text-[10px] text-[var(--text-faint)]">
                ({history.prs.maxE1RM.weight}k × {history.prs.maxE1RM.reps})
              </span>
            ) : null}
          </div>

          {/* Max Reps */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Máx. Reps
            </span>
            <strong className="block text-sm font-black text-[var(--text)] tabular-nums mt-0.5">
              {history.prs.maxReps ? `${history.prs.maxReps.value} reps` : '—'}
            </strong>
            {history.prs.maxReps?.weight ? (
              <span className="text-[10px] text-[var(--text-faint)]">
                @ {history.prs.maxReps.weight} kg
              </span>
            ) : null}
          </div>

          {/* Max Volume */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Volumen Máx.
            </span>
            <strong className="block text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {history.prs.maxVolume ? `${history.prs.maxVolume.value.toLocaleString('es-UY')}k` : '—'}
            </strong>
            <span className="text-[10px] text-[var(--text-faint)]">en 1 sesión</span>
          </div>
        </div>

        {/* Trend Chart (rendered when at least 2 sessions exist) */}
        {hasChartData && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Tendencia de Fuerza (e1RM / Peso)
              </span>
              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span className="flex items-center gap-1 text-blue-500">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  e1RM
                </span>
                <span className="flex items-center gap-1 text-[var(--text-soft)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--text-soft)]" />
                  Peso Máx
                </span>
              </div>
            </div>

            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history.chartPoints} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="shortDate"
                    stroke="var(--text-faint)"
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--text-faint)"
                    fontSize={10}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                    formatter={(val: any, name: any) => [
                      `${val} kg`,
                      name === 'e1rm' ? '1RM Estimado' : 'Peso Máximo',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#3b82f6' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="maxWeight"
                    stroke="var(--text-soft)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent 5 Sessions List */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
            Últimas {history.recent5.length} Sesiones
          </span>

          {history.recent5.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] text-center py-4">
              Sin entrenamientos previos registrados para este ejercicio.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden">
              {history.recent5.map((sess) => (
                <div key={sess.sessionId} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="font-extrabold text-[var(--text)] tabular-nums block">
                      {fmtDate(sess.date)}
                    </span>
                    <div className="text-[11px] text-[var(--text-soft)] tabular-nums truncate">
                      {sess.sets.map((s) => `${s.weight}k × ${s.reps}`).join(' · ')}
                    </div>
                  </div>

                  <div className="text-right shrink-0 tabular-nums space-y-0.5">
                    <strong className="block text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {sess.volume.toLocaleString('es-UY')} kg
                    </strong>
                    {sess.e1rm > 0 && (
                      <span className="text-[10px] text-blue-500 font-bold block">
                        ~{sess.e1rm} kg 1RM
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] text-xs font-bold transition cursor-pointer"
          >
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
};
