import type {
  Account,
  AgendaBlock,
  AgendaWeek,
  CalendarEvent,
  CheckoutLogDay,
  DailyContextEntry,
  DailyPriority,
  DayKey,
  Exercise,
  Finance,
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
  UsefulLink,
  WeightPoint,
} from '../types';
import type { SyncModuleKey } from './syncModel';

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
    add(state.finance.reconciliations);
    add(state.finance.accounts);
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
  customMergeSame?: (localItem: T, remoteItem: T, baseItem?: T) => T
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
        // Local modified it after baseline -> preserve local modification
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
          // Remote modified it after baseline -> preserve remote modification
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

export function mergeFinanceModule(
  local: Finance,
  remote: Finance,
  baseline?: Finance,
  tombstones: Record<string, number> = {}
): Finance {
  const transactions = mergeEntityCollection(
    local.transactions,
    remote.transactions,
    baseline?.transactions,
    tombstones
  );

  const transfers = mergeEntityCollection(
    local.transfers,
    remote.transfers,
    baseline?.transfers,
    tombstones
  );

  const reconciliations = mergeEntityCollection(
    local.reconciliations,
    remote.reconciliations,
    baseline?.reconciliations,
    tombstones
  );

  const debts = mergeEntityCollection(
    local.debts,
    remote.debts,
    baseline?.debts,
    tombstones
  );

  const investments = mergeEntityCollection(
    local.investments,
    remote.investments,
    baseline?.investments,
    tombstones
  );

  const subscriptions = mergeEntityCollection(
    local.subscriptions,
    remote.subscriptions,
    baseline?.subscriptions,
    tombstones
  );

  // Union categories
  const categories = Array.from(
    new Set([...(local.categories || []), ...(remote.categories || [])])
  );

  // Merge budgets map
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
        if (lVal === bVal) budgets[cat] = rVal;
        else if (rVal === bVal) budgets[cat] = lVal;
        else budgets[cat] = rVal; // LWW remote
      } else {
        budgets[cat] = rVal;
      }
    } else if (lVal !== undefined) {
      budgets[cat] = lVal;
    } else if (rVal !== undefined) {
      budgets[cat] = rVal;
    }
  }

  // Account balances delta reconciliation
  const mergedAccounts = mergeEntityCollection<Account>(
    local.accounts,
    remote.accounts,
    baseline?.accounts,
    tombstones,
    (lAcc, rAcc, bAcc) => {
      let finalBalance = lAcc.balance;
      if (bAcc) {
        const deltaLocal = Number(lAcc.balance) - Number(bAcc.balance);
        const deltaRemote = Number(rAcc.balance) - Number(bAcc.balance);
        finalBalance = Number(bAcc.balance) + deltaLocal + deltaRemote;
      } else {
        // Without baseline, calculate net effect of transactions in remote that are absent in local
        const localTxIds = new Set(local.transactions.map((tx) => tx.id));
        const remoteOnlyTxs = remote.transactions.filter(
          (tx) => tx.accountId === lAcc.id && !localTxIds.has(tx.id)
        );
        let netDelta = 0;
        for (const tx of remoteOnlyTxs) {
          if (tx.type === 'ingreso') netDelta += Number(tx.amount);
          else netDelta -= Number(tx.amount);
        }

        const localTransferIds = new Set(local.transfers.map((tr) => tr.id));
        const remoteOnlyTransfers = remote.transfers.filter(
          (tr) => !localTransferIds.has(tr.id)
        );
        for (const tr of remoteOnlyTransfers) {
          if (tr.toAccountId === lAcc.id) netDelta += Number(tr.amount);
          if (tr.fromAccountId === lAcc.id) netDelta -= Number(tr.amount);
        }
        finalBalance = Number(lAcc.balance) + netDelta;
      }

      return {
        ...lAcc,
        name: rAcc.name !== bAcc?.name ? rAcc.name : lAcc.name,
        balance: Math.round(finalBalance * 100) / 100,
        lastReconciledAt: rAcc.lastReconciledAt || lAcc.lastReconciledAt || undefined,
      };
    }
  );

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
  );

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
  tombstones: Record<string, number> = {}
) {
  const tasksRecurring = mergeEntityCollection(
    local.tasksRecurring,
    remote.tasksRecurring,
    baseline?.tasksRecurring,
    tombstones
  );

  const todayExtras = mergeEntityCollection<TodayExtra>(
    local.todayExtras,
    remote.todayExtras,
    baseline?.todayExtras,
    tombstones,
    (l, r) => ({
      ...l,
      ...r,
      text: r.text !== baseline?.todayExtras?.find((b) => b.id === l.id)?.text ? r.text : l.text,
      done: Boolean(l.done || r.done),
    })
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
    tombstones
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
  tombstones: Record<string, number> = {}
): Notes {
  const postits = mergeEntityCollection<Postit>(
    local.postits,
    remote.postits,
    baseline?.postits,
    tombstones,
    (l, r, b) => {
      // If one changed text from baseline, that one wins
      if (b) {
        if (l.text === b.text && r.text !== b.text) return r;
        if (r.text === b.text && l.text !== b.text) return l;
      }
      return extractTimestamp(r) >= extractTimestamp(l) ? r : l;
    }
  );

  const shopping = mergeEntityCollection<ShoppingItem>(
    local.shopping,
    remote.shopping,
    baseline?.shopping,
    tombstones,
    (l, r) => ({
      ...l,
      ...r,
      done: Boolean(l.done || r.done),
    })
  );

  const links = mergeEntityCollection<UsefulLink>(
    local.links,
    remote.links,
    baseline?.links,
    tombstones
  );

  const possessions = mergeEntityCollection<PossessionItem>(
    local.possessions,
    remote.possessions,
    baseline?.possessions,
    tombstones
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
  tombstones: Record<string, number> = {}
) {
  const goals = mergeEntityCollection<Goal>(
    local.goals,
    remote.goals,
    baseline?.goals,
    tombstones
  );

  const projects = mergeEntityCollection<Project>(
    local.projects || [],
    remote.projects || [],
    baseline?.projects,
    tombstones,
    (lProj, rProj, bProj) => {
      const lUpdated = extractTimestamp(lProj);
      const rUpdated = extractTimestamp(rProj);
      const primary = rUpdated >= lUpdated ? rProj : lProj;
      const secondary = primary === rProj ? lProj : rProj;

      // Merge subtasks by ID
      const mergedTasks = mergeEntityCollection<ProjectTask>(
        lProj.tasks || [],
        rProj.tasks || [],
        bProj?.tasks,
        tombstones,
        (lTask, rTask) => ({
          ...lTask,
          ...rTask,
          done: Boolean(lTask.done || rTask.done),
        })
      );

      return {
        ...secondary,
        ...primary,
        tasks: mergedTasks,
      };
    }
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
  tombstones: Record<string, number> = {}
) {
  return {
    ideas: mergeEntityCollection<Idea>(
      local.ideas,
      remote.ideas,
      baseline?.ideas,
      tombstones
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
    },
  };
}

/**
 * High-level 3-Way Merge for any LifeOS module data.
 */
export function mergeModuleData(
  module: SyncModuleKey,
  localData: unknown,
  remoteData: unknown,
  baselineData?: unknown,
  tombstones: Record<string, number> = {}
): unknown {
  switch (module) {
    case 'finance':
      return {
        finance: mergeFinanceModule(
          (localData as { finance: Finance }).finance,
          (remoteData as { finance: Finance }).finance,
          baselineData ? (baselineData as { finance: Finance }).finance : undefined,
          tombstones
        ),
      };
    case 'gym':
      return {
        gym: mergeGymModule(
          (localData as { gym: Gym }).gym,
          (remoteData as { gym: Gym }).gym,
          baselineData ? (baselineData as { gym: Gym }).gym : undefined,
          tombstones
        ),
      };
    case 'tasks':
      return mergeTasksModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones
      );
    case 'agenda':
      return {
        agenda: mergeAgendaModule(
          (localData as { agenda: AgendaWeek }).agenda,
          (remoteData as { agenda: AgendaWeek }).agenda,
          baselineData ? (baselineData as { agenda: AgendaWeek }).agenda : undefined,
          tombstones
        ),
      };
    case 'notes':
      return {
        notes: mergeNotesModule(
          (localData as { notes: Notes }).notes,
          (remoteData as { notes: Notes }).notes,
          baselineData ? (baselineData as { notes: Notes }).notes : undefined,
          tombstones
        ),
      };
    case 'goals':
      return mergeGoalsModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones
      );
    case 'calendar':
      return mergeCalendarModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones
      );
    case 'context':
      return mergeContextModule(
        localData as any,
        remoteData as any,
        baselineData as any
      );
    case 'study':
      return {
        study: mergeStudyModule(
          (localData as { study: Study }).study,
          (remoteData as { study: Study }).study,
          baselineData ? (baselineData as { study: Study }).study : undefined,
          tombstones
        ),
      };
    case 'streaming':
      return {
        streaming: mergeStreamingModule(
          (localData as { streaming: Streaming }).streaming,
          (remoteData as { streaming: Streaming }).streaming,
          baselineData ? (baselineData as { streaming: Streaming }).streaming : undefined,
          tombstones
        ),
      };
    case 'jobs':
      return {
        jobs: mergeJobsModule(
          (localData as { jobs: Jobs }).jobs,
          (remoteData as { jobs: Jobs }).jobs,
          baselineData ? (baselineData as { jobs: Jobs }).jobs : undefined,
          tombstones
        ),
      };
    case 'resale':
      return {
        resale: mergeResaleModule(
          (localData as { resale: Resale }).resale,
          (remoteData as { resale: Resale }).resale,
          baselineData ? (baselineData as { resale: Resale }).resale : undefined,
          tombstones
        ),
      };
    case 'ideas':
      return mergeIdeasModule(
        localData as any,
        remoteData as any,
        baselineData as any,
        tombstones
      );
    case 'checkout':
      return mergeCheckoutModule(
        localData as any,
        remoteData as any,
        baselineData as any
      );
    case 'profile':
      return mergeProfileModule(
        localData as any,
        remoteData as any,
        baselineData as any
      );
    default:
      return remoteData;
  }
}
