import type { Account, LifeOSState } from '../types';
import { hasRecordedContext } from './contextInsights';
import { isModuleEnabled } from './moduleVisibility';

/** Presentation eligibility only. Never infers dates or changes the underlying records. */
export function accountHasRecordedActivity(state: LifeOSState, account: Account): boolean {
  return Number(account.balance) !== 0 || Number(account.initialBalance || 0) !== 0
    || Boolean(account.lastReconciledAt)
    || state.finance.transactions.some((item) => item.accountId === account.id)
    || state.finance.transfers.some((item) => item.fromAccountId === account.id || item.toAccountId === account.id)
    || state.finance.reconciliations.some((item) => item.accountId === account.id);
}

function hasContent(state: LifeOSState, includeHidden: boolean): boolean {
  const enabled = (view: Parameters<typeof isModuleEnabled>[1]) => includeHidden || isModuleEnabled(state, view);
  const finance = state.finance;
  return state.todayExtras.length > 0 || state.dailyPriorities.length > 0
    || state.dailyContext.some(hasRecordedContext)
    || Object.values(state.taskLog).some((log) => Object.keys(log).length > 0)
    || Object.keys(state.checkoutLog || {}).length > 0
    || (enabled('agenda') && Object.values(state.agenda).some((blocks) => blocks.length > 0))
    || (enabled('calendario') && state.calendarEvents.length > 0)
    || (enabled('notas') && (state.projects.length > 0 || state.inbox.length > 0
      || Object.values(state.notes).some((items) => Array.isArray(items) && items.length > 0)))
    || (enabled('finanzas') && (finance.accounts.some((account) => accountHasRecordedActivity(state, account))
      || [finance.transactions, finance.transfers, finance.reconciliations, finance.debts,
        finance.investments, finance.subscriptions, finance.expectedIncomes, finance.commitments,
        finance.agreements].some((items) => items?.length > 0)
      || Object.values(finance.budgets).some((amount) => Number(amount) > 0)))
    || (enabled('gimnasio') && [state.gym.sessions, state.gym.weight, state.gym.measurements,
      state.gym.restDays].some((items) => items?.length > 0))
    || (enabled('estudios') && (state.study.exams.length > 0 || state.study.studyLog.length > 0))
    || (enabled('trabajo') && (state.jobs.applications.length > 0 || state.jobs.opportunities.length > 0))
    || (enabled('reventa') && (state.resale.inventory.length > 0 || state.resale.opportunities.length > 0));
}

export function hasReviewableActivity(state: LifeOSState): boolean {
  // Default routines, zero accounts, appearance and onboarding aren't evidence of use.
  return hasContent(state, false);
}

export function hasBackupContent(state: LifeOSState): boolean {
  // Hidden modules still contain information worth protecting. User-created plans also count.
  return hasContent(state, true) || state.inbox.length > 0 || state.ideas.length > 0
    || state.goals.length > 0 || state.gym.routineTemplates.length > 0 || state.study.subjects.length > 0
    || state.streaming.sessions.length > 0 || state.streaming.contentPipeline.length > 0
    || state.tasksRecurring.some((task) => {
      const defaults: Record<string, string> = {
        'Tender la cama': 'daily', 'Tomar 2L de agua': 'daily',
        'Repasar apuntes': '2-3x', 'Ordenar el cuarto': 'weekly',
      };
      return defaults[task.name] !== task.freq || Boolean(task.time || task.effort || task.days?.length);
    });
}
