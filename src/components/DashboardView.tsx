import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LifeOSState, ViewType, AttentionDismissalRecord } from '../types';
import type { TodayItem } from '../lib/calculations';
import type { TodayAgendaEntry } from '../lib/todayOverview';
import { playSound } from '../lib/audio';
import { PersonalContextCard } from './PersonalContextCard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { AppIcon } from './AppIcon';
import { BentoCommandBar } from './BentoCommandBar';
import { AlpineDayCycleBackdrop } from './visual/AlpineDayCycleBackdrop';
import { getDayCyclePeriod, getLocalGreeting } from '../lib/alpineDayCycle';
import { fmtDate, todayISO, uid } from '../lib/storage';
import { getTodayAgendaEntries, getPastPendingExtras, getFutureScheduledExtras } from '../lib/todayOverview';
import { showToast } from '../lib/toast';
import { formatRelativeTime, getActivityTimeline } from '../lib/activityTimeline';
import type { ActivityTimelineItem } from '../lib/activityTimeline';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { TodayAgendaSection } from './TodayAgendaSection';
import { getTodayAttentionItems, getDismissedAttentionItems, nextAttentionDismissalTimestamp, type AttentionItem } from '../lib/todayAttention';
import { DismissedAttentionModal } from './DismissedAttentionModal';

// The material and outline are painted directly on one normalized SVG contour.
const OBSERVATORY_PANEL_PATH = [
  'M 0.065 0 H 0.8',
  'C 0.855 0 0.885 0.025 0.902 0.105',
  'C 0.936 0.265 0.965 0.6 0.995 0.88',
  'C 1.004 0.964 0.984 1 0.94 1',
  'H 0.065 C 0.029 1 0 0.96 0 0.91',
  'V 0.09 C 0 0.04 0.029 0 0.065 0 Z',
].join(' ');

const activityModuleToView: Record<string, ViewType> = {
  finance: 'finanzas',
  gym: 'gimnasio',
  study: 'estudios',
  resale: 'reventa',
  task: 'agenda',
  inbox: 'notas',
  note: 'notas',
  jobs: 'trabajo',
};

const activityModuleLabel: Record<ActivityTimelineItem['module'], string> = {
  finance: 'Finanzas',
  gym: 'Gym',
  study: 'Estudios',
  task: 'Tarea',
  resale: 'Reventa',
  inbox: 'Bandeja',
  checkout: 'Cierre del día',
  note: 'Nota',
  jobs: 'Trabajo',
};

const formatActivityWhen = (timestamp: string): string => {
  const relative = formatRelativeTime(timestamp);
  if (timestamp.length <= 10 || Number.isNaN(Date.parse(timestamp))) return relative;
  const time = new Date(timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  return `${relative} · ${time}`;
};

interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
  onOpenSearch?: () => void;
  onOpenCapture?: () => void;
  onOpenQuickNote?: () => void;
  onOpenNote?: (noteId: string) => void;
  onQuickAction?: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
  onNavigateToRecord?: (view: ViewType, options?: { tab?: string; focusId?: string; date?: string }) => void;
  initialFocusId?: string | null;
  focusNonce?: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
  onOpenSearch,
  onOpenCapture,
  onOpenQuickNote: _onOpenQuickNote,
  onOpenNote,
  onQuickAction,
  onNavigateToRecord,
  initialFocusId,
  focusNonce,
}) => {
  const observatoryId = useId();
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [completionMotion, setCompletionMotion] = useState<{ taskId: string; nonce: number } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleNextMinute = () => {
      const delay = 60_000 - (Date.now() % 60_000);
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleNextMinute();
      }, delay);
    };
    const refreshClock = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      setNow(new Date());
      scheduleNextMinute();
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') refreshClock(); };
    scheduleNextMinute();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refreshClock);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refreshClock);
    };
  }, []);

  useEffect(() => {
    if (!completionMotion) return;
    const timeout = window.setTimeout(() => setCompletionMotion(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [completionMotion]);

  const todayIso = todayISO();
  const dayPeriod = getDayCyclePeriod(now);
  const formattedTime = now.toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const localDateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fullWeekday = now.toLocaleDateString('es-UY', { weekday: 'long' });
  const capitalizedWeekday = fullWeekday.charAt(0).toUpperCase() + fullWeekday.slice(1);
  const fullMonth = now.toLocaleDateString('es-UY', { month: 'long' }).toLocaleLowerCase('es-UY');
  const formattedFullDate = `${capitalizedWeekday} ${now.getDate()} de ${fullMonth}`;

  const agendaEntries = useMemo(() => getTodayAgendaEntries(state, todayIso), [state, todayIso]);
  const pastPendingExtras = useMemo(
    () => getPastPendingExtras(state, todayIso),
    [state, todayIso]
  );
  const futureScheduledExtras = useMemo(
    () => getFutureScheduledExtras(state, todayIso),
    [state, todayIso]
  );
  // A deep link may target a completed historical task, outside today's lists.
  const selectedExtra = useMemo(() => {
    if (!initialFocusId?.startsWith('today-extra-')) return undefined;
    const id = initialFocusId.slice('today-extra-'.length);
    if (agendaEntries.some(entry => entry.source === 'extra' && entry.id === id) || pastPendingExtras.some(task => task.id === id) || futureScheduledExtras.some(task => task.id === id)) return undefined;
    return state.todayExtras.find(task => task.id === id);
  }, [initialFocusId, state.todayExtras, agendaEntries, pastPendingExtras, futureScheduledExtras]);
  const recentActivity = useMemo(
    () => getActivityTimeline(state, Number.MAX_SAFE_INTEGER, { hideAmounts: true, privacyMode: state.settings.privacyMode })
        .filter((activity) => {
          const view = activityModuleToView[activity.module];
          return !view || isModuleEnabled(state, view);
        })
        .slice(0, 5),
    [state]
  );
  const activityStripRef = useRef<HTMLDivElement>(null);
  const [activityEdges, setActivityEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const strip = activityStripRef.current;
    if (!strip) return;
    const updateEdges = () => {
      const left = strip.scrollLeft > 1;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setActivityEdges((previous) => previous.left === left && previous.right === right ? previous : { left, right });
    };
    updateEdges();
    strip.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges);
    observer?.observe(strip);
    strip.querySelectorAll<HTMLElement>('.today-activity-item').forEach((child) => observer?.observe(child));
    return () => {
      strip.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
      observer?.disconnect();
    };
  }, [recentActivity]);

  const scrollActivity = (direction: -1 | 1) => {
    const strip = activityStripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(240, strip.clientWidth * 0.75), behavior: 'smooth' });
  };

  const [showDismissedModal, setShowDismissedModal] = useState(false);

  const attentionItems = useMemo(
    () => getTodayAttentionItems(state, { todayIso, backupDismissed, now }),
    [state, todayIso, backupDismissed, now]
  );

  const dismissedAttentionItems = useMemo(
    () => getDismissedAttentionItems(state, { todayIso, backupDismissed, now }),
    [state, todayIso, backupDismissed, now]
  );

  const handleAttentionAction = (item: AttentionItem) => {
    if (onNavigateToRecord) {
      onNavigateToRecord(item.targetView, {
        tab: item.targetTab,
        focusId: item.targetFocusId,
        date: item.dueDate,
      });
    } else {
      onNavigate(item.targetView);
    }
  };

  const handleDismissAttention = (item: AttentionItem) => {
    if (onUpdateState((draft) => {
      if (!draft.settings) {
        draft.settings = { darkMode: false, hiddenTabs: [], onboardingCompleted: false, dismissedAttentionKeys: [], attentionDismissals: {} };
      }
      const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
      const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
      const nextDismissals = {
        ...(draft.settings.attentionDismissals || {}),
        [item.dismissKey]: { status: 'dismissed' as const, updatedAt: nextTimestamp },
      };
      draft.settings.attentionDismissals = nextDismissals;
      draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
        .filter(([_, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
        .map(([k]) => k)
        .sort();
    }) === false) return;
    if (item.signalKind === 'backup_urgent') {
      setBackupDismissed(true);
    }
    showToast('Aviso descartado.', 'info');
  };

  const handleRestoreAttentionItem = (item: AttentionItem) => {
    if (onUpdateState((draft) => {
      if (!draft.settings) return;
      const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
      const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
      const nextDismissals = {
        ...(draft.settings.attentionDismissals || {}),
        [item.dismissKey]: { status: 'active' as const, updatedAt: nextTimestamp },
      };
      draft.settings.attentionDismissals = nextDismissals;
      draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
        .filter(([_, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
        .map(([k]) => k)
        .sort();
    }) === false) return;
    if (item.signalKind === 'backup_urgent') {
      setBackupDismissed(false);
    }
    showToast('Aviso restaurado.', 'success');
  };

  const handleRestoreAllDismissed = () => {
    const now = Date.now();
    if (onUpdateState((draft) => {
      if (!draft.settings) return;
      const nextDismissals = { ...(draft.settings.attentionDismissals || {}) };
      for (const item of dismissedAttentionItems) {
        const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
        const nextTimestamp = nextAttentionDismissalTimestamp(prevRec, now);
        nextDismissals[item.dismissKey] = { status: 'active' as const, updatedAt: nextTimestamp };
      }
      draft.settings.attentionDismissals = nextDismissals;
      draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
        .filter(([_, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
        .map(([k]) => k)
        .sort();
    }) === false) return;
    setBackupDismissed(false);
    showToast('Todos los avisos fueron restaurados.', 'success');
  };
  const dayClosed = Boolean(state.checkoutLog?.[todayIso]?.closedAt);

  const handleToggleItem = (item: TodayItem, entryKey?: string): boolean => {
    if (!item.done && item.isBlocked && item.blockingTaskNames?.length) {
      const blockers = item.blockingTaskNames.map((name) => `• ${name}`).join('\n');
      if (!window.confirm(`Esta tarea depende de requisitos aún no completados:\n\n${blockers}\n\n¿Deseas marcarla como completada de todos modos?`)) return false;
    }

    const nextCompleted = !item.done;
    let applied = false;
    const saved = onUpdateState((draft) => {
      if (item.kind === 'toggle-task-today') {
        if (!draft.taskLog) draft.taskLog = {};
        if (!draft.taskLog[todayIso]) draft.taskLog[todayIso] = {};
        draft.taskLog[todayIso][item.id] = nextCompleted;
        applied = true;
      } else if (item.kind === 'toggle-extra-today') {
        const extra = (draft.todayExtras || []).find((candidate) => candidate.id === item.id);
        if (extra) {
          extra.done = nextCompleted;
          applied = true;
        }
      } else if (item.kind === 'toggle-project-task') {
        for (const project of draft.projects || []) {
          const task = (project.tasks || []).find((candidate) => candidate.id === item.id);
          if (task) {
            task.done = nextCompleted;
            applied = true;
            break;
          }
        }
      } else if (item.kind === 'complete-followup') {
        const application = (draft.jobs?.applications || []).find((candidate) => candidate.id === item.id);
        if (application) {
          application.nextAction = '';
          application.nextActionDate = '';
          applied = true;
        }
      }
    });
    if (!saved || !applied) return false;
    if (nextCompleted) {
      playSound('success');
      if (entryKey) {
        setCompletionMotion((prev) => ({ taskId: entryKey, nonce: (prev?.nonce || 0) + 1 }));
      }
      if (item.unblocksCount) showToast(`Actividad completada. Desbloqueaste ${item.unblocksCount} tarea(s).`, 'success');
    }
    return true;
  };

  const handleToggleAgendaEntry = (entry: TodayAgendaEntry) => {
    if (entry.source === 'priority' && entry.priorityId) {
      const nextCompleted = !entry.done;
      let applied = false;
      const saved = onUpdateState((draft) => {
        const target = (draft.dailyPriorities || []).find((priority) => priority.id === entry.priorityId);
        if (target) { target.done = nextCompleted; applied = true; }
      });
      if (saved && applied && nextCompleted) {
        playSound('success');
        setCompletionMotion((prev) => ({ taskId: entry.key, nonce: (prev?.nonce || 0) + 1 }));
      }
      return;
    }
    if (entry.todayItem) handleToggleItem(entry.todayItem, entry.key);
  };

  const handleToggleFocus = (entry: TodayAgendaEntry) => {
    if (onUpdateState((draft) => {
      if (!draft.dailyPriorities) draft.dailyPriorities = [];
      if (entry.priorityId) {
        draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.id !== entry.priorityId);
        return;
      }
      const todayPriorities = draft.dailyPriorities.filter((priority) => priority.date === todayIso);
      if (todayPriorities.length >= 3) {
        showToast('Ya tenés tres prioridades para hoy.', 'info');
        return;
      }
      const usedRanks = todayPriorities.map((priority) => priority.rank || 0);
      const rank = [1, 2, 3].find((candidate) => !usedRanks.includes(candidate)) || todayPriorities.length + 1;
      draft.dailyPriorities.push({ id: uid(), date: todayIso, text: entry.label, done: entry.done, rank });
    }) === false) return;
  };

  const handleToggleExtraDirect = (extraId: string) => {
    let completed = false;
    const saved = onUpdateState((draft) => {
      const extra = (draft.todayExtras || []).find((x) => x.id === extraId);
      if (extra) {
        extra.done = !extra.done;
        completed = extra.done;
      }
    });
    if (saved && completed) {
      playSound('success');
      showToast('Actividad completada.', 'success');
    }
  };

  const handleRescheduleExtra = (extraId: string, newDate: string) => {
    const saved = onUpdateState((draft) => {
      const extra = (draft.todayExtras || []).find((x) => x.id === extraId);
      if (extra) {
        extra.date = newDate;
      }
    });
    if (saved) {
      showToast(newDate === todayIso ? 'Tarea programada para hoy.' : `Tarea reprogramada para el ${fmtDate(newDate)}.`, 'info');
    }
  };

  const isMovingAllPastRef = useRef(false);

  const handleMoveAllPastToToday = () => {
    if (isMovingAllPastRef.current) return;
    if (!pastPendingExtras.length) return;
    const count = pastPendingExtras.length;
    let confirmed = false;
    try {
      confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(
            `¿Mover ${count === 1 ? 'la tarea pendiente anterior' : `las ${count} tareas pendientes anteriores`} a la agenda de hoy?\n\nLas fechas límite (si las tienen) no se modificarán.`
          )
        : true;
    } catch {
      confirmed = true;
    }
    if (!confirmed) return;

    isMovingAllPastRef.current = true;
    try {
      let movedCount = 0;
      const saved = onUpdateState((draft) => {
        for (const extra of draft.todayExtras || []) {
          if (extra.date < todayIso && !extra.done) {
            extra.date = todayIso;
            movedCount++;
          }
        }
      });
      if (saved && movedCount > 0) {
        showToast(`${movedCount === 1 ? '1 tarea movida' : `${movedCount} tareas movidas`} a hoy.`, 'success');
      }
    } finally {
      isMovingAllPastRef.current = false;
    }
  };

  const handleActivityNavigate = (activity: ActivityTimelineItem) => {
    if (activity.module === 'note' && activity.recordId && onOpenNote) onOpenNote(activity.recordId);
    else onNavigate(activityModuleToView[activity.module] || 'dashboard');
  };
  const openAgendaDestination = () => {
    if (isModuleEnabled(state, 'agenda')) onNavigate('agenda');
    else if (isModuleEnabled(state, 'calendario')) onNavigate('calendario');
  };
  const agendaOpenLabel = isModuleEnabled(state, 'agenda') ? 'Abrir Agenda' : isModuleEnabled(state, 'calendario') ? 'Abrir Calendario' : null;

  return (
    <div className="today-shell relative mx-auto flex w-full flex-col gap-3 sm:gap-4">
      <header
        data-hero-period={dayPeriod}
        className="today-hero order-1 relative isolate flex min-h-[310px] overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--hero-bg)] px-3 py-3 sm:min-h-[360px] sm:rounded-[26px] sm:px-8 sm:py-6 lg:min-h-[410px] xl:min-h-[430px] 2xl:min-h-[450px]"
      >
        <AlpineDayCycleBackdrop forcePeriod={dayPeriod} compact />
        <div className="relative z-10 flex w-full flex-col items-start justify-between gap-2.5 sm:gap-3">
          {!dayClosed ? (
            <button type="button" onClick={() => onNavigate('checkout')} aria-label="Cerrar el día" className="today-hero-action inline-flex shrink-0 self-end items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] transition sm:px-3 sm:py-1.5"><AppIcon name="moon" className="h-3.5 w-3.5 opacity-85" /><span className="hidden sm:inline">Cerrar el día</span></button>
          ) : (
            <span className="today-hero-closed inline-flex shrink-0 self-end items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] sm:px-3 sm:py-1.5"><AppIcon name="check" className="h-3.5 w-3.5" />Día cerrado</span>
          )}
          <section className="today-observatory-panel" aria-label="Observatorio Celestiva, momento actual">
            <svg className="today-observatory-shape" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id={`${observatoryId}-material`} x1="0" y1="0" x2="1" y2="0.6" gradientUnits="objectBoundingBox">
                  <stop offset="0" stopColor="var(--observatory-ink)" />
                  <stop offset="0.62" stopColor="var(--observatory-smoke)" />
                  <stop offset="1" stopColor="var(--observatory-edge)" />
                </linearGradient>
                <radialGradient id={`${observatoryId}-light`} cx="0.08" cy="0" r="1" gradientTransform="scale(1 0.85)" gradientUnits="objectBoundingBox">
                  <stop offset="0" stopColor="#657cb8" stopOpacity="0.16" />
                  <stop offset="0.7" stopColor="#657cb8" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`${observatoryId}-rim`} x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
                  <stop offset="0" stopColor="#b3c7ef" stopOpacity="0.34" />
                  <stop offset="0.65" stopColor="#b3c7ef" stopOpacity="0.23" />
                  <stop offset="1" stopColor="#b3c7ef" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path d={OBSERVATORY_PANEL_PATH} fill={`url(#${observatoryId}-material)`} />
              <path d={OBSERVATORY_PANEL_PATH} fill={`url(#${observatoryId}-light)`} />
              <path d={OBSERVATORY_PANEL_PATH} fill="none" stroke={`url(#${observatoryId}-rim)`} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="today-observatory-kicker">
              <AppIcon name="sparkles" className="h-3.5 w-3.5 shrink-0" />
              <span>Celestian LifeOS · Hoy</span>
            </div>
            <time className="today-observatory-clock" dateTime={`${localDateIso}T${formattedTime}`}>
              {formattedTime}
            </time>
            <time className="today-observatory-date" dateTime={localDateIso}>
              {formattedFullDate}
            </time>
            <div className="today-observatory-divider" aria-hidden="true" />
            <h1 className="today-observatory-greeting">
              {getLocalGreeting(now, state.profile?.name || state.settings?.userName || '')}
            </h1>
          </section>
        </div>
      </header>

      {attentionItems.length > 0 && (
        <section
          className="today-attention order-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] px-3.5 py-2.5 space-y-2.5"
          aria-labelledby="today-attention-title"
        >
          <h2 id="today-attention-title" className="sr-only">
            Atención ahora
          </h2>
          {attentionItems.map((item, idx) => {
            if (item.signalKind === 'backup_urgent') {
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 ${idx > 0 ? 'pt-2.5 border-t border-[var(--border)]/70' : ''}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <AppIcon name="shield" className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[13px] font-semibold text-[var(--text)]">
                      {item.title}
                    </strong>
                    <span className="block truncate text-[12px] sm:text-[13px] text-[var(--text-faint)]">
                      {item.detail}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onExportJSON}
                    className="rounded-lg px-2 py-1 text-[13px] font-bold text-[var(--blue)] hover:underline cursor-pointer"
                  >
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismissAttention(item)}
                    className="p-1 text-[var(--text-faint)] hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                    aria-label="Descartar aviso de backup"
                    title="Descartar aviso"
                  >
                    <AppIcon name="x" className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            if (item.signalKind === 'weekly_review_due') {
              return (
                <div
                  key={item.id}
                  className={idx > 0 ? 'pt-2.5 border-t border-[var(--border)]/70' : ''}
                >
                  <WeeklyReviewCard
                    state={state}
                    onUpdateState={onUpdateState}
                    onNavigate={onNavigate}
                    borderLess={true}
                  />
                </div>
              );
            }

            const iconName = (() => {
              switch (item.signalKind) {
                case 'financial_commitment_due':
                case 'financial_agreement_due':
                  return 'wallet';
                case 'task_overdue':
                  return 'clock';
                case 'exam_upcoming':
                  return 'book';
                case 'agenda_event_soon':
                case 'agenda_event_tomorrow':
                  return 'calendarDays';
                default:
                  return 'bell';
              }
            })();

            const badgeStyle = (() => {
              switch (item.urgency) {
                case 'critical':
                  return 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
                case 'urgent':
                  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
                case 'warning':
                  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
                default:
                  return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
              }
            })();

            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 ${idx > 0 ? 'pt-2.5 border-t border-[var(--border)]/70' : ''}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${badgeStyle}`}
                >
                  <AppIcon name={iconName} className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[13px] font-semibold text-[var(--text)]">
                    {item.title}
                  </strong>
                  <span className="block truncate text-[12px] sm:text-[13px] text-[var(--text-faint)]">
                    {item.detail}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAttentionAction(item)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] sm:text-[13px] font-bold text-[var(--blue)] hover:underline cursor-pointer"
                >
                  <span>{item.actionLabel}</span>
                  <AppIcon name="arrowRight" className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDismissAttention(item)}
                  className="p-1 text-[var(--text-faint)] hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                  aria-label={`Descartar aviso: ${item.title}`}
                  title="Descartar aviso"
                >
                  <AppIcon name="x" className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {dismissedAttentionItems.length > 0 && (
            <div className="flex items-center justify-end pt-1 border-t border-[var(--border)]/40 text-[11px]">
              <button
                type="button"
                onClick={() => setShowDismissedModal(true)}
                className="inline-flex items-center gap-1 text-[var(--text-faint)] hover:text-[var(--text)] transition underline cursor-pointer"
                aria-label={`Ver ${dismissedAttentionItems.length} aviso(s) descartado(s)`}
              >
                <span>{dismissedAttentionItems.length === 1 ? '1 aviso descartado' : `${dismissedAttentionItems.length} avisos descartados`}</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2. Quick Capture: Barra horizontal MUY compacta (100% ancho en escritorio, oculta en móvil) */}
      <div className="order-2 hidden sm:block">
        <BentoCommandBar
          state={state}
          onUpdateState={onUpdateState}
          onNavigate={onNavigate}
          onOpenSearch={onOpenSearch}
          onOpenCapture={onOpenCapture}
          onQuickAction={onQuickAction}
          compactBar
        />
      </div>

      {/* 3. Fila Principal: Agenda de hoy (izquierda) + Estado (derecha) */}
      <div className="order-4 grid grid-cols-1 items-start gap-3 sm:gap-4 xl:grid-cols-2">
        <TodayAgendaSection
          entries={agendaEntries}
          pastPendingTasks={pastPendingExtras}
          futureScheduledTasks={futureScheduledExtras}
          selectedExtra={selectedExtra}
          onToggle={handleToggleAgendaEntry}
          onToggleFocus={handleToggleFocus}
          onOpenAgenda={openAgendaDestination}
          onOpenEntry={(entry) => {
            if (entry.source === 'extra' && onNavigateToRecord) {
              onNavigateToRecord('agenda', { date: todayIso, focusId: `agenda-task-extra-${entry.id}-${todayIso}` });
            } else onNavigate(entry.navigationTarget || 'agenda');
          }}
          onToggleExtra={handleToggleExtraDirect}
          onRescheduleExtra={handleRescheduleExtra}
          onMoveAllPastToToday={handleMoveAllPastToToday}
          initialFocusId={initialFocusId}
          focusNonce={focusNonce}
          openLabel={agendaOpenLabel}
          completionMotion={completionMotion}
          todayIso={todayIso}
        />
        <PersonalContextCard
          state={state}
          onUpdateState={onUpdateState}
          onNavigate={onNavigate}
        />
      </div>

      {/* 4. Actividad reciente */}
      {recentActivity.length > 0 && (
        <section className="today-activity-surface order-5 rounded-2xl border border-[var(--border)] p-3.5 sm:px-5 sm:py-3 shadow-[var(--card-shadow)]" aria-labelledby="recent-activity-title">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="today-section-icon"><AppIcon name="activity" className="h-3.5 w-3.5" /></span>
                <h2 id="recent-activity-title" className="text-base font-bold text-[var(--text)]">Actividad reciente</h2>
              </div>
              {(activityEdges.left || activityEdges.right) && (
                <div className="hidden items-center gap-1 sm:flex" aria-label="Desplazar actividad reciente">
                  <button type="button" onClick={() => scrollActivity(-1)} disabled={!activityEdges.left} className="today-carousel-control" aria-label="Actividades anteriores"><AppIcon name="chevronLeft" className="h-4 w-4" /></button>
                  <button type="button" onClick={() => scrollActivity(1)} disabled={!activityEdges.right} className="today-carousel-control" aria-label="Actividades siguientes"><AppIcon name="chevronRight" className="h-4 w-4" /></button>
                </div>
              )}
            </div>

            <div
              ref={activityStripRef}
              className="today-activity-items flex gap-2 overflow-x-auto overscroll-x-contain"
              role="region"
              aria-label="Actividad reciente, desplazamiento horizontal"
              tabIndex={activityEdges.left || activityEdges.right ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  scrollActivity(event.key === 'ArrowLeft' ? -1 : 1);
                }
              }}
            >
              {recentActivity.map((activity) => (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => handleActivityNavigate(activity)}
                  aria-label={`${activity.module === 'note' ? 'Abrir nota' : `Abrir módulo ${activityModuleToView[activity.module] || 'Hoy'}`}: ${activity.title}. ${formatRelativeTime(activity.timestamp)}`}
                  className="today-activity-item group flex items-start gap-2.5 rounded-xl bg-[var(--card-subtle)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--blue)]">
                    <AppIcon name={activity.iconName} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-[11px] font-semibold text-[var(--text-soft)]">{activity.badgeText || activityModuleLabel[activity.module]}</span>
                      <time dateTime={activity.timestamp} className="text-[11px] text-[var(--text-soft)]">{formatActivityWhen(activity.timestamp)}</time>
                    </span>
                    <span className="block text-sm font-medium leading-snug text-[var(--text)] break-words group-hover:text-[var(--blue)]">{activity.title}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <DismissedAttentionModal
        open={showDismissedModal}
        onClose={() => setShowDismissedModal(false)}
        dismissedItems={dismissedAttentionItems}
        onRestoreItem={handleRestoreAttentionItem}
        onRestoreAll={handleRestoreAllDismissed}
      />
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => (
  <div className="mx-auto w-full space-y-4 sm:space-y-5 animate-pulse">
    <div className="h-[142px] rounded-3xl border border-[var(--border)] bg-[var(--hero-bg)]" />
    <div className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--card)] hidden sm:block" />
    <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
      <div className="h-[480px] rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
      <div className="h-[480px] rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
    </div>
    <div className="h-14 rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
  </div>
);
