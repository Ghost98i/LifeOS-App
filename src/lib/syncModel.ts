import type { LifeOSState } from '../types';
import { defaultState, hasMeaningfulData, normalizeStoredState } from './storage';
import { mergeModuleData, mergeModuleDataWithConflicts, detectModuleConflicts } from './syncMerge';

export const SYNC_MODULES = [
  'profile',
  'agenda',
  'tasks',
  'context',
  'finance',
  'gym',
  'study',
  'streaming',
  'jobs',
  'resale',
  'ideas',
  'calendar',
  'goals',
  'notes',
  'checkout',
] as const;

export type SyncModuleKey = typeof SYNC_MODULES[number];
export type SyncRevisionMap = Partial<Record<SyncModuleKey, string>>;
export type SyncBaselineMap = Partial<Record<SyncModuleKey, string>>;

export interface SyncConflictItem {
  id: string;
  module: SyncModuleKey;
  entityType: 'account' | 'budget' | 'entity' | 'delete_vs_modify';
  entityId: string;
  field?: string;
  label: string;
  localSummary: string;
  remoteSummary: string;
  baseSummary?: string;
  localValue: unknown;
  remoteValue: unknown;
  baseValue?: unknown;
}

export interface ModuleMergeResult<T = unknown> {
  data: T;
  conflicts: SyncConflictItem[];
}

export const SYNC_MODULE_LABELS: Record<SyncModuleKey, string> = {
  profile: 'Perfil y configuración',
  agenda: 'Agenda',
  tasks: 'Hoy y rutinas',
  context: 'Sueño y contexto personal',
  finance: 'Finanzas',
  gym: 'Gimnasio y cuerpo',
  study: 'Estudios',
  streaming: 'Streaming',
  jobs: 'Trabajo',
  resale: 'Reventa',
  ideas: 'Ideas',
  calendar: 'Calendario',
  goals: 'Objetivos',
  notes: 'Notas',
  checkout: 'Cierres del día',
};

export function isSyncModuleKey(value: unknown): value is SyncModuleKey {
  return typeof value === 'string' && (SYNC_MODULES as readonly string[]).includes(value);
}

export function syncModuleData(state: LifeOSState, module: SyncModuleKey): unknown {
  switch (module) {
    case 'profile': return { profile: state.profile, settings: state.settings };
    case 'agenda': return { agenda: state.agenda };
    case 'tasks': return {
      tasksRecurring: state.tasksRecurring,
      taskLog: state.taskLog,
      todayExtras: state.todayExtras,
      dailyPriorities: state.dailyPriorities,
      inbox: state.inbox || [],
    };
    case 'context': return { dailyContext: state.dailyContext };
    case 'finance': return { finance: state.finance };
    case 'gym': {
      const syncedGym = { ...state.gym };
      delete syncedGym.activeTimer;
      return { gym: syncedGym };
    }
    case 'study': {
      const syncedStudy = { ...state.study };
      delete syncedStudy.activeSession;
      delete syncedStudy.activePracticeSession;
      return { study: syncedStudy };
    }
    case 'streaming': return { streaming: state.streaming };
    case 'jobs': return { jobs: state.jobs };
    case 'resale': return { resale: state.resale };
    case 'ideas': return { ideas: state.ideas };
    case 'calendar': return { calendarEvents: state.calendarEvents };
    case 'goals': return { goals: state.goals, projects: state.projects || [] };
    case 'notes': return { notes: state.notes };
    case 'checkout': return { checkoutLog: state.checkoutLog };
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function extractPureModuleData(data: unknown): unknown {
  if (data && typeof data === 'object' && !Array.isArray(data) && '_tombstones' in data) {
    const copy = { ...(data as Record<string, unknown>) };
    delete copy._tombstones;
    return copy;
  }
  return data;
}

export function syncDataFingerprint(data: unknown): string {
  const pureData = extractPureModuleData(data);
  const input = stableStringify(pureData);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${input.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function syncModuleFingerprint(state: LifeOSState, module: SyncModuleKey): string {
  return syncDataFingerprint(syncModuleData(state, module));
}

export function applySyncModule(state: LifeOSState, module: SyncModuleKey, data: unknown): LifeOSState {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`El módulo sincronizado “${module}” no contiene datos válidos.`);
  }
  const pureData = extractPureModuleData(data);
  const candidate = { ...state, ...(pureData as Partial<LifeOSState>) };
  if (module === 'gym' && candidate.gym) {
    candidate.gym = { ...candidate.gym, activeTimer: state.gym.activeTimer ?? null };
  }
  if (module === 'study' && candidate.study) {
    candidate.study = {
      ...candidate.study,
      activeSession: state.study.activeSession ?? null,
      activePracticeSession: state.study.activePracticeSession ?? null,
    };
  }
  return normalizeStoredState(candidate);
}

function preserveLocalDailyContextWithRemoteNewDates(
  localDailyContext: LifeOSState['dailyContext'],
  remoteDailyContext: unknown[]
): LifeOSState['dailyContext'] {
  const localDates = new Set(localDailyContext.map((item) => item.date));
  const remoteOnly = remoteDailyContext.filter(
    (item: any) => item && typeof item === 'object' && typeof item.date === 'string' && !localDates.has(item.date)
  ) as LifeOSState['dailyContext'];
  if (remoteOnly.length === 0) return localDailyContext;
  return [...localDailyContext, ...remoteOnly].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeSyncModule(
  state: LifeOSState,
  module: SyncModuleKey,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): LifeOSState {
  if (!remoteData || typeof remoteData !== 'object' || Array.isArray(remoteData)) {
    throw new Error(`El módulo sincronizado “${module}” no contiene datos válidos.`);
  }
  const pureRemote = extractPureModuleData(remoteData);
  const pureBaseline = extractPureModuleData(baselineData);
  const localData = syncModuleData(state, module);
  const mergedData = mergeModuleData(module, localData, pureRemote, pureBaseline, tombstones);
  const candidate = { ...state, ...(mergedData as Partial<LifeOSState>) };
  if (module === 'gym' && candidate.gym) {
    candidate.gym = { ...candidate.gym, activeTimer: state.gym.activeTimer ?? null };
  }
  if (module === 'study' && candidate.study) {
    candidate.study = {
      ...candidate.study,
      activeSession: state.study.activeSession ?? null,
      activePracticeSession: state.study.activePracticeSession ?? null,
    };
  }
  if (module === 'context') {
    const localDailyContext = state.dailyContext || [];
    const remoteDailyContext = Array.isArray((pureRemote as any)?.dailyContext)
      ? (pureRemote as any).dailyContext
      : [];
    if (localDailyContext.length > remoteDailyContext.length) {
      candidate.dailyContext = preserveLocalDailyContextWithRemoteNewDates(localDailyContext, remoteDailyContext);
    }
  }
  return normalizeStoredState(candidate);
}

export function mergeSyncModuleWithConflicts(
  state: LifeOSState,
  module: SyncModuleKey,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): { state: LifeOSState; conflicts: SyncConflictItem[] } {
  if (!remoteData || typeof remoteData !== 'object' || Array.isArray(remoteData)) {
    throw new Error(`El módulo sincronizado “${module}” no contiene datos válidos.`);
  }
  const pureRemote = extractPureModuleData(remoteData);
  const pureBaseline = extractPureModuleData(baselineData);
  const localData = syncModuleData(state, module);
  const { data: mergedData, conflicts } = mergeModuleDataWithConflicts(module, localData, pureRemote, pureBaseline, tombstones);
  if ((module === 'resale' || module === 'gym' || module === 'finance') && conflicts.length > 0) return { state, conflicts };
  const candidate = { ...state, ...(mergedData as Partial<LifeOSState>) };
  if (module === 'gym' && candidate.gym) {
    candidate.gym = { ...candidate.gym, activeTimer: state.gym.activeTimer ?? null };
  }
  if (module === 'study' && candidate.study) {
    candidate.study = {
      ...candidate.study,
      activeSession: state.study.activeSession ?? null,
      activePracticeSession: state.study.activePracticeSession ?? null,
    };
  }
  if (module === 'context') {
    const localDailyContext = state.dailyContext || [];
    const remoteDailyContext = Array.isArray((pureRemote as any)?.dailyContext)
      ? (pureRemote as any).dailyContext
      : [];
    if (localDailyContext.length > remoteDailyContext.length) {
      candidate.dailyContext = preserveLocalDailyContextWithRemoteNewDates(localDailyContext, remoteDailyContext);
    }
  }
  return { state: normalizeStoredState(candidate), conflicts };
}

export function detectSyncModuleConflicts(
  state: LifeOSState,
  module: SyncModuleKey,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): SyncConflictItem[] {
  if (!remoteData || typeof remoteData !== 'object' || Array.isArray(remoteData)) return [];
  const pureRemote = extractPureModuleData(remoteData);
  const pureBaseline = extractPureModuleData(baselineData);
  const localData = syncModuleData(state, module);
  return detectModuleConflicts(module, localData, pureRemote, pureBaseline, tombstones);
}

export function buildStateFromModules(modules: Partial<Record<SyncModuleKey, unknown>>): LifeOSState {
  let state = defaultState();
  for (const module of SYNC_MODULES) {
    if (modules[module] !== undefined) state = applySyncModule(state, module, modules[module]);
  }
  return state;
}

export function changedSyncModules(before: LifeOSState, after: LifeOSState): SyncModuleKey[] {
  return SYNC_MODULES.filter((module) => (
    syncModuleFingerprint(before, module) !== syncModuleFingerprint(after, module)
  ));
}

export function classifyInitialModuleChanges(
  localState: LifeOSState,
  remoteState: LifeOSState,
  knownRevisions: SyncRevisionMap,
  baselines: SyncBaselineMap,
  remoteRevisions: SyncRevisionMap,
): { local: SyncModuleKey[]; remote: SyncModuleKey[]; conflicts: SyncModuleKey[] } {
  const result = { local: [] as SyncModuleKey[], remote: [] as SyncModuleKey[], conflicts: [] as SyncModuleKey[] };
  changedSyncModules(localState, remoteState).forEach((module) => {
    const localChanged = syncModuleFingerprint(localState, module) !== baselines[module];
    const remoteMoved = remoteRevisions[module] !== knownRevisions[module];
    if (localChanged && remoteMoved) result.conflicts.push(module);
    else if (localChanged) result.local.push(module);
    else result.remote.push(module);
  });
  return result;
}

export function equivalentLifeOSState(a: LifeOSState, b: LifeOSState): boolean {
  return SYNC_MODULES.every((module) => (
    syncModuleFingerprint(a, module) === syncModuleFingerprint(b, module)
  ));
}

/**
 * Human-facing module label for conflict and privacy UI.
 * Avoids internal keys (`resale`, `tasks`, `context`, `checkout`) completely.
 */
export function getHumanModuleLabel(module: SyncModuleKey): string {
  if (module === 'resale') return 'Mi negocio';
  return SYNC_MODULE_LABELS[module] ?? module;
}

/**
 * Distinguishes real user-authored content from a brand-new, empty, or
 * onboarding-only device state (e.g. only profile name, onboardingCompleted,
 * hiddenTabs, darkMode, or privacyMode changed, with zero user records).
 *
 * Used to guarantee zero phantom conflicts when signing in with Google on a
 * fresh or clean device without prior sync baselines.
 */
export function hasRealLocalUserData(state: LifeOSState): boolean {
  if (!state) return false;
  const def = defaultState();
  const agendaHasData = state.agenda
    ? Object.values(state.agenda).some((blocks) => Array.isArray(blocks) && blocks.length > 0)
    : false;
  const recurringSignature = (items: LifeOSState['tasksRecurring']) =>
    (items || []).map(({ name, freq, days }) => ({ name, freq, days: days || [] }));
  const recurringModified =
    JSON.stringify(recurringSignature(state.tasksRecurring)) !==
    JSON.stringify(recurringSignature(def.tasksRecurring));

  const accounts = state.finance?.accounts || [];
  const accountsAreDefaultEmpty =
    accounts.length === 0 ||
    (accounts.length === 2 &&
      accounts[0]?.name === 'Efectivo' &&
      accounts[1]?.name === 'Banco' &&
      accounts.every((account) => Number(account.balance || 0) === 0 && Number(account.initialBalance || 0) === 0));

  const hasNonZeroBudget = Object.keys(state.finance?.budgets || {}).some(
    (key) => Number(state.finance?.budgets?.[key]) !== 0
  );
  const hasMonthlyBudgets = Object.keys(state.finance?.monthlyBudgets || {}).length > 0;
  const hasCommercial = Boolean(
    state.resale && Object.prototype.hasOwnProperty.call(state.resale, 'commercial')
  );

  const collections = [
    state.todayExtras || [],
    state.dailyPriorities || [],
    state.dailyContext || [],
    state.finance?.transactions || [],
    state.finance?.transfers || [],
    state.finance?.reconciliations || [],
    state.finance?.debts || [],
    state.finance?.investments || [],
    state.finance?.subscriptions || [],
    state.finance?.expectedIncomes || [],
    state.finance?.commitments || [],
    state.finance?.agreements || [],
    state.gym?.weight || [],
    state.gym?.measurements || [],
    state.gym?.sessions || [],
    state.gym?.routineTemplates || [],
    state.gym?.restDays || [],
    state.study?.subjects || [],
    state.study?.exams || [],
    state.study?.studyLog || [],
    state.study?.questions || [],
    state.study?.practiceAttempts || [],
    state.streaming?.sessions || [],
    state.streaming?.contentPipeline || [],
    state.jobs?.opportunities || [],
    state.jobs?.applications || [],
    state.resale?.opportunities || [],
    state.resale?.inventory || [],
    state.ideas || [],
    state.calendarEvents || [],
    state.goals || [],
    state.projects || [],
    state.inbox || [],
    state.notes?.postits || [],
    state.notes?.shopping || [],
    state.notes?.links || [],
    state.notes?.possessions || [],
  ];

  return Boolean(
    hasCommercial ||
      agendaHasData ||
      recurringModified ||
      !accountsAreDefaultEmpty ||
      hasNonZeroBudget ||
      hasMonthlyBudgets ||
      collections.some((items) => items.length > 0) ||
      Object.keys(state.checkoutLog || {}).length > 0 ||
      Object.keys(state.taskLog || {}).length > 0
  );
}

/**
 * True when the local device has no real user content (empty template or only
 * onboarding/UI preferences like name, hiddenTabs, or darkMode).
 */
export function isCleanOrOnboardingOnlyState(state: LifeOSState): boolean {
  return !hasRealLocalUserData(state);
}

export type InitialSyncDecision =
  | { action: 'download_remote'; cleanDeviceAutoDownload: boolean }
  | { action: 'upload_local' }
  | { action: 'conflict_unpaired'; changedModules: SyncModuleKey[] }
  | {
      action: 'reconcile_paired';
      local: SyncModuleKey[];
      remote: SyncModuleKey[];
      conflicts: SyncModuleKey[];
    }
  | { action: 'already_synced' };

/**
 * Pure decision engine for initial cloud reconciliation when a user signs in.
 * Guarantees that a fresh or onboarding-only device with no prior sync baseline
 * automatically downloads cloud data with zero phantom conflicts.
 */
export function decideInitialSyncAction(params: {
  localState: LifeOSState;
  remoteState: LifeOSState;
  paired: boolean;
  knownRevisions: SyncRevisionMap;
  baselines: SyncBaselineMap;
  remoteRevisions: SyncRevisionMap;
  needsMigration?: boolean;
}): InitialSyncDecision {
  const {
    localState,
    remoteState,
    paired,
    knownRevisions,
    baselines,
    remoteRevisions,
    needsMigration = false,
  } = params;

  const statesDiffer = !equivalentLifeOSState(localState, remoteState);
  const localHasRealData = hasRealLocalUserData(localState);
  const remoteHasData = hasMeaningfulData(remoteState);

  if (!paired) {
    // Clean / onboarding-only device: NEVER trigger a phantom conflict.
    if (!localHasRealData) {
      if (remoteHasData) {
        return { action: 'download_remote', cleanDeviceAutoDownload: true };
      }
      return { action: 'upload_local' };
    }

    // Local device has real user-created content.
    if (!remoteHasData) {
      return { action: 'upload_local' };
    }
    if (!statesDiffer) {
      return { action: 'already_synced' };
    }
    return {
      action: 'conflict_unpaired',
      changedModules: changedSyncModules(localState, remoteState),
    };
  }

  // Paired device with known sync baseline.
  if (statesDiffer && !needsMigration) {
    const classification = classifyInitialModuleChanges(
      localState,
      remoteState,
      knownRevisions,
      baselines,
      remoteRevisions
    );
    return {
      action: 'reconcile_paired',
      local: classification.local,
      remote: classification.remote,
      conflicts: classification.conflicts,
    };
  }

  if (localHasRealData && !remoteHasData) {
    return { action: 'upload_local' };
  }
  if (remoteHasData) {
    return { action: 'download_remote', cleanDeviceAutoDownload: false };
  }
  return { action: 'upload_local' };
}
