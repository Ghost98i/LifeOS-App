import React, { useState, useMemo } from 'react';
import { LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { TodayFocus } from './TodayFocus';
import { PersonalContextCard } from './PersonalContextCard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { AppIcon } from './AppIcon';
import { BentoCommandBar } from './BentoCommandBar';
import { PrivacyAmount } from './PrivacyAmount';
import { GymStreakMark, FinanceFlowMark } from './visual';
import { AlpineDayCycleBackdrop } from './visual/AlpineDayCycleBackdrop';
import { getDayCyclePeriod, getDayCycleConfig } from '../lib/alpineDayCycle';
import { loadTodayCustomization, saveTodayCustomization, TodayViewCustomization } from '../lib/viewCustomization';
import { CustomizeTodayModal } from './CustomizeTodayModal';
import {
  todayISO,
  daysBetween,
  fmtMoney,
  uid,
} from '../lib/storage';
import {
  todayItems,
  calcAccountsTotal,
  calcIncomeMonth,
  calcSpentMonth,
  cashFlow30Days,
  jobStats,
  resaleStats,
  nextExam,
} from '../lib/calculations';
import { showToast } from '../lib/toast';
import { adoptSmartDailyPriorities } from '../lib/smartPriorities';
import { getActivityTimeline, formatRelativeTime } from '../lib/activityTimeline';
import { getTodayUnifiedOverview } from '../lib/todayOverview';
import { getDashboardNotes } from '../lib/notesFlows';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { getDashboardLayout } from '../lib/dashboardLayout';
import { TodayNotesSection } from './TodayNotesSection';

/** Format an ISO date string (YYYY-MM-DD) for display in Uruguayan locale */
const fmtDate = (iso?: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
};

const activityModuleToView: Record<string, ViewType> = {
  finance: 'finanzas',
  gym: 'gimnasio',
  study: 'estudios',
  resale: 'reventa',
  task: 'agenda',
  inbox: 'notas',
};

interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
  onOpenSearch?: () => void;
  onOpenCapture?: () => void;
  onOpenQuickNote?: () => void;
  onQuickAction?: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
  onOpenSearch,
  onOpenCapture,
  onOpenQuickNote,
  onQuickAction,
}) => {
  const [extraText, setExtraText] = useState('');
  const [extraPriority, setExtraPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  // View Customization State (Monarch-inspired modular layout)
  const [todayCustomization, setTodayCustomization] = useState<TodayViewCustomization>(loadTodayCustomization);
  const [isCustomizeTodayOpen, setIsCustomizeTodayOpen] = useState(false);

  // Alpine Day-Cycle Signature (Dawn, Day, Sunset, Night)
  const dayPeriod = useMemo(() => getDayCyclePeriod(), []);
  const dayConfig = useMemo(() => getDayCycleConfig(dayPeriod), [dayPeriod]);

  const todayIso = todayISO();
  const todayOverview = useMemo(() => {
    return getTodayUnifiedOverview(state, todayIso);
  }, [state, todayIso]);

  const formattedDate = (() => {
    const raw = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  })();

  // Agenda now & next from todayOverview
  const { current, next } = todayOverview.schedule;

  // Financial clarity (guarded & memoized)
  const financeData = useMemo(() => {
    if (!isModuleEnabled(state, 'finanzas')) {
      return null;
    }
    const totalCuentas = calcAccountsTotal(state);
    const cashFlow = cashFlow30Days(state, todayIso);
    const ingresoMes = calcIncomeMonth(state, 0);
    const gastoMes = calcSpentMonth(state, 0);
    const balanceMes = ingresoMes - gastoMes;
    return { totalCuentas, cashFlow, ingresoMes, gastoMes, balanceMes };
  }, [state, todayIso]);

  // Gym clarity from todayOverview
  const gymStatus = todayOverview.workout;
  const weight = todayOverview.workout.weight;

  // General metrics & radar (guarded & memoized)
  const jstats = useMemo(() => {
    return isModuleEnabled(state, 'trabajo') ? jobStats(state) : null;
  }, [state]);

  const rstats = useMemo(() => {
    return isModuleEnabled(state, 'reventa') ? resaleStats(state) : null;
  }, [state]);

  const exam = useMemo(() => {
    return isModuleEnabled(state, 'estudios') ? nextExam(state) : null;
  }, [state]);

  const items = useMemo(() => {
    return todayItems(state, todayIso);
  }, [state, todayIso]);

  const recentActivity = useMemo(() => {
    return getActivityTimeline(state, 12)
      .filter((act) => {
        const view = activityModuleToView[act.module];
        return !view || isModuleEnabled(state, view);
      })
      .slice(0, 6);
  }, [state]);

  const dashboardNotes = useMemo(() => {
    if (!isModuleEnabled(state, 'notas')) {
      return { pinned: [], recent: [] };
    }
    return getDashboardNotes(state.notes?.postits || []);
  }, [state]);

  const handleActivityNavigate = (module: string) => {
    switch (module) {
      case 'finance':
        onNavigate('finanzas');
        break;
      case 'gym':
        onNavigate('gimnasio');
        break;
      case 'study':
        onNavigate('estudios');
        break;
      case 'resale':
        onNavigate('reventa');
        break;
      case 'task':
        onNavigate('agenda');
        break;
      case 'inbox':
        onNavigate('notas');
        break;
      default:
        onNavigate('dashboard');
        break;
    }
  };

  const daysSinceBackup = state.settings.lastBackupAt
    ? daysBetween(state.settings.lastBackupAt, todayIso)
    : null;
  const backupUrgent = daysSinceBackup === null || daysSinceBackup >= 3;

  // Today's priorities
  const todayPriorities = (state.dailyPriorities || []).filter((p) => p.date === todayIso);

  const handleAddPriority = (text: string) => {
    onUpdateState((draft) => {
      if (!draft.dailyPriorities) draft.dailyPriorities = [];
      const existing = draft.dailyPriorities.filter((p) => p.date === todayIso);
      const usedRanks = existing.map((p) => p.rank || 0);
      const nextRank = [1, 2, 3].find((r) => !usedRanks.includes(r)) || existing.length + 1;
      draft.dailyPriorities.push({
        id: uid(),
        date: todayIso,
        text: text.trim(),
        done: false,
        rank: nextRank,
      });
    });
    showToast('Prioridad agregada para hoy.');
  };

  const handleSmartSuggestPriorities = () => {
    onUpdateState((draft) => {
      const count = adoptSmartDailyPriorities(draft, 3);
      if (count > 0) {
        playSound('success');
        showToast(`✦ ${count} prioridad(es) adoptadas según tus urgencias y vencimientos.`);
      } else {
        showToast('No se detectaron urgencias adicionales para hoy.', 'info');
      }
    });
  };

  const handleTogglePriority = (priority: typeof todayPriorities[0]) => {
    playSound('success');
    onUpdateState((draft) => {
      if (!draft.dailyPriorities) draft.dailyPriorities = [];
      const p = draft.dailyPriorities.find((x) => x.id === priority.id);
      if (p) p.done = !p.done;
    });
  };

  const handleRemovePriority = (id: string) => {
    onUpdateState((draft) => {
      draft.dailyPriorities = (draft.dailyPriorities || []).filter((x) => x.id !== id);
    });
  };

  const handleAddExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraText.trim()) return;
    onUpdateState((draft) => {
      if (!draft.todayExtras) draft.todayExtras = [];
      draft.todayExtras.push({
        id: uid(),
        date: todayIso,
        text: extraText.trim(),
        done: false,
        priority: extraPriority,
      });
    });
    setExtraText('');
    showToast('Tarea agregada para hoy.');
  };

  const handleToggleItem = (item: ReturnType<typeof todayItems>[0]) => {
    if (!item.done && item.isBlocked && item.blockingTaskNames?.length) {
      const blockersStr = item.blockingTaskNames.map((n) => `• ${n}`).join('\n');
      const proceed = window.confirm(
        `Esta tarea depende de requisitos aún no completados:\n\n${blockersStr}\n\n¿Deseas marcarla como completada de todos modos?`
      );
      if (!proceed) return;
    }

    playSound('success');
    if (!item.done && item.unblocksCount && item.unblocksCount > 0) {
      showToast(`✦ Tarea completada. ¡Desbloqueaste ${item.unblocksCount} tarea(s)!`, 'success');
    }

    onUpdateState((draft) => {
      const iso = todayISO();
      if (item.kind === 'toggle-task-today') {
        if (!draft.taskLog) draft.taskLog = {};
        if (!draft.taskLog[iso]) draft.taskLog[iso] = {};
        draft.taskLog[iso][item.id] = !draft.taskLog[iso][item.id];
      } else if (item.kind === 'toggle-extra-today') {
        if (!draft.todayExtras) draft.todayExtras = [];
        const extra = draft.todayExtras.find((x) => x.id === item.id);
        if (extra) extra.done = !extra.done;
      } else if (item.kind === 'complete-followup') {
        const app = (draft.jobs?.applications || []).find((a) => a.id === item.id);
        if (app) {
          app.nextAction = '';
          app.nextActionDate = '';
        }
      }
    });
  };

  const handleDeleteExtra = (id: string) => {
    onUpdateState((draft) => {
      draft.todayExtras = (draft.todayExtras || []).filter((x) => x.id !== id);
    });
  };

  const handleToggleRestDay = () => {
    onUpdateState((draft) => {
      if (!draft.gym) draft.gym = { sessions: [], exercises: [], routineTemplates: [], weight: [] } as any;
      if (!draft.gym.restDays) draft.gym.restDays = [];
      if (!draft.checkoutLog) draft.checkoutLog = {};
      const idx = draft.gym.restDays.indexOf(todayIso);
      if (idx >= 0) {
        draft.gym.restDays.splice(idx, 1);
        if (draft.checkoutLog[todayIso]) draft.checkoutLog[todayIso].trainedSkipped = false;
        showToast('Descanso cancelado.');
      } else {
        draft.gym.restDays.push(todayIso);
        if (!draft.checkoutLog[todayIso]) draft.checkoutLog[todayIso] = {};
        draft.checkoutLog[todayIso].trainedSkipped = true;
        showToast('Hoy marcado como descanso activo. Racha protegida.');
      }
    });
  };

  const handleToggleScheduleBlock = (blockId: string) => {
    playSound('success');
    onUpdateState((draft) => {
      const iso = todayISO();
      if (!draft.taskLog) draft.taskLog = {};
      if (!draft.taskLog[iso]) draft.taskLog[iso] = {};
      draft.taskLog[iso][blockId] = !draft.taskLog[iso][blockId];
    });
  };

  const filteredItems = items.filter((item) => {
    if (taskFilter === 'pending') return !item.done;
    if (taskFilter === 'done') return item.done;
    return true;
  });

  const pendingItemsCount = items.filter((i) => !i.done).length;
  const hasUrgentAlerts = Boolean(
    (isModuleEnabled(state, 'trabajo') && jstats && jstats.seguimientosPendientes > 0) ||
    (isModuleEnabled(state, 'estudios') && exam && daysBetween(todayIso, exam.date) <= 7) ||
    (isModuleEnabled(state, 'reventa') && rstats && rstats.oportunidadesNuevas > 0)
  );

  const layout = getDashboardLayout(state, {
    hasActiveNotes: dashboardNotes.pinned.length > 0 || dashboardNotes.recent.length > 0,
    hasRecentActivity: recentActivity.length > 0,
    hasUrgentAlerts,
    hasFinanceData: Boolean(financeData),
  });

  return (
    <div className="relative space-y-6">
      {/* Ambient Alpine Day-Cycle Backdrop (Relief layers & organic time-of-day light) */}
      <AlpineDayCycleBackdrop period={dayPeriod} />

      {/* Header: saludo natural y fecha */}
      <header className="relative pt-3 sm:pt-5 pb-1 sm:pb-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4 z-10">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 dark:text-white drop-shadow-xs">
            {dayConfig.greeting(state.profile?.name || state.settings?.userName || '')}
          </h1>

          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            {formattedDate}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-end">
          <button
            type="button"
            onClick={() => setIsCustomizeTodayOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-800/80 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            title="Personalizar bloques de Hoy"
          >
            <AppIcon name="sliders" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Personalizar</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('checkout')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            title="Cerrar el día en 30 segundos"
          >
            <AppIcon name="moon" className="h-3.5 w-3.5" />
            <span>Check-out del Día</span>
          </button>
        </div>
      </header>

      {/* Urgent Backup Alert (High-Contrast & Dismissible) */}
      {backupUrgent && !backupDismissed && (
        <div className="banner-warning rounded-2xl p-3 sm:px-4 flex items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0 font-medium text-[var(--warning-text-emphasis)]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-[var(--warning-icon)]">
              <AppIcon name="shield" className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">
              {daysSinceBackup === null
                ? 'Todavía no exportaste un backup de tus datos locales.'
                : `Hace ${daysSinceBackup} días que no realizás una copia de seguridad.`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onExportJSON}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              Exportar backup
            </button>
            <button
              type="button"
              onClick={() => setBackupDismissed(true)}
              className="text-[var(--warning-text)] hover:text-[var(--warning-text-emphasis)] p-1 text-sm font-bold cursor-pointer transition-colors"
              title="Descartar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Bento Quick Command Bar */}
      {todayCustomization.visibleWidgets.quickBar !== false && (
        <BentoCommandBar
          state={state}
          onUpdateState={onUpdateState}
          onNavigate={onNavigate}
          onOpenSearch={onOpenSearch}
          onOpenCapture={onOpenCapture}
          onQuickAction={onQuickAction}
        />
      )}

      {/* Timeline Now & Next: Continuous Functional Rail */}
      {layout.showTimelineBar && todayCustomization.visibleWidgets.nowNext !== false && (
        <div className="rounded-2xl px-4 py-2.5 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 shadow-2xs space-y-2.5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${current ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-slate-400'}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {current ? 'En curso' : 'Ahora'}
                  </span>
                  {current && (
                    <span className="font-mono text-[10px] font-bold text-slate-500 px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800">
                      {current.time}
                    </span>
                  )}
                </div>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate block mt-0.5">
                  {current ? current.activity : 'Tiempo libre / Sin bloque agendado'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3.5 border-t sm:border-t-0 sm:border-l border-slate-200/60 dark:border-slate-800/60 pt-2 sm:pt-0 sm:pl-4 sm:text-right shrink-0 w-full sm:w-auto justify-between sm:justify-end">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Siguiente
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mt-0.5">
                  {next ? `${next.time} · ${next.activity}` : 'Jornada completada'}
                </span>
              </div>
              {todayOverview.schedule.blocks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFullSchedule(!showFullSchedule)}
                  className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                  title="Ver bloques de agenda de hoy"
                >
                  {showFullSchedule ? 'Ocultar' : `Agenda (${todayOverview.schedule.blocks.length})`}
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Full Day Schedule Drawer */}
          {showFullSchedule && todayOverview.schedule.blocks.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)] space-y-2 animate-in fade-in duration-150">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Bloques programados para hoy:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {todayOverview.schedule.blocks.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => handleToggleScheduleBlock(b.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                      b.done
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-[var(--bg-elevated)] border-[var(--border)] hover:border-[var(--blue)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-[11px] shrink-0 text-[var(--blue)]">
                        {b.time}
                      </span>
                      <span className={`truncate font-medium ${b.done ? 'line-through opacity-70' : 'text-[var(--text)]'}`}>
                        {b.activity}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.done ? 'bg-emerald-500/20 text-emerald-600' : 'bg-[var(--surface-muted)] text-[var(--text-faint)]'}`}>
                      {b.done ? '✓ Hecho' : 'Pendiente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Adaptive Responsive Layout (4-Block semantic composition) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={`contents lg:block ${layout.leftColSpanClass} lg:space-y-6`}>
        {/* Block 1 (Upper Primary): Focus, Radar & Action */}
        <div className={`${layout.leftColSpanClass} order-1 space-y-6 lg:order-none`}>
          {/* 1. The 3 Daily Priorities (Star component - Priority 1: Qué tengo que hacer hoy) */}
          {todayCustomization.visibleWidgets.priorities !== false && (
            <TodayFocus
              priorities={todayPriorities}
              onAdd={handleAddPriority}
              onToggle={handleTogglePriority}
              onRemove={handleRemovePriority}
              onSmartSuggest={handleSmartSuggestPriorities}
            />
          )}

          {/* 2. Radar de Decisiones (Contextual Review by Exception) */}
          {layout.showRadarCard && todayCustomization.visibleWidgets.radar !== false && (() => {
            const radarItems: { id: string; view: ViewType; text: string; icon: string; tone: string }[] = [];

            if (isModuleEnabled(state, 'trabajo') && jstats && jstats.seguimientosPendientes > 0) {
              radarItems.push({
                id: 'job-radar',
                view: 'trabajo',
                text: `${jstats.seguimientosPendientes} seguimiento(s) de empleo vencido(s)`,
                icon: '💼',
                tone: 'border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-500/15',
              });
            }

            if (isModuleEnabled(state, 'estudios') && exam && daysBetween(todayIso, exam.date) <= 7) {
              const subj = (state.study?.subjects || []).find((s) => s.id === exam.subjectId)?.name || 'materia';
              radarItems.push({
                id: 'study-radar',
                view: 'estudios',
                text: `Examen de ${subj} en ${daysBetween(todayIso, exam.date)}d`,
                icon: '📚',
                tone: 'border-purple-500/25 bg-purple-500/10 text-purple-900 dark:text-purple-200 hover:bg-purple-500/15',
              });
            }

            if (isModuleEnabled(state, 'reventa') && rstats && rstats.oportunidadesNuevas > 0) {
              radarItems.push({
                id: 'resale-radar',
                view: 'reventa',
                text: `${rstats.oportunidadesNuevas} oportunidad(es) de reventa sin revisar`,
                icon: '🔁',
                tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/15',
              });
            }

            if (radarItems.length === 0) return null;

            return (
              <div className="rounded-2xl border-l-4 border-l-amber-500 border-y border-r border-[var(--border)] bg-gradient-to-r from-amber-500/10 via-[var(--card)] to-[var(--card)] p-3 sm:px-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-bold text-[var(--text)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs shadow-2xs">
                      ⚡
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      Señal de Atención
                    </span>
                  </div>
                  <span className="font-mono text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    {radarItems.length} {radarItems.length === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                </div>

                <div className={`grid gap-2 text-xs ${radarItems.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {radarItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.view)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left cursor-pointer transition-all active:scale-[0.99] group shadow-2xs ${item.tone}`}
                    >
                      <span className="font-bold text-[11px] truncate mr-2">
                        {item.icon} {item.text}
                      </span>
                      <AppIcon name="arrowRight" className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 3. Gym Action Card (Adaptive Size & Motivation) */}
          {layout.showGymCard && todayCustomization.visibleWidgets.gymStatus !== false && (() => {
            const isRest = gymStatus.status === 'rest_today';
            const isCompleted = gymStatus.status === 'trained_today';

            // Día de descanso o sesión ya completada: Presentación compacta y elegante
            if (isRest || isCompleted) {
              return (
                <div className="bg-gradient-to-r from-[var(--card)] to-[var(--card-subtle)] border border-[var(--border)] rounded-2xl p-3 sm:px-4 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 shrink-0 shadow-2xs">
                      <GymStreakMark days={gymStatus.streakDays} status={gymStatus.status} size="sm" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-extrabold text-orange-600 dark:text-orange-400">
                          {gymStatus.streakDays}d racha
                        </span>
                        <span className="text-[10px] text-[var(--text-faint)]">·</span>
                        <span className="text-xs font-bold text-[var(--text)] truncate">
                          {isRest ? 'Descanso activo' : 'Entrenamiento completado ✓'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-soft)] truncate">
                        {isCompleted
                          ? `${gymStatus.completedSetsCount} series · ${gymStatus.totalVolume.toLocaleString()} kg`
                          : 'Recuperación física para el próximo ciclo'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isRest ? (
                      <button
                        type="button"
                        onClick={handleToggleRestDay}
                        className="px-2.5 py-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate('gimnasio')}
                        className="px-2.5 py-1 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--card)] border border-[var(--border)] text-[10px] font-bold text-[var(--text)] transition cursor-pointer"
                      >
                        Ver
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // Día activo con sesión pendiente: Card de acción motivadora y clara
            return (
              <div className="relative overflow-hidden bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="absolute top-0 right-0 w-44 h-24 bg-radial from-orange-500/10 via-orange-500/5 to-transparent pointer-events-none rounded-full blur-xl -mr-6 -mt-6" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-faint)] block mb-1">
                      Entrenamiento de hoy
                    </span>
                    <h3 className="text-base font-black text-[var(--text)] tracking-tight">
                      {todayOverview.workout.scheduledTemplateName || 'Sesión del día'}
                    </h3>
                    <p className="text-xs text-[var(--text-soft)] mt-0.5">
                      {todayOverview.workout.scheduledTemplateName
                        ? 'Rutina planificada según tu split semanal'
                        : weight != null
                        ? `Peso corporal actual: ${weight} kg`
                        : 'Sesión libre disponible para registrar'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-black bg-gradient-to-r from-orange-500/15 to-amber-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-2xs shrink-0">
                    <GymStreakMark days={gymStatus.streakDays} status="pending" size="sm" />
                    <span>{gymStatus.streakDays}d racha</span>
                  </div>
                </div>

                <div className="relative pt-2.5 border-t border-[var(--border)] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleToggleRestDay}
                    className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
                  >
                    Tomar descanso hoy
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate('gimnasio')}
                    className="px-4 py-2 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs transition-all active:scale-98 cursor-pointer shadow-xs border border-white/20"
                  >
                    Iniciar sesión →
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Block 3 (Lower Action): Today's Checklist & Routines */}
        {todayCustomization.visibleWidgets.pendingTasks !== false && (
          <div className={`${layout.leftColSpanClass} order-3 lg:order-none`}>
            {/* Today's Checklist & Routines Card */}
            <div className="rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shadow-2xs">
                  <AppIcon name="check" className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)] tracking-tight">
                    Tareas y Rutinas de Hoy
                  </h3>
                  <span className="text-[11px] text-[var(--text-soft)]">
                    {pendingItemsCount === 0 ? '¡Todo listo por hoy!' : `${pendingItemsCount} pendiente(s)`}
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border)] text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setTaskFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    taskFilter === 'all'
                      ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Todas ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    taskFilter === 'pending'
                      ? 'bg-[var(--card)] text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Pendientes ({pendingItemsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('done')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    taskFilter === 'done'
                      ? 'bg-[var(--card)] text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Hechas ({items.length - pendingItemsCount})
                </button>
              </div>
            </div>

            {/* Quick Add Extra Form */}
            <form onSubmit={handleAddExtra} className="flex flex-wrap items-center gap-2 p-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl focus-within:border-indigo-500/40 transition-colors">
              <input
                type="text"
                value={extraText}
                onChange={(e) => setExtraText(e.target.value)}
                placeholder="＋ Tarea rápida para hoy..."
                className="flex-1 min-w-[160px] px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-none text-[var(--text)] transition-colors"
              />
              <select
                value={extraPriority}
                onChange={(e) => setExtraPriority(e.target.value as 'alta' | 'media' | 'baja')}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer outline-none font-medium"
              >
                <option value="alta">Prioridad Alta</option>
                <option value="media">Prioridad Media</option>
                <option value="baja">Prioridad Baja</option>
              </select>
              <button
                type="submit"
                disabled={!extraText.trim()}
                className="px-3.5 py-1.5 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:brightness-110 text-white text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0 shadow-2xs border border-white/10"
              >
                <AppIcon name="plus" className="h-3 w-3 text-white" />
                <span>Agregar</span>
              </button>
            </form>

            {/* Task Items List */}
            <div className="divide-y divide-[var(--border)]">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-faint)] font-medium">
                  {taskFilter === 'pending'
                    ? 'No hay tareas pendientes en este momento.'
                    : taskFilter === 'done'
                    ? 'Aún no completaste tareas hoy.'
                    : 'No tenés actividades registradas para hoy.'}
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="py-2.5 flex items-center gap-3 hover:bg-[var(--surface-muted)]/50 px-2 rounded-xl transition-colors group"
                  >
                    {/* Task Row: Action -> State -> Secondary Context */}
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item)}
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center text-xs transition-all shrink-0 cursor-pointer ${
                        item.done
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-2xs'
                          : 'border-[var(--border)] bg-[var(--surface-muted)] text-transparent hover:border-[var(--blue)] active:scale-95'
                      }`}
                      title={item.done ? 'Marcar pendiente' : 'Marcar completada'}
                    >
                      <AppIcon name="check" className="h-3 w-3" />
                    </button>

                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span
                        onClick={() => handleToggleItem(item)}
                        className={`text-xs sm:text-sm cursor-pointer select-none truncate ${
                          item.done
                            ? 'line-through text-[var(--text-faint)] font-normal'
                            : 'text-[var(--text)] font-semibold'
                        }`}
                      >
                        {item.text}
                      </span>

                      {/* If task is an elected Daily Priority, show discrete badge instead of full duplication */}
                      {todayPriorities.some((p) => p.text.trim().toLowerCase() === item.text.trim().toLowerCase()) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                          <span>★</span>
                          <span>Prioridad</span>
                        </span>
                      )}

                      {!item.done && item.isBlocked && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0"
                          title={
                            item.blockingTaskNames && item.blockingTaskNames.length > 0
                              ? `Bloqueada por:\n${item.blockingTaskNames.map((n) => `• ${n}`).join('\n')}`
                              : 'Bloqueada por dependencias pendientes'
                          }
                        >
                          <AppIcon name="lock" className="h-2.5 w-2.5" />
                          <span>Bloqueada</span>
                        </span>
                      )}

                      {!item.done && item.unblocksCount != null && item.unblocksCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0"
                          title={`Completar esta tarea desbloqueará ${item.unblocksCount} tarea(s)`}
                        >
                          <AppIcon name="unlock" className="h-2.5 w-2.5" />
                          <span>Desbloquea {item.unblocksCount}</span>
                        </span>
                      )}

                      {item.dueDate && (
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-semibold border shrink-0 ${
                            item.dueDate < todayIso
                              ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
                              : item.dueDate === todayIso
                              ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                              : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          }`}
                          title={`Fecha límite: ${fmtDate(item.dueDate)}`}
                        >
                          <AppIcon name="clock" className="h-2.5 w-2.5" />
                          <span>{item.dueDate === todayIso ? 'Hoy' : fmtDate(item.dueDate)}</span>
                        </span>
                      )}
                    </div>

                    {!item.done && item.priority && item.priority === 'alta' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0 hidden sm:inline">
                        Alta
                      </span>
                    )}

                    <span
                      className="text-[9px] font-medium text-[var(--text-faint)] px-1.5 py-0.5 rounded bg-[var(--surface-muted)] shrink-0 capitalize border border-transparent"
                    >
                      {item.source}
                    </span>

                    {item.source === 'extra' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExtra(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-faint)] hover:text-rose-500 p-1 transition cursor-pointer"
                        title="Eliminar tarea extra"
                      >
                        <AppIcon name="x" className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        )}

        </div>

        <div className={`contents lg:block ${layout.rightColSpanClass} lg:space-y-6`}>
        {/* Block 2 (Upper Contextual): Finance & Personal Context */}
        <div className={`${layout.rightColSpanClass} order-2 space-y-6 lg:order-none`}>
          {/* 1. Compact Intelligent Financial Overview */}
          {layout.showFinanceCard && financeData && todayCustomization.visibleWidgets.financeClarity !== false && (() => {
            const { totalCuentas, cashFlow, ingresoMes, gastoMes, balanceMes } = financeData;
            return (
              <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md p-5 shadow-2xs space-y-3.5">
                {/* Abstract Ambient Liquidity Flow Mark */}
                <FinanceFlowMark status={cashFlow.thresholdWarning ? 'warning' : 'healthy'} />
                <div className="absolute top-0 right-0 w-36 h-20 bg-radial from-emerald-500/10 via-emerald-500/5 to-transparent pointer-events-none rounded-full blur-xl -mr-4 -mt-4" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-2xs">
                      <AppIcon name="wallet" className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-[var(--text)]">Liquidez y Compromisos</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('finanzas')}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Finanzas →
                  </button>
                </div>

                <div className="relative grid grid-cols-2 gap-3 py-2 border-y border-[var(--border)]/60">
                  <div
                    onClick={() => onNavigate('finanzas')}
                    className="cursor-pointer group"
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-faint)] block">
                      Saldo Real
                    </span>
                    <div className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tabular-nums mt-0.5">
                      <PrivacyAmount>{fmtMoney(totalCuentas)}</PrivacyAmount>
                    </div>
                    <span className="text-[10px] text-[var(--text-soft)] block mt-0.5 font-medium">
                      {state.finance.accounts.length} {state.finance.accounts.length === 1 ? 'cuenta' : 'cuentas activas'}
                    </span>
                  </div>

                  <div
                    onClick={() => onNavigate('finanzas')}
                    className="cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-faint)] block">
                        Disponible (30d)
                      </span>
                      {cashFlow.thresholdWarning && (
                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded ${
                          cashFlow.isDeficit
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        }`}>
                          {cashFlow.isDeficit ? 'Déficit' : 'Alerta'}
                        </span>
                      )}
                    </div>
                    <div className={`text-xl sm:text-2xl font-black tracking-tight tabular-nums mt-0.5 ${
                      cashFlow.realAvailable >= 0
                        ? cashFlow.thresholdWarning
                          ? 'text-amber-500'
                          : 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600'
                    }`}>
                      <PrivacyAmount>{fmtMoney(cashFlow.realAvailable)}</PrivacyAmount>
                    </div>
                    <span className="text-[10px] text-[var(--text-soft)] block mt-0.5 tabular-nums font-medium">
                      −<PrivacyAmount>{fmtMoney(cashFlow.committed)}</PrivacyAmount> compromisos
                    </span>
                  </div>
                </div>

                {/* Mes Balance Bar */}
                <div
                  onClick={() => onNavigate('finanzas')}
                  className="relative flex items-center justify-between pt-0.5 cursor-pointer group text-xs"
                >
                  <span className="text-[11px] text-[var(--text-soft)]">
                    Mes: +<PrivacyAmount>{fmtMoney(ingresoMes)}</PrivacyAmount> / −<PrivacyAmount>{fmtMoney(gastoMes)}</PrivacyAmount>
                  </span>
                  <span
                    className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md tabular-nums ${
                      balanceMes >= 0
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    <PrivacyAmount>{balanceMes >= 0 ? `+${fmtMoney(balanceMes)}` : fmtMoney(balanceMes)}</PrivacyAmount>
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 2. Personal Context & Sleep/Energy */}
          <PersonalContextCard state={state} onUpdateState={onUpdateState} />
        </div>

        {/* Block 4 (Lower Secondary): Notes, Weekly Review & Activity */}
        <div className={`${layout.rightColSpanClass} order-4 space-y-6 lg:order-none`}>

          {/* 3. Notas (only rendered when active notes exist) */}
          {layout.showNotesCard && todayCustomization.visibleWidgets.recentNotes !== false && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-2xs sm:p-4">
              <TodayNotesSection
                pinnedNotes={dashboardNotes.pinned}
                recentNotes={dashboardNotes.recent}
                privacyMode={state.settings.privacyMode}
                onNavigate={() => onNavigate('notas')}
                onAddNote={() => {
                  if (onOpenQuickNote) onOpenQuickNote();
                  else if (onOpenCapture) onOpenCapture();
                  else onNavigate('notas');
                }}
              />
            </div>
          )}

          {/* 4. Weekly Review Card */}
          <WeeklyReviewCard state={state} onUpdateState={onUpdateState} onNavigate={onNavigate} />

          {/* 5. Actividad Reciente (Cross-Module Event Timeline, editorial format) */}
          {layout.showActivityCard && todayCustomization.visibleWidgets.recentActivity !== false && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 shadow-2xs">
                    <AppIcon name="activity" className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">Actividad Reciente</h3>
                    <span className="text-[10px] text-[var(--text-faint)]">Eventos entre módulos</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-[var(--text-faint)] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--surface-muted)]">
                  {recentActivity.length} eventos
                </span>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {recentActivity.map((act) => (
                  <div
                    key={act.id}
                    onClick={() => handleActivityNavigate(act.module)}
                    className="py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--surface-muted)]/60 px-2 rounded-xl transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-soft)] group-hover:bg-indigo-500/10 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 transition-colors">
                        <AppIcon name={act.iconName} className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text)] truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {act.title}
                        </p>
                        {act.subtitle && (
                          <p className="text-[10px] text-[var(--text-faint)] truncate">
                            {act.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-[var(--text-faint)]">
                        {formatRelativeTime(act.timestamp)}
                      </span>
                      <AppIcon name="arrowRight" className="h-3 w-3 text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Modal: Personalizar Hoy (Monarch-style) */}
      <CustomizeTodayModal
        isOpen={isCustomizeTodayOpen}
        onClose={() => setIsCustomizeTodayOpen(false)}
        config={todayCustomization}
        onSave={(newCfg) => {
          saveTodayCustomization(newCfg);
          setTodayCustomization(newCfg);
        }}
      />
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse p-4 max-w-7xl mx-auto">
      <div className="h-20 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="h-44 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
          <div className="h-80 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <div className="h-36 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
          <div className="h-48 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
        </div>
      </div>
    </div>
  );
};
