import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { LifeOSState } from '../types';
import { RestTimer } from './RestTimer';
import { BodyCompositionCard } from './BodyCompositionCard';
import { bodyCompositionEstimate } from '../lib/bodyComposition';
import { buildGymHistory, type GymWeekGroup } from '../lib/gymHistory';
import {
  todayISO,
  fmtDate,
  uid,
} from '../lib/storage';
import {
  currentWeight,
  weightVariation,
  calcGymStreak,
  calcPRs,
  sortedWeight,
} from '../lib/calculations';

interface GimnasioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const GimnasioView: React.FC<GimnasioViewProps> = ({ state, onUpdateState }) => {
  const [weightDate, setWeightDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState('');

  const [waistDate, setWaistDate] = useState(todayISO());
  const [waistCm, setWaistCm] = useState('');

  const [sessionDate, setSessionDate] = useState(todayISO());
  const [sessionWeekLabel, setSessionWeekLabel] = useState('');
  const [sessionTemplate, setSessionTemplate] = useState('');

  const [templateName, setTemplateName] = useState('');

  const allExerciseNames = Array.from(
    new Set(
      state.gym.sessions.flatMap((s) => s.exercises.map((e) => e.name.trim())).filter(Boolean)
    )
  );

  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const activeExercise = selectedExercise || allExerciseNames[0] || '';

  const peso = currentWeight(state);
  const variacion = weightVariation(state);
  const composition = bodyCompositionEstimate(state);
  const streak = calcGymStreak(state);
  const prs = calcPRs(state);
  const weightPts = sortedWeight(state);
  const ref = new Date();
  const diasEntrenadosAnio = new Set(
    state.gym.sessions.filter((s) => new Date(s.date + 'T00:00:00').getFullYear() === ref.getFullYear()).map((s) => s.date)
  ).size;

  const bodyWeightChartData = weightPts.map((p) => ({
    dateLabel: fmtDate(p.date),
    rawDate: p.date,
    kg: p.kg,
  }));

  const bwVals = bodyWeightChartData.map((d) => d.kg);
  const bwMin = bwVals.length > 0 ? Math.max(0, Math.floor(Math.min(...bwVals) - 2)) : 50;
  const bwMax = bwVals.length > 0 ? Math.ceil(Math.max(...bwVals) + 2) : 100;

  const liftingChartData = state.gym.sessions
    .filter((s) =>
      s.exercises.some((e) => e.name.trim().toLowerCase() === activeExercise.trim().toLowerCase())
    )
    .map((s) => {
      const exList = s.exercises.filter(
        (e) => e.name.trim().toLowerCase() === activeExercise.trim().toLowerCase()
      );
      const maxKg = Math.max(...exList.map((e) => Number(e.weight) || 0));
      return {
        dateLabel: fmtDate(s.date),
        rawDate: s.date,
        kg: maxKg,
      };
    })
    .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  const liftVals = liftingChartData.map((d) => d.kg);
  const liftMin = liftVals.length > 0 ? Math.max(0, Math.floor(Math.min(...liftVals) - 5)) : 0;
  const liftMax = liftVals.length > 0 ? Math.ceil(Math.max(...liftVals) + 5) : 100;

  const CustomChartTooltip = ({ active, payload, unit }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      return (
        <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-xl shadow-xl text-xs space-y-1 z-50">
          <p className="font-semibold text-[var(--text-soft)]">{item.payload.dateLabel || item.payload.rawDate}</p>
          <p className="font-mono text-[var(--blue)] font-extrabold text-sm">
            {item.value} {unit || 'kg'}
          </p>
        </div>
      );
    }
    return null;
  };

  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    const kg = Number(weightKg);
    if (!kg) return;
    onUpdateState((draft) => {
      const date = weightDate || todayISO();
      draft.gym.weight = draft.gym.weight.filter((w) => w.date !== date);
      draft.gym.weight.push({ date, kg });
    });
    setWeightKg('');
  };

  const handleAddMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    const waist = Number(waistCm);
    if (!waist) return;
    onUpdateState((draft) => {
      const date = waistDate || todayISO();
      draft.gym.measurements = draft.gym.measurements.filter((measurement) => measurement.date !== date);
      draft.gym.measurements.push({ date, waist });
    });
    setWaistCm('');
  };

  const handleAddSession = (overrideWeek?: string) => {
    onUpdateState((draft) => {
      draft.gym.sessions.push({
        id: uid(),
        date: sessionDate || todayISO(),
        weekLabel: overrideWeek || sessionWeekLabel.trim() || undefined,
        exercises: [],
      });
    });
    setSessionWeekLabel('');
  };

  const handleEditSessionWeek = (sessionId: string, weekLabel: string) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.weekLabel = weekLabel.trim() || undefined;
      }
    });
  };

  const handleEditSessionDate = (sessionId: string, date: string) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.date = date;
      }
    });
  };

  const handleAddTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    onUpdateState((draft) => {
      draft.gym.routineTemplates.push({
        id: uid(),
        name: templateName.trim(),
        exercises: [],
      });
    });
    setTemplateName('');
  };

  const handleDeleteTemplate = (id: string) => {
    onUpdateState((draft) => {
      draft.gym.routineTemplates = draft.gym.routineTemplates.filter((t) => t.id !== id);
    });
  };

  const handleAddTemplateExercise = (templateId: string, exName: string, weight: number, reps: string) => {
    if (!exName.trim()) return;
    onUpdateState((draft) => {
      const t = draft.gym.routineTemplates.find((x) => x.id === templateId);
      if (t) {
        t.exercises.push({ name: exName.trim(), weight, reps: reps.trim() });
      }
    });
  };

  const handleDeleteTemplateExercise = (templateId: string, idx: number) => {
    onUpdateState((draft) => {
      const t = draft.gym.routineTemplates.find((x) => x.id === templateId);
      if (t) {
        t.exercises.splice(idx, 1);
      }
    });
  };

  const handleApplyTemplate = () => {
    if (!sessionTemplate) {
      alert('Elegí una plantilla primero.');
      return;
    }
    const t = state.gym.routineTemplates.find((x) => x.id === sessionTemplate);
    if (!t) return;
    onUpdateState((draft) => {
      draft.gym.sessions.push({
        id: uid(),
        date: sessionDate || todayISO(),
        weekLabel: sessionWeekLabel.trim() || undefined,
        exercises: t.exercises.map((ex) => ({ ...ex })),
      });
    });
    setSessionWeekLabel('');
  };

  const handleDeleteSession = (id: string) => {
    onUpdateState((draft) => {
      draft.gym.sessions = draft.gym.sessions.filter((s) => s.id !== id);
    });
  };

  const handleAddExerciseToSession = (sessionId: string, exName: string, weight: number, reps: string) => {
    if (!exName.trim()) return;
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.exercises.push({ name: exName.trim(), weight, reps: reps.trim() });
      }
    });
  };

  const handleEditExercise = (sessionId: string, idx: number, weight: number, reps: string) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s && s.exercises[idx]) {
        s.exercises[idx].weight = weight;
        s.exercises[idx].reps = reps;
      }
    });
  };

  const handleDeleteExercise = (sessionId: string, idx: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.exercises.splice(idx, 1);
      }
    });
  };

  const gymHistory = React.useMemo(() => buildGymHistory(state.gym.sessions), [state.gym.sessions]);

  const renderWeekGroup = (group: GymWeekGroup) => (
    <div key={group.key} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-extrabold text-blue-600 dark:text-blue-400">🗓️ {group.weekName}</span>
          <span className="text-xs font-mono text-[var(--text-soft)]">{group.rangeLabel}</span>
          <span className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-xs font-bold text-[var(--text-faint)]">{group.sessions.length} sesión{group.sessions.length === 1 ? '' : 'es'}</span>
        </div>
        <button type="button" onClick={() => handleAddSession(group.weekName)} className="text-left text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">＋ Agregar sesión</button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {group.sessions.map((session) => <SessionCard key={session.id} session={session} onDeleteSession={() => handleDeleteSession(session.id)} onEditSessionWeek={(week) => handleEditSessionWeek(session.id, week)} onEditSessionDate={(date) => handleEditSessionDate(session.id, date)} onAddExercise={(name, weight, reps) => handleAddExerciseToSession(session.id, name, weight, reps)} onEditExercise={(index, weight, reps) => handleEditExercise(session.id, index, weight, reps)} onDeleteExercise={(index) => handleDeleteExercise(session.id, index)} />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Gimnasio</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Composición corporal, entrenamientos, temporizador de descanso y récords personales.
        </p>
      </div>

      {/* Rest Timer for Workout Sets */}
      <RestTimer />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⚖️ Peso actual</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {peso != null ? `${peso} kg` : '—'}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
            {variacion == null
              ? 'sin registros'
              : `${variacion > 0 ? '+' : ''}${variacion.toFixed(1)} kg desde el inicio`}
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📐 Grasa estimada · RFM</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {composition ? `${composition.rfmPercent.toFixed(1)}%` : '—'}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">{composition ? `FFMI ${composition.ffmi.toFixed(1)}` : 'completá peso + cintura'}</p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🔥 Racha entrenando</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {streak} día{streak === 1 ? '' : 's'}
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📅 Días entrenados este año</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{diasEntrenadosAnio}</div>
        </div>
      </div>

      <BodyCompositionCard state={state} onUpdateState={onUpdateState} />

      {/* Bodyweight Progression Chart with Recharts */}
      <div id="qa-focus-peso" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              ⚖️ Evolución de Peso Corporal
            </h2>
            <p className="text-xs text-[var(--text-soft)]">
              Monitoreo histórico de masa corporal en kilogramos.
            </p>
          </div>
          {peso != null && (
            <span className="text-xs font-mono font-extrabold text-[var(--blue)] px-3 py-1 bg-blue-500/10 rounded-xl border border-blue-500/20 w-fit">
              Actual: {peso} kg
            </span>
          )}
        </div>

        <form onSubmit={handleAddWeight} className="flex flex-wrap items-end gap-2 p-3 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Peso (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="70.5"
              className="w-24 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ＋ Registrar peso
          </button>
        </form>

        {bodyWeightChartData.length < 2 ? (
          <p className="text-center py-8 text-xs text-[var(--text-faint)]">
            Cargá al menos 2 registros para ver el gráfico de tendencia de peso.
          </p>
        ) : (
          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bodyWeightChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[bwMin, bwMax]}
                  tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}k`}
                />
                <Tooltip content={<CustomChartTooltip unit="kg" />} />
                <Area
                  type="monotone"
                  dataKey="kg"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorBw)"
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 1.5, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#059669' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Lifting Weight Progression Chart (Progresión de Cargas por Ejercicio) */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              🏋️ Progresión de Cargas por Ejercicio
            </h2>
            <p className="text-xs text-[var(--text-soft)]">
              Seguimiento del peso máximo levantado (kg) en cada sesión.
            </p>
          </div>

          {allExerciseNames.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[var(--text-soft)]">Ejercicio:</label>
              <select
                value={activeExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden cursor-pointer"
              >
                {allExerciseNames.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {allExerciseNames.length === 0 ? (
          <div className="p-8 text-center bg-[var(--bg)] border border-[var(--border)] rounded-2xl space-y-2">
            <p className="text-xs text-[var(--text-soft)] font-medium">
              Todavía no registraste ejercicios en tus sesiones de entrenamiento.
            </p>
            <p className="text-[11px] text-[var(--text-faint)]">
              Agregá una sesión abajo y registrá pesos levantados (ej: Press de banca, Sentadilla, Peso muerto) para visualizar tu progresión de fuerza en Recharts.
            </p>
          </div>
        ) : liftingChartData.length === 0 ? (
          <p className="text-center py-8 text-xs text-[var(--text-faint)]">
            Sin registros de carga para "{activeExercise}".
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-500/20 font-bold">
                Max: {Math.max(...liftVals)} kg
              </span>
              <span className="px-2.5 py-1 bg-[var(--bg)] text-[var(--text-soft)] rounded-lg border border-[var(--border)]">
                Promedio: {(liftVals.reduce((a, b) => a + b, 0) / liftVals.length).toFixed(1)} kg
              </span>
              <span className="px-2.5 py-1 bg-[var(--bg)] text-[var(--text-soft)] rounded-lg border border-[var(--border)]">
                Sesiones: {liftingChartData.length}
              </span>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={liftingChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[liftMin, liftMax]}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}k`}
                  />
                  <Tooltip content={<CustomChartTooltip unit="kg" />} />
                  <Line
                    type="monotone"
                    dataKey="kg"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 7, fill: '#2563eb' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Grid for Measurements & PRs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Waist Measurements */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)]">Medidas corporales</h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddMeasurement} className="flex gap-2">
              <input
                type="date"
                value={waistDate}
                onChange={(e) => setWaistDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="number"
                step="0.1"
                value={waistCm}
                onChange={(e) => setWaistCm(e.target.value)}
                placeholder="Cintura (cm)"
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.gym.measurements.length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin medidas cargadas.</p>
              ) : (
                [...state.gym.measurements]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 8)
                  .map((m, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs font-mono">
                      <span className="text-[var(--text-soft)]">{fmtDate(m.date)}</span>
                      <span className="font-bold text-[var(--text)]">{m.waist} cm</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* PRs */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)]">Récords personales (PR)</h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 divide-y divide-[var(--border)]">
            {Object.keys(prs).length === 0 ? (
              <p className="text-center py-6 text-xs text-[var(--text-faint)]">Registrá sesiones para ver tus PRs.</p>
            ) : (
              Object.entries(prs).map(([name, pr]) => (
                <div key={name} className="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-medium text-[var(--text)]">{name}</span>
                  <span className="font-mono font-bold text-[var(--blue)]">
                    {pr.weight} kg × {pr.reps}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Routine Templates */}
      <details className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div><h2 className="text-base font-bold text-[var(--text)]">Plantillas de rutina</h2><p className="text-xs text-[var(--text-soft)]">{state.gym.routineTemplates.length} plantilla(s) guardada(s) · abrí solo cuando quieras administrarlas.</p></div>
          <span className="text-xs font-bold text-[var(--blue)]"><span className="group-open:hidden">Abrir ▾</span><span className="hidden group-open:inline">Cerrar ▴</span></span>
        </summary>

        <div className="space-y-3 border-t border-[var(--border)] p-4">

        <form onSubmit={handleAddTemplate} className="flex gap-2">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Ej: Lunes / Jueves"
            className="w-48 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ＋ Crear plantilla
          </button>
        </form>

        <div className="space-y-3">
          {state.gym.routineTemplates.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center text-xs text-[var(--text-faint)]">
              Sin plantillas todavía. Creá una y cargale los ejercicios que repetís siempre.
            </div>
          ) : (
            state.gym.routineTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onDeleteTemplate={() => handleDeleteTemplate(t.id)}
                onAddExercise={(name, w, r) => handleAddTemplateExercise(t.id, name, w, r)}
                onDeleteExercise={(idx) => handleDeleteTemplateExercise(t.id, idx)}
              />
            ))
          )}
        </div>
        </div>
      </details>

      {/* Session Log Grouped by Weeks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Sesiones de entrenamiento</h2>
            <p className="text-xs text-[var(--text-soft)]">
              Las últimas cuatro semanas quedan a mano; las anteriores se archivan por mes.
            </p>
          </div>
        </div>

        {/* Controls to create new session */}
        <div className="flex flex-wrap items-end gap-2 p-4 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-2xl">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
              Fecha de sesión
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
              Semana (Opcional)
            </label>
            <input
              type="text"
              value={sessionWeekLabel}
              onChange={(e) => setSessionWeekLabel(e.target.value)}
              placeholder="Ej: Semana 1"
              className="w-28 px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
            />
          </div>

          <button
            onClick={() => handleAddSession()}
            className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl hover:opacity-90 cursor-pointer shadow-2xs"
          >
            ＋ Nueva sesión en blanco
          </button>

          {state.gym.routineTemplates.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={sessionTemplate}
                onChange={(e) => setSessionTemplate(e.target.value)}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
              >
                <option value="">Aplicar plantilla...</option>
                {state.gym.routineTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleApplyTemplate}
                className="px-3.5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer shadow-2xs"
              >
                ⚡ Aplicar
              </button>
            </div>
          )}
        </div>

        {/* Sessions by Week Groups */}
        <div className="space-y-4">
          {gymHistory.recentWeeks.length === 0 && gymHistory.archivedMonths.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 text-center text-xs text-[var(--text-faint)]">
              Sin sesiones cargadas todavía.
            </div>
          ) : (
            <>
              {gymHistory.recentWeeks.map(renderWeekGroup)}
              {gymHistory.archivedMonths.length > 0 && <div className="space-y-3 pt-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-faint)]">Meses anteriores</h3>
                {gymHistory.archivedMonths.map((month) => (
                  <details key={month.key} className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <div><strong className="text-sm text-[var(--text)]">{month.label}</strong><p className="text-xs text-[var(--text-soft)]">{month.sessionsCount} entrenamiento(s) · {month.weeks.length} semana(s)</p></div>
                      <span className="text-xs font-bold text-[var(--blue)]"><span className="group-open:hidden">Abrir ▾</span><span className="hidden group-open:inline">Cerrar ▴</span></span>
                    </summary>
                    <div className="space-y-3 border-t border-[var(--border)] p-3">{month.weeks.map(renderWeekGroup)}</div>
                  </details>
                ))}
              </div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface TemplateCardProps {
  template: LifeOSState['gym']['routineTemplates'][0];
  onDeleteTemplate: () => void;
  onAddExercise: (name: string, weight: number, reps: string) => void;
  onDeleteExercise: (idx: number) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onDeleteTemplate,
  onAddExercise,
  onDeleteExercise,
}) => {
  const [exName, setExName] = useState('');
  const [exWeight, setExWeight] = useState('');
  const [exReps, setExReps] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAddExercise(exName, Number(exWeight) || 0, exReps);
    setExName('');
    setExWeight('');
    setExReps('');
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-[var(--text)]">{template.name}</h3>
        <button
          onClick={onDeleteTemplate}
          className="text-xs text-[var(--text-faint)] hover:text-red-500 cursor-pointer"
        >
          ✕ eliminar plantilla
        </button>
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
        <div className="flex-1 min-w-[130px]">
          <input
            type="text"
            value={exName}
            onChange={(e) => setExName(e.target.value)}
            placeholder="Ej: Press banca"
            className="w-full px-2.5 py-1 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
          />
        </div>
        <input
          type="number"
          value={exWeight}
          onChange={(e) => setExWeight(e.target.value)}
          placeholder="kg"
          className="w-20 px-2 py-1 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
        />
        <input
          type="text"
          value={exReps}
          onChange={(e) => setExReps(e.target.value)}
          placeholder="reps (4x8)"
          className="w-20 px-2 py-1 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
        />
        <button
          type="submit"
          className="px-2.5 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-bold rounded-md cursor-pointer"
        >
          ＋
        </button>
      </form>

      <div className="divide-y divide-[var(--border)]">
        {template.exercises.map((ex, idx) => (
          <div key={idx} className="py-2 flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--text)]">{ex.name}</span>
            <div className="flex items-center gap-3 font-mono">
              <span>{ex.weight} kg</span>
              <span>{ex.reps}</span>
              <button
                onClick={() => onDeleteExercise(idx)}
                className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface SessionCardProps {
  session: LifeOSState['gym']['sessions'][0];
  onDeleteSession: () => void;
  onEditSessionWeek?: (weekLabel: string) => void;
  onEditSessionDate?: (date: string) => void;
  onAddExercise: (name: string, weight: number, reps: string) => void;
  onEditExercise: (idx: number, weight: number, reps: string) => void;
  onDeleteExercise: (idx: number) => void;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onDeleteSession,
  onEditSessionWeek,
  onEditSessionDate,
  onAddExercise,
  onEditExercise,
  onDeleteExercise,
}) => {
  const [exName, setExName] = useState('');
  const [exWeight, setExWeight] = useState('');
  const [exReps, setExReps] = useState('');
  const [isEditingHeader, setIsEditingHeader] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAddExercise(exName, Number(exWeight) || 0, exReps);
    setExName('');
    setExWeight('');
    setExReps('');
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
        <div className="flex items-center gap-2">
          {isEditingHeader ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={session.date}
                onChange={(e) => onEditSessionDate?.(e.target.value)}
                className="px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <input
                type="text"
                value={session.weekLabel || ''}
                onChange={(e) => onEditSessionWeek?.(e.target.value)}
                placeholder="Semana (ej: Semana 1)"
                className="w-28 px-2 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <button
                onClick={() => setIsEditingHeader(false)}
                className="text-xs font-bold px-2 py-1 rounded-lg bg-[var(--blue)] text-white cursor-pointer"
              >
                OK
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-bold font-mono text-sm text-[var(--text)]">
                {fmtDate(session.date)}
              </span>
              {session.weekLabel && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {session.weekLabel}
                </span>
              )}
              <button
                onClick={() => setIsEditingHeader(true)}
                className="text-[var(--text-faint)] hover:text-[var(--blue)] text-xs px-1 cursor-pointer"
                title="Editar fecha o semana de esta sesión"
              >
                ✏️
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onDeleteSession}
          className="text-xs text-[var(--text-faint)] hover:text-red-500 cursor-pointer"
        >
          ✕ eliminar sesión
        </button>
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
        <div className="flex-1 min-w-[130px]">
          <input
            type="text"
            value={exName}
            onChange={(e) => setExName(e.target.value)}
            placeholder="Ej: Press banca"
            className="w-full px-2.5 py-1 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
          />
        </div>
        <input
          type="number"
          value={exWeight}
          onChange={(e) => setExWeight(e.target.value)}
          placeholder="kg"
          className="w-20 px-2 py-1 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
        />
        <input
          type="text"
          value={exReps}
          onChange={(e) => setExReps(e.target.value)}
          placeholder="reps (4x8)"
          className="w-20 px-2 py-1 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
        />
        <button
          type="submit"
          className="px-2.5 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-bold rounded-md cursor-pointer"
        >
          ＋
        </button>
      </form>

      <div className="divide-y divide-[var(--border)]">
        {session.exercises.length === 0 ? (
          <p className="py-2 text-[11px] text-[var(--text-faint)] text-center">Sin ejercicios. Agregá uno arriba.</p>
        ) : (
          session.exercises.map((ex, idx) => (
            <div key={idx} className="py-2 flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text)]">{ex.name}</span>
              <div className="flex items-center gap-2 font-mono">
                <input
                  type="number"
                  value={ex.weight}
                  onChange={(e) => onEditExercise(idx, Number(e.target.value) || 0, ex.reps)}
                  className="w-16 px-1.5 py-0.5 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
                />
                <span className="text-[var(--text-faint)]">kg</span>
                <input
                  type="text"
                  value={ex.reps}
                  onChange={(e) => onEditExercise(idx, ex.weight, e.target.value)}
                  className="w-16 px-1.5 py-0.5 text-xs font-mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
                />
                <button
                  onClick={() => onDeleteExercise(idx)}
                  className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
