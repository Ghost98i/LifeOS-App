import React, { useMemo, useState } from 'react';
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
import { GymSession, GymSet, LifeOSState, MuscleGroup } from '../types';
import { GymRestTimerBar } from './GymRestTimerBar';
import { GymPlateCalculator } from './GymPlateCalculator';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { BodyCompositionCard } from './BodyCompositionCard';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import {
  todayISO,
  fmtDate,
  uid,
} from '../lib/storage';
import {
  currentWeight,
  weightVariation,
  calcIMC,
  imcCategory,
  calcGymStreakDetails,
  sortedWeight,
} from '../lib/calculations';
import { buildGymHistory } from '../lib/gymHistory';
import { inferMuscleGroup, sessionVolume } from '../lib/gymMigration';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';

interface GimnasioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

const COMMON_EXERCISE_SUGGESTIONS = [
  'Press banca plano',
  'Press banca inclinado',
  'Aperturas con mancuernas',
  'Fondos en paralelas',
  'Sentadilla trasera',
  'Prensa de piernas',
  'Peso muerto rumano',
  'Extensiones de cuádriceps',
  'Curl femoral acostado',
  'Elevación de talones',
  'Dominadas pronas',
  'Jalón al pecho',
  'Remo con barra',
  'Remo unilateral con mancuerna',
  'Press militar con barra',
  'Elevaciones laterales',
  'Face pull en polea',
  'Curl de bíceps con barra',
  'Curl martillo',
  'Extensión de tríceps en polea',
  'Press francés',
  'Plancha abdominal',
];

function getPreviousExerciseStats(
  sessions: GymSession[],
  currentSessionId: string,
  exerciseName: string
): string | null {
  const norm = exerciseName.trim().toLowerCase();
  if (!norm) return null;
  const pastSessions = sessions
    .filter((s) => s.id !== currentSessionId && s.exercises.some((e) => e.name.trim().toLowerCase() === norm))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (pastSessions.length === 0) return null;
  const ex = pastSessions[0].exercises.find((e) => e.name.trim().toLowerCase() === norm);
  if (!ex) return null;
  if (ex.sets && ex.sets.length > 0) {
    const bestSet = [...ex.sets].sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    return `${bestSet.weight} kg × ${bestSet.reps}`;
  }
  if (Number(ex.weight) > 0 || ex.reps) {
    return `${ex.weight || 0} kg × ${ex.reps || ''}`;
  }
  return null;
}

export const GimnasioView: React.FC<GimnasioViewProps> = ({ state, onUpdateState }) => {
  const [activeTab, setActiveTab] = useState<'entrenar' | 'historial' | 'progresion'>('entrenar');
  const [weightDate, setWeightDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState('');

  const [sessionDate, setSessionDate] = useState(todayISO());
  const [sessionWeekLabel, setSessionWeekLabel] = useState('');
  const [sessionTemplate, setSessionTemplate] = useState('');

  const [templateName, setTemplateName] = useState('');
  const [showBodyComposition, setShowBodyComposition] = useState(false);
  const [showPRs, setShowPRs] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Live Workout Mobile Navigation State
  const [liveExIdx, setLiveExIdx] = useState<number>(0);
  const [liveSetIdx, setLiveSetIdx] = useState<number>(0);

  // Plate Calculator Modal state
  const [calculatorTarget, setCalculatorTarget] = useState<{
    sessionId: string;
    exerciseIndex: number;
    setIndex: number;
    initialWeight: number;
    barWeight: number;
  } | null>(null);

  const allExerciseNames = Array.from(
    new Set(
      state.gym.sessions.flatMap((s) => s.exercises.map((e) => e.name.trim())).filter(Boolean)
    )
  );

  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const activeExercise = selectedExercise || allExerciseNames[0] || '';

  const peso = currentWeight(state);
  const variacion = weightVariation(state);
  const imc = calcIMC(state);
  const imcCat = imcCategory(imc);
  const streakDetails = calcGymStreakDetails(state);
  const streak = streakDetails.streakDays;
  const isRestDayToday =
    (state.gym.restDays || []).includes(todayISO()) ||
    Boolean(state.checkoutLog[todayISO()]?.trainedSkipped);
  const isTrainedToday = state.gym.sessions.some((s) => s.date === todayISO());

  const activeWorkoutSession = state.gym.sessions.find(
    (s) => s.status === 'active' || (s.date === todayISO() && s.status !== 'completed')
  );

  const handleToggleRestDay = () => {
    const today = todayISO();
    onUpdateState((draft) => {
      if (!draft.gym.restDays) draft.gym.restDays = [];
      const idx = draft.gym.restDays.indexOf(today);
      if (idx >= 0) {
        draft.gym.restDays.splice(idx, 1);
        if (draft.checkoutLog[today]) {
          draft.checkoutLog[today].trainedSkipped = false;
        }
        showToast('Descanso cancelado. Racha regular.', 'info');
      } else {
        draft.gym.restDays.push(today);
        if (!draft.checkoutLog[today]) draft.checkoutLog[today] = {};
        draft.checkoutLog[today].trainedSkipped = true;
        showToast('🛋️ Hoy marcado como descanso. Tu racha está protegida.');
      }
    });
  };

  const weightPts = sortedWeight(state);
  const ref = new Date();
  const diasEntrenadosAnio = new Set(
    state.gym.sessions
      .filter((s) => new Date(s.date + 'T00:00:00').getFullYear() === ref.getFullYear())
      .map((s) => s.date)
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
      const maxKg = Math.max(
        ...exList.flatMap((e) =>
          e.sets && e.sets.length > 0
            ? e.sets.map((set) => Number(set.weight) || 0)
            : [Number(e.weight) || 0]
        ),
        0
      );
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
    showToast(`Peso registrado: ${kg} kg`);
  };

  // Workout sessions
  const handleStartWorkout = (templateId?: string) => {
    const today = todayISO();
    const template = templateId ? state.gym.routineTemplates.find((t) => t.id === templateId) : null;

    onUpdateState((draft) => {
      const newSession: GymSession = {
        id: uid(),
        date: today,
        weekLabel: undefined,
        status: 'active',
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        finishedAt: null,
        exercises: template
          ? template.exercises.map((ex) => ({
              id: uid(),
              name: ex.name,
              muscleGroup: ex.muscleGroup || inferMuscleGroup(ex.name),
              barWeight: ex.barWeight ?? 20,
              restSeconds: ex.restSeconds || 90,
              timerEnabled: true,
              sets:
                ex.sets && ex.sets.length > 0
                  ? ex.sets.map((s) => ({
                      id: uid(),
                      weight: s.weight,
                      reps: s.reps,
                      completed: false,
                    }))
                  : [
                      { id: uid(), weight: Number(ex.weight) || 20, reps: 10, completed: false },
                      { id: uid(), weight: Number(ex.weight) || 20, reps: 10, completed: false },
                      { id: uid(), weight: Number(ex.weight) || 20, reps: 10, completed: false },
                    ],
            }))
          : [],
      };
      draft.gym.sessions.unshift(newSession);
    });
    setLiveExIdx(0);
    setLiveSetIdx(0);
    setActiveTab('entrenar');
    playSound('click');
    showToast('🏋️ Entrenamiento iniciado.');
  };

  const handleFinishWorkout = (sessionId: string) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.status = 'completed';
        s.finishedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      draft.gym.activeTimer = null;
    });
    playSound('success');
    showToast('🎉 ¡Entrenamiento completado con éxito!');
  };

  const handleAddSession = (overrideWeek?: string) => {
    onUpdateState((draft) => {
      draft.gym.sessions.unshift({
        id: uid(),
        date: sessionDate || todayISO(),
        weekLabel: overrideWeek || sessionWeekLabel.trim() || undefined,
        status: 'completed',
        exercises: [],
      });
    });
    setSessionWeekLabel('');
    showToast('Sesión creada.');
  };

  const handleEditSessionWeek = (sessionId: string, weekLabel: string) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) s.weekLabel = weekLabel.trim() || undefined;
    });
  };

  const handleEditSessionDate = (sessionId: string, date: string) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) s.date = date;
    });
  };

  const handleDeleteSession = (id: string) => {
    onUpdateState((draft) => {
      draft.gym.sessions = draft.gym.sessions.filter((s) => s.id !== id);
    });
    showToast('Sesión eliminada.', 'info');
  };

  // Exercise & Sets handlers
  const handleAddExerciseToSession = (
    sessionId: string,
    exName: string,
    muscleGroup?: MuscleGroup,
    barWeight = 20,
    initialWeight = 20,
    initialReps = 10
  ) => {
    if (!exName.trim()) return;
    const name = exName.trim();
    const group = muscleGroup || inferMuscleGroup(name);
    const newSets: GymSet[] = [
      { id: uid(), weight: initialWeight, reps: initialReps, completed: false },
      { id: uid(), weight: initialWeight, reps: initialReps, completed: false },
      { id: uid(), weight: initialWeight, reps: initialReps, completed: false },
    ];

    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.exercises.push({
          id: uid(),
          name,
          muscleGroup: group,
          barWeight,
          restSeconds: 90,
          timerEnabled: true,
          sets: newSets,
          weight: initialWeight,
        });
      }
    });
    showToast(`Ejercicio agregado: ${name}`);
  };

  const handleAddSet = (sessionId: string, exerciseIndex: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s && s.exercises[exerciseIndex]) {
        const ex = s.exercises[exerciseIndex];
        if (!ex.sets) ex.sets = [];
        const lastSet = ex.sets[ex.sets.length - 1];
        const prevWeight = lastSet ? lastSet.weight : Number(ex.weight) || 20;
        const prevReps = lastSet ? lastSet.reps : 10;
        ex.sets.push({
          id: uid(),
          weight: prevWeight,
          reps: prevReps,
          completed: false,
        });
      }
    });
  };

  const handleUpdateSet = (
    sessionId: string,
    exerciseIndex: number,
    setIndex: number,
    updates: Partial<GymSet>
  ) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s && s.exercises[exerciseIndex] && s.exercises[exerciseIndex].sets[setIndex]) {
        const ex = s.exercises[exerciseIndex];
        const targetSet = ex.sets[setIndex];
        const wasCompleted = targetSet.completed;

        Object.assign(targetSet, updates);

        if (updates.weight != null) {
          ex.weight = updates.weight;
        }

        if (!wasCompleted && updates.completed === true) {
          targetSet.completedAt = new Date().toISOString();
          playSound('success');
          if (ex.timerEnabled !== false) {
            const durationSeconds = ex.restSeconds || 90;
            draft.gym.activeTimer = {
              endsAt: Date.now() + durationSeconds * 1000,
              durationSeconds,
              sessionId: s.id,
              exerciseId: ex.id,
              setId: targetSet.id,
            };
          }
        }
      }
    });
  };

  const handleDeleteSet = (sessionId: string, exerciseIndex: number, setIndex: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s && s.exercises[exerciseIndex]) {
        s.exercises[exerciseIndex].sets.splice(setIndex, 1);
      }
    });
  };

  const handleDeleteExercise = (sessionId: string, exerciseIndex: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.exercises.splice(exerciseIndex, 1);
      }
    });
  };

  const handleUpdateExerciseBar = (sessionId: string, exerciseIndex: number, barWeight: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      if (s && s.exercises[exerciseIndex]) {
        s.exercises[exerciseIndex].barWeight = barWeight;
      }
    });
  };

  // Templates
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
    showToast('Plantilla creada.');
  };

  const handleDeleteTemplate = (id: string) => {
    onUpdateState((draft) => {
      draft.gym.routineTemplates = draft.gym.routineTemplates.filter((t) => t.id !== id);
    });
    showToast('Plantilla eliminada.', 'info');
  };

  const handleSaveSessionAsTemplate = (session: GymSession) => {
    const defaultName = session.weekLabel ? `Rutina ${session.weekLabel}` : `Rutina del ${fmtDate(session.date)}`;
    const name = window.prompt('Nombre para la nueva plantilla de rutina:', defaultName);
    if (!name || !name.trim()) return;

    onUpdateState((draft) => {
      draft.gym.routineTemplates.push({
        id: uid(),
        name: name.trim(),
        exercises: session.exercises.map((ex) => ({
          id: uid(),
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          barWeight: ex.barWeight ?? 20,
          restSeconds: ex.restSeconds || 90,
          timerEnabled: true,
          sets: ex.sets.map((s) => ({
            id: uid(),
            weight: s.weight,
            reps: s.reps,
            completed: false,
          })),
        })),
      });
    });
    showToast('Plantilla guardada a partir de la sesión.');
  };

  const gymHistory = useMemo(() => {
    return buildGymHistory(state.gym.sessions);
  }, [state.gym.sessions]);

  // Calculations for live workout
  const liveSafeExIdx = activeWorkoutSession
    ? Math.max(0, Math.min(liveExIdx, activeWorkoutSession.exercises.length - 1))
    : 0;
  const liveCurrentEx = activeWorkoutSession?.exercises[liveSafeExIdx];
  const liveSets = liveCurrentEx?.sets || [];
  const liveSafeSetIdx = Math.max(0, Math.min(liveSetIdx, Math.max(0, liveSets.length - 1)));
  const liveCurrentSet = liveSets[liveSafeSetIdx];

  const handleLiveAdjustWeight = (delta: number) => {
    if (!activeWorkoutSession || !liveCurrentSet) return;
    const currentW = Number(liveCurrentSet.weight) || 0;
    const nextW = Math.max(0, Math.round((currentW + delta) * 10) / 10);
    handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, liveSafeSetIdx, { weight: nextW });
  };

  const handleLiveAdjustReps = (delta: number) => {
    if (!activeWorkoutSession || !liveCurrentSet) return;
    const currentR = Number(liveCurrentSet.reps) || 0;
    const nextR = Math.max(1, currentR + delta);
    handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, liveSafeSetIdx, { reps: nextR });
  };

  const handleLiveCompleteCurrentSet = () => {
    if (!activeWorkoutSession || !liveCurrentSet) return;
    const nextCompleted = !liveCurrentSet.completed;
    handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, liveSafeSetIdx, { completed: nextCompleted });

    // If completing, auto-advance to next incomplete set in this exercise
    if (nextCompleted && liveSets.length > liveSafeSetIdx + 1) {
      setLiveSetIdx(liveSafeSetIdx + 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        category="Entrenamiento & Fuerza"
        title="Gimnasio"
        subtitle="Modo entreno móvil, cálculo de discos, descanso guiado y progresión."
        actions={
          !activeWorkoutSession ? (
            <div className="flex items-center gap-2 flex-wrap">
              {state.gym.routineTemplates.length > 0 && (
                <select
                  value={sessionTemplate}
                  onChange={(e) => setSessionTemplate(e.target.value)}
                  className="px-2.5 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer outline-none"
                >
                  <option value="">En blanco (sin plantilla)</option>
                  {state.gym.routineTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => handleStartWorkout(sessionTemplate || undefined)}
                className="px-3.5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
              >
                <AppIcon name="dumbbell" className="h-3.5 w-3.5" />
                <span>Iniciar Entrenamiento</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleFinishWorkout(activeWorkoutSession.id)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
            >
              <AppIcon name="check" className="h-3.5 w-3.5" />
              <span>Finalizar Sesión</span>
            </button>
          )
        }
      />

      {/* Docked Rest Timer Bar */}
      <GymRestTimerBar
        state={state}
        sessionId={activeWorkoutSession?.id || (state.gym.sessions[0]?.id ?? '')}
        onUpdateState={onUpdateState}
      />

      {/* Main Navigation Segmented Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('entrenar')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'entrenar'
              ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="dumbbell" className="h-4 w-4" />
          <span>{activeWorkoutSession ? 'Entrenamiento en Vivo ⚡' : 'Entrenar Hoy'}</span>
          {activeWorkoutSession && (
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('historial')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'historial'
              ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="calendar" className="h-4 w-4" />
          <span>Historial de Semanas</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-soft)]">
            {state.gym.sessions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('progresion')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'progresion'
              ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="activity" className="h-4 w-4" />
          <span>Progresión & Salud</span>
        </button>
      </div>

      {/* TAB 1: ENTRENAR (MODO EN VIVO / HOY) */}
      {activeTab === 'entrenar' && (
        <div className="space-y-6 animate-in fade-in">
          {/* ACTIVE WORKOUT LIVE CONSOLE (COCKPIT MÓVIL) */}
          {activeWorkoutSession ? (
            <div className="bg-[var(--card)] border-2 border-blue-500/35 rounded-3xl p-4 sm:p-6 shadow-lg space-y-5">
              {/* Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold text-xl shadow-md">
                    ⚡
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Sesión en Vivo
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--text-soft)]">
                        Iniciado {activeWorkoutSession.startedAt || 'Hoy'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text)] mt-0.5">
                      Volumen acumulado:{' '}
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                        {sessionVolume(activeWorkoutSession)} kg
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFinishWorkout(activeWorkoutSession.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
                  >
                    ✓ Terminar Sesión
                  </button>
                </div>
              </div>

              {/* Exercise Switcher Chips */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                  Ejercicios de la sesión ({activeWorkoutSession.exercises.length})
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5">
                  {activeWorkoutSession.exercises.map((ex, idx) => {
                    const isSelected = idx === liveSafeExIdx;
                    const doneCount = (ex.sets || []).filter((s) => s.completed).length;
                    const totalSets = (ex.sets || []).length;
                    const allDone = totalSets > 0 && doneCount === totalSets;

                    return (
                      <button
                        key={ex.id || idx}
                        type="button"
                        onClick={() => {
                          setLiveExIdx(idx);
                          // Select first incomplete set if available
                          const firstInc = (ex.sets || []).findIndex((s) => !s.completed);
                          setLiveSetIdx(firstInc >= 0 ? firstInc : 0);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : allDone
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : 'bg-[var(--surface-muted)] text-[var(--text)] border-[var(--border)] hover:border-blue-500/40'
                        }`}
                      >
                        <span>{idx + 1}. {ex.name}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : allDone
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-[var(--card)] text-[var(--text-soft)]'
                          }`}
                        >
                          {doneCount}/{totalSets}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Current Focused Exercise & Interactive Set Console */}
              {liveCurrentEx ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:p-5 space-y-4">
                  {/* Title & Stats */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-[var(--text)] tracking-tight">
                          {liveCurrentEx.name}
                        </h3>
                        {liveCurrentEx.muscleGroup && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)]">
                            {liveCurrentEx.muscleGroup}
                          </span>
                        )}
                      </div>
                      {getPreviousExerciseStats(state.gym.sessions, activeWorkoutSession.id, liveCurrentEx.name) && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                          🏆 Mejor anterior: {getPreviousExerciseStats(state.gym.sessions, activeWorkoutSession.id, liveCurrentEx.name)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={liveCurrentEx.barWeight ?? 20}
                        onChange={(e) => handleUpdateExerciseBar(activeWorkoutSession.id, liveSafeExIdx, Number(e.target.value))}
                        className="px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                        title="Tipo de barra"
                      >
                        <option value={20}>Barra 20 kg (Olímpica)</option>
                        <option value={15}>Barra 15 kg (Mujer)</option>
                        <option value={10}>Barra 10 kg (W / EZ)</option>
                        <option value={0}>0 kg (Mancuerna / Máq)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          setCalculatorTarget({
                            sessionId: activeWorkoutSession.id,
                            exerciseIndex: liveSafeExIdx,
                            setIndex: liveSafeSetIdx,
                            initialWeight: Number(liveCurrentSet?.weight) || 40,
                            barWeight: liveCurrentEx.barWeight ?? 20,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold cursor-pointer hover:bg-blue-500/20"
                      >
                        ⚖️ Discos
                      </button>
                    </div>
                  </div>

                  {/* Series Selector Pills */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {liveSets.map((s, sIdx) => {
                        const isSetSelected = sIdx === liveSafeSetIdx;
                        return (
                          <button
                            key={s.id || sIdx}
                            type="button"
                            onClick={() => setLiveSetIdx(sIdx)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                              isSetSelected
                                ? 'bg-[var(--text)] text-[var(--bg-elevated)] border-transparent shadow-xs'
                                : s.completed
                                ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                : 'bg-[var(--card)] text-[var(--text-soft)] border-[var(--border)]'
                            }`}
                          >
                            <span>#{sIdx + 1}</span>
                            <span className="font-mono text-[11px]">
                              {s.weight}k × {s.reps}
                            </span>
                            {s.completed && <span>✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddSet(activeWorkoutSession.id, liveSafeExIdx)}
                      className="px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <AppIcon name="plus" className="h-3 w-3" />
                      <span>Agregar serie</span>
                    </button>
                  </div>

                  {/* ACTIVE SET CONSOLE WITH GIANT TOUCH BUTTONS */}
                  {liveCurrentSet ? (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
                          Serie en ajuste: #{liveSafeSetIdx + 1} de {liveSets.length}
                        </span>
                        {/* Plate indication */}
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-[var(--blue)]">
                            {(() => {
                              const bar = liveCurrentEx.barWeight ?? 20;
                              const w = Number(liveCurrentSet.weight) || 0;
                              const perSide = Math.max(0, (w - bar) / 2);
                              return bar > 0
                                ? `${perSide} kg por lado (en barra de ${bar} kg)`
                                : 'Sin barra';
                            })()}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Weight Adjuster */}
                        <div className="p-3 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                              Peso Total
                            </span>
                            <span className="text-2xl font-black font-mono text-[var(--text)]">
                              {liveCurrentSet.weight} <span className="text-xs font-semibold text-[var(--text-soft)]">kg</span>
                            </span>
                          </div>

                          {/* Quick Touch Pills */}
                          <div className="grid grid-cols-6 gap-1">
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustWeight(-5)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              -5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustWeight(-2.5)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              -2.5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustWeight(-1.25)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              -1.2
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustWeight(1.25)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              +1.2
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustWeight(2.5)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              +2.5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustWeight(5)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              +5
                            </button>
                          </div>
                        </div>

                        {/* Reps Adjuster */}
                        <div className="p-3 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                              Repeticiones
                            </span>
                            <span className="text-2xl font-black font-mono text-[var(--text)]">
                              {liveCurrentSet.reps} <span className="text-xs font-semibold text-[var(--text-soft)]">reps</span>
                            </span>
                          </div>

                          {/* Quick Touch Pills */}
                          <div className="grid grid-cols-4 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustReps(-2)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              -2
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustReps(-1)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustReps(1)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveAdjustReps(2)}
                              className="py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)] transition cursor-pointer text-center"
                            >
                              +2
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* BIG SATISFYING ACTION BUTTON: COMPLETAR SERIE */}
                      <button
                        type="button"
                        onClick={handleLiveCompleteCurrentSet}
                        className={`w-full py-3.5 rounded-2xl text-sm font-black tracking-wide transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 active:scale-[0.99] ${
                          liveCurrentSet.completed
                            ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25'
                        }`}
                      >
                        <AppIcon name="check" className="h-5 w-5" />
                        <span>
                          {liveCurrentSet.completed
                            ? `✓ Serie #${liveSafeSetIdx + 1} completada (Tocar para desmarcar)`
                            : `✓ COMPLETAR SERIE #${liveSafeSetIdx + 1} (${liveCurrentSet.weight} kg × ${liveCurrentSet.reps})`}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="py-8 text-center bg-[var(--surface-muted)] rounded-2xl border border-[var(--border)]">
                  <p className="text-xs text-[var(--text-soft)]">
                    Esta sesión todavía no tiene ejercicios. Agregá el primero abajo:
                  </p>
                </div>
              )}

              {/* Quick Add Exercise Form to Active Workout */}
              <div className="pt-2">
                <WorkoutSessionCard
                  session={activeWorkoutSession}
                  allSessions={state.gym.sessions}
                  onFinishWorkout={() => handleFinishWorkout(activeWorkoutSession.id)}
                  onDeleteSession={() => handleDeleteSession(activeWorkoutSession.id)}
                  onEditSessionDate={(d) => handleEditSessionDate(activeWorkoutSession.id, d)}
                  onEditSessionWeek={(w) => handleEditSessionWeek(activeWorkoutSession.id, w)}
                  onSaveAsTemplate={() => handleSaveSessionAsTemplate(activeWorkoutSession)}
                  onAddExercise={(name, muscle, barW, w, r) =>
                    handleAddExerciseToSession(activeWorkoutSession.id, name, muscle, barW, w, r)
                  }
                  onDeleteExercise={(exIdx) => handleDeleteExercise(activeWorkoutSession.id, exIdx)}
                  onAddSet={(exIdx) => handleAddSet(activeWorkoutSession.id, exIdx)}
                  onUpdateSet={(exIdx, setIdx, updates) =>
                    handleUpdateSet(activeWorkoutSession.id, exIdx, setIdx, updates)
                  }
                  onDeleteSet={(exIdx, setIdx) => handleDeleteSet(activeWorkoutSession.id, exIdx, setIdx)}
                  onUpdateExerciseBar={(exIdx, barW) =>
                    handleUpdateExerciseBar(activeWorkoutSession.id, exIdx, barW)
                  }
                  onOpenCalculator={(exIdx, setIdx, initialW, barW) =>
                    setCalculatorTarget({
                      sessionId: activeWorkoutSession.id,
                      exerciseIndex: exIdx,
                      setIndex: setIdx,
                      initialWeight: initialW,
                      barWeight: barW,
                    })
                  }
                />
              </div>
            </div>
          ) : (
            /* NO ACTIVE WORKOUT: TODAY LAUNCHER */
            <div className="space-y-6">
              {/* Today's Gym Status Hero Card */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl font-bold text-xl shadow-xs ${
                      isTrainedToday
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : isRestDayToday
                        ? 'bg-purple-500/10 text-purple-600'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}
                  >
                    <AppIcon
                      name={isTrainedToday ? 'checkCircle' : isRestDayToday ? 'moon' : 'dumbbell'}
                      className="h-6 w-6"
                    />
                  </span>
                  <div>
                    <h2 className="text-base font-black text-[var(--text)]">
                      {isTrainedToday
                        ? '¡Entrenamiento de Hoy Completado!'
                        : isRestDayToday
                        ? 'Día de Descanso Activo'
                        : '¿Listo para entrenar hoy?'}
                    </h2>
                    <p className="text-xs text-[var(--text-soft)] mt-0.5">
                      {isTrainedToday
                        ? 'Excelente sesión. Tus datos y volumen quedaron registrados.'
                        : isRestDayToday
                        ? 'Racha de consistencia protegida. Tu musculatura se recupera.'
                        : 'Elegí una plantilla o iniciá en blanco para registrar tus series con un toque.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                  {!isTrainedToday && (
                    <button
                      type="button"
                      onClick={handleToggleRestDay}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        isRestDayToday
                          ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                          : 'bg-[var(--surface-muted)] text-[var(--text-soft)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}
                    >
                      {isRestDayToday ? 'Cancelar descanso' : '🛋️ Hoy descanso'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartWorkout(sessionTemplate || undefined)}
                    className="px-5 py-2.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2"
                  >
                    <AppIcon name="dumbbell" className="h-4 w-4" />
                    <span>Iniciar Entrenamiento</span>
                  </button>
                </div>
              </div>

              {/* Routine Templates Manager */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]">
                      <AppIcon name="repeat" className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-xs font-bold text-[var(--text)]">Plantillas de Rutina</h2>
                      <p className="text-[11px] text-[var(--text-soft)]">
                        {state.gym.routineTemplates.length} plantilla{state.gym.routineTemplates.length === 1 ? '' : 's'} guardada{state.gym.routineTemplates.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTemplates((v) => !v)}
                    className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
                  >
                    {showTemplates ? 'Ocultar ↑' : 'Gestionar plantillas →'}
                  </button>
                </div>

                {showTemplates && (
                  <div className="space-y-3 pt-2 border-t border-[var(--border)] animate-in fade-in">
                    <form onSubmit={handleAddTemplate} className="flex gap-2">
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Ej: Empuje (Pecho / Hombro / Tríceps)"
                        className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl cursor-pointer hover:opacity-90"
                      >
                        ＋ Crear
                      </button>
                    </form>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {state.gym.routineTemplates.map((t) => (
                        <div key={t.id} className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-between gap-2">
                          <div>
                            <strong className="text-xs text-[var(--text)] block">{t.name}</strong>
                            <span className="text-[11px] text-[var(--text-soft)]">
                              {t.exercises.length} ejercicio{t.exercises.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartWorkout(t.id)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 cursor-pointer shadow-2xs"
                            >
                              ⚡ Iniciar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(t.id)}
                              className="text-xs text-[var(--text-faint)] hover:text-rose-500 cursor-pointer p-1"
                              title="Eliminar plantilla"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Latest Session Card (Quick Glance) */}
              {state.gym.sessions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
                      Última sesión registrada
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('historial')}
                      className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
                    >
                      Ver todo el historial →
                    </button>
                  </div>
                  <WorkoutSessionCard
                    session={state.gym.sessions[0]}
                    allSessions={state.gym.sessions}
                    onFinishWorkout={() => handleFinishWorkout(state.gym.sessions[0].id)}
                    onDeleteSession={() => handleDeleteSession(state.gym.sessions[0].id)}
                    onEditSessionDate={(d) => handleEditSessionDate(state.gym.sessions[0].id, d)}
                    onEditSessionWeek={(w) => handleEditSessionWeek(state.gym.sessions[0].id, w)}
                    onSaveAsTemplate={() => handleSaveSessionAsTemplate(state.gym.sessions[0])}
                    onAddExercise={(name, muscle, barW, w, r) =>
                      handleAddExerciseToSession(state.gym.sessions[0].id, name, muscle, barW, w, r)
                    }
                    onDeleteExercise={(exIdx) => handleDeleteExercise(state.gym.sessions[0].id, exIdx)}
                    onAddSet={(exIdx) => handleAddSet(state.gym.sessions[0].id, exIdx)}
                    onUpdateSet={(exIdx, setIdx, updates) =>
                      handleUpdateSet(state.gym.sessions[0].id, exIdx, setIdx, updates)
                    }
                    onDeleteSet={(exIdx, setIdx) => handleDeleteSet(state.gym.sessions[0].id, exIdx, setIdx)}
                    onUpdateExerciseBar={(exIdx, barW) =>
                      handleUpdateExerciseBar(state.gym.sessions[0].id, exIdx, barW)
                    }
                    onOpenCalculator={(exIdx, setIdx, initialW, barW) =>
                      setCalculatorTarget({
                        sessionId: state.gym.sessions[0].id,
                        exerciseIndex: exIdx,
                        setIndex: setIdx,
                        initialWeight: initialW,
                        barWeight: barW,
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORIAL DE SEMANAS */}
      {activeTab === 'historial' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Quick Create Manual Session Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Cargar Sesión Manual</h2>
              <p className="text-xs text-[var(--text-soft)]">
                Agregá un entrenamiento pasado con fecha específica.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <button
                type="button"
                onClick={() => handleAddSession()}
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl cursor-pointer hover:opacity-90"
              >
                ＋ Nueva Sesión
              </button>
            </div>
          </div>

          {/* Recent Weeks */}
          {gymHistory.recentWeeks.length === 0 ? (
            <div className="p-8 text-center bg-[var(--card)] border border-[var(--border)] rounded-2xl text-xs text-[var(--text-faint)]">
              Todavía no tenés sesiones registradas. Iniciá una sesión desde la pestaña "Entrenar Hoy".
            </div>
          ) : (
            gymHistory.recentWeeks.map((week) => (
              <div key={week.key} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-extrabold text-xs border border-blue-500/20">
                      🗓️ {week.weekName}
                    </span>
                    <span className="text-xs font-mono text-[var(--text-soft)]">({week.rangeLabel})</span>
                    <span className="text-xs font-bold text-[var(--text-faint)] bg-[var(--surface-muted)] px-2 py-0.5 rounded-lg border border-[var(--border)]">
                      {week.sessions.length} sesión{week.sessions.length === 1 ? '' : 'es'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {week.sessions.map((session) => (
                    <WorkoutSessionCard
                      key={session.id}
                      session={session}
                      allSessions={state.gym.sessions}
                      onFinishWorkout={() => handleFinishWorkout(session.id)}
                      onDeleteSession={() => handleDeleteSession(session.id)}
                      onEditSessionDate={(d) => handleEditSessionDate(session.id, d)}
                      onEditSessionWeek={(w) => handleEditSessionWeek(session.id, w)}
                      onSaveAsTemplate={() => handleSaveSessionAsTemplate(session)}
                      onAddExercise={(name, muscle, barW, w, r) =>
                        handleAddExerciseToSession(session.id, name, muscle, barW, w, r)
                      }
                      onDeleteExercise={(exIdx) => handleDeleteExercise(session.id, exIdx)}
                      onAddSet={(exIdx) => handleAddSet(session.id, exIdx)}
                      onUpdateSet={(exIdx, setIdx, updates) =>
                        handleUpdateSet(session.id, exIdx, setIdx, updates)
                      }
                      onDeleteSet={(exIdx, setIdx) => handleDeleteSet(session.id, exIdx, setIdx)}
                      onUpdateExerciseBar={(exIdx, barW) =>
                        handleUpdateExerciseBar(session.id, exIdx, barW)
                      }
                      onOpenCalculator={(exIdx, setIdx, initialW, barW) =>
                        setCalculatorTarget({
                          sessionId: session.id,
                          exerciseIndex: exIdx,
                          setIndex: setIdx,
                          initialWeight: initialW,
                          barWeight: barW,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Archived Older Months */}
          {gymHistory.archivedMonths.length > 0 && (
            <div className="space-y-2 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Meses Anteriores Archivados
              </h3>
              {gymHistory.archivedMonths.map((month) => (
                <details
                  key={month.key}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-2xs"
                >
                  <summary className="flex cursor-pointer items-center justify-between p-4 list-none hover:bg-[var(--surface-muted)] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text)]">📁 {month.label}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)]">
                        {month.sessionsCount} sesiones
                      </span>
                    </div>
                    <span className="text-xs text-[var(--blue)] font-bold group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </summary>

                  <div className="p-4 pt-0 space-y-4 border-t border-[var(--border)] mt-2">
                    {month.weeks.flatMap((w) => w.sessions).map((session) => (
                      <WorkoutSessionCard
                        key={session.id}
                        session={session}
                        allSessions={state.gym.sessions}
                        onFinishWorkout={() => handleFinishWorkout(session.id)}
                        onDeleteSession={() => handleDeleteSession(session.id)}
                        onEditSessionDate={(d) => handleEditSessionDate(session.id, d)}
                        onEditSessionWeek={(w) => handleEditSessionWeek(session.id, w)}
                        onSaveAsTemplate={() => handleSaveSessionAsTemplate(session)}
                        onAddExercise={(name, muscle, barW, w, r) =>
                          handleAddExerciseToSession(session.id, name, muscle, barW, w, r)
                        }
                        onDeleteExercise={(exIdx) => handleDeleteExercise(session.id, exIdx)}
                        onAddSet={(exIdx) => handleAddSet(session.id, exIdx)}
                        onUpdateSet={(exIdx, setIdx, updates) =>
                          handleUpdateSet(session.id, exIdx, setIdx, updates)
                        }
                        onDeleteSet={(exIdx, setIdx) => handleDeleteSet(session.id, exIdx, setIdx)}
                        onUpdateExerciseBar={(exIdx, barW) =>
                          handleUpdateExerciseBar(session.id, exIdx, barW)
                        }
                        onOpenCalculator={(exIdx, setIdx, initialW, barW) =>
                          setCalculatorTarget({
                            sessionId: session.id,
                            exerciseIndex: exIdx,
                            setIndex: setIdx,
                            initialWeight: initialW,
                            barWeight: barW,
                          })
                        }
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROGRESIÓN & SALUD */}
      {activeTab === 'progresion' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Summary Health Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⚖️ Peso actual</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
                {peso != null ? `${peso} kg` : '—'}
              </div>
              <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                {variacion == null
                  ? 'sin registros'
                  : `${variacion > 0 ? '+' : ''}${variacion.toFixed(1)} kg desde inicio`}
              </p>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📐 Composición</span>
                  <button
                    type="button"
                    onClick={() => setShowBodyComposition((v) => !v)}
                    className="text-[10px] font-bold text-[var(--blue)] hover:underline cursor-pointer"
                  >
                    {showBodyComposition ? 'Ocultar' : 'Ver RFM →'}
                  </button>
                </div>
                <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
                  {imc != null ? imc.toFixed(1) : '—'} <span className="text-xs font-normal text-[var(--text-soft)]">IMC</span>
                </div>
                <span
                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                    imcCat.color === 'green'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : imcCat.color === 'blue'
                      ? 'bg-blue-500/10 text-blue-500'
                      : imcCat.color === 'amber'
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-red-500/10 text-red-500'
                  }`}
                >
                  {imcCat.label}
                </span>
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🔥 Racha activa</span>
                  {streakDetails.weeksStreak > 0 && (
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {streakDetails.weeksStreak} sem.
                    </span>
                  )}
                </div>
                <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
                  {streak} día{streak === 1 ? '' : 's'}
                </div>
                <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                  {streakDetails.workoutCount} entreno{streakDetails.workoutCount === 1 ? '' : 's'} · {streakDetails.restDaysCount} descanso{streakDetails.restDaysCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📅 Días en el año</span>
              <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{diasEntrenadosAnio}</div>
              <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                sesiones registradas en {ref.getFullYear()}
              </p>
            </div>
          </div>

          {/* Body Composition Card (RFM, Masa Magra, Grasa %, FFMI) */}
          {showBodyComposition && (
            <div className="animate-in fade-in">
              <BodyCompositionCard state={state} onUpdateState={onUpdateState} />
            </div>
          )}

          {/* PRs Card (Récords Personales con 1RM estimado y filtros) */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-[var(--text)]">Récords Personales & Progresión 1RM</h2>
              <button
                type="button"
                onClick={() => setShowPRs((v) => !v)}
                className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
              >
                {showPRs ? 'Ocultar PRs ↑' : 'Ver todos los PRs →'}
              </button>
            </div>
            {showPRs && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] animate-in fade-in">
                <PersonalRecordsCard state={state} />
              </div>
            )}
          </div>

          {/* Progress Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Body Weight Progression */}
            <div id="qa-focus-peso" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                  <span>⚖️</span> Evolución de Peso Corporal
                </h2>
                {peso != null && (
                  <span className="text-xs font-mono font-bold text-[var(--blue)] px-2.5 py-0.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    {peso} kg
                  </span>
                )}
              </div>

              <form onSubmit={handleAddWeight} className="flex items-center gap-2">
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                />
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="70.5 kg"
                  className="w-24 px-2 py-1 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer hover:opacity-90"
                >
                  ＋ Cargar
                </button>
              </form>

              {bodyWeightChartData.length < 2 ? (
                <p className="text-center py-6 text-xs text-[var(--text-faint)]">
                  Cargá al menos 2 registros para ver el gráfico de tendencia de peso.
                </p>
              ) : (
                <div className="h-48 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={bodyWeightChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis dataKey="dateLabel" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[bwMin, bwMax]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}k`} />
                      <Tooltip content={<CustomChartTooltip unit="kg" />} />
                      <Area type="monotone" dataKey="kg" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBw)" dot={{ r: 3, fill: '#10b981', stroke: '#fff', strokeWidth: 1 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Lifting Weight Progression */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                  <span>🏋️</span> Progresión de Cargas
                </h2>
                {allExerciseNames.length > 0 && (
                  <select
                    value={activeExercise}
                    onChange={(e) => setSelectedExercise(e.target.value)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                  >
                    {allExerciseNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {liftingChartData.length === 0 ? (
                <p className="text-center py-6 text-xs text-[var(--text-faint)]">
                  Sin registros de carga para "{activeExercise}". Completá series en tus entrenamientos.
                </p>
              ) : (
                <div className="h-48 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liftingChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis dataKey="dateLabel" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[liftMin, liftMax]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}k`} />
                      <Tooltip content={<CustomChartTooltip unit="kg" />} />
                      <Line type="monotone" dataKey="kg" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 1.5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Plate Calculator Modal */}
      {calculatorTarget && (
        <GymPlateCalculator
          isOpen={Boolean(calculatorTarget)}
          initialWeight={calculatorTarget.initialWeight}
          initialBarWeight={calculatorTarget.barWeight}
          onClose={() => setCalculatorTarget(null)}
          onApplyWeight={(totalW, barW) => {
            handleUpdateSet(
              calculatorTarget.sessionId,
              calculatorTarget.exerciseIndex,
              calculatorTarget.setIndex,
              { weight: totalW }
            );
            handleUpdateExerciseBar(
              calculatorTarget.sessionId,
              calculatorTarget.exerciseIndex,
              barW
            );
          }}
        />
      )}
    </div>
  );
};

interface WorkoutSessionCardProps {
  session: GymSession;
  allSessions: GymSession[];
  onFinishWorkout: () => void;
  onDeleteSession: () => void;
  onEditSessionDate: (date: string) => void;
  onEditSessionWeek: (weekLabel: string) => void;
  onSaveAsTemplate: () => void;
  onAddExercise: (
    name: string,
    muscleGroup: MuscleGroup,
    barWeight: number,
    initialWeight: number,
    initialReps: number
  ) => void;
  onDeleteExercise: (exerciseIndex: number) => void;
  onAddSet: (exerciseIndex: number) => void;
  onUpdateSet: (exerciseIndex: number, setIndex: number, updates: Partial<GymSet>) => void;
  onDeleteSet: (exerciseIndex: number, setIndex: number) => void;
  onUpdateExerciseBar: (exerciseIndex: number, barWeight: number) => void;
  onOpenCalculator: (
    exerciseIndex: number,
    setIndex: number,
    initialWeight: number,
    barWeight: number
  ) => void;
}

const WorkoutSessionCard: React.FC<WorkoutSessionCardProps> = ({
  session,
  allSessions,
  onFinishWorkout,
  onDeleteSession,
  onEditSessionDate,
  onEditSessionWeek,
  onSaveAsTemplate,
  onAddExercise,
  onDeleteExercise,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onUpdateExerciseBar,
  onOpenCalculator,
}) => {
  const [newExName, setNewExName] = useState('');
  const [newExMuscle, setNewExMuscle] = useState<MuscleGroup>('Pecho');
  const [newExBar, setNewExBar] = useState(20);
  const [newExWeight, setNewExWeight] = useState('40');
  const [newExReps, setNewExReps] = useState('10');
  const [isEditingHeader, setIsEditingHeader] = useState(false);

  const isActive = session.status === 'active';
  const totalVol = sessionVolume(session);
  const setsCount = session.exercises.reduce((s, e) => s + (e.sets?.length || 0), 0);
  const completedCount = session.exercises.reduce(
    (s, e) => s + (e.sets ? e.sets.filter((x) => x.completed).length : 0),
    0
  );

  const handleCreateExercise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim()) return;
    onAddExercise(
      newExName.trim(),
      newExMuscle,
      newExBar,
      Number(newExWeight) || 20,
      Number(newExReps) || 10
    );
    setNewExName('');
  };

  return (
    <div
      className={`rounded-2xl border transition-all p-4 space-y-4 ${
        isActive
          ? 'border-blue-500/50 bg-[var(--card)] shadow-lg ring-2 ring-blue-500/20'
          : 'border-[var(--border)] bg-[var(--card)] shadow-2xs'
      }`}
    >
      {/* Session Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          {isEditingHeader ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={session.date}
                onChange={(e) => onEditSessionDate(e.target.value)}
                className="px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <input
                type="text"
                value={session.weekLabel || ''}
                onChange={(e) => onEditSessionWeek(e.target.value)}
                placeholder="Semana (ej: Semana 1)"
                className="w-28 px-2 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <button
                type="button"
                onClick={() => setIsEditingHeader(false)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white cursor-pointer"
              >
                OK
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold font-mono text-sm text-[var(--text)]">
                {fmtDate(session.date)}
              </span>
              {session.weekLabel && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {session.weekLabel}
                </span>
              )}
              {isActive ? (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 animate-pulse">
                  ● En curso
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)] border border-[var(--border)]">
                  Completado
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsEditingHeader(true)}
                className="text-[var(--text-faint)] hover:text-[var(--blue)] text-xs p-1 cursor-pointer"
                title="Editar fecha o semana"
              >
                ✏️
              </button>
            </div>
          )}
        </div>

        {/* Volume & Stats */}
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className="font-mono font-extrabold text-[var(--text)]">{totalVol} kg</span>
            <span className="text-[10px] text-[var(--text-faint)] block">
              {completedCount}/{setsCount} series
            </span>
          </div>

          {isActive && (
            <button
              type="button"
              onClick={onFinishWorkout}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-xs"
            >
              Terminar ✓
            </button>
          )}

          <button
            type="button"
            onClick={onSaveAsTemplate}
            className="text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--blue)] cursor-pointer p-1"
            title="Guardar esta rutina como plantilla"
          >
            📋 Plantilla
          </button>

          <button
            type="button"
            onClick={onDeleteSession}
            className="text-[11px] text-[var(--text-faint)] hover:text-rose-500 cursor-pointer p-1"
            title="Eliminar sesión"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Exercises List */}
      <div className="space-y-4">
        {session.exercises.length === 0 ? (
          <p className="py-4 text-xs text-[var(--text-faint)] text-center">
            Sin ejercicios todavía. Agregá uno debajo para comenzar a cargar tus series.
          </p>
        ) : (
          session.exercises.map((exercise, exIdx) => {
            const previousBest = getPreviousExerciseStats(allSessions, session.id, exercise.name);
            const currentBarWeight = exercise.barWeight ?? 20;

            return (
              <div
                key={exercise.id || exIdx}
                className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2.5"
              >
                {/* Exercise Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-extrabold text-[var(--text)]">
                      {exercise.name}
                    </strong>
                    {exercise.muscleGroup && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)]">
                        {exercise.muscleGroup}
                      </span>
                    )}
                    {previousBest && (
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        Ant: {previousBest}
                      </span>
                    )}
                  </div>

                  {/* Bar Weight & Actions */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1 text-[11px] text-[var(--text-soft)]">
                      <span>Barra:</span>
                      <select
                        value={currentBarWeight}
                        onChange={(e) => onUpdateExerciseBar(exIdx, Number(e.target.value))}
                        className="bg-[var(--card)] border border-[var(--border)] rounded-md px-1.5 py-0.5 text-xs font-mono font-bold cursor-pointer text-[var(--text)]"
                      >
                        <option value={20}>20 kg (Olímpica)</option>
                        <option value={15}>15 kg (Técnica/Mujer)</option>
                        <option value={10}>10 kg (W / EZ)</option>
                        <option value={0}>0 kg (Mancuerna/Máq)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenCalculator(
                          exIdx,
                          0,
                          Number(exercise.sets?.[0]?.weight) || 40,
                          currentBarWeight
                        )
                      }
                      className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-bold text-[10px] cursor-pointer flex items-center gap-1"
                      title="Calculadora y desglose de discos por lado"
                    >
                      <span>⚖️ Discos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteExercise(exIdx)}
                      className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Sets Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase font-bold text-[var(--text-faint)] border-b border-[var(--border)]">
                        <th className="py-1 w-10">Serie</th>
                        <th className="py-1 w-36">Peso Total</th>
                        <th className="py-1 w-28">Discos / Lado</th>
                        <th className="py-1 w-32">Reps</th>
                        <th className="py-1 w-12 text-center">Hecha</th>
                        <th className="py-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {(exercise.sets || []).map((set, setIdx) => {
                        const setWeight = Number(set.weight) || 0;
                        const platePerSide = Math.max(0, (setWeight - currentBarWeight) / 2);

                        return (
                          <tr
                            key={set.id || setIdx}
                            className={`transition-colors ${
                              set.completed ? 'bg-emerald-500/5' : 'hover:bg-[var(--card)]/50'
                            }`}
                          >
                            <td className="py-1.5 font-mono font-bold text-[var(--text-soft)]">
                              #{setIdx + 1}
                            </td>
                            <td className="py-1.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateSet(exIdx, setIdx, {
                                      weight: Math.max(0, Math.round((setWeight - 2.5) * 10) / 10),
                                    })
                                  }
                                  className="h-6 w-5 rounded bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-xs flex items-center justify-center cursor-pointer shrink-0"
                                  title="-2.5 kg"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={set.weight}
                                  onChange={(e) =>
                                    onUpdateSet(exIdx, setIdx, {
                                      weight: Number(e.target.value) || 0,
                                    })
                                  }
                                  className="w-14 px-1 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-center"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateSet(exIdx, setIdx, {
                                      weight: Math.round((setWeight + 2.5) * 10) / 10,
                                    })
                                  }
                                  className="h-6 w-5 rounded bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-xs flex items-center justify-center cursor-pointer shrink-0"
                                  title="+2.5 kg"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenCalculator(exIdx, setIdx, setWeight, currentBarWeight)
                                  }
                                  className="p-1 text-[10px] text-blue-600 hover:underline cursor-pointer"
                                  title="Calcular discos para esta serie"
                                >
                                  ⚖️
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5 font-mono text-[11px] text-[var(--text-soft)]">
                              {currentBarWeight > 0 ? (
                                <span
                                  onClick={() =>
                                    onOpenCalculator(exIdx, setIdx, setWeight, currentBarWeight)
                                  }
                                  className="cursor-pointer hover:underline text-[var(--blue)] font-bold"
                                >
                                  {platePerSide > 0 ? `${platePerSide} kg/lado` : 'Solo barra'}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-1.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateSet(exIdx, setIdx, {
                                      reps: Math.max(1, Number(set.reps) - 1),
                                    })
                                  }
                                  className="h-6 w-5 rounded bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-xs flex items-center justify-center cursor-pointer shrink-0"
                                  title="-1 rep"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={set.reps}
                                  onChange={(e) =>
                                    onUpdateSet(exIdx, setIdx, {
                                      reps: Number(e.target.value) || 0,
                                    })
                                  }
                                  className="w-11 px-1 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-center"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateSet(exIdx, setIdx, {
                                      reps: Number(set.reps) + 1,
                                    })
                                  }
                                  className="h-6 w-5 rounded bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-xs flex items-center justify-center cursor-pointer shrink-0"
                                  title="+1 rep"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSet(exIdx, setIdx, { completed: !set.completed })
                                }
                                className={`w-6 h-6 rounded-lg border-2 inline-flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                                  set.completed
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                                    : 'border-[var(--border)] bg-[var(--card)] text-transparent hover:border-[var(--blue)]'
                                }`}
                              >
                                ✓
                              </button>
                            </td>
                            <td className="py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => onDeleteSet(exIdx, setIdx)}
                                className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Set Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => onAddSet(exIdx)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <AppIcon name="plus" className="h-3 w-3" />
                    <span>Agregar serie</span>
                  </button>
                  <span className="text-[10px] text-[var(--text-faint)]">
                    Descanso configurado: {exercise.restSeconds || 90}s
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Form to add an exercise to this session */}
      <form
        onSubmit={handleCreateExercise}
        className="p-3 bg-[var(--surface-muted)] border border-dashed border-[var(--border)] rounded-xl flex flex-wrap items-end gap-2"
      >
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Nuevo ejercicio
          </label>
          <input
            type="text"
            list="gym-suggestions"
            value={newExName}
            onChange={(e) => {
              const val = e.target.value;
              setNewExName(val);
              if (val) setNewExMuscle(inferMuscleGroup(val));
            }}
            placeholder="Ej: Press banca plano"
            className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
          />
          <datalist id="gym-suggestions">
            {COMMON_EXERCISE_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Músculo
          </label>
          <select
            value={newExMuscle}
            onChange={(e) => setNewExMuscle(e.target.value as MuscleGroup)}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
          >
            {['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Barra
          </label>
          <select
            value={newExBar}
            onChange={(e) => setNewExBar(Number(e.target.value))}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
          >
            <option value={20}>20 kg</option>
            <option value={15}>15 kg</option>
            <option value={10}>10 kg</option>
            <option value={0}>0 kg</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Peso kg
          </label>
          <input
            type="number"
            step="0.5"
            value={newExWeight}
            onChange={(e) => setNewExWeight(e.target.value)}
            className="w-16 px-2 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Reps
          </label>
          <input
            type="number"
            value={newExReps}
            onChange={(e) => setNewExReps(e.target.value)}
            className="w-14 px-2 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
          />
        </div>

        <button
          type="submit"
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-2xs"
        >
          ＋ Añadir
        </button>
      </form>
    </div>
  );
};
