import type { AttentionDismissalRecord, LifeOSState, ViewType } from '../types';
import { daysBetween, fmtDate, formatMoney, todayISO } from './storage';
import { isModuleEnabled } from './moduleVisibility';
import { deriveAgreementSchedule } from './financeAgreements';
import { isWeeklyReviewDue } from './review';

export type AttentionSignalKind =
  | 'financial_commitment_due'
  | 'financial_agreement_due'
  | 'task_overdue'
  | 'exam_upcoming'
  | 'backup_urgent'
  | 'weekly_review_due'
  | 'agenda_event_soon'
  | 'agenda_event_tomorrow';

export interface AttentionItem {
  id: string;
  dismissKey: string;
  signalKind: AttentionSignalKind;
  module: ViewType;
  title: string;
  detail: string;
  actionLabel: string;
  urgency: 'critical' | 'urgent' | 'warning' | 'info';
  score: number;
  targetView: ViewType;
  targetTab?: string;
  targetFocusId?: string;
  sourceRecordId: string;
  dueDate?: string;
}

export interface AttentionOptions {
  todayIso?: string;
  backupDismissed?: boolean;
  currentTime?: string;
  now?: Date;
  dismissedKeys?: string[];
}

export function getTomorrowDateString(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1, 12);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, '0');
  const nd = String(next.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function formatDaysOverdue(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/**
 * Pure, deterministic selector for «Atención ahora» on Hoy (DashboardView).
 * Evaluates active modules, checks structured due dates and states,
 * and derives at most 2 prioritized attention items.
 *
 * Guaranteed invariants:
 * 1. Pure function: NO state mutations, zero side effects.
 * 2. Module Visibility: Disabled modules are never queried or emitted.
 * 3. Deduplication: Excludes items already represented in Today's agenda.
 * 4. Deterministic: Stable tie-breaking, max 2 items returned.
 * 5. Returns empty array if no matters require attention (zero DOM space).
 */
export function getAllAttentionCandidates(
  state: LifeOSState,
  options?: AttentionOptions
): AttentionItem[] {
  const today = options?.todayIso || todayISO();
  const tomorrow = getTomorrowDateString(today);
  const backupDismissed = Boolean(options?.backupDismissed);
  const candidates: AttentionItem[] = [];

  // =========================================================================
  // Señal B1: Compromisos financieros (FinancialCommitment)
  // =========================================================================
  if (isModuleEnabled(state, 'finanzas')) {
    const commitments = state.finance?.commitments || [];
    for (const com of commitments) {
      if (!com.active) continue;
      if (com.status === 'paid' || com.status === 'cancelled') continue;
      if (typeof com.remainingOccurrences === 'number' && com.remainingOccurrences <= 0) {
        continue;
      }
      if (com.endDate && com.nextDueDate > com.endDate) continue;
      if (!com.nextDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(com.nextDueDate)) continue;

      if (com.nextDueDate <= today) {
        const diff = daysBetween(com.nextDueDate, today);
        const isOverdue = com.nextDueDate < today;
        const cur = (com.currency || 'UYU').toUpperCase();
        const formattedAmount = formatMoney(com.amount, cur);

        const title = isOverdue ? 'Vencimiento pendiente' : 'Vence hoy';
        const detail = isOverdue
          ? `${com.name} (${formattedAmount}) venció ${formatDaysOverdue(diff)}.`
          : `${com.name} (${formattedAmount}) tiene vencimiento hoy.`;

        const score = isOverdue ? Math.min(120, 100 + Math.min(diff, 20)) : 95;

        candidates.push({
          id: `attention-com-${com.id}`,
          dismissKey: `finance_commitment:${com.id}:${com.nextDueDate}`,
          signalKind: 'financial_commitment_due',
          module: 'finanzas',
          title,
          detail,
          actionLabel: 'Ver cuota',
          urgency: isOverdue ? 'critical' : 'urgent',
          score,
          targetView: 'finanzas',
          targetTab: 'proyeccion',
          targetFocusId: `commitment-${com.id}`,
          sourceRecordId: com.id,
          dueDate: com.nextDueDate,
        });
      } else if (com.nextDueDate === tomorrow) {
        const cur = (com.currency || 'UYU').toUpperCase();
        const formattedAmount = formatMoney(com.amount, cur);

        candidates.push({
          id: `attention-com-${com.id}`,
          dismissKey: `finance_commitment:${com.id}:${com.nextDueDate}`,
          signalKind: 'financial_commitment_due',
          module: 'finanzas',
          title: 'Vence mañana',
          detail: `${com.name} (${formattedAmount}) vence mañana.`,
          actionLabel: 'Ver cuota',
          urgency: 'warning',
          score: 82,
          targetView: 'finanzas',
          targetTab: 'proyeccion',
          targetFocusId: `commitment-${com.id}`,
          sourceRecordId: com.id,
          dueDate: com.nextDueDate,
        });
      }
    }

    // =========================================================================
    // Señal B2: Acuerdos de financiación (FinancingAgreement)
    // =========================================================================
    const agreements = state.finance?.agreements || [];
    const transactions = state.finance?.transactions || [];
    for (const agreement of agreements) {
      if (agreement.status !== 'active') continue;
      if (!agreement.schedule) continue;

      const breakdown = deriveAgreementSchedule(agreement, transactions, today);
      const nextDue = breakdown?.nextDueInstallment;
      if (!nextDue) continue;
      if (nextDue.status === 'paid') continue;

      if (nextDue.isOverdue || nextDue.dueDate <= today) {
        const diff = daysBetween(nextDue.dueDate, today);
        const isOverdue = nextDue.dueDate < today;
        const cur = (agreement.currency || 'UYU').toUpperCase();
        const pendingAmount = nextDue.remainingDue > 0.005 ? nextDue.remainingDue : nextDue.requiredAmount;
        const formattedAmount = formatMoney(pendingAmount, cur);

        const title = isOverdue ? 'Cuota vencida' : 'Cuota vence hoy';
        const partialLabel = nextDue.status === 'partial' ? ' (saldo pendiente)' : '';
        const detail = isOverdue
          ? `${agreement.title} · Cuota ${nextDue.installmentNumber}/${nextDue.totalInstallments} (${formattedAmount}${partialLabel}) venció ${formatDaysOverdue(diff)}.`
          : `${agreement.title} · Cuota ${nextDue.installmentNumber}/${nextDue.totalInstallments} (${formattedAmount}${partialLabel}) vence hoy.`;

        const score = isOverdue ? Math.min(120, 100 + Math.min(diff, 20)) : 95;

        candidates.push({
          id: `attention-agreement-${agreement.id}-${nextDue.installmentNumber}`,
          dismissKey: `finance_agreement:${agreement.id}:${nextDue.installmentNumber}:${nextDue.dueDate}`,
          signalKind: 'financial_agreement_due',
          module: 'finanzas',
          title,
          detail,
          actionLabel: 'Ver cuota',
          urgency: isOverdue ? 'critical' : 'urgent',
          score,
          targetView: 'finanzas',
          targetTab: 'cuentas',
          targetFocusId: `agreement-${agreement.id}`,
          sourceRecordId: agreement.id,
          dueDate: nextDue.dueDate,
        });
      } else if (nextDue.dueDate === tomorrow) {
        const cur = (agreement.currency || 'UYU').toUpperCase();
        const pendingAmount = nextDue.remainingDue > 0.005 ? nextDue.remainingDue : nextDue.requiredAmount;
        const formattedAmount = formatMoney(pendingAmount, cur);
        const partialLabel = nextDue.status === 'partial' ? ' (saldo pendiente)' : '';

        candidates.push({
          id: `attention-agreement-${agreement.id}-${nextDue.installmentNumber}`,
          dismissKey: `finance_agreement:${agreement.id}:${nextDue.installmentNumber}:${nextDue.dueDate}`,
          signalKind: 'financial_agreement_due',
          module: 'finanzas',
          title: 'Cuota vence mañana',
          detail: `${agreement.title} · Cuota ${nextDue.installmentNumber}/${nextDue.totalInstallments} (${formattedAmount}${partialLabel}) vence mañana.`,
          actionLabel: 'Ver cuota',
          urgency: 'warning',
          score: 82,
          targetView: 'finanzas',
          targetTab: 'cuentas',
          targetFocusId: `agreement-${agreement.id}`,
          sourceRecordId: agreement.id,
          dueDate: nextDue.dueDate,
        });
      }
    }
  }

  // =========================================================================
  // Señal A: Tareas con plazo vencido explícito
  // =========================================================================
  // A1: Tareas de proyecto (ProjectTask)
  if (isModuleEnabled(state, 'notas')) {
    const projects = state.projects || [];
    for (const project of projects) {
      if (project.status === 'completado' || project.status === 'cancelado') continue;

      for (const task of project.tasks || []) {
        if (task.done) continue;
        if (!task.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) continue;

        // Strictly before today (overdue)
        if (task.dueDate < today) {
          const diff = daysBetween(task.dueDate, today);
          const score = Math.min(108, 90 + Math.min(diff, 18));

          candidates.push({
            id: `attention-project-task-${task.id}`,
            dismissKey: `project_task:${task.id}:${task.dueDate}`,
            signalKind: 'task_overdue',
            module: 'notas',
            title: 'Plazo vencido',
            detail: `${task.text} (${project.name}) tenía fecha límite ${formatDaysOverdue(diff)}.`,
            actionLabel: 'Ver tarea',
            urgency: 'critical',
            score,
            targetView: 'notas',
            targetTab: 'proyectos',
            targetFocusId: `project-task-${task.id}`,
            sourceRecordId: task.id,
            dueDate: task.dueDate,
          });
        }
      }
    }
  }

  // A2: Tareas puntuales (todayExtras) con fecha límite explícita vencida o que vence hoy fuera de la agenda de hoy
  if (isModuleEnabled(state, 'agenda')) {
    const extras = state.todayExtras || [];
    for (const extra of extras) {
      if (extra.done) continue;
      if (!extra.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(extra.dueDate)) continue;

      if (extra.dueDate < today || (extra.dueDate === today && extra.date !== today)) {
        const isOverdue = extra.dueDate < today;
        const diff = isOverdue ? daysBetween(extra.dueDate, today) : 0;
        const score = isOverdue ? Math.min(108, 90 + Math.min(diff, 18)) : 94;

        const title = isOverdue ? 'Plazo vencido' : 'Plazo vence hoy';
        const detail = isOverdue
          ? `${extra.text} tenía fecha límite ${formatDaysOverdue(diff)}.`
          : `${extra.text} vence hoy (programada para el ${fmtDate(extra.date)}).`;

        candidates.push({
          id: `attention-extra-${extra.id}`,
          dismissKey: `today_extra:${extra.id}:${extra.dueDate || extra.date}`,
          signalKind: 'task_overdue',
          module: 'agenda',
          title,
          detail,
          actionLabel: 'Ver tarea',
          urgency: isOverdue ? 'critical' : 'urgent',
          score,
          targetView: 'dashboard',
          targetFocusId: `today-extra-${extra.id}`,
          sourceRecordId: extra.id,
          dueDate: extra.dueDate,
        });
      }
    }
  }

  // =========================================================================
  // Señal C: Exámenes próximos (1 o 2 días)
  // =========================================================================
  if (isModuleEnabled(state, 'estudios')) {
    const exams = state.study?.exams || [];
    const subjects = state.study?.subjects || [];
    for (const exam of exams) {
      if (exam.status !== 'pendiente') continue;
      if (!exam.date || !/^\d{4}-\d{2}-\d{2}$/.test(exam.date)) continue;

      const days = daysBetween(today, exam.date);
      // Strictly tomorrow (1) or day after tomorrow (2).
      // Note: days === 0 is excluded to avoid duplicating TodayAgendaSection.
      // Note: days < 0 is excluded per spec (past pending exams are not auto-emergencies).
      if (days === 1 || days === 2) {
        const subject = exam.subjectId ? subjects.find((s) => s.id === exam.subjectId) : null;
        const subName = subject?.name || 'Materia';
        const rawTitle = exam.title?.trim();
        const examLabel = rawTitle
          ? (subject ? `${rawTitle} (${subject.name})` : rawTitle)
          : subName;
        const timeSuffix = exam.time ? ` a las ${exam.time}` : '';
        const isTomorrow = days === 1;

        candidates.push({
          id: `attention-exam-${exam.id}`,
          dismissKey: `study_exam:${exam.id}:${exam.date}`,
          signalKind: 'exam_upcoming',
          module: 'estudios',
          title: isTomorrow ? 'Examen mañana' : 'Examen en 2 días',
          detail: isTomorrow
            ? `${examLabel} está programado para mañana${timeSuffix}.`
            : `${examLabel} está programado dentro de dos días${timeSuffix}.`,
          actionLabel: 'Ver examen',
          urgency: isTomorrow ? 'urgent' : 'warning',
          score: isTomorrow ? 85 : 70,
          targetView: 'estudios',
          targetFocusId: `exam-${exam.id}`,
          sourceRecordId: exam.id,
          dueDate: exam.date,
        });
      }
    }
  }

  // =========================================================================
  // Señal D: Eventos puntuales de Agenda (hoy próximos o programados para mañana)
  // =========================================================================
  if (isModuleEnabled(state, 'agenda') || isModuleEnabled(state, 'calendario')) {
    const events = state.calendarEvents || [];
    const targetView: ViewType = isModuleEnabled(state, 'agenda') ? 'agenda' : 'calendario';

    let nowMinutes: number;
    if (options?.currentTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(options.currentTime)) {
      const [h, m] = options.currentTime.split(':').map(Number);
      nowMinutes = h * 60 + m;
    } else {
      const now = options?.now || new Date();
      nowMinutes = now.getHours() * 60 + now.getMinutes();
    }

    for (const ev of events) {
      if (!ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) continue;
      if (!ev.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(ev.time)) continue;

      let isToday = false;
      let isTomorrow = false;
      let occurrenceDate = ev.date;

      if (ev.recurring) {
        const [, evM, evD] = ev.date.split('-');
        const [, todayM, todayD] = today.split('-');
        const [, tomorrowM, tomorrowD] = tomorrow.split('-');
        if (evM === todayM && evD === todayD) {
          isToday = true;
          occurrenceDate = today;
        } else if (evM === tomorrowM && evD === tomorrowD) {
          isTomorrow = true;
          occurrenceDate = tomorrow;
        }
      } else {
        if (ev.date === today) {
          isToday = true;
          occurrenceDate = today;
        } else if (ev.date === tomorrow) {
          isTomorrow = true;
          occurrenceDate = tomorrow;
        }
      }

      if (isToday) {
        const [evH, evM] = ev.time.split(':').map(Number);
        const evMinutes = evH * 60 + evM;
        const minutesUntil = evMinutes - nowMinutes;

        if (minutesUntil >= 0 && minutesUntil <= 120) {
          const title =
            minutesUntil === 0
              ? 'Comienza ahora'
              : minutesUntil === 1
              ? 'Comienza en 1 minuto'
              : `Comienza en ${minutesUntil} minutos`;
          const detail = `${ev.name} · ${ev.time}`;
          const score = 96 + Math.round((120 - minutesUntil) / 20);

          candidates.push({
            id: `attention-agenda-event-${ev.id}`,
            dismissKey: `agenda_event:${ev.id}:${occurrenceDate}`,
            signalKind: 'agenda_event_soon',
            module: 'agenda',
            title,
            detail,
            actionLabel: 'Ver evento',
            urgency: 'urgent',
            score,
            targetView,
            targetFocusId: `agenda-event-${ev.id}`,
            sourceRecordId: ev.id,
            dueDate: occurrenceDate,
          });
        }
      } else if (isTomorrow) {
        candidates.push({
          id: `attention-agenda-event-${ev.id}`,
          dismissKey: `agenda_event:${ev.id}:${occurrenceDate}`,
          signalKind: 'agenda_event_tomorrow',
          module: 'agenda',
          title: `Mañana, ${ev.time}`,
          detail: ev.name,
          actionLabel: 'Ver evento',
          urgency: 'warning',
          score: 72,
          targetView,
          targetFocusId: `agenda-event-${ev.id}`,
          sourceRecordId: ev.id,
          dueDate: occurrenceDate,
        });
      }
    }
  }

  // =========================================================================
  // Avisos de sistema y mantenimiento existentes (Backup y Revisión Semanal)
  // =========================================================================
  const daysSinceBackup = state.settings?.lastBackupAt
    ? daysBetween(state.settings.lastBackupAt, today)
    : null;
  const backupUrgent = daysSinceBackup === null || daysSinceBackup >= 3;
  if (backupUrgent && !backupDismissed) {
    const isSevere = daysSinceBackup === null || daysSinceBackup >= 7;
    candidates.push({
      id: 'attention-backup',
      dismissKey: `backup_urgent:${today}`,
      signalKind: 'backup_urgent',
      module: 'config',
      title: 'Backup pendiente',
      detail:
        daysSinceBackup === null
          ? 'Todavía no exportaste una copia local'
          : `La última copia fue hace ${daysSinceBackup} días`,
      actionLabel: 'Exportar',
      urgency: isSevere ? 'urgent' : 'info',
      score: isSevere ? 80 : 65,
      targetView: 'config',
      sourceRecordId: 'backup',
    });
  }

  if (isWeeklyReviewDue(state, today)) {
    candidates.push({
      id: 'attention-weekly-review',
      dismissKey: `weekly_review_due:${today}`,
      signalKind: 'weekly_review_due',
      module: 'dashboard',
      title: 'Revisión semanal pendiente',
      detail: 'Completá la revisión guiada para sincronizar prioridades y hábitos.',
      actionLabel: 'Revisar',
      urgency: 'warning',
      score: 75,
      targetView: 'dashboard',
      sourceRecordId: 'weekly-review',
    });
  }

  return candidates;
}

/**
 * Computes a monotonically increasing Lamport logical timestamp for attention dismissal mutations.
 * Guarantees that any state change (dismissal or restoration) causally following an observed
 * record receives a timestamp strictly greater than that record's timestamp (T_next >= max(physicalNow, T_prev + 1)).
 * This protects against clock skew / backward wall clocks across distributed devices.
 */
export function nextAttentionDismissalTimestamp(
  previousRecord?: AttentionDismissalRecord | null,
  nowMs = Date.now()
): number {
  const physicalMillis = Math.max(0, Math.floor(nowMs));
  const previousMillis =
    typeof previousRecord?.updatedAt === 'number' && Number.isFinite(previousRecord.updatedAt)
      ? previousRecord.updatedAt
      : 0;
  return Math.max(physicalMillis, previousMillis + 1);
}

/**
 * Evaluates whether the underlying entity of an attention dismissal key
 * is still active, open/pending, and eligible to produce attention notices.
 * Used by pruning to ensure that neither 'active' nor 'dismissed' records
 * of living occurrences are ever pruned prematurely.
 */
export function isAttentionOccurrenceEligible(
  key: string,
  state: LifeOSState,
  referenceDateIso = todayISO()
): boolean {
  if (!key || typeof key !== 'string') return false;
  const parts = key.split(':');
  const prefix = parts[0];

  if (prefix === 'finance_commitment') {
    const id = parts[1];
    const dueDate = parts[2];
    const com = (state.finance?.commitments || []).find((c) => c.id === id);
    if (!com) return false;
    if (!com.active || com.status === 'paid' || com.status === 'cancelled') return false;
    if (typeof com.remainingOccurrences === 'number' && com.remainingOccurrences <= 0) return false;
    if (com.endDate && com.nextDueDate > com.endDate) return false;
    if (dueDate && com.nextDueDate !== dueDate) return false;
    return true;
  }

  if (prefix === 'finance_agreement') {
    const id = parts[1];
    const installmentNumber = parts[2];
    const dueDate = parts[3];
    const ag = (state.finance?.agreements || []).find((a) => a.id === id);
    if (!ag || ag.status !== 'active') return false;
    const schedule = deriveAgreementSchedule(ag, state.finance?.transactions || [], referenceDateIso);
    if (!schedule) return false;
    const inst = schedule.installments.find(
      (i) => String(i.installmentNumber) === installmentNumber && i.dueDate === dueDate
    );
    if (inst) {
      return inst.status !== 'paid';
    }
    return false;
  }

  if (prefix === 'project_task') {
    const taskId = parts[1];
    const dueDate = parts[2];
    let foundTask = false;
    let isDone = false;
    let actualDueDate = '';
    for (const proj of state.projects || []) {
      const t = (proj.tasks || []).find((tk) => tk.id === taskId);
      if (t) {
        foundTask = true;
        isDone = Boolean(t.done);
        actualDueDate = t.dueDate || '';
        break;
      }
    }
    if (!foundTask || isDone) return false;
    if (dueDate && actualDueDate !== dueDate) return false;
    return true;
  }

  if (prefix === 'today_extra') {
    const extraId = parts[1];
    const dueDate = parts[2];
    const extra = (state.todayExtras || []).find((x) => x.id === extraId);
    if (!extra || extra.done) return false;
    const itemDueDate = extra.dueDate || extra.date;
    if (dueDate && itemDueDate !== dueDate) return false;
    return true;
  }

  if (prefix === 'study_exam') {
    const examId = parts[1];
    const date = parts[2];
    const ex = (state.study?.exams || []).find((e) => e.id === examId);
    if (!ex || ex.status !== 'pendiente') return false;
    if (date && date < referenceDateIso) return false;
    return true;
  }

  if (prefix === 'agenda_event') {
    const eventId = parts[1];
    const date = parts[2];
    const ev = (state.calendarEvents || []).find((e) => e.id === eventId);
    if (!ev) return false;
    if (date && date < referenceDateIso) return false;
    return true;
  }

  if (prefix === 'backup_urgent') {
    const date = parts[1];
    if (date !== referenceDateIso) return false;
    return !state.settings?.lastBackupAt || daysBetween(state.settings.lastBackupAt, referenceDateIso) >= 7;
  }

  if (prefix === 'weekly_review_due') {
    const date = parts[1];
    if (date !== referenceDateIso) return false;
    return isWeeklyReviewDue(state, referenceDateIso);
  }

  return false;
}

/**
 * Checks whether an AttentionItem is dismissed in settings.
 * Prioritizes attentionDismissals (with LWW status) and falls back to dismissedAttentionKeys.
 */
export function isAttentionItemDismissed(
  item: AttentionItem,
  settings?: LifeOSState['settings'],
  extraDismissedKeys?: string[]
): boolean {
  if (extraDismissedKeys && extraDismissedKeys.includes(item.dismissKey)) {
    return true;
  }
  const record = settings?.attentionDismissals?.[item.dismissKey];
  if (record) {
    return record.status === 'dismissed';
  }
  if (settings?.dismissedAttentionKeys?.includes(item.dismissKey)) {
    return true;
  }
  return false;
}

/**
 * Pure, deterministic selector for «Atención ahora» on Hoy (DashboardView).
 * Evaluates active modules, checks structured due dates and states,
 * filters out individually dismissed notices, and derives at most 2 prioritized attention items.
 *
 * Guaranteed invariants:
 * 1. Pure function: NO state mutations, zero side effects.
 * 2. Module Visibility: Disabled modules are never queried or emitted.
 * 3. Individual dismissal: Silenced items for the same occurrence are filtered out.
 * 4. Deduplication: Excludes items already represented in Today's agenda.
 * 5. Deterministic: Stable tie-breaking, max 2 items returned.
 * 6. Returns empty array if no matters require attention (zero DOM space).
 */
export function getTodayAttentionItems(
  state: LifeOSState,
  options?: AttentionOptions
): AttentionItem[] {
  const all = getAllAttentionCandidates(state, options);
  const activeCandidates = all.filter(
    (item) => !isAttentionItemDismissed(item, state.settings, options?.dismissedKeys)
  );

  if (activeCandidates.length === 0) return [];

  // Sort descending by score, tie-break by dueDate ascending, then id ascending
  activeCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.id.localeCompare(b.id);
  });

  if (activeCandidates.length <= 2) {
    return activeCandidates;
  }

  const first = activeCandidates[0];
  let secondIndex = 1;

  // Diversity rule: if candidates[1] is from the same module as first,
  // and there is another candidate from a different module within reasonable range (<= 15 points),
  // pick the diverse candidate to avoid monopolizing attention with a single domain.
  for (let i = 1; i < activeCandidates.length; i++) {
    const candidate = activeCandidates[i];
    if (candidate.module !== first.module) {
      if (first.score - candidate.score <= 15) {
        secondIndex = i;
        break;
      }
    }
  }

  const second = activeCandidates[secondIndex];
  return [first, second];
}

/**
 * Pure selector for dismissed attention items.
 * Returns only those candidates that are currently active and eligible,
 * but were individually dismissed by the user for this occurrence.
 */
export function getDismissedAttentionItems(
  state: LifeOSState,
  options?: AttentionOptions
): AttentionItem[] {
  const all = getAllAttentionCandidates(state, options);
  const dismissed = all.filter(
    (item) => isAttentionItemDismissed(item, state.settings, options?.dismissedKeys)
  );

  dismissed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.id.localeCompare(b.id);
  });

  return dismissed;
}
