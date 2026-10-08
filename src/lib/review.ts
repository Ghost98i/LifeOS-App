import type { LifeOSState, ViewType } from '../types';
import { daysBetween, todayISO } from './storage';
import { sleepSummary } from './contextInsights';
import { getCategoryName } from './financeCategories';
import { isModuleEnabled } from './moduleVisibility';
import { getCompletedGymSets, getPerformedGymVolume, isPerformedGymSession } from './gymMetrics';

export interface ReviewException {
  id: string;
  title: string;
  detail: string;
  view: ViewType;
  tone: 'urgent' | 'attention' | 'info';
}

export function weeklyReviewExceptions(state: LifeOSState): ReviewException[] {
  const today = todayISO();
  const exceptions: ReviewException[] = [];
  const overdueTasks = state.todayExtras.filter((item) => !item.done && item.date < today);
  if (overdueTasks.length) exceptions.push({ id: 'overdue-tasks', title: `${overdueTasks.length} tarea(s) quedaron atrás`, detail: 'Reprogramalas o descartalas para limpiar Hoy.', view: 'dashboard', tone: 'attention' });

  const sleep = sleepSummary(state, today);
  if (sleep.shouldAlert) exceptions.push({
    id: 'short-sleep-streak',
    title: `${sleep.currentShortStreak} noches seguidas durmiendo poco`,
    detail: `Están por debajo de 7 h. El promedio de los últimos 7 días registrados es ${sleep.averageHours?.toFixed(1)} h.`,
    view: 'dashboard',
    tone: 'urgent',
  });

  const dueFollowups = state.jobs.applications.filter((item) => item.nextActionDate && item.nextActionDate <= today);
  if (dueFollowups.length) exceptions.push({ id: 'job-followups', title: `${dueFollowups.length} seguimiento(s) laboral(es) vencidos`, detail: dueFollowups.slice(0, 2).map((item) => item.empresa).join(' · '), view: 'trabajo', tone: 'urgent' });

  const oldStock = state.resale.inventory.filter((item) => item.status === 'comprado' && daysBetween(item.buyDate, today) >= 30);
  if (oldStock.length) exceptions.push({ id: 'old-stock', title: `${oldStock.length} producto(s) llevan más de 30 días`, detail: 'Revisá precio, publicación o salida.', view: 'reventa', tone: 'attention' });

  const staleAccounts = state.finance.accounts.filter((account) => !account.lastReconciledAt || daysBetween(account.lastReconciledAt, today) >= 14);
  if (staleAccounts.length) exceptions.push({ id: 'stale-accounts', title: `${staleAccounts.length} cuenta(s) sin conciliar`, detail: staleAccounts.map((account) => account.name).join(' · '), view: 'finanzas', tone: 'attention' });

  const budgetOverruns = state.finance.categories.filter((category) => {
    const catId = typeof category === 'string' ? category : category.id;
    const catName = typeof category === 'string' ? category : category.name;
    const budget = Number(state.finance.budgets[catId] || (catName !== catId ? state.finance.budgets[catName] : 0) || 0);
    if (!budget) return false;
    const spent = state.finance.transactions.filter((transaction) => transaction.type === 'gasto' && transaction.origin !== 'adjustment' && (transaction.category === catId || transaction.category === catName) && transaction.date.slice(0, 7) === today.slice(0, 7)).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    return spent > budget;
  });
  if (budgetOverruns.length) {
    const overrunNames = budgetOverruns.map((c) => (typeof c === 'string' ? c : c.name)).join(' · ');
    exceptions.push({ id: 'budget-overruns', title: `${budgetOverruns.length} presupuesto(s) excedidos`, detail: overrunNames, view: 'finanzas', tone: 'urgent' });
  }

  const soonExams = state.study.exams.filter((exam) => exam.status === 'pendiente' && exam.date >= today && daysBetween(today, exam.date) <= 14);
  const studiedRecently = state.study.studyLog.some((log) => daysBetween(log.date, today) <= 7);
  if (soonExams.length && !studiedRecently) exceptions.push({ id: 'exam-no-study', title: 'Examen cerca sin estudio reciente', detail: 'Hay un examen en los próximos 14 días y no registraste estudio esta semana.', view: 'estudios', tone: 'urgent' });

  if (!state.settings.lastBackupAt || daysBetween(state.settings.lastBackupAt, today) >= 7) exceptions.push({ id: 'backup', title: 'Backup pendiente', detail: 'Tu última copia tiene una semana o más.', view: 'config', tone: 'info' });
  return exceptions.filter((item) => isModuleEnabled(state, item.view));
}

export function reviewedThisWeek(state: LifeOSState, today = todayISO()): boolean {
  const lastReview = state.settings?.lastWeeklyReviewAt;
  if (!lastReview || typeof lastReview !== 'string') return false;
  const diff = daysBetween(lastReview, today);
  if (Number.isNaN(diff)) return false;
  return diff >= -1 && diff < 7;
}

export function isWeeklyReviewDue(state: LifeOSState, today = todayISO()): boolean {
  return !reviewedThisWeek(state, today);
}

export interface WeeklyReviewData {
  windowStart: string;
  windowEnd: string;
  tasks: {
    completed: { id: string; text: string; date: string }[];
    overdue: { id: string; text: string; date: string }[];
    totalCompleted: number;
    totalOverdue: number;
  };
  gym: {
    sessionsCount: number;
    sessions: { id: string; title: string; date: string; setsCount: number; volumeKg: number }[];
    totalVolumeKg: number;
    totalSets: number;
    currentWeight: number | null;
  };
  finances: {
    totalExpenses: number;
    totalIncome: number;
    netBalance: number;
    topCategories: { category: string; amount: number }[];
  };
  sleep: {
    loggedDays: number;
    avgHours: number | null;
    minHours: number | null;
    avgEnergy: number | null;
  };
  projects: {
    activeCount: number;
    active: { id: string; name: string; nextStep?: string; blockers?: string; reviewDate?: string }[];
    withBlockers: { id: string; name: string; blockers: string }[];
    overdueReview: { id: string; name: string; reviewDate: string }[];
    completedRecently: { id: string; name: string }[];
  };
  exceptions: ReviewException[];
}

export function gatherWeeklyReviewData(state: LifeOSState, today = todayISO()): WeeklyReviewData {
  const isInWindow = (dateStr: string) => {
    if (!dateStr) return false;
    const diff = daysBetween(dateStr, today);
    return diff >= 0 && diff < 7;
  };

  // Completed tasks from todayExtras + recurring tasks completed in taskLog
  const completedTodayExtras = (state.todayExtras || [])
    .filter((t) => t.done && isInWindow(t.date))
    .map((t) => ({ id: t.id, text: t.text, date: t.date }));

  const completedRecurringTasks: { id: string; text: string; date: string }[] = [];
  const recurringMap = new Map((state.tasksRecurring || []).map((t) => [t.id, t.name]));
  Object.entries(state.taskLog || {}).forEach(([dateStr, taskObj]) => {
    if (isInWindow(dateStr) && taskObj) {
      Object.entries(taskObj).forEach(([taskId, done]) => {
        if (done) {
          completedRecurringTasks.push({
            id: `${dateStr}-${taskId}`,
            text: recurringMap.get(taskId) || 'Tarea recurrente',
            date: dateStr,
          });
        }
      });
    }
  });

  const completedTasks = [...completedTodayExtras, ...completedRecurringTasks];

  const overdueTasks = (state.todayExtras || [])
    .filter((t) => !t.done && t.date < today)
    .map((t) => ({ id: t.id, text: t.text, date: t.date }));

  // Gym sessions
  const gymSessions = (state.gym.sessions || [])
    .filter((s) => isPerformedGymSession(s) && isInWindow(s.date))
    .map((s) => {
      const firstExercise = (s.exercises || [])[0]?.name;
      const title = s.weekLabel || firstExercise || 'Sesión de entrenamiento';
      return {
        id: s.id,
        title,
        date: s.date,
        setsCount: getCompletedGymSets(s).length,
        volumeKg: Math.round(getPerformedGymVolume(s)),
      };
    });

  const totalGymVolume = gymSessions.reduce((acc, cur) => acc + cur.volumeKg, 0);
  const totalGymSets = gymSessions.reduce((acc, cur) => acc + cur.setsCount, 0);
  const sortedWeight = [...(state.gym.weight || [])].sort((a, b) => b.date.localeCompare(a.date));
  const currentWeight = sortedWeight.length > 0 ? sortedWeight[0].kg : null;

  // Finances
  const windowTxs = (state.finance.transactions || []).filter(
    (t) => t.origin !== 'adjustment' && isInWindow(t.date)
  );
  let totalExpenses = 0;
  let totalIncome = 0;
  const categoryExpenses: Record<string, number> = {};

  windowTxs.forEach((t) => {
    const amt = Number(t.amount || 0);
    if (t.type === 'gasto') {
      totalExpenses += amt;
      const cat = getCategoryName(state.finance.categories, t.category) || 'Otros';
      categoryExpenses[cat] = (categoryExpenses[cat] || 0) + amt;
    } else if (t.type === 'ingreso') {
      totalIncome += amt;
    }
  });

  const topCategories = Object.entries(categoryExpenses)
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // Sleep & Habits
  const windowSleep = (state.dailyContext || []).filter(
    (c) => isInWindow(c.date) && typeof c.sleepHours === 'number' && c.sleepHours > 0
  );
  const avgHours =
    windowSleep.length > 0
      ? Number((windowSleep.reduce((acc, c) => acc + (c.sleepHours || 0), 0) / windowSleep.length).toFixed(1))
      : null;
  const minHours =
    windowSleep.length > 0
      ? Math.min(...windowSleep.map((c) => c.sleepHours || 0))
      : null;

  const windowEnergy = (state.dailyContext || []).filter(
    (c) => isInWindow(c.date) && typeof c.energy === 'number' && c.energy > 0
  );
  const avgEnergy =
    windowEnergy.length > 0
      ? Number((windowEnergy.reduce((acc, c) => acc + (c.energy || 0), 0) / windowEnergy.length).toFixed(1))
      : null;

  // Projects
  const allProjects = state.projects || [];
  const activeProjects = allProjects.filter((p) => p.status === 'activo');
  const withBlockers = activeProjects
    .filter((p) => Boolean(p.blockers && p.blockers.trim().length > 0))
    .map((p) => ({ id: p.id, name: p.name, blockers: p.blockers! }));
  const overdueReview = activeProjects
    .filter((p) => Boolean(p.reviewDate && p.reviewDate <= today))
    .map((p) => ({ id: p.id, name: p.name, reviewDate: p.reviewDate! }));
  const completedRecently = allProjects
    .filter((p) => p.status === 'completado' && p.updatedAt && isInWindow(p.updatedAt.slice(0, 10)))
    .map((p) => ({ id: p.id, name: p.name }));

  const exceptions = weeklyReviewExceptions(state);

  return {
    windowStart: '',
    windowEnd: today,
    tasks: {
      completed: completedTasks,
      overdue: overdueTasks,
      totalCompleted: completedTasks.length,
      totalOverdue: overdueTasks.length,
    },
    gym: {
      sessionsCount: gymSessions.length,
      sessions: gymSessions,
      totalVolumeKg: totalGymVolume,
      totalSets: totalGymSets,
      currentWeight,
    },
    finances: {
      totalExpenses: Math.round(totalExpenses),
      totalIncome: Math.round(totalIncome),
      netBalance: Math.round(totalIncome - totalExpenses),
      topCategories,
    },
    sleep: {
      loggedDays: windowSleep.length,
      avgHours,
      minHours,
      avgEnergy,
    },
    projects: {
      activeCount: activeProjects.length,
      active: activeProjects.map((p) => ({
        id: p.id,
        name: p.name,
        nextStep: p.nextStep,
        blockers: p.blockers,
        reviewDate: p.reviewDate,
      })),
      withBlockers,
      overdueReview,
      completedRecently,
    },
    exceptions,
  };
}

export function formatWeeklyReviewSummaryNote(
  data: WeeklyReviewData,
  learnings: string,
  nextWeekPriorities: string[],
  options?: { showGym?: boolean; showFinances?: boolean }
): string {
  const showGym = options?.showGym ?? true;
  const showFinances = options?.showFinances ?? true;
  const parts: string[] = [];
  parts.push(`📅 REVISIÓN SEMANAL (${data.windowEnd})`);
  parts.push('');
  parts.push('📊 HECHOS VERIFICADOS DE LOS ÚLTIMOS 7 DÍAS:');
  parts.push(`• Tareas completadas: ${data.tasks.totalCompleted} | Postergadas: ${data.tasks.totalOverdue}`);
  if (showGym) {
    parts.push(
      `• Gimnasio: ${data.gym.sessionsCount} sesiones (${data.gym.totalSets} series, ${data.gym.totalVolumeKg.toLocaleString()} kg volumen total)` +
        (data.gym.currentWeight ? ` · Peso actual: ${data.gym.currentWeight} kg` : '')
    );
  }
  if (showFinances) {
    parts.push(
      `• Finanzas: Gastos: $${data.finances.totalExpenses.toLocaleString()} | Ingresos: $${data.finances.totalIncome.toLocaleString()} | Balance neto: $${data.finances.netBalance.toLocaleString()}`
    );
    if (data.finances.topCategories.length > 0) {
      parts.push(
        `  Top gastos: ${data.finances.topCategories.map((c) => `${c.category} ($${c.amount})`).join(', ')}`
      );
    }
  }
  if (data.sleep.avgHours !== null) {
    parts.push(
      `• Descanso: Promedio ${data.sleep.avgHours} h/noche (${data.sleep.loggedDays} días registrados, mín: ${data.sleep.minHours} h)` +
        (data.sleep.avgEnergy ? ` · Energía: ${data.sleep.avgEnergy}/5` : '')
    );
  }
  parts.push(`• Proyectos activos: ${data.projects.activeCount}`);
  if (data.projects.withBlockers.length > 0) {
    parts.push(
      `  Bloqueos detectados: ${data.projects.withBlockers.map((b) => `${b.name} ("${b.blockers}")`).join('; ')}`
    );
  }
  if (data.projects.completedRecently.length > 0) {
    parts.push(
      `  Completados recientemente: ${data.projects.completedRecently.map((c) => c.name).join(', ')}`
    );
  }

  if (nextWeekPriorities.length > 0) {
    parts.push('');
    parts.push('🎯 PRIORIDADES PARA LA PRÓXIMA SEMANA:');
    nextWeekPriorities.forEach((p, idx) => {
      parts.push(`${idx + 1}. ${p}`);
    });
  }

  if (learnings.trim()) {
    parts.push('');
    parts.push('💡 APRENDIZAJES & CONCLUSIONES:');
    parts.push(learnings.trim());
  }

  return parts.join('\n');
}
