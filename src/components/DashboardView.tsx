import React, { useState, useEffect, useRef } from 'react';
import type { DailyPriority, EffortLevel, LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { WeatherWidget } from './WeatherWidget';
import { TodayFocus } from './TodayFocus';
import { PrivacyAmount } from './PrivacyAmount';
import { showToast } from '../lib/toast';
import {
  todayISO,
  daysBetween,
  fmtMoney,
  uid,
  dayKeyFromDate,
} from '../lib/storage';
import {
  findNowAndNext,
  todayItems,
  calcAccountsTotal,
  calcIncomeMonth,
  calcSpentMonth,
  jobStats,
  resaleStats,
  nextExam,
  currentWeight,
  calcPRs,
  calcGymStreak,
  todayStreamStatus,
  streamSessionsInMonth,
  studyMinutesForDate,
  type TodayItem,
  routineScheduledFor,
} from '../lib/calculations';
import {
  contextForDate,
  upsertDailyContext,
} from '../lib/contextInsights';
import { AppIcon } from './AppIcon';

export interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
  onOpenSearch?: () => void;
  onOpenCapture?: () => void;
}

/**
 * Skeleton Loader matching the new clean hierarchy
 */
export const DashboardSkeleton: React.FC = () => (
  <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-pulse">
    {/* Header Skeleton */}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
      <div className="space-y-2">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-8 w-72" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-10 w-44 rounded-xl" />
        <div className="skeleton h-10 w-28 rounded-xl" />
      </div>
    </div>

    {/* Dominant AHORA Skeleton */}
    <div className="skeleton h-44 w-full rounded-3xl" />

    {/* Progress Skeleton */}
    <div className="skeleton h-16 w-full rounded-2xl" />

    {/* 3 Priorities Skeleton */}
    <div className="skeleton h-36 w-full rounded-2xl" />

    {/* Timeline Skeleton */}
    <div className="skeleton h-48 w-full rounded-2xl" />

    {/* Modules Skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
    </div>
  </div>
);

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
  onOpenSearch,
  onOpenCapture,
}) => {
  const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskPriority, setTaskPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [taskEffort, setTaskEffort] = useState<EffortLevel>('medium');

  // Mini Focus / Pomodoro Timer
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerDuration, setTimerDuration] = useState<25 | 50>(25);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const iso = todayISO();
  const { current, next } = findNowAndNext(state);
  const items = todayItems(state);
  const todayContextEntry = state.dailyContext.find((entry) => entry.date === iso);
  const lowEnergyDay =
    (todayContextEntry?.energy != null && todayContextEntry.energy <= 2) ||
    (todayContextEntry?.sleepHours != null && todayContextEntry.sleepHours < 6.5);
  const priorities = state.dailyPriorities.filter((item) => item.date === iso);
  const sortedPriorities = [...priorities].sort((a, b) => a.rank - b.rank);
  const dayClosed = Boolean(state.checkoutLog[iso]?.closedAt);
  const daysSinceBackup = state.settings.lastBackupAt ? daysBetween(state.settings.lastBackupAt, iso) : null;
  const showBackupReminder = daysSinceBackup === null || daysSinceBackup >= 7;

  // Real-time task progress
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.done).length;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Habits & Streak
  const habitsScheduled = state.tasksRecurring.filter((t) => routineScheduledFor(state, t, iso));
  const habitsDone = habitsScheduled.filter((t) => state.taskLog[iso]?.[t.id]).length;

  let habitStreak = 0;
  const streakDate = new Date(`${iso}T00:00:00`);
  if (habitsDone === 0) {
    streakDate.setDate(streakDate.getDate() - 1);
  }
  for (let i = 0; i < 90; i++) {
    const y = streakDate.getFullYear();
    const m = String(streakDate.getMonth() + 1).padStart(2, '0');
    const day = String(streakDate.getDate()).padStart(2, '0');
    const dayIso = `${y}-${m}-${day}`;
    const dayLog = state.taskLog[dayIso];
    const hasCompleted = dayLog && Object.values(dayLog).some(Boolean);
    if (hasCompleted) {
      habitStreak++;
      streakDate.setDate(streakDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Gym Metrics
  const gymStreak = calcGymStreak(state);
  const activeGymSession = state.gym.sessions.find((s) => s.status === 'active') || null;
  const todayDayKey = dayKeyFromDate(new Date());
  const suggestedGymTemplate =
    state.gym.routineTemplates.find((template) => template.days?.includes(todayDayKey)) ||
    state.gym.routineTemplates[0] ||
    null;
  const userWeight = currentWeight(state);
  const prs = calcPRs(state);
  const prCount = Object.keys(prs).length;

  // Stream Metrics
  const streamStatus = todayStreamStatus(state);
  const streamSessions = streamSessionsInMonth(state);
  const monthlyStreamHours = streamSessions.reduce((acc, s) => acc + s.hours, 0);
  const streamGoal = state.streaming.monthlyGoal || 20;

  // Focus Timer Tick Handler
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsTimerRunning(false);
            playSound('beep');
            showToast('¡Tiempo de foco completado! Tomate un respiro.', 'info');
            return timerDuration * 60;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timerDuration]);

  const handleToggleTimer = () => {
    playSound('click');
    setIsTimerRunning((prev) => !prev);
  };

  const handleResetTimer = (minutes: 25 | 50 = timerDuration) => {
    playSound('click');
    setIsTimerRunning(false);
    setTimerDuration(minutes);
    setTimerSeconds(minutes * 60);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const triggerSearch = () => {
    if (onOpenSearch) {
      onOpenSearch();
    } else {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true })
      );
    }
  };

  // Dynamic Salutation
  const getGreeting = () => {
    const hour = new Date().getHours();
    const phrase =
      hour >= 5 && hour < 12
        ? 'Buenos días'
        : hour >= 12 && hour < 19
        ? 'Buenas tardes'
        : 'Buenas noches';
    return `${phrase}${state.profile.name ? `, ${state.profile.name}` : ''}`;
  };

  // Natural contextual phrase for today
  const getDayContextPhrase = () => {
    if (dayClosed) {
      return 'Día cerrado y archivado. Buen momento para desconectar.';
    }
    const completedPriorities = priorities.filter((p) => p.done).length;
    if (priorities.length > 0 && completedPriorities === priorities.length) {
      return '¡Completaste tus 3 prioridades clave de hoy!';
    }
    if (lowEnergyDay) {
      return 'Día de baja energía detectado · enfocate en lo esencial.';
    }
    if (activeGymSession) {
      return 'Entrenamiento activo en curso · mantené el foco en tu sesión.';
    }
    if (suggestedGymTemplate && !state.gym.sessions.some((s) => s.date === iso)) {
      return `Hoy tenés planificado ${suggestedGymTemplate.name}.`;
    }
    if (priorities.length > 0) {
      const remaining = priorities.length - completedPriorities;
      return `${remaining} ${remaining === 1 ? 'prioridad pendiente' : 'prioridades pendientes'} para hoy.`;
    }
    return 'Tu sistema está listo. Definí tu foco para el día.';
  };

  // Formatted date in Spanish
  const rawDateString = new Date().toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const formattedDate = rawDateString.charAt(0).toUpperCase() + rawDateString.slice(1);

  // Dynamic "AHORA" action resolver
  const resolveNowAction = () => {
    // 1. Active gym session
    if (activeGymSession) {
      return {
        badge: 'En curso',
        badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        pulse: true,
        timeLabel: 'Sesión activa ahora',
        title: 'Entrenamiento en progreso',
        subtitle: `${activeGymSession.exercises.length} ejercicios registrados en tu sesión actual.`,
        actionLabel: 'Continuar sesión',
        onAction: () => onNavigate('gimnasio'),
      };
    }

    // 2. Current scheduled activity in agenda
    if (current) {
      return {
        badge: 'En curso',
        badgeColor: 'bg-[var(--blue-soft)] text-[var(--blue)] border-[var(--blue)]/30',
        pulse: true,
        timeLabel: current.time,
        title: current.activity,
        subtitle: 'Actividad agendada para este bloque horario.',
        actionLabel: 'Ver en Agenda',
        onAction: () => onNavigate('agenda'),
        secondaryAction: {
          label: isTimerRunning ? 'Pausar foco' : 'Foco 25m',
          onClick: handleToggleTimer,
        },
      };
    }

    // 3. Upcoming activity soon (next)
    if (next) {
      return {
        badge: 'Próximo',
        badgeColor: 'bg-[var(--surface-muted)] text-[var(--text-soft)] border-[var(--border)]',
        pulse: false,
        timeLabel: next.time,
        title: next.activity,
        subtitle: 'Siguiente bloque programado en tu agenda de hoy.',
        actionLabel: 'Ver en Agenda',
        onAction: () => onNavigate('agenda'),
      };
    }

    // 4. Pending Top Priority #1
    const pendingPriorities = sortedPriorities.filter((p) => !p.done);
    if (pendingPriorities.length > 0) {
      const topPriority = pendingPriorities[0];
      return {
        badge: `Prioridad #${topPriority.rank}`,
        badgeColor: 'bg-[var(--blue-soft)] text-[var(--blue)] border-[var(--blue)]/30',
        pulse: false,
        timeLabel: 'Foco prioritario',
        title: topPriority.text,
        subtitle: 'Tu resultado clave más importante pendiente para hoy.',
        actionLabel: 'Completar prioridad',
        onAction: () => handleTogglePriority(topPriority),
        secondaryAction: {
          label: isTimerRunning ? 'Pausar foco' : 'Foco 25m',
          onClick: handleToggleTimer,
        },
      };
    }

    // 5. Today's suggested gym routine (if today has a routine and no session done yet)
    if (suggestedGymTemplate && !state.gym.sessions.some((s) => s.date === iso)) {
      return {
        badge: 'Sugerido hoy',
        badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        pulse: false,
        timeLabel: 'Rutina del día',
        title: suggestedGymTemplate.name,
        subtitle: `${suggestedGymTemplate.exercises.length} ejercicios planificados para tu entrenamiento de hoy.`,
        actionLabel: 'Ir al Gimnasio',
        onAction: () => onNavigate('gimnasio'),
      };
    }

    // 6. Stream active
    if (streamStatus.live) {
      return {
        badge: 'En Vivo',
        badgeColor: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
        pulse: true,
        timeLabel: 'Streaming activo',
        title: 'Transmisión en directo',
        subtitle: `${monthlyStreamHours.toFixed(1)}h acumuladas este mes en Twitch.`,
        actionLabel: 'Ver Stream',
        onAction: () => onNavigate('config'),
      };
    }

    // 7. Everything up to date
    return {
      badge: 'Al día',
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      pulse: false,
      timeLabel: 'Tiempo libre',
      title: 'Tus prioridades están al día',
      subtitle:
        completedItems > 0
          ? `Llevás ${completedItems} tareas completadas hoy. Excelente momento para descansar o avanzar a tu propio ritmo.`
          : 'Sin tareas urgentes en este momento. Tomate un momento para planificar o descansar.',
      actionLabel: dayClosed ? 'Ver Checkout' : 'Cerrar día',
      onAction: () => onNavigate('checkout'),
    };
  };

  const nowAction = resolveNowAction();

  // Handlers
  const handleToggleItem = (item: TodayItem) => {
    onUpdateState((draft) => {
      let done = true;
      if (item.kind === 'toggle-task-today') {
        if (!draft.taskLog[iso]) draft.taskLog[iso] = {};
        done = !draft.taskLog[iso][item.id];
        draft.taskLog[iso][item.id] = done;
      } else if (item.kind === 'toggle-extra-today') {
        const extra = draft.todayExtras.find((candidate) => candidate.id === item.id);
        if (extra) {
          extra.done = !extra.done;
          done = extra.done;
        }
      } else {
        const application = draft.jobs.applications.find((candidate) => candidate.id === item.id);
        if (application) {
          application.nextAction = '';
          application.nextActionDate = '';
        }
      }
      draft.dailyPriorities
        .filter(
          (priority) =>
            priority.date === iso &&
            priority.sourceItemId === item.id &&
            priority.sourceKind === item.kind
        )
        .forEach((priority) => {
          priority.done = done;
        });
      if (done) playSound('success');
    });
  };

  const handleTogglePriority = (priority: DailyPriority) => {
    const linked =
      priority.sourceItemId && priority.sourceKind
        ? items.find((item) => item.id === priority.sourceItemId && item.kind === priority.sourceKind)
        : null;
    if (linked) {
      handleToggleItem(linked);
      return;
    }
    onUpdateState((draft) => {
      const target = draft.dailyPriorities.find((item) => item.id === priority.id);
      if (target) {
        target.done = !target.done;
        if (target.done) playSound('success');
      }
    });
  };

  const handleAddPriority = (text: string) => {
    onUpdateState((draft) => {
      const dayPriorities = draft.dailyPriorities.filter((priority) => priority.date === iso);
      if (dayPriorities.length >= 3) return;
      const extraId = uid();
      draft.todayExtras.push({
        id: extraId,
        date: iso,
        text,
        done: false,
        priority: 'alta',
        effort: 'medium',
      });
      draft.dailyPriorities.push({
        id: uid(),
        date: iso,
        text,
        done: false,
        rank: (dayPriorities.length + 1) as 1 | 2 | 3,
        sourceItemId: extraId,
        sourceKind: 'toggle-extra-today',
        effort: 'medium',
      });
    });
  };

  const handleRemovePriority = (id: string) => {
    onUpdateState((draft) => {
      draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.id !== id);
      draft.dailyPriorities
        .filter((priority) => priority.date === iso)
        .sort((a, b) => a.rank - b.rank)
        .forEach((priority, index) => {
          priority.rank = (index + 1) as 1 | 2 | 3;
        });
    });
  };

  const handleAddQuickTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskText.trim()) return;
    onUpdateState((draft) => {
      draft.todayExtras.push({
        id: uid(),
        date: iso,
        text: taskText.trim(),
        done: false,
        priority: taskPriority,
        effort: taskEffort,
      });
    });
    setTaskText('');
    setShowQuickTaskForm(false);
    playSound('click');
    showToast('Tarea agregada a tu día', 'success');
  };

  const handleQuickEnergy = (energy: 1 | 2 | 3 | 4 | 5) => {
    playSound('click');
    onUpdateState((draft) => {
      upsertDailyContext(draft, {
        ...contextForDate(draft, iso),
        energy,
      });
    });
  };

  // Next upcoming tasks/events for Timeline (max 4 items)
  const timelineItems = items.filter((item) => !item.done).slice(0, 4);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-14">
      {/* ========================================================================= */}
      {/* 1. HEADER / CONTEXTO DEL DÍA                                             */}
      {/* ========================================================================= */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-soft)]">
            <span>{formattedDate}</span>
            <span className="text-[var(--text-faint)]">·</span>
            <span>{getGreeting()}</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[var(--text)] tracking-tight">
            {getDayContextPhrase()}
          </h1>
        </div>

        {/* Action Controls in Header */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <WeatherWidget />
          {onOpenCapture && (
            <button
              type="button"
              onClick={onOpenCapture}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--blue-hover)] transition cursor-pointer"
              title="Captura rápida (Tecla N)"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Captura</span>
              <kbd className="hidden sm:inline-block rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-mono">N</kbd>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('checkout')}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
              dayClosed
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] shadow-xs'
            }`}
          >
            <AppIcon name={dayClosed ? 'check' : 'moon'} className="h-3.5 w-3.5" />
            <span>{dayClosed ? 'Día cerrado' : 'Cerrar día'}</span>
          </button>
        </div>
      </header>

      {/* Backup notification banner if needed */}
      {showBackupReminder && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AppIcon name="alertCircle" className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Copia de seguridad recomendada · resguardá tus datos exportando tu archivo JSON.</span>
          </div>
          <button
            type="button"
            onClick={onExportJSON}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 transition cursor-pointer shrink-0"
          >
            Exportar JSON
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. BLOQUE PRINCIPAL "AHORA" (Elemento Dominante)                          */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8 shadow-sm transition-all hover:border-[var(--border-hover)]">
        {/* Subtle accent glow in background */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--blue)]/5 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3">
            {/* Top row: AHORA label + status badge + time */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-mono font-black uppercase tracking-widest text-[var(--blue)]">
                {nowAction.pulse && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)] animate-pulse" />
                )}
                AHORA
              </span>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${nowAction.badgeColor}`}
              >
                {nowAction.badge}
              </span>

              {nowAction.timeLabel && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-faint)]">
                  <AppIcon name="clock" className="h-3 w-3" />
                  {nowAction.timeLabel}
                </span>
              )}
            </div>

            {/* Dominant Headline */}
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text)] tracking-tight leading-snug">
              {nowAction.title}
            </h2>

            {/* Clear subtitle / purpose */}
            <p className="text-sm text-[var(--text-soft)] max-w-xl">
              {nowAction.subtitle}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5 md:flex-col md:items-end shrink-0">
            <button
              type="button"
              onClick={nowAction.onAction}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--blue)] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[var(--blue-hover)] transition cursor-pointer"
            >
              <span>{nowAction.actionLabel}</span>
              <AppIcon name="arrowRight" className="h-4 w-4" />
            </button>

            {nowAction.secondaryAction && (
              <button
                type="button"
                onClick={nowAction.secondaryAction.onClick}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
              >
                <AppIcon name="clock" className="h-3.5 w-3.5 text-[var(--blue)]" />
                <span>{nowAction.secondaryAction.label}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PROGRESO DEL DÍA (Sencillo y Elegante)                                 */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-[var(--text)]">Progreso de hoy</span>
              <span className="font-mono font-bold text-[var(--blue)]">
                {completedItems}/{totalItems} tareas · {progressPercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  progressPercent === 100 ? 'bg-emerald-500' : 'bg-[var(--blue)]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-[var(--text-soft)]">
            <div className="flex items-center gap-1.5">
              <AppIcon
                name="checkCircle"
                className={`h-3.5 w-3.5 ${habitsDone > 0 ? 'text-emerald-500' : 'text-[var(--text-faint)]'}`}
              />
              <span>
                {habitsDone}/{habitsScheduled.length} rutinas listas
              </span>
            </div>

            {habitStreak > 0 && (
              <div className="flex items-center gap-1 font-mono font-semibold text-[var(--text)]">
                <AppIcon name="flame" className="h-3.5 w-3.5 text-amber-500" />
                <span>{habitStreak}d racha</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. LAS 3 PRIORIDADES                                                      */}
      {/* ========================================================================= */}
      <TodayFocus
        priorities={priorities}
        onAdd={handleAddPriority}
        onToggle={handleTogglePriority}
        onRemove={handleRemovePriority}
      />

      {/* ========================================================================= */}
      {/* 5. TIMELINE / "DESPUÉS" (Próximos 3-5 pasos del día)                       */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-soft)]">
              <AppIcon name="calendar" className="h-3.5 w-3.5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-[var(--text)] tracking-tight">
                Después hoy
              </h3>
              <p className="text-[11px] text-[var(--text-soft)]">
                Próximos pasos programados en tu jornada.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQuickTaskForm((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--blue)] hover:border-[var(--blue)] transition cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>{showQuickTaskForm ? 'Cerrar' : '+ Tarea rápida'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('agenda')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue)] hover:underline cursor-pointer"
            >
              <span>Ver agenda</span>
              <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Inline Quick Task Creator Form */}
        {showQuickTaskForm && (
          <form
            onSubmit={handleAddQuickTask}
            className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
          >
            <input
              autoFocus
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              placeholder="¿Qué necesitás hacer hoy?..."
              className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
            />
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value as 'alta' | 'media' | 'baja')}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--text-soft)]"
            >
              <option value="alta">Prioridad Alta</option>
              <option value="media">Prioridad Media</option>
              <option value="baja">Prioridad Baja</option>
            </select>
            <select
              value={taskEffort}
              onChange={(e) => setTaskEffort(e.target.value as EffortLevel)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--text-soft)]"
            >
              <option value="low">Bajo esfuerzo (15m)</option>
              <option value="medium">Medio esfuerzo (45m)</option>
              <option value="high">Alto esfuerzo (90m+)</option>
            </select>
            <button
              type="submit"
              disabled={!taskText.trim()}
              className="rounded-lg bg-[var(--blue)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--blue-hover)] transition disabled:opacity-40 cursor-pointer"
            >
              Agregar
            </button>
          </form>
        )}

        {/* Timeline Items List */}
        {timelineItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--text-faint)]">
            <span>No hay más tareas pendientes programadas para hoy.</span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {timelineItems.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="group flex items-center justify-between py-2.5 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--blue)] transition cursor-pointer text-transparent hover:text-[var(--text-faint)]"
                  >
                    ✓
                  </button>
                  <span
                    onClick={() => handleToggleItem(item)}
                    className="truncate text-xs font-medium text-[var(--text)] cursor-pointer select-none group-hover:text-[var(--blue)] transition"
                    title={item.text}
                  >
                    {item.text}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.effort && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-faint)] bg-[var(--surface-muted)]">
                      {item.effort === 'low' ? '15m' : item.effort === 'medium' ? '45m' : '90m'}
                    </span>
                  )}
                  {item.source === 'agenda' && (
                    <span className="rounded bg-[var(--blue-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--blue)]">
                      Agenda
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Link to see rest of items if more than timelineItems */}
        {items.filter((i) => !i.done).length > 4 && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] text-right">
            <button
              type="button"
              onClick={() => onNavigate('agenda')}
              className="text-xs font-medium text-[var(--text-soft)] hover:text-[var(--blue)] transition cursor-pointer"
            >
              Ver {items.filter((i) => !i.done).length - 4} tareas más en Agenda →
            </button>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 6. ACCESOS A MÓDULOS (Resúmenes Compactos y Accionables)                   */}
      {/* ========================================================================= */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text)] tracking-tight">
            Módulos del Sistema
          </h2>
          <span className="text-xs text-[var(--text-faint)]">Accesos rápidos y datos clave</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Módulo 1: FINANZAS */}
          <div
            onClick={() => onNavigate('finanzas')}
            className="bento-card p-4.5 cursor-pointer transition hover:border-[var(--border-hover)] group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                <AppIcon name="wallet" className="h-4 w-4 text-emerald-500" />
                <span>Finanzas</span>
              </div>
              <span className="text-xs text-[var(--text-faint)] group-hover:text-[var(--blue)] transition">
                →
              </span>
            </div>

            <div className="mt-3">
              <span className="text-[11px] text-[var(--text-faint)] block">Disponible actual</span>
              <PrivacyAmount
                as="strong"
                className="text-xl font-bold font-mono text-[var(--text)] tracking-tight block mt-0.5"
              >
                {fmtMoney(calcAccountsTotal(state))}
              </PrivacyAmount>
            </div>

            <div className="mt-3 flex items-center gap-2 pt-2 border-t border-[var(--border)] text-[11px] font-mono">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{fmtMoney(calcIncomeMonth(state))}
              </span>
              <span className="text-[var(--text-faint)]">/</span>
              <span className="text-rose-600 dark:text-rose-400">
                -{fmtMoney(calcSpentMonth(state))}
              </span>
            </div>
          </div>

          {/* Módulo 2: GIMNASIO & FÍSICO */}
          <div
            onClick={() => onNavigate('gimnasio')}
            className="bento-card p-4.5 cursor-pointer transition hover:border-[var(--border-hover)] group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                <AppIcon name="dumbbell" className="h-4 w-4 text-blue-500" />
                <span>Gimnasio</span>
              </div>
              {gymStreak > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-500">
                  <AppIcon name="flame" className="h-3 w-3" />
                  {gymStreak}d racha
                </span>
              )}
            </div>

            <div className="mt-3">
              <span className="text-[11px] text-[var(--text-faint)] block">Estado de hoy</span>
              <strong className="text-sm font-bold text-[var(--text)] block truncate mt-0.5">
                {activeGymSession
                  ? 'Sesión en curso'
                  : suggestedGymTemplate
                  ? suggestedGymTemplate.name
                  : 'Día de descanso'}
              </strong>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text-soft)]">
              <span>{userWeight != null ? `${userWeight} kg de peso` : 'Sin peso hoy'}</span>
              <span>{prCount} récords (PR)</span>
            </div>
          </div>

          {/* Módulo 3: HÁBITOS & CONTEXTO DIARIO */}
          <div className="bento-card p-4.5 transition hover:border-[var(--border-hover)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                <AppIcon name="sparkles" className="h-4 w-4 text-amber-500" />
                <span>Hábitos & Energía</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('checkout')}
                className="text-xs text-[var(--text-faint)] hover:text-[var(--blue)] transition cursor-pointer"
              >
                Registrar →
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[var(--text-faint)] block">Sueño anoche</span>
                <strong className="text-sm font-bold font-mono text-[var(--text)] block mt-0.5">
                  {todayContextEntry?.sleepHours != null
                    ? `${todayContextEntry.sleepHours} hrs`
                    : 'Sin registrar'}
                </strong>
              </div>

              {/* Energy quick selector */}
              <div className="text-right">
                <span className="text-[11px] text-[var(--text-faint)] block mb-1">Nivel energía</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handleQuickEnergy(lvl as 1 | 2 | 3 | 4 | 5)}
                      className={`h-5 w-5 rounded text-[10px] font-bold font-mono transition cursor-pointer ${
                        todayContextEntry?.energy === lvl
                          ? 'bg-[var(--blue)] text-white'
                          : 'bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text-soft)]">
              <span>{habitsDone} de {habitsScheduled.length} rutinas</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {habitsDone === habitsScheduled.length && habitsScheduled.length > 0
                  ? 'Al 100% ✓'
                  : 'En curso'}
              </span>
            </div>
          </div>

          {/* Módulo 4: ENFOQUE & POMODORO */}
          <div className="bento-card p-4.5 transition hover:border-[var(--border-hover)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                <AppIcon name="clock" className="h-4 w-4 text-[var(--blue)]" />
                <span>Temporizador Foco</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleResetTimer(25)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                    timerDuration === 25
                      ? 'bg-[var(--blue-soft)] text-[var(--blue)] font-bold'
                      : 'text-[var(--text-faint)]'
                  }`}
                >
                  25m
                </button>
                <button
                  type="button"
                  onClick={() => handleResetTimer(50)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                    timerDuration === 50
                      ? 'bg-[var(--blue-soft)] text-[var(--blue)] font-bold'
                      : 'text-[var(--text-faint)]'
                  }`}
                >
                  50m
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="font-mono font-extrabold text-2xl text-[var(--text)] tracking-wider">
                {formatTimer(timerSeconds)}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleTimer}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--blue)] text-white hover:bg-[var(--blue-hover)] transition cursor-pointer"
                  title={isTimerRunning ? 'Pausar' : 'Iniciar'}
                >
                  <AppIcon name={isTimerRunning ? 'pause' : 'play'} className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleResetTimer()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
                  title="Reiniciar"
                >
                  <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={triggerSearch}
                className="w-full flex items-center justify-between text-[11px] text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <AppIcon name="search" className="h-3.5 w-3.5" />
                  <span>Búsqueda rápida en LifeOS</span>
                </span>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-[10px]">
                  ⌘K
                </kbd>
              </button>
            </div>
          </div>

          {/* Módulo 5: STREAM (si aplica) */}
          {!state.settings.hiddenTabs?.includes('config') && (
            <div
              onClick={() => onNavigate('config')}
              className="bento-card p-4.5 cursor-pointer transition hover:border-[var(--border-hover)] group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                  <AppIcon name="sparkles" className="h-4 w-4 text-purple-400" />
                  <span>Stream</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    streamStatus.live
                      ? 'bg-rose-500/15 text-rose-500'
                      : 'bg-[var(--surface-muted)] text-[var(--text-faint)]'
                  }`}
                >
                  {streamStatus.live ? 'En Vivo' : 'Offline'}
                </span>
              </div>

              <div className="mt-3">
                <span className="text-[11px] text-[var(--text-faint)] block">Horas este mes</span>
                <strong className="text-sm font-bold font-mono text-[var(--text)] block mt-0.5">
                  {monthlyStreamHours.toFixed(1)}h / {streamGoal}h
                </strong>
              </div>

              <div className="mt-3 pt-2 border-t border-[var(--border)]">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{
                      width: `${Math.min(100, Math.round((monthlyStreamHours / streamGoal) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Módulo 6: PANORAMA DE PROYECTOS (Trabajo, Reventa, Estudios) */}
          <div className="bento-card p-4.5 transition hover:border-[var(--border-hover)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)]">Proyectos</span>
              <span className="text-xs text-[var(--text-faint)]">Métricas clave</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('trabajo')}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-left hover:border-[var(--blue)] transition cursor-pointer"
              >
                <span className="text-[10px] text-[var(--text-faint)] block">Empleo</span>
                <strong className="text-xs font-bold font-mono text-[var(--text)] block mt-0.5">
                  {jobStats(state).ofertasNuevas} ofertas
                </strong>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('reventa')}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-left hover:border-[var(--blue)] transition cursor-pointer"
              >
                <span className="text-[10px] text-[var(--text-faint)] block">Reventa</span>
                <strong className="text-xs font-bold font-mono text-[var(--text)] block mt-0.5">
                  {resaleStats(state).oportunidadesNuevas} ops
                </strong>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('estudios')}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-left hover:border-[var(--blue)] transition cursor-pointer"
              >
                <span className="text-[10px] text-[var(--text-faint)] block">Estudios</span>
                <strong className="text-xs font-bold font-mono text-[var(--text)] block mt-0.5 truncate">
                  {studyMinutesForDate(state, iso)}m hoy
                </strong>
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text-soft)]">
              <span>{nextExam(state) ? `${daysBetween(iso, nextExam(state)!.date)}d para examen` : 'Sin exámenes'}</span>
              <button
                type="button"
                onClick={onExportJSON}
                className="text-[var(--text-faint)] hover:text-[var(--text)] transition"
              >
                Backup JSON
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
