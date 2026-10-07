import type {
  Account,
  AccountReconciliation,
  AgendaBlock,
  AgendaWeek,
  CalendarEvent,
  CheckoutLogDay,
  DailyContextEntry,
  DailyPriority,
  DayKey,
  Exercise,
  Finance,
  FinanceTransfer,
  Goal,
  Gym,
  GymSession,
  GymSet,
  Idea,
  InboxItem,
  JobApplication,
  JobOpportunity,
  Jobs,
  LifeOSState,
  MeasurementPoint,
  Notes,
  PossessionItem,
  Postit,
  Profile,
  Project,
  ProjectTask,
  Resale,
  ResaleItem,
  ResaleOpportunity,
  Settings,
  ShoppingItem,
  Streaming,
  StreamChecklistItem,
  StreamContentPipelineItem,
  StreamSession,
  Study,
  StudyLog,
  Subject,
  TaskRecurring,
  TodayExtra,
  Transaction,
  UsefulLink,
  WeightPoint,
  FinanceCategory,
} from '../types';
import type { SyncModuleKey, SyncConflictItem, ModuleMergeResult } from './syncModel';
import { normalizeCategories } from './financeCategories';
import { compareLedgerEvents, reconstructAccountBalance } from './financeLedger';
import { financeRevisionMillis, parseFinanceRevisionOrder } from './financeRevision';

const TOMBSTONE_PREFIX = 'lifeos-cloud-tombstones-v2:';
const DEFAULT_MAX_TOMBSTONE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function loadTombstones(userId: string): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${TOMBSTONE_PREFIX}${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTombstones(userId: string, tombstones: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${TOMBSTONE_PREFIX}${userId}`, JSON.stringify(tombstones));
  } catch {
    // Ignore storage quota errors
  }
}

export function pruneTombstones(
  tombstones: Record<string, number>,
  maxAgeMs = DEFAULT_MAX_TOMBSTONE_AGE_MS
): Record<string, number> {
  const threshold = Date.now() - maxAgeMs;
  const pruned: Record<string, number> = {};
  for (const [id, ts] of Object.entries(tombstones)) {
    if (ts > threshold) {
      pruned[id] = ts;
    }
  }
  return pruned;
}

export function recordEntityDeletion(
  userId: string,
  entityId: string,
  timestamp = Date.now()
): void {
  const current = loadTombstones(userId);
  current[entityId] = Math.max(current[entityId] || 0, timestamp);
  const pruned = pruneTombstones(current);
  saveTombstones(userId, pruned);
}

export function recordEntityDeletions(
  userId: string,
  entityIds: string[],
  timestamp = Date.now()
): void {
  if (!entityIds.length) return;
  const current = loadTombstones(userId);
  for (const id of entityIds) {
    current[id] = Math.max(current[id] || 0, timestamp);
  }
  const pruned = pruneTombstones(current);
  saveTombstones(userId, pruned);
}

function collectEntityIds(state: LifeOSState): Set<string> {
  const ids = new Set<string>();
  const add = (items?: Array<{ id?: string }>) => {
    if (!items) return;
    for (const it of items) {
      if (it && typeof it.id === 'string') ids.add(it.id);
    }
  };

  if (state.finance) {
    add(state.finance.transactions);
    add(state.finance.transfers);
    add(state.finance.debts);
    add(state.finance.investments);
    add(state.finance.subscriptions);
    add(state.finance.expectedIncomes);
    add(state.finance.commitments);
    add(state.finance.reconciliations);
    add(state.finance.accounts);
    add(state.finance.categories);
  }

  if (state.gym) {
    add(state.gym.sessions);
    add(state.gym.routineTemplates);
    if (state.gym.sessions) {
      for (const sess of state.gym.sessions) {
        if (sess.exercises) {
          for (const ex of sess.exercises) {
            if (ex.id) ids.add(ex.id);
            if (ex.sets) add(ex.sets);
          }
        }
      }
    }
  }

  add(state.tasksRecurring);
  add(state.todayExtras);
  add(state.dailyPriorities);
  add(state.inbox);

  if (state.agenda) {
    for (const day of Object.values(state.agenda)) {
      add(day);
    }
  }

  if (state.notes) {
    add(state.notes.postits);
    add(state.notes.shopping);
    add(state.notes.links);
    add(state.notes.possessions);
  }

  add(state.goals);
  add(state.projects);
  if (state.projects) {
    for (const p of state.projects) {
      if (p.tasks) add(p.tasks);
    }
  }

  add(state.calendarEvents);

  if (state.study) {
    add(state.study.subjects);
    add(state.study.exams);
    add(state.study.studyLog);
  }

  if (state.streaming) {
    add(state.streaming.sessions);
    add(state.streaming.preStreamChecklist);
    add(state.streaming.contentPipeline);
  }

  if (state.jobs) {
    add(state.jobs.opportunities);
    add(state.jobs.applications);
  }

  if (state.resale) {
    add(state.resale.opportunities);
    add(state.resale.inventory);
  }

  add(state.ideas);

  return ids;
}

export function detectDeletedEntityIds(previous: LifeOSState, next: LifeOSState): string[] {
  const prevIds = collectEntityIds(previous);
  const nextIds = collectEntityIds(next);
  const deleted: string[] = [];
  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      deleted.push(id);
    }
  }
  return deleted;
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function extractTimestamp(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;
  const obj = item as Record<string, unknown>;
  if (typeof obj.updatedAt === 'number') return obj.updatedAt;
  if (typeof obj.updatedAt === 'string') {
    const t = new Date(obj.updatedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof obj.clientUpdatedAt === 'number') return obj.clientUpdatedAt;
  if (typeof obj.completedAt === 'string') {
    const t = new Date(obj.completedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof obj.finishedAt === 'string') {
    const t = new Date(obj.finishedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof obj.date === 'string') {
    const t = new Date(obj.date).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof obj.createdAt === 'string') {
    const t = new Date(obj.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/**
 * Merges two arrays of entities with string IDs using 3-Way Merge with LWW and Tombstones.
 */
export function mergeEntityCollection<T extends { id: string }>(
  local: T[] = [],
  remote: T[] = [],
  baseline?: T[],
  tombstones: Record<string, number> = {},
  customMergeSame?: (localItem: T, remoteItem: T, baseItem?: T) => T,
  onConflict?: (conflict: SyncConflictItem) => void,
  moduleContext?: { module: SyncModuleKey; entityType: string; getLabel?: (item: T) => string }
): T[] {
  const localMap = new Map<string, T>(local.map((item) => [item.id, item]));
  const remoteMap = new Map<string, T>(remote.map((item) => [item.id, item]));
  const baseMap = baseline ? new Map<string, T>(baseline.map((item) => [item.id, item])) : null;

  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  if (baseMap) {
    for (const id of baseMap.keys()) {
      allIds.add(id);
    }
  }

  const result: T[] = [];

  for (const id of allIds) {
    const inLocal = localMap.get(id);
    const inRemote = remoteMap.get(id);
    const inBase = baseMap?.get(id);
    const tombstoneTime = tombstones[id] || 0;

    // Case 1: Exists in both Local and Remote
    if (inLocal && inRemote) {
      if (stableEqual(inLocal, inRemote)) {
        result.push(inLocal);
        continue;
      }
      if (inBase) {
        if (stableEqual(inLocal, inBase)) {
          // Local didn't touch it, Remote did -> remote wins
          result.push(inRemote);
          continue;
        }
        if (stableEqual(inRemote, inBase)) {
          // Remote didn't touch it, Local did -> local wins
          result.push(inLocal);
          continue;
        }
      }

      // Both changed or no baseline
      if (customMergeSame) {
        result.push(customMergeSame(inLocal, inRemote, inBase));
      } else {
        if (inBase && !stableEqual(inLocal, inBase) && !stableEqual(inRemote, inBase) && onConflict && moduleContext) {
          const label = moduleContext.getLabel ? moduleContext.getLabel(inLocal) : (inLocal as any).name || (inLocal as any).title || (inLocal as any).text || id;
          onConflict({
            id: `conflict-${moduleContext.module}-${id}`,
            module: moduleContext.module,
            entityType: 'entity',
            entityId: id,
            label: `${moduleContext.entityType}: ${label}`,
            localSummary: String((inLocal as any).name || (inLocal as any).title || (inLocal as any).text || 'Modificado local'),
            remoteSummary: String((inRemote as any).name || (inRemote as any).title || (inRemote as any).text || 'Modificado remoto'),
            baseSummary: inBase ? String((inBase as any).name || (inBase as any).title || (inBase as any).text || 'Base') : undefined,
            localValue: inLocal,
            remoteValue: inRemote,
            baseValue: inBase,
          });
        }
        const localTs = extractTimestamp(inLocal);
        const remoteTs = extractTimestamp(inRemote);
        if (remoteTs > localTs) {
          result.push(inRemote);
        } else if (localTs > remoteTs) {
          result.push(inLocal);
        } else {
          // Shallow merge preferring remote for non-empty fields or local
          result.push({ ...inLocal, ...inRemote });
        }
      }
      continue;
    }

    // Case 2: Exists in Local, NOT in Remote
    if (inLocal && !inRemote) {
      if (inBase) {
        // Was known to both before, but Remote dropped/deleted it
        if (stableEqual(inLocal, inBase)) {
          // Local never modified it -> honor Remote deletion
          continue;
        }
        // Local modified it after baseline -> preserve local modification & record delete vs modify conflict
        if (onConflict && moduleContext) {
          const label = moduleContext.getLabel ? moduleContext.getLabel(inLocal) : (inLocal as any).name || (inLocal as any).title || (inLocal as any).text || id;
          onConflict({
            id: `conflict-del-${moduleContext.module}-${id}`,
            module: moduleContext.module,
            entityType: 'delete_vs_modify',
            entityId: id,
            label: `${moduleContext.entityType}: ${label}`,
            localSummary: 'Modificado en este dispositivo',
            remoteSummary: 'Eliminado en remoto',
            baseSummary: 'Existía en base',
            localValue: inLocal,
            remoteValue: null,
            baseValue: inBase,
          });
        }
        result.push(inLocal);
        continue;
      }
      // Not in baseline: Local newly created it -> preserve
      result.push(inLocal);
      continue;
    }

    // Case 3: Exists in Remote, NOT in Local
    if (!inLocal && inRemote) {
      if (inBase) {
        if (!stableEqual(inRemote, inBase)) {
          // Remote modified it after baseline -> preserve remote modification & record delete vs modify conflict
          if (onConflict && moduleContext) {
            const label = moduleContext.getLabel ? moduleContext.getLabel(inRemote) : (inRemote as any).name || (inRemote as any).title || (inRemote as any).text || id;
            onConflict({
              id: `conflict-del-${moduleContext.module}-${id}`,
              module: moduleContext.module,
              entityType: 'delete_vs_modify',
              entityId: id,
              label: `${moduleContext.entityType}: ${label}`,
              localSummary: 'Eliminado en este dispositivo',
              remoteSummary: 'Modificado en remoto',
              baseSummary: 'Existía en base',
              localValue: null,
              remoteValue: inRemote,
              baseValue: inBase,
            });
          }
          result.push(inRemote);
          continue;
        }
        // Remote never modified it, and Local dropped it -> honor deletion
        continue;
      }
      const remoteTs = extractTimestamp(inRemote);
      if (tombstoneTime > 0 && tombstoneTime >= remoteTs) {
        // Local explicitly deleted it, and remote item is not newer than deletion -> keep deleted
        continue;
      }
      // Remote newly created it -> add to result
      result.push(inRemote);
      continue;
    }

    // Case 4: Absent in both, but was in baseline -> deleted by both, ignore
  }

  return result.sort((a, b) => {
    const aDate = (a as any).date || (a as any).createdAt || '';
    const bDate = (b as any).date || (b as any).createdAt || '';
    if (aDate && bDate && aDate !== bDate) {
      return String(bDate).localeCompare(String(aDate));
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Merges items keyed by a 'date' string (like WeightPoint, MeasurementPoint, DailyContextEntry).
 */
export function mergeDateCollection<T extends { date: string }>(
  local: T[] = [],
  remote: T[] = [],
  baseline?: T[],
  customMergeSame?: (localItem: T, remoteItem: T, baseItem?: T) => T
): T[] {
  const localMap = new Map<string, T>(local.map((item) => [item.date, item]));
  const remoteMap = new Map<string, T>(remote.map((item) => [item.date, item]));
  const baseMap = baseline ? new Map<string, T>(baseline.map((item) => [item.date, item])) : null;

  const allDates = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  if (baseMap) {
    for (const d of baseMap.keys()) {
      allDates.add(d);
    }
  }

  const result: T[] = [];

  for (const date of allDates) {
    const inLocal = localMap.get(date);
    const inRemote = remoteMap.get(date);
    const inBase = baseMap?.get(date);

    if (inLocal && inRemote) {
      if (stableEqual(inLocal, inRemote)) {
        result.push(inLocal);
        continue;
      }
      if (inBase) {
        if (stableEqual(inLocal, inBase)) {
          result.push(inRemote);
          continue;
        }
        if (stableEqual(inRemote, inBase)) {
          result.push(inLocal);
          continue;
        }
      }
      if (customMergeSame) {
        result.push(customMergeSame(inLocal, inRemote, inBase));
      } else {
        result.push({ ...inBase, ...inLocal, ...inRemote });
      }
      continue;
    }

    if (inLocal && !inRemote) {
      if (inBase && stableEqual(inLocal, inBase)) continue;
      result.push(inLocal);
      continue;
    }

    if (!inLocal && inRemote) {
      if (inBase && stableEqual(inRemote, inBase)) continue;
      result.push(inRemote);
      continue;
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ==========================================
// MODULE-SPECIFIC MERGE FUNCTIONS
// ==========================================

type VersionedFinanceEvent = Transaction | FinanceTransfer | AccountReconciliation;

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
}

function financeVersionKey<T extends VersionedFinanceEvent>(item: T, baseline?: T): string {
  if (parseFinanceRevisionOrder(item.revisionOrder)) return `2:${item.revisionOrder}`;
  const changedFromBaseline = !baseline || canonicalStringify(item) !== canonicalStringify(baseline);
  return `${changedFromBaseline ? 1 : 0}:${canonicalStringify(item)}`;
}

function chooseFinanceVersion<T extends VersionedFinanceEvent>(a: T, b: T, baseline?: T): T {
  const aKey = financeVersionKey(a, baseline);
  const bKey = financeVersionKey(b, baseline);
  if (aKey !== bKey) return aKey > bKey ? a : b;
  return canonicalStringify(a) >= canonicalStringify(b) ? a : b;
}

function tombstoneSupersedesFinanceVersion(item: VersionedFinanceEvent, tombstoneTime: number): boolean {
  if (!(tombstoneTime > 0)) return false;
  const revisionMillis = financeRevisionMillis(item.revisionOrder);
  return revisionMillis === 0 || tombstoneTime >= revisionMillis;
}

function mergeFinanceEventCollection<T extends VersionedFinanceEvent>(
  kind: 'transaction' | 'transfer' | 'reconciliation',
  local: T[] = [],
  remote: T[] = [],
  baseline: T[] | undefined,
  tombstones: Record<string, number>,
  onConflict?: (conflict: SyncConflictItem) => void,
  label = 'Evento financiero',
): T[] {
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const baseMap = new Map((baseline || []).map((item) => [item.id, item]));
  const ids = [...new Set([...localMap.keys(), ...remoteMap.keys(), ...baseMap.keys()])].sort();
  const result: T[] = [];

  for (const id of ids) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);
    const baseItem = baseMap.get(id);
    const tombstoneTime = tombstones[id] || 0;
    const candidates = [localItem, remoteItem].filter((item): item is T => (
      Boolean(item) && !tombstoneSupersedesFinanceVersion(item as T, tombstoneTime)
    ));

    if (candidates.length === 0) continue;
    if (candidates.length === 1) {
      const candidate = candidates[0];
      const otherSideDeleted = Boolean(baseItem) && (!localItem || !remoteItem);
      if (otherSideDeleted && tombstoneTime === 0 && canonicalStringify(candidate) === canonicalStringify(baseItem)) {
        continue;
      }
      if (otherSideDeleted && onConflict && canonicalStringify(candidate) !== canonicalStringify(baseItem)) {
        onConflict({
          id: `conflict-del-finance-${id}`,
          module: 'finance',
          entityType: 'delete_vs_modify',
          entityId: id,
          label: `${label}: ${id}`,
          localSummary: localItem ? 'Modificado' : 'Eliminado',
          remoteSummary: remoteItem ? 'Modificado' : 'Eliminado',
          localValue: localItem || null,
          remoteValue: remoteItem || null,
          baseValue: baseItem,
        });
      }
      result.push(candidate);
      continue;
    }

    const [a, b] = candidates;
    if (onConflict && canonicalStringify(a) !== canonicalStringify(b)) {
      const bothChanged = !baseItem
        || (canonicalStringify(a) !== canonicalStringify(baseItem)
          && canonicalStringify(b) !== canonicalStringify(baseItem));
      if (bothChanged) {
        onConflict({
          id: `conflict-finance-${id}`,
          module: 'finance',
          entityType: 'entity',
          entityId: id,
          label: `${label}: ${id}`,
          localSummary: 'Versión local',
          remoteSummary: 'Versión remota',
          localValue: localItem,
          remoteValue: remoteItem,
          baseValue: baseItem,
        });
      }
    }
    result.push(chooseFinanceVersion(a, b, baseItem));
  }

  return result.sort((a, b) => compareLedgerEvents(
    { kind, id: a.id, date: a.date, effectiveOrder: a.effectiveOrder },
    { kind, id: b.id, date: b.date, effectiveOrder: b.effectiveOrder },
  ));
}

export function mergeFinanceModule(
  local: Finance,
  remote: Finance,
  baseline?: Finance,
  tombstones: Record<string, number> = {},
  onConflict?: (conflict: SyncConflictItem) => void
): Finance {
  const transactions = mergeFinanceEventCollection(
    'transaction',
    local.transactions,
    remote.transactions,
    baseline?.transactions,
    tombstones,
    onConflict,
    'Transacción',
  );

  const transfers = mergeFinanceEventCollection(
    'transfer',
    local.transfers,
    remote.transfers,
    baseline?.transfers,
    tombstones,
    onConflict,
    'Transferencia',
  );

  const reconciliations = mergeFinanceEventCollection(
    'reconciliation',
    local.reconciliations,
    remote.reconciliations,
    baseline?.reconciliations,
    tombstones,
    onConflict,
    'Conciliación',
  );

  const debts = mergeEntityCollection(
    local.debts,
    remote.debts,
    baseline?.debts,
    tombstones,
    undefined,
    onConflict,
    { module: 'finance', entityType: 'Deuda', getLabel: (d) => d.name }
  );

  const investments = mergeEntityCollection(
    local.investments,
    remote.investments,
    baseline?.investments,
    tombstones,
    undefined,
    onConflict,
    { module: 'finance', entityType: 'Inversión', getLabel: (i) => i.name }
  );

  const subscriptions = mergeEntityCollection(
    local.subscriptions,
    remote.subscriptions,
    baseline?.subscriptions,
    tombstones,
    undefined,
    onConflict,
    { module: 'finance', entityType: 'Suscripción', getLabel: (s) => s.name }
  );

  const expectedIncomes = mergeEntityCollection(
    local.expectedIncomes || [],
    remote.expectedIncomes || [],
    baseline?.expectedIncomes || [],
    tombstones,
    undefined,
    onConflict,
    { module: 'finance', entityType: 'Ingreso Esperado', getLabel: (e) => e.name }
  );

  const commitments = mergeEntityCollection(
    local.commitments || [],
    remote.commitments || [],
    baseline?.commitments || [],
    tombstones,
    undefined,
    onConflict,
    { module: 'finance', entityType: 'Compromiso Financiero', getLabel: (c) => c.name }
  );

  let minCushion = local.minCushion;
  if (baseline && local.minCushion === baseline.minCushion) {
    minCushion = remote.minCushion !== undefined ? remote.minCushion : local.minCushion;
  } else if (baseline && remote.minCushion === baseline.minCushion) {
    minCushion = local.minCushion !== undefined ? local.minCushion : remote.minCushion;
  } else {
    minCushion = remote.minCushion !== undefined ? remote.minCushion : local.minCushion;
  }

  let cushionEnabled = local.cushionEnabled;
  if (baseline && local.cushionEnabled === baseline.cushionEnabled) {
    cushionEnabled = remote.cushionEnabled !== undefined ? remote.cushionEnabled : local.cushionEnabled;
  } else if (baseline && remote.cushionEnabled === baseline.cushionEnabled) {
    cushionEnabled = local.cushionEnabled !== undefined ? local.cushionEnabled : remote.cushionEnabled;
  } else {
    cushionEnabled = remote.cushionEnabled !== undefined ? remote.cushionEnabled : local.cushionEnabled;
  }

  let heroDisplayMode = local.heroDisplayMode;
  if (baseline && local.heroDisplayMode === baseline.heroDisplayMode) {
    heroDisplayMode = remote.heroDisplayMode !== undefined ? remote.heroDisplayMode : local.heroDisplayMode;
  } else if (baseline && remote.heroDisplayMode === baseline.heroDisplayMode) {
    heroDisplayMode = local.heroDisplayMode !== undefined ? local.heroDisplayMode : remote.heroDisplayMode;
  } else {
    heroDisplayMode = remote.heroDisplayMode !== undefined ? remote.heroDisplayMode : local.heroDisplayMode;
  }

  // 3-Way merge categories with conflict detection and tombstones
  const localCats = normalizeCategories(local.categories, local.transactions);
  const remoteCats = normalizeCategories(remote.categories, remote.transactions);
  const baseCats = baseline?.categories ? normalizeCategories(baseline.categories, baseline.transactions) : undefined;

  const categories = mergeEntityCollection<FinanceCategory>(
    localCats,
    remoteCats,
    baseCats,
    tombstones,
    (lCat, rCat, bCat) => {
      let name = lCat.name;
      let active = lCat.active;
      if (bCat) {
        if (lCat.name === bCat.name && rCat.name !== bCat.name) name = rCat.name;
        else if (rCat.name === bCat.name && lCat.name !== bCat.name) name = lCat.name;
        else if (lCat.name !== bCat.name && rCat.name !== bCat.name && lCat.name !== rCat.name) {
          if (onConflict) {
            onConflict({
              id: `conflict-category-${lCat.id}`,
              module: 'finance',
              entityType: 'entity',
              entityId: lCat.id,
              field: 'name',
              label: `Categoría: ${lCat.name}`,
              localSummary: lCat.name,
              remoteSummary: rCat.name,
              baseSummary: bCat.name,
              localValue: lCat,
              remoteValue: rCat,
              baseValue: bCat,
            });
          }
          const lTime = extractTimestamp(lCat);
          const rTime = extractTimestamp(rCat);
          name = rTime >= lTime ? rCat.name : lCat.name;
        }

        if (lCat.active === bCat.active && rCat.active !== bCat.active) active = rCat.active;
        else if (rCat.active === bCat.active && lCat.active !== bCat.active) active = lCat.active;
        else if (lCat.active !== bCat.active && rCat.active !== bCat.active && lCat.active !== rCat.active) {
          active = rCat.active;
        }
      } else {
        if (lCat.name !== rCat.name && onConflict) {
          onConflict({
            id: `conflict-category-${lCat.id}`,
            module: 'finance',
            entityType: 'entity',
            entityId: lCat.id,
            field: 'name',
            label: `Categoría: ${lCat.name}`,
            localSummary: lCat.name,
            remoteSummary: rCat.name,
            localValue: lCat,
            remoteValue: rCat,
          });
        }
        const lTime = extractTimestamp(lCat);
        const rTime = extractTimestamp(rCat);
        name = rTime >= lTime ? rCat.name : lCat.name;
        active = rCat.active !== undefined ? rCat.active : lCat.active;
      }

      return {
        id: lCat.id,
        name,
        active,
        createdAt: lCat.createdAt || rCat.createdAt,
        updatedAt: rCat.updatedAt || lCat.updatedAt || new Date().toISOString(),
      };
    },
    onConflict,
    { module: 'finance', entityType: 'Categoría', getLabel: (c) => c.name }
  );

  // Merge budgets map with conflict detection
  const budgets: Record<string, number> = { ...(baseline?.budgets || {}) };
  const allBudgetCats = new Set([
    ...Object.keys(local.budgets || {}),
    ...Object.keys(remote.budgets || {}),
  ]);
  for (const cat of allBudgetCats) {
    const lVal = local.budgets?.[cat];
    const rVal = remote.budgets?.[cat];
    const bVal = baseline?.budgets?.[cat];
    if (lVal !== undefined && rVal !== undefined) {
      if (bVal !== undefined) {
        if (lVal === bVal) {
          budgets[cat] = rVal;
        } else if (rVal === bVal) {
          budgets[cat] = lVal;
        } else {
          // Both changed to different values -> conflict!
          if (lVal !== rVal && onConflict) {
            onConflict({
              id: `conflict-budget-${cat}`,
              module: 'finance',
              entityType: 'budget',
              entityId: cat,
              label: `Presupuesto: ${cat}`,
              localSummary: `$${lVal}`,
              remoteSummary: `$${rVal}`,
              baseSummary: `$${bVal}`,
              localValue: lVal,
              remoteValue: rVal,
              baseValue: bVal,
            });
          }
          budgets[cat] = lVal; // Conservative fallback: keep local
        }
      } else {
        if (lVal !== rVal && onConflict) {
          onConflict({
            id: `conflict-budget-${cat}`,
            module: 'finance',
            entityType: 'budget',
            entityId: cat,
            label: `Presupuesto: ${cat}`,
            localSummary: `$${lVal}`,
            remoteSummary: `$${rVal}`,
            localValue: lVal,
            remoteValue: rVal,
          });
        }
        budgets[cat] = lVal;
      }
    } else if (lVal !== undefined) {
      budgets[cat] = lVal;
    } else if (rVal !== undefined) {
      budgets[cat] = rVal;
    }
  }

  const calcAccountDelta = (
    accId: string,
    txs: Transaction[] = [],
    trfs: FinanceTransfer[] = []
  ): number => {
    let delta = 0;
    for (const tx of txs) {
      if (tx.accountId !== accId) continue;
      if (tx.type === 'ingreso') delta += Number(tx.amount || 0);
      else delta -= Number(tx.amount || 0);
    }
    for (const tr of trfs) {
      if (tr.toAccountId === accId) delta += Number(tr.amount || 0);
      if (tr.fromAccountId === accId) delta -= Number(tr.amount || 0);
    }
    return delta;
  };

  const getInitial = (acc?: Account, txs?: Transaction[], trfs?: FinanceTransfer[]): number => {
    if (!acc) return 0;
    if (typeof acc.initialBalance === 'number' && Number.isFinite(acc.initialBalance)) {
      return Math.round(acc.initialBalance * 100) / 100;
    }
    const delta = calcAccountDelta(acc.id, txs, trfs);
    return Math.round((Number(acc.balance || 0) - delta) * 100) / 100;
  };

  const resolveAccountInitialBalance = (
    accId: string,
    lAcc?: Account,
    rAcc?: Account,
    bAcc?: Account
  ): number => {
    if (bAcc && lAcc && rAcc) {
      const bBase = getInitial(bAcc, baseline?.transactions, baseline?.transfers);
      const lBase = getInitial(lAcc, local.transactions, local.transfers);
      const rBase = getInitial(rAcc, remote.transactions, remote.transfers);

      // Both changed balance directly to different amounts -> conflict!
      if (lBase !== bBase && rBase !== bBase && lBase !== rBase) {
        if (onConflict) {
          onConflict({
            id: `conflict-account-${accId}`,
            module: 'finance',
            entityType: 'account',
            entityId: accId,
            field: 'initialBalance',
            label: `Cuenta: ${lAcc.name || rAcc.name}`,
            localSummary: `Saldo: $${lAcc.balance}`,
            remoteSummary: `Saldo: $${rAcc.balance}`,
            baseSummary: `Saldo: $${bAcc.balance}`,
            localValue: lBase,
            remoteValue: rBase,
            baseValue: bBase,
          });
        }
        return bBase;
      }

      if (lBase !== bBase && rBase === bBase) return lBase; // Only local changed
      if (rBase !== bBase && lBase === bBase) return rBase; // Only remote changed
      return lBase;
    }

    if (bAcc) {
      return getInitial(bAcc, baseline?.transactions, baseline?.transfers);
    }

    if (lAcc && rAcc) {
      const lBase = getInitial(lAcc, local.transactions, local.transfers);
      const rBase = getInitial(rAcc, remote.transactions, remote.transfers);
      if (lBase !== rBase && onConflict) {
        onConflict({
          id: `conflict-account-${accId}`,
          module: 'finance',
          entityType: 'account',
          entityId: accId,
          field: 'initialBalance',
          label: `Cuenta: ${lAcc.name || rAcc.name}`,
          localSummary: `Saldo: $${lAcc.balance}`,
          remoteSummary: `Saldo: $${rAcc.balance}`,
          localValue: lBase,
          remoteValue: rBase,
        });
      }
      const canonicalAccount = canonicalStringify(lAcc) >= canonicalStringify(rAcc) ? lAcc : rAcc;
      return Math.round((canonicalAccount === lAcc ? lBase : rBase) * 100) / 100;
    }

    if (lAcc) {
      return getInitial(lAcc, local.transactions, local.transfers);
    }

    if (rAcc) {
      return getInitial(rAcc, remote.transactions, remote.transfers);
    }

    return 0;
  };

  // Account collection merge
  const mergedAccountsRaw = mergeEntityCollection<Account>(
    local.accounts,
    remote.accounts,
    baseline?.accounts,
    tombstones,
    (lAcc, rAcc, bAcc) => {
      const initialBalance = resolveAccountInitialBalance(lAcc.id, lAcc, rAcc, bAcc);
      const lNameChanged = !bAcc || lAcc.name !== bAcc.name;
      const rNameChanged = !bAcc || rAcc.name !== bAcc.name;
      const name = lAcc.name === rAcc.name
        ? lAcc.name
        : lNameChanged !== rNameChanged
          ? (lNameChanged ? lAcc.name : rAcc.name)
          : [lAcc.name, rAcc.name].sort().at(-1) || lAcc.name;
      const canonicalAccount = canonicalStringify(lAcc) >= canonicalStringify(rAcc) ? lAcc : rAcc;
      return {
        ...canonicalAccount,
        name,
        initialBalance,
      };
    }
  );

  // Account.balance is a materialized cache derived from the merged deterministic ledger.
  const mergedAccounts = mergedAccountsRaw.map((acc) => {
    let initialBalance = acc.initialBalance;
    if (typeof initialBalance !== 'number' || !Number.isFinite(initialBalance)) {
      const lAcc = local.accounts.find((a) => a.id === acc.id);
      const rAcc = remote.accounts.find((a) => a.id === acc.id);
      const bAcc = baseline?.accounts.find((a) => a.id === acc.id);
      initialBalance = resolveAccountInitialBalance(acc.id, lAcc, rAcc, bAcc);
    }
    const accWithInitial = { ...acc, initialBalance };
    const reconstruction = reconstructAccountBalance(accWithInitial, transactions, transfers, reconciliations);
    const accountReconciliations = reconciliations
      .filter((item) => item.accountId === acc.id)
      .map((item) => ({ kind: 'reconciliation' as const, ...item }))
      .sort(compareLedgerEvents);
    const lastReconciledAt = accountReconciliations.at(-1)?.date || null;
    const sourceBalances = [
      local.accounts.find((item) => item.id === acc.id)?.balance,
      remote.accounts.find((item) => item.id === acc.id)?.balance,
      baseline?.accounts.find((item) => item.id === acc.id)?.balance,
    ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    let balance = reconstruction.balance;
    if (balance === null) {
      balance = sourceBalances.sort((a, b) => a - b).at(-1) ?? Number(acc.balance || 0);
    } else if (reconstruction.ambiguities.length > 0) {
      const allAgree = sourceBalances.length > 0 && sourceBalances.every((value) => value === sourceBalances[0]);
      const alreadyMaterialized = sourceBalances.includes(balance);
      if (!alreadyMaterialized) {
        balance = allAgree
          ? sourceBalances[0]
          : baseline?.accounts.find((item) => item.id === acc.id)?.balance
            ?? sourceBalances.sort((a, b) => a - b).at(-1)
            ?? balance;
      }
    }
    return {
      ...accWithInitial,
      balance,
      lastReconciledAt,
    };
  });

  return {
    accounts: mergedAccounts,
    transactions,
    transfers,
    reconciliations,
    categories,
    budgets,
    debts,
    investments,
    subscriptions,
    expectedIncomes,
    commitments,
    minCushion,
    cushionEnabled,
    heroDisplayMode,
  };
}

function mergeGymSets(localSets: GymSet[] = [], remoteSets: GymSet[] = []): GymSet[] {
  const map = new Map<string, GymSet>();
  for (const s of localSets) map.set(s.id, s);
  for (const s of remoteSets) {
    const existing = map.get(s.id);
    if (!existing) {
      map.set(s.id, s);
    } else {
      map.set(s.id, {
        ...existing,
        ...s,
        completed: Boolean(existing.completed || s.completed),
        completedAt: s.completedAt || existing.completedAt || null,
      });
    }
  }
  return Array.from(map.values());
}

function mergeGymExercises(localExs: Exercise[] = [], remoteExs: Exercise[] = []): Exercise[] {
  const result: Exercise[] = [];
  const remoteMatched = new Set<number>();

  for (const lEx of localExs) {
    const rIndex = remoteExs.findIndex(
      (r, i) => !remoteMatched.has(i) && ((lEx.id && r.id && lEx.id === r.id) || lEx.name === r.name)
    );
    if (rIndex >= 0) {
      remoteMatched.add(rIndex);
      const rEx = remoteExs[rIndex];
      result.push({
        ...lEx,
        ...rEx,
        sets: mergeGymSets(lEx.sets, rEx.sets),
      });
    } else {
      result.push(lEx);
    }
  }

  for (let i = 0; i < remoteExs.length; i += 1) {
    if (!remoteMatched.has(i)) {
      result.push(remoteExs[i]);
    }
  }

  return result;
}

export function mergeGymModule(
  local: Gym,
  remote: Gym,
  baseline?: Gym,
  tombstones: Record<string, number> = {}
): Gym {
  const sessions = mergeEntityCollection<GymSession>(
    local.sessions,
    remote.sessions,
    baseline?.sessions,
    tombstones,
    (lSess, rSess) => ({
      ...lSess,
      ...rSess,
      exercises: mergeGymExercises(lSess.exercises, rSess.exercises),
      status: lSess.status === 'completed' || rSess.status === 'completed' ? 'completed' : 'active',
      finishedAt: rSess.finishedAt || lSess.finishedAt || undefined,
    })
  ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const weight = mergeDateCollection<WeightPoint>(
    local.weight,
    remote.weight,
    baseline?.weight,
    (l, r) => (extractTimestamp(r) >= extractTimestamp(l) ? r : l)
  );

  const measurements = mergeDateCollection<MeasurementPoint>(
    local.measurements,
    remote.measurements,
    baseline?.measurements,
    (l, r) => (extractTimestamp(r) >= extractTimestamp(l) ? r : l)
  );

  const routineTemplates = mergeEntityCollection(
    local.routineTemplates,
    remote.routineTemplates,
    baseline?.routineTemplates,
    tombstones
  );

  const restDays = Array.from(
    new Set([...(local.restDays || []), ...(remote.restDays || [])])
  ).sort();

  return {
    sessions,
    weight,
    measurements,
    routineTemplates,
    restDays,
    ...(local.activeTimer || remote.activeTimer ? { activeTimer: local.activeTimer || remote.activeTimer } : {}),
  };
}

export function mergeTasksModule(
  local: {
    tasksRecurring: TaskRecurring[];
    taskLog: Record<string, Record<string, boolean>>;
    todayExtras: TodayExtra[];
    dailyPriorities: DailyPriority[];
    inbox: InboxItem[];
  },
  remote: {
    tasksRecurring: TaskRecurring[];
    taskLog: Record<string, Record<string, boolean>>;
    todayExtras: TodayExtra[];
    dailyPriorities: DailyPriority[];
    inbox: InboxItem[];
  },
  baseline?: {
    tasksRecurring: TaskRecurring[];
    taskLog: Record<string, Record<string, boolean>>;
    todayExtras: TodayExtra[];
    dailyPriorities: DailyPriority[];
    inbox: InboxItem[];
  },
  tombstones: Record<string, number> = {},
  onConflict?: (conflict: SyncConflictItem) => void
) {
  const tasksRecurring = mergeEntityCollection(
    local.tasksRecurring,
    remote.tasksRecurring,
    baseline?.tasksRecurring,
    tombstones,
    undefined,
    onConflict,
    { module: 'tasks', entityType: 'Rutina recurrente', getLabel: (r) => r.name }
  );

  const todayExtras = mergeEntityCollection<TodayExtra>(
    local.todayExtras,
    remote.todayExtras,
    baseline?.todayExtras,
    tombstones,
    (l, r, b) => {
      if (b && l.text !== b.text && r.text !== b.text && l.text !== r.text && onConflict) {
        onConflict({
          id: `conflict-task-${l.id}`,
          module: 'tasks',
          entityType: 'entity',
          entityId: l.id,
          label: `Tarea: ${l.text}`,
          localSummary: l.text,
          remoteSummary: r.text,
          baseSummary: b.text,
          localValue: l,
          remoteValue: r,
          baseValue: b,
        });
      }

      const combinedDeps = Array.from(new Set([...(l.dependsOn || []), ...(r.dependsOn || [])]))
        .filter((id) => !tombstones[id]);
      return {
        ...l,
        ...r,
        text: r.text !== baseline?.todayExtras?.find((bItem) => bItem.id === l.id)?.text ? r.text : l.text,
        done: Boolean(l.done || r.done),
        dueDate: r.dueDate || l.dueDate,
        dependsOn: combinedDeps.length > 0 ? combinedDeps : undefined,
      };
    },
    onConflict,
    { module: 'tasks', entityType: 'Tarea para hoy', getLabel: (t) => t.text }
  );

  const dailyPriorities = mergeEntityCollection<DailyPriority>(
    local.dailyPriorities,
    remote.dailyPriorities,
    baseline?.dailyPriorities,
    tombstones,
    (l, r) => ({
      ...l,
      ...r,
      done: Boolean(l.done || r.done),
    })
  );

  const inbox = mergeEntityCollection(
    local.inbox || [],
    remote.inbox || [],
    baseline?.inbox,
    tombstones,
    undefined,
    onConflict,
    { module: 'tasks', entityType: 'Bandeja de entrada', getLabel: (i) => i.text }
  );

  // Deep merge taskLog: date -> taskId -> boolean
  const taskLog: Record<string, Record<string, boolean>> = {};
  const allDates = new Set([
    ...Object.keys(local.taskLog || {}),
    ...Object.keys(remote.taskLog || {}),
    ...Object.keys(baseline?.taskLog || {}),
  ]);

  for (const date of allDates) {
    const lDay = local.taskLog?.[date] || {};
    const rDay = remote.taskLog?.[date] || {};
    const bDay = baseline?.taskLog?.[date] || {};

    const allTasks = new Set([
      ...Object.keys(lDay),
      ...Object.keys(rDay),
      ...Object.keys(bDay),
    ]);

    taskLog[date] = {};
    for (const taskId of allTasks) {
      const lVal = lDay[taskId];
      const rVal = rDay[taskId];
      const bVal = bDay[taskId];

      if (lVal !== undefined && rVal !== undefined) {
        if (bVal !== undefined) {
          if (lVal === bVal) taskLog[date][taskId] = rVal;
          else if (rVal === bVal) taskLog[date][taskId] = lVal;
          else taskLog[date][taskId] = Boolean(lVal || rVal);
        } else {
          taskLog[date][taskId] = Boolean(lVal || rVal);
        }
      } else if (lVal !== undefined) {
        taskLog[date][taskId] = lVal;
      } else if (rVal !== undefined) {
        taskLog[date][taskId] = rVal;
      }
    }
  }

  return {
    tasksRecurring,
    taskLog,
    todayExtras,
    dailyPriorities,
    inbox,
  };
}

export function mergeAgendaModule(
  local: AgendaWeek,
  remote: AgendaWeek,
  baseline?: AgendaWeek,
  tombstones: Record<string, number> = {}
): AgendaWeek {
  const days: DayKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const result = {} as AgendaWeek;
  for (const day of days) {
    result[day] = mergeEntityCollection<AgendaBlock>(
      local[day] || [],
      remote[day] || [],
      baseline?.[day],
      tombstones
    );
  }
  return result;
}

export function mergeNotesModule(
  local: Notes,
  remote: Notes,
  baseline?: Notes,
  tombstones: Record<string, number> = {},
  onConflict?: (conflict: SyncConflictItem) => void
): Notes {
  const postits = mergeEntityCollection<Postit>(
    local.postits,
    remote.postits,
    baseline?.postits,
    tombstones,
    (l, r, b) => {
      if (b) {
        const lContentChanged = l.text !== b.text || (l.title || undefined) !== (b.title || undefined);
        const rContentChanged = r.text !== b.text || (r.title || undefined) !== (b.title || undefined);
        const lMetaChanged = Boolean(l.pinned) !== Boolean(b.pinned) || Boolean(l.archived) !== Boolean(b.archived);
        const rMetaChanged = Boolean(r.pinned) !== Boolean(b.pinned) || Boolean(r.archived) !== Boolean(b.archived);

        if (lContentChanged && rContentChanged && (l.text !== r.text || l.title !== r.title) && onConflict) {
          onConflict({
            id: `conflict-postit-${l.id}`,
            module: 'notes',
            entityType: 'entity',
            entityId: l.id,
            label: `Nota: ${(l.title || l.text).slice(0, 30)}`,
            localSummary: l.title ? `${l.title}: ${l.text}` : l.text,
            remoteSummary: r.title ? `${r.title}: ${r.text}` : r.text,
            baseSummary: b.title ? `${b.title}: ${b.text}` : b.text,
            localValue: l,
            remoteValue: r,
            baseValue: b,
          });
          return l;
        }

        const chosenText = rContentChanged && !lContentChanged ? r.text : l.text;
        const chosenTitle = rContentChanged && !lContentChanged ? r.title : l.title;
        const chosenPinned = rMetaChanged && !lMetaChanged ? r.pinned : (lMetaChanged ? l.pinned : (l.pinned || r.pinned));
        const chosenArchived = rMetaChanged && !lMetaChanged ? r.archived : (lMetaChanged ? l.archived : (l.archived || r.archived));
        const chosenTags = r.tags && (!l.tags || l.tags.length === 0) ? r.tags : l.tags;

        return {
          ...l,
          text: chosenText,
          title: chosenTitle,
          pinned: chosenPinned ? true : undefined,
          archived: chosenArchived ? true : undefined,
          tags: chosenTags && chosenTags.length > 0 ? chosenTags : undefined,
          updatedAt: extractTimestamp(r) >= extractTimestamp(l) ? r.updatedAt : l.updatedAt,
        };
      }
      return extractTimestamp(r) >= extractTimestamp(l) ? r : l;
    },
    onConflict,
    { module: 'notes', entityType: 'Nota', getLabel: (p) => (p.title || p.text).slice(0, 30) }
  );

  const shopping = mergeEntityCollection<ShoppingItem>(
    local.shopping,
    remote.shopping,
    baseline?.shopping,
    tombstones,
    (l, r, b) => {
      if (b && l.text !== b.text && r.text !== b.text && l.text !== r.text && onConflict) {
        onConflict({
          id: `conflict-shopping-${l.id}`,
          module: 'notes',
          entityType: 'entity',
          entityId: l.id,
          label: `Comprar: ${l.text}`,
          localSummary: l.text,
          remoteSummary: r.text,
          baseSummary: b.text,
          localValue: l,
          remoteValue: r,
          baseValue: b,
        });
      }
      return {
        ...l,
        ...r,
        done: Boolean(l.done || r.done),
      };
    },
    onConflict,
    { module: 'notes', entityType: 'Artículo de compras', getLabel: (s) => s.text }
  );

  const links = mergeEntityCollection<UsefulLink>(
    local.links,
    remote.links,
    baseline?.links,
    tombstones,
    undefined,
    onConflict,
    { module: 'notes', entityType: 'Enlace', getLabel: (l) => l.name }
  );

  const possessions = mergeEntityCollection<PossessionItem>(
    local.possessions,
    remote.possessions,
    baseline?.possessions,
    tombstones,
    undefined,
    onConflict,
    { module: 'notes', entityType: 'Posesión', getLabel: (p) => p.name }
  );

  return {
    postits,
    shopping,
    links,
    possessions,
  };
}

export function mergeGoalsModule(
  local: { goals: Goal[]; projects: Project[] },
  remote: { goals: Goal[]; projects: Project[] },
  baseline?: { goals: Goal[]; projects: Project[] },
  tombstones: Record<string, number> = {},
  onConflict?: (conflict: SyncConflictItem) => void
) {
  const goals = mergeEntityCollection<Goal>(
    local.goals,
    remote.goals,
    baseline?.goals,
    tombstones,
    (l, r, b) => {
      if (b) {
        const targetConflict = l.target !== b.target && r.target !== b.target && l.target !== r.target;
        const nameConflict = l.name !== b.name && r.name !== b.name && l.name !== r.name;
        const currentConflict = l.current !== b.current && r.current !== b.current && l.current !== r.current;
        if ((targetConflict || nameConflict || currentConflict) && onConflict) {
          onConflict({
            id: `conflict-goal-${l.id}`,
            module: 'goals',
            entityType: 'entity',
            entityId: l.id,
            label: `Meta: ${l.name}`,
            localSummary: `${l.name} (${l.target})`,
            remoteSummary: `${r.name} (${r.target})`,
            baseSummary: `${b.name} (${b.target})`,
            localValue: l,
            remoteValue: r,
            baseValue: b,
          });
        }
      }
      return { ...l, ...r };
    },
    onConflict,
    { module: 'goals', entityType: 'Meta', getLabel: (g) => g.name }
  );

  const projects = mergeEntityCollection<Project>(
    local.projects || [],
    remote.projects || [],
    baseline?.projects,
    tombstones,
    (lProj, rProj, bProj) => {
      let name = lProj.name;
      if (bProj) {
        if (lProj.name === bProj.name && rProj.name !== bProj.name) name = rProj.name;
        else if (rProj.name === bProj.name && lProj.name !== bProj.name) name = lProj.name;
        else if (lProj.name !== bProj.name && rProj.name !== bProj.name && lProj.name !== rProj.name) {
          if (onConflict) {
            onConflict({
              id: `conflict-project-${lProj.id}`,
              module: 'goals',
              entityType: 'entity',
              entityId: lProj.id,
              label: `Proyecto: ${lProj.name}`,
              localSummary: lProj.name,
              remoteSummary: rProj.name,
              baseSummary: bProj.name,
              localValue: lProj,
              remoteValue: rProj,
              baseValue: bProj,
            });
          }
          name = lProj.name;
        }
      }

      // Merge subtasks by ID
      const mergedTasks = mergeEntityCollection<ProjectTask>(
        lProj.tasks || [],
        rProj.tasks || [],
        bProj?.tasks,
        tombstones,
        (lTask, rTask) => {
          const combinedDeps = Array.from(new Set([...(lTask.dependsOn || []), ...(rTask.dependsOn || [])]))
            .filter((id) => !tombstones[id]);
          return {
            ...lTask,
            ...rTask,
            done: Boolean(lTask.done || rTask.done),
            dueDate: rTask.dueDate || lTask.dueDate,
            dependsOn: combinedDeps.length > 0 ? combinedDeps : undefined,
          };
        },
        onConflict,
        { module: 'goals', entityType: 'Subtarea de Proyecto', getLabel: (t) => t.text }
      );

      return {
        ...rProj,
        ...lProj,
        name,
        tasks: mergedTasks,
      };
    },
    onConflict,
    { module: 'goals', entityType: 'Proyecto', getLabel: (p) => p.name }
  );

  return { goals, projects };
}

export function mergeCalendarModule(
  local: { calendarEvents: CalendarEvent[] },
  remote: { calendarEvents: CalendarEvent[] },
  baseline?: { calendarEvents: CalendarEvent[] },
  tombstones: Record<string, number> = {}
) {
  return {
    calendarEvents: mergeEntityCollection<CalendarEvent>(
      local.calendarEvents,
      remote.calendarEvents,
      baseline?.calendarEvents,
      tombstones
    ),
  };
}

export function mergeStudyModule(
  local: Study,
  remote: Study,
  baseline?: Study,
  tombstones: Record<string, number> = {}
): Study {
  return {
    subjects: mergeEntityCollection<Subject>(
      local.subjects,
      remote.subjects,
      baseline?.subjects,
      tombstones
    ),
    exams: mergeEntityCollection(
      local.exams,
      remote.exams,
      baseline?.exams,
      tombstones
    ),
    studyLog: mergeEntityCollection<StudyLog>(
      local.studyLog,
      remote.studyLog,
      baseline?.studyLog,
      tombstones
    ),
  };
}

export function mergeStreamingModule(
  local: Streaming,
  remote: Streaming,
  baseline?: Streaming,
  tombstones: Record<string, number> = {}
): Streaming {
  return {
    sessions: mergeEntityCollection<StreamSession>(
      local.sessions,
      remote.sessions,
      baseline?.sessions,
      tombstones
    ),
    monthlyGoal: remote.monthlyGoal !== baseline?.monthlyGoal ? remote.monthlyGoal : local.monthlyGoal,
    preStreamChecklist: mergeEntityCollection<StreamChecklistItem>(
      local.preStreamChecklist || [],
      remote.preStreamChecklist || [],
      baseline?.preStreamChecklist,
      tombstones
    ),
    contentPipeline: mergeEntityCollection<StreamContentPipelineItem>(
      local.contentPipeline || [],
      remote.contentPipeline || [],
      baseline?.contentPipeline,
      tombstones
    ),
  };
}

export function mergeJobsModule(
  local: Jobs,
  remote: Jobs,
  baseline?: Jobs,
  tombstones: Record<string, number> = {}
): Jobs {
  return {
    opportunities: mergeEntityCollection<JobOpportunity>(
      local.opportunities,
      remote.opportunities,
      baseline?.opportunities,
      tombstones
    ),
    applications: mergeEntityCollection<JobApplication>(
      local.applications,
      remote.applications,
      baseline?.applications,
      tombstones
    ),
  };
}

export function mergeResaleModule(
  local: Resale,
  remote: Resale,
  baseline?: Resale,
  tombstones: Record<string, number> = {}
): Resale {
  return {
    opportunities: mergeEntityCollection<ResaleOpportunity>(
      local.opportunities,
      remote.opportunities,
      baseline?.opportunities,
      tombstones
    ),
    inventory: mergeEntityCollection<ResaleItem>(
      local.inventory,
      remote.inventory,
      baseline?.inventory,
      tombstones
    ),
  };
}

export function mergeIdeasModule(
  local: { ideas: Idea[] },
  remote: { ideas: Idea[] },
  baseline?: { ideas: Idea[] },
  tombstones: Record<string, number> = {},
  onConflict?: (conflict: SyncConflictItem) => void
) {
  return {
    ideas: mergeEntityCollection<Idea>(
      local.ideas,
      remote.ideas,
      baseline?.ideas,
      tombstones,
      (l, r, b) => {
        if (b && !stableEqual(l, b) && !stableEqual(r, b) && !stableEqual(l, r) && onConflict) {
          onConflict({
            id: `conflict-idea-${l.id}`,
            module: 'ideas',
            entityType: 'entity',
            entityId: l.id,
            label: `Idea: ${l.text}`,
            localSummary: l.text,
            remoteSummary: r.text,
            baseSummary: b.text,
            localValue: l,
            remoteValue: r,
            baseValue: b,
          });
          return l;
        }
        return extractTimestamp(r) >= extractTimestamp(l) ? r : l;
      },
      onConflict,
      { module: 'ideas', entityType: 'Idea', getLabel: (i) => i.text }
    ),
  };
}

export function mergeContextModule(
  local: { dailyContext: DailyContextEntry[] },
  remote: { dailyContext: DailyContextEntry[] },
  baseline?: { dailyContext: DailyContextEntry[] }
) {
  return {
    dailyContext: mergeDateCollection<DailyContextEntry>(
      local.dailyContext,
      remote.dailyContext,
      baseline?.dailyContext,
      (l, r) => ({
        ...l,
        ...r,
        sleepHours: r.sleepHours ?? l.sleepHours,
        energy: r.energy ?? l.energy,
        mood: r.mood ?? l.mood,
        connection: r.connection ?? l.connection,
        note: r.note || l.note,
      })
    ),
  };
}

export function mergeCheckoutModule(
  local: { checkoutLog: Record<string, CheckoutLogDay> },
  remote: { checkoutLog: Record<string, CheckoutLogDay> },
  baseline?: { checkoutLog: Record<string, CheckoutLogDay> }
) {
  const merged: Record<string, CheckoutLogDay> = { ...(baseline?.checkoutLog || {}) };
  const allDates = new Set([
    ...Object.keys(local.checkoutLog || {}),
    ...Object.keys(remote.checkoutLog || {}),
  ]);

  for (const d of allDates) {
    merged[d] = {
      ...(local.checkoutLog?.[d] || {}),
      ...(remote.checkoutLog?.[d] || {}),
    };
  }

  return { checkoutLog: merged };
}

export function mergeProfileModule(
  local: { profile: Profile; settings: Settings },
  remote: { profile: Profile; settings: Settings },
  baseline?: { profile: Profile; settings: Settings }
) {
  return {
    profile: {
      ...baseline?.profile,
      ...local.profile,
      ...remote.profile,
    },
    settings: {
      ...baseline?.settings,
      ...local.settings,
      ...remote.settings,
      hiddenTabs: Array.from(
        new Set([...(local.settings?.hiddenTabs || []), ...(remote.settings?.hiddenTabs || [])])
      ),
      onboardingCompleted: Boolean(
        local.settings?.onboardingCompleted ||
        remote.settings?.onboardingCompleted ||
        baseline?.settings?.onboardingCompleted
      ),
    },
  };
}

/**
 * 3-Way Merge for any LifeOS module data returning merged data AND detected conflicts.
 */
export function mergeModuleDataWithConflicts(
  module: SyncModuleKey,
  localData: unknown,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): ModuleMergeResult {
  const conflicts: SyncConflictItem[] = [];
  const onConflict = (c: SyncConflictItem) => conflicts.push(c);

  let data: unknown;
  switch (module) {
    case 'finance':
      data = {
        finance: mergeFinanceModule(
          (localData as { finance: Finance }).finance,
          (remoteData as { finance: Finance }).finance,
          baselineData ? (baselineData as { finance: Finance }).finance : undefined,
          tombstones,
          onConflict
        ),
      };
      break;
    case 'gym':
      data = {
        gym: mergeGymModule(
          (localData as { gym: Gym }).gym,
          (remoteData as { gym: Gym }).gym,
          baselineData ? (baselineData as { gym: Gym }).gym : undefined,
          tombstones
        ),
      };
      break;
    case 'tasks':
      data = mergeTasksModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones,
        onConflict
      );
      break;
    case 'agenda':
      data = {
        agenda: mergeAgendaModule(
          (localData as { agenda: AgendaWeek }).agenda,
          (remoteData as { agenda: AgendaWeek }).agenda,
          baselineData ? (baselineData as { agenda: AgendaWeek }).agenda : undefined,
          tombstones
        ),
      };
      break;
    case 'notes':
      data = {
        notes: mergeNotesModule(
          (localData as { notes: Notes }).notes,
          (remoteData as { notes: Notes }).notes,
          baselineData ? (baselineData as { notes: Notes }).notes : undefined,
          tombstones,
          onConflict
        ),
      };
      break;
    case 'goals':
      data = mergeGoalsModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones,
        onConflict
      );
      break;
    case 'calendar':
      data = mergeCalendarModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones
      );
      break;
    case 'context':
      data = mergeContextModule(
        localData as any,
        remoteData as any,
        baselineData as any
      );
      break;
    case 'study':
      data = {
        study: mergeStudyModule(
          (localData as { study: Study }).study,
          (remoteData as { study: Study }).study,
          baselineData ? (baselineData as { study: Study }).study : undefined,
          tombstones
        ),
      };
      break;
    case 'streaming':
      data = {
        streaming: mergeStreamingModule(
          (localData as { streaming: Streaming }).streaming,
          (remoteData as { streaming: Streaming }).streaming,
          baselineData ? (baselineData as { streaming: Streaming }).streaming : undefined,
          tombstones
        ),
      };
      break;
    case 'jobs':
      data = {
        jobs: mergeJobsModule(
          (localData as { jobs: Jobs }).jobs,
          (remoteData as { jobs: Jobs }).jobs,
          baselineData ? (baselineData as { jobs: Jobs }).jobs : undefined,
          tombstones
        ),
      };
      break;
    case 'resale':
      data = {
        resale: mergeResaleModule(
          (localData as { resale: Resale }).resale,
          (remoteData as { resale: Resale }).resale,
          baselineData ? (baselineData as { resale: Resale }).resale : undefined,
          tombstones
        ),
      };
      break;
    case 'ideas':
      data = mergeIdeasModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones,
        onConflict
      );
      break;
    case 'checkout':
      data = mergeCheckoutModule(
        localData as any,
        remoteData as any,
        baselineData as any
      );
      break;
    case 'profile':
      data = mergeProfileModule(
        localData as any,
        remoteData as any,
        baselineData as any
      );
      break;
    default:
      data = remoteData;
  }

  return { data, conflicts };
}

/**
 * High-level 3-Way Merge for any LifeOS module data (backward-compatible pure data return).
 */
export function mergeModuleData(
  module: SyncModuleKey,
  localData: unknown,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): unknown {
  return mergeModuleDataWithConflicts(module, localData, remoteData, baselineData, tombstones).data;
}

/**
 * Returns any detected conflicts for a module between local, remote, and baseline.
 */
export function detectModuleConflicts(
  module: SyncModuleKey,
  localData: unknown,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): SyncConflictItem[] {
  return mergeModuleDataWithConflicts(module, localData, remoteData, baselineData, tombstones).conflicts;
}
