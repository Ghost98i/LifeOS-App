import type { LifeOSState, ViewType } from '../types';
import { daysBetween, todayISO } from './storage';
import { sleepSummary } from './contextInsights';

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
    const budget = Number(state.finance.budgets[category] || 0);
    if (!budget) return false;
    const spent = state.finance.transactions.filter((transaction) => transaction.type === 'gasto' && transaction.origin !== 'adjustment' && transaction.category === category && transaction.date.slice(0, 7) === today.slice(0, 7)).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    return spent > budget;
  });
  if (budgetOverruns.length) exceptions.push({ id: 'budget-overruns', title: `${budgetOverruns.length} presupuesto(s) excedidos`, detail: budgetOverruns.join(' · '), view: 'finanzas', tone: 'urgent' });

  const soonExams = state.study.exams.filter((exam) => exam.status === 'pendiente' && exam.date >= today && daysBetween(today, exam.date) <= 14);
  const studiedRecently = state.study.studyLog.some((log) => daysBetween(log.date, today) <= 7);
  if (soonExams.length && !studiedRecently) exceptions.push({ id: 'exam-no-study', title: 'Examen cerca sin estudio reciente', detail: 'Hay un examen en los próximos 14 días y no registraste estudio esta semana.', view: 'estudios', tone: 'urgent' });

  if (!state.settings.lastBackupAt || daysBetween(state.settings.lastBackupAt, today) >= 7) exceptions.push({ id: 'backup', title: 'Backup pendiente', detail: 'Tu última copia tiene una semana o más.', view: 'config', tone: 'info' });
  return exceptions;
}

export function reviewedThisWeek(state: LifeOSState): boolean {
  return Boolean(state.settings.lastWeeklyReviewAt && daysBetween(state.settings.lastWeeklyReviewAt, todayISO()) < 7);
}
