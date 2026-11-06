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
import { useDialogFocus } from '../hooks/useDialogFocus';

interface ExerciseHistoryModalProps {
  exerciseId?: string;
  exerciseName: string;
  sessions: GymSession[];
  onClose: () => void;
}

const CHART_MARGIN = { top: 6, right: 10, left: -20, bottom: 0 };
const Y_AXIS_DOMAIN: [string, string] = ['auto', 'auto'];
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--card)',
  borderColor: 'color-mix(in srgb, var(--border) 65%, #6366f1 35%)',
  borderRadius: '0.75rem',
  fontSize: '11px',
};
const E1RM_DOT = { r: 3, fill: '#6366f1', strokeWidth: 0 };
const E1RM_ACTIVE_DOT = { r: 5, fill: '#818cf8', stroke: 'var(--card)', strokeWidth: 2 };
const tooltipFormatter = (val: any, name: any): [string, string] => [
  `${val} kg`,
  name === 'e1rm' ? '1RM Estimado' : 'Peso Máximo',
];

const ExerciseTrendChart: React.FC<{
  chartPoints: ReturnType<typeof getExerciseHistory>['chartPoints'];
}> = React.memo(({ chartPoints }) => (
  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
        Tendencia de Fuerza (e1RM / Peso)
      </span>
      <div className="flex items-center gap-3 text-[10px] font-bold">
        <span className="flex items-center gap-1.5 text-[var(--blue)]">
          <span className="h-2 w-2 rounded-full bg-[#6366f1]" />
          e1RM
        </span>
        <span className="flex items-center gap-1.5 text-[var(--text-soft)]">
          <span className="h-2 w-2 rounded-full bg-[var(--text-soft)]" />
          Peso Máx
        </span>
      </div>
    </div>

    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <LineChart data={chartPoints} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.14} />
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
            domain={Y_AXIS_DOMAIN}
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={tooltipFormatter}
          />
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={E1RM_DOT}
            activeDot={E1RM_ACTIVE_DOT}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="maxWeight"
            stroke="var(--text-soft)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
));
ExerciseTrendChart.displayName = 'ExerciseTrendChart';

export const ExerciseHistoryModal: React.FC<ExerciseHistoryModalProps> = React.memo(({
  exerciseId,
  exerciseName,
  sessions,
  onClose,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef, onClose);

  const history = useMemo(
    () => getExerciseHistory(sessions, { exerciseId, exerciseName }),
    [sessions, exerciseId, exerciseName]
  );

  const hasChartData = history.chartPoints.length >= 2;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-history-title"
        style={{
          backgroundImage: 'radial-gradient(circle at 14% 0%, rgba(99, 102, 241, 0.14), transparent 44%)',
        }}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--border)] ring-1 ring-inset ring-indigo-500/20 bg-[var(--card)] p-4 sm:p-6 shadow-2xl space-y-4 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="exercise-history-title" className="min-w-0 break-words text-lg sm:text-xl font-black text-[var(--text)] tracking-tight">
                {history.exerciseName}
              </h2>
              {history.muscleGroup && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
                  {history.muscleGroup}
                </span>
              )}
              {history.equipment && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-[var(--blue-soft)] border border-[var(--blue)]/25 text-[var(--blue)] capitalize">
                  {history.equipment}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-faint)] mt-1">
              {history.sessions.length} {history.sessions.length === 1 ? 'sesión registrada' : 'sesiones registradas'} con este ejercicio
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:border-[var(--blue)] hover:text-[var(--blue)] transition cursor-pointer"
            title="Cerrar"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* 4 PR Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Max Weight */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Peso Máx.
            </span>
            <strong className="block text-sm sm:text-base font-black text-[var(--text)] tabular-nums mt-0.5">
              {history.prs.maxWeight ? `${history.prs.maxWeight.value} kg` : '—'}
            </strong>
            {history.prs.maxWeight?.reps ? (
              <span className="text-[10px] text-[var(--text-faint)]">
                × {history.prs.maxWeight.reps} reps
              </span>
            ) : null}
          </div>

          {/* Max e1RM (LifeOS Signature Indigo) */}
          <div className="rounded-xl border border-[var(--blue)]/30 bg-[var(--blue-soft)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--blue)]">
              1RM Estimado
            </span>
            <strong className="block text-sm sm:text-base font-black text-[var(--blue)] tabular-nums mt-0.5">
              {history.prs.maxE1RM ? `~${history.prs.maxE1RM.value} kg` : '—'}
            </strong>
            {history.prs.maxE1RM?.weight ? (
              <span className="text-[10px] text-[var(--text-soft)]">
                ({history.prs.maxE1RM.weight} kg × {history.prs.maxE1RM.reps})
              </span>
            ) : null}
          </div>

          {/* Max Reps */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Máx. Reps
            </span>
            <strong className="block text-sm sm:text-base font-black text-[var(--text)] tabular-nums mt-0.5">
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
            <strong className="block text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {history.prs.maxVolume ? `${history.prs.maxVolume.value.toLocaleString('es-UY')} kg` : '—'}
            </strong>
            <span className="text-[10px] text-[var(--text-faint)]">en 1 sesión</span>
          </div>
        </div>

        {/* Trend Chart (rendered when at least 2 sessions exist) */}
        {hasChartData && <ExerciseTrendChart chartPoints={history.chartPoints} />}

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
                    <div className="text-xs text-[var(--text-soft)] tabular-nums break-words">
                      {sess.sets.map((s) => `${s.weight} kg × ${s.reps}`).join(' · ')}
                    </div>
                  </div>

                  <div className="text-right shrink-0 tabular-nums space-y-0.5">
                    <strong className="block text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {sess.volume.toLocaleString('es-UY')} kg
                    </strong>
                    {sess.e1rm > 0 && (
                      <span className="text-[10px] text-[var(--blue)] font-bold block">
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
            className="min-h-11 w-full py-2.5 px-4 rounded-xl bg-[var(--blue-soft)] hover:bg-[var(--blue)] text-[var(--blue)] hover:text-white border border-[var(--blue)]/30 text-xs font-bold transition cursor-pointer"
          >
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
});
ExerciseHistoryModal.displayName = 'ExerciseHistoryModal';
