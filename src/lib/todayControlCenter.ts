import type { LifeOSState, ViewType } from '../types';
import type { TodayAgendaEntry } from './todayOverview';
import { daysBetween, dayKeyFromDate, fmtDate, formatMoney, todayISO } from './storage';
import { todayGymStatus } from './calculations';
import { getActiveGymSession } from './gymFlows';
import { isModuleEnabled } from './moduleVisibility';
import { formatStudyDuration } from './studyFlows';
import { deriveAgreementSchedule } from './financeAgreements';
import { confirmedFinancialCurrency } from './financeCurrencyPolicy';
import { isJobApplicationActive, JOB_KEY_DATE_LABELS, normalizeJobKeyDates } from './jobApplications';
import { contextForDate } from './contextInsights';
import { GYM_ICON_REGISTRY, type GymIconName } from './gymIconRegistry';

export type TodayBlockDomain = 'gym' | 'study' | 'general';
export type TodayBlockTemporalStatus = 'past' | 'current' | 'upcoming' | 'untimed';

export interface TodayGymFusionInfo {
  templateId?: string;
  templateName?: string;
  routineIcon?: GymIconName;
  exerciseCount: number;
  status: 'pending_today' | 'trained_today' | 'rest_today';
  hasActiveSession: boolean;
}

export interface TodayStudyInfo {
  hasActiveSession: boolean;
  activeSessionStatus?: 'running' | 'paused' | 'completed_pending_review';
  activeSubjectName?: string | null;
  remainingMinutes?: number;
  todayMinutes: number;
  matchedSubjectId?: string | null;
  matchedSubjectName?: string | null;
}

export interface TodayControlBlock {
  entry: TodayAgendaEntry;
  domain: TodayBlockDomain;
  temporalStatus: TodayBlockTemporalStatus;
  startMinutes: number | null;
  endMinutes: number | null;
  minutesUntil?: number | null;
  skipped?: boolean;
  gymFusion?: TodayGymFusionInfo | null;
}

export interface TodayAgendaPartition {
  timedBlocks: TodayControlBlock[];
  untimedTasks: TodayControlBlock[];
  microHabits: TodayAgendaEntry[];
  gymFused: boolean;
}

export type TodaySpotlightMode = 'current' | 'next' | 'closing' | 'day_closed' | 'free';

export interface TodaySpotlight {
  mode: TodaySpotlightMode;
  domain: TodayBlockDomain | 'closing';
  kicker: string;
  title: string;
  subtitle: string;
  timeLabel?: string | null;
  countdownLabel?: string | null;
  minutesUntil?: number | null;
  isCalmUpcoming?: boolean;
  block?: TodayControlBlock | null;
  gymInfo?: TodayGymFusionInfo | null;
  studyInfo?: TodayStudyInfo | null;
}

export interface TodayRadarMilestone {
  id: string;
  module: 'estudios' | 'trabajo' | 'finanzas' | 'proyectos';
  moduleLabel: string;
  title: string;
  detail: string;
  amountTooltip?: string;
  date: string;
  daysUntil: number;
  countdownLabel: string;
  urgency: 'overdue' | 'today' | 'soon' | 'upcoming';
  targetView: ViewType;
  targetTab?: string;
  targetFocusId?: string;
}

export interface TodayPulseSummary {
  studyEnabled: boolean;
  studyMinutesToday: number;
  studyFormatted: string;
  studySessionActive: boolean;
  gymEnabled: boolean;
  gymStatus: 'pending_today' | 'trained_today' | 'rest_today' | 'active_session' | 'unscheduled';
  gymLabel: string;
  gymRoutineName?: string;
  blocksCompleted: number;
  blocksTotal: number;
  habitsCompleted: number;
  habitsTotal: number;
  completionPct: number;
}

const GYM_KEYWORDS = /\b(gimnasio|gym|entrenamiento|entrenar|pesas|cardio|musculaci[oó]n|full\s*body|push|pull|legs|piernas|torso|espalda|pecho)\b/i;
const STUDY_KEYWORDS = /\b(estudi\w*|repas\w*|examen\w*|parcial\w*|facultad|materia\w*|pomodoro|apuntes|lectura|clase\w*|curso\w*|pr[aá]ctica\w*|tp|tesis)\b/i;

export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatMinutesUntil(minutes: number): string {
  if (minutes <= 0) return 'Ahora';
  if (minutes === 1) return 'En 1 min';
  if (minutes < 60) return `En ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `En ${hours} h`;
  return `En ${hours} h ${rem} min`;
}

export function classifyEntryDomain(entry: TodayAgendaEntry, state?: LifeOSState): TodayBlockDomain {
  if (entry.source === 'gym') return 'gym';
  if (entry.calendarItem?.type === 'examen') return 'study';

  if (entry.source === 'extra' && state?.todayExtras) {
    const extra = state.todayExtras.find((item) => item.id === entry.id);
    if (extra?.linkedType === 'gym') return 'gym';
    if (extra?.linkedType === 'study') return 'study';
  }

  const label = entry.label || '';
  if (GYM_KEYWORDS.test(label)) return 'gym';
  if (STUDY_KEYWORDS.test(label)) return 'study';

  // Check if label matches an existing study subject name
  if (state?.study?.subjects?.length) {
    const lowerLabel = label.toLocaleLowerCase('es');
    const matchedSubject = state.study.subjects.find(
      (s) => s.name.trim().length >= 3 && lowerLabel.includes(s.name.trim().toLocaleLowerCase('es'))
    );
    if (matchedSubject) return 'study';
  }

  // Check if label matches a scheduled gym template name
  if (state?.gym?.routineTemplates?.length) {
    const lowerLabel = label.toLocaleLowerCase('es');
    const matchedTemplate = state.gym.routineTemplates.find(
      (t) => t.name.trim().length >= 3 && lowerLabel.includes(t.name.trim().toLocaleLowerCase('es'))
    );
    if (matchedTemplate) return 'gym';
  }

  return 'general';
}

function getGymFusionInfo(state: LifeOSState, todayIso: string): TodayGymFusionInfo | null {
  if (!isModuleEnabled(state, 'gimnasio')) return null;
  const dayKey = dayKeyFromDate(new Date(`${todayIso}T12:00:00`));
  const scheduledTemplate = (state.gym?.routineTemplates || []).find((t) => t.days?.includes(dayKey));
  const activeSession = getActiveGymSession(state.gym);
  const gymStatus = todayGymStatus(state, todayIso);

  if (!scheduledTemplate && !activeSession && gymStatus.status !== 'trained_today') {
    return null;
  }

  const rawIcon = scheduledTemplate?.appearance?.icon;
  const routineIcon: GymIconName =
    rawIcon && Object.hasOwn(GYM_ICON_REGISTRY, rawIcon)
      ? (rawIcon as GymIconName)
      : 'gym-dumbbell';

  return {
    templateId: scheduledTemplate?.id,
    templateName: scheduledTemplate?.name || activeSession?.weekLabel || 'Entrenamiento',
    routineIcon,
    exerciseCount: scheduledTemplate?.exercises?.length ?? activeSession?.exercises?.length ?? 0,
    status: gymStatus.status,
    hasActiveSession: Boolean(activeSession),
  };
}

function getStudyInfo(state: LifeOSState, todayIso: string, labelHint?: string): TodayStudyInfo {
  const todayMinutes = (state.study?.studyLog || [])
    .filter((log) => log.date === todayIso)
    .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);

  const activeSession = state.study?.activeSession;
  const hasActiveSession = Boolean(
    activeSession && (activeSession.status === 'running' || activeSession.status === 'paused')
  );

  let remainingMinutes: number | undefined;
  if (activeSession && hasActiveSession) {
    const seconds =
      activeSession.status === 'running' && activeSession.endsAt
        ? Math.max(0, Math.ceil((activeSession.endsAt - Date.now()) / 1000))
        : activeSession.remainingSeconds;
    remainingMinutes = Math.max(1, Math.ceil(seconds / 60));
  }

  let matchedSubjectId: string | null = null;
  let matchedSubjectName: string | null = null;
  if (labelHint && state.study?.subjects?.length) {
    const lower = labelHint.toLocaleLowerCase('es');
    const found = state.study.subjects.find(
      (s) => s.name.trim().length >= 3 && lower.includes(s.name.trim().toLocaleLowerCase('es'))
    );
    if (found) {
      matchedSubjectId = found.id;
      matchedSubjectName = found.name;
    }
  }

  return {
    hasActiveSession,
    activeSessionStatus: activeSession?.status,
    activeSubjectName: activeSession?.targetSubjectName || null,
    remainingMinutes,
    todayMinutes,
    matchedSubjectId,
    matchedSubjectName,
  };
}

function isMicroHabitEntry(entry: TodayAgendaEntry): boolean {
  // Untimed recurring routines are daily micro-habits (e.g. water, tidy up, make bed, meditate)
  return entry.source === 'rutina' && !entry.time;
}

/**
 * Separates today's agenda entries into:
 * 1. timedBlocks (with temporal status relative to `now` and gym fusion)
 * 2. untimedTasks (real tasks/events without a fixed hour, with gym anti-duplication)
 * 3. microHabits (compact interactive chips for untimed daily routines)
 */
export function partitionTodayAgenda(
  state: LifeOSState,
  entries: TodayAgendaEntry[],
  now: Date = new Date(),
  todayIso: string = todayISO(),
  skippedKeys?: ReadonlySet<string>
): TodayAgendaPartition {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const gymInfo = getGymFusionInfo(state, todayIso);
  const studyEnabled = isModuleEnabled(state, 'estudios');

  const microHabits: TodayAgendaEntry[] = [];
  const rawTimed: TodayAgendaEntry[] = [];
  const rawUntimed: TodayAgendaEntry[] = [];

  for (const entry of entries) {
    if (isMicroHabitEntry(entry)) {
      if (!studyEnabled && entry.label.trim().toLocaleLowerCase('es-UY') === 'repasar apuntes') {
        continue;
      }
      microHabits.push(entry);
    } else if (entry.time && parseTimeToMinutes(entry.time) !== null) {
      rawTimed.push(entry);
    } else {
      rawUntimed.push(entry);
    }
  }

  // Sort timed chronologically
  rawTimed.sort((a, b) => {
    const ma = parseTimeToMinutes(a.time) ?? 0;
    const mb = parseTimeToMinutes(b.time) ?? 0;
    if (ma !== mb) return ma - mb;
    return a.label.localeCompare(b.label, 'es') || a.key.localeCompare(b.key);
  });

  // Check if a timed block already represents Gym so we can fuse the day's routine
  // and avoid duplicating it as a separate untimed row.
  let gymFused = false;
  const durationByExtraId = new Map<string, number>();
  for (const extra of state.todayExtras || []) {
    if (extra.durationMinutes && extra.durationMinutes > 0) {
      durationByExtraId.set(extra.id, extra.durationMinutes);
    }
  }

  const timedBlocks: TodayControlBlock[] = rawTimed.map((entry, idx) => {
    const startMinutes = parseTimeToMinutes(entry.time) ?? 0;
    const explicitDuration = entry.source === 'extra' ? durationByExtraId.get(entry.id) : undefined;
    const defaultDuration = explicitDuration || 60;

    let endMinutes = startMinutes + defaultDuration;
    const nextEntry = rawTimed[idx + 1];
    if (nextEntry) {
      const nextStart = parseTimeToMinutes(nextEntry.time);
      if (nextStart !== null && nextStart > startMinutes && nextStart < endMinutes) {
        endMinutes = nextStart;
      }
    }

    let temporalStatus: TodayBlockTemporalStatus;
    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      temporalStatus = 'current';
    } else if (nowMinutes >= endMinutes) {
      temporalStatus = 'past';
    } else {
      temporalStatus = 'upcoming';
    }

    const domain = classifyEntryDomain(entry, state);
    let gymFusion: TodayGymFusionInfo | null = null;
    if (domain === 'gym' && gymInfo && !gymFused) {
      gymFusion = gymInfo;
      gymFused = true;
    }

    return {
      entry,
      domain,
      temporalStatus,
      startMinutes,
      endMinutes,
      minutesUntil: temporalStatus === 'upcoming' ? Math.max(0, startMinutes - nowMinutes) : null,
      skipped: Boolean(skippedKeys?.has(entry.key)),
      gymFusion,
    };
  });

  // Anti-duplicate filter: if gym routine was fused into a timed Gym block,
  // omit the standalone untimed `source === 'gym'` entry.
  const untimedTasks: TodayControlBlock[] = rawUntimed
    .filter((entry) => !(gymFused && entry.source === 'gym'))
    .map((entry) => {
      const domain = classifyEntryDomain(entry, state);
      return {
        entry,
        domain,
        temporalStatus: 'untimed' as const,
        startMinutes: null,
        endMinutes: null,
        skipped: Boolean(skippedKeys?.has(entry.key)),
        gymFusion: domain === 'gym' ? gymInfo : null,
      };
    });

  return {
    timedBlocks,
    untimedTasks,
    microHabits,
    gymFused,
  };
}

/**
 * Selects the hero "En curso / Siguiente" operational card reactively based on `now`.
 */
export function resolveTodaySpotlight(
  state: LifeOSState,
  entries: TodayAgendaEntry[],
  now: Date = new Date(),
  todayIso: string = todayISO(),
  skippedKeys?: ReadonlySet<string>
): TodaySpotlight {
  const partition = partitionTodayAgenda(state, entries, now, todayIso, skippedKeys);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dayClosed = Boolean(state.checkoutLog?.[todayIso]?.closedAt);
  const gymInfo = getGymFusionInfo(state, todayIso);
  const isGymEnabled = isModuleEnabled(state, 'gimnasio');
  const isStudyEnabled = isModuleEnabled(state, 'estudios');
  const activeStudy = isStudyEnabled ? state.study?.activeSession : null;
  const hasRunningStudy = Boolean(activeStudy && (activeStudy.status === 'running' || activeStudy.status === 'paused'));

  // 1. Current pending timed block (ignoring skipped blocks)
  const currentPendingBlock = partition.timedBlocks.find(
    (b) => b.temporalStatus === 'current' && !b.entry.done && !b.skipped
  );
  if (currentPendingBlock) {
    const domain = currentPendingBlock.domain;
    const studyInfo = domain === 'study' ? getStudyInfo(state, todayIso, currentPendingBlock.entry.label) : null;
    const fusedGym = domain === 'gym' ? currentPendingBlock.gymFusion || gymInfo : null;

    let subtitle = `${currentPendingBlock.entry.sourceLabel} · Bloque en curso`;
    if (domain === 'gym' && fusedGym?.templateName) {
      subtitle = fusedGym.hasActiveSession
        ? `Sesión activa · ${fusedGym.templateName}`
        : fusedGym.status === 'trained_today'
          ? `Rutina completada hoy · ${fusedGym.templateName}`
          : `Rutina asignada: ${fusedGym.templateName}${fusedGym.exerciseCount > 0 ? ` (${fusedGym.exerciseCount} ejercicios)` : ''}`;
    } else if (domain === 'study' && studyInfo) {
      subtitle = studyInfo.hasActiveSession
        ? `Temporizador ${studyInfo.activeSessionStatus === 'paused' ? 'en pausa' : 'en marcha'}${studyInfo.activeSubjectName ? ` · ${studyInfo.activeSubjectName}` : ''}`
        : studyInfo.todayMinutes > 0
          ? `Llevás ${formatStudyDuration(studyInfo.todayMinutes)} estudiados hoy`
          : 'Listo para iniciar bloque de enfoque';
    }

    return {
      mode: 'current',
      domain,
      kicker: 'En curso ahora',
      title:
        domain === 'gym' && fusedGym?.templateName && currentPendingBlock.entry.label.toLocaleLowerCase('es') !== fusedGym.templateName.toLocaleLowerCase('es')
          ? `${currentPendingBlock.entry.label} · ${fusedGym.templateName}`
          : currentPendingBlock.entry.label,
      subtitle,
      timeLabel: currentPendingBlock.entry.time,
      countdownLabel: 'Ahora',
      block: currentPendingBlock,
      gymInfo: fusedGym,
      studyInfo,
    };
  }

  // 2. Active Gym session in progress (even outside a timed block)
  if (isGymEnabled && gymInfo?.hasActiveSession) {
    return {
      mode: 'current',
      domain: 'gym',
      kicker: 'Sesión activa',
      title: gymInfo.templateName || 'Entrenamiento en curso',
      subtitle: 'Tenés una sesión de gimnasio abierta en este momento.',
      countdownLabel: 'En marcha',
      gymInfo,
    };
  }

  // 3. Active Study session in progress
  if (hasRunningStudy && activeStudy) {
    const studyInfo = getStudyInfo(state, todayIso);
    return {
      mode: 'current',
      domain: 'study',
      kicker: activeStudy.status === 'paused' ? 'Estudio en pausa' : 'Estudio en curso',
      title: activeStudy.targetSubjectName || 'Bloque de estudio',
      subtitle: studyInfo.remainingMinutes
        ? `Quedan ~${studyInfo.remainingMinutes} min en tu temporizador activo.`
        : 'Sesión de enfoque en marcha.',
      countdownLabel: activeStudy.status === 'paused' ? 'Pausado' : 'En marcha',
      studyInfo,
    };
  }

  // 4. Next upcoming timed block
  const nextTimedBlock = partition.timedBlocks.find(
    (b) => b.temporalStatus === 'upcoming' && !b.entry.done && !b.skipped
  );
  if (nextTimedBlock && nextTimedBlock.startMinutes !== null) {
    const minutesUntil = Math.max(0, nextTimedBlock.startMinutes - nowMinutes);
    const domain = nextTimedBlock.domain;
    const fusedGym = domain === 'gym' ? nextTimedBlock.gymFusion || gymInfo : null;
    const studyInfo = domain === 'study' ? getStudyInfo(state, todayIso, nextTimedBlock.entry.label) : null;

    let subtitle = `Próximo bloque · ${nextTimedBlock.entry.sourceLabel}`;
    if (domain === 'gym' && fusedGym?.templateName) {
      subtitle = `Rutina de hoy: ${fusedGym.templateName}${fusedGym.exerciseCount > 0 ? ` · ${fusedGym.exerciseCount} ejercicios` : ''}`;
    } else if (domain === 'study' && studyInfo) {
      subtitle =
        studyInfo.todayMinutes > 0
          ? `Hoy acumulás ${formatStudyDuration(studyInfo.todayMinutes)} de estudio`
          : 'Prepará tu próximo bloque de estudio';
    }

    const isCalmUpcoming = minutesUntil > 120 || now.getHours() < 6;
    return {
      mode: 'next',
      domain,
      kicker: 'Siguiente en tu día',
      title:
        domain === 'gym' && fusedGym?.templateName && nextTimedBlock.entry.label.toLocaleLowerCase('es') !== fusedGym.templateName.toLocaleLowerCase('es')
          ? `${nextTimedBlock.entry.label} · ${fusedGym.templateName}`
          : nextTimedBlock.entry.label,
      subtitle,
      timeLabel: nextTimedBlock.entry.time,
      countdownLabel: formatMinutesUntil(minutesUntil),
      minutesUntil,
      isCalmUpcoming,
      block: nextTimedBlock,
      gymInfo: fusedGym,
      studyInfo,
    };
  }

  // 5. Nighttime or all timed blocks finished -> Cierre del día
  const isEvening = now.getHours() >= 20;
  const allTimedPastOrDone =
    partition.timedBlocks.length > 0 &&
    partition.timedBlocks.every((b) => b.entry.done || b.skipped || b.temporalStatus === 'past');

  if (isEvening || allTimedPastOrDone) {
    if (dayClosed) {
      return {
        mode: 'day_closed',
        domain: 'closing',
        kicker: 'Jornada completada',
        title: 'Día cerrado',
        subtitle: 'Ya registraste el cierre de hoy. Descansá y recargá energía para mañana.',
      };
    }
    return {
      mode: 'closing',
      domain: 'closing',
      kicker: isEvening ? 'Cierre nocturno' : 'Bloques finalizados',
      title: 'Momento de cerrar el día',
      subtitle: 'Revisá lo que completaste, dejá una nota breve y pasá pendientes a mañana.',
    };
  }

  // 6. Pending untimed Gym routine or untimed task
  const pendingUntimedGym = partition.untimedTasks.find(
    (b) => b.domain === 'gym' && !b.entry.done && !b.skipped
  );
  if (pendingUntimedGym && gymInfo && gymInfo.status === 'pending_today') {
    return {
      mode: 'next',
      domain: 'gym',
      kicker: 'Entrenamiento de hoy',
      title: gymInfo.templateName || pendingUntimedGym.entry.label,
      subtitle:
        gymInfo.exerciseCount > 0
          ? `${gymInfo.exerciseCount} ejercicios listos para iniciar cuando quieras.`
          : 'Tu rutina de gimnasio asignada para hoy está lista.',
      isCalmUpcoming: now.getHours() < 6,
      block: pendingUntimedGym,
      gymInfo,
    };
  }

  const nextUntimedTask = partition.untimedTasks.find((b) => !b.entry.done && !b.skipped);
  if (nextUntimedTask) {
    const domain = nextUntimedTask.domain;
    return {
      mode: 'next',
      domain,
      kicker: 'Pendiente destacado',
      title: nextUntimedTask.entry.label,
      subtitle: `${nextUntimedTask.entry.sourceLabel} · Sin horario fijo`,
      isCalmUpcoming: now.getHours() < 6,
      block: nextUntimedTask,
      gymInfo: domain === 'gym' ? gymInfo : null,
      studyInfo: domain === 'study' ? getStudyInfo(state, todayIso, nextUntimedTask.entry.label) : null,
    };
  }

  // 7. Completely clear day
  return {
    mode: 'free',
    domain: 'general',
    kicker: 'Sin bloques pendientes',
    title: 'Tu día está despejado',
    subtitle: 'Podés agregar un bloque en Agenda o capturar una tarea rápida con Ctrl+K.',
  };
}

function formatCountdown(daysUntil: number): string {
  if (daysUntil < 0) {
    const abs = Math.abs(daysUntil);
    return abs === 1 ? 'Venció ayer' : `Hace ${abs} d`;
  }
  if (daysUntil === 0) return 'Hoy';
  if (daysUntil === 1) return 'Mañana';
  return `En ${daysUntil} d`;
}

function urgencyForDays(daysUntil: number): TodayRadarMilestone['urgency'] {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil === 0) return 'today';
  if (daysUntil <= 3) return 'soon';
  return 'upcoming';
}

/**
 * Aggregates real upcoming milestones from Estudios, Trabajo, and Finanzas for the Radar panel.
 * Respects module visibility and privacyMode.
 */
export function getTodayRadarMilestones(
  state: LifeOSState,
  todayIso: string = todayISO(),
  maxItems = 6
): TodayRadarMilestone[] {
  const milestones: TodayRadarMilestone[] = [];
  const privateMode = Boolean(state.settings?.privacyMode);
  const maskLabel = (text: string) => (privateMode ? text.replace(/\d[\d.,]*/g, '••••') : text);
  const maskMoney = (amount: number, currency: string) =>
    privateMode ? '••••' : formatMoney(amount, currency);

  // 1. Estudios: Exámenes / entregas pendientes (próximos 30 días)
  if (isModuleEnabled(state, 'estudios')) {
    const subjects = state.study?.subjects || [];
    for (const exam of state.study?.exams || []) {
      if (exam.status !== 'pendiente') continue;
      if (!exam.date || !/^\d{4}-\d{2}-\d{2}$/.test(exam.date)) continue;
      const daysUntil = daysBetween(todayIso, exam.date);
      if (daysUntil < 0 || daysUntil > 30) continue;

      const subject = exam.subjectId ? subjects.find((s) => s.id === exam.subjectId) : null;
      const title = exam.title?.trim()
        ? subject
          ? `${exam.title.trim()} · ${subject.name}`
          : exam.title.trim()
        : subject?.name || 'Examen';

      const timePart = exam.time ? ` · ${exam.time}` : '';
      milestones.push({
        id: `radar-exam-${exam.id}`,
        module: 'estudios',
        moduleLabel: 'Estudios',
        title,
        detail: `${fmtDate(exam.date)}${timePart}`,
        date: exam.date,
        daysUntil,
        countdownLabel: formatCountdown(daysUntil),
        urgency: urgencyForDays(daysUntil),
        targetView: 'estudios',
        targetFocusId: `exam-${exam.id}`,
      });
    }
  }

  // 2. Trabajo: Fechas clave y seguimientos próximos (próximos 14 días, o vencidos hasta 7 días)
  if (isModuleEnabled(state, 'trabajo')) {
    for (const app of state.jobs?.applications || []) {
      if (!isJobApplicationActive(app)) continue;

      const keyDates = normalizeJobKeyDates(app.keyDates);
      for (const kd of keyDates) {
        if (!kd.date || !/^\d{4}-\d{2}-\d{2}$/.test(kd.date)) continue;
        const daysUntil = daysBetween(todayIso, kd.date);
        if (daysUntil < -7 || daysUntil > 14) continue;
        const kindLabel = JOB_KEY_DATE_LABELS[kd.kind] || 'Hito';
        const timePart = kd.time ? ` · ${kd.time}` : '';
        milestones.push({
          id: `radar-job-kd-${app.id}-${kd.id}`,
          module: 'trabajo',
          moduleLabel: 'Trabajo',
          title: `${kindLabel}: ${app.empresa}`,
          detail: `${app.puesto || 'Postulación'} · ${fmtDate(kd.date)}${timePart}`,
          date: kd.date,
          daysUntil,
          countdownLabel: formatCountdown(daysUntil),
          urgency: urgencyForDays(daysUntil),
          targetView: 'trabajo',
          targetFocusId: `job-app-${app.id}`,
        });
      }

      if (app.nextActionDate && /^\d{4}-\d{2}-\d{2}$/.test(app.nextActionDate)) {
        const daysUntil = daysBetween(todayIso, app.nextActionDate);
        if (daysUntil >= -7 && daysUntil <= 14) {
          milestones.push({
            id: `radar-job-next-${app.id}`,
            module: 'trabajo',
            moduleLabel: 'Trabajo',
            title: app.nextAction?.trim() ? `${app.nextAction.trim()} · ${app.empresa}` : `Seguimiento · ${app.empresa}`,
            detail: fmtDate(app.nextActionDate),
            date: app.nextActionDate,
            daysUntil,
            countdownLabel: formatCountdown(daysUntil),
            urgency: urgencyForDays(daysUntil),
            targetView: 'trabajo',
            targetFocusId: `job-app-${app.id}`,
          });
        }
      }
    }
  }

  // 3. Finanzas: Compromisos y acuerdos próximos (vencidos + próximos 10 días)
  if (isModuleEnabled(state, 'finanzas')) {
    for (const com of state.finance?.commitments || []) {
      if (!com.active) continue;
      if (com.status === 'paid' || com.status === 'cancelled') continue;
      if (typeof com.remainingOccurrences === 'number' && com.remainingOccurrences <= 0) continue;
      if (com.endDate && com.nextDueDate > com.endDate) continue;
      if (!com.nextDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(com.nextDueDate)) continue;

      const daysUntil = daysBetween(todayIso, com.nextDueDate);
      if (daysUntil > 10) continue;

      const cur = confirmedFinancialCurrency(com.currency);
      const formattedCleanAmount = `$ ${com.amount.toLocaleString('es-UY', { maximumFractionDigits: 2 })}`;
      const amountText = cur
        ? maskMoney(com.amount, cur)
        : privateMode
          ? '••••'
          : formattedCleanAmount;

      milestones.push({
        id: `radar-fin-com-${com.id}`,
        module: 'finanzas',
        moduleLabel: 'Finanzas',
        title: maskLabel(com.name),
        detail: `${amountText} · ${fmtDate(com.nextDueDate)}`,
        amountTooltip: !cur && !privateMode ? 'Moneda sin confirmar en Finanzas' : undefined,
        date: com.nextDueDate,
        daysUntil,
        countdownLabel: formatCountdown(daysUntil),
        urgency: urgencyForDays(daysUntil),
        targetView: 'finanzas',
        targetTab: 'proyeccion',
        targetFocusId: `commitment-${com.id}`,
      });
    }

    const transactions = state.finance?.transactions || [];
    for (const agreement of state.finance?.agreements || []) {
      if (agreement.status !== 'active' || !agreement.schedule) continue;
      const breakdown = deriveAgreementSchedule(agreement, transactions, todayIso);
      const nextDue = breakdown?.nextDueInstallment;
      if (!nextDue || nextDue.status === 'paid') continue;

      const daysUntil = daysBetween(todayIso, nextDue.dueDate);
      if (daysUntil > 10) continue;

      const cur = (agreement.currency || 'UYU').toUpperCase();
      const pendingAmount = nextDue.remainingDue > 0.005 ? nextDue.remainingDue : nextDue.requiredAmount;
      const amountText = maskMoney(pendingAmount, cur);

      milestones.push({
        id: `radar-fin-agr-${agreement.id}-${nextDue.installmentNumber}`,
        module: 'finanzas',
        moduleLabel: 'Finanzas',
        title: `${maskLabel(agreement.title)} (${nextDue.installmentNumber}/${nextDue.totalInstallments})`,
        detail: `${amountText} · ${fmtDate(nextDue.dueDate)}`,
        date: nextDue.dueDate,
        daysUntil,
        countdownLabel: formatCountdown(daysUntil),
        urgency: urgencyForDays(daysUntil),
        targetView: 'finanzas',
        targetTab: 'cuentas',
        targetFocusId: `agreement-${agreement.id}`,
      });
    }
  }

  // 4. Proyectos activos: revisiones y tareas con fecha límite (vencidas + próximos 14 días)
  if (isModuleEnabled(state, 'notas')) {
    for (const project of state.projects || []) {
      if (project.status !== 'activo') continue;

      if (project.reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(project.reviewDate)) {
        const daysUntil = daysBetween(todayIso, project.reviewDate);
        if (daysUntil <= 14) {
          milestones.push({
            id: `radar-project-review-${project.id}`,
            module: 'proyectos',
            moduleLabel: 'Proyectos',
            title: `Revisión: ${project.name}`,
            detail: fmtDate(project.reviewDate),
            date: project.reviewDate,
            daysUntil,
            countdownLabel: formatCountdown(daysUntil),
            urgency: urgencyForDays(daysUntil),
            targetView: 'notas',
            targetTab: 'proyectos',
            targetFocusId: `project-${project.id}`,
          });
        }
      }

      for (const task of project.tasks || []) {
        if (task.done) continue;
        if (!task.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) continue;
        const daysUntil = daysBetween(todayIso, task.dueDate);
        if (daysUntil > 14) continue;
        milestones.push({
          id: `radar-project-task-${task.id}`,
          module: 'proyectos',
          moduleLabel: 'Proyectos',
          title: task.text,
          detail: `${project.name} · ${fmtDate(task.dueDate)}`,
          date: task.dueDate,
          daysUntil,
          countdownLabel: formatCountdown(daysUntil),
          urgency: urgencyForDays(daysUntil),
          targetView: 'notas',
          targetTab: 'proyectos',
          targetFocusId: `project-task-${task.id}`,
        });
      }
    }
  }

  return milestones
    .sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      return a.title.localeCompare(b.title, 'es');
    })
    .slice(0, maxItems);
}

/**
 * Computes the automatic daily pulse reflecting real progress across modules today.
 */
export function getTodayPulse(
  state: LifeOSState,
  entries: TodayAgendaEntry[],
  todayIso: string = todayISO(),
  now: Date = new Date()
): TodayPulseSummary {
  const partition = partitionTodayAgenda(state, entries, now, todayIso);
  const studyEnabled = isModuleEnabled(state, 'estudios');
  const gymEnabled = isModuleEnabled(state, 'gimnasio');

  const studyMinutesToday = studyEnabled
    ? (state.study?.studyLog || [])
        .filter((log) => log.date === todayIso)
        .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0)
    : 0;
  const studySessionActive = Boolean(
    studyEnabled &&
      state.study?.activeSession &&
      (state.study.activeSession.status === 'running' || state.study.activeSession.status === 'paused')
  );

  let gymStatus: TodayPulseSummary['gymStatus'] = 'unscheduled';
  let gymLabel = 'Sin rutina hoy';
  let gymRoutineName: string | undefined;

  if (gymEnabled) {
    const gymInfo = getGymFusionInfo(state, todayIso);
    const rawStatus = todayGymStatus(state, todayIso);
    gymRoutineName = gymInfo?.templateName;

    if (gymInfo?.hasActiveSession) {
      gymStatus = 'active_session';
      gymLabel = gymRoutineName ? `En curso · ${gymRoutineName}` : 'Sesión en curso';
    } else if (rawStatus.status === 'trained_today') {
      gymStatus = 'trained_today';
      gymLabel = rawStatus.completedSetsCount > 0
        ? `Completado (${rawStatus.completedSetsCount} series)`
        : 'Entrenamiento completado';
    } else if (rawStatus.status === 'rest_today') {
      gymStatus = 'rest_today';
      gymLabel = 'Día de descanso';
    } else if (gymInfo?.templateName) {
      gymStatus = 'pending_today';
      gymLabel = `Pendiente · ${gymInfo.templateName}`;
    } else {
      gymStatus = 'unscheduled';
      gymLabel = 'Día libre';
    }
  }

  const completableBlocks = [...partition.timedBlocks, ...partition.untimedTasks].filter(
    (b) => b.entry.completable
  );
  const blocksTotal = completableBlocks.length;
  const blocksCompleted = completableBlocks.filter((b) => b.entry.done).length;

  const habitsTotal = partition.microHabits.length;
  const habitsCompleted = partition.microHabits.filter((h) => h.done).length;

  const totalTrackable = blocksTotal + habitsTotal;
  const totalDone = blocksCompleted + habitsCompleted;
  const completionPct = totalTrackable > 0 ? Math.round((totalDone / totalTrackable) * 100) : 0;

  return {
    studyEnabled,
    studyMinutesToday,
    studyFormatted: formatStudyDuration(studyMinutesToday),
    studySessionActive,
    gymEnabled,
    gymStatus,
    gymLabel,
    gymRoutineName,
    blocksCompleted,
    blocksTotal,
    habitsCompleted,
    habitsTotal,
    completionPct,
  };
}

// ============================================================================
// Local-only "Omitir hoy" persistence (no global store or Firebase changes)
// ============================================================================

export function getSkippedTodayStorageKey(dateIso: string): string {
  return `lifeos:hoy:skipped:${dateIso}`;
}

export function loadSkippedTodayKeys(dateIso: string): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getSkippedTodayStorageKey(dateIso));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function saveSkippedTodayKeys(dateIso: string, keys: string[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const unique = Array.from(new Set(keys));
    if (unique.length === 0) {
      window.localStorage.removeItem(getSkippedTodayStorageKey(dateIso));
    } else {
      window.localStorage.setItem(getSkippedTodayStorageKey(dateIso), JSON.stringify(unique));
    }
  } catch {
    // Ignore storage quota or SSR errors
  }
}

export function toggleSkippedTodayKey(
  dateIso: string,
  entryKey: string,
  currentKeys: string[]
): string[] {
  const exists = currentKeys.includes(entryKey);
  const next = exists
    ? currentKeys.filter((k) => k !== entryKey)
    : [...currentKeys, entryKey];
  saveSkippedTodayKeys(dateIso, next);
  return next;
}

// ============================================================================
// Inline 7-day Status Sparkline (56×20px, no axes, no grid, no legend)
// ============================================================================

export interface SevenDaySparklineSeries {
  sleepPath: string;
  energyPath: string;
  moodPath: string;
  hasAnySeries: boolean;
}

function shiftDateIso(iso: string, deltaDays: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildSparklinePath(
  values: Array<number | null>,
  width = 56,
  height = 20,
  padY = 2.5
): string {
  const validCount = values.filter((v) => v !== null && Number.isFinite(v)).length;
  if (validCount < 2) return '';

  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const usableH = height - padY * 2;
  const segments: string[] = [];

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val === null || !Number.isFinite(val)) continue;
    const clamped = Math.max(0, Math.min(1, val));
    const x = Number((i * stepX).toFixed(1));
    const y = Number((padY + (1 - clamped) * usableH).toFixed(1));
    segments.push(`${segments.length === 0 ? 'M' : 'L'}${x},${y}`);
  }

  return segments.join(' ');
}

export function getSevenDayStatusSparkline(
  state: LifeOSState,
  todayIso: string = todayISO()
): SevenDaySparklineSeries {
  const dates = Array.from({ length: 7 }, (_, i) => shiftDateIso(todayIso, i - 6));
  const sleepVals: Array<number | null> = [];
  const energyVals: Array<number | null> = [];
  const moodVals: Array<number | null> = [];

  for (const date of dates) {
    const entry = contextForDate(state, date);
    sleepVals.push(entry.sleepHours != null ? Math.min(1, Math.max(0, entry.sleepHours / 10)) : null);
    energyVals.push(entry.energy != null ? (entry.energy - 1) / 4 : null);
    moodVals.push(entry.mood != null ? (entry.mood - 1) / 4 : null);
  }

  const sleepPath = buildSparklinePath(sleepVals);
  const energyPath = buildSparklinePath(energyVals);
  const moodPath = buildSparklinePath(moodVals);

  return {
    sleepPath,
    energyPath,
    moodPath,
    hasAnySeries: Boolean(sleepPath || energyPath || moodPath),
  };
}
