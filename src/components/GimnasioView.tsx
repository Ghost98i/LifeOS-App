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
import { Exercise, ExerciseEquipment, GymSession, GymSet, LifeOSState, MuscleGroup } from '../types';
import { GymRestTimerBar } from './GymRestTimerBar';
import { GymPlateCalculator } from './GymPlateCalculator';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { BodyCompositionCard } from './BodyCompositionCard';
import { WorkoutSummaryModal } from './WorkoutSummaryModal';
import { ExerciseHistoryModal } from './ExerciseHistoryModal';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import {
  todayISO,
  fmtDate,
  uid,
} from '../lib/storage';
import {
  getExerciseGhostValues,
  calcDetailedPRs,
  detectSessionPRs,
  NewPRRecord,
} from '../lib/gymMetrics';
import {
  currentWeight,
  weightVariation,
  calcIMC,
  imcCategory,
  calcGymStreakDetails,
  sortedWeight,
} from '../lib/calculations';
import { buildGymHistory } from '../lib/gymHistory';
import {
  EXERCISE_EQUIPMENT_OPTIONS,
  inferExerciseEquipment,
  inferMuscleGroup,
} from '../lib/gymMigration';
import {
  addExerciseToGymSession,
  addSetToGymSession,
  deleteGymSession,
  deleteGymSessionExercise,
  deleteGymSessionSet,
  deleteGymTemplate,
  discardGymSession,
  finishGymSession,
  getActiveGymSession,
  getPerformedGymVolume,
  isPerformedGymSession,
  previewExerciseHistoryPropagation,
  previewNormalizeGymHistory,
  previewTemplateHistoryPropagation,
  requestGymSessionDeletion,
  startGymSession,
  updateGymSessionExercise,
  updateGymSession,
  updateGymSessionSet,
} from '../lib/gymFlows';
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
  const pastSessions = (sessions || [])
    .filter((s) =>
      s.id !== currentSessionId &&
      isPerformedGymSession(s) &&
      (s.exercises || []).some((e) => e.name?.trim().toLowerCase() === norm)
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (pastSessions.length === 0) return null;
  const ex = (pastSessions[0].exercises || []).find((e) => e.name?.trim().toLowerCase() === norm);
  if (!ex) return null;
  if (ex.sets && ex.sets.length > 0) {
    const bestSet = ex.sets
      .filter((set) => set.completed === true)
      .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    if (!bestSet) return null;
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

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
  const [historyExerciseName, setHistoryExerciseName] = useState<string | null>(null);

  // Workout Summary Modal state (after finishing a workout)
  const [completedSummarySession, setCompletedSummarySession] = useState<{
    session: GymSession;
    newPRs: NewPRRecord[];
  } | null>(null);

  const allExerciseNames = Array.from(
    new Set(
      (state.gym?.sessions || []).flatMap((s) => (s.exercises || []).map((e) => e.name?.trim())).filter(Boolean)
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
    (state.gym?.restDays || []).includes(todayISO()) ||
    Boolean(state.checkoutLog?.[todayISO()]?.trainedSkipped);
  const gymSessions = state.gym?.sessions;
  const sortedSessions = useMemo(() => {
    return [...(gymSessions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [gymSessions]);

  const latestSession = useMemo(() => {
    return sortedSessions.find(isPerformedGymSession) || sortedSessions[0] || null;
  }, [sortedSessions]);

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
  const ref = new Date();
  const diasEntrenadosAnio = new Set(
    (state.gym?.sessions || [])
      .filter((s) => isPerformedGymSession(s) && new Date(s.date + 'T00:00:00').getFullYear() === ref.getFullYear())
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

  const liftingChartData = (state.gym?.sessions || [])
    .filter((s) =>
      isPerformedGymSession(s) &&
      (s.exercises || []).some((e) => e.name?.trim().toLowerCase() === activeExercise.trim().toLowerCase())
    )
    .map((s) => {
      const exList = (s.exercises || []).filter(
        (e) => e.name?.trim().toLowerCase() === activeExercise.trim().toLowerCase()
      );
      const maxKg = Math.max(
        ...exList.flatMap((e) =>
          e.sets && e.sets.length > 0
            ? e.sets.filter((set) => set.completed === true).map((set) => Number(set.weight) || 0)
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
      if (t && t.exercises[exerciseIndex]) {
        t.exercises[exerciseIndex] = { ...t.exercises[exerciseIndex], ...updates };
      }
    });
  };

  const handleDeleteExerciseFromTemplate = (templateId: string, exerciseIndex: number) => {
    onUpdateState((draft) => {
      const t = draft.gym.routineTemplates.find((x) => x.id === templateId);
      if (t) {
        t.exercises.splice(exerciseIndex, 1);
      }
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

  const handlePropagateTemplateToHistory = (templateId: string) => {
    const tmpl = state.gym.routineTemplates.find((t) => t.id === templateId);
    if (!tmpl || tmpl.exercises.length === 0) {
      showToast('La plantilla no contiene ejercicios para propagar.', 'info');
      return;
    }
    const preview = previewTemplateHistoryPropagation(state.gym, templateId);
    if (preview.affectedSessionIds.length === 0) {
      showToast('El historial completado ya utiliza esta configuración.', 'info');
      return;
    }
    if (!window.confirm(
      `Se actualizarán ${preview.affectedExerciseCount} ejercicios en ${preview.affectedSessionIds.length} sesiones completadas. ¿Continuar?`
    )) return;
    onUpdateState((draft) => {
      const current = previewTemplateHistoryPropagation(draft.gym, templateId);
      draft.gym.sessions = current.updatedSessions;
      draft.gym.routineTemplates = current.updatedTemplates;
    });
    showToast(`⚡ Plantilla "${tmpl.name}" propagada: ${preview.affectedSessionIds.length} sesiones actualizadas.`);
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
        sessionId={activeWorkoutSession?.id || (latestSession?.id ?? '')}
        onUpdateState={onUpdateState}
      />

      {/* Main Navigation Segmented Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('entrenar')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'entrenar'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
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
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
              : 'text-[var(--text-soft)] hover:text-[var(--text)]'
          }`}
        >
          <AppIcon name="calendar" className="h-4 w-4" />
          <span>Historial de Semanas</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
            {state.gym.sessions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('progresion')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'progresion'
              ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
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
                        {getPerformedGymVolume(activeWorkoutSession)} kg
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
                        <button
                          type="button"
                          onClick={() => setHistoryExerciseName(liveCurrentEx.name)}
                          className="text-base font-black text-[var(--text)] tracking-tight hover:text-[var(--blue)] transition text-left cursor-pointer flex items-center gap-1.5"
                          title="Ver historial completo y récords de este ejercicio"
                        >
                          <span>{liveCurrentEx.name}</span>
                          <span className="text-xs font-normal text-[var(--blue)]">↗</span>
                        </button>
                        {liveCurrentEx.muscleGroup && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)]">
                            {liveCurrentEx.muscleGroup}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setHistoryExerciseName(liveCurrentEx.name)}
                          className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-2 py-0.5 rounded-md cursor-pointer transition flex items-center gap-1"
                          title="Ver ficha e historial"
                        >
                          <AppIcon name="activity" className="h-3 w-3" />
                          <span>Historial</span>
                        </button>
                      </div>
                      {getPreviousExerciseStats(state.gym.sessions, activeWorkoutSession.id, liveCurrentEx.name) && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                          🏆 Mejor anterior: {getPreviousExerciseStats(state.gym.sessions, activeWorkoutSession.id, liveCurrentEx.name)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={liveCurrentEx.equipment || (liveCurrentEx.barWeight && liveCurrentEx.barWeight > 0 ? 'barra' : 'mancuerna')}
                        onChange={(e) => {
                          const eq = e.target.value as ExerciseEquipment;
                          handleUpdateExerciseEquipment(activeWorkoutSession.id, liveSafeExIdx, eq);
                        }}
                        className="px-2 py-1 text-xs font-semibold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                        title="Tipo de equipamiento"
                      >
                        <option value="barra">🏋️ Barra</option>
                        <option value="mancuerna">💪 Mancuerna</option>
                        <option value="polea">🪢 Polea</option>
                        <option value="maquina">⚙️ Máquina</option>
                        <option value="corporal">🤸 Corporal</option>
                      </select>

                      {(liveCurrentEx.equipment === 'barra' || (!liveCurrentEx.equipment && (liveCurrentEx.barWeight ?? 20) > 0)) && (
                        <select
                          value={liveCurrentEx.barWeight ?? 20}
                          onChange={(e) => handleUpdateExerciseBar(activeWorkoutSession.id, liveSafeExIdx, Number(e.target.value))}
                          className="px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                          title="Peso de la barra"
                        >
                          <option value={20}>20 kg (Olímpica)</option>
                          <option value={15}>15 kg (Mujer)</option>
                          <option value={10}>10 kg (W / EZ)</option>
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          handlePropagateExerciseToHistory(liveCurrentEx.name, {
                            equipment: liveCurrentEx.equipment || 'mancuerna',
                            barWeight: liveCurrentEx.barWeight ?? 0,
                            muscleGroup: liveCurrentEx.muscleGroup as MuscleGroup,
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-[var(--card)] text-[var(--text-soft)] hover:text-blue-600 border border-[var(--border)] text-[10px] font-bold cursor-pointer"
                        title="Aplicar este equipamiento a todas las sesiones pasadas con este ejercicio"
                      >
                        ⚡ Al historial
                      </button>

                      {(liveCurrentEx.equipment === 'barra' || (!liveCurrentEx.equipment && (liveCurrentEx.barWeight ?? 20) > 0)) && (
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
                      )}
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
                              const eq = liveCurrentEx.equipment || (liveCurrentEx.barWeight && liveCurrentEx.barWeight > 0 ? 'barra' : 'mancuerna');
                              const bar = liveCurrentEx.barWeight ?? 0;
                              const w = Number(liveCurrentSet.weight) || 0;
                              if (eq === 'barra' && bar > 0) {
                                const perSide = Math.max(0, (w - bar) / 2);
                                return `${perSide} kg por lado (en barra de ${bar} kg)`;
                              }
                              if (eq === 'mancuerna') {
                                return `Mancuerna de ${w} kg`;
                              }
                              if (eq === 'polea') {
                                return `Polea: ${w} kg`;
                              }
                              if (eq === 'maquina') {
                                return `Máquina: ${w} kg`;
                              }
                              if (eq === 'corporal') {
                                return w > 0 ? `Corporal + ${w} kg lastre` : 'Peso corporal';
                              }
                              return `${w} kg`;
                            })()}
                          </span>
                        </div>
                      </div>
                      {/* GHOST VALUE BANNER FOR ACTIVE SET */}
                      {(() => {
                        const ghost = liveCurrentEx ? getExerciseGhostValues(state.gym.sessions, liveCurrentEx.name, activeWorkoutSession.id) : null;
                        const ghostSet = ghost?.sets[liveSafeSetIdx];
                        if (!ghostSet) return null;
                        return (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                                Anterior #{liveSafeSetIdx + 1}:
                              </span>
                              <strong className="font-mono text-xs text-[var(--text)]">
                                {ghostSet.weight} kg × {ghostSet.reps} reps
                              </strong>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateSet(activeWorkoutSession.id, liveSafeExIdx, liveSafeSetIdx, {
                                  weight: ghostSet.weight,
                                  reps: ghostSet.reps,
                                });
                                playSound('click');
                                showToast(`Serie #${liveSafeSetIdx + 1}: ${ghostSet.weight} kg × ${ghostSet.reps}`);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] hover:bg-[var(--blue)] hover:text-white transition cursor-pointer shrink-0"
                            >
                              Usar anterior
                            </button>
                          </div>
                        );
                      })()}

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
                  onAddExercise={(name, muscle, equipment, barW, w, r) =>
                    handleAddExerciseToSession(activeWorkoutSession.id, name, muscle, equipment, barW, w, r)
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
                  onOpenHistory={setHistoryExerciseName}
                />
              </div>
            </div>
          ) : (
            /* NO ACTIVE WORKOUT: TODAY LAUNCHER */
            <div className="space-y-6">
              {/* Today's Gym Status Hero Card */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                    Entrenamiento
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--text)]">
                    {isTrainedToday
                      ? 'Sesión de hoy completada'
                      : isRestDayToday
                      ? 'Día de descanso activo'
                      : sessionTemplate
                      ? `Rutina: ${state.gym.routineTemplates.find((t) => t.id === sessionTemplate)?.name || 'Personalizada'}`
                      : 'Rutina de hoy'}
                  </h2>
                  <p className="text-xs text-[var(--text-soft)] mt-0.5">
                    {isTrainedToday
                      ? 'Tus datos de series y volumen quedaron registrados.'
                      : isRestDayToday
                      ? 'Racha protegida. Día de recuperación muscular.'
                      : `${state.gym.routineTemplates.length} plantilla(s) disponible(s) · Racha de ${streak}d`}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                  {!isTrainedToday && (
                    <button
                      type="button"
                      onClick={handleToggleRestDay}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] bg-[var(--surface-muted)] transition cursor-pointer"
                    >
                      {isRestDayToday ? 'Cancelar descanso' : 'Descanso hoy'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartWorkout(sessionTemplate || undefined)}
                    className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 text-xs font-bold rounded-xl shadow-2xs transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2"
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
                  <div className="space-y-4 pt-2 border-t border-[var(--border)] animate-in fade-in">
                    {/* Normalization Banner */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <div>
                        <strong className="text-xs text-[var(--text)] block">
                          🪄 Auto-reparación y normalización del historial
                        </strong>
                        <p className="text-[11px] text-[var(--text-soft)]">
                          Corrige de una sola vez todas las mancuernas, poleas, máquinas y barras de las semanas pasadas en lote.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleNormalizeAllHistory}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition"
                      >
                        🪄 Reparar todo el historial
                      </button>
                    </div>

                    {/* Create Template Form */}
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

                    {/* Templates List & Expanded Exercise Editor */}
                    <div className="space-y-3">
                      {state.gym.routineTemplates.map((t) => {
                        const isEditing = editingTemplateId === t.id;
                        return (
                          <div
                            key={t.id}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden transition-all shadow-2xs"
                          >
                            <div className="p-3.5 flex items-center justify-between gap-2 flex-wrap">
                              <div>
                                <strong className="text-xs font-bold text-[var(--text)] block">{t.name}</strong>
                                <span className="text-[11px] text-[var(--text-soft)]">
                                  {t.exercises.length} ejercicio{t.exercises.length === 1 ? '' : 's'} configurado{t.exercises.length === 1 ? '' : 's'}
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
                                  onClick={() => setEditingTemplateId(isEditing ? null : t.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer border transition ${
                                    isEditing
                                      ? 'bg-[var(--text)] text-[var(--bg-elevated)] border-transparent'
                                      : 'bg-[var(--card)] text-[var(--text)] border-[var(--border)] hover:border-blue-500/40'
                                  }`}
                                >
                                  {isEditing ? 'Cerrar editor ✕' : '✏️ Editar ejercicios'}
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

                            {/* Template Exercises Sub-editor */}
                            {isEditing && (
                              <div className="p-4 border-t border-[var(--border)] bg-[var(--card)] space-y-4 animate-in fade-in">
                                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 flex-wrap">
                                  <span className="text-xs font-bold text-[var(--text-soft)]">
                                    Ejercicios y equipamiento de la plantilla "{t.name}"
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handlePropagateTemplateToHistory(t.id)}
                                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                    title="Aplica este equipamiento y barra a todas las sesiones anteriores con estos mismos ejercicios"
                                  >
                                    ⚡ Propagar toda la plantilla al historial
                                  </button>
                                </div>

                                {t.exercises.length === 0 ? (
                                  <p className="text-xs text-[var(--text-faint)] py-2">
                                    Esta plantilla aún no tiene ejercicios. Agregá el primero abajo.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {t.exercises.map((ex, exIdx) => {
                                      const exEq = ex.equipment || (ex.barWeight && ex.barWeight > 0 ? 'barra' : 'mancuerna');
                                      return (
                                        <div
                                          key={ex.id || exIdx}
                                          className="p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-between gap-2 flex-wrap text-xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-[var(--text)]">{ex.name}</span>
                                            {ex.muscleGroup && (
                                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)]">
                                                {ex.muscleGroup}
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2 flex-wrap">
                                            {/* Equipment selector */}
                                            <select
                                              value={exEq}
                                              onChange={(e) => {
                                                const eq = e.target.value as ExerciseEquipment;
                                                const bw = eq === 'barra' ? 20 : 0;
                                                handleUpdateTemplateExercise(t.id, exIdx, { equipment: eq, barWeight: bw });
                                              }}
                                              className="px-2 py-1 text-xs font-semibold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                                            >
                                              <option value="barra">🏋️ Barra</option>
                                              <option value="mancuerna">💪 Mancuerna</option>
                                              <option value="polea">🪢 Polea</option>
                                              <option value="maquina">⚙️ Máquina</option>
                                              <option value="corporal">🤸 Corporal</option>
                                            </select>

                                            {/* Bar weight if barra */}
                                            {exEq === 'barra' && (
                                              <select
                                                value={ex.barWeight ?? 20}
                                                onChange={(e) =>
                                                  handleUpdateTemplateExercise(t.id, exIdx, { barWeight: Number(e.target.value) })
                                                }
                                                className="px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                                              >
                                                <option value={20}>20 kg</option>
                                                <option value={15}>15 kg</option>
                                                <option value={10}>10 kg</option>
                                              </select>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() =>
                                                handlePropagateExerciseToHistory(ex.name, {
                                                  equipment: exEq,
                                                  barWeight: exEq === 'barra' ? (ex.barWeight ?? 20) : 0,
                                                  muscleGroup: ex.muscleGroup,
                                                })
                                              }
                                              className="px-2 py-1 rounded-lg bg-[var(--card)] text-[var(--text-soft)] hover:text-blue-600 border border-[var(--border)] text-[10px] font-bold cursor-pointer"
                                              title="Aplicar a todo el historial"
                                            >
                                              ⚡ Al historial
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => handleDeleteExerciseFromTemplate(t.id, exIdx)}
                                              className="text-[var(--text-faint)] hover:text-rose-500 text-xs px-1 cursor-pointer"
                                              title="Eliminar de la plantilla"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Add exercise to template */}
                                <TemplateAddExerciseForm
                                  onAdd={(name, muscle, equipment, barWeight) =>
                                    handleAddExerciseToTemplate(t.id, name, muscle, equipment, barWeight)
                                  }
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Latest Session Card (Quick Glance) */}
              {latestSession && (
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
                    onOpenHistory={setHistoryExerciseName}
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

          {/* Quick Create Manual Session Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Cargar Sesión Manual</h2>
              <p className="text-xs text-[var(--text-soft)]">
                Agregá un entrenamiento pasado o normalizá el equipamiento histórico.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleNormalizeAllHistory}
                className="px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold rounded-xl cursor-pointer hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                title="Detecta mancuernas, poleas, máquinas y barras en todo tu historial y corrige pesos de barra"
              >
                <span>🪄 Normalizar todo el historial</span>
              </button>
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
                      onOpenHistory={setHistoryExerciseName}
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
                        onOpenHistory={setHistoryExerciseName}
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
                <PersonalRecordsCard state={state} onSelectExercise={setHistoryExerciseName} />
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

      {/* Workout Completion Summary Modal */}
      {completedSummarySession && (
        <WorkoutSummaryModal
          session={completedSummarySession.session}
          newPRs={completedSummarySession.newPRs}
          onClose={() => setCompletedSummarySession(null)}
        />
      )}

      {/* Exercise History Modal */}
      {historyExerciseName && (
        <ExerciseHistoryModal
          exerciseName={historyExerciseName}
          sessions={state.gym?.sessions || []}
          onClose={() => setHistoryExerciseName(null)}
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
      className="p-3 bg-[var(--card)] border border-dashed border-[var(--border)] rounded-xl flex flex-wrap items-end gap-2"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
          Agregar ejercicio a plantilla
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
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
        />
        <datalist id="template-gym-suggestions">
          {COMMON_EXERCISE_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
          Músculo
        </label>
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
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
          Tipo equipo
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
          className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
        >
          {EXERCISE_EQUIPMENT_OPTIONS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {equipment === 'barra' && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Barra
          </label>
          <select
            value={barWeight}
            onChange={(e) => setBarWeight(Number(e.target.value))}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
          >
            <option value={20}>20 kg (Olímpica)</option>
            <option value={15}>15 kg (Técnica)</option>
            <option value={10}>10 kg (W / EZ)</option>
          </select>
        </div>
      )}

      <button
        type="submit"
        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-2xs"
      >
        ＋ Añadir
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
  onOpenHistory?: (exerciseName: string) => void;
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
            const exerciseGhost = getExerciseGhostValues(allSessions, exercise.name, session.id);
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
                      onClick={() => onOpenHistory?.(exercise.name)}
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
                <div className="overflow-x-auto">
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
