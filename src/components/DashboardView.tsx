import React, { useEffect, useMemo, useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { TodayFocus } from './TodayFocus';
import { PersonalContextCard } from './PersonalContextCard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { AppIcon } from './AppIcon';
import { BentoCommandBar } from './BentoCommandBar';
import { AlpineDayCycleBackdrop } from './visual/AlpineDayCycleBackdrop';
import { getDayCycleConfig, getDayCyclePeriod } from '../lib/alpineDayCycle';
import { daysBetween, todayISO, uid } from '../lib/storage';
import { todayItems } from '../lib/calculations';
import { showToast } from '../lib/toast';
import { adoptSmartDailyPriorities } from '../lib/smartPriorities';
import { formatRelativeTime, getActivityTimeline } from '../lib/activityTimeline';
import { getDashboardNotes } from '../lib/notesFlows';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { isWeeklyReviewDue } from '../lib/review';
import { TodayNotesSection } from './TodayNotesSection';

const MAX_VISIBLE_TASKS = 6;

const fmtDate = (iso?: string): string => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
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

  const [now, setNow] = useState(() => new Date());
  const dayPeriod = getDayCyclePeriod(now);
  const dayConfig = getDayCycleConfig(dayPeriod);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayIso = todayISO();
  const formattedDate = (() => {
    const value = now.toLocaleDateString('es-UY', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return value.charAt(0).toUpperCase() + value.slice(1);
  })();

  const items = useMemo(() => todayItems(state, todayIso), [state, todayIso]);
  const recentActivity = useMemo(
    () => getActivityTimeline(state, 10)
      .filter((activity) => {
        const view = activityModuleToView[activity.module];
        return !view || isModuleEnabled(state, view);
      })
      .slice(0, 4),
    [state]
  );
  const dashboardNotes = useMemo(() => getDashboardNotes(state.notes?.postits || []), [state.notes?.postits]);

  const daysSinceBackup = state.settings.lastBackupAt
    ? daysBetween(state.settings.lastBackupAt, todayIso)
    : null;
  const backupUrgent = daysSinceBackup === null || daysSinceBackup >= 3;
  const weeklyReviewNeedsAttention = isWeeklyReviewDue(state, todayIso);
  const showAttention = (backupUrgent && !backupDismissed) || weeklyReviewNeedsAttention;
  const todayPriorities = (state.dailyPriorities || []).filter((priority) => priority.date === todayIso);

  const filteredItems = items.filter((item) => {
    if (taskFilter === 'pending') return !item.done;
    if (taskFilter === 'done') return item.done;
    return true;
  });
  const visibleItems = filteredItems.slice(0, MAX_VISIBLE_TASKS);
  const hiddenItemsCount = Math.max(0, filteredItems.length - visibleItems.length);
  const pendingItemsCount = items.filter((item) => !item.done).length;

  const handleAddPriority = (text: string) => {
    onUpdateState((draft) => {
      if (!draft.dailyPriorities) draft.dailyPriorities = [];
      const existing = draft.dailyPriorities.filter((priority) => priority.date === todayIso);
      const usedRanks = existing.map((priority) => priority.rank || 0);
      const nextRank = [1, 2, 3].find((rank) => !usedRanks.includes(rank)) || existing.length + 1;
      draft.dailyPriorities.push({ id: uid(), date: todayIso, text: text.trim(), done: false, rank: nextRank });
    });
    showToast('Prioridad agregada para hoy.');
  };

  const handleSmartSuggestPriorities = () => {
    onUpdateState((draft) => {
      const count = adoptSmartDailyPriorities(draft, 3);
      if (count > 0) {
        playSound('success');
        showToast(`${count} prioridad(es) adoptadas según tus urgencias y vencimientos.`);
      } else {
        showToast('No se detectaron urgencias adicionales para hoy.', 'info');
      }
    });
  };

  const handleTogglePriority = (priority: typeof todayPriorities[number]) => {
    playSound('success');
    onUpdateState((draft) => {
      const target = (draft.dailyPriorities || []).find((item) => item.id === priority.id);
      if (target) target.done = !target.done;
    });
  };

  const handleRemovePriority = (id: string) => {
    onUpdateState((draft) => {
      draft.dailyPriorities = (draft.dailyPriorities || []).filter((priority) => priority.id !== id);
    });
  };

  const handleAddExtra = (event: React.FormEvent) => {
    event.preventDefault();
    if (!extraText.trim()) return;
    onUpdateState((draft) => {
      if (!draft.todayExtras) draft.todayExtras = [];
      draft.todayExtras.push({ id: uid(), date: todayIso, text: extraText.trim(), done: false, priority: extraPriority });
    });
    setExtraText('');
    showToast('Tarea agregada para hoy.');
  };

  const handleToggleItem = (item: ReturnType<typeof todayItems>[number]) => {
    if (!item.done && item.isBlocked && item.blockingTaskNames?.length) {
      const blockers = item.blockingTaskNames.map((name) => `• ${name}`).join('\n');
      const proceed = window.confirm(
        `Esta tarea depende de requisitos aún no completados:\n\n${blockers}\n\n¿Deseas marcarla como completada de todos modos?`
      );
      if (!proceed) return;
    }

    playSound('success');
    if (!item.done && item.unblocksCount && item.unblocksCount > 0) {
      showToast(`Tarea completada. Desbloqueaste ${item.unblocksCount} tarea(s).`, 'success');
    }

    onUpdateState((draft) => {
      const iso = todayISO();
      if (item.kind === 'toggle-task-today') {
        if (!draft.taskLog) draft.taskLog = {};
        if (!draft.taskLog[iso]) draft.taskLog[iso] = {};
        draft.taskLog[iso][item.id] = !draft.taskLog[iso][item.id];
      } else if (item.kind === 'toggle-extra-today') {
        const extra = (draft.todayExtras || []).find((candidate) => candidate.id === item.id);
        if (extra) extra.done = !extra.done;
      } else if (item.kind === 'complete-followup') {
        const application = (draft.jobs?.applications || []).find((candidate) => candidate.id === item.id);
        if (application) {
          application.nextAction = '';
          application.nextActionDate = '';
        }
      }
    });
  };

  const handleDeleteExtra = (id: string) => {
    onUpdateState((draft) => {
      draft.todayExtras = (draft.todayExtras || []).filter((item) => item.id !== id);
    });
  };

  const handleActivityNavigate = (module: string) => {
    onNavigate(activityModuleToView[module] || 'dashboard');
  };

  return (
    <div className="relative space-y-5 sm:space-y-6">
      <header className="relative isolate flex min-h-[180px] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--hero-bg)] px-5 py-6 shadow-[var(--card-shadow)] sm:min-h-[208px] sm:px-8 sm:py-8">
        <AlpineDayCycleBackdrop forcePeriod={dayPeriod} compact />
        <div className="relative z-10 flex w-full flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div className="max-w-[72%] space-y-1.5 sm:max-w-[58%]">
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-[var(--text)] sm:text-[2.65rem] sm:leading-[1.05]">
              {dayConfig.greeting(state.profile?.name || state.settings?.userName || '')}
            </h1>
            <p className="text-xs font-medium text-[var(--text-soft)] sm:text-[13px]">{formattedDate}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('checkout')}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/55 px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)] backdrop-blur-md transition hover:border-[var(--border-hover)] hover:bg-[var(--card)]/75 hover:text-[var(--text)]"
          >
            <AppIcon name="moon" className="h-3.5 w-3.5" />
            Cerrar el día
          </button>
        </div>
      </header>

      <div className="hidden sm:block">
        <BentoCommandBar
          state={state}
          onUpdateState={onUpdateState}
          onNavigate={onNavigate}
          onOpenSearch={onOpenSearch}
          onOpenCapture={onOpenCapture}
          onQuickAction={onQuickAction}
        />
      </div>

      {showAttention && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-[var(--card-shadow)]" aria-labelledby="today-attention-title">
          <h2 id="today-attention-title" className="px-1 pb-1.5 text-[10px] font-semibold text-[var(--text-faint)]">Requiere atención</h2>
          {backupUrgent && !backupDismissed && (
            <div className="flex items-center gap-3 border-t border-[var(--border)]/70 px-1 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AppIcon name="shield" className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-xs font-semibold text-[var(--text)]">Backup pendiente</strong>
                <span className="block truncate text-[10px] text-[var(--text-soft)] sm:text-[11px]">
                  {daysSinceBackup === null ? 'Todavía no exportaste una copia de tus datos locales' : `La última copia fue hace ${daysSinceBackup} días`}
                </span>
              </div>
              <button type="button" onClick={onExportJSON} className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 transition hover:bg-[var(--surface-muted)] dark:text-indigo-400">Exportar</button>
              <button type="button" onClick={() => setBackupDismissed(true)} className="shrink-0 p-1 text-[var(--text-faint)] transition hover:text-[var(--text)]" aria-label="Descartar aviso de backup">
                <AppIcon name="x" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {weeklyReviewNeedsAttention && <WeeklyReviewCard state={state} onUpdateState={onUpdateState} onNavigate={onNavigate} />}
        </section>
      )}

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-8">
        <div className="contents min-w-0 lg:block lg:flex-[1.65] lg:space-y-7">
          <div className="order-1">
            <TodayFocus priorities={todayPriorities} onAdd={handleAddPriority} onToggle={handleTogglePriority} onRemove={handleRemovePriority} onSmartSuggest={handleSmartSuggestPriorities} />
          </div>

          <section className="order-2 space-y-4 border-y border-[var(--border)] py-5" aria-labelledby="today-tasks-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <AppIcon name="check" className="h-4 w-4 text-indigo-500" />
                  <h2 id="today-tasks-title" className="text-base font-bold text-[var(--text)]">Tareas de hoy</h2>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">{pendingItemsCount === 0 ? 'No quedan tareas pendientes' : `${pendingItemsCount} pendientes`}</p>
              </div>

              <div className="flex items-center gap-1 text-[10px] font-semibold">
                {([['all', `Todas ${items.length}`], ['pending', `Pendientes ${pendingItemsCount}`], ['done', `Hechas ${items.length - pendingItemsCount}`]] as const).map(([filter, label]) => (
                  <button key={filter} type="button" onClick={() => setTaskFilter(filter)} className={`rounded-lg px-2 py-1 transition ${taskFilter === filter ? 'bg-[var(--surface-muted)] text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'}`}>{label}</button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddExtra} className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
              <input type="text" value={extraText} onChange={(event) => setExtraText(event.target.value)} placeholder="Agregar una tarea para hoy" className="min-w-[170px] flex-1 bg-transparent px-1 py-1.5 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]" />
              <select value={extraPriority} onChange={(event) => setExtraPriority(event.target.value as typeof extraPriority)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5 text-[10px] font-medium text-[var(--text-soft)] outline-none" aria-label="Prioridad de la nueva tarea">
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
              <button type="submit" disabled={!extraText.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-indigo-500 disabled:opacity-40">
                <AppIcon name="plus" className="h-3 w-3" />Agregar
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]/70">
              {visibleItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--text-faint)]">
                  {taskFilter === 'pending' ? 'No hay tareas pendientes en este momento.' : taskFilter === 'done' ? 'Todavía no completaste tareas hoy.' : 'No tenés actividades registradas para hoy.'}
                </p>
              ) : visibleItems.map((item) => (
                <div key={item.id} className="group flex items-center gap-3 px-1 py-3">
                  <button type="button" onClick={() => handleToggleItem(item)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs transition ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border-hover)] text-transparent hover:border-indigo-500'}`} title={item.done ? 'Marcar pendiente' : 'Marcar completada'}>
                    <AppIcon name="check" className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => handleToggleItem(item)} className={`min-w-0 flex-1 truncate text-left text-xs sm:text-sm ${item.done ? 'font-normal text-[var(--text-faint)] line-through' : 'font-medium text-[var(--text)]'}`}>{item.text}</button>
                  {!item.done && item.isBlocked && <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-500" title={item.blockingTaskNames?.join(', ')}>Bloqueada</span>}
                  {item.dueDate && <span className={`shrink-0 text-[9px] font-semibold ${item.dueDate < todayIso ? 'text-rose-500' : item.dueDate === todayIso ? 'text-amber-500' : 'text-[var(--text-faint)]'}`}>{item.dueDate === todayIso ? 'Hoy' : fmtDate(item.dueDate)}</span>}
                  <span className="hidden shrink-0 text-[9px] capitalize text-[var(--text-faint)] sm:inline">{item.source}</span>
                  {item.source === 'extra' && (
                    <button type="button" onClick={() => handleDeleteExtra(item.id)} className="shrink-0 p-1 text-[var(--text-faint)] transition hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label={`Eliminar ${item.text}`}>
                      <AppIcon name="x" className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {(hiddenItemsCount > 0 || items.length > 0) && (
              <button type="button" onClick={() => onNavigate('agenda')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-400">
                {hiddenItemsCount > 0 ? `Ver ${hiddenItemsCount} más en Agenda` : 'Abrir Agenda'}<AppIcon name="arrowRight" className="h-3 w-3" />
              </button>
            )}
          </section>

        </div>

        <aside className="contents min-w-0 lg:block lg:flex-1 lg:space-y-7">
          <div className="order-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] sm:p-5">
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
          <div className="order-4">
            <PersonalContextCard state={state} onUpdateState={onUpdateState} />
          </div>
        </aside>
      </div>

      {recentActivity.length > 0 && (
        <section className="space-y-3 border-y border-[var(--border)] py-4" aria-labelledby="recent-activity-title">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AppIcon name="activity" className="h-4 w-4 text-[var(--text-soft)]" />
              <h2 id="recent-activity-title" className="text-sm font-bold text-[var(--text)]">Actividad reciente</h2>
            </div>
            <span className="text-[10px] text-[var(--text-faint)]">Últimos cambios</span>
          </div>
          <div className="grid divide-y divide-[var(--border)]/70 lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
            {recentActivity.map((activity) => (
              <button key={activity.id} type="button" onClick={() => handleActivityNavigate(activity.module)} className="group flex w-full items-center gap-3 border-b border-[var(--border)]/70 py-2.5 text-left last:border-b-0 lg:[&:nth-last-child(-n+2)]:border-b-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)]"><AppIcon name={activity.iconName} className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-[var(--text)] group-hover:text-indigo-500">{activity.title}</span>{activity.subtitle && <span className="block truncate text-[10px] text-[var(--text-faint)]">{activity.subtitle}</span>}</span>
                <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{formatRelativeTime(activity.timestamp)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-48 rounded-3xl border border-[var(--border)] bg-[var(--hero-bg)]" />
    <div className="h-16 rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
    <div className="flex flex-col gap-7 lg:flex-row lg:gap-8">
      <div className="space-y-7 lg:flex-[1.7]"><div className="h-64 border-y border-[var(--border)] bg-[var(--card)]/30" /><div className="h-72 border-y border-[var(--border)] bg-[var(--card)]/30" /></div>
      <div className="space-y-7 lg:flex-1"><div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--card)]" /><div className="h-24 border-y border-[var(--border)] bg-[var(--card)]/30" /></div>
    </div>
    <div className="h-28 border-y border-[var(--border)] bg-[var(--card)]/20" />
  </div>
);
