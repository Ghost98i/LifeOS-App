import type { SyncModuleKey, SyncRevisionMap } from './syncModel';

export interface ResaleConflictRecord {
  id: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
  diagnostic: string;
  modules: SyncModuleKey[];
  local: Partial<Record<SyncModuleKey, unknown>>;
  base: Partial<Record<SyncModuleKey, unknown>>;
  baseRevisions: SyncRevisionMap;
  remoteVersions: Array<{
    data: Partial<Record<SyncModuleKey, unknown>>;
    revisions: SyncRevisionMap;
  }>;
  reconciledModules?: SyncModuleKey[];
  backupConfirmedAt?: string;
}

type LoadResult =
  | { status: 'none' }
  | { status: 'loaded'; record: ResaleConflictRecord }
  | { status: 'resolved'; record: ResaleConflictRecord }
  | { status: 'unavailable' | 'corrupt' };

const keyFor = (userId: string) => `lifeos-resale-conflict-v1:${userId}`;

export function loadResaleConflict(userId: string, storage: Pick<Storage, 'getItem'> = localStorage): LoadResult {
  try {
    const raw = storage.getItem(keyFor(userId));
    if (raw === null) return { status: 'none' };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return { status: 'corrupt' };
    const record = value as Partial<ResaleConflictRecord>;
    if (typeof record.id !== 'string' || (record.status !== 'pending' && record.status !== 'resolved') ||
        !Array.isArray(record.modules) || !record.modules.includes('resale') ||
        !record.local || typeof record.local !== 'object' ||
        !record.base || typeof record.base !== 'object' ||
        !record.baseRevisions || typeof record.baseRevisions !== 'object' ||
        !Array.isArray(record.remoteVersions)) return { status: 'corrupt' };
    return { status: record.status === 'pending' ? 'loaded' : 'resolved', record: record as ResaleConflictRecord };
  } catch {
    return { status: 'unavailable' };
  }
}

export function saveResaleConflict(
  userId: string,
  record: ResaleConflictRecord,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): boolean {
  try {
    const serialized = JSON.stringify(record);
    storage.setItem(keyFor(userId), serialized);
    return storage.getItem(keyFor(userId)) === serialized;
  } catch {
    return false;
  }
}

export function addRemoteResaleVersion(
  record: ResaleConflictRecord,
  data: Partial<Record<SyncModuleKey, unknown>>,
  revisions: SyncRevisionMap
): ResaleConflictRecord {
  const version = { data: structuredClone(data), revisions: { ...revisions } };
  if (record.remoteVersions.some((existing) => JSON.stringify(existing) === JSON.stringify(version))) return record;
  return { ...record, remoteVersions: [...record.remoteVersions, version] };
}

export function includeResaleConflictModules(
  record: ResaleConflictRecord,
  modules: SyncModuleKey[],
  local: Partial<Record<SyncModuleKey, unknown>>,
  base: Partial<Record<SyncModuleKey, unknown>>,
  baseRevisions: SyncRevisionMap,
): ResaleConflictRecord {
  const added = modules.filter((module) => !record.modules.includes(module));
  if (added.length === 0) return record;
  return {
    ...record,
    modules: [...record.modules, ...added],
    local: { ...record.local, ...structuredClone(Object.fromEntries(added.map((module) => [module, local[module]]))) },
    base: { ...record.base, ...structuredClone(Object.fromEntries(added.filter((module) => module in base).map((module) => [module, base[module]]))) },
    baseRevisions: { ...record.baseRevisions, ...Object.fromEntries(added.filter((module) => module in baseRevisions).map((module) => [module, baseRevisions[module]])) },
  };
}
