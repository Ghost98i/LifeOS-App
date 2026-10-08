import type { LifeOSState } from '../types';
import { defaultState, normalizeStoredState } from './storage';
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
    case 'study': return { study: state.study };
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
  return normalizeStoredState(candidate);
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
  const candidate = { ...state, ...(mergedData as Partial<LifeOSState>) };
  if (module === 'gym' && candidate.gym) {
    candidate.gym = { ...candidate.gym, activeTimer: state.gym.activeTimer ?? null };
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
