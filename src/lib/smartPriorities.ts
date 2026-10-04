import type { LifeOSState } from '../types';
import { todayISO, daysBetween, uid } from './storage';
import {
  getUnifiedTaskList,
  getUnifiedTaskMap,
  getBlockingTasks,
  getUnblockedCountIfCompleted,
  type UnifiedTask,
} from './taskDependencies';
import { isModuleEnabled } from './moduleVisibility';

export interface TaskScoreResult {
  score: number;
  reasons: string[];
  isBlocked: boolean;
  unblocksCount: number;
  blockingTaskNames: string[];
}

export interface SmartPriorityCandidate {
  id: string;
  text: string;
  score: number;
  reason: string;
  reasons?: string[];
  source: 'exam' | 'job' | 'debt' | 'task' | 'gym' | 'resale';
  isBlocked?: boolean;
  unblocksCount?: number;
}

/**
 * Deterministically evaluates and scores any task based on priority,
 * deadline proximity, unblocking impact, and dependency blockage.
 */
export function scoreTask(
  task: UnifiedTask,
  today: string,
  allTasks: Map<string, UnifiedTask>
): TaskScoreResult {
  const reasons: string[] = [];
  const blockers = getBlockingTasks(task, allTasks);
  const blocked = blockers.length > 0;
  const unblocksCount = getUnblockedCountIfCompleted(task.id, allTasks);
  const blockingTaskNames = blockers.map((b) => b.text);

  // 1. Base score by declared priority
  let score = task.priority === 'alta' ? 85 : task.priority === 'baja' ? 55 : 70;
  if (task.priority === 'alta') {
    reasons.push('Prioridad alta');
  } else if (task.priority === 'media') {
    reasons.push('Prioridad media');
  }

  // 2. Deadline proximity (urgency boost)
  if (task.dueDate) {
    if (task.dueDate < today) {
      score += 20;
      reasons.push('Fecha límite vencida');
    } else if (task.dueDate === today) {
      score += 15;
      reasons.push('Vence hoy');
    } else {
      const days = daysBetween(today, task.dueDate);
      if (days <= 2) {
        score += 10;
        reasons.push(days === 1 ? 'Vence mañana' : `Vence en ${days} días`);
      } else if (days <= 7) {
        score += 5;
        reasons.push(`Vence en ${days} días`);
      }
    }
  }

  // 3. Unblocking impact (completing this enables other pending tasks)
  if (unblocksCount > 0) {
    const boost = Math.min(unblocksCount, 3) * 6; // up to +18
    score += boost;
    reasons.push(`Desbloquea ${unblocksCount} tarea(s)`);
  }

  // 4. Scheduled for today
  if (task.date === today || task.time) {
    reasons.push('Programada para hoy');
  }

  // 5. Blocked penalty: if prerequisite tasks are incomplete, heavily penalize
  if (blocked) {
    score -= 100;
    reasons.push(`Bloqueada por: ${blockingTaskNames.slice(0, 2).join(', ')}`);
  }

  return {
    score,
    reasons,
    isBlocked: blocked,
    unblocksCount,
    blockingTaskNames,
  };
}

export function getSmartDailyRecommendations(
  state: LifeOSState,
  limit = 3
): SmartPriorityCandidate[] {
  const today = todayISO();
  const candidates: SmartPriorityCandidate[] = [];
  const unifiedTasks = getUnifiedTaskList(state);
  const taskMap = getUnifiedTaskMap(unifiedTasks);

  // 1. Upcoming or Immediate Exams (within 7 days)
  if (isModuleEnabled(state, 'estudios')) {
    (state.study?.exams || [])
      .filter((e) => e.status === 'pendiente' && e.date >= today)
      .forEach((e) => {
        const days = daysBetween(today, e.date);
        if (days <= 7) {
          const subject = (state.study?.subjects || []).find((s) => s.id === e.subjectId);
          const name = subject?.name || 'Materia';
          const reason = days === 0 ? 'Examen HOY' : `Examen en ${days} día(s)`;
          candidates.push({
            id: `exam-${e.id}`,
            text: `Repasar para examen de ${name}`,
            score: 100 - days, // Sooner = higher score (93-100)
            reason,
            reasons: [reason, 'Objetivo académico crítico'],
            source: 'exam',
          });
        }
      });
  }

  // 2. Overdue or due today job follow-ups
  if (isModuleEnabled(state, 'trabajo')) {
    (state.jobs?.applications || [])
      .filter((a) => a.nextAction && a.nextActionDate && a.nextActionDate <= today)
      .forEach((a) => {
        const isOverdue = a.nextActionDate! < today;
        const reason = isOverdue ? 'Seguimiento atrasado' : 'Seguimiento vence hoy';
        candidates.push({
          id: `job-${a.id}`,
          text: `${a.nextAction}: ${a.empresa} (${a.puesto})`,
          score: isOverdue ? 95 : 90,
          reason,
          reasons: [reason, 'Búsqueda laboral activa'],
          source: 'job',
        });
      });
  }

  // 3. Debts with payment due within 3 days
  if (isModuleEnabled(state, 'finanzas')) {
    (state.finance?.debts || [])
      .filter((d) => d.dueDate && d.dueDate >= today && daysBetween(today, d.dueDate) <= 3)
      .forEach((d) => {
        const days = daysBetween(today, d.dueDate!);
        const reason = days === 0 ? 'Vence HOY' : `Vence en ${days} día(s)`;
        candidates.push({
          id: `debt-${d.id}`,
          text: `Pagar cuota de ${d.name}`,
          score: 88 - days,
          reason,
          reasons: [reason, 'Salud financiera'],
          source: 'debt',
        });
      });
  }

  // 4. Pending Tasks with Smart Priorities 2.0 evaluation (todayExtras & relevant project tasks)
  // Project tasks belong to the Projects context integrated inside Notas.
  const isProjectsEnabled = isModuleEnabled(state, 'notas');
  unifiedTasks
    .filter((t) => {
      if (t.type === 'project_task' && !isProjectsEnabled) {
        return false;
      }
      return !t.done && (t.date === today || (t.dueDate && t.dueDate <= today) || t.priority === 'alta');
    })
    .forEach((t) => {
      const scored = scoreTask(t, today, taskMap);

      // Do NOT recommend blocked tasks for top daily focus
      if (scored.isBlocked) return;

      const title = t.projectName ? `[${t.projectName}] ${t.text}` : t.text;
      const primaryReason = scored.reasons[0] || 'Tarea pendiente';

      candidates.push({
        id: `task-${t.id}`,
        text: title,
        score: scored.score,
        reason: scored.reasons.join(' · ') || primaryReason,
        reasons: scored.reasons,
        source: 'task',
        isBlocked: false,
        unblocksCount: scored.unblocksCount,
      });
    });

  // 5. Workout of the day (if not trained and not marked rest)
  if (isModuleEnabled(state, 'gimnasio')) {
    const isTrainedToday = (state.gym?.sessions || []).some(
      (s) => s.date === today && s.status === 'completed'
    );
    const isRestToday = (state.gym?.restDays || []).includes(today);
    if (!isTrainedToday && !isRestToday) {
      candidates.push({
        id: 'gym-today',
        text: 'Completar entrenamiento del día',
        score: 65,
        reason: 'Consistencia y salud física',
        reasons: ['Consistencia y salud física', 'Hábito diario'],
        source: 'gym',
      });
    }
  }

  // 6. High-margin new resale opportunities
  if (isModuleEnabled(state, 'reventa')) {
    (state.resale?.opportunities || [])
      .filter((o) => o.status === 'nueva' && o.buyPrice > 0)
      .forEach((o) => {
        const margin = ((o.marketPrice - o.buyPrice) / o.buyPrice) * 100;
        if (margin >= 30) {
          const reason = `Margen estimado +${Math.round(margin)}%`;
          candidates.push({
            id: `resale-${o.id}`,
            text: `Evaluar compra de ${o.item} (+${Math.round(margin)}% margen)`,
            score: 60,
            reason,
            reasons: [reason, 'Oportunidad de ganancia alta'],
            source: 'resale',
          });
        }
      });
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  // Filter out items already in today's dailyPriorities
  const currentPrioritiesText = new Set(
    (state.dailyPriorities || [])
      .filter((p) => p.date === today)
      .map((p) => p.text.trim().toLowerCase())
  );

  const filtered = candidates.filter((c) => !currentPrioritiesText.has(c.text.trim().toLowerCase()));

  return filtered.slice(0, limit);
}

export function adoptSmartDailyPriorities(draft: LifeOSState, count = 3): number {
  const today = todayISO();
  if (!draft.dailyPriorities) draft.dailyPriorities = [];

  const existingToday = draft.dailyPriorities.filter((p) => p.date === today);
  const slotsAvailable = Math.max(0, count - existingToday.length);
  if (slotsAvailable === 0) return 0;

  const recommendations = getSmartDailyRecommendations(draft, slotsAvailable);
  if (recommendations.length === 0) return 0;

  const usedRanks = existingToday.map((p) => p.rank || 0);

  recommendations.forEach((rec) => {
    const nextRank = [1, 2, 3].find((r) => !usedRanks.includes(r)) || existingToday.length + 1;
    usedRanks.push(nextRank);
    draft.dailyPriorities.push({
      id: uid(),
      date: today,
      text: rec.text,
      done: false,
      rank: nextRank,
      ...(rec.reasons && rec.reasons.length > 0 ? { reasons: rec.reasons } : {}),
    });
  });

  return recommendations.length;
}
