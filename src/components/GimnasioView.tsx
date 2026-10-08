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
import { DayKey, Exercise, ExerciseEquipment, GymSession, GymSet, LifeOSState, MuscleGroup } from '../types';
import { GymRestTimerBar } from './GymRestTimerBar';
import { ActiveWorkoutView } from './ActiveWorkoutView';
import { GymPlateCalculator } from './GymPlateCalculator';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { BodyCompositionCard } from './BodyCompositionCard';
import { WorkoutSummaryModal } from './WorkoutSummaryModal';
import { ExerciseHistoryModal } from './ExerciseHistoryModal';
import { PageHeader } from './PageHeader';
import { AppIcon, type AppIconName } from './AppIcon';
import {
  todayISO,
  DAYS,
  DAY_LABELS,
  fmtDate,
  uid,
} from '../lib/storage';
import {
  getExerciseGhostValues,
  calcDetailedPRs,
  detectSessionPRs,
  getExerciseHistory,
  getGymProgressMetrics,
  NewPRRecord,
} from '../lib/gymMetrics';
import type { ExerciseMetricTarget } from '../lib/gymMetrics';
import {
  currentWeight,
  weightVariation,
  calcIMC,
  imcCategory,
  calcGymStreakDetails,
  sortedWeight,
} from '../lib/calculations';
import { buildGymHistory } from '../lib/gymHistory';
import { buildGymSessionPresentation } from '../lib/gymIdlePresentation';
import {
  EXERCISE_EQUIPMENT_OPTIONS,
  inferExerciseEquipment,
  inferMuscleGroup,
} from '../lib/gymMigration';
import {
  addExerciseToGymSession,
  addSetToGymSession,
  configureGymTemplateExercise,
  deleteGymSession,
  deleteGymSessionExercise,
  deleteGymSessionSet,
  deleteGymTemplateExercise,
  deleteGymTemplate,
  discardGymSession,
  finishGymSession,
  getActiveGymSession,
  getPerformedGymVolume,
  duplicateGymTemplate,
  isPerformedGymSession,
  previewExerciseHistoryPropagation,
  previewNormalizeGymHistory,
  reorderGymTemplateExercise,
  requestGymSessionDeletion,
  startGymSession,
  updateGymTemplate,
  updateGymTemplateExercise,
  updateGymSessionExercise,
  updateGymSession,
  updateGymSessionSet,
} from '../lib/gymFlows';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';

interface GimnasioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  initialTab?: 'entrenar' | 'historial' | 'progresion';
  initialEditingTemplateId?: string | null;
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

type RoutineIdentity = {
  label: string;
  icon: AppIconName;
  surface: string;
  accent: string;
};

function getRoutineIdentity(exercises: Exercise[], routineName = ''): RoutineIdentity {
  const groups = exercises.reduce<Record<string, number>>((result, exercise) => {
    const group = exercise.muscleGroup || inferMuscleGroup(exercise.name);
    result[group] = (result[group] || 0) + 1;
    return result;
  }, {});
  const nameIdentity = /pecho/i.test(routineName)
    ? 'Pecho'
    : /espalda|dorsal/i.test(routineName)
      ? 'Espalda'
      : /pierna|cuádriceps|isquio|glúteo|pantorrilla/i.test(routineName)
        ? 'Piernas'
        : /core|abdomen/i.test(routineName)
          ? 'Core'
          : null;
  const dominant = nameIdentity || Object.entries(groups).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Entrenamiento';
  const normalized = dominant.toLocaleLowerCase('es-UY');

  if (/pierna|cuádriceps|isquio|glúteo|pantorrilla/.test(normalized)) {
    return {
      label: dominant,
      icon: 'activity',
      surface: 'from-indigo-500/20 via-blue-500/10 to-transparent',
      accent: 'text-indigo-600 dark:text-indigo-300',
    };
  }
  if (/espalda|dorsal/.test(normalized)) {
    return {
      label: dominant,
      icon: 'repeat',
      surface: 'from-sky-500/20 via-blue-500/10 to-transparent',
      accent: 'text-sky-700 dark:text-sky-300',
    };
  }
  if (/pecho/.test(normalized)) {
    return {
      label: dominant,
      icon: 'target',
      surface: 'from-blue-500/22 via-indigo-500/10 to-transparent',
      accent: 'text-blue-700 dark:text-blue-300',
    };
  }
  if (/core|abdomen/.test(normalized)) {
    return {
      label: dominant,
      icon: 'shield',
      surface: 'from-slate-500/20 via-blue-500/8 to-transparent',
      accent: 'text-slate-700 dark:text-slate-300',
    };
  }
  return {
    label: dominant,
    icon: 'dumbbell',
    surface: 'from-violet-500/18 via-blue-500/8 to-transparent',
    accent: 'text-violet-700 dark:text-violet-300',
  };
}

const RoutineIdentityMark: React.FC<{ exercises: Exercise[]; name?: string; compact?: boolean }> = ({ exercises, name, compact = false }) => {
  const identity = getRoutineIdentity(exercises, name);
  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${identity.surface} ring-1 ring-inset ring-[var(--border)] ${compact ? 'h-11 w-11' : 'h-14 w-14 sm:h-16 sm:w-16'}`}
    >
      <span className="absolute -right-3 -top-3 h-9 w-9 rounded-full border border-current opacity-[0.08]" />
      <span className="absolute -bottom-4 -left-2 h-10 w-10 rounded-full bg-current opacity-[0.04]" />
      <span className={`absolute inset-0 flex items-center justify-center ${identity.accent}`}>
        <AppIcon name={identity.icon} className={compact ? 'h-5 w-5' : 'h-6 w-6 sm:h-7 sm:w-7'} />
      </span>
    </div>
  );
};

function getPreviousExerciseStats(
  sessions: GymSession[],
  currentSessionId: string,
  exerciseName: string,
  exerciseId?: string
): string | null {
  const previous = getExerciseGhostValues(
    sessions,
    { exerciseId, exerciseName },
    currentSessionId
  );
  return previous?.bestSet
    ? `${previous.bestSet.weight} kg × ${previous.bestSet.reps}`
    : null;
}

export const GimnasioView: React.FC<GimnasioViewProps> = ({
  state,
  onUpdateState,
  initialTab = 'entrenar',
  initialEditingTemplateId = null,
}) => {
  const [activeTab, setActiveTab] = useState<'entrenar' | 'historial' | 'progresion'>(initialTab);
  const [weightDate, setWeightDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState('');

  const [sessionDate, setSessionDate] = useState(todayISO());
  const [sessionWeekLabel, setSessionWeekLabel] = useState('');
  const [sessionTemplate, setSessionTemplate] = useState('');

  const [templateName, setTemplateName] = useState('');
  const [showBodyComposition, setShowBodyComposition] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(initialEditingTemplateId);

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

  // Exercise History Modal state
  const [historyExercise, setHistoryExercise] = useState<ExerciseMetricTarget | null>(null);

  // Workout Summary Modal state (after finishing a workout)
  const [completedSummarySession, setCompletedSummarySession] = useState<{
    session: GymSession;
    newPRs: NewPRRecord[];
  } | null>(null);

  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const gymProgress = useMemo(
    () => getGymProgressMetrics(state.gym.sessions, todayISO()),
    [state.gym.sessions]
  );
  const activeExerciseMetric = gymProgress.exercises.find((exercise) => exercise.key === selectedExercise)
    || gymProgress.exercises[0]
    || null;
  const activeExercise = activeExerciseMetric?.exerciseName || '';

  const peso = currentWeight(state);
  const variacion = weightVariation(state);
  const imc = calcIMC(state);
  const imcCat = imcCategory(imc);
  const streakDetails = calcGymStreakDetails(state);
  const streak = streakDetails.streakDays;
  const isRestDayToday =
    (state.gym?.restDays || []).includes(todayISO()) ||
    Boolean(state.checkoutLog?.[todayISO()]?.trainedSkipped);
  const gymSessions = state.gym?.sessions;
  const sortedSessions = useMemo(() => {
    return [...(gymSessions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [gymSessions]);

  const latestSession = useMemo(() => {
    return sortedSessions.find(isPerformedGymSession) || null;
  }, [sortedSessions]);

  const todayCompletedSession = useMemo(
    () => sortedSessions.find((session) => session.date === todayISO() && isPerformedGymSession(session)) || null,
    [sortedSessions]
  );

  const todayPresentation = useMemo(
    () => todayCompletedSession
      ? buildGymSessionPresentation(todayCompletedSession, sortedSessions)
      : null,
    [sortedSessions, todayCompletedSession]
  );

  const isTrainedToday = (state.gym?.sessions || []).some(
    (s) => s.date === todayISO() && isPerformedGymSession(s)
  );

  const activeWorkoutSession = getActiveGymSession(state.gym);

  const staleActiveSessions = (state.gym?.sessions || []).filter(
    (s) => s.status === 'active' && s.id !== activeWorkoutSession?.id
  );

  const handleCompleteStaleSession = (sessionId: string) => {
    let result: ReturnType<typeof finishGymSession> | null = null;
    onUpdateState((draft) => {
      result = finishGymSession(draft.gym, sessionId, { finishedAt: 'Cerrada' });
    });
    if (result?.status === 'no_completed_sets') {
      showToast('Completá al menos una serie o descartá la sesión.', 'error');
      return;
    }
    showToast('Sesión anterior completada.', 'info');
  };

  const handleDiscardStaleSession = (sessionId: string) => {
    onUpdateState((draft) => {
      discardGymSession(draft.gym, sessionId);
    });
    showToast('Sesión descartada.', 'info');
  };

  const handleToggleRestDay = () => {
    const today = todayISO();
    onUpdateState((draft) => {
      if (!draft.gym) draft.gym = { sessions: [], exercises: [], routineTemplates: [], weight: [] } as any;
      if (!draft.gym.restDays) draft.gym.restDays = [];
      const idx = draft.gym.restDays.indexOf(today);
      if (idx >= 0) {
        draft.gym.restDays.splice(idx, 1);
        if (draft.checkoutLog?.[today]) {
          draft.checkoutLog[today].trainedSkipped = false;
        }
        showToast('Descanso cancelado. Racha regular.', 'info');
      } else {
        draft.gym.restDays.push(today);
        if (!draft.checkoutLog) draft.checkoutLog = {};
        if (!draft.checkoutLog[today]) draft.checkoutLog[today] = {};
        draft.checkoutLog[today].trainedSkipped = true;
        showToast('🛋️ Hoy marcado como descanso. Tu racha está protegida.');
      }
    });
  };

  const weightPts = sortedWeight(state);

  const bodyWeightChartData = weightPts.map((p) => ({
    dateLabel: fmtDate(p.date),
    rawDate: p.date,
    kg: p.kg,
  }));

  const bwVals = bodyWeightChartData.map((d) => d.kg);
  const bwMin = bwVals.length > 0 ? Math.max(0, Math.floor(Math.min(...bwVals) - 2)) : 50;
  const bwMax = bwVals.length > 0 ? Math.ceil(Math.max(...bwVals) + 2) : 100;

  const liftingChartData = activeExerciseMetric
    ? getExerciseHistory(state.gym?.sessions || [], {
        exerciseId: activeExerciseMetric.exerciseId,
        exerciseName: activeExerciseMetric.exerciseName,
      }).chartPoints.map((point) => ({
        dateLabel: fmtDate(point.date),
        rawDate: point.date,
        kg: point.maxWeight,
      }))
    : [];

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
    let result: ReturnType<typeof startGymSession> | null = null;
    onUpdateState((draft) => {
      result = startGymSession(draft.gym, {
        templateId,
        date: today,
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sessionId: uid(),
      });
    });
    setLiveExIdx(0);
    setLiveSetIdx(0);
    setActiveTab('entrenar');
    playSound('click');
    showToast(result?.created
      ? '🏋️ Entrenamiento iniciado con tu historial más reciente.'
      : 'Entrenamiento activo reanudado.');
  };

  const handleFinishWorkout = (sessionId: string) => {
    const sessionToFinish = state.gym.sessions.find((x) => x.id === sessionId);
    const finishTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let result: ReturnType<typeof finishGymSession> | null = null;
    onUpdateState((draft) => {
      result = finishGymSession(draft.gym, sessionId, { finishedAt: finishTime });
    });
    if (result?.status === 'no_completed_sets') {
      showToast('Completá al menos una serie antes de finalizar, o descartá la sesión.', 'error');
      return;
    }
    if (result?.status !== 'completed' || !sessionToFinish) return;

    const historicalPRs = calcDetailedPRs(state.gym.sessions, sessionId);
    const finishedSnapshot: GymSession = {
      ...sessionToFinish,
      status: 'completed',
      finishedAt: finishTime,
    };
    const summaryPayload = {
      session: finishedSnapshot,
      newPRs: detectSessionPRs(finishedSnapshot, historicalPRs),
    };
    playSound('success');
    setCompletedSummarySession(summaryPayload);
  };

  const handleAddSession = (overrideWeek?: string) => {
    let result: ReturnType<typeof startGymSession> | null = null;
    onUpdateState((draft) => {
      result = startGymSession(draft.gym, {
        date: sessionDate || todayISO(),
        weekLabel: overrideWeek || sessionWeekLabel.trim() || undefined,
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sessionId: uid(),
      });
    });
    setSessionWeekLabel('');
    showToast(result?.created ? 'Sesión iniciada.' : 'Ya existe una sesión activa; se reanudó esa sesión.');
  };

  const handleEditSessionWeek = (sessionId: string, weekLabel: string) => {
    onUpdateState((draft) => {
      updateGymSession(draft.gym, sessionId, { weekLabel });
    });
  };

  const handleEditSessionDate = (sessionId: string, date: string) => {
    onUpdateState((draft) => {
      updateGymSession(draft.gym, sessionId, { date });
    });
  };

  const handleDeleteSession = (id: string) => {
    const session = state.gym.sessions.find((candidate) => candidate.id === id);
    if (!session || !requestGymSessionDeletion(session, (message) => window.confirm(message))) return;
    onUpdateState((draft) => {
      deleteGymSession(draft.gym, id);
    });
    showToast('Sesión eliminada.', 'info');
  };

  // Exercise & Sets handlers
  const handleAddExerciseToSession = (
    sessionId: string,
    exName: string,
    muscleGroup?: MuscleGroup,
    equipment?: ExerciseEquipment,
    barWeight?: number,
    initialWeight = 20,
    initialReps = 10
  ) => {
    if (!exName.trim()) return;
    onUpdateState((draft) => {
      addExerciseToGymSession(draft.gym, sessionId, {
        name: exName,
        muscleGroup,
        equipment,
        barWeight,
        initialWeight,
        initialReps,
      });
    });
    showToast(`Ejercicio agregado: ${exName.trim()}`);
  };

  const handleAddSet = (sessionId: string, exerciseIndex: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      const ex = s?.exercises[exerciseIndex];
      addSetToGymSession(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex });
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
      const ex = s?.exercises[exerciseIndex];
      const result = updateGymSessionSet(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex }, setIndex, updates);
      if (result.justCompleted) {
          const targetEx = s?.exercises[exerciseIndex];
          const targetSet = targetEx?.sets[setIndex];
          playSound('success');
          if (s && targetEx && targetSet && targetEx.timerEnabled !== false) {
            const durationSeconds = targetEx.restSeconds || 90;
            draft.gym.activeTimer = {
              endsAt: Date.now() + durationSeconds * 1000,
              durationSeconds,
              sessionId: s.id,
              exerciseId: targetEx.id,
              setId: targetSet.id,
            };
          }
      }
    });
  };

  const handleDeleteSet = (sessionId: string, exerciseIndex: number, setIndex: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      const ex = s?.exercises[exerciseIndex];
      deleteGymSessionSet(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex }, setIndex);
    });
  };

  const handleDeleteExercise = (sessionId: string, exerciseIndex: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      const ex = s?.exercises[exerciseIndex];
      deleteGymSessionExercise(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex });
    });
  };

  const handleUpdateExerciseBar = (sessionId: string, exerciseIndex: number, barWeight: number) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      const ex = s?.exercises[exerciseIndex];
      updateGymSessionExercise(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex }, { barWeight });
    });
  };

  const handleUpdateExerciseEquipment = (
    sessionId: string,
    exerciseIndex: number,
    equipment: ExerciseEquipment,
    barWeight?: number
  ) => {
    onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      const ex = s?.exercises[exerciseIndex];
      updateGymSessionExercise(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex }, { equipment, barWeight });
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
    const template = state.gym.routineTemplates.find((candidate) => candidate.id === id);
    if (!template || !window.confirm(`¿Eliminar la plantilla "${template.name}"? El historial no se eliminará.`)) return;
    onUpdateState((draft) => {
      deleteGymTemplate(draft.gym, id);
    });
    if (editingTemplateId === id) setEditingTemplateId(null);
    showToast('Plantilla eliminada.', 'info');
  };

  const handleDuplicateTemplate = (id: string) => {
    let duplicateId: string | null = null;
    onUpdateState((draft) => {
      duplicateId = duplicateGymTemplate(draft.gym, id)?.id || null;
    });
    if (!duplicateId) return;
    setEditingTemplateId(duplicateId);
    showToast('Plantilla duplicada con identidad independiente.');
  };

  const handleToggleTemplateDay = (templateId: string, day: DayKey) => {
    onUpdateState((draft) => {
      const template = draft.gym.routineTemplates.find((candidate) => candidate.id === templateId);
      if (!template) return;
      const currentDays = template.days || [];
      updateGymTemplate(draft.gym, templateId, {
        days: currentDays.includes(day)
          ? currentDays.filter((candidate) => candidate !== day)
          : [...currentDays, day],
      });
    });
  };

  const handleSaveSessionAsTemplate = (session: GymSession) => {
    const defaultName = session.weekLabel ? `Rutina ${session.weekLabel}` : `Rutina del ${fmtDate(session.date)}`;
    const name = window.prompt('Nombre para la nueva plantilla de rutina:', defaultName);
    if (!name || !name.trim()) return;

    onUpdateState((draft) => {
      draft.gym.routineTemplates.push({
        id: uid(),
        name: name.trim(),
        exercises: session.exercises.map((ex) => {
          const eq = ex.equipment || inferExerciseEquipment(ex.name).equipment;
          return {
            id: uid(),
            name: ex.name,
            equipment: eq,
            muscleGroup: ex.muscleGroup,
            barWeight: eq === 'barra' ? (ex.barWeight ?? 20) : 0,
            restSeconds: ex.restSeconds || 90,
            timerEnabled: true,
            sets: ex.sets.map((s) => ({
              id: uid(),
              weight: s.weight,
              reps: s.reps,
              completed: false,
            })),
          };
        }),
      });
    });
    showToast('Plantilla guardada a partir de la sesión.');
  };

  const handleUpdateTemplateExercise = (
    templateId: string,
    exerciseIndex: number,
    updates: Partial<Exercise>
  ) => {
    onUpdateState((draft) => {
      const t = draft.gym.routineTemplates.find((x) => x.id === templateId);
      const exercise = t?.exercises[exerciseIndex];
      updateGymTemplateExercise(draft.gym, templateId, {
        exerciseId: exercise?.id,
        exerciseIndex,
      }, updates);
    });
  };

  const handleConfigureTemplateExercise = (
    templateId: string,
    exerciseIndex: number,
    input: { setsCount: number; reps: number; targetWeight: number; restSeconds: number }
  ) => {
    onUpdateState((draft) => {
      const template = draft.gym.routineTemplates.find((candidate) => candidate.id === templateId);
      const exercise = template?.exercises[exerciseIndex];
      configureGymTemplateExercise(draft.gym, templateId, {
        exerciseId: exercise?.id,
        exerciseIndex,
      }, input);
    });
  };

  const handleReorderTemplateExercise = (templateId: string, exerciseIndex: number, toIndex: number) => {
    onUpdateState((draft) => {
      const template = draft.gym.routineTemplates.find((candidate) => candidate.id === templateId);
      const exercise = template?.exercises[exerciseIndex];
      reorderGymTemplateExercise(draft.gym, templateId, {
        exerciseId: exercise?.id,
        exerciseIndex,
      }, toIndex);
    });
  };

  const handleDeleteExerciseFromTemplate = (templateId: string, exerciseIndex: number) => {
    onUpdateState((draft) => {
      const t = draft.gym.routineTemplates.find((x) => x.id === templateId);
      const exercise = t?.exercises[exerciseIndex];
      deleteGymTemplateExercise(draft.gym, templateId, {
        exerciseId: exercise?.id,
        exerciseIndex,
      });
    });
    showToast('Ejercicio eliminado de la plantilla.', 'info');
  };

  const handleAddExerciseToTemplate = (
    templateId: string,
    name: string,
    muscleGroup?: MuscleGroup,
    equipment?: ExerciseEquipment,
    barWeight?: number,
    setsCount = 3,
    reps = 10,
    weight = 20
  ) => {
    if (!name.trim()) return;
    const inferred = inferExerciseEquipment(name);
    const eq = equipment || inferred.equipment;
    const barW = eq === 'barra' ? (barWeight !== undefined ? barWeight : inferred.barWeight) : 0;
    const group = muscleGroup || inferMuscleGroup(name);
    const newSets: GymSet[] = Array.from({ length: setsCount }, () => ({
      id: uid(),
      weight,
      reps,
      completed: false,
    }));

    onUpdateState((draft) => {
      const t = draft.gym.routineTemplates.find((x) => x.id === templateId);
      if (t) {
        t.exercises.push({
          id: uid(),
          name: name.trim(),
          equipment: eq,
          muscleGroup: group,
          barWeight: barW,
          restSeconds: 90,
          timerEnabled: true,
          sets: newSets,
          weight,
        });
      }
    });
    showToast(`Ejercicio agregado a plantilla: ${name.trim()}`);
  };

  const handleNormalizeAllHistory = () => {
    const preview = previewNormalizeGymHistory(state.gym);
    if (preview.affectedSessionIds.length === 0) {
      showToast('El historial completado ya está normalizado.', 'info');
      return;
    }
    if (!window.confirm(
      `Se corregirán ${preview.affectedExerciseCount} ejercicios en ${preview.affectedSessionIds.length} sesiones completadas. ¿Continuar?`
    )) return;
    onUpdateState((draft) => {
      const current = previewNormalizeGymHistory(draft.gym);
      draft.gym.sessions = current.updatedSessions;
    });
    showToast(`🪄 Historial normalizado: ${preview.affectedExerciseCount} ejercicios corregidos.`);
  };

  const handlePropagateExerciseToHistory = (
    exerciseName: string,
    config: { equipment: ExerciseEquipment; barWeight: number; muscleGroup?: MuscleGroup | string }
  ) => {
    const preview = previewExerciseHistoryPropagation(state.gym, exerciseName, config);
    if (preview.affectedSessionIds.length === 0) {
      showToast(`El historial completado de "${exerciseName}" ya usa esta configuración.`, 'info');
      return;
    }
    if (!window.confirm(
      `Se actualizará "${exerciseName}" en ${preview.affectedSessionIds.length} sesiones completadas. ¿Continuar?`
    )) return;
    onUpdateState((draft) => {
      const current = previewExerciseHistoryPropagation(draft.gym, exerciseName, config);
      draft.gym.sessions = current.updatedSessions;
      draft.gym.routineTemplates = current.updatedTemplates;
    });
    showToast(`⚡ "${exerciseName}" propagado a ${preview.affectedSessionIds.length} sesiones históricas.`);
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
  const liveGhost = liveCurrentEx
    ? getExerciseGhostValues(state.gym.sessions, {
        exerciseId: liveCurrentEx.id,
        exerciseName: liveCurrentEx.name,
      }, activeWorkoutSession?.id)
    : null;
  const livePreviousSet = liveGhost?.sets[liveSafeSetIdx] || null;
  const livePreviousSessionBest = activeWorkoutSession && liveCurrentEx
    ? getPreviousExerciseStats(state.gym.sessions, activeWorkoutSession.id, liveCurrentEx.name, liveCurrentEx.id)
    : null;

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
      {/* La sesión activa usa su propio encabezado operativo para priorizar el primer viewport móvil. */}
      {!(activeWorkoutSession && activeTab === 'entrenar') && (
        <PageHeader
          title="Gimnasio"
          subtitle="Entrená, revisá tu historial y entendé tu progreso."
          actions={
            !activeWorkoutSession && activeTab !== 'entrenar' ? (
            <div className="flex items-center gap-2 flex-wrap">
              {state.gym.routineTemplates.length > 0 && (
                <select
                  value={sessionTemplate}
                  onChange={(e) => setSessionTemplate(e.target.value)}
                  className="min-h-11 px-3 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer outline-none"
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
                className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--blue)] px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-[var(--blue-hover)] active:scale-[0.98] cursor-pointer"
              >
                <AppIcon name="dumbbell" className="h-3.5 w-3.5" />
                <span>Iniciar entrenamiento</span>
              </button>
            </div>
            ) : undefined
          }
        />
      )}

      {/* Main Navigation Segmented Tabs */}
      {!(activeWorkoutSession && activeTab === 'entrenar') && (
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1.5 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('entrenar')}
          className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-xs font-bold transition-all cursor-pointer sm:px-3 ${
            activeTab === 'entrenar'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="dumbbell" className="h-4 w-4" />
          <span className="sm:hidden">Hoy</span>
          <span className="hidden truncate sm:inline">{activeWorkoutSession ? 'Entrenamiento activo' : 'Entrenar hoy'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('historial')}
          className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-xs font-bold transition-all cursor-pointer sm:px-3 ${
            activeTab === 'historial'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="calendar" className="h-4 w-4" />
          <span className="sm:hidden">Historial</span>
          <span className="hidden truncate sm:inline">Historial</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
            {state.gym.sessions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('progresion')}
          className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-xs font-bold transition-all cursor-pointer sm:px-3 ${
            activeTab === 'progresion'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="activity" className="h-4 w-4" />
          <span className="sm:hidden">Progreso</span>
          <span className="hidden truncate sm:inline">{activeWorkoutSession ? 'Progreso' : 'Progresión y salud'}</span>
        </button>
      </div>
      )}

      {activeWorkoutSession && state.gym.activeTimer && activeTab !== 'entrenar' && (
        <GymRestTimerBar
          state={state}
          onUpdateState={onUpdateState}
        />
      )}

      {/* TAB 1: ENTRENAR (MODO EN VIVO / HOY) */}
      {activeTab === 'entrenar' && (
        <div className="space-y-6 animate-in fade-in">
          {/* ACTIVE WORKOUT LIVE CONSOLE (COCKPIT MÓVIL) */}
          {activeWorkoutSession ? (
            <ActiveWorkoutView
              session={activeWorkoutSession}
              exerciseIndex={liveSafeExIdx}
              setIndex={liveSafeSetIdx}
              previousSet={livePreviousSet}
              previousSessionBest={livePreviousSessionBest}
              exerciseSuggestions={COMMON_EXERCISE_SUGGESTIONS}
              restTimer={
                state.gym.activeTimer ? (
                  <GymRestTimerBar
                    state={state}
                    onUpdateState={onUpdateState}
                  />
                ) : undefined
              }
              onSelectExercise={setLiveExIdx}
              onSelectSet={setLiveSetIdx}
              onAdjustWeight={handleLiveAdjustWeight}
              onAdjustReps={handleLiveAdjustReps}
              onUpdateCurrentSet={(updates) =>
                handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, liveSafeSetIdx, updates)
              }
              onToggleCurrentSet={handleLiveCompleteCurrentSet}
              onAddSet={(exerciseIndex) => handleAddSet(activeWorkoutSession.id, exerciseIndex)}
              onDeleteSet={(exerciseIndex, setIndex) =>
                handleDeleteSet(activeWorkoutSession.id, exerciseIndex, setIndex)
              }
              onAddExercise={({ name, muscleGroup, equipment, barWeight, initialWeight, initialReps }) =>
                handleAddExerciseToSession(
                  activeWorkoutSession.id,
                  name,
                  muscleGroup,
                  equipment,
                  barWeight,
                  initialWeight,
                  initialReps
                )
              }
              onDeleteExercise={(exerciseIndex) =>
                handleDeleteExercise(activeWorkoutSession.id, exerciseIndex)
              }
              onUpdateEquipment={(exerciseIndex, equipment, barWeight) =>
                handleUpdateExerciseEquipment(activeWorkoutSession.id, exerciseIndex, equipment, barWeight)
              }
              onUpdateBarWeight={(exerciseIndex, barWeight) =>
                handleUpdateExerciseBar(activeWorkoutSession.id, exerciseIndex, barWeight)
              }
              onPropagateExercise={handlePropagateExerciseToHistory}
              onOpenCalculator={(exerciseIndex, setIndex, initialWeight, barWeight) =>
                setCalculatorTarget({
                  sessionId: activeWorkoutSession.id,
                  exerciseIndex,
                  setIndex,
                  initialWeight,
                  barWeight,
                })
              }
              onOpenHistory={setHistoryExercise}
              onOpenHistoryTab={() => setActiveTab('historial')}
              onOpenProgressTab={() => setActiveTab('progresion')}
              onFinish={() => handleFinishWorkout(activeWorkoutSession.id)}
              onDeleteSession={() => handleDeleteSession(activeWorkoutSession.id)}
              onSaveAsTemplate={() => handleSaveSessionAsTemplate(activeWorkoutSession)}
              onEditSessionDate={(date) => handleEditSessionDate(activeWorkoutSession.id, date)}
              onEditSessionWeek={(weekLabel) => handleEditSessionWeek(activeWorkoutSession.id, weekLabel)}
            />
          ) : (
            /* NO ACTIVE WORKOUT: TODAY LAUNCHER */
            <div className="space-y-6">
              {/* Today's Gym Status */}
              <section
                data-gym-today-status
                className="relative overflow-hidden rounded-3xl bg-[var(--card)] shadow-sm ring-1 ring-inset ring-[var(--border)]"
              >
                <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-blue-500/[0.07] blur-2xl" />
                <div className="relative grid lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 px-5 py-5 sm:px-6 sm:py-6">
                    <div className="flex items-start gap-3">
                      {isTrainedToday && (
                        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                          <AppIcon name="check" className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-soft)]">
                          {isTrainedToday ? 'Sesión de hoy completada' : 'Entrenar hoy'}
                        </p>
                        <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl">
                          {isTrainedToday
                            ? todayPresentation?.name || 'Entrenamiento completado'
                            : isRestDayToday
                            ? 'Día de descanso activo'
                            : sessionTemplate
                            ? state.gym.routineTemplates.find((template) => template.id === sessionTemplate)?.name || 'Rutina personalizada'
                            : 'Listo para entrenar'}
                        </h2>
                        {!isTrainedToday && (
                          <p className="mt-1 text-sm leading-5 text-[var(--text-soft)]">
                            {isRestDayToday
                              ? 'Racha protegida para priorizar recuperación.'
                              : `${state.gym.routineTemplates.length} rutina${state.gym.routineTemplates.length === 1 ? '' : 's'} lista${state.gym.routineTemplates.length === 1 ? '' : 's'} · Racha de ${streak} días`}
                          </p>
                        )}
                      </div>
                    </div>

                    {todayPresentation && (
                      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] sm:items-end">
                        <div className="col-span-2 sm:col-span-1">
                          <dt className="text-[11px] font-semibold text-[var(--text-faint)]">Volumen total</dt>
                          <dd className="mt-1 text-3xl font-black tracking-tight tabular-nums text-[var(--text)] sm:text-4xl">
                            {todayPresentation.volumeKg.toLocaleString('es-UY')}
                            <span className="ml-1.5 text-sm font-semibold text-[var(--text-soft)]">kg</span>
                          </dd>
                        </div>
                        {[
                          ['Ejercicios', todayPresentation.exerciseCount],
                          ['Series', todayPresentation.completedSetCount],
                          ...(todayPresentation.durationLabel
                            ? [['Duración', todayPresentation.durationLabel] as [string, string | number]]
                            : []),
                          ...(todayPresentation.prExerciseCount > 0
                            ? [['Mejores marcas', `${todayPresentation.prExerciseCount} PR${todayPresentation.prExerciseCount === 1 ? '' : 's'}`] as [string, string | number]]
                            : []),
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-[11px] font-semibold text-[var(--text-faint)]">{label}</dt>
                            <dd className={`mt-1 text-xl font-black tabular-nums ${label === 'Mejores marcas' ? 'text-amber-600 dark:text-amber-300' : 'text-[var(--text)]'}`}>
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  <div className="flex w-full flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)]/55 p-4 sm:flex-row sm:items-center lg:w-72 lg:flex-col lg:items-stretch lg:justify-center lg:border-l lg:border-t-0 lg:p-5">
                    {state.gym.routineTemplates.length > 0 && (
                      <select
                        aria-label="Plantilla para el próximo entrenamiento"
                        value={sessionTemplate}
                        onChange={(event) => setSessionTemplate(event.target.value)}
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)] outline-none focus:border-[var(--blue)] lg:w-full"
                      >
                        <option value="">Entrenamiento en blanco</option>
                        {state.gym.routineTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    )}

                    {!isTrainedToday && (
                      <button
                        type="button"
                        onClick={handleToggleRestDay}
                        className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--text-soft)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                      >
                        {isRestDayToday ? 'Cancelar descanso' : 'Descanso hoy'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleStartWorkout(sessionTemplate || undefined)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--blue)] px-4 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[var(--blue-hover)] active:scale-[0.98]"
                    >
                      <AppIcon name="dumbbell" className="h-4 w-4" />
                      <span>{isTrainedToday ? 'Iniciar otro entrenamiento' : 'Iniciar entrenamiento'}</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Routine Templates Manager */}
              <section data-gym-routines className="space-y-4 py-2">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-soft)]">Tu biblioteca</p>
                      <h2 className="mt-0.5 text-lg font-black tracking-tight text-[var(--text)]">Rutinas</h2>
                      <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                        {state.gym.routineTemplates.length} rutina{state.gym.routineTemplates.length === 1 ? '' : 's'} preparada{state.gym.routineTemplates.length === 1 ? '' : 's'} para entrenar
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTemplates((v) => !v)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <AppIcon name={showTemplates ? 'x' : 'plus'} className="h-4 w-4" />
                    {showTemplates ? 'Cancelar' : 'Nueva rutina'}
                  </button>
                </div>

                {showTemplates && (
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-3 animate-in fade-in sm:p-4">
                    <form onSubmit={handleAddTemplate} className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        aria-label="Nombre de la nueva rutina"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Ej. Empuje"
                        className="min-h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
                      />
                      <button
                        type="submit"
                        className="min-h-11 rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--bg-elevated)] hover:opacity-90"
                      >
                        Crear rutina
                      </button>
                    </form>
                  </div>
                )}

                <div className="overflow-visible rounded-3xl bg-[var(--card)] shadow-sm ring-1 ring-inset ring-[var(--border)]">
                  {state.gym.routineTemplates.length === 0 && !showTemplates && (
                    <p className="px-5 py-7 text-sm text-[var(--text-soft)]">
                      Creá una rutina para iniciar entrenamientos con ejercicios y descansos preparados.
                    </p>
                  )}
                  {state.gym.routineTemplates.map((t) => {
                    const isEditing = editingTemplateId === t.id;
                    const identity = getRoutineIdentity(t.exercises, t.name);
                    return (
                      <article key={t.id} className="border-b border-[var(--border)] last:border-b-0">
                        <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                          <div className="flex min-w-0 items-center gap-3 sm:contents">
                            <RoutineIdentityMark exercises={t.exercises} name={t.name} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-base font-black tracking-tight text-[var(--text)]">{t.name}</h3>
                                <span className={`text-[10px] font-semibold ${identity.accent}`}>{identity.label}</span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                                {t.exercises.length} ejercicio{t.exercises.length === 1 ? '' : 's'}
                                {t.days?.length ? ` · ${t.days.map((day) => DAY_LABELS[day].slice(0, 3)).join(', ')}` : ' · Sin días asignados'}
                              </p>
                              {t.exercises.length > 0 && (
                                <p className="mt-1 hidden truncate text-xs text-[var(--text-faint)] sm:block">
                                  {t.exercises.slice(0, 3).map((exercise) => exercise.name).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5 sm:flex sm:items-center">
                            <button
                              type="button"
                              onClick={() => handleStartWorkout(t.id)}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--blue)] px-4 text-sm font-bold text-white shadow-xs hover:bg-[var(--blue-hover)]"
                            >
                              <AppIcon name="play" className="h-4 w-4" />
                              Iniciar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTemplateId(isEditing ? null : t.id)}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
                            >
                              <AppIcon name="edit" className="h-4 w-4 text-[var(--text-soft)]" />
                              {isEditing ? 'Cerrar' : 'Editar'}
                            </button>
                            <details className="group relative">
                              <summary aria-label={`Más acciones para ${t.name}`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--surface-muted)]">
                                <AppIcon name="more" className="h-5 w-5" />
                              </summary>
                              <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl">
                                <button type="button" onClick={() => handleDuplicateTemplate(t.id)} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]">
                                  Duplicar rutina
                                </button>
                                <button type="button" onClick={() => handleDeleteTemplate(t.id)} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
                                  Eliminar rutina
                                </button>
                              </div>
                            </details>
                          </div>
                        </div>

                        {isEditing && (
                          <div data-gym-routine-editor className="space-y-6 border-t border-[var(--border)] bg-[var(--card-subtle)] p-4 animate-in fade-in sm:p-6">
                            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_1.1fr]">
                              <label className="block text-xs font-semibold text-[var(--text-soft)]">
                                Nombre de la rutina
                                <input
                                  type="text"
                                  value={t.name}
                                  onChange={(event) => onUpdateState((draft) => {
                                    updateGymTemplate(draft.gym, t.id, { name: event.target.value });
                                  })}
                                  className="mt-1.5 min-h-11 w-full rounded-xl border border-transparent bg-[var(--card)] px-3 text-base font-bold text-[var(--text)] shadow-xs outline-none focus:border-[var(--blue)]"
                                />
                              </label>
                              <div>
                                <p className="text-xs font-semibold text-[var(--text-soft)]">Días de entrenamiento</p>
                                <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:flex" aria-label="Días de rutina">
                                    {DAYS.map((day) => {
                                      const selected = t.days?.includes(day) || false;
                                      return (
                                        <button
                                          key={day}
                                          type="button"
                                          aria-pressed={selected}
                                          onClick={() => handleToggleTemplateDay(t.id, day)}
                                          className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${selected
                                            ? 'bg-blue-500/12 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300'
                                            : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                                          }`}
                                        >
                                          {DAY_LABELS[day].slice(0, 3)}
                                        </button>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>

                            {t.exercises.length === 0 ? (
                              <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-5 text-sm text-[var(--text-soft)]">
                                Agregá el primer ejercicio de esta rutina.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {t.exercises.map((ex, exIdx) => {
                                  const exEq = ex.equipment || (ex.barWeight && ex.barWeight > 0 ? 'barra' : 'mancuerna');
                                  return (
                                    <section key={ex.id || exIdx} className="rounded-2xl bg-[var(--card)] p-3 shadow-xs ring-1 ring-inset ring-[var(--border)] sm:p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xs font-black tabular-nums text-[var(--blue)]">
                                            {String(exIdx + 1).padStart(2, '0')}
                                          </span>
                                          <div className="min-w-0">
                                            <h4 className="truncate text-sm font-bold text-[var(--text)]">{ex.name}</h4>
                                            <p className="mt-0.5 text-xs text-[var(--text-soft)]">{ex.muscleGroup || 'Sin grupo muscular'}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                disabled={exIdx === 0}
                                                onClick={() => handleReorderTemplateExercise(t.id, exIdx, exIdx - 1)}
                                                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--card)] disabled:opacity-25"
                                                aria-label={`Subir ${ex.name}`}
                                              >
                                                <AppIcon name="arrowUp" className="h-4 w-4" />
                                              </button>
                                              <button
                                                type="button"
                                                disabled={exIdx === t.exercises.length - 1}
                                                onClick={() => handleReorderTemplateExercise(t.id, exIdx, exIdx + 1)}
                                                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-soft)] hover:bg-[var(--card)] disabled:opacity-25"
                                                aria-label={`Bajar ${ex.name}`}
                                              >
                                                <AppIcon name="arrowUp" className="h-4 w-4 rotate-180" />
                                              </button>
                                        </div>
                                      </div>

                                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            <label className="text-xs font-medium text-[var(--text-soft)]">
                                              Series
                                              <input
                                                type="number"
                                                min={1}
                                                max={20}
                                                value={ex.sets.length || 1}
                                                onChange={(event) => handleConfigureTemplateExercise(t.id, exIdx, {
                                                  setsCount: Number(event.target.value),
                                                  reps: ex.sets[0]?.reps || 10,
                                                  targetWeight: ex.sets[0]?.weight ?? ex.weight ?? 0,
                                                  restSeconds: ex.restSeconds || 90,
                                                })}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              />
                                            </label>
                                            <label className="text-xs font-medium text-[var(--text-soft)]">
                                              Reps
                                              <input
                                                type="number"
                                                min={1}
                                                max={1000}
                                                value={ex.sets[0]?.reps || 10}
                                                onChange={(event) => handleConfigureTemplateExercise(t.id, exIdx, {
                                                  setsCount: ex.sets.length || 1,
                                                  reps: Number(event.target.value),
                                                  targetWeight: ex.sets[0]?.weight ?? ex.weight ?? 0,
                                                  restSeconds: ex.restSeconds || 90,
                                                })}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              />
                                            </label>
                                            <label className="text-xs font-medium text-[var(--text-soft)]">
                                              Objetivo (kg)
                                              <input
                                                type="number"
                                                min={0}
                                                step="0.5"
                                                value={ex.sets[0]?.weight ?? ex.weight ?? 0}
                                                onChange={(event) => handleConfigureTemplateExercise(t.id, exIdx, {
                                                  setsCount: ex.sets.length || 1,
                                                  reps: ex.sets[0]?.reps || 10,
                                                  targetWeight: Number(event.target.value),
                                                  restSeconds: ex.restSeconds || 90,
                                                })}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              />
                                            </label>
                                            <label className="text-xs font-medium text-[var(--text-soft)]">
                                              Descanso (s)
                                              <input
                                                type="number"
                                                min={15}
                                                max={600}
                                                step={15}
                                                value={ex.restSeconds || 90}
                                                onChange={(event) => handleConfigureTemplateExercise(t.id, exIdx, {
                                                  setsCount: ex.sets.length || 1,
                                                  reps: ex.sets[0]?.reps || 10,
                                                  targetWeight: ex.sets[0]?.weight ?? ex.weight ?? 0,
                                                  restSeconds: Number(event.target.value),
                                                })}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              />
                                            </label>
                                      </div>
                                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <select
                                              aria-label={`Equipamiento de ${ex.name}`}
                                              value={exEq}
                                              onChange={(e) => {
                                                const eq = e.target.value as ExerciseEquipment;
                                                const bw = eq === 'barra' ? 20 : 0;
                                                handleUpdateTemplateExercise(t.id, exIdx, { equipment: eq, barWeight: bw });
                                              }}
                                              className="min-h-11 flex-1 rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                            >
                                              <option value="barra">Barra</option>
                                              <option value="mancuerna">Mancuerna</option>
                                              <option value="polea">Polea</option>
                                              <option value="maquina">Máquina</option>
                                              <option value="corporal">Peso corporal</option>
                                            </select>

                                            {exEq === 'barra' && (
                                              <select
                                                aria-label={`Peso de barra de ${ex.name}`}
                                                value={ex.barWeight ?? 20}
                                                onChange={(e) =>
                                                  handleUpdateTemplateExercise(t.id, exIdx, { barWeight: Number(e.target.value) })
                                                }
                                                className="min-h-11 rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              >
                                                <option value={20}>20 kg</option>
                                                <option value={15}>15 kg</option>
                                                <option value={10}>10 kg</option>
                                              </select>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => handleDeleteExerciseFromTemplate(t.id, exIdx)}
                                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                                            >
                                              <AppIcon name="trash" className="h-4 w-4" />
                                              Eliminar
                                            </button>
                                      </div>
                                    </section>
                                  );
                                })}
                              </div>
                            )}

                            <TemplateAddExerciseForm
                              onAdd={(name, muscle, equipment, barWeight) =>
                                handleAddExerciseToTemplate(t.id, name, muscle, equipment, barWeight)
                              }
                            />
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* Latest Session Card (Quick Glance) */}
              {latestSession && (
                <section className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-soft)]">Actividad reciente</p>
                      <h2 className="mt-0.5 text-lg font-black tracking-tight text-[var(--text)]">
                        Última sesión
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('historial')}
                      className="min-h-11 rounded-lg px-2 text-sm font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      Ver historial
                    </button>
                  </div>
                  <LatestWorkoutSession
                    session={latestSession}
                    allSessions={sortedSessions}
                    onFinishWorkout={() => handleFinishWorkout(latestSession.id)}
                    onDeleteSession={() => handleDeleteSession(latestSession.id)}
                    onEditSessionDate={(d) => handleEditSessionDate(latestSession.id, d)}
                    onEditSessionWeek={(w) => handleEditSessionWeek(latestSession.id, w)}
                    onSaveAsTemplate={() => handleSaveSessionAsTemplate(latestSession)}
                    onAddExercise={(name, muscle, eq, barW, w, r) =>
                      handleAddExerciseToSession(latestSession.id, name, muscle, eq, barW, w, r)
                    }
                    onDeleteExercise={(exIdx) => handleDeleteExercise(latestSession.id, exIdx)}
                    onAddSet={(exIdx) => handleAddSet(latestSession.id, exIdx)}
                    onUpdateSet={(exIdx, setIdx, updates) =>
                      handleUpdateSet(latestSession.id, exIdx, setIdx, updates)
                    }
                    onDeleteSet={(exIdx, setIdx) => handleDeleteSet(latestSession.id, exIdx, setIdx)}
                    onUpdateExerciseBar={(exIdx, barW) =>
                      handleUpdateExerciseBar(latestSession.id, exIdx, barW)
                    }
                    onUpdateExerciseEquipment={(exIdx, eq, barW) =>
                      handleUpdateExerciseEquipment(latestSession.id, exIdx, eq, barW)
                    }
                    onPropagateExercise={(name, config) =>
                      handlePropagateExerciseToHistory(name, config)
                    }
                    onOpenCalculator={(exIdx, setIdx, initialW, barW) =>
                      setCalculatorTarget({
                        sessionId: latestSession.id,
                        exerciseIndex: exIdx,
                        setIndex: setIdx,
                        initialWeight: initialW,
                        barWeight: barW,
                      })
                    }
                    onOpenHistory={setHistoryExercise}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORIAL DE SEMANAS */}
      {activeTab === 'historial' && (
        <div className="space-y-6 animate-in fade-in">
          {staleActiveSessions.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Tenés {staleActiveSessions.length} sesión(es) de fechas anteriores sin finalizar</span>
                </span>
                <span className="text-[11px] text-[var(--text-soft)]">No bloquean tu entrenamiento de hoy</span>
              </div>
              <div className="space-y-1.5">
                {staleActiveSessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs bg-[var(--card)] p-2.5 rounded-xl border border-[var(--border)]">
                    <span className="font-mono font-bold text-[var(--text)]">
                      {fmtDate(s.date)} — {s.exercises.length} ejercicio(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCompleteStaleSession(s.id)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                      >
                        Finalizar sesión ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscardStaleSession(s.id)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Secondary creation and maintenance actions stay out of the reading flow. */}
          <details className="group border-y border-[var(--border)]">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 text-sm font-semibold text-[var(--text)]">
              <span>Cargar una sesión pasada</span>
              <AppIcon name="chevronDown" className="h-4 w-4 text-[var(--text-soft)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-3 border-t border-[var(--border)] py-4 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-[var(--text-soft)]">
                Fecha de la sesión
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
                />
              </label>
              <button
                type="button"
                onClick={() => handleAddSession()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--bg-elevated)] hover:opacity-90"
              >
                Crear sesión
              </button>
              <button
                type="button"
                onClick={handleNormalizeAllHistory}
                className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                title="Revisa el equipamiento y los pesos de barra del historial"
              >
                Revisar datos históricos
              </button>
            </div>
          </details>

          {/* Recent Weeks */}
          {gymHistory.recentWeeks.length === 0 ? (
            <div className="p-8 text-center bg-[var(--card)] border border-[var(--border)] rounded-2xl text-xs text-[var(--text-faint)]">
              Todavía no tenés sesiones registradas. Iniciá una sesión desde la pestaña "Entrenar Hoy".
            </div>
          ) : (
            gymHistory.recentWeeks.map((week) => (
              <section key={week.key} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                  <h2 className="text-sm font-bold text-[var(--text)]">{week.weekName}</h2>
                  <p className="text-xs text-[var(--text-soft)]">
                    {week.rangeLabel} · {week.sessions.length} sesión{week.sessions.length === 1 ? '' : 'es'}
                  </p>
                </div>

                <div className="space-y-3">
                  {week.sessions.map((session) => (
                    <LatestWorkoutSession
                      key={session.id}
                      session={session}
                      allSessions={state.gym.sessions}
                      onFinishWorkout={() => handleFinishWorkout(session.id)}
                      onDeleteSession={() => handleDeleteSession(session.id)}
                      onEditSessionDate={(d) => handleEditSessionDate(session.id, d)}
                      onEditSessionWeek={(w) => handleEditSessionWeek(session.id, w)}
                      onSaveAsTemplate={() => handleSaveSessionAsTemplate(session)}
                      onAddExercise={(name, muscle, eq, barW, w, r) =>
                        handleAddExerciseToSession(session.id, name, muscle, eq, barW, w, r)
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
                      onUpdateExerciseEquipment={(exIdx, eq, barW) =>
                        handleUpdateExerciseEquipment(session.id, exIdx, eq, barW)
                      }
                      onPropagateExercise={(name, config) =>
                        handlePropagateExerciseToHistory(name, config)
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
                      onOpenHistory={setHistoryExercise}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {/* Archived Older Months */}
          {gymHistory.archivedMonths.length > 0 && (
            <div className="space-y-2 pt-4">
              <h3 className="text-xs font-semibold text-[var(--text-soft)]">
                Historial anterior
              </h3>
              {gymHistory.archivedMonths.map((month) => (
                <details
                  key={month.key}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-2xs"
                >
                  <summary className="flex cursor-pointer items-center justify-between p-4 list-none hover:bg-[var(--surface-muted)] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text)]">{month.label}</span>
                      <span className="text-xs font-semibold text-[var(--text-soft)]">
                        {month.sessionsCount} sesiones
                      </span>
                    </div>
                    <span className="text-xs text-[var(--blue)] font-bold group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </summary>

                  <div className="p-4 pt-0 space-y-4 border-t border-[var(--border)] mt-2">
                    {month.weeks.flatMap((w) => w.sessions).map((session) => (
                      <LatestWorkoutSession
                        key={session.id}
                        session={session}
                        allSessions={state.gym.sessions}
                        onFinishWorkout={() => handleFinishWorkout(session.id)}
                        onDeleteSession={() => handleDeleteSession(session.id)}
                        onEditSessionDate={(d) => handleEditSessionDate(session.id, d)}
                        onEditSessionWeek={(w) => handleEditSessionWeek(session.id, w)}
                        onSaveAsTemplate={() => handleSaveSessionAsTemplate(session)}
                        onAddExercise={(name, muscle, eq, barW, w, r) =>
                          handleAddExerciseToSession(session.id, name, muscle, eq, barW, w, r)
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
                        onUpdateExerciseEquipment={(exIdx, eq, barW) =>
                          handleUpdateExerciseEquipment(session.id, exIdx, eq, barW)
                        }
                        onPropagateExercise={(name, config) =>
                          handlePropagateExerciseToHistory(name, config)
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
                        onOpenHistory={setHistoryExercise}
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
        <div className="space-y-7 animate-in fade-in">
          <section data-gym-progress-overview className="relative overflow-hidden rounded-3xl bg-[var(--card)] shadow-sm ring-1 ring-inset ring-[var(--border)]">
            <span className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-blue-500/[0.08] blur-2xl" />
            <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-[var(--blue)]">
                  <AppIcon name="activity" className="h-4 w-4" />
                  <p className="text-xs font-bold">Frecuencia reciente</p>
                </div>
                <p className="mt-3 flex items-end gap-2 text-[var(--text)]">
                  <span className="text-6xl font-black leading-none tracking-[-0.06em] tabular-nums sm:text-7xl">
                    {gymProgress.frequency.last7Days.workoutCount}
                  </span>
                  <span className="pb-1 text-base font-semibold leading-tight text-[var(--text-soft)]">
                    sesión{gymProgress.frequency.last7Days.workoutCount === 1 ? '' : 'es'}<br />en 7 días
                  </span>
                </p>
                <p className="mt-3 text-sm text-[var(--text-soft)]">
                  {gymProgress.frequency.previous7Days.workoutCount === gymProgress.frequency.last7Days.workoutCount
                    ? 'Mismo ritmo que los 7 días anteriores.'
                    : `${Math.abs(gymProgress.frequency.last7Days.workoutCount - gymProgress.frequency.previous7Days.workoutCount)} ${gymProgress.frequency.last7Days.workoutCount > gymProgress.frequency.previous7Days.workoutCount ? 'más' : 'menos'} que en los 7 días anteriores.`}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-6 border-t border-[var(--border)] pt-5 lg:min-w-80 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
                <div>
                  <dt className="text-xs font-medium text-[var(--text-faint)]">Últimos 30 días</dt>
                  <dd className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                    {gymProgress.frequency.last30Days.workoutCount}
                    <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">sesiones</span>
                  </dd>
                </div>
                {gymProgress.frequency.last30Days.volume > 0 && (
                  <div>
                    <dt className="text-xs font-medium text-[var(--text-faint)]">Volumen del período</dt>
                    <dd className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                      {gymProgress.frequency.last30Days.volume.toLocaleString('es-UY')}
                      <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">kg</span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          {activeExerciseMetric ? (
            <section data-gym-exercise-progress className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-soft)]">Evolución por ejercicio</p>
                  <h2 className="mt-1 text-xl font-bold text-[var(--text)]">{activeExerciseMetric.exerciseName}</h2>
                </div>
                <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-soft)]">
                  Elegir ejercicio
                  <select
                    value={activeExerciseMetric.key}
                    onChange={(e) => setSelectedExercise(e.target.value)}
                    className="min-h-11 min-w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--blue)]"
                  >
                    {gymProgress.exercises.map((exercise) => (
                      <option key={exercise.key} value={exercise.key}>{exercise.exerciseName}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-3xl bg-[var(--card)] p-5 shadow-sm ring-1 ring-inset ring-[var(--border)] sm:p-6">
                <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-end">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-[var(--text-faint)]">Mejor serie</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        activeExerciseMetric.state === 'improved'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                      }`}>
                        {activeExerciseMetric.state === 'improved'
                          ? 'Mejorando'
                          : activeExerciseMetric.state === 'stable'
                            ? 'Estable'
                            : 'Faltan datos'}
                      </span>
                    </div>
                    <p className="mt-2 text-4xl font-black tracking-tight tabular-nums text-[var(--text)] sm:text-5xl">
                      {activeExerciseMetric.bestSet
                        ? <>{activeExerciseMetric.bestSet.weight}<span className="ml-1.5 text-base font-semibold text-[var(--text-soft)]">kg × {activeExerciseMetric.bestSet.reps}</span></>
                        : '—'}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-5 border-t border-[var(--border)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <div>
                      <dt className="text-xs text-[var(--text-faint)]">Última ejecución</dt>
                      <dd className="mt-1 text-base font-bold text-[var(--text)]">
                        {activeExerciseMetric.lastExecution ? fmtDate(activeExerciseMetric.lastExecution.date) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-faint)]">Sesiones en 30 días</dt>
                      <dd className="mt-1 text-base font-bold tabular-nums text-[var(--text)]">
                        {activeExerciseMetric.recentSessionCount}
                      </dd>
                    </div>
                  </dl>
                </div>
                <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm leading-6 text-[var(--text-soft)]">
                  {activeExerciseMetric.state === 'improved'
                    ? 'Tu mejor serie reciente superó el período anterior.'
                    : activeExerciseMetric.state === 'stable'
                      ? 'La mejor serie se mantuvo frente al período anterior.'
                      : 'Necesitamos ejecuciones en dos períodos comparables para marcar una tendencia.'}
                  {activeExerciseMetric.previousVolume > 0 && (
                    <> Volumen reciente: <span className="font-semibold tabular-nums text-[var(--text)]">{activeExerciseMetric.recentVolume.toLocaleString('es-UY')} kg</span>.</>
                  )}
                </p>
              </div>

              {liftingChartData.length >= 2 ? (
                <div className="rounded-3xl bg-[var(--card-subtle)] p-4 sm:p-5">
                  <div className="mb-3">
                    <h3 className="text-sm font-bold text-[var(--text)]">¿Cómo cambió la carga máxima?</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-soft)]">Mayor peso realizado en cada sesión.</p>
                  </div>
                  <div className="h-48 w-full sm:h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={liftingChartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.45} vertical={false} />
                        <XAxis dataKey="dateLabel" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[liftMin, liftMax]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} kg`} />
                        <Tooltip content={<CustomChartTooltip unit="kg" />} />
                        <Line type="monotone" dataKey="kg" stroke="var(--blue)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--blue)', stroke: 'var(--card)', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p data-gym-progress-low-data className="rounded-2xl bg-[var(--surface-muted)] px-4 py-5 text-sm text-[var(--text-soft)]">
                  Registrá otra ejecución de {activeExercise} para ver su evolución de carga.
                </p>
              )}
            </section>
          ) : (
            <section data-gym-progress-low-data className="rounded-2xl bg-[var(--surface-muted)] px-5 py-7">
              <h2 className="text-base font-bold text-[var(--text)]">Tu progreso aparecerá acá</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--text-soft)]">
                Completá series en una sesión para ver última ejecución, mejor serie y evolución por ejercicio.
              </p>
            </section>
          )}

          {gymProgress.exercises.length > 0 && (
            <details className="group border-y border-[var(--border)]">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 text-sm font-semibold text-[var(--text)]">
                <span>Récords personales</span>
                <AppIcon name="chevronDown" className="h-4 w-4 text-[var(--text-soft)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-[var(--border)] py-4">
                <PersonalRecordsCard state={state} onSelectExercise={setHistoryExercise} />
              </div>
            </details>
          )}

          <details className="group border-y border-[var(--border)]">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 text-sm font-semibold text-[var(--text)]">
              <span>Salud corporal</span>
              <span className="flex items-center gap-3 text-xs font-medium text-[var(--text-soft)]">
                {peso != null ? `${peso} kg` : 'Sin peso registrado'}
                <AppIcon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div id="qa-focus-peso" className="space-y-5 border-t border-[var(--border)] py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--text-faint)]">Peso actual</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{peso != null ? `${peso} kg` : '—'}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                    {variacion == null ? 'Sin variación calculable' : `${variacion > 0 ? '+' : ''}${variacion.toFixed(1)} kg desde el inicio`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-faint)]">IMC</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text)]">{imc != null ? imc.toFixed(1) : '—'}</p>
                  <p className="text-xs text-[var(--text-soft)]">{imcCat.label}</p>
                </div>
              </div>

              <form onSubmit={handleAddWeight} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <input
                  type="date"
                  aria-label="Fecha del peso"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
                />
                <input
                  type="number"
                  aria-label="Peso en kilogramos"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="70.5 kg"
                  className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
                />
                <button type="submit" className="min-h-11 rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--bg-elevated)] hover:opacity-90">
                  Registrar peso
                </button>
              </form>

              {bodyWeightChartData.length >= 2 && (
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">¿Cómo cambió tu peso?</h3>
                  <div className="mt-3 h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={bodyWeightChartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.24} />
                            <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.45} vertical={false} />
                        <XAxis dataKey="dateLabel" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[bwMin, bwMax]} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} kg`} />
                        <Tooltip content={<CustomChartTooltip unit="kg" />} />
                        <Area type="monotone" dataKey="kg" stroke="var(--blue)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBw)" dot={{ r: 3, fill: 'var(--blue)', stroke: 'var(--card)', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowBodyComposition((value) => !value)}
                className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)]"
              >
                {showBodyComposition ? 'Ocultar composición corporal' : 'Ver composición corporal'}
              </button>
              {showBodyComposition && <BodyCompositionCard state={state} onUpdateState={onUpdateState} />}
            </div>
          </details>
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

      {/* Workout Completion Summary Modal */}
      {completedSummarySession && (
        <WorkoutSummaryModal
          session={completedSummarySession.session}
          newPRs={completedSummarySession.newPRs}
          onClose={() => setCompletedSummarySession(null)}
        />
      )}

      {/* Exercise History Modal */}
      {historyExercise && (
        <ExerciseHistoryModal
          exerciseName={historyExercise.exerciseName}
          exerciseId={historyExercise.exerciseId}
          sessions={state.gym?.sessions || []}
          onClose={() => setHistoryExercise(null)}
        />
      )}
    </div>
  );
};

interface TemplateAddExerciseFormProps {
  onAdd: (
    name: string,
    muscleGroup: MuscleGroup,
    equipment: ExerciseEquipment,
    barWeight: number
  ) => void;
}

const TemplateAddExerciseForm: React.FC<TemplateAddExerciseFormProps> = ({ onAdd }) => {
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('Pecho');
  const [equipment, setEquipment] = useState<ExerciseEquipment>('barra');
  const [barWeight, setBarWeight] = useState(20);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), muscleGroup, equipment, equipment === 'barra' ? barWeight : 0);
    setName('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto] lg:items-end"
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-soft)]">
          Ejercicio
        </label>
        <input
          type="text"
          list="template-gym-suggestions"
          value={name}
          onChange={(e) => {
            const val = e.target.value;
            setName(val);
            if (val) {
              setMuscleGroup(inferMuscleGroup(val));
              const inferred = inferExerciseEquipment(val);
              setEquipment(inferred.equipment);
              setBarWeight(inferred.barWeight);
            }
          }}
          placeholder="Ej: Curl con mancuernas"
          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
        />
        <datalist id="template-gym-suggestions">
          {COMMON_EXERCISE_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="min-w-0">
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-soft)]">
          Músculo
        </label>
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)]"
        >
          {['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0">
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-soft)]">
          Equipo
        </label>
        <select
          value={equipment}
          onChange={(e) => {
            const eq = e.target.value as ExerciseEquipment;
            setEquipment(eq);
            if (eq !== 'barra') {
              setBarWeight(0);
            } else if (barWeight === 0) {
              setBarWeight(20);
            }
          }}
          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)]"
        >
          {EXERCISE_EQUIPMENT_OPTIONS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {equipment === 'barra' && (
        <div className="min-w-0">
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-soft)]">
            Barra
          </label>
          <select
            value={barWeight}
            onChange={(e) => setBarWeight(Number(e.target.value))}
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)]"
          >
            <option value={20}>20 kg (Olímpica)</option>
            <option value={15}>15 kg (Técnica)</option>
            <option value={10}>10 kg (W / EZ)</option>
          </select>
        </div>
      )}

      <button
        type="submit"
        className="min-h-11 rounded-xl bg-[var(--blue)] px-4 text-sm font-bold text-white hover:bg-[var(--blue-hover)] sm:col-span-2 lg:col-span-1"
      >
        Agregar
      </button>
    </form>
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
    equipment: ExerciseEquipment,
    barWeight: number,
    initialWeight: number,
    initialReps: number
  ) => void;
  onDeleteExercise: (exerciseIndex: number) => void;
  onAddSet: (exerciseIndex: number) => void;
  onUpdateSet: (exerciseIndex: number, setIndex: number, updates: Partial<GymSet>) => void;
  onDeleteSet: (exerciseIndex: number, setIndex: number) => void;
  onUpdateExerciseBar: (exerciseIndex: number, barWeight: number) => void;
  onUpdateExerciseEquipment?: (
    exerciseIndex: number,
    equipment: ExerciseEquipment,
    barWeight: number
  ) => void;
  onPropagateExercise?: (
    name: string,
    config: { equipment: ExerciseEquipment; barWeight: number; muscleGroup?: MuscleGroup }
  ) => void;
  onOpenCalculator: (
    exerciseIndex: number,
    setIndex: number,
    initialWeight: number,
    barWeight: number
  ) => void;
  onOpenHistory?: (target: ExerciseMetricTarget) => void;
  showSessionActions?: boolean;
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
  onUpdateExerciseEquipment,
  onPropagateExercise,
  onOpenCalculator,
  onOpenHistory,
  showSessionActions = true,
}) => {
  const [newExName, setNewExName] = useState('');
  const [newExMuscle, setNewExMuscle] = useState<MuscleGroup>('Pecho');
  const [newExEquipment, setNewExEquipment] = useState<ExerciseEquipment>('barra');
  const [newExBar, setNewExBar] = useState(20);
  const [newExWeight, setNewExWeight] = useState('40');
  const [newExReps, setNewExReps] = useState('10');
  const [isEditingHeader, setIsEditingHeader] = useState(false);

  const isActive = session.status === 'active';
  const totalVol = getPerformedGymVolume(session);
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
      newExEquipment,
      newExEquipment === 'barra' ? newExBar : 0,
      Number(newExWeight) || 20,
      Number(newExReps) || 10
    );
    setNewExName('');
  };

  return (
    <div
      data-workout-session-card
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

          {showSessionActions && (
            <>
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
            </>
          )}
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
            const previousBest = getPreviousExerciseStats(allSessions, session.id, exercise.name, exercise.id);
            const exerciseGhost = getExerciseGhostValues(allSessions, {
              exerciseId: exercise.id,
              exerciseName: exercise.name,
            }, session.id);
            const inferred = inferExerciseEquipment(exercise.name);
            const currentEquipment: ExerciseEquipment =
              exercise.equipment ||
              (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : inferred.equipment);
            const currentBarWeight =
              currentEquipment === 'barra' ? (exercise.barWeight ?? inferred.barWeight) : 0;

            return (
              <div
                key={exercise.id || exIdx}
                className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2.5"
              >
                {/* Exercise Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenHistory?.({ exerciseId: exercise.id, exerciseName: exercise.name })}
                      className="text-sm font-extrabold text-[var(--text)] hover:text-[var(--blue)] transition text-left cursor-pointer flex items-center gap-1"
                      title="Ver historial de este ejercicio"
                    >
                      <span>{exercise.name}</span>
                      <span className="text-xs font-normal text-[var(--blue)]">↗</span>
                    </button>
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

                  {/* Equipment, Bar Weight & Actions */}
                  <div className="flex items-center gap-1.5 text-xs flex-wrap">
                    <select
                      value={currentEquipment}
                      onChange={(e) => {
                        const newEq = e.target.value as ExerciseEquipment;
                        const newBar = newEq === 'barra' ? (currentBarWeight > 0 ? currentBarWeight : 20) : 0;
                        onUpdateExerciseEquipment?.(exIdx, newEq, newBar);
                      }}
                      className="bg-[var(--card)] border border-[var(--border)] rounded-md px-1.5 py-0.5 text-xs font-semibold cursor-pointer text-[var(--text)]"
                    >
                      <option value="barra">🏋️ Barra</option>
                      <option value="mancuerna">💪 Mancuerna</option>
                      <option value="polea">🔗 Polea</option>
                      <option value="maquina">⚙️ Máquina</option>
                      <option value="corporal">🤸 Corporal</option>
                    </select>

                    {currentEquipment === 'barra' && (
                      <div className="flex items-center gap-1 text-[11px] text-[var(--text-soft)]">
                        <span>Barra:</span>
                        <select
                          value={currentBarWeight}
                          onChange={(e) => onUpdateExerciseBar(exIdx, Number(e.target.value))}
                          className="bg-[var(--card)] border border-[var(--border)] rounded-md px-1.5 py-0.5 text-xs font-mono font-bold cursor-pointer text-[var(--text)]"
                        >
                          <option value={20}>20 kg (Olímpica)</option>
                          <option value={15}>15 kg (Técnica)</option>
                          <option value={10}>10 kg (W / EZ)</option>
                        </select>
                      </div>
                    )}

                    {onPropagateExercise && (
                      <button
                        type="button"
                        onClick={() =>
                          onPropagateExercise(exercise.name, {
                            equipment: currentEquipment,
                            barWeight: currentBarWeight,
                            muscleGroup: exercise.muscleGroup,
                          })
                        }
                        className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-bold text-[10px] cursor-pointer"
                        title={`Aplicar "${exercise.name}" como ${currentEquipment} en todo el historial`}
                      >
                        ⚡ Al historial
                      </button>
                    )}

                    {currentEquipment === 'barra' && (
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
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteExercise(exIdx)}
                      className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                      title="Eliminar ejercicio"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Sets Table */}
                <div className="space-y-2 sm:hidden">
                  {(exercise.sets || []).map((set, setIdx) => {
                    const setWeight = Number(set.weight) || 0;
                    const ghostSet = exerciseGhost?.sets[setIdx];
                    return (
                      <div key={set.id || setIdx} className="rounded-xl bg-[var(--card)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-[var(--text-soft)]">Serie {setIdx + 1}</span>
                          <button
                            type="button"
                            onClick={() => onUpdateSet(exIdx, setIdx, { completed: !set.completed })}
                            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${
                              set.completed
                                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                            }`}
                          >
                            <AppIcon name={set.completed ? 'checkCircle' : 'check'} className="h-4 w-4" />
                            {set.completed ? 'Realizada' : 'Marcar realizada'}
                          </button>
                        </div>
                        {ghostSet && (
                          <p className="mt-1 text-xs text-[var(--text-faint)]">
                            Anterior: {ghostSet.weight} kg × {ghostSet.reps}
                          </p>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-xs font-medium text-[var(--text-soft)]">
                            Peso (kg)
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={set.weight}
                              onChange={(event) => onUpdateSet(exIdx, setIdx, { weight: Number(event.target.value) || 0 })}
                              className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-bold text-[var(--text)]"
                            />
                          </label>
                          <label className="text-xs font-medium text-[var(--text-soft)]">
                            Reps
                            <input
                              type="number"
                              min="1"
                              value={set.reps}
                              onChange={(event) => onUpdateSet(exIdx, setIdx, { reps: Number(event.target.value) || 0 })}
                              className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-bold text-[var(--text)]"
                            />
                          </label>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          {currentEquipment === 'barra' ? (
                            <button
                              type="button"
                              onClick={() => onOpenCalculator(exIdx, setIdx, setWeight, currentBarWeight)}
                              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)]"
                            >
                              Calcular discos
                            </button>
                          ) : <span />}
                          <button
                            type="button"
                            onClick={() => onDeleteSet(exIdx, setIdx)}
                            className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                          >
                            <AppIcon name="trash" className="h-4 w-4" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase font-bold text-[var(--text-faint)] border-b border-[var(--border)]">
                        <th className="py-1 w-10">Serie</th>
                        <th className="py-1 w-36">Peso Total</th>
                        <th className="py-1 w-32">Carga / Discos</th>
                        <th className="py-1 w-32">Reps</th>
                        <th className="py-1 w-12 text-center">Hecha</th>
                        <th className="py-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {(exercise.sets || []).map((set, setIdx) => {
                        const setWeight = Number(set.weight) || 0;
                        const platePerSide = Math.max(0, (setWeight - currentBarWeight) / 2);
                        const ghostSet = exerciseGhost?.sets[setIdx];

                        return (
                          <tr
                            key={set.id || setIdx}
                            className={`transition-colors ${
                              set.completed ? 'bg-emerald-500/5' : 'hover:bg-[var(--card)]/50'
                            }`}
                          >
                            <td className="py-1.5 font-mono text-[var(--text-soft)]">
                              <div className="font-bold">#{setIdx + 1}</div>
                              {ghostSet && (
                                <div
                                  className="text-[10px] text-[var(--text-faint)] leading-tight whitespace-nowrap"
                                  title={`Sesión previa: ${ghostSet.weight}kg × ${ghostSet.reps}`}
                                >
                                  <span className="opacity-70">Ant:</span> {ghostSet.weight}k×{ghostSet.reps}
                                  {!set.completed &&
                                    (Number(set.weight) !== ghostSet.weight ||
                                      Number(set.reps) !== ghostSet.reps) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onUpdateSet(exIdx, setIdx, {
                                            weight: ghostSet.weight,
                                            reps: ghostSet.reps,
                                          })
                                        }
                                        className="ml-1 text-[9px] text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 underline cursor-pointer font-sans"
                                        title="Copiar valores de la sesión anterior"
                                      >
                                        Usar
                                      </button>
                                    )}
                                </div>
                              )}
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
                                  placeholder={ghostSet ? String(ghostSet.weight) : undefined}
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
                                {currentEquipment === 'barra' && (
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
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 font-mono text-[11px] text-[var(--text-soft)]">
                              {currentEquipment === 'barra' && (
                                <span
                                  onClick={() =>
                                    onOpenCalculator(exIdx, setIdx, setWeight, currentBarWeight)
                                  }
                                  className="cursor-pointer hover:underline text-[var(--blue)] font-bold"
                                >
                                  {platePerSide > 0 ? `${platePerSide} kg/lado` : 'Solo barra'}
                                </span>
                              )}
                              {currentEquipment === 'mancuerna' && (
                                <span className="font-semibold text-[var(--text-soft)]">
                                  {setWeight > 0 ? `${setWeight} kg manc.` : '—'}
                                </span>
                              )}
                              {currentEquipment === 'polea' && (
                                <span className="font-semibold text-[var(--text-soft)]">
                                  {setWeight > 0 ? `${setWeight} kg polea` : '—'}
                                </span>
                              )}
                              {currentEquipment === 'maquina' && (
                                <span className="font-semibold text-[var(--text-soft)]">
                                  {setWeight > 0 ? `${setWeight} kg máq.` : '—'}
                                </span>
                              )}
                              {currentEquipment === 'corporal' && (
                                <span className="font-semibold text-[var(--text-soft)]">
                                  {setWeight > 0 ? `+${setWeight} kg lastre` : 'Corporal'}
                                </span>
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
                                  placeholder={ghostSet ? String(ghostSet.reps) : undefined}
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
              if (val) {
                setNewExMuscle(inferMuscleGroup(val));
                const inferred = inferExerciseEquipment(val);
                setNewExEquipment(inferred.equipment);
                setNewExBar(inferred.barWeight);
              }
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
            Tipo
          </label>
          <select
            value={newExEquipment}
            onChange={(e) => {
              const eq = e.target.value as ExerciseEquipment;
              setNewExEquipment(eq);
              if (eq !== 'barra') {
                setNewExBar(0);
              } else if (newExBar === 0) {
                setNewExBar(20);
              }
            }}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
          >
            {EXERCISE_EQUIPMENT_OPTIONS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {newExEquipment === 'barra' && (
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
            </select>
          </div>
        )}

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

const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  barra: 'Barra',
  mancuerna: 'Mancuernas',
  polea: 'Polea',
  maquina: 'Máquina',
  corporal: 'Peso corporal',
};

const LatestWorkoutSession: React.FC<WorkoutSessionCardProps> = (props) => {
  const { session, allSessions, onDeleteSession, onSaveAsTemplate } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const presentation = useMemo(
    () => buildGymSessionPresentation(session, allSessions),
    [allSessions, session]
  );

  const secondaryActions = (
    <details className="group relative">
      <summary
        aria-label="Más acciones de la sesión"
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
      >
        <AppIcon name="more" className="h-5 w-5" />
      </summary>
      <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl">
        <button
          type="button"
          onClick={onSaveAsTemplate}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)]"
        >
          <AppIcon name="repeat" className="h-4 w-4 text-[var(--text-soft)]" />
          Guardar como plantilla
        </button>
        <button
          type="button"
          onClick={onDeleteSession}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
        >
          <AppIcon name="trash" className="h-4 w-4" />
          Eliminar sesión
        </button>
      </div>
    </details>
  );

  if (isEditing) {
    return (
      <div data-historical-session-editor className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2">
          <div>
            <p className="text-sm font-bold text-[var(--text)]">Editando sesión</p>
            <p className="text-xs text-[var(--text-soft)]">Los cambios se guardan en el historial.</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--card)]"
            >
              Volver al detalle
            </button>
            {secondaryActions}
          </div>
        </div>
        <WorkoutSessionCard {...props} showSessionActions={false} />
      </div>
    );
  }

  return (
    <article
      data-latest-session-summary
      data-history-session-summary
      className="overflow-visible rounded-3xl bg-[var(--card)] shadow-sm ring-1 ring-inset ring-[var(--border)]"
    >
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-[var(--blue)]">
              <AppIcon name="calendar" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time className="text-xs font-semibold text-[var(--text-soft)]" dateTime={session.date}>
                  {fmtDate(session.date)}
                </time>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <AppIcon name="check" className="h-3 w-3" />
                  Completada
                </span>
              </div>
              <h3 className="mt-1 truncate text-lg font-black tracking-tight text-[var(--text)] sm:text-xl">
                {presentation.name}
              </h3>
            </div>
          </div>
          {secondaryActions}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] sm:items-end">
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-[11px] font-semibold text-[var(--text-faint)]">Volumen</dt>
            <dd className="mt-1 text-3xl font-black tracking-tight tabular-nums text-[var(--text)]">
              {presentation.volumeKg.toLocaleString('es-UY')}
              <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">kg</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--text-faint)]">Series realizadas</dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{presentation.completedSetCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--text-faint)]">Ejercicios</dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{presentation.exerciseCount}</dd>
          </div>
          {presentation.durationLabel && (
            <div>
              <dt className="text-[11px] text-[var(--text-faint)]">Duración</dt>
              <dd className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{presentation.durationLabel}</dd>
            </div>
          )}
          {presentation.prExerciseCount > 0 && (
            <div>
              <dt className="text-[11px] text-[var(--text-faint)]">Mejores marcas</dt>
              <dd className="mt-1 text-lg font-black tabular-nums text-amber-600 dark:text-amber-300">
                {presentation.prExerciseCount} PR{presentation.prExerciseCount === 1 ? '' : 's'}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-[var(--text-soft)]">
            {presentation.bestSet ? (
              <>
                <span className="block font-semibold text-[var(--text-faint)]">Mejor serie</span>
                <span className="mt-0.5 block truncate text-sm text-[var(--text)]">
                  {presentation.bestSet.exerciseName} · <strong className="font-mono text-base">{presentation.bestSet.weight} kg × {presentation.bestSet.reps}</strong>
                </span>
              </>
            ) : 'Sin una mejor serie registrada.'}
          </p>
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--card)]"
          >
            {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
            <AppIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div data-latest-session-detail className="border-t border-[var(--border)] bg-[var(--card-subtle)] px-4 py-5 sm:px-6">
          <div className="divide-y divide-[var(--border)]">
            {session.exercises.map((exercise, exerciseIndex) => {
              const inferred = inferExerciseEquipment(exercise.name);
              const equipment = exercise.equipment ||
                (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : inferred.equipment);
              const previousBest = getPreviousExerciseStats(allSessions, session.id, exercise.name, exercise.id);
              return (
                <section key={exercise.id || exerciseIndex} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex items-center gap-3">
                      <RoutineIdentityMark exercises={[exercise]} compact />
                      <div>
                        <h4 className="text-sm font-black text-[var(--text)]">{exercise.name}</h4>
                        <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                          {[exercise.muscleGroup, EQUIPMENT_LABELS[equipment]].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {previousBest && (
                      <p className="text-xs text-[var(--text-soft)] sm:text-right">
                        Referencia anterior: <span className="font-mono font-semibold text-[var(--text)]">{previousBest}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-1">
                    {(exercise.sets || []).map((set, setIndex) => (
                      <div
                        key={set.id || setIndex}
                        className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 hover:bg-[var(--surface-muted)]"
                      >
                        <span className="text-[11px] font-semibold text-[var(--text-faint)]">Serie {setIndex + 1}</span>
                        <span className="text-right font-mono text-base font-black tabular-nums text-[var(--text)]">
                          {Number(set.weight) || 0} kg × {Number(set.reps) || 0}
                        </span>
                        {set.completed ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" aria-label="Serie realizada" />
                        ) : (
                          <span className="text-[10px] font-semibold text-[var(--text-faint)]">No realizada</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
            >
              <AppIcon name="edit" className="h-4 w-4 text-[var(--blue)]" />
              Editar sesión
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
