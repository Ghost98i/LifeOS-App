import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DayKey, Exercise, ExerciseEquipment, GymSession, GymSet, LifeOSState, MuscleGroup, RoutineAppearance } from '../types';
import { GymRestTimerBar } from './GymRestTimerBar';
import { GymActivityCalendar } from './GymActivityCalendar';
import { GymWorkoutLauncher } from './GymWorkoutLauncher';
import { useGymLauncher } from '../hooks/useGymLauncher';
import { GymNoteSurface } from './GymNoteSurface';
import { GYM_NOTE_PLACEMENTS_ENABLED } from '../lib/notePlacements';
import { ActiveWorkoutView } from './ActiveWorkoutView';
import { GymPlateCalculator } from './GymPlateCalculator';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { BodyCompositionCard } from './BodyCompositionCard';
import { WorkoutSummaryModal } from './WorkoutSummaryModal';
import { ExerciseHistoryModal } from './ExerciseHistoryModal';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { GymExerciseArtwork } from './visual/GymExerciseArtwork';
import { GymIcon } from './visual/GymIcon';
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
  calculateSessionDuration,
  NewPRRecord,
  nowTimeHHmm,
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
import { buildGymSessionPresentation, formatGymSessionDateTime, getGymCalendarOverview, getPreviousSessionBestLabel } from '../lib/gymIdlePresentation';
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
  getGymSettings,
  isPerformedGymSession,
  previewExerciseHistoryPropagation,
  previewNormalizeGymHistory,
  reorderGymTemplateExercise,
  requestGymSessionDeletion,
  applyGymRestTimerAdjustment,
  resolveNextRestTimer,
  startGymSession,
  toggleGymRestTimerPause,
  updateGymTemplate,
  updateGymTemplateExercise,
  updateGymSessionExercise,
  updateGymSession,
  updateGymSessionSet,
} from '../lib/gymFlows';
import { GymRestSettingsModal } from './GymRestSettingsModal';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import {
  getRoutineIdentity,
  ROUTINE_ICON_OPTIONS,
  ROUTINE_ICON_LABELS,
} from '../lib/gymAppearance';
import { motionItemKey, shouldPlayCompletionMotion } from '../lib/motion';

interface GimnasioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  storageUserId: string | null;
  onOpenNote: (id: string) => void;
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

const RoutineIdentityMark: React.FC<{
  exercises: Exercise[];
  name?: string;
  appearance?: RoutineAppearance;
  compact?: boolean;
}> = ({ exercises, name, appearance, compact = false }) => {
  const identity = getRoutineIdentity(exercises, name, appearance);
  return (
    <div
      aria-hidden="true"
      className={`gym-routine-mark relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${identity.surface} ring-1 ring-inset ring-[var(--border)] ${compact ? 'h-11 w-11' : 'h-14 w-14 sm:h-16 sm:w-16'}`}
    >
      <GymIcon icon={identity.icon} decorative className="absolute inset-0 h-full w-full p-2.5" />
    </div>
  );
};

export const GimnasioView: React.FC<GimnasioViewProps> = ({
  state,
  onUpdateState,
  storageUserId,
  onOpenNote,
  initialTab = 'entrenar',
  initialEditingTemplateId = null,
}) => {
  const [activeTab, setActiveTab] = useState<'entrenar' | 'rutinas' | 'historial' | 'progresion'>(
    initialEditingTemplateId ? 'rutinas' : initialTab
  );
  const [weightDate, setWeightDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState('');

  const [sessionDate, setSessionDate] = useState(todayISO());
  const [sessionWeekLabel, setSessionWeekLabel] = useState('');
  const { today: launcherToday, plan: launcherPlan, select: setSessionTemplate } = useGymLauncher(state, activeTab);
  const sessionTemplate = launcherPlan.templateId;

  const [templateName, setTemplateName] = useState('');
  const [showBodyComposition, setShowBodyComposition] = useState(false);
  const [calendarHistorySessionId, setCalendarHistorySessionId] = useState<string | null>(null);
  const historyRootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLElement>(null);
  const bodyHealthDetailsRef = useRef<HTMLDetailsElement>(null);
  const bodyHealthContentRef = useRef<HTMLDivElement>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(initialEditingTemplateId);

  // Live Workout Mobile Navigation State
  const [liveExIdx, setLiveExIdx] = useState<number>(() => {
    const active = getActiveGymSession(state.gym);
    if (!active || !active.exercises || active.exercises.length === 0) return 0;
    const firstIncompleteIdx = active.exercises.findIndex((ex) =>
      (ex.sets || []).some((s) => !s.completed)
    );
    return firstIncompleteIdx >= 0 ? firstIncompleteIdx : 0;
  });
  const [liveSetIdx, setLiveSetIdx] = useState<number>(() => {
    const active = getActiveGymSession(state.gym);
    if (!active || !active.exercises || active.exercises.length === 0) return 0;
    const firstIncompleteIdx = active.exercises.findIndex((ex) =>
      (ex.sets || []).some((s) => !s.completed)
    );
    const ex = active.exercises[firstIncompleteIdx >= 0 ? firstIncompleteIdx : 0];
    const setIdx = ex?.sets?.findIndex((s) => !s.completed) ?? 0;
    return setIdx >= 0 ? setIdx : 0;
  });

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [setCompletionMotion, setSetCompletionMotion] = useState<{
    setKey: string;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    if (!setCompletionMotion) return;
    const timeout = window.setTimeout(() => setSetCompletionMotion(null), 1100);
    return () => window.clearTimeout(timeout);
  }, [setCompletionMotion]);

  const openBodyComposition = useCallback(() => {
    setActiveTab('progresion');
    setShowBodyComposition(true);
    if (bodyHealthDetailsRef.current) bodyHealthDetailsRef.current.open = true;
    window.requestAnimationFrame(() => {
      bodyHealthContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      bodyHealthContentRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handleRestTimerFinish = useCallback(() => {
    const timer = state.gym.activeTimer;
    if (!timer) return;
    if (timer.kind === 'exercise') {
      const activeSession = getActiveGymSession(state.gym);
      if (activeSession) {
        const nextIdx = typeof timer.targetExerciseIndex === 'number'
          ? timer.targetExerciseIndex
          : (typeof timer.exerciseIndex === 'number' ? timer.exerciseIndex + 1 : liveExIdx + 1);
        if (nextIdx < activeSession.exercises.length) {
          const nextEx = activeSession.exercises[nextIdx];
          const firstIncomplete = nextEx?.sets?.findIndex((s) => !s.completed) ?? -1;
          setLiveExIdx(nextIdx);
          setLiveSetIdx(firstIncomplete >= 0 ? firstIncomplete : 0);
        }
      }
    } else if (timer.kind === 'set') {
      const activeSession = getActiveGymSession(state.gym);
      if (activeSession) {
        const currentExIdx = typeof timer.exerciseIndex === 'number' ? timer.exerciseIndex : liveExIdx;
        const currentEx = activeSession.exercises[currentExIdx];
        if (currentEx) {
          const firstIncomplete = currentEx.sets?.findIndex((s) => !s.completed) ?? -1;
          if (firstIncomplete >= 0) {
            setLiveSetIdx(firstIncomplete);
          }
        }
      }
    }
    onUpdateState((draft) => {
      draft.gym.activeTimer = null;
    });
  }, [state.gym, liveExIdx, onUpdateState]);

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
    streakIncrease: { previous: number; current: number } | null;
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
  const isRestDayToday = launcherPlan.explicitRest;
  const gymSessions = state.gym?.sessions;
  const sortedSessions = useMemo(() => {
    return [...(gymSessions || [])].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.finishedAt || b.startedAt || '').localeCompare(a.finishedAt || a.startedAt || '')
    );
  }, [gymSessions]);

  const calendarOverview = useMemo(
    () => getGymCalendarOverview(state.gym.sessions, todayISO()),
    [state.gym.sessions]
  );

  const performedSessionCount = sortedSessions.filter(isPerformedGymSession).length;

  const todayCompletedSession = useMemo(
    () => sortedSessions.find((session) => session.date === launcherToday && isPerformedGymSession(session)) || null,
    [sortedSessions, launcherToday]
  );

  const todayPresentation = useMemo(
    () => todayCompletedSession
      ? buildGymSessionPresentation(todayCompletedSession, sortedSessions)
      : null,
    [sortedSessions, todayCompletedSession]
  );

  const activeWorkoutSession = getActiveGymSession(state.gym);
  const gymSettings = getGymSettings(state.gym);

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
      if (idx >= 0 || draft.checkoutLog?.[today]?.trainedSkipped) {
        if (idx >= 0) draft.gym.restDays.splice(idx, 1);
        if (draft.checkoutLog?.[today]) {
          draft.checkoutLog[today].trainedSkipped = false;
        }
        showToast('Descanso cancelado.', 'info');
      } else {
        draft.gym.restDays.push(today);
        if (!draft.checkoutLog) draft.checkoutLog = {};
        if (!draft.checkoutLog[today]) draft.checkoutLog[today] = {};
        draft.checkoutLog[today].trainedSkipped = true;
        showToast('Hoy marcado como descanso. No suma un entrenamiento.');
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
          <p className="tabular-nums text-[var(--blue)] font-extrabold text-sm">
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
    const template = templateId
      ? state.gym.routineTemplates.find((routine) => routine.id === templateId)
      : null;
    if (templateId && !template) {
      showToast('La rutina seleccionada ya no está disponible.', 'error');
      return;
    }
    if (template && template.exercises.length === 0) {
      showToast('Agregá al menos un ejercicio a esta rutina antes de iniciarla.', 'error');
      return;
    }
    if (isRestDayToday && !window.confirm('Hoy tenés un descanso registrado. ¿Querés entrenar de todos modos? El descanso seguirá registrado.')) return;
    const today = todayISO();
    let result: ReturnType<typeof startGymSession> | null = null;
    const saved = onUpdateState((draft) => {
      result = startGymSession(draft.gym, {
        templateId,
        date: today,
        startedAt: nowTimeHHmm(),
        sessionId: uid(),
      });
    });
    if (!saved) return;
    setLiveExIdx(0);
    setLiveSetIdx(0);
    setActiveTab('entrenar');
    playSound('click');
    showToast(result?.created
      ? '🏋️ Entrenamiento iniciado con tu historial más reciente.'
      : 'Entrenamiento activo reanudado.');
  };

  const handleSelectRoutine = (templateId: string) => {
    setSessionTemplate(templateId);
    setActiveTab('entrenar');
    if (window.innerWidth < 640) {
      window.requestAnimationFrame(() => {
        launcherRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const handleFinishWorkout = (sessionId: string) => {
    const sessionToFinish = state.gym.sessions.find((x) => x.id === sessionId);
    const finishTime = nowTimeHHmm();
    const previousStreak = calcGymStreakDetails(state).streakDays;
    let currentStreak = previousStreak;
    let result: ReturnType<typeof finishGymSession> | null = null;
    const saved = onUpdateState((draft) => {
      result = finishGymSession(draft.gym, sessionId, { finishedAt: finishTime });
      draft.gym.activeTimer = null;
      if (result?.status === 'completed') currentStreak = calcGymStreakDetails(draft).streakDays;
    });
    if (result?.status === 'no_completed_sets') {
      showToast('Completá al menos una serie antes de finalizar, o descartá la sesión.', 'error');
      return;
    }
    if (!saved || result?.status !== 'completed' || !sessionToFinish) return;

    const historicalPRs = calcDetailedPRs(state.gym.sessions, sessionId);
    const finishedSnapshot: GymSession = {
      ...sessionToFinish,
      status: 'completed',
      finishedAt: finishTime,
    };
    const summaryPayload = {
      session: finishedSnapshot,
      newPRs: detectSessionPRs(finishedSnapshot, historicalPRs),
      streakIncrease: currentStreak > previousStreak
        ? { previous: previousStreak, current: currentStreak }
        : null,
    };
    playSound('success');
    setCompletedSummarySession(summaryPayload);
  };

  const handleAddSession = (overrideWeek?: string) => {
    let result: ReturnType<typeof startGymSession> | null = null;
    const saved = onUpdateState((draft) => {
      result = startGymSession(draft.gym, {
        date: sessionDate || todayISO(),
        weekLabel: overrideWeek || sessionWeekLabel.trim() || undefined,
        startedAt: nowTimeHHmm(),
        sessionId: uid(),
      });
    });
    if (!saved) return;
    setSessionWeekLabel('');
    if (result?.created) setActiveTab('entrenar');
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

  const handleEditSessionTimes = (sessionId: string, startedAt: string | null, finishedAt: string | null) => {
    let success = false;
    onUpdateState((draft) => {
      success = updateGymSession(draft.gym, sessionId, { startedAt, finishedAt });
    });
    if (!success) {
      showToast('Horario no válido: la hora de fin no puede ser anterior a la de inicio.', 'error');
    }
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
    let completedSetKey: string | null = null;
    const saved = onUpdateState((draft) => {
      const s = draft.gym.sessions.find((x) => x.id === sessionId);
      const ex = s?.exercises[exerciseIndex];
      const targetSet = ex?.sets[setIndex];
      const wasCompleted = Boolean(targetSet?.completed);
      const result = updateGymSessionSet(draft.gym, sessionId, { exerciseId: ex?.id, exerciseIndex }, setIndex, updates);
      if (result.updated && shouldPlayCompletionMotion(wasCompleted, Boolean(updates.completed))) {
        completedSetKey = motionItemKey(ex?.id, targetSet?.id, setIndex);
        const nextTimer = resolveNextRestTimer(
          draft.gym,
          sessionId,
          { exerciseId: ex?.id, exerciseIndex },
          setIndex,
          Date.now()
        );
        if (nextTimer) {
          draft.gym.activeTimer = nextTimer;
        }
      }
    });
    if (saved && completedSetKey) {
      playSound('success');
      setSetCompletionMotion((current) => ({
        setKey: completedSetKey as string,
        nonce: (current?.nonce || 0) + 1,
      }));
    }
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
            restSeconds: ex.restSeconds,
            restSecondsMode: ex.restSecondsMode || 'inherit',
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
    input: { setsCount: number; reps: number; targetWeight: number; restSeconds?: number }
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
          restSecondsMode: 'inherit',
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

  const calendarRestDates = useMemo(() => [
    ...(state.gym.restDays || []),
    ...Object.keys(state.checkoutLog || {}).filter(date => state.checkoutLog?.[date]?.trainedSkipped),
  ], [state.gym.restDays, state.checkoutLog]);

  useEffect(() => {
    if (activeTab !== 'historial' || !calendarHistorySessionId) return;
    const root = historyRootRef.current;
    const target = root && [...root.querySelectorAll<HTMLElement>('[data-gym-history-session]')]
      .find(element => element.dataset.gymHistorySession === calendarHistorySessionId);
    if (!target) return;
    for (let parent = target.parentElement; parent && parent !== root; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    target.focus({ preventScroll: true });
    setCalendarHistorySessionId(null);
  }, [activeTab, calendarHistorySessionId]);

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
    ? getPreviousSessionBestLabel(state.gym.sessions, activeWorkoutSession.id, liveCurrentEx.name, liveCurrentEx.id)
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
    <div className="gym-page space-y-6">
      {/* La sesión activa usa su propio encabezado operativo para priorizar el primer viewport móvil. */}
      {!(activeWorkoutSession && activeTab === 'entrenar') && (
        <PageHeader
          title="Gimnasio"
        />
      )}

      {/* Gym sections */}
      {!(activeWorkoutSession && activeTab === 'entrenar') && (
      <nav aria-label="Secciones de Gimnasio" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
        <button
          type="button"
          onClick={() => setActiveTab('entrenar')}
          aria-label={activeWorkoutSession ? 'Continuar entrenamiento' : undefined}
          aria-current={activeTab === 'entrenar' ? 'page' : undefined}
          className={`flex min-h-11 min-w-[4.75rem] flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] sm:min-w-0 sm:gap-2 sm:px-3 sm:text-xs ${
            activeTab === 'entrenar'
              ? 'bg-[var(--card)] text-[var(--text)]'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="dumbbell" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="truncate">{activeWorkoutSession ? 'Continuar' : 'Entrenar'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rutinas')}
          aria-current={activeTab === 'rutinas' ? 'page' : undefined}
          className={`flex min-h-11 min-w-[4.75rem] flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] sm:min-w-0 sm:gap-2 sm:px-3 sm:text-xs ${
            activeTab === 'rutinas'
              ? 'bg-[var(--card)] text-[var(--text)]'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="list" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span>Rutinas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('historial')}
          aria-current={activeTab === 'historial' ? 'page' : undefined}
          className={`flex min-h-11 min-w-[4.75rem] flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] sm:min-w-0 sm:gap-2 sm:px-3 sm:text-xs ${
            activeTab === 'historial'
              ? 'bg-[var(--card)] text-[var(--text)]'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="history" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="truncate">Historial</span>
          <span className="hidden text-[10px] tabular-nums sm:inline-block">
            {performedSessionCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('progresion')}
          aria-current={activeTab === 'progresion' ? 'page' : undefined}
          className={`flex min-h-11 min-w-[4.75rem] flex-1 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] sm:min-w-0 sm:gap-2 sm:px-3 sm:text-xs ${
            activeTab === 'progresion'
              ? 'bg-[var(--card)] text-[var(--text)]'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="activity" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="truncate">Progreso</span>
        </button>
      </nav>
      )}

      {activeWorkoutSession && state.gym.activeTimer && activeTab !== 'entrenar' && (
        <GymRestTimerBar
          state={state}
          onUpdateState={onUpdateState}
          onComplete={handleRestTimerFinish}
          onSkip={handleRestTimerFinish}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
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
              previousGhostSets={liveGhost?.sets || null}
              completionMotion={setCompletionMotion}
              exerciseSuggestions={COMMON_EXERCISE_SUGGESTIONS}
              activeTimer={state.gym.activeTimer}
              onAdjustRestTimer={(delta) => {
                onUpdateState((draft) => {
                  if (!draft.gym.activeTimer) return;
                  const res = applyGymRestTimerAdjustment(draft.gym.activeTimer, delta);
                  if (res.completed) {
                    handleRestTimerFinish();
                  } else if (res.timer) {
                    draft.gym.activeTimer = res.timer;
                  }
                });
              }}
              onTogglePauseRestTimer={() => {
                onUpdateState((draft) => {
                  if (draft.gym.activeTimer) {
                    draft.gym.activeTimer = toggleGymRestTimerPause(draft.gym.activeTimer);
                  }
                });
              }}
              onSkipRestTimer={handleRestTimerFinish}
              onCompleteRestTimer={handleRestTimerFinish}
              onToggleMinimizeRest={() => {
                onUpdateState((draft) => {
                  if (draft.gym.activeTimer) {
                    draft.gym.activeTimer.minimized = !draft.gym.activeTimer.minimized;
                  }
                });
              }}
              restTimer={
                state.gym.activeTimer ? (
                  <GymRestTimerBar
                    state={state}
                    onUpdateState={onUpdateState}
                    onComplete={handleRestTimerFinish}
                    onSkip={handleRestTimerFinish}
                    onOpenSettings={() => setIsSettingsModalOpen(true)}
                    nextExerciseName={
                      state.gym.activeTimer.kind === 'exercise' && activeWorkoutSession
                        ? activeWorkoutSession.exercises[
                            typeof state.gym.activeTimer.targetExerciseIndex === 'number'
                              ? state.gym.activeTimer.targetExerciseIndex
                              : liveSafeExIdx + 1
                          ]?.name || null
                        : null
                    }
                  />
                ) : undefined
              }
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onSelectExercise={setLiveExIdx}
              onSelectSet={setLiveSetIdx}
              onAdjustWeight={handleLiveAdjustWeight}
              onAdjustReps={handleLiveAdjustReps}
              onUpdateCurrentSet={(updates) =>
                handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, liveSafeSetIdx, updates)
              }
              onToggleCurrentSet={handleLiveCompleteCurrentSet}
              onToggleSet={(sIdx) => {
                if (!activeWorkoutSession || !liveCurrentEx?.sets[sIdx]) return;
                const targetSet = liveCurrentEx.sets[sIdx];
                const nextCompleted = !targetSet.completed;
                handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, sIdx, { completed: nextCompleted });
                if (nextCompleted && liveSets.length > sIdx + 1 && sIdx === liveSafeSetIdx) {
                  setLiveSetIdx(sIdx + 1);
                }
              }}
              onUpdateSetByIndex={(sIdx, updates) =>
                handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, sIdx, updates)
              }
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
              onEditSessionTimes={(startedAt, finishedAt) =>
                handleEditSessionTimes(activeWorkoutSession.id, startedAt, finishedAt)
              }
            />
          ) : (
            /* NO ACTIVE WORKOUT: TODAY LAUNCHER */
            <div className="space-y-6">
              <GymWorkoutLauncher
                launcherRef={launcherRef}
                plan={launcherPlan}
                routines={state.gym.routineTemplates}
                completed={todayPresentation}
                onSelect={setSessionTemplate}
                onStart={() => { if (launcherPlan.canStart) handleStartWorkout(sessionTemplate || undefined); }}
                onToggleRest={handleToggleRestDay}
                onEditRoutine={(id) => { setActiveTab('rutinas'); if (id) setEditingTemplateId(id); else setShowTemplates(true); }}
              />

              {GYM_NOTE_PLACEMENTS_ENABLED && <GymNoteSurface notes={state.notes.postits} storageUserId={storageUserId} privacyMode={state.settings.privacyMode} onOpenNote={onOpenNote} />}


            </div>
          )}
        </div>
      )}

      {!activeWorkoutSession && <div hidden={activeTab !== 'entrenar'}>
        <GymActivityCalendar
          sessions={state.gym.sessions}
          restDates={calendarRestDates}
          onOpenSession={(sessionId) => { setCalendarHistorySessionId(sessionId); setActiveTab('historial'); }}
        />
      </div>}

      {/* TAB 2: RUTINAS */}
      {activeTab === 'rutinas' && (
        <div className="space-y-6 animate-in fade-in">
              {/* Routine Templates Manager */}
              <section data-gym-routines className="space-y-4 py-2">
                <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-black tracking-tight text-[var(--text)]">Rutinas</h2>
                      <p className="mt-0.5 text-xs text-[var(--text-soft)]">Planes guardados · las sesiones ejecutadas están en Historial.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setIsSettingsModalOpen(true)}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text-soft)] transition-colors hover:border-[var(--blue)] hover:text-[var(--text)]"
                      title="Configurar descansos automáticos"
                    >
                      <AppIcon name="stopwatch" className="h-4 w-4" />
                      <span>Descansos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTemplates((v) => !v)}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <AppIcon name={showTemplates ? 'x' : 'plus'} className="h-4 w-4" />
                      {showTemplates ? 'Cancelar' : state.gym.routineTemplates.length === 0 ? 'Crear primera rutina' : 'Nueva rutina'}
                    </button>
                  </div>
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
                    <div className="px-5 py-6">
                      <p className="text-sm font-semibold text-[var(--text)]">Todavía no hay rutinas guardadas.</p>
                      <p className="mt-1 max-w-xl text-sm text-[var(--text-soft)]">Creá un plan con ejercicios, series y cargas objetivo. Las sesiones que hagas después aparecen en Historial.</p>
                    </div>
                  )}
                  {state.gym.routineTemplates.map((t) => {
                    const isEditing = editingTemplateId === t.id;
                    const isSelected = sessionTemplate === t.id;
                    const isEmpty = t.exercises.length === 0;
                    const identity = getRoutineIdentity(t.exercises, t.name, t.appearance);
                    const hasLegacyIcon = Boolean(
                      t.appearance?.icon
                      && !ROUTINE_ICON_OPTIONS.some((option) => option.name === t.appearance?.icon)
                    );
                    return (
                      <article key={t.id} className={`border-b border-[var(--border)] last:border-b-0 ${isSelected ? 'bg-[var(--blue-soft)]' : ''}`}>
                        <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${isEmpty ? 'Rutina sin ejercicios' : 'Seleccionar rutina'}: ${t.name}`}
                            disabled={isEmpty}
                            onClick={() => handleSelectRoutine(t.id)}
                            className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] ${isEmpty ? 'cursor-not-allowed opacity-75' : 'hover:bg-[var(--surface-muted)]'} ${isSelected ? 'ring-1 ring-inset ring-[var(--blue)]' : ''}`}
                          >
                            <RoutineIdentityMark exercises={t.exercises} name={t.name} appearance={t.appearance} compact />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-[var(--text)] sm:text-base">{t.name}</span>
                              <span className="mt-0.5 block text-xs leading-4 text-[var(--text-soft)]">
                                {isEmpty ? 'Sin ejercicios · Editá para empezar' : `${t.exercises.length} ejercicio${t.exercises.length === 1 ? '' : 's'}`}
                                {!isEmpty && (t.days?.length ? ` · ${t.days.map((day) => DAY_LABELS[day]).join(', ')}` : ' · Sin días asignados')}
                              </span>
                            </span>
                            {isSelected && <span className="shrink-0 text-[11px] font-bold text-[var(--blue)]">Elegida</span>}
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            {!isEmpty && <button
                              type="button"
                              onClick={() => handleStartWorkout(t.id)}
                              className="hidden min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)] lg:inline-flex"
                            >
                              Iniciar
                            </button>}
                            <button
                              type="button"
                              onClick={() => setEditingTemplateId(isEditing ? null : t.id)}
                              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)] sm:px-3"
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

                        {!isEmpty && (
                          <details className="group border-t border-[var(--border)] px-4 sm:px-5">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)]">
                              <span>Ejercicios y objetivos</span>
                              <span className="flex items-center gap-2">
                                {t.exercises.length} {t.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                                <AppIcon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
                              </span>
                            </summary>
                            <ol className="divide-y divide-[var(--border)] border-t border-[var(--border)] pb-1">
                              {t.exercises.map((exercise, exerciseIndex) => {
                                const firstSet = exercise.sets?.[0];
                                const targetWeight = firstSet?.weight ?? exercise.weight ?? 0;
                                const loadLabel = targetWeight > 0
                                  ? `${targetWeight} kg`
                                  : exercise.equipment === 'corporal' ? 'Peso corporal' : 'Sin carga fijada';
                                return (
                                  <li key={exercise.id || `${exercise.name}-${exerciseIndex}`} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                                    <span className="min-w-0 flex-1 text-sm font-medium text-[var(--text)]">{exerciseIndex + 1}. {exercise.name}</span>
                                    <span className="shrink-0 text-xs tabular-nums text-[var(--text-soft)]">
                                      {exercise.sets?.length || 1} series · {firstSet?.reps ?? 10} reps · {loadLabel}
                                    </span>
                                  </li>
                                );
                              })}
                            </ol>
                          </details>
                        )}

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

                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-4">
                              <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                  <RoutineIdentityMark exercises={t.exercises} name={t.name} appearance={t.appearance} compact />
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">Apariencia</p>
                                    <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                                      {t.appearance?.icon
                                        ? `Icono personalizado (${ROUTINE_ICON_LABELS[t.appearance.icon] || t.appearance.icon})`
                                        : `Automático (${identity.label})`}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    aria-pressed={!t.appearance?.icon}
                                    onClick={() => onUpdateState((draft) => {
                                      updateGymTemplate(draft.gym, t.id, { appearance: null });
                                    })}
                                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                                      !t.appearance?.icon
                                        ? 'bg-[var(--blue)] text-white shadow-xs'
                                        : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                                    }`}
                                  >
                                    <AppIcon name="sparkles" className="h-3.5 w-3.5" />
                                    Automático
                                  </button>

                                  <span className="hidden h-5 w-px bg-[var(--border)] sm:inline-block" aria-hidden="true" />

                                  <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Icono de rutina">
                                    {hasLegacyIcon && t.appearance?.icon && (
                                      <button
                                        type="button"
                                        role="radio"
                                        aria-checked="true"
                                        title={ROUTINE_ICON_LABELS[t.appearance.icon] || 'Icono anterior'}
                                        aria-label={`${ROUTINE_ICON_LABELS[t.appearance.icon] || 'Icono anterior'}; selección conservada`}
                                        onClick={() => onUpdateState((draft) => {
                                          updateGymTemplate(draft.gym, t.id, { appearance: { icon: t.appearance?.icon } });
                                        })}
                                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 ring-2 ring-indigo-500 dark:text-indigo-300"
                                      >
                                        <GymIcon icon={identity.icon} decorative className="h-5 w-5" />
                                      </button>
                                    )}
                                    {ROUTINE_ICON_OPTIONS.map((opt) => {
                                      const isSelected = t.appearance?.icon === opt.name;
                                      return (
                                        <button
                                          key={opt.name}
                                          type="button"
                                          role="radio"
                                          aria-checked={isSelected}
                                          title={opt.label}
                                          aria-label={opt.label}
                                          onClick={() => onUpdateState((draft) => {
                                            updateGymTemplate(draft.gym, t.id, { appearance: { icon: opt.name } });
                                          })}
                                          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                                            isSelected
                                              ? 'bg-blue-500/15 text-blue-600 ring-2 ring-blue-500 dark:text-blue-400'
                                              : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                                          }`}
                                        >
                                          <GymIcon icon={opt.icon} decorative className="h-5 w-5" />
                                        </button>
                                      );
                                    })}
                                  </div>
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
                                  const hasCustomRest = ex.restSecondsMode === 'custom'
                                    || (ex.restSecondsMode === undefined && typeof ex.restSeconds === 'number' && ex.restSeconds !== 90);
                                  const isRestDisabled = ex.restSecondsMode === 'disabled' || ex.timerEnabled === false;
                                  return (
                                    <section key={ex.id || exIdx} className="rounded-2xl bg-[var(--card)] p-3 shadow-xs ring-1 ring-inset ring-[var(--border)] sm:p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-[var(--indigo)]">
                                            <GymExerciseArtwork
                                              name={ex.name}
                                              equipment={ex.equipment || (ex.barWeight && ex.barWeight > 0 ? 'barra' : undefined)}
                                              compact
                                            />
                                            <span className="absolute -bottom-1 -right-1 rounded-md bg-[var(--card)] px-1 text-[9px] font-black tabular-nums text-[var(--text-faint)] ring-1 ring-[var(--border)]">
                                              {String(exIdx + 1).padStart(2, '0')}
                                            </span>
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
                                                })}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-transparent bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              />
                                            </label>
                                            <div className="text-xs font-medium text-[var(--text-soft)]">
                                              <label htmlFor={`rest-mode-${t.id}-${ex.id || exIdx}`}>Descanso (s)</label>
                                              <select
                                                id={`rest-mode-${t.id}-${ex.id || exIdx}`}
                                                value={isRestDisabled ? 'disabled' : (hasCustomRest ? 'custom' : 'inherit')}
                                                onChange={(event) => {
                                                  const val = event.target.value;
                                                  if (val === 'disabled') {
                                                    handleUpdateTemplateExercise(t.id, exIdx, {
                                                      restSecondsMode: 'disabled',
                                                      timerEnabled: false,
                                                    });
                                                  } else if (val === 'custom') {
                                                    handleUpdateTemplateExercise(t.id, exIdx, {
                                                      restSecondsMode: 'custom',
                                                      timerEnabled: true,
                                                      restSeconds: ex.restSeconds && ex.restSeconds > 0 ? ex.restSeconds : gymSettings.restBetweenSetsSeconds,
                                                    });
                                                  } else {
                                                    handleUpdateTemplateExercise(t.id, exIdx, {
                                                      restSecondsMode: 'inherit',
                                                      timerEnabled: true,
                                                    });
                                                  }
                                                }}
                                                className="mt-1 min-h-11 w-full rounded-xl border border-transparent bg-[var(--surface-muted)] px-2 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                              >
                                                <option value="inherit">General ({gymSettings.restBetweenSetsSeconds} s)</option>
                                                <option value="custom">Personalizado</option>
                                                <option value="disabled">Sin descanso</option>
                                              </select>
                                              {hasCustomRest && !isRestDisabled && (
                                                <input
                                                  aria-label={`Descanso personalizado de ${ex.name} en segundos`}
                                                  type="number"
                                                  min={15}
                                                  max={600}
                                                  step={15}
                                                  value={ex.restSeconds || gymSettings.restBetweenSetsSeconds}
                                                  onChange={(event) => handleUpdateTemplateExercise(t.id, exIdx, {
                                                    restSecondsMode: 'custom',
                                                    timerEnabled: true,
                                                    restSeconds: Math.min(600, Math.max(15, Number(event.target.value) || gymSettings.restBetweenSetsSeconds)),
                                                  })}
                                                  className="mt-1 min-h-11 w-full rounded-xl border border-[var(--blue)]/30 bg-[var(--bg-elevated)] px-3 text-sm font-semibold text-[var(--text)] focus:border-[var(--blue)]"
                                                />
                                              )}
                                            </div>
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

        </div>
      )}

      {/* TAB 3: SESIONES EJECUTADAS */}
      {activeTab === 'historial' && (
        <div ref={historyRootRef} className="space-y-6 animate-in fade-in">
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
                    <span className="tabular-nums font-bold text-[var(--text)]">
                      {fmtDate(s.date)} — {s.exercises.length} {s.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
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
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-7">
              <h2 className="text-base font-bold text-[var(--text)]">Sin sesiones ejecutadas</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--text-soft)]">Las rutinas son planes. Acá aparecen los entrenamientos con series registradas; todavía no hay sesiones para mostrar.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setActiveTab('entrenar')} className="min-h-11 rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--bg-elevated)] hover:opacity-90">Preparar entrenamiento</button>
                <button type="button" onClick={() => setActiveTab('rutinas')} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)]">Ver rutinas</button>
              </div>
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
                      initiallyExpanded={session.id === calendarHistorySessionId}
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
                      onEditSessionTimes={(s, f) => handleEditSessionTimes(session.id, s, f)}
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
                        initiallyExpanded={session.id === calendarHistorySessionId}
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
                        onEditSessionTimes={(s, f) => handleEditSessionTimes(session.id, s, f)}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PROGRESIÓN & SALUD */}
      {activeTab === 'progresion' && (
        <div className="space-y-7 animate-in fade-in">
          <section data-gym-progress-overview className="relative overflow-hidden rounded-3xl bg-[var(--card)] shadow-sm ring-1 ring-inset ring-[var(--border)]">
            <span className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-blue-500/[0.08] blur-2xl" />
            <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-[var(--blue)]">
                  <AppIcon name="activity" className="h-4 w-4" />
                  <p className="text-xs font-bold">Entrenamientos esta semana</p>
                </div>
                <p className="mt-3 flex items-end gap-2 text-[var(--text)]">
                  <span className="text-6xl font-black leading-none tracking-[-0.06em] tabular-nums sm:text-7xl">
                    {calendarOverview.weekCount}
                  </span>
                  <span className="pb-1 text-base font-semibold leading-tight text-[var(--text-soft)]">
                    {calendarOverview.weekCount === 1 ? 'sesión' : 'sesiones'}<br />esta semana
                  </span>
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-6 border-t border-[var(--border)] pt-5 lg:min-w-80 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
                <div>
                  <dt className="text-xs font-medium text-[var(--text-faint)]">Frecuencia este mes</dt>
                  <dd className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                    {calendarOverview.monthCount}
                    <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">sesiones</span>
                  </dd>
                </div>
                {gymProgress.frequency.last30Days.volume > 0 && (
                  <div>
                    <dt className="text-xs font-medium text-[var(--text-faint)]">Volumen en 30 días</dt>
                    <dd className="mt-1 text-2xl font-black tabular-nums text-[var(--text)]">
                      {gymProgress.frequency.last30Days.volume.toLocaleString('es-UY')}
                      <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">kg</span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <button
            type="button"
            onClick={openBodyComposition}
            aria-controls="gym-body-health"
            className="gym-body-health-shortcut group flex min-h-20 w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-5"
          >
            <span className="gym-body-health-shortcut-icon" aria-hidden="true">
              <GymIcon icon="gym-scale" decorative className="h-8 w-8" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-[var(--text)]">Peso y composición corporal</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--text-soft)]">Registrar medidas y revisar la evolución corporal.</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-[var(--accent)]">
              {peso != null && <span className="privacy-sensitive hidden tabular-nums sm:inline">{peso} kg</span>}
              <AppIcon name="chevronDown" className="h-4 w-4 -rotate-90 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

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
                            : 'Aún sin tendencia'}
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

          <details ref={bodyHealthDetailsRef} id="gym-body-health" className="group border-y border-[var(--border)]">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 text-sm font-semibold text-[var(--text)]">
              <span>Salud corporal</span>
              <span className="flex items-center gap-3 text-xs font-medium text-[var(--text-soft)]">
                {peso != null ? `${peso} kg` : 'Sin peso registrado'}
                <AppIcon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div ref={bodyHealthContentRef} id="qa-focus-peso" tabIndex={-1} className="space-y-5 scroll-mt-24 border-t border-[var(--border)] py-5 outline-none">
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
          streakIncrease={completedSummarySession.streakIncrease}
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

      {/* Gym Rest Timer Settings Modal */}
      <GymRestSettingsModal
        settings={getGymSettings(state.gym)}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={(nextSettings) => {
          onUpdateState((draft) => {
            draft.gym.settings = nextSettings;
          });
        }}
      />
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
  onEditSessionTimes?: (startedAt: string | null, finishedAt: string | null) => void;
  showSessionActions?: boolean;
}

const WorkoutSessionCard: React.FC<WorkoutSessionCardProps> = ({
  session,
  allSessions,
  onFinishWorkout,
  onDeleteSession,
  onEditSessionDate,
  onEditSessionWeek,
  onEditSessionTimes,
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
  const duration = calculateSessionDuration(session.startedAt, session.finishedAt);
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
                className="px-2 py-1 text-xs tabular-nums font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <input
                type="text"
                value={session.weekLabel || ''}
                onChange={(e) => onEditSessionWeek(e.target.value)}
                placeholder="Semana (ej: Semana 1)"
                className="w-28 px-2 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
              <input
                type="time"
                value={session.startedAt || ''}
                onChange={(e) => onEditSessionTimes?.(e.target.value || null, session.finishedAt || null)}
                className="px-2 py-1 text-xs tabular-nums font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                title="Hora de inicio"
              />
              <input
                type="time"
                value={session.finishedAt || ''}
                onChange={(e) => onEditSessionTimes?.(session.startedAt || null, e.target.value || null)}
                className="px-2 py-1 text-xs tabular-nums font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
                title="Hora de fin"
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
              <span className="font-extrabold tabular-nums text-sm text-[var(--text)]">
                {fmtDate(session.date)}
              </span>
              {session.weekLabel && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {session.weekLabel}
                </span>
              )}
              {duration.minutes > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)] border border-[var(--border)] tabular-nums">
                  {duration.formatted}
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
                title="Editar fecha, semana u horarios"
              >
                ✏️
              </button>
            </div>
          )}
        </div>

        {/* Volume & Stats */}
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className="tabular-nums font-extrabold text-[var(--text)]">{totalVol} kg</span>
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
            const previousBest = getPreviousSessionBestLabel(allSessions, session.id, exercise.name, exercise.id);
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
                      <span className="text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
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
                          className="bg-[var(--card)] border border-[var(--border)] rounded-md px-1.5 py-0.5 text-xs tabular-nums font-bold cursor-pointer text-[var(--text)]"
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[var(--text-soft)]">
                              {set.type === 'warmup' ? 'Aprox' : `Serie ${setIdx + 1}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextType = set.type === 'warmup' ? 'normal' : 'warmup';
                                onUpdateSet(exIdx, setIdx, { type: nextType });
                              }}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors ${
                                set.type === 'warmup'
                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                  : 'bg-[var(--surface-muted)] text-[var(--text-faint)] hover:text-[var(--text)]'
                              }`}
                              title="Alternar entre serie de aproximación y serie efectiva"
                            >
                              {set.type === 'warmup' ? 'Aprox' : 'Efectiva'}
                            </button>
                          </div>
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
                            <td className="py-1.5 tabular-nums text-[var(--text-soft)]">
                              <div className="flex items-center gap-1">
                                <span className="font-bold">#{setIdx + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextType = set.type === 'warmup' ? 'normal' : 'warmup';
                                    onUpdateSet(exIdx, setIdx, { type: nextType });
                                  }}
                                  className={`rounded px-1 py-0.5 text-[9px] font-extrabold uppercase transition-colors ${
                                    set.type === 'warmup'
                                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                      : 'bg-[var(--surface-muted)] text-[var(--text-faint)] hover:text-[var(--text)]'
                                  }`}
                                  title="Alternar entre serie de aproximación y serie efectiva"
                                >
                                  {set.type === 'warmup' ? 'Aprox' : 'Ef'}
                                </button>
                              </div>
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
                                  className="w-14 px-1 py-1 text-xs tabular-nums font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-center"
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
                            <td className="py-1.5 tabular-nums text-[11px] text-[var(--text-soft)]">
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
                                  className="w-11 px-1 py-1 text-xs tabular-nums font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-center"
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
                    Descanso: {exercise.restSecondsMode === 'custom' && typeof exercise.restSeconds === 'number'
                      ? `${exercise.restSeconds}s personalizado`
                      : 'configuración general'}
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
            className="w-16 px-2 py-1.5 text-xs tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
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
            className="w-14 px-2 py-1.5 text-xs tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
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

const LatestWorkoutSession: React.FC<WorkoutSessionCardProps & { initiallyExpanded?: boolean }> = (props) => {
  const { session, allSessions, onDeleteSession, onSaveAsTemplate } = props;
  const [isExpanded, setIsExpanded] = useState(Boolean(props.initiallyExpanded));
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
      data-gym-history-session={session.id}
      tabIndex={-1}
      style={{ scrollMarginTop: 96 }}
      className="overflow-visible rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xs transition-all hover:border-[var(--border-strong)]"
    >
      <div className="p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-[var(--blue)]">
              <AppIcon name="calendar" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <time className="text-xs font-semibold text-[var(--text-soft)]" dateTime={session.date}>
                  {formatGymSessionDateTime(session)}
                </time>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <AppIcon name="check" className="h-3 w-3" />
                  Completada
                </span>
                {presentation.durationLabel && (
                  <span className="text-[10px] font-semibold text-[var(--text-faint)]" title="Tiempo entre las horas de inicio y fin guardadas">
                    · {presentation.durationLabel}
                  </span>
                )}
                {presentation.prExerciseCount > 0 && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-300">
                    · {presentation.prExerciseCount} PR{presentation.prExerciseCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <h3 className="mt-0.5 truncate text-base font-black tracking-tight text-[var(--text)] sm:text-lg">
                {presentation.name}
              </h3>
              {session.exercises.length > 0 && (
                <p className="mt-0.5 truncate text-xs text-[var(--text-faint)]">
                  {session.exercises.map((e) => e.name).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {secondaryActions}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--border)]/70 pt-3 sm:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))] sm:items-end">
          {presentation.volumeKg > 0 && (
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Volumen</dt>
              <dd className="mt-0.5 text-2xl font-black tracking-tight tabular-nums text-[var(--text)]">
                {presentation.volumeKg.toLocaleString('es-UY')}
                <span className="ml-1 text-xs font-semibold text-[var(--text-soft)]">kg</span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Series realizadas</dt>
            <dd className="mt-0.5 text-base font-black tabular-nums text-[var(--text)]">{presentation.completedSetCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Ejercicios</dt>
            <dd className="mt-0.5 text-base font-black tabular-nums text-[var(--text)]">{presentation.exerciseCount}</dd>
          </div>
          {presentation.durationLabel && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]" title="Diferencia entre la hora de inicio y la hora de fin guardadas">Tiempo registrado</dt>
              <dd className="mt-0.5 text-base font-black tabular-nums text-[var(--text)]">{presentation.durationLabel}</dd>
            </div>
          )}
          {presentation.prExerciseCount > 0 && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Mejores marcas</dt>
              <dd className="mt-0.5 text-base font-black tabular-nums text-amber-600 dark:text-amber-300">
                {presentation.prExerciseCount} PR{presentation.prExerciseCount === 1 ? '' : 's'}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3.5 flex flex-col gap-2 rounded-xl bg-[var(--surface-muted)] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-[var(--text-soft)]">
            {presentation.bestSet ? (
              <>
                <span className="font-bold text-[var(--text-faint)]">Mejor serie: </span>
                <span className="font-semibold text-[var(--text)]">
                  {presentation.bestSet.exerciseName} · <strong className="tabular-nums">{presentation.bestSet.weight} kg × {presentation.bestSet.reps}</strong>
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-[var(--text-faint)]">Mejor serie: </span>
                <span>Sin una mejor serie registrada.</span>
              </>
            )}
          </p>
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-[var(--blue)] transition-colors hover:bg-[var(--card)]"
          >
            {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
            <AppIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div data-latest-session-detail className="border-t border-[var(--border)] bg-[var(--card-subtle)] px-4 py-4 sm:px-5">
          <div className="divide-y divide-[var(--border)]">
            {session.exercises.map((exercise, exerciseIndex) => {
              const inferred = inferExerciseEquipment(exercise.name);
              const equipment = exercise.equipment ||
                (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : inferred.equipment);
              const previousBest = getPreviousSessionBestLabel(allSessions, session.id, exercise.name, exercise.id);
              return (
                <section key={exercise.id || exerciseIndex} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex items-center gap-2.5">
                      <GymExerciseArtwork
                        name={exercise.name}
                        equipment={exercise.equipment || (exercise.barWeight && exercise.barWeight > 0 ? 'barra' : undefined)}
                        className="gym-history-exercise-icon"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text)]">{exercise.name}</h4>
                        <p className="text-xs text-[var(--text-soft)]">
                          {[exercise.muscleGroup, EQUIPMENT_LABELS[equipment]].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {previousBest && (
                      <p className="text-xs text-[var(--text-soft)] sm:text-right">
                        Referencia anterior: <span className="tabular-nums font-semibold text-[var(--text)]">{previousBest}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    {(exercise.sets || []).map((set, setIndex) => (
                      <div
                        key={set.id || setIndex}
                        className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 hover:bg-[var(--surface-muted)]"
                      >
                        <span className="text-[11px] font-semibold text-[var(--text-faint)]">
                          {set.type === 'warmup' ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-500/20">Aprox</span>
                          ) : (
                            `Serie ${setIndex + 1}`
                          )}
                        </span>
                        <span className="text-right text-sm font-black tabular-nums text-[var(--text)]">
                          {Number(set.weight) || 0} kg × {Number(set.reps) || 0}
                        </span>
                        {set.completed ? (
                          <span className="h-2 w-2 rounded-full bg-emerald-500/80" aria-label="Serie realizada" />
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

          <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--blue)]"
            >
              <AppIcon name="edit" className="h-3.5 w-3.5 text-[var(--blue)]" />
              Editar sesión
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
