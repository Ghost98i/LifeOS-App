/**
 * Dashboard & Finance Local Customization Preferences
 * Persists widget order, visibility, and display density locally in localStorage.
 * Does not touch cloud sync / E2EE schemas.
 */

export interface TodayCustomization {
  visibleWidgets: {
    focus: boolean;
    timeline: boolean;
    gym: boolean;
    finance: boolean;
    context: boolean;
    checklist: boolean;
    notes: boolean;
    review: boolean;
    activity: boolean;
    priorities?: boolean;
    nowNext?: boolean;
    gymStatus?: boolean;
    financeClarity?: boolean;
    pendingTasks?: boolean;
    recentNotes?: boolean;
    recentActivity?: boolean;
    radar?: boolean;
    quickBar?: boolean;
  };
  widgetOrder: string[]; // Order of widget keys
  density: 'compact' | 'comfortable';
}

export type TodayViewCustomization = TodayCustomization;

export interface FinanceCustomization {
  heroDisplayMode: 'actual_balance' | 'real_available' | 'both';
  showCommitmentsStrip: boolean;
  showCategoryBreakdown: boolean;
  density: 'compact' | 'comfortable';
  visibleSections?: {
    kpis?: boolean;
    budgets?: boolean;
    transactions?: boolean;
    accounts?: boolean;
    commitments?: boolean;
    futureHorizon?: boolean;
  };
  sectionOrder?: string[];
}

export type FinanceViewCustomization = FinanceCustomization;

const TODAY_CUSTOM_KEY = 'lifeos_custom_today_v1';
const FINANCE_CUSTOM_KEY = 'lifeos_custom_finance_v1';

export const DEFAULT_TODAY_CUSTOMIZATION: TodayCustomization = {
  visibleWidgets: {
    focus: true,
    timeline: true,
    gym: true,
    finance: true,
    context: true,
    checklist: true,
    notes: true,
    review: true,
    activity: true,
    priorities: true,
    nowNext: true,
    gymStatus: true,
    financeClarity: true,
    pendingTasks: true,
    recentNotes: true,
    recentActivity: true,
    radar: true,
    quickBar: true,
  },
  widgetOrder: ['focus', 'gym', 'finance', 'context', 'checklist', 'notes', 'review', 'activity'],
  density: 'comfortable',
};

export const DEFAULT_FINANCE_CUSTOMIZATION: FinanceCustomization = {
  heroDisplayMode: 'actual_balance',
  showCommitmentsStrip: true,
  showCategoryBreakdown: true,
  density: 'comfortable',
  visibleSections: {
    kpis: true,
    budgets: true,
    transactions: true,
    accounts: true,
    commitments: true,
    futureHorizon: true,
  },
  sectionOrder: ['kpis', 'budgets', 'transactions', 'accounts', 'commitments', 'futureHorizon'],
};

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  } catch {
    // Ignore restricted localStorage access
  }
  return null;
}

export function loadTodayCustomization(): TodayCustomization {
  try {
    const storage = getLocalStorage();
    if (!storage) return DEFAULT_TODAY_CUSTOMIZATION;
    const raw = storage.getItem(TODAY_CUSTOM_KEY);
    if (!raw) return DEFAULT_TODAY_CUSTOMIZATION;
    const parsed = JSON.parse(raw);
    const visible = { ...DEFAULT_TODAY_CUSTOMIZATION.visibleWidgets, ...(parsed.visibleWidgets || {}) };
    return {
      visibleWidgets: visible,
      widgetOrder: Array.isArray(parsed.widgetOrder) && parsed.widgetOrder.length > 0 ? parsed.widgetOrder : DEFAULT_TODAY_CUSTOMIZATION.widgetOrder,
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return DEFAULT_TODAY_CUSTOMIZATION;
  }
}

export function saveTodayCustomization(custom: TodayCustomization): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(TODAY_CUSTOM_KEY, JSON.stringify(custom));
    }
  } catch (e) {
    console.warn('Could not save today customization', e);
  }
}

export function loadFinanceCustomization(): FinanceCustomization {
  try {
    const storage = getLocalStorage();
    if (!storage) return DEFAULT_FINANCE_CUSTOMIZATION;
    const raw = storage.getItem(FINANCE_CUSTOM_KEY);
    if (!raw) return DEFAULT_FINANCE_CUSTOMIZATION;
    const parsed = JSON.parse(raw);
    return {
      heroDisplayMode: parsed.heroDisplayMode || 'actual_balance',
      showCommitmentsStrip: parsed.showCommitmentsStrip !== false,
      showCategoryBreakdown: parsed.showCategoryBreakdown !== false,
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      visibleSections: {
        ...DEFAULT_FINANCE_CUSTOMIZATION.visibleSections,
        ...(parsed.visibleSections || {}),
      },
      sectionOrder: parsed.sectionOrder || DEFAULT_FINANCE_CUSTOMIZATION.sectionOrder,
    };
  } catch {
    return DEFAULT_FINANCE_CUSTOMIZATION;
  }
}

export function saveFinanceCustomization(custom: FinanceCustomization): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(FINANCE_CUSTOM_KEY, JSON.stringify(custom));
    }
  } catch (e) {
    console.warn('Could not save finance customization', e);
  }
}
