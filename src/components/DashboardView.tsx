import React, { useState, useEffect, useRef } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { DailyPriority, EffortLevel, LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { WeatherWidget } from './WeatherWidget';
import { TodayFocus } from './TodayFocus';
import { PrivacyAmount } from './PrivacyAmount';
import {
  todayISO,
  daysBetween,
  fmtMoney,
  stars,
  uid,
  monthLabel,
  dayKeyFromDate,
} from '../lib/storage';
import {
  findNowAndNext,
  todayItems,
  calcAccountsTotal,
  calcNetWorth,
  calcIncomeMonth,
  calcSpentMonth,
  jobStats,
  resaleStats,
  nextExam,
  currentWeight,
  weightVariation,
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
import { AppIcon, type AppIconName } from './AppIcon';

export interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
  onOpenSearch?: () => void;
}

/**
 * Skeleton Loader Component matching the Bento Grid structure
 */
export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-40" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-12 w-64 rounded-xl" />
        <div className="skeleton h-12 w-32 rounded-xl" />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
      {/* Hero Skeleton */}
      <div className="col-span-1 md:col-span-2 lg:col-span-8 bento-card p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="skeleton h-4 w-36" />
          <div className="skeleton h-4 w-24" />
        </div>
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
        </div>
        <div className="space-y-2 pt-4">
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-10 w-full rounded-xl" />
        </div>
      </div>

      {/* Finance Skeleton */}
      <div className="col-span-1 md:col-span-2 lg:col-span-4 bento-card p-6 space-y-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-10 w-44" />
        <div className="skeleton h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <div className="skeleton h-12 rounded-lg" />
          <div className="skeleton h-12 rounded-lg" />
        </div>
      </div>

      {/* Gym Skeleton */}
      <div className="col-span-1 md:col-span-1 lg:col-span-4 bento-card p-6 space-y-3">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="skeleton h-8 w-full rounded-lg" />
      </div>

      {/* Habits Skeleton */}
      <div className="col-span-1 md:col-span-1 lg:col-span-4 bento-card p-6 space-y-3">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-8 w-28" />
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="skeleton h-8 w-full rounded-lg" />
      </div>

      {/* Shortcuts Skeleton */}
      <div className="col-span-1 md:col-span-2 lg:col-span-4 bento-card p-6 space-y-3">
        <div className="skeleton h-4 w-36" />
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="skeleton h-8 w-full rounded-lg" />
      </div>
    </div>
  </div>
);

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
  onOpenSearch,
}) => {
  const [extraText, setExtraText] = useState('');
  const [extraPriority, setExtraPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [extraEffort, setExtraEffort] = useState<EffortLevel>('medium');
  const [showSkeletonDemo, setShowSkeletonDemo] = useState(false);

  // Mini Pomodoro / Focus Timer State
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
  const lowEffortSuggestions = items.filter((item) => !item.done && item.effort === 'low').slice(0, 3);
  const priorities = state.dailyPriorities.filter((item) => item.date === iso);
  const dayClosed = Boolean(state.checkoutLog[iso]?.closedAt);
  const daysSinceBackup = state.settings.lastBackupAt ? daysBetween(state.settings.lastBackupAt, iso) : null;
  const showBackupReminder = daysSinceBackup === null || daysSinceBackup >= 7;

  // Real-time task completion calculations
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.done).length;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Habit Streak & Recurring Routines
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

  // Gym Metrics & PRs
  const gymStreak = calcGymStreak(state);
  const activeGymSession = state.gym.sessions.find((s) => s.status === 'active') || null;
  const todayDayKey = dayKeyFromDate(new Date());
  const suggestedGymTemplate =
    state.gym.routineTemplates.find((template) => template.days?.includes(todayDayKey)) ||
    state.gym.routineTemplates[0] ||
    null;
  const userWeight = currentWeight(state);
  const userWeightVar = weightVariation(state);
  const prs = calcPRs(state);
  const prCount = Object.keys(prs).length;
  const topPrList = Object.entries(prs).sort(([, a], [, b]) => b.weight - a.weight);
  const topPrEntry = topPrList.length ? { name: topPrList[0][0], ...topPrList[0][1] } : null;

  // Finance Sparkline Data (last 5 months)
  const financeChartData = [-4, -3, -2, -1, 0].map((offset) => {
    const label = monthLabel(offset);
    const dateObj = new Date(`${label}-15T12:00:00`);
    const shortMonth = dateObj.toLocaleDateString('es-UY', { month: 'short' }).replace('.', '');
    const ingresos = calcIncomeMonth(state, offset);
    const gastos = calcSpentMonth(state, offset);
    return {
      month: shortMonth.charAt(0).toUpperCase() + shortMonth.slice(1),
      ingresos,
      gastos,
    };
  });

  // Stream status & goals
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

  const greeting = () => {
    const hour = new Date().getHours();
    const phrase =
      hour >= 5 && hour < 12
        ? 'Buenos días'
        : hour >= 12 && hour < 19
        ? 'Buenas tardes'
        : 'Buenas noches';
    return `${phrase}${state.profile.name ? `, ${state.profile.name}` : ''}`;
  };

  const handleAddExtra = (event: React.FormEvent) => {
    event.preventDefault();
    if (!extraText.trim()) return;
    onUpdateState((draft) => {
      draft.todayExtras.push({
        id: uid(),
        date: iso,
        text: extraText.trim(),
        done: false,
        priority: extraPriority,
        effort: extraEffort,
      });
    });
    setExtraText('');
  };

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

  const handlePinItem = (item: TodayItem) => {
    onUpdateState((draft) => {
      const dayPriorities = draft.dailyPriorities.filter((priority) => priority.date === iso);
      const existing = dayPriorities.find(
        (priority) => priority.sourceItemId === item.id && priority.sourceKind === item.kind
      );
      if (existing) {
        draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.id !== existing.id);
      } else if (dayPriorities.length < 3) {
        draft.dailyPriorities.push({
          id: uid(),
          date: iso,
          text: item.text,
          done: item.done,
          rank: (dayPriorities.length + 1) as 1 | 2 | 3,
          sourceItemId: item.id,
          sourceKind: item.kind,
          effort: item.effort,
        });
      }
      draft.dailyPriorities
        .filter((priority) => priority.date === iso)
        .sort((a, b) => a.rank - b.rank)
        .forEach((priority, index) => {
          priority.rank = (index + 1) as 1 | 2 | 3;
        });
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

  const handleDeleteExtra = (id: string) => {
    onUpdateState((draft) => {
      draft.todayExtras = draft.todayExtras.filter((item) => item.id !== id);
      draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.sourceItemId !== id);
      draft.dailyPriorities
        .filter((priority) => priority.date === iso)
        .sort((a, b) => a.rank - b.rank)
        .forEach((priority, index) => {
          priority.rank = (index + 1) as 1 | 2 | 3;
        });
    });
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

  const handleQuickSleep = (hours: number) => {
    playSound('click');
    onUpdateState((draft) => {
      upsertDailyContext(draft, {
        ...contextForDate(draft, iso),
        sleepHours: hours,
      });
    });
  };

  const panorama: {
    label: string;
    icon: AppIconName;
    value: string;
    detail: string;
    view: ViewType;
    accent?: string;
    sensitive?: boolean;
  }[] = [
    {
      label: 'Disponible',
      icon: 'wallet',
      value: fmtMoney(calcAccountsTotal(state)),
      detail: 'en tus cuentas',
      view: 'finanzas',
      accent: 'text-emerald-600 dark:text-emerald-400',
      sensitive: true,
    },
    {
      label: 'Empleo',
      icon: 'briefcase',
      value: String(jobStats(state).ofertasNuevas),
      detail: 'ofertas activas',
      view: 'trabajo',
    },
    {
      label: 'Reventa',
      icon: 'repeat',
      value: String(resaleStats(state).oportunidadesNuevas),
      detail: 'oportunidades',
      view: 'reventa',
    },
    {
      label: 'Próximo examen',
      icon: 'calendarDays',
      value: nextExam(state)
        ? state.study.subjects.find((subject) => subject.id === nextExam(state)?.subjectId)?.name || '—'
        : '—',
      detail: nextExam(state) ? `${daysBetween(iso, nextExam(state)!.date)} días` : 'sin exámenes',
      view: 'estudios',
    },
    {
      label: 'Estudio hoy',
      icon: 'book',
      value: `${studyMinutesForDate(state, iso)} min`,
      detail: 'tiempo registrado',
      view: 'estudios',
    },
    {
      label: 'Peso / cuerpo',
      icon: 'scale',
      value: userWeight != null ? `${userWeight} kg` : '—',
      detail: 'último registro',
      view: 'gimnasio',
      sensitive: true,
    },
  ];

  if (showSkeletonDemo) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 rounded-xl text-xs">
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            Vista previa de Skeleton Loaders (shadcn/ui shimmer)
          </span>
          <button
            type="button"
            onClick={() => setShowSkeletonDemo(false)}
            className="px-3 py-1 bg-[var(--blue)] text-white font-bold rounded-lg cursor-pointer"
          >
            Volver a la vista real
          </button>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Greeting & Quick Status */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="eyebrow">Panel de Control · Bento Grid</span>
            <button
              type="button"
              onClick={() => setShowSkeletonDemo(true)}
              title="Demostración de esqueletos de carga (skeleton loaders)"
              className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-faint)] hover:text-[var(--text)] transition cursor-pointer"
            >
              Skeleton demo
            </button>
          </div>
          <h1 className="page-heading mt-1">{greeting()}</h1>
          <p className="page-subtitle capitalize">
            {new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="min-w-0 sm:min-w-[280px]">
            <WeatherWidget />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('checkout')}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition cursor-pointer hover:opacity-95 ${
              dayClosed ? 'bg-emerald-600' : 'bg-[var(--blue)]'
            }`}
          >
            <AppIcon name={dayClosed ? 'check' : 'moon'} className="h-4 w-4" />
            {dayClosed ? 'Día cerrado' : 'Cerrar día'}
          </button>
        </div>
      </header>

      {/* Backup Reminder Banner */}
      {showBackupReminder && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5 text-xs text-[var(--text-soft)]">
          <span>
            Respaldo portátil:{' '}
            {daysSinceBackup === null ? 'todavía no hiciste uno' : `último hace ${daysSinceBackup} días`}.
          </span>
          <button
            type="button"
            onClick={onExportJSON}
            className="font-bold text-amber-700 hover:underline dark:text-amber-300 cursor-pointer"
          >
            Exportar ahora
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULAR BENTO GRID                                                        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 lg:gap-6 items-start">

        {/* ----------------------------------------------------------------------- */}
        {/* HERO CARD: 'Enfoque de Hoy' y Prioridades con Progreso en Tiempo Real   */}
        {/* ----------------------------------------------------------------------- */}
        <section className="col-span-1 md:col-span-2 lg:col-span-8 bento-card p-5 sm:p-6 space-y-5">
          {/* Card Header & Real-time Progress Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="eyebrow text-blue-600 dark:text-blue-400">Enfoque de Hoy</span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text)] tracking-tight mt-0.5">
                Prioridades y Tareas
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs font-bold text-[var(--text)] font-mono">
                  {completedItems}/{totalItems} tareas
                </span>
                <span className="block text-[11px] text-[var(--text-soft)]">
                  {progressPercent}% completado
                </span>
              </div>
              {/* Radial or linear progress mini ring */}
              <div className="w-12 h-12 relative flex items-center justify-center shrink-0">
                <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[var(--surface-muted)]"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-blue-500 transition-all duration-500 ease-out"
                    strokeDasharray={`${progressPercent}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-[10px] font-black font-mono text-[var(--text)]">
                  {progressPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* Agenda Now & Next Ticker */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)]/70 dark:bg-slate-900/60 border border-[var(--border)] dark:border-slate-800 p-3.5 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--blue-soft)] text-[var(--blue)]">
                <AppIcon name="clock" className="h-4 w-4" />
              </span>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Ahora
                </span>
                <p className="font-bold text-[var(--text)] text-xs sm:text-sm">
                  {current ? `${current.activity} · ${current.time}` : 'Sin actividad agendada'}
                </p>
              </div>
            </div>

            <div className="sm:border-l sm:border-[var(--border)] sm:dark:border-slate-800 sm:pl-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Próximo
              </span>
              <p className="font-medium text-[var(--text-soft)] text-xs">
                {next ? `${next.time} — ${next.activity}` : 'Fin de actividades programadas'}
              </p>
            </div>
          </div>

          {/* Key 3 Priorities Component */}
          <TodayFocus
            priorities={priorities}
            onAdd={handleAddPriority}
            onToggle={handleTogglePriority}
            onRemove={handleRemovePriority}
          />

          {/* Low Energy Alert */}
          {lowEnergyDay && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <span>⚠️ Día de baja energía detectado</span>
              </div>
              <p>
                {lowEffortSuggestions.length
                  ? `Priorizá tareas livianas para sostener el ritmo: ${lowEffortSuggestions.map((item) => item.text).join(' · ')}`
                  : 'Registrá tus tareas con esfuerzo bajo para que LifeOS pueda optimizar tu carga cognitiva.'}
              </p>
            </div>
          )}

          {/* Quick-add Task Form */}
          <form
            onSubmit={handleAddExtra}
            className="flex flex-wrap items-end gap-2.5 rounded-xl border border-dashed border-[var(--border)] dark:border-slate-800 bg-[var(--bg)]/50 p-3"
          >
            <div className="min-w-[190px] flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Agregar tarea rápida para hoy
              </label>
              <input
                value={extraText}
                onChange={(event) => setExtraText(event.target.value)}
                placeholder="Ej: Responder propuesta técnica..."
                className="w-full rounded-lg border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--blue)] transition"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Prioridad
              </label>
              <select
                value={extraPriority}
                onChange={(event) => setExtraPriority(event.target.value as typeof extraPriority)}
                className="rounded-lg border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Esfuerzo
              </label>
              <select
                value={extraEffort}
                onChange={(event) => setExtraEffort(event.target.value as EffortLevel)}
                className="rounded-lg border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
              </select>
            </div>
            <button
              type="submit"
              className="primary-button text-xs py-2 px-3.5 cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              Agregar
            </button>
          </form>

          {/* Tasks List */}
          <div className="divide-y divide-[var(--border)] dark:divide-slate-800">
            {items.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-faint)]">
                No hay tareas cargadas para hoy todavía.
              </p>
            ) : (
              items.slice(0, 7).map((item) => {
                const pinned = priorities.some(
                  (priority) =>
                    priority.sourceItemId === item.id && priority.sourceKind === item.kind
                );
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="group flex items-center gap-2.5 py-2.5 px-1 hover:bg-[var(--surface-muted)]/50 rounded-lg transition"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold transition cursor-pointer ${
                        item.done
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-[var(--border)] hover:border-[var(--blue)] text-transparent'
                      }`}
                    >
                      ✓
                    </button>
                    <span className="hidden min-w-[55px] text-xs tracking-wider text-amber-500 sm:inline">
                      {item.done ? '' : stars(item.priority)}
                    </span>
                    <span
                      className={`min-w-0 flex-1 text-xs sm:text-sm truncate ${
                        item.done
                          ? 'text-[var(--text-faint)] line-through'
                          : 'font-medium text-[var(--text)]'
                      }`}
                    >
                      {item.text}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        item.effort === 'low'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : item.effort === 'high'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {item.effort === 'low' ? 'bajo' : item.effort === 'high' ? 'alto' : 'medio'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePinItem(item)}
                      disabled={!pinned && priorities.length >= 3}
                      title={
                        pinned
                          ? 'Quitar de las 3 prioridades'
                          : priorities.length >= 3
                          ? 'Ya elegiste 3 prioridades'
                          : 'Fijar como una de las 3 prioridades'
                      }
                      className={`px-1 text-sm transition cursor-pointer ${
                        pinned
                          ? 'text-amber-500'
                          : 'text-[var(--text-faint)] hover:text-amber-500'
                      } disabled:opacity-20 disabled:cursor-not-allowed`}
                    >
                      {pinned ? '★' : '☆'}
                    </button>
                    {item.source === 'extra' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExtra(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-faint)] hover:text-rose-500 transition px-1 cursor-pointer"
                        title="Eliminar tarea"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })
            )}
            {items.length > 7 && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => onNavigate('agenda')}
                  className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
                >
                  Ver las {items.length - 7} tareas restantes en Agenda →
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------------------------- */}
        {/* TARJETA FINANCIERA: Balance General y Minigráfico / Desglose             */}
        {/* ----------------------------------------------------------------------- */}
        <section className="col-span-1 md:col-span-2 lg:col-span-4 bento-card p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <AppIcon name="wallet" className="h-4 w-4" />
                </span>
                <span className="eyebrow text-emerald-600 dark:text-emerald-400">Balance Financiero</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('finanzas')}
                className="text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
              >
                Ver módulo →
              </button>
            </div>

            {/* Total Balances with Privacy Blur */}
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-soft)]">Disponible total</span>
              <PrivacyAmount
                as="div"
                className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text)] font-mono mt-0.5"
              >
                {fmtMoney(calcAccountsTotal(state))}
              </PrivacyAmount>
              <div className="flex items-center justify-between mt-1 text-xs text-[var(--text-soft)]">
                <span>
                  Patrimonio:{' '}
                  <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text)]">
                    {fmtMoney(calcNetWorth(state))}
                  </PrivacyAmount>
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Activo
                </span>
              </div>
            </div>

            {/* Recharts Sparkline mini chart */}
            <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--surface-muted)]/40 p-3">
              <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-2">
                <span>Flujo últimos 5 meses</span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    Ingresos
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
                    Gastos
                  </span>
                </span>
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={financeChartData}
                    margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="bentoIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="bentoSpent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 9, fill: 'var(--text-faint)' }}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined) => fmtMoney(Number(val || 0))}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ingresos"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#bentoIncome)"
                    />
                    <Area
                      type="monotone"
                      dataKey="gastos"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#bentoSpent)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Month Breakdown Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] p-2.5">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">
                  Ingresos este mes
                </span>
                <PrivacyAmount as="div" className="font-mono font-bold text-sm text-[var(--text)] mt-0.5">
                  +{fmtMoney(calcIncomeMonth(state))}
                </PrivacyAmount>
              </div>

              <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] p-2.5">
                <span className="text-[10px] font-bold text-rose-500 block">Gastos este mes</span>
                <PrivacyAmount as="div" className="font-mono font-bold text-sm text-[var(--text)] mt-0.5">
                  -{fmtMoney(calcSpentMonth(state))}
                </PrivacyAmount>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigate('finanzas')}
              className="w-full secondary-button text-xs py-2 justify-center cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              Nuevo Movimiento Financiero
            </button>
          </div>
        </section>

        {/* ----------------------------------------------------------------------- */}
        {/* TARJETA DE GIMNASIO: Próxima Rutina, Peso y Contador de PRs             */}
        {/* ----------------------------------------------------------------------- */}
        <section className="col-span-1 md:col-span-1 lg:col-span-4 bento-card p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border)] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <AppIcon name="dumbbell" className="h-4 w-4" />
                </span>
                <span className="eyebrow text-orange-600 dark:text-orange-400">Gimnasio & Físico</span>
              </div>
              <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <AppIcon name="flame" className="h-3.5 w-3.5" />
                {gymStreak}d racha
              </span>
            </div>

            {/* Scheduled Routine or Active Session */}
            <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  {activeGymSession ? 'En Curso' : 'Próxima Rutina'}
                </span>
                {activeGymSession && (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                )}
              </div>
              <p className="font-bold text-sm text-[var(--text)] mt-1">
                {activeGymSession
                  ? 'Sesión de entrenamiento activa'
                  : suggestedGymTemplate
                  ? suggestedGymTemplate.name
                  : 'Rutina general'}
              </p>
              <p className="text-xs text-[var(--text-soft)] mt-0.5">
                {activeGymSession
                  ? `${activeGymSession.exercises.length} ejercicios registrados`
                  : suggestedGymTemplate
                  ? `${suggestedGymTemplate.exercises.length} ejercicios programados`
                  : 'Sin plantilla asignada hoy'}
              </p>
            </div>

            {/* Metrics Grid: Weight & PRs */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--surface-muted)]/50 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--text-faint)]">Último Peso</span>
                  <AppIcon name="scale" className="h-3.5 w-3.5 text-[var(--text-faint)]" />
                </div>
                <PrivacyAmount as="div" className="font-mono font-black text-lg text-[var(--text)] mt-1">
                  {userWeight != null ? `${userWeight} kg` : '—'}
                </PrivacyAmount>
                <span className="text-[10px] text-[var(--text-soft)]">
                  {userWeightVar != null
                    ? `${userWeightVar >= 0 ? '+' : ''}${userWeightVar.toFixed(1)} kg vs inicio`
                    : 'Sin historial'}
                </span>
              </div>

              <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--surface-muted)]/50 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--text-faint)]">Récords (PRs)</span>
                  <AppIcon name="trophy" className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <div className="font-mono font-black text-lg text-[var(--text)] mt-1">
                  {prCount} PRs
                </div>
                <span className="text-[10px] text-[var(--text-soft)] truncate block" title={topPrEntry ? `${topPrEntry.name}: ${topPrEntry.weight}kg` : ''}>
                  {topPrEntry ? `${topPrEntry.name.slice(0, 10)}: ${topPrEntry.weight}kg` : 'Registrá récords'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('gimnasio')}
            className="w-full primary-button text-xs py-2 justify-center cursor-pointer"
          >
            <AppIcon name="play" className="h-3.5 w-3.5" />
            {activeGymSession ? 'Continuar Entrenamiento' : 'Ir al Gimnasio'}
          </button>
        </section>

        {/* ----------------------------------------------------------------------- */}
        {/* TARJETA DE HÁBITOS Y CONTEXTO: Sueño, Energía y Racha                    */}
        {/* ----------------------------------------------------------------------- */}
        <section className="col-span-1 md:col-span-1 lg:col-span-4 bento-card p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border)] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <AppIcon name="sparkles" className="h-4 w-4" />
                </span>
                <span className="eyebrow text-indigo-600 dark:text-indigo-400">Hábitos y Contexto</span>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <AppIcon name="flame" className="h-3.5 w-3.5" />
                {habitStreak}d racha
              </span>
            </div>

            {/* Sleep Status */}
            <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  Sueño anoche
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    todayContextEntry?.sleepHours != null && todayContextEntry.sleepHours >= 7
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : todayContextEntry?.sleepHours != null
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-[var(--surface-muted)] text-[var(--text-faint)]'
                  }`}
                >
                  {todayContextEntry?.sleepHours != null && todayContextEntry.sleepHours >= 7
                    ? 'Óptimo'
                    : todayContextEntry?.sleepHours != null
                    ? 'Déficit'
                    : 'Sin registrar'}
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <p className="font-mono font-black text-xl text-[var(--text)]">
                  {todayContextEntry?.sleepHours != null ? `${todayContextEntry.sleepHours} hrs` : '—'}
                </p>
                {todayContextEntry?.sleepHours == null && (
                  <div className="flex gap-1">
                    {[6, 7, 8].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => handleQuickSleep(h)}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--surface-muted)] hover:bg-[var(--blue-soft)] hover:text-[var(--blue)] transition cursor-pointer"
                      >
                        +{h}h
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Energy Level Selector (Interactive 1-5) */}
            <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--surface-muted)]/50 p-3 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider">
                  Nivel de Energía
                </span>
                <span className="font-bold text-[var(--text)]">
                  {todayContextEntry?.energy ? `${todayContextEntry.energy}/5` : 'Pendiente'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((level) => {
                  const isSelected = todayContextEntry?.energy === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => handleQuickEnergy(level)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                        isSelected
                          ? 'bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs'
                          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-soft)] hover:border-[var(--blue)]'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Habit Progress summary */}
            <div className="flex items-center justify-between text-xs px-1 text-[var(--text-soft)]">
              <span>Routines completadas hoy:</span>
              <span className="font-mono font-bold text-[var(--text)]">
                {habitsDone} de {habitsScheduled.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('checkout')}
            className="w-full secondary-button text-xs py-2 justify-center cursor-pointer"
          >
            <AppIcon name="moon" className="h-3.5 w-3.5" />
            Check-in Diario y Contexto
          </button>
        </section>

        {/* ----------------------------------------------------------------------- */}
        {/* TARJETA DE ACCESOS DIRECTOS: Búsqueda, Stream y Temporizador             */}
        {/* ----------------------------------------------------------------------- */}
        <section className="col-span-1 md:col-span-2 lg:col-span-4 bento-card p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border)] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <AppIcon name="search" className="h-4 w-4" />
                </span>
                <span className="eyebrow text-blue-600 dark:text-blue-400">Accesos y Herramientas</span>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-faint)]">cmd/ctrl + k</span>
            </div>

            {/* Command Palette Trigger Button (Raycast / Notion Style) */}
            <button
              type="button"
              onClick={triggerSearch}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] hover:border-[var(--blue)] transition text-xs text-left cursor-pointer group shadow-xs"
            >
              <div className="flex items-center gap-2 text-[var(--text-soft)] group-hover:text-[var(--text)]">
                <AppIcon name="search" className="h-4 w-4" />
                <span>Buscar en LifeOS...</span>
              </div>
              <kbd className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-[var(--surface-muted)] text-[var(--text-faint)] border border-[var(--border)]">
                ⌘K
              </kbd>
            </button>

            {/* Streaming Status Card */}
            <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--surface-muted)]/50 p-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      streamStatus.live ? 'bg-red-500 animate-ping' : 'bg-slate-400 dark:bg-slate-600'
                    }`}
                  />
                  <span className="font-bold text-[var(--text)]">
                    {streamStatus.live ? 'Streaming en Vivo' : 'Streaming Offline'}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[var(--text-soft)]">
                  {monthlyStreamHours.toFixed(1)} / {streamGoal}h
                </span>
              </div>
              <div className="w-full h-1.5 bg-[var(--border)] rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (monthlyStreamHours / streamGoal) * 100)}%` }}
                />
              </div>
            </div>

            {/* Pomodoro Focus Mini-Timer */}
            <div className="rounded-xl border border-[var(--border)] dark:border-slate-800 bg-[var(--bg-elevated)] p-3 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  Temporizador Pomodoro
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleResetTimer(25)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                      timerDuration === 25 ? 'bg-[var(--blue-soft)] text-[var(--blue)] font-bold' : 'text-[var(--text-faint)]'
                    }`}
                  >
                    25m
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetTimer(50)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                      timerDuration === 50 ? 'bg-[var(--blue-soft)] text-[var(--blue)] font-bold' : 'text-[var(--text-faint)]'
                    }`}
                  >
                    50m
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-2xl text-[var(--text)] tracking-wider">
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
            </div>
          </div>

          {/* Quick Shortcuts Pill Group */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('trabajo')}
              className="flex-1 min-w-[100px] text-center px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
            >
              + Postulación
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reventa')}
              className="flex-1 min-w-[100px] text-center px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
            >
              + Reventa
            </button>
            <button
              type="button"
              onClick={onExportJSON}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
              title="Descargar copia de seguridad"
            >
              JSON
            </button>
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* PANORAMA RESUMEN (Contexto Global y Métricas Secundarias)                   */}
      {/* ========================================================================= */}
      <section className="pt-2">
        <div className="mb-3">
          <p className="eyebrow">Panorama</p>
          <h2 className="section-title mt-0.5">Indicadores Globales</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {panorama.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.view)}
              className="bento-card p-4 text-left cursor-pointer transition hover:scale-[1.02]"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-soft)]">
                <AppIcon name={card.icon} className="h-4 w-4 text-[var(--text-faint)]" />
                {card.label}
              </span>
              {card.sensitive ? (
                <PrivacyAmount
                  as="strong"
                  className={`number-value mt-2.5 block truncate text-xl font-bold font-mono ${
                    card.accent || 'text-[var(--text)]'
                  }`}
                  title={card.value}
                >
                  {card.value}
                </PrivacyAmount>
              ) : (
                <strong
                  className={`number-value mt-2.5 block truncate text-xl font-bold font-mono ${
                    card.accent || 'text-[var(--text)]'
                  }`}
                  title={card.value}
                >
                  {card.value}
                </strong>
              )}
              <span className="mt-1 block text-xs text-[var(--text-faint)]">{card.detail}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
