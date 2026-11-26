import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Briefcase,
  CalendarDays,
  Check,
  Clock,
  Moon,
  Pin,
  PinOff,
  Plus,
  Shield,
  X,
} from 'lucide-react';
import type { AttentionDismissalRecord, LifeOSState, ViewType } from '../types';
import type { TodayItem } from '../lib/calculations';
import type { TodayAgendaEntry } from '../lib/todayOverview';
import { playSound } from '../lib/audio';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { AlpineDayCycleBackdrop } from './visual/AlpineDayCycleBackdrop';
import { getDayCyclePeriod, getLocalGreeting } from '../lib/alpineDayCycle';
import { dayKeyFromDate, fmtDate, todayISO, uid } from '../lib/storage';
import { getTodayAgendaEntries, getPastPendingExtras, getFutureScheduledExtras } from '../lib/todayOverview';
import { showToast } from '../lib/toast';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { TodayAgendaSection } from './TodayAgendaSection';
import {
  getTodayAttentionItems,
  getDismissedAttentionItems,
  getTomorrowDateString,
  nextAttentionDismissalTimestamp,
  type AttentionItem,
} from '../lib/todayAttention';
import { DismissedAttentionModal } from './DismissedAttentionModal';
import { DailyStatusModal } from './DailyStatusModal';
import { RecentActivityModal } from './RecentActivityModal';
import { TodaySpotlightCard } from './TodaySpotlightCard';
import { TodayRadarSection } from './TodayRadarSection';
import { SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';
import { getDashboardNotes, togglePinNote } from '../lib/notesFlows';
import {
  getSevenDayStatusSparkline,
  getTodayPulse,
  getTodayRadarMilestones,
  loadSkippedTodayKeys,
  partitionTodayAgenda,
  resolveTodaySpotlight,
  toggleSkippedTodayKey,
  type TodayRadarMilestone,
} from '../lib/todayControlCenter';
import { contextForDate } from '../lib/contextInsights';
import { startGymSession } from '../lib/gymFlows';
import { startStudySession } from '../lib/studyFlows';

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
  /** Optional clock override for deterministic testing. */
  nowOverride?: Date;
  /** Optional initial state for the daily status modal (for testing). */
  initialStatusModalOpen?: boolean;
  /** Optional initial state for the recent activity modal (for testing). */
  initialActivityModalOpen?: boolean;
  /** Optional initial skipped entry keys (for deterministic testing). */
  initialSkippedKeys?: string[];
}

export function hasMeaningfulWorkspaceActivity(state: LifeOSState): boolean {
  const finance = state.finance;
  const hasFinanceData =
    (finance?.transactions?.length || 0) > 0 ||
    (finance?.transfers?.length || 0) > 0 ||
    (finance?.reconciliations?.length || 0) > 0 ||
    (finance?.debts?.length || 0) > 0 ||
    (finance?.investments?.length || 0) > 0 ||
    (finance?.subscriptions?.length || 0) > 0 ||
    (finance?.expectedIncomes?.length || 0) > 0 ||
    (finance?.commitments?.length || 0) > 0 ||
    (finance?.agreements?.length || 0) > 0 ||
    Object.values(finance?.budgets || {}).some((amount) => Number(amount) > 0) ||
    (finance?.accounts || []).some(
      (account) =>
        Number(account.balance) !== 0 ||
        Number(account.initialBalance || 0) !== 0 ||
        Boolean(account.lastReconciledAt)
    );

  const hasGymData =
    (state.gym?.sessions?.length || 0) > 0 ||
    (state.gym?.weight?.length || 0) > 0 ||
    (state.gym?.measurements?.length || 0) > 0 ||
    (state.gym?.restDays?.length || 0) > 0;

  const hasNotesData =
    (state.projects?.length || 0) > 0 ||
    (state.inbox?.length || 0) > 0 ||
    (state.ideas?.length || 0) > 0 ||
    Object.values(state.notes || {}).some((items) => Array.isArray(items) && items.length > 0);

  const hasStudyData =
    (state.study?.subjects?.length || 0) > 0 ||
    (state.study?.exams?.length || 0) > 0 ||
    (state.study?.studyLog?.length || 0) > 0;

  const hasJobsData =
    (state.jobs?.applications?.length || 0) > 0 ||
    (state.jobs?.opportunities?.length || 0) > 0;

  const hasResaleData =
    (state.resale?.inventory?.length || 0) > 0 ||
    (state.resale?.opportunities?.length || 0) > 0;

  const hasPlanningData =
    (state.todayExtras?.length || 0) > 0 ||
    (state.calendarEvents?.length || 0) > 0 ||
    Object.values(state.agenda || {}).some((blocks) => Array.isArray(blocks) && blocks.length > 0);

  return (
    hasFinanceData ||
    hasGymData ||
    hasNotesData ||
    hasStudyData ||
    hasJobsData ||
    hasResaleData ||
    hasPlanningData
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
  onOpenCapture,
  onOpenQuickNote,
  onOpenNote,
  onNavigateToRecord,
  initialFocusId,
  focusNonce,
  nowOverride,
  initialStatusModalOpen = false,
  initialActivityModalOpen = false,
  initialSkippedKeys,
}) => {
  const todayIso = todayISO();
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [liveNow, setLiveNow] = useState(() => nowOverride ?? new Date());
  const [completionMotion, setCompletionMotion] = useState<{ taskId: string; nonce: number } | null>(null);
  const [showDismissedModal, setShowDismissedModal] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(initialStatusModalOpen);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(initialActivityModalOpen);
  const [skippedKeys, setSkippedKeys] = useState<string[]>(
    () => initialSkippedKeys ?? loadSkippedTodayKeys(todayIso)
  );

  const now = nowOverride ?? liveNow;
  const skippedKeySet = useMemo(() => new Set(skippedKeys), [skippedKeys]);

  // Reload skipped keys if calendar date rolls over
  useEffect(() => {
    if (initialSkippedKeys) return;
    setSkippedKeys(loadSkippedTodayKeys(todayIso));
  }, [todayIso, initialSkippedKeys]);

  useEffect(() => {
    if (nowOverride) return;
    let timer: number | undefined;
    const scheduleNextMinute = () => {
      const delay = 60_000 - (Date.now() % 60_000);
      timer = window.setTimeout(() => {
        setLiveNow(new Date());
        scheduleNextMinute();
      }, delay);
    };
    const refreshClock = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      setLiveNow(new Date());
      scheduleNextMinute();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshClock();
    };
    scheduleNextMinute();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refreshClock);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refreshClock);
    };
  }, [nowOverride]);

  useEffect(() => {
    if (!completionMotion) return;
    const timeout = window.setTimeout(() => setCompletionMotion(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [completionMotion]);

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

  // Daily status summary + inline 7-day sparkline
  const todayContext = useMemo(() => contextForDate(state, todayIso), [state, todayIso]);
  const hasAnyTodayStatus =
    todayContext.sleepHours != null || todayContext.energy != null || todayContext.mood != null;
  const compactStatusText = useMemo(() => {
    const sleepPart =
      todayContext.sleepHours != null ? `${todayContext.sleepHours.toLocaleString('es-UY')} h` : '—';
    const energyPart = todayContext.energy != null ? `${todayContext.energy}/5` : '—';
    const moodPart = todayContext.mood != null ? `${todayContext.mood}/5` : '—';
    return `${sleepPart} · ${energyPart} · ${moodPart}`;
  }, [todayContext]);
  const sparkline = useMemo(() => getSevenDayStatusSparkline(state, todayIso), [state, todayIso]);

  // Core agenda, spotlight, radar and daily record projections
  const agendaEntries = useMemo(() => getTodayAgendaEntries(state, todayIso), [state, todayIso]);
  const agendaPartition = useMemo(
    () => partitionTodayAgenda(state, agendaEntries, now, todayIso, skippedKeySet),
    [state, agendaEntries, now, todayIso, skippedKeySet]
  );
  const spotlight = useMemo(
    () => resolveTodaySpotlight(state, agendaEntries, now, todayIso, skippedKeySet),
    [state, agendaEntries, now, todayIso, skippedKeySet]
  );
  const radarMilestones = useMemo(
    () => getTodayRadarMilestones(state, todayIso),
    [state, todayIso]
  );
  const todayPulse = useMemo(
    () => getTodayPulse(state, agendaEntries, todayIso, now),
    [state, agendaEntries, todayIso, now]
  );

  const enabledRadarModules = useMemo(() => {
    const list: Array<{ view: ViewType; label: string }> = [];
    if (isModuleEnabled(state, 'estudios')) list.push({ view: 'estudios', label: 'Estudios' });
    if (isModuleEnabled(state, 'trabajo')) list.push({ view: 'trabajo', label: 'Trabajo' });
    if (isModuleEnabled(state, 'finanzas')) list.push({ view: 'finanzas', label: 'Finanzas' });
    return list;
  }, [state]);

  const notesEnabled = isModuleEnabled(state, 'notas');
  const pinnedNotes = useMemo(
    () => (notesEnabled ? getDashboardNotes(state.notes?.postits || [], { pinned: 3, recent: 0 }).pinned : []),
    [notesEnabled, state.notes?.postits]
  );

  const handleUnpinNote = (noteId: string) => {
    const saved = onUpdateState((draft) => {
      togglePinNote(draft, noteId);
    });
    if (!saved) return;
    showToast('Nota desfijada de Hoy.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        onUpdateState((draft) => {
          togglePinNote(draft, noteId);
        });
      },
    });
  };

  const pastPendingExtras = useMemo(() => getPastPendingExtras(state, todayIso), [state, todayIso]);
  const futureScheduledExtras = useMemo(() => getFutureScheduledExtras(state, todayIso), [state, todayIso]);

  const selectedExtra = useMemo(() => {
    if (!initialFocusId?.startsWith('today-extra-')) return undefined;
    const id = initialFocusId.slice('today-extra-'.length);
    if (
      agendaEntries.some((entry) => entry.source === 'extra' && entry.id === id) ||
      pastPendingExtras.some((task) => task.id === id) ||
      futureScheduledExtras.some((task) => task.id === id)
    ) {
      return undefined;
    }
    return state.todayExtras.find((task) => task.id === id);
  }, [initialFocusId, state.todayExtras, agendaEntries, pastPendingExtras, futureScheduledExtras]);

  const hasRealBackupActivity = useMemo(() => hasMeaningfulWorkspaceActivity(state), [state]);

  // At most 1 consolidated discreet administrative notice (excluding items already in Radar)
  const topAdminNotice = useMemo(() => {
    const filtered = getTodayAttentionItems(state, { todayIso, backupDismissed, now }).filter(
      (item) =>
        item.signalKind !== 'financial_commitment_due' &&
        item.signalKind !== 'financial_agreement_due' &&
        item.signalKind !== 'exam_upcoming' &&
        item.signalKind !== 'job_deadline_upcoming' &&
        !(item.signalKind === 'backup_urgent' && !hasRealBackupActivity)
    );
    return filtered[0] ?? null;
  }, [state, todayIso, backupDismissed, now, hasRealBackupActivity]);

  const dismissedAttentionItems = useMemo(
    () => getDismissedAttentionItems(state, { todayIso, backupDismissed, now }),
    [state, todayIso, backupDismissed, now]
  );

  const dayClosed = Boolean(state.checkoutLog?.[todayIso]?.closedAt);

  // Handlers
  const handleToggleSkipToday = (entry: TodayAgendaEntry) => {
    const wasSkipped = skippedKeySet.has(entry.key);
    const next = toggleSkippedTodayKey(todayIso, entry.key, skippedKeys);
    setSkippedKeys(next);
    showToast(wasSkipped ? 'Bloque restaurado para hoy.' : 'Bloque omitido por hoy.', 'info');
  };

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

  const handleOpenRadarMilestone = (item: TodayRadarMilestone) => {
    if (onNavigateToRecord) {
      onNavigateToRecord(item.targetView, {
        tab: item.targetTab,
        focusId: item.targetFocusId,
        date: item.date,
      });
    } else {
      onNavigate(item.targetView);
    }
  };

  const handleDismissRadarMilestone = (item: TodayRadarMilestone) => {
    const dismissKey = item.dismissKey;
    if (!dismissKey) return;
    if (
      onUpdateState((draft) => {
        if (!draft.settings) {
          draft.settings = {
            darkMode: false,
            hiddenTabs: [],
            onboardingCompleted: false,
            dismissedAttentionKeys: [],
            attentionDismissals: {},
          };
        }
        const prevRec = draft.settings.attentionDismissals?.[dismissKey];
        const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
        const nextDismissals = {
          ...(draft.settings.attentionDismissals || {}),
          [dismissKey]: { status: 'dismissed' as const, updatedAt: nextTimestamp },
        };
        draft.settings.attentionDismissals = nextDismissals;
        draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
          .filter(([, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
          .map(([k]) => k)
          .sort();
      }) === false
    ) {
      return;
    }
    showToast('Aviso silenciado en Hoy.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        onUpdateState((draft) => {
          if (!draft.settings) return;
          const prevRec = draft.settings.attentionDismissals?.[dismissKey];
          const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
          const nextDismissals = {
            ...(draft.settings.attentionDismissals || {}),
            [dismissKey]: { status: 'active' as const, updatedAt: nextTimestamp },
          };
          draft.settings.attentionDismissals = nextDismissals;
          draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
            .filter(([, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
            .map(([k]) => k)
            .sort();
        });
      },
    });
  };

  const handleDismissAttention = (item: AttentionItem) => {
    if (
      onUpdateState((draft) => {
        if (!draft.settings) {
          draft.settings = {
            darkMode: false,
            hiddenTabs: [],
            onboardingCompleted: false,
            dismissedAttentionKeys: [],
            attentionDismissals: {},
          };
        }
        const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
        const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
        const nextDismissals = {
          ...(draft.settings.attentionDismissals || {}),
          [item.dismissKey]: { status: 'dismissed' as const, updatedAt: nextTimestamp },
        };
        draft.settings.attentionDismissals = nextDismissals;
        draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
          .filter(([, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
          .map(([k]) => k)
          .sort();
      }) === false
    ) {
      return;
    }
    if (item.signalKind === 'backup_urgent') setBackupDismissed(true);
    showToast('Aviso ocultado de Hoy.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (item.signalKind === 'backup_urgent') setBackupDismissed(false);
        onUpdateState((draft) => {
          if (!draft.settings) return;
          const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
          const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
          const nextDismissals = {
            ...(draft.settings.attentionDismissals || {}),
            [item.dismissKey]: { status: 'active' as const, updatedAt: nextTimestamp },
          };
          draft.settings.attentionDismissals = nextDismissals;
          draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
            .filter(([, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
            .map(([k]) => k)
            .sort();
        });
      },
    });
  };

  const handleRestoreAttentionItem = (item: AttentionItem) => {
    if (
      onUpdateState((draft) => {
        if (!draft.settings) return;
        const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
        const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
        const nextDismissals = {
          ...(draft.settings.attentionDismissals || {}),
          [item.dismissKey]: { status: 'active' as const, updatedAt: nextTimestamp },
        };
        draft.settings.attentionDismissals = nextDismissals;
        draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
          .filter(([, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
          .map(([k]) => k)
          .sort();
      }) === false
    ) {
      return;
    }
    if (item.signalKind === 'backup_urgent') setBackupDismissed(false);
    showToast('Aviso restaurado.', 'success');
  };

  const handleRestoreAllDismissed = () => {
    const ts = Date.now();
    if (
      onUpdateState((draft) => {
        if (!draft.settings) return;
        const nextDismissals = { ...(draft.settings.attentionDismissals || {}) };
        for (const item of dismissedAttentionItems) {
          const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
          const nextTimestamp = nextAttentionDismissalTimestamp(prevRec, ts);
          nextDismissals[item.dismissKey] = { status: 'active' as const, updatedAt: nextTimestamp };
        }
        draft.settings.attentionDismissals = nextDismissals;
        draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
          .filter(([, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
          .map(([k]) => k)
          .sort();
      }) === false
    ) {
      return;
    }
    setBackupDismissed(false);
    showToast('Todos los avisos fueron restaurados.', 'success');
  };

  const handleStartGymFromSpotlight = (templateId?: string) => {
    const saved = onUpdateState((draft) => {
      startGymSession(draft.gym, {
        templateId,
        date: todayIso,
        startedAt: formattedTime,
        sessionId: uid(),
      });
    });
    if (!saved) return;
    playSound('click');
    showToast('Entrenamiento iniciado.', 'success');
    onNavigate('gimnasio');
  };

  const handleStartStudyFromSpotlight = (subjectId?: string | null, subjectName?: string | null) => {
    const saved = onUpdateState((draft) => {
      if (!draft.study) return;
      if (!draft.study.activeSession) {
        draft.study.activeSession = startStudySession(25, subjectId ?? null, subjectName ?? null);
      }
    });
    if (!saved) return;
    playSound('click');
    showToast('Bloque de estudio iniciado (25 min).', 'success');
    onNavigate('estudios');
  };

  const handleToggleItem = (item: TodayItem, entryKey?: string): boolean => {
    if (!item.done && item.isBlocked && item.blockingTaskNames?.length) {
      const blockers = item.blockingTaskNames.map((name) => `• ${name}`).join('\n');
      if (
        !window.confirm(
          `Esta tarea depende de requisitos aún no completados:\n\n${blockers}\n\n¿Deseas marcarla como completada de todos modos?`
        )
      ) {
        return false;
      }
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
      if (item.unblocksCount) {
        showToast(`Actividad completada. Desbloqueaste ${item.unblocksCount} tarea(s).`, 'success');
      }
    }
    return true;
  };

  const handleToggleAgendaEntry = (entry: TodayAgendaEntry) => {
    if (entry.source === 'priority' && entry.priorityId) {
      const nextCompleted = !entry.done;
      let applied = false;
      const saved = onUpdateState((draft) => {
        const target = (draft.dailyPriorities || []).find((priority) => priority.id === entry.priorityId);
        if (target) {
          target.done = nextCompleted;
          applied = true;
        }
      });
      if (saved && applied && nextCompleted) {
        playSound('success');
        setCompletionMotion((prev) => ({ taskId: entry.key, nonce: (prev?.nonce || 0) + 1 }));
      }
      return;
    }
    if (entry.todayItem) handleToggleItem(entry.todayItem, entry.key);
  };

  const handleMoveEntryToTomorrow = (entry: TodayAgendaEntry) => {
    const tomorrowIso = getTomorrowDateString(todayIso);
    if (entry.source === 'extra') {
      const saved = onUpdateState((draft) => {
        const extra = (draft.todayExtras || []).find((item) => item.id === entry.id);
        if (extra) extra.date = tomorrowIso;
      });
      if (saved) showToast('Movida para mañana.', 'info');
      return;
    }
    if (entry.source === 'priority' && entry.priorityId) {
      const saved = onUpdateState((draft) => {
        const priority = (draft.dailyPriorities || []).find((item) => item.id === entry.priorityId);
        if (priority) priority.date = tomorrowIso;
      });
      if (saved) showToast('Movida para mañana.', 'info');
    }
  };

  const handleRemoveEntryFromToday = (entry: TodayAgendaEntry) => {
    if (entry.source === 'extra') {
      const snapshot = state.todayExtras.find((item) => item.id === entry.id);
      const saved = onUpdateState((draft) => {
        draft.todayExtras = (draft.todayExtras || []).filter((item) => item.id !== entry.id);
      });
      if (saved && snapshot) {
        showToast('Quitada de hoy.', 'info', {
          actionLabel: 'Deshacer',
          onAction: () => {
            onUpdateState((draft) => {
              if (!draft.todayExtras.some((item) => item.id === snapshot.id)) {
                draft.todayExtras.push(snapshot);
              }
            });
          },
        });
      }
      return;
    }

    if (entry.source === 'priority' && entry.priorityId) {
      const snapshot = state.dailyPriorities.find((item) => item.id === entry.priorityId);
      const saved = onUpdateState((draft) => {
        draft.dailyPriorities = (draft.dailyPriorities || []).filter((item) => item.id !== entry.priorityId);
      });
      if (saved && snapshot) {
        showToast('Quitada de hoy.', 'info', {
          actionLabel: 'Deshacer',
          onAction: () => {
            onUpdateState((draft) => {
              if (!draft.dailyPriorities.some((item) => item.id === snapshot.id)) {
                draft.dailyPriorities.push(snapshot);
              }
            });
          },
        });
      }
      return;
    }

    if (entry.source === 'agenda') {
      const dayKey = dayKeyFromDate(new Date(`${todayIso}T12:00:00`));
      const snapshot = (state.agenda?.[dayKey] || []).find((item) => item.id === entry.id);
      const saved = onUpdateState((draft) => {
        if (!draft.agenda?.[dayKey]) return;
        draft.agenda[dayKey] = draft.agenda[dayKey].filter((item) => item.id !== entry.id);
      });
      if (saved && snapshot) {
        showToast('Bloque quitado de hoy.', 'info', {
          actionLabel: 'Deshacer',
          onAction: () => {
            onUpdateState((draft) => {
              if (!draft.agenda[dayKey]) draft.agenda[dayKey] = [];
              if (!draft.agenda[dayKey].some((item) => item.id === snapshot.id)) {
                draft.agenda[dayKey].push(snapshot);
              }
            });
          },
        });
      }
    }
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
      if (extra) extra.date = newDate;
    });
    if (saved) {
      showToast(
        newDate === todayIso ? 'Tarea programada para hoy.' : `Tarea reprogramada para el ${fmtDate(newDate)}.`,
        'info'
      );
    }
  };

  const isMovingAllPastRef = useRef(false);
  const handleMoveAllPastToToday = () => {
    if (isMovingAllPastRef.current || !pastPendingExtras.length) return;
    const count = pastPendingExtras.length;
    let confirmed = false;
    try {
      confirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
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

  const openAgendaDestination = () => {
    if (isModuleEnabled(state, 'agenda')) onNavigate('agenda');
    else if (isModuleEnabled(state, 'calendario')) onNavigate('calendario');
  };
  const agendaOpenLabel = isModuleEnabled(state, 'agenda')
    ? 'Abrir Agenda'
    : isModuleEnabled(state, 'calendario')
      ? 'Abrir Calendario'
      : null;

  const renderAdminNoticeIcon = (kind: AttentionItem['signalKind']) => {
    const cls = 'h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500';
    if (kind === 'backup_urgent') return <Shield className={cls} strokeWidth={1.75} aria-hidden="true" />;
    if (kind === 'task_overdue') return <Clock className={cls} strokeWidth={1.75} aria-hidden="true" />;
    if (kind === 'job_deadline_upcoming') {
      return <Briefcase className="h-4 w-4 shrink-0 text-[#4F46E5] dark:text-[#818CF8]" strokeWidth={1.75} aria-hidden="true" />;
    }
    if (kind === 'agenda_event_soon' || kind === 'agenda_event_tomorrow') {
      return <CalendarDays className={cls} strokeWidth={1.75} aria-hidden="true" />;
    }
    return <Bell className={cls} strokeWidth={1.75} aria-hidden="true" />;
  };

  const dayProgress = Math.max(0, Math.min(1, (now.getHours() * 60 + now.getMinutes()) / 1440));
  const dayProgressPct = Math.round(dayProgress * 100);

  return (
    <div className="today-shell relative mx-auto flex w-full flex-col gap-5 sm:gap-6">
      {/* 1. Hero generativo Horizonte y Lago */}
      <header
        data-hero-period={dayPeriod}
        className="today-hero relative isolate min-h-[195px] sm:h-[230px] overflow-hidden rounded-2xl border border-slate-900/10 bg-[var(--hero-bg)] dark:border-white/[0.09] select-none"
      >
        <AlpineDayCycleBackdrop forcePeriod={dayPeriod} compact />

        <div className="relative z-10 flex h-full min-h-[195px] sm:min-h-0 flex-col justify-between px-5 py-4 sm:px-8 sm:py-6">
          {/* Top-right: acción discreta de cierre del día (oculta si ya está visible el banner de cierre) */}
          <div className="flex min-h-8 items-center justify-end">
            {!dayClosed ? (
              spotlight.mode !== 'closing' && (
                <button
                  type="button"
                  onClick={() => onNavigate('checkout')}
                  aria-label="Cerrar el día"
                  className="inline-flex min-h-10 sm:min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-slate-950/35 px-3.5 py-1.5 sm:px-3 sm:py-1 text-xs font-medium text-white backdrop-blur-md transition hover:bg-slate-950/55 cursor-pointer"
                >
                  <Moon className="h-3.5 w-3.5 text-white/80" strokeWidth={1.75} aria-hidden="true" />
                  <span>Cerrar el día</span>
                </button>
              )
            ) : (
              <span className="inline-flex min-h-10 sm:min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/35 px-3.5 py-1.5 sm:px-3 sm:py-1 text-xs font-medium text-white/90 backdrop-blur-md">
                <Check className="h-3.5 w-3.5 text-white/80" strokeWidth={1.75} aria-hidden="true" />
                <span>Día cerrado</span>
              </span>
            )}
          </div>

          {/* Bottom row: saludo + fecha + estado a la izquierda | reloj protagonista + barra 24h a la derecha */}
          <div className="mt-4 flex flex-col gap-3 sm:mt-0 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            {/* Abajo a la izquierda */}
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-[26px] sm:text-[34px] font-semibold tracking-[-0.025em] text-white leading-[1.08] hero-text-shadow">
                {getLocalGreeting(now, state.profile?.name || '')}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <time dateTime={localDateIso} className="text-sm sm:text-[15px] font-normal text-white/80 hero-text-shadow">
                  {formattedFullDate}
                </time>

                {!hasAnyTodayStatus ? (
                  <button
                    type="button"
                    onClick={() => setIsStatusModalOpen(true)}
                    aria-label="Registrar estado de hoy y ver evolución de 7 días"
                    className="inline-flex min-h-9 sm:min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-slate-950/35 px-3 py-1 text-xs font-medium text-white/95 backdrop-blur-md transition hover:bg-slate-950/55 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 text-white/80" strokeWidth={1.75} aria-hidden="true" />
                    <span>Registrar estado de hoy</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsStatusModalOpen(true)}
                    aria-label={`Estado de hoy: ${compactStatusText}. Abrir editor y evolución de 7 días`}
                    className="inline-flex min-h-10 sm:min-h-8 items-center gap-2.5 rounded-full border border-white/20 bg-slate-950/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-md transition hover:bg-slate-950/55 cursor-pointer"
                  >
                    <span className="tabular-nums tracking-[-0.01em] text-white/95">
                      {compactStatusText}
                    </span>
                    {sparkline.hasAnySeries && (
                      <svg
                        width="56"
                        height="20"
                        viewBox="0 0 56 20"
                        fill="none"
                        aria-hidden="true"
                        data-status-sparkline="true"
                        className="shrink-0 overflow-visible"
                      >
                        {sparkline.sleepPath && (
                          <path
                            d={sparkline.sleepPath}
                            stroke="rgba(196,181,253,0.95)"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {sparkline.energyPath && (
                          <path
                            d={sparkline.energyPath}
                            stroke="rgba(165,180,252,0.95)"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {sparkline.moodPath && (
                          <path
                            d={sparkline.moodPath}
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Abajo a la derecha: reloj protagonista tabular + barra de progreso 24h */}
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:gap-0">
              <time
                dateTime={`${localDateIso}T${formattedTime}`}
                className="text-[34px] sm:text-[48px] font-light tracking-[-0.035em] text-white leading-none tabular-nums hero-text-shadow"
              >
                {formattedTime}
              </time>
              <div
                className="sm:mt-2.5 w-24 sm:w-28 h-[3px] rounded-full bg-white/20 overflow-hidden"
                role="progressbar"
                aria-label="Progreso del día"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dayProgressPct}
              >
                <div
                  className="h-full rounded-full bg-white/85 transition-[width] duration-700 ease-out"
                  style={{ width: `${(dayProgress * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Tarjeta protagonista: solo cuando hay bloque activo, próximo o cierre (cero duplicación en estado vacío) */}
      {spotlight.mode !== 'free' && (
        <TodaySpotlightCard
          spotlight={spotlight}
          onStartGym={handleStartGymFromSpotlight}
          onStartStudy={handleStartStudyFromSpotlight}
          onToggleEntry={handleToggleAgendaEntry}
          onOpenCheckout={() => onNavigate('checkout')}
          onNavigate={onNavigate}
          canPlanTomorrow={isModuleEnabled(state, 'agenda') || isModuleEnabled(state, 'calendario')}
          planTomorrowView={isModuleEnabled(state, 'agenda') ? 'agenda' : 'calendario'}
        />
      )}

      {/* 3. Máximo 1 tira administrativa discreta de una sola línea */}
      {topAdminNotice && (
        <SurfaceCard
          as="section"
          aria-labelledby="today-attention-title"
          className="px-4 py-2.5"
        >
          <h2 id="today-attention-title" className="sr-only">
            Atención ahora
          </h2>

          {topAdminNotice.signalKind === 'weekly_review_due' ? (
            <WeeklyReviewCard
              state={state}
              onUpdateState={onUpdateState}
              onNavigate={onNavigate}
              borderLess={true}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {renderAdminNoticeIcon(topAdminNotice.signalKind)}
                <p className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
                  <strong className="font-semibold text-slate-900 dark:text-slate-100">
                    {topAdminNotice.title}:
                  </strong>{' '}
                  <span>{topAdminNotice.detail}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {topAdminNotice.signalKind === 'backup_urgent' ? (
                  <button
                    type="button"
                    onClick={onExportJSON}
                    className="inline-flex min-h-10 sm:min-h-8 items-center whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
                  >
                    Descargar copia
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAttentionAction(topAdminNotice)}
                    className="inline-flex min-h-10 sm:min-h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
                  >
                    <span>{topAdminNotice.actionLabel}</span>
                    <ArrowRight className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDismissAttention(topAdminNotice)}
                  className="flex h-10 w-10 sm:h-7 sm:w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer"
                  aria-label={`Descartar aviso: ${topAdminNotice.title}`}
                  title="Descartar aviso"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </SurfaceCard>
      )}

      {/* 4. Grilla principal de 2 columnas con flujo natural (sin huecos estirados) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] lg:gap-6">
        <TodayAgendaSection
          entries={agendaEntries}
          timedBlocks={agendaPartition.timedBlocks}
          untimedTasks={agendaPartition.untimedTasks}
          microHabits={agendaPartition.microHabits}
          pastPendingTasks={pastPendingExtras}
          futureScheduledTasks={futureScheduledExtras}
          selectedExtra={selectedExtra}
          onToggle={handleToggleAgendaEntry}
          onOpenAgenda={openAgendaDestination}
          onOpenCapture={onOpenCapture}
          onOpenEntry={(entry) => {
            if (entry.source === 'extra' && onNavigateToRecord) {
              onNavigateToRecord('agenda', { date: todayIso, focusId: `agenda-task-extra-${entry.id}-${todayIso}` });
            } else if (entry.source === 'trabajo' && onNavigateToRecord) {
              const appId = entry.calendarItem?.jobApplicationId || entry.todayItem?.id || entry.id;
              onNavigateToRecord('trabajo', { focusId: `job-app-${appId}` });
            } else {
              onNavigate(entry.navigationTarget || 'agenda');
            }
          }}
          onToggleSkipToday={handleToggleSkipToday}
          onMoveToTomorrow={handleMoveEntryToTomorrow}
          onRemoveFromToday={handleRemoveEntryFromToday}
          onToggleExtra={handleToggleExtraDirect}
          onRescheduleExtra={handleRescheduleExtra}
          onMoveAllPastToToday={handleMoveAllPastToToday}
          initialFocusId={initialFocusId}
          focusNonce={focusNonce}
          openLabel={agendaOpenLabel}
          completionMotion={completionMotion}
          todayIso={todayIso}
        />

        <TodayRadarSection
          milestones={radarMilestones}
          pulse={todayPulse}
          enabledRadarModules={enabledRadarModules}
          notesEnabled={notesEnabled}
          onOpenMilestone={handleOpenRadarMilestone}
          onDismissMilestone={handleDismissRadarMilestone}
          dismissedCount={dismissedAttentionItems.length}
          onOpenDismissed={() => setShowDismissedModal(true)}
          onNavigate={onNavigate}
          onOpenActivity={() => setIsActivityModalOpen(true)}
        />
      </div>

      {/* 5. Notas fijadas: ancho completo debajo de las 2 columnas (solo si hay fijadas y Notas habilitado) */}
      {notesEnabled && pinnedNotes.length > 0 && (
        <SurfaceCard
          as="section"
          aria-labelledby="today-pinned-notes-title"
          className="p-5 sm:p-6"
        >
          <SectionHeader
            id="today-pinned-notes-title"
            icon={<Pin className="h-4 w-4" strokeWidth={1.75} />}
            title="Fijadas"
            count={pinnedNotes.length}
            action={
              <div className="flex items-center gap-4">
                {onOpenQuickNote && (
                  <button
                    type="button"
                    onClick={onOpenQuickNote}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-indigo-600 transition hover:underline dark:text-indigo-400 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>Nota rápida</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('notas')}
                  className="whitespace-nowrap text-xs font-medium text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 cursor-pointer"
                >
                  Abrir Notas
                </button>
              </div>
            }
          />

          <div
            className={`mt-4 grid gap-3 ${
              pinnedNotes.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {pinnedNotes.map((note) => {
              const title = note.title?.trim() || note.text.trim().split('\n')[0] || 'Nota sin título';
              const excerpt = note.title?.trim() ? note.text.trim() : note.text.trim().split('\n').slice(1).join(' ').trim();
              const isPrivate = Boolean(state.settings?.privacyMode);

              return (
                <div
                  key={note.id}
                  className="group flex items-start justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/40 p-3.5 transition hover:border-indigo-300/70 hover:bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-indigo-500/35 dark:hover:bg-white/[0.04]"
                >
                  <button
                    type="button"
                    onClick={() => (onOpenNote ? onOpenNote(note.id) : onNavigate('notas'))}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                      {isPrivate ? 'Nota fijada' : title}
                    </p>
                    {!isPrivate && excerpt && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {excerpt}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnpinNote(note.id)}
                    aria-label={`Desfijar nota ${isPrivate ? '' : title}`.trim()}
                    title="Desfijar de Hoy"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-200 cursor-pointer"
                  >
                    <PinOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      )}

      {/* Modal bajo demanda: Estado diario + Evolución 7 días */}
      <DailyStatusModal
        open={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        state={state}
        onUpdateState={onUpdateState}
        onNavigate={onNavigate}
      />

      {/* Modal bajo demanda: Actividad reciente */}
      <RecentActivityModal
        open={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        state={state}
        onNavigate={onNavigate}
        onOpenNote={onOpenNote}
      />

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
  <div role="status" aria-busy="true" aria-label="Cargando vista" className="mx-auto w-full space-y-5 animate-pulse">
    <div className="h-[144px] rounded-2xl bg-[var(--hero-bg)]" />
    <div className="h-[108px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] lg:gap-6">
      <div className="h-[340px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
      <div className="space-y-5">
        <div className="h-[180px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
        <div className="h-[180px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
      </div>
    </div>
  </div>
);
