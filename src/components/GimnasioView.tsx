import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayKey, Exercise, GymSession, LifeOSState, MuscleGroup, RoutineTemplate } from '../types';
import { BodyCompositionCard } from './BodyCompositionCard';
import { PersonalRecordsCard, estimate1RM } from './PersonalRecordsCard';
import { GymRestTimerBar } from './GymRestTimerBar';
import { buildGymHistory } from '../lib/gymHistory';
import { inferMuscleGroup } from '../lib/gymMigration';
import { calcGymStreak, calcPRs, currentWeight, sortedWeight, weightVariation } from '../lib/calculations';
import { DAYS, DAY_LABELS, dayKeyFromDate, fmtDate, todayISO, uid } from '../lib/storage';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';

interface GimnasioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

const MUSCLE_GROUPS: MuscleGroup[] = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'];

function cloneTemplateExercises(template: RoutineTemplate, sessionId: string): Exercise[] {
  return template.exercises.map((exercise, exerciseIndex) => ({
    ...exercise,
    id: `${sessionId}-ex-${exerciseIndex}-${uid()}`,
    sets: exercise.sets.map((set, setIndex) => ({ ...set, id: `${sessionId}-ex-${exerciseIndex}-set-${setIndex}-${uid()}`, completedAt: null })),
  }));
}

function todayDay(): DayKey {
  return dayKeyFromDate(new Date());
}

export const GimnasioView: React.FC<GimnasioViewProps> = ({ state, onUpdateState }) => {
  const activeSession = state.gym.sessions.find((session) => session.status === 'active') || null;
  const suggestedTemplate = state.gym.routineTemplates.find((template) => template.days?.includes(todayDay())) || null;
  const completedSessions = state.gym.sessions.filter((session) => session.status === 'completed');
  const lastCompletedSession = [...completedSessions].sort((a, b) => b.date.localeCompare(a.date) || String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')))[0];
  const lastSessionSets = lastCompletedSession?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) || 0;
  const history = useMemo(() => buildGymHistory(completedSessions), [completedSessions]);
  const weightPoints = sortedWeight(state);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [sessionTemplateId, setSessionTemplateId] = useState<string | null>(null);
  const allExerciseNames = useMemo(() => Array.from(new Set(completedSessions.flatMap((session) => session.exercises.map((exercise) => exercise.name)))).sort(), [completedSessions]);
  const chartExercise = selectedExercise || allExerciseNames[0] || '';
  const liftingData = completedSessions.flatMap((session) => {
    const matches = session.exercises.filter((exercise) => exercise.name.toLowerCase() === chartExercise.toLowerCase());
    if (!matches.length) return [];
    const best = matches.flatMap((exercise) => exercise.sets).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    return best ? [{ date: session.date, label: fmtDate(session.date), weight: best.weight, reps: best.reps }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));

  const effectiveTemplateId = sessionTemplateId ?? suggestedTemplate?.id ?? state.gym.routineTemplates[0]?.id ?? '';
  const selectedSessionTemplate = state.gym.routineTemplates.find((template) => template.id === effectiveTemplateId);
  const isHistoricalDate = Boolean(sessionDate && sessionDate < todayISO());

  const startSession = (template?: RoutineTemplate, date = todayISO()) => {
    if (activeSession) { showToast('Ya existe un entrenamiento en curso.', 'info'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) { showToast('Elegí una fecha válida, de hoy o anterior.', 'error'); return; }
    onUpdateState((draft) => {
      const id = uid();
      draft.gym.sessions.push({ id, date, status: 'active', startedAt: new Date().toISOString(), finishedAt: null, exercises: template ? cloneTemplateExercises(template, id) : [] });
    });
  };
  const deleteSession = (id: string) => onUpdateState((draft) => {
    draft.gym.sessions = draft.gym.sessions.filter((session) => session.id !== id);
    if (draft.gym.activeTimer?.sessionId === id) draft.gym.activeTimer = null;
  });
  const editSession = (id: string) => {
    if (activeSession) { showToast('Terminá o descartá la sesión en curso antes de editar otra.', 'info'); return; }
    onUpdateState((draft) => {
      const session = draft.gym.sessions.find((item) => item.id === id);
      if (session) { session.status = 'active'; session.finishedAt = null; }
    });
  };
  const current = currentWeight(state);
  const variation = weightVariation(state);

  if (activeSession) {
    return (
      <div id="qa-focus-gimnasio" className="mx-auto w-full max-w-5xl">
        <ActiveWorkout session={activeSession} state={state} onUpdateState={onUpdateState} />
      </div>
    );
  }

  return (
    <div id="qa-focus-gimnasio" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Entrenamiento</p>
          <h1 className="page-heading mt-1">Gimnasio</h1>
          <p className="page-subtitle">Iniciá rápido, registrá cada serie y consultá tus récords cuando los necesites.</p>
        </div>
      </header>

      {/* Start Session Section */}
      <section className="surface overflow-hidden p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--blue-soft)] text-[var(--blue)]">
            <AppIcon name="dumbbell" className="h-6 w-6" />
          </span>
          <div>
            <span className="eyebrow text-[var(--blue)]">Nueva sesión · {DAY_LABELS[todayDay()]}</span>
            <h2 className="mt-1 text-lg font-bold text-[var(--text)]">¿Qué entrenaste?</h2>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--text-soft)]">La fecha y la rutina son independientes. Podés entrenar ahora o cargar una sesión anterior.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <label>
            <span className="eyebrow mb-1.5 block">Fecha</span>
            <input type="date" max={todayISO()} value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm" />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Rutina</span>
            <select value={effectiveTemplateId} onChange={(event) => setSessionTemplateId(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm">
              <option value="">Sesión en blanco</option>
              {state.gym.routineTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}{suggestedTemplate?.id === template.id ? ' · sugerida hoy' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => startSession(selectedSessionTemplate, sessionDate)} className="primary-button min-h-11">
            {isHistoricalDate ? `Cargar ${fmtDate(sessionDate)}` : selectedSessionTemplate ? `Iniciar ${selectedSessionTemplate.name}` : 'Iniciar en blanco'}
          </button>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Peso actual" value={current == null ? '—' : `${current} kg`} detail={variation == null ? 'sin tendencia' : `${variation > 0 ? '+' : ''}${variation.toFixed(1)} kg`} sensitive />
        <Metric label="Racha" value={`${calcGymStreak(state)} días`} detail="días hábiles consecutivos" />
        <Metric label="Sesiones" value={String(completedSessions.length)} detail="entrenamientos registrados" />
        <Metric label="Series última sesión" value={lastCompletedSession ? String(lastSessionSets) : '—'} detail={lastCompletedSession ? `${lastCompletedSession.exercises.length} ejercicios registrados` : 'todavía sin sesiones'} />
      </section>

      {/* Personal Records Cards (PRs) */}
      <PersonalRecordsCard state={state} />

      <BodyCompositionCard state={state} onUpdateState={onUpdateState} />

      {/* Trends and Charts */}
      <details className="surface group p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <div>
            <p className="eyebrow">Tendencias</p>
            <h2 className="section-title mt-1">Gráficos de progresión</h2>
            <p className="mt-1 text-sm text-[var(--text-soft)]">Evolución de peso corporal y fuerza por ejercicio.</p>
          </div>
          <span className="text-xs font-semibold text-[var(--blue)]">Abrir</span>
        </summary>
        <div className="mt-5 space-y-5 border-t border-[var(--border)] pt-5">
          <section className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Evolución de peso" empty={weightPoints.length < 2}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightPoints.map((point) => ({ ...point, label: fmtDate(point.date) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="kg" stroke="#10b981" fill="#10b98133" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Progresión de fuerza"
              empty={!liftingData.length}
              action={
                allExerciseNames.length ? (
                  <select value={chartExercise} onChange={(event) => setSelectedExercise(event.target.value)} className="max-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs">
                    {allExerciseNames.map((name) => <option key={name}>{name}</option>)}
                  </select>
                ) : null
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={liftingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>
        </div>
      </details>

      <TemplateManager templates={state.gym.routineTemplates} onUpdateState={onUpdateState} onStart={(template) => startSession(template, todayISO())} />

      {/* History */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text)]">Historial</h2>
          <p className="text-xs text-[var(--text-soft)]">Cuatro semanas recientes a mano; el resto, archivado por mes.</p>
        </div>
        {history.recentWeeks.length === 0 && history.archivedMonths.length === 0 ? (
          <Empty text="Todavía no hay entrenamientos completados." />
        ) : (
          <>
            {history.recentWeeks.map((week) => (
              <HistoryWeek key={week.key} title={week.weekName} subtitle={week.rangeLabel} sessions={week.sessions} onDelete={deleteSession} onEdit={editSession} />
            ))}
            {history.archivedMonths.map((month) => (
              <details key={month.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <summary className="cursor-pointer list-none p-4 font-extrabold text-[var(--text)]">
                  {month.label} · {month.sessionsCount} sesiones
                </summary>
                <div className="space-y-3 border-t border-[var(--border)] p-3">
                  {month.weeks.map((week) => (
                    <HistoryWeek key={week.key} title={week.weekName} subtitle={week.rangeLabel} sessions={week.sessions} onDelete={deleteSession} onEdit={editSession} />
                  ))}
                </div>
              </details>
            ))}
          </>
        )}
      </section>
    </div>
  );
};

const Metric = ({ label, value, detail, sensitive = false }: { label: string; value: string; detail: string; sensitive?: boolean }) => (
  <div className={`surface p-4 ${sensitive ? 'privacy-sensitive' : ''}`}>
    <span className="eyebrow">{label}</span>
    <strong className="number-value mt-2 block text-xl font-bold text-[var(--text)]">{value}</strong>
    <p className="mt-1 text-xs text-[var(--text-soft)]">{detail}</p>
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center text-xs text-[var(--text-soft)]">{text}</div>
);

const ChartCard = ({ title, empty, action, children }: { title: string; empty: boolean; action?: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-extrabold text-[var(--text)]">{title}</h2>
      {action}
    </div>
    <div className="h-56">
      {empty ? <div className="flex h-full items-center justify-center text-xs text-[var(--text-soft)]">Faltan registros para mostrar una tendencia.</div> : children}
    </div>
  </div>
);

interface ActiveWorkoutProps extends GimnasioViewProps {
  session: GymSession;
}

const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({ session, state, onUpdateState }) => {
  const [newExercise, setNewExercise] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(() => {
    const firstIncomplete = session.exercises.findIndex((exercise) => exercise.sets.some((set) => !set.completedAt));
    return firstIncomplete >= 0 ? firstIncomplete : 0;
  });
  const isHistoricalSession = session.date < todayISO();
  const prs = useMemo(() => calcPRs(state), [state]);
  const totalSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const completedSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completedAt).length, 0);
  const progress = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;

  const mutateExercise = (exerciseId: string, fn: (exercise: Exercise) => void) =>
    onUpdateState((draft) => {
      const active = draft.gym.sessions.find((item) => item.id === session.id);
      const exercise = active?.exercises.find((item) => item.id === exerciseId);
      if (exercise) fn(exercise);
    });

  const toggleSet = (exercise: Exercise, setId: string) =>
    onUpdateState((draft) => {
      const active = draft.gym.sessions.find((item) => item.id === session.id);
      const targetExercise = active?.exercises.find((item) => item.id === exercise.id);
      const set = targetExercise?.sets.find((item) => item.id === setId);
      if (!set || !targetExercise) return;

      set.completedAt = set.completedAt ? null : new Date().toISOString();
      if (!set.completedAt && draft.gym.activeTimer?.setId === setId) {
        draft.gym.activeTimer = null;
      }
      if (set.completedAt && !isHistoricalSession && targetExercise.timerEnabled) {
        const durationSeconds = targetExercise.restSeconds || 90;
        draft.gym.activeTimer = {
          endsAt: Date.now() + durationSeconds * 1000,
          durationSeconds,
          sessionId: session.id,
          exerciseId: exercise.id,
          setId,
        };
      }
    });

  const duplicateSet = (exerciseId: string, setId: string) => {
    mutateExercise(exerciseId, (exercise) => {
      const source = exercise.sets.find((s) => s.id === setId) || exercise.sets.at(-1);
      if (!source) return;
      exercise.sets.push({
        id: uid(),
        weight: source.weight,
        reps: source.reps,
        completedAt: null,
      });
    });
  };

  const removeSet = (exerciseId: string, setId: string) => {
    mutateExercise(exerciseId, (exercise) => {
      if (exercise.sets.length <= 1) return;
      exercise.sets = exercise.sets.filter((s) => s.id !== setId);
    });
  };

  const finish = () =>
    onUpdateState((draft) => {
      const active = draft.gym.sessions.find((item) => item.id === session.id);
      if (!active) return;
      active.status = 'completed';
      active.finishedAt = new Date().toISOString();
      draft.gym.activeTimer = null;
    });

  const discard = () => {
    if (!confirm('¿Descartar esta sesión? Se eliminarán los cambios de este entrenamiento.')) return;
    onUpdateState((draft) => {
      draft.gym.sessions = draft.gym.sessions.filter((item) => item.id !== session.id);
      if (draft.gym.activeTimer?.sessionId === session.id) draft.gym.activeTimer = null;
    });
  };

  const addExercise = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newExercise.trim()) return;
    onUpdateState((draft) => {
      const active = draft.gym.sessions.find((item) => item.id === session.id);
      if (!active) return;
      active.exercises.push({
        id: uid(),
        name: newExercise.trim(),
        muscleGroup: inferMuscleGroup(newExercise),
        restSeconds: 90,
        timerEnabled: true,
        legacyReps: null,
        sets: [{ id: uid(), weight: 0, reps: 10, completedAt: null }],
      });
    });
    setNewExercise('');
  };

  useEffect(() => {
    if (session.exercises.length === 0) setFocusIndex(0);
    else if (focusIndex >= session.exercises.length) setFocusIndex(session.exercises.length - 1);
  }, [focusIndex, session.exercises.length]);

  const visibleExercises = focusMode
    ? session.exercises.slice(focusIndex, focusIndex + 1)
    : session.exercises;

  return (
    <section className="surface overflow-hidden space-y-4">
      {/* Session Header */}
      <div className="border-b border-[var(--border)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="eyebrow text-[var(--blue)]">
              {isHistoricalSession ? 'Carga de sesión anterior' : 'Entrenamiento en curso'}
            </span>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--text)]">
              {fmtDate(session.date)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              {completedSets} de {totalSets} series hechas · {progress}%
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFocusMode((v) => !v)} className="secondary-button">
              {focusMode ? 'Ver rutina completa' : 'Modo enfoque'}
            </button>
            <button onClick={finish} className="primary-button">
              {isHistoricalSession ? 'Guardar sesión' : 'Finalizar sesión'}
            </button>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full rounded-full bg-[var(--blue)] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Dedicated Rest Timer Bar */}
      {!isHistoricalSession && (
        <div className="px-4 sm:px-5">
          <GymRestTimerBar state={state} sessionId={session.id} onUpdateState={onUpdateState} />
        </div>
      )}

      {/* Focus Mode Carousel Switcher */}
      {focusMode && session.exercises.length > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setFocusIndex((index) => Math.max(0, index - 1))}
            disabled={focusIndex === 0}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-soft)] disabled:opacity-25 hover:bg-[var(--bg)]"
            aria-label="Ejercicio anterior"
          >
            <AppIcon name="chevronLeft" className="h-5 w-5" />
          </button>
          <span className="text-xs font-semibold text-[var(--text)]">
            Ejercicio {focusIndex + 1} de {session.exercises.length}
          </span>
          <button
            type="button"
            onClick={() => setFocusIndex((index) => Math.min(session.exercises.length - 1, index + 1))}
            disabled={focusIndex >= session.exercises.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-soft)] disabled:opacity-25 hover:bg-[var(--bg)]"
            aria-label="Ejercicio siguiente"
          >
            <AppIcon name="chevronRight" className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Exercises List */}
      <div className="space-y-4 p-3 sm:p-5">
        {visibleExercises.map((exercise) => {
          const previous = [...state.gym.sessions]
            .filter((item) => item.status === 'completed' && item.id !== session.id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .flatMap((item) => item.exercises)
            .find((item) => item.name.toLowerCase() === exercise.name.toLowerCase());

          const previousBest = previous
            ? [...previous.sets].sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0]
            : undefined;

          const pr = prs[exercise.name];
          const est1RM = pr ? estimate1RM(pr.weight, pr.reps) : 0;
          const isPotentiallyNewPR = pr && exercise.sets.some(
            (s) => s.weight > pr.weight || (s.weight === pr.weight && s.reps > pr.reps)
          );

          return (
            <article key={exercise.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 sm:p-5 space-y-3">
              {/* Exercise Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="eyebrow">{exercise.muscleGroup || inferMuscleGroup(exercise.name)}</span>
                    {isPotentiallyNewPR && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        <AppIcon name="flame" className="h-3 w-3" /> Posible nuevo PR
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-[var(--text)]">
                    {exercise.name}
                  </h2>
                  {previousBest && (
                    <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                      Última sesión: {previousBest.weight} kg × {previousBest.reps} reps
                    </p>
                  )}
                </div>

                {/* Rest Timer Config for this Exercise */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => mutateExercise(exercise.id, (item) => { item.timerEnabled = !item.timerEnabled; })}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                      exercise.timerEnabled
                        ? 'bg-[var(--blue-soft)] text-[var(--blue)] border-[var(--blue)]/30'
                        : 'bg-[var(--card)] text-[var(--text-faint)] border-[var(--border)]'
                    }`}
                    title="Alternar temporizador de descanso automático"
                  >
                    <AppIcon name="clock" className="h-3.5 w-3.5" />
                    <span>{exercise.restSeconds || 90}s descanso</span>
                    <span className="rounded-md bg-[var(--bg)] px-1 py-0.2 text-[9px] font-bold">
                      {exercise.timerEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <details className="relative">
                    <summary className="secondary-button list-none px-2.5 py-1.5 text-xs">
                      <AppIcon name="more" className="h-4 w-4" />
                    </summary>
                    <div className="absolute right-0 top-10 z-20 flex min-w-48 flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-[var(--text-faint)]">Descanso</div>
                      <div className="grid grid-cols-4 gap-1 px-1 pb-2 border-b border-[var(--border)]">
                        {[45, 60, 90, 120].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => mutateExercise(exercise.id, (item) => { item.restSeconds = sec; item.timerEnabled = true; })}
                            className={`rounded-lg py-1 text-center text-xs font-semibold ${
                              (exercise.restSeconds || 90) === sec ? 'bg-[var(--blue)] text-white' : 'bg-[var(--surface-muted)] text-[var(--text)]'
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => mutateExercise(exercise.id, (item) => {
                          const last = item.sets.at(-1);
                          item.sets.push({ id: uid(), weight: last?.weight || 0, reps: last?.reps || 10, completedAt: null });
                        })}
                        className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold hover:bg-[var(--surface-muted)]"
                      >
                        ＋ Agregar serie
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Quitar ${exercise.name} de esta sesión?`)) {
                            onUpdateState((draft) => {
                              const active = draft.gym.sessions.find((item) => item.id === session.id);
                              if (active) active.exercises = active.exercises.filter((item) => item.id !== exercise.id);
                            });
                          }
                        }}
                        className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                      >
                        ✕ Quitar ejercicio
                      </button>
                    </div>
                  </details>
                </div>
              </div>

              {/* Personal Record Highlight Banner */}
              {pr && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                      <AppIcon name="trophy" className="h-4 w-4" /> Récord actual:
                    </span>
                    <strong className="font-mono text-sm font-extrabold text-[var(--text)]">
                      {pr.weight} kg × {pr.reps} reps
                    </strong>
                    {est1RM > 0 && (
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        1RM ~{est1RM} kg
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-faint)]">{fmtDate(pr.date)}</span>
                </div>
              )}

              {/* Sets Table with Quick-Access Steppers */}
              <div className="mt-3 space-y-2.5">
                {exercise.sets.map((set, index) => (
                  <div
                    key={set.id}
                    className={`rounded-xl border p-2.5 sm:p-3 transition-all ${
                      set.completedAt
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-[var(--border)] bg-[var(--card)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                      {/* Set Number */}
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-xs font-bold text-[var(--text)]">
                        #{index + 1}
                      </span>

                      {/* Weight with Stepper Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => mutateExercise(exercise.id, (item) => {
                            const target = item.sets.find((s) => s.id === set.id);
                            if (target) target.weight = Math.max(0, target.weight - 2.5);
                          })}
                          className="h-8 w-7 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                          title="-2.5 kg"
                        >
                          -2.5
                        </button>
                        <div className="relative w-20 sm:w-24">
                          <input
                            aria-label={`Peso serie ${index + 1}`}
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            value={set.weight}
                            onChange={(e) => mutateExercise(exercise.id, (item) => {
                              const target = item.sets.find((s) => s.id === set.id);
                              if (target) target.weight = Number(e.target.value) || 0;
                            })}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-2 pr-6 text-center font-mono text-sm font-bold text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
                          />
                          <span className="absolute right-2 top-2 text-[10px] font-semibold text-[var(--text-faint)]">
                            kg
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => mutateExercise(exercise.id, (item) => {
                            const target = item.sets.find((s) => s.id === set.id);
                            if (target) target.weight += 2.5;
                          })}
                          className="h-8 w-7 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                          title="+2.5 kg"
                        >
                          +2.5
                        </button>
                        <button
                          type="button"
                          onClick={() => mutateExercise(exercise.id, (item) => {
                            const target = item.sets.find((s) => s.id === set.id);
                            if (target) target.weight += 5;
                          })}
                          className="hidden sm:block h-8 w-6 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-soft)] hover:text-[var(--text)]"
                          title="+5 kg"
                        >
                          +5
                        </button>
                      </div>

                      {/* Reps with Stepper Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => mutateExercise(exercise.id, (item) => {
                            const target = item.sets.find((s) => s.id === set.id);
                            if (target) target.reps = Math.max(0, target.reps - 1);
                          })}
                          className="h-8 w-6 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                          title="-1 rep"
                        >
                          -1
                        </button>
                        <div className="relative w-18 sm:w-20">
                          <input
                            aria-label={`Repeticiones serie ${index + 1}`}
                            type="number"
                            inputMode="numeric"
                            value={set.reps}
                            onChange={(e) => mutateExercise(exercise.id, (item) => {
                              const target = item.sets.find((s) => s.id === set.id);
                              if (target) target.reps = Math.max(0, Number(e.target.value) || 0);
                            })}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-2 pr-6 text-center font-mono text-sm font-bold text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
                          />
                          <span className="absolute right-1.5 top-2 text-[10px] font-semibold text-[var(--text-faint)]">
                            reps
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => mutateExercise(exercise.id, (item) => {
                            const target = item.sets.find((s) => s.id === set.id);
                            if (target) target.reps += 1;
                          })}
                          className="h-8 w-6 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                          title="+1 rep"
                        >
                          +1
                        </button>
                      </div>

                      {/* Actions: Mark Set & Duplicate */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSet(exercise, set.id)}
                          className={`h-8 rounded-xl px-3 text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer ${
                            set.completedAt
                              ? 'bg-emerald-500 text-white shadow-xs'
                              : 'bg-[var(--blue)] text-white hover:opacity-90'
                          }`}
                        >
                          {set.completedAt ? (
                            <>
                              <AppIcon name="check" className="h-3.5 w-3.5" /> Hecha
                            </>
                          ) : (
                            'Completar'
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => duplicateSet(exercise.id, set.id)}
                          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-[10px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                          title="Duplicar serie"
                        >
                          + Serie
                        </button>

                        {exercise.sets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSet(exercise.id, set.id)}
                            className="h-8 w-7 rounded-lg text-xs font-bold text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Eliminar serie"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Batch Adjustment Bar */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)]/60 pt-3">
                <button
                  type="button"
                  onClick={() => mutateExercise(exercise.id, (item) => {
                    item.sets.forEach((s) => { s.weight += 2.5; });
                  })}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
                >
                  +2.5 kg a todas
                </button>
                <button
                  type="button"
                  onClick={() => mutateExercise(exercise.id, (item) => {
                    item.sets.forEach((s) => { s.reps += 1; });
                  })}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
                >
                  +1 rep a todas
                </button>
                {previous && (
                  <button
                    type="button"
                    onClick={() => mutateExercise(exercise.id, (item) => {
                      item.sets.forEach((set, i) => {
                        if (previous.sets[i]) {
                          set.weight = previous.sets[i].weight;
                          set.reps = previous.sets[i].reps;
                        }
                      });
                    })}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
                  >
                    Copiar anterior ({previous.sets[0]?.weight}kg)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => mutateExercise(exercise.id, (item) => {
                    const last = item.sets.at(-1);
                    item.sets.push({ id: uid(), weight: last?.weight || 0, reps: last?.reps || 10, completedAt: null });
                  })}
                  className="ml-auto rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] px-3 py-1 text-xs font-bold hover:bg-[var(--blue)] hover:text-white transition-colors"
                >
                  ＋ Nueva serie
                </button>
              </div>
            </article>
          );
        })}

        {session.exercises.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-soft)]">
            Esta sesión está vacía. Agregá tu primer ejercicio a continuación.
          </div>
        )}

        {/* Add Exercise Form */}
        <form onSubmit={addExercise} className="flex gap-2 rounded-xl border border-dashed border-[var(--border)] p-3.5 bg-[var(--card)]">
          <input
            value={newExercise}
            onChange={(event) => setNewExercise(event.target.value)}
            placeholder="Nombre del nuevo ejercicio (ej.: Press de banca)..."
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm outline-hidden focus:border-[var(--blue)]"
          />
          <button className="primary-button px-4">Agregar ejercicio</button>
        </form>

        <button type="button" onClick={discard} className="mx-auto block px-3 py-2 text-xs font-semibold text-rose-500 hover:underline">
          Descartar esta sesión
        </button>
      </div>
    </section>
  );
};

const TemplateManager = ({ templates, onUpdateState, onStart }: { templates: RoutineTemplate[]; onUpdateState: GimnasioViewProps['onUpdateState']; onStart: (template: RoutineTemplate) => void }) => {
  const [name, setName] = useState('');
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onUpdateState((draft) => draft.gym.routineTemplates.push({ id: uid(), name: name.trim(), days: [], exercises: [] }));
    setName('');
  };
  return (
    <details className="surface group">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4">
        <div>
          <p className="eyebrow">Planificación</p>
          <h2 className="section-title mt-1">Plantillas de rutina</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">Abrilas cuando quieras editar tus rutinas predeterminadas.</p>
        </div>
        <span className="text-xs font-semibold text-[var(--blue)]">Administrar</span>
      </summary>
      <div className="space-y-4 border-t border-[var(--border)] p-4">
        <form onSubmit={create} className="flex gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Lunes - Pecho y Tríceps" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-hidden focus:border-[var(--blue)]" />
          <button className="primary-button">Crear</button>
        </form>
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} onUpdateState={onUpdateState} onStart={() => onStart(template)} />
        ))}
        {!templates.length && <Empty text="Creá una plantilla para iniciar tus rutinas con un toque." />}
      </div>
    </details>
  );
};

const TemplateCard = ({ template, onUpdateState, onStart }: { key?: React.Key; template: RoutineTemplate; onUpdateState: GimnasioViewProps['onUpdateState']; onStart: () => void }) => {
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [editingTitle, setEditingTitle] = useState(false);
  const [templateName, setTemplateName] = useState(template.name);

  useEffect(() => { if (!editingTitle) setTemplateName(template.name); }, [editingTitle, template.name]);

  const saveTitle = () => {
    if (!templateName.trim()) return;
    onUpdateState((draft) => {
      const target = draft.gym.routineTemplates.find((item) => item.id === template.id);
      if (target) target.name = templateName.trim();
    });
    setEditingTitle(false);
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!exerciseName.trim()) return;
    onUpdateState((draft) => {
      const target = draft.gym.routineTemplates.find((item) => item.id === template.id);
      if (!target) return;
      target.exercises.push({
        id: uid(),
        name: exerciseName.trim(),
        muscleGroup: inferMuscleGroup(exerciseName),
        restSeconds: 90,
        timerEnabled: true,
        legacyReps: null,
        sets: Array.from({ length: Math.max(1, Number(sets) || 1) }, () => ({ id: uid(), weight: Number(weight) || 0, reps: Math.max(1, Number(reps) || 1), completedAt: null })),
      });
    });
    setExerciseName('');
  };

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <div className="flex max-w-md gap-1.5">
              <input autoFocus value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--blue)] bg-[var(--card)] px-2.5 py-1.5 text-sm font-bold" />
              <button type="button" onClick={saveTitle} className="rounded-lg bg-[var(--blue)] px-2.5 text-[10px] font-bold text-white">Guardar</button>
              <button type="button" onClick={() => setEditingTitle(false)} className="rounded-lg border border-[var(--border)] px-2 text-[10px]">Cancelar</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-[var(--text)]">{template.name}</h3>
              <button type="button" onClick={() => setEditingTitle(true)} className="text-[10px] font-bold text-[var(--blue)]">Editar nombre</button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => onUpdateState((draft) => {
                  const target = draft.gym.routineTemplates.find((item) => item.id === template.id);
                  if (!target) return;
                  const days = target.days || [];
                  target.days = days.includes(day) ? days.filter((item) => item !== day) : [...days, day];
                })}
                className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${
                  template.days?.includes(day) ? 'border-blue-500 bg-blue-500 text-white' : 'border-[var(--border)] text-[var(--text-faint)]'
                }`}
              >
                {DAY_LABELS[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={onStart} className="rounded-lg bg-[var(--blue)] px-3 py-2 text-xs font-bold text-white">Iniciar</button>
          <button type="button" onClick={() => onUpdateState((draft) => { draft.gym.routineTemplates = draft.gym.routineTemplates.filter((item) => item.id !== template.id); })} className="rounded-lg px-2 text-xs text-rose-500">Eliminar</button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {template.exercises.map((exercise) => (
          <TemplateExerciseRow key={exercise.id} templateId={template.id} exercise={exercise} onUpdateState={onUpdateState} />
        ))}
      </div>
      <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-[1fr_75px_65px_65px_auto]">
        <input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Nuevo ejercicio" className="col-span-2 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs sm:col-span-1" />
        <input type="number" inputMode="decimal" step="0.5" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="kg" title="Peso" className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs" />
        <input type="number" inputMode="numeric" min="1" value={sets} onChange={(event) => setSets(event.target.value)} placeholder="series" title="Series" className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs" />
        <input type="number" inputMode="numeric" min="1" value={reps} onChange={(event) => setReps(event.target.value)} placeholder="reps" title="Repeticiones" className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs" />
        <button className="rounded-lg bg-[var(--text)] px-3 py-2 text-xs font-bold text-[var(--bg)]">＋ Agregar</button>
      </form>
    </article>
  );
};

const TemplateExerciseRow = ({ templateId, exercise, onUpdateState }: { key?: React.Key; templateId: string; exercise: Exercise; onUpdateState: GimnasioViewProps['onUpdateState'] }) => {
  const [editing, setEditing] = useState(false);
  const [draftExercise, setDraftExercise] = useState<Exercise>(() => structuredClone(exercise));

  useEffect(() => { if (!editing) setDraftExercise(structuredClone(exercise)); }, [editing, exercise]);

  const beginEditing = () => { setDraftExercise(structuredClone(exercise)); setEditing(true); };
  const updateDraftSet = (setId: string, field: 'weight' | 'reps', value: number) =>
    setDraftExercise((current) => ({ ...current, sets: current.sets.map((set) => set.id === setId ? { ...set, [field]: Math.max(0, value) } : set) }));
  const save = () => {
    if (!draftExercise.name.trim() || draftExercise.sets.length === 0) return;
    onUpdateState((draft) => {
      const template = draft.gym.routineTemplates.find((item) => item.id === templateId);
      const index = template?.exercises.findIndex((item) => item.id === exercise.id) ?? -1;
      if (!template || index < 0) return;
      template.exercises[index] = {
        ...draftExercise,
        name: draftExercise.name.trim(),
        muscleGroup: draftExercise.muscleGroup || inferMuscleGroup(draftExercise.name),
        restSeconds: Math.min(600, Math.max(15, Number(draftExercise.restSeconds) || 90)),
        sets: draftExercise.sets.map((set) => ({ ...set, weight: Math.max(0, Number(set.weight) || 0), reps: Math.max(1, Number(set.reps) || 1), completedAt: null })),
      };
    });
    setEditing(false);
  };

  if (!editing) return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs">
      <span><strong>{exercise.name}</strong> · {exercise.muscleGroup || inferMuscleGroup(exercise.name)}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[var(--text-soft)]">{exercise.sets.length} series · {exercise.sets[0]?.weight || 0} kg × {exercise.sets[0]?.reps || '—'}</span>
        <button type="button" onClick={beginEditing} className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--blue)]">Editar</button>
        <button type="button" onClick={() => onUpdateState((draft) => { const template = draft.gym.routineTemplates.find((item) => item.id === templateId); if (template) template.exercises = template.exercises.filter((item) => item.id !== exercise.id); })} className="px-1 text-[10px] text-rose-500">✕</button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-blue-500/30 bg-[var(--card)] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_130px_95px_auto] sm:items-end">
        <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--text-faint)]">Ejercicio</span><input value={draftExercise.name} onChange={(event) => setDraftExercise((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-xs" /></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--text-faint)]">Grupo muscular</span><select value={draftExercise.muscleGroup || inferMuscleGroup(draftExercise.name)} onChange={(event) => setDraftExercise((current) => ({ ...current, muscleGroup: event.target.value as MuscleGroup }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs">{MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--text-faint)]">Descanso</span><input type="number" min="15" max="600" step="15" value={draftExercise.restSeconds || 90} onChange={(event) => setDraftExercise((current) => ({ ...current, restSeconds: Number(event.target.value) }))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs" /></label>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[10px] font-bold"><input type="checkbox" checked={draftExercise.timerEnabled === true} onChange={(event) => setDraftExercise((current) => ({ ...current, timerEnabled: event.target.checked }))} /> Temporizador automático</label>
      </div>
      <div className="mt-2 space-y-1.5">
        {draftExercise.sets.map((set, index) => (
          <div key={set.id} className="grid grid-cols-[30px_1fr_1fr_28px] items-center gap-1.5">
            <span className="text-center text-[10px] font-black text-[var(--text-faint)]">{index + 1}</span>
            <input aria-label={`Peso serie ${index + 1}`} type="number" inputMode="decimal" step="0.5" value={set.weight} onChange={(event) => updateDraftSet(set.id, 'weight', Number(event.target.value))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs" />
            <input aria-label={`Repeticiones serie ${index + 1}`} type="number" inputMode="numeric" min="1" value={set.reps} onChange={(event) => updateDraftSet(set.id, 'reps', Number(event.target.value))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs" />
            <button type="button" disabled={draftExercise.sets.length === 1} onClick={() => setDraftExercise((current) => ({ ...current, sets: current.sets.filter((item) => item.id !== set.id) }))} className="text-xs text-rose-500 disabled:opacity-25">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => setDraftExercise((current) => { const last = current.sets.at(-1); return { ...current, sets: [...current.sets, { id: uid(), weight: last?.weight || 0, reps: last?.reps || 10, completedAt: null }] }; })} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-bold">＋ Serie</button>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold">Cancelar</button>
          <button type="button" onClick={save} className="rounded-lg bg-[var(--blue)] px-3 py-1.5 text-[10px] font-bold text-white">Guardar cambios</button>
        </div>
      </div>
    </div>
  );
};

const HistoryWeek = ({ title, subtitle, sessions, onDelete, onEdit }: { key?: React.Key; title: string; subtitle: string; sessions: GymSession[]; onDelete: (id: string) => void; onEdit: (id: string) => void }) => (
  <div className="space-y-2">
    <div>
      <h3 className="text-sm font-extrabold text-[var(--text)]">{title}</h3>
      <p className="text-[11px] text-[var(--text-soft)]">{subtitle}</p>
    </div>
    {sessions.map((session) => {
      const setCount = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
      return (
        <details key={session.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
            <span className="font-bold text-[var(--text)]">{fmtDate(session.date)} · {session.exercises.length} ejercicios</span>
            <span className="text-xs font-bold text-[var(--blue)]">{setCount} series</span>
          </summary>
          <div className="space-y-2 border-t border-[var(--border)] p-3">
            {session.exercises.map((exercise) => (
              <div key={exercise.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{exercise.name}</span>
                <span className="font-mono text-[var(--text-soft)]">
                  {exercise.sets.map((set) => `${set.weight} kg × ${set.reps}`).join(' · ')}
                </span>
              </div>
            ))}
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => onEdit(session.id)} className="text-[11px] font-bold text-[var(--blue)]">Editar sesión</button>
              <button type="button" onClick={() => { if (confirm('¿Eliminar esta sesión del historial?')) onDelete(session.id); }} className="text-[11px] font-bold text-rose-500">Eliminar sesión</button>
            </div>
          </div>
        </details>
      );
    })}
  </div>
);
