import type { LifeOSState } from '../types';
import { isModuleEnabled } from './moduleVisibility';

export interface DashboardLayoutContext {
  showGymCard: boolean;
  showFinanceCard: boolean;
  showNotesCard: boolean;
  showActivityCard: boolean;
  showRadarCard: boolean;
  showTimelineBar: boolean;
  primaryModulesCount: number;
  secondaryModulesCount: number;
  useBalancedSplit: boolean;
  leftColSpanClass: string;
  rightColSpanClass: string;
}

export interface DashboardLayoutOptions {
  hasActiveNotes?: boolean;
  hasRecentActivity?: boolean;
  hasUrgentAlerts?: boolean;
  hasFinanceData?: boolean;
}

/**
 * Computes the adaptive layout configuration and widget visibility rules for Hoy (DashboardView).
 * 
 * Rules:
 * 1. Universal Core widgets (TodayFocus, Checklist, PersonalContext, WeeklyReview) always render.
 * 2. Optional modules only render when their module is active (respecting isModuleEnabled).
 * 3. Contextual cards only render when they have meaningful content:
 *    - Notes card requires active (unarchived) notes.
 *    - Recent Activity card requires at least 1 recent event.
 *    - Radar card requires urgent actionable alerts (e.g. exams in <=7d, overdue followups, unreviewed resale).
 * 4. Responsive density balance:
 *    - Computes density across both columns (primaryModulesCount on left vs secondaryModulesCount on right).
 *    - Balanced 50/50 (6/6) split is used when both sides have low, symmetric density:
 *      left has 0 optional modules (only TodayFocus + Checklist) and right has at most 1 optional module
 *      (e.g. 0 modules, only Finance, only Notes, Notes+Estudios).
 *    - Asymmetric 7/5 split (lg:col-span-7 / lg:col-span-5) is used when the left column is heavier
 *      (Gym is active: 3 cards on left, compressing Checklist) or the right column is dense
 *      (2 or more secondary modules).
 */
export function getDashboardLayout(
  state: LifeOSState,
  options?: DashboardLayoutOptions
): DashboardLayoutContext {
  const showGymCard = isModuleEnabled(state, 'gimnasio');
  const showTimelineBar = isModuleEnabled(state, 'agenda');

  const showFinanceCard = isModuleEnabled(state, 'finanzas') && (options?.hasFinanceData ?? true);

  const showNotesCard = isModuleEnabled(state, 'notas') && (
    options?.hasActiveNotes ?? (state.notes?.postits || []).some((n) => !n.archived)
  );

  const showActivityCard = (options?.hasRecentActivity ?? false);
  const showRadarCard = (options?.hasUrgentAlerts ?? false);

  const primaryModulesCount = showGymCard ? 1 : 0;
  const secondaryModulesCount =
    (showFinanceCard ? 1 : 0) +
    (showNotesCard ? 1 : 0) +
    (showActivityCard ? 1 : 0);

  const useBalancedSplit = primaryModulesCount === 0 && secondaryModulesCount <= 1;

  return {
    showGymCard,
    showFinanceCard,
    showNotesCard,
    showActivityCard,
    showRadarCard,
    showTimelineBar,
    primaryModulesCount,
    secondaryModulesCount,
    useBalancedSplit,
    leftColSpanClass: useBalancedSplit ? 'lg:col-span-6' : 'lg:col-span-7',
    rightColSpanClass: useBalancedSplit ? 'lg:col-span-6' : 'lg:col-span-5',
  };
}
