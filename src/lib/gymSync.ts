import type {
  Exercise,
  Gym,
  GymRevision,
  GymSession,
  GymSet,
  GymSyncMetadata,
  MeasurementPoint,
  RoutineTemplate,
  WeightPoint,
} from '../types';
import { isRoutineIconName } from '../types';

const SYNC_VERSION = 2 as const;

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function equal(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function normalizeRevision(value: unknown): GymRevision | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!Number.isSafeInteger(candidate.counter) || Number(candidate.counter) < 0) return undefined;
  if (typeof candidate.deviceId !== 'string' || !candidate.deviceId) return undefined;
  return { counter: Number(candidate.counter), deviceId: candidate.deviceId };
}

export function compareGymRevisions(a?: GymRevision, b?: GymRevision): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.counter - b.counter || a.deviceId.localeCompare(b.deviceId);
}

function maxRevision(a?: GymRevision, b?: GymRevision): GymRevision | undefined {
  return compareGymRevisions(a, b) >= 0 ? a : b;
}

export function normalizeGymSyncMetadata(value: unknown): GymSyncMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const fields: Record<string, GymRevision> = {};
  const tombstones: Record<string, GymRevision> = {};
  const rawFields = candidate.fields && typeof candidate.fields === 'object' && !Array.isArray(candidate.fields)
    ? candidate.fields as Record<string, unknown>
    : {};
  const rawTombstones = candidate.tombstones && typeof candidate.tombstones === 'object' && !Array.isArray(candidate.tombstones)
    ? candidate.tombstones as Record<string, unknown>
    : {};
  for (const [path, raw] of Object.entries(rawFields)) {
    const revision = normalizeRevision(raw);
    if (revision) fields[path] = revision;
  }
  for (const [path, raw] of Object.entries(rawTombstones)) {
    const revision = normalizeRevision(raw);
    if (revision) tombstones[path] = revision;
  }
  const highest = [...Object.values(fields), ...Object.values(tombstones)]
    .reduce((max, revision) => Math.max(max, revision.counter), 0);
  const rawClock = Number.isSafeInteger(candidate.clock) && Number(candidate.clock) >= 0
    ? Number(candidate.clock)
    : 0;
  if (candidate.version !== SYNC_VERSION && highest === 0 && rawClock === 0) return undefined;
  return { version: SYNC_VERSION, clock: Math.max(rawClock, highest), fields, tombstones };
}

function mergeRevisionMaps(
  local: Record<string, GymRevision>,
  remote: Record<string, GymRevision>
): Record<string, GymRevision> {
  const result: Record<string, GymRevision> = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const revision = maxRevision(local[key], remote[key]);
    if (revision) result[key] = revision;
  }
  return result;
}

function mergeMetadata(local?: GymSyncMetadata, remote?: GymSyncMetadata): GymSyncMetadata | undefined {
  if (!local && !remote) return undefined;
  const l = local || { version: SYNC_VERSION, clock: 0, fields: {}, tombstones: {} };
  const r = remote || { version: SYNC_VERSION, clock: 0, fields: {}, tombstones: {} };
  return {
    version: SYNC_VERSION,
    clock: Math.max(l.clock, r.clock),
    fields: mergeRevisionMaps(l.fields, r.fields),
    tombstones: mergeRevisionMaps(l.tombstones, r.tombstones),
  };
}

function part(value: string): string {
  return encodeURIComponent(value);
}

export const gymSyncPath = {
  session: (sessionId: string) => `session/${part(sessionId)}`,
  sessionExercise: (sessionId: string, exerciseId: string) => `session/${part(sessionId)}/exercise/${part(exerciseId)}`,
  sessionSet: (sessionId: string, exerciseId: string, setId: string) => `session/${part(sessionId)}/exercise/${part(exerciseId)}/set/${part(setId)}`,
  template: (templateId: string) => `template/${part(templateId)}`,
  templateExercise: (templateId: string, exerciseId: string) => `template/${part(templateId)}/exercise/${part(exerciseId)}`,
  templateSet: (templateId: string, exerciseId: string, setId: string) => `template/${part(templateId)}/exercise/${part(exerciseId)}/set/${part(setId)}`,
  restDay: (date: string) => `restDay/${part(date)}`,
  weight: (date: string) => `weight/${part(date)}`,
  measurement: (date: string) => `measurement/${part(date)}`,
};

function legacyExerciseKey(exercise: Exercise, index: number): string {
  if (exercise.id) return exercise.id;
  const name = exercise.name.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return `legacy-${name || index}`;
}

function exerciseOrder(exercises: Exercise[] = []): string[] {
  return exercises.map(legacyExerciseKey);
}

function indexBy<T>(items: T[], key: (item: T, index: number) => string): Map<string, T> {
  return new Map(items.map((item, index) => [key(item, index), item]));
}

function recordFieldChanges(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  entityPath: string,
  fields: string[],
  changed: Set<string>
): void {
  if (!before) changed.add(`${entityPath}/$entity`);
  for (const field of fields) {
    if (!before || !equal(before[field], after[field])) changed.add(`${entityPath}/${field}`);
  }
}

function recordSetChanges(before: GymSet[] = [], after: GymSet[] = [], ownerPath: string, changed: Set<string>, deleted: Set<string>): void {
  const beforeMap = indexBy(before, (set) => set.id);
  const afterMap = indexBy(after, (set) => set.id);
  for (const [id, set] of afterMap) {
    const path = `${ownerPath}/set/${part(id)}`;
    recordFieldChanges(beforeMap.get(id) as unknown as Record<string, unknown> | undefined, set as unknown as Record<string, unknown>, path,
      ['weight', 'reps', 'completed', 'completedAt', 'rpe', 'type'], changed);
  }
  for (const id of beforeMap.keys()) if (!afterMap.has(id)) deleted.add(`${ownerPath}/set/${part(id)}`);
}

function recordExerciseChanges(
  before: Exercise[] = [],
  after: Exercise[] = [],
  ownerPath: string,
  changed: Set<string>,
  deleted: Set<string>
): void {
  const beforeMap = indexBy(before, legacyExerciseKey);
  const afterMap = indexBy(after, legacyExerciseKey);
  for (const [id, exercise] of afterMap) {
    const path = `${ownerPath}/exercise/${part(id)}`;
    const previous = beforeMap.get(id);
    recordFieldChanges(previous as unknown as Record<string, unknown> | undefined, exercise as unknown as Record<string, unknown>, path,
      ['name', 'equipment', 'weight', 'barWeight', 'reps', 'muscleGroup', 'restSeconds', 'timerEnabled', 'legacyReps'], changed);
    recordSetChanges(previous?.sets, exercise.sets, path, changed, deleted);
  }
  for (const id of beforeMap.keys()) if (!afterMap.has(id)) deleted.add(`${ownerPath}/exercise/${part(id)}`);
}

function collectMutationPaths(before: Gym, after: Gym): { changed: Set<string>; deleted: Set<string> } {
  const changed = new Set<string>();
  const deleted = new Set<string>();
  const beforeSessions = indexBy(before.sessions || [], (session) => session.id);
  const afterSessions = indexBy(after.sessions || [], (session) => session.id);
  for (const [id, session] of afterSessions) {
    const path = gymSyncPath.session(id);
    const previous = beforeSessions.get(id);
    recordFieldChanges(previous as unknown as Record<string, unknown> | undefined, session as unknown as Record<string, unknown>, path,
      ['date', 'weekLabel', 'status', 'startedAt', 'finishedAt'], changed);
    recordExerciseChanges(previous?.exercises, session.exercises, path, changed, deleted);
  }
  for (const id of beforeSessions.keys()) if (!afterSessions.has(id)) deleted.add(gymSyncPath.session(id));

  const beforeTemplates = indexBy(before.routineTemplates || [], (template) => template.id);
  const afterTemplates = indexBy(after.routineTemplates || [], (template) => template.id);
  for (const [id, template] of afterTemplates) {
    const path = gymSyncPath.template(id);
    const previous = beforeTemplates.get(id);
    recordFieldChanges(previous as unknown as Record<string, unknown> | undefined, template as unknown as Record<string, unknown>, path,
      ['name', 'days', 'appearance'], changed);
    if (previous && !equal(exerciseOrder(previous.exercises), exerciseOrder(template.exercises))) {
      changed.add(`${path}/exerciseOrder`);
    }
    recordExerciseChanges(previous?.exercises, template.exercises, path, changed, deleted);
  }
  for (const id of beforeTemplates.keys()) if (!afterTemplates.has(id)) deleted.add(gymSyncPath.template(id));

  const recordDateValues = <T extends { date: string }>(
    oldItems: T[], newItems: T[], pathFor: (date: string) => string, fields: string[]
  ) => {
    const oldMap = indexBy(oldItems, (item) => item.date);
    const newMap = indexBy(newItems, (item) => item.date);
    for (const [date, item] of newMap) {
      const path = pathFor(date);
      recordFieldChanges(oldMap.get(date) as unknown as Record<string, unknown> | undefined, item as unknown as Record<string, unknown>, path, fields, changed);
    }
    for (const date of oldMap.keys()) if (!newMap.has(date)) deleted.add(pathFor(date));
  };
  recordDateValues(before.weight || [], after.weight || [], gymSyncPath.weight, ['kg']);
  recordDateValues(before.measurements || [], after.measurements || [], gymSyncPath.measurement, ['waist']);

  const beforeRest = new Set(before.restDays || []);
  const afterRest = new Set(after.restDays || []);
  for (const date of afterRest) if (!beforeRest.has(date)) changed.add(`${gymSyncPath.restDay(date)}/$entity`);
  for (const date of beforeRest) if (!afterRest.has(date)) deleted.add(gymSyncPath.restDay(date));
  return { changed, deleted };
}

/** Assigns one Lamport revision to every real Gym change in a single UI action. */
export function stampGymMutation(before: Gym, after: Gym, deviceId: string): GymRevision | null {
  const { changed, deleted } = collectMutationPaths(before, after);
  if (changed.size === 0 && deleted.size === 0) return null;
  const current = mergeMetadata(
    normalizeGymSyncMetadata(before._sync),
    normalizeGymSyncMetadata(after._sync)
  ) || {
    version: SYNC_VERSION,
    clock: 0,
    fields: {},
    tombstones: {},
  };
  const revision = { counter: current.clock + 1, deviceId: deviceId || 'unknown-device' };
  const fields = { ...current.fields };
  const tombstones = { ...current.tombstones };
  for (const path of changed) fields[path] = revision;
  for (const path of deleted) tombstones[path] = revision;
  after._sync = { version: SYNC_VERSION, clock: revision.counter, fields, tombstones };
  return revision;
}

interface MergeContext {
  localMeta?: GymSyncMetadata;
  remoteMeta?: GymSyncMetadata;
  mergedMeta?: GymSyncMetadata;
  externalTombstones: Record<string, number>;
}

function resolveField<T>(path: string, local: T, remote: T, baseline: T | undefined, context: MergeContext): T {
  const localRevision = context.localMeta?.fields[path];
  const remoteRevision = context.remoteMeta?.fields[path];
  const order = compareGymRevisions(localRevision, remoteRevision);
  if (order > 0) return local;
  if (order < 0) return remote;
  if (equal(local, remote)) return local;
  if (localRevision || remoteRevision) {
    return stableStringify(local) >= stableStringify(remote) ? local : remote;
  }
  if (baseline !== undefined) {
    if (equal(local, baseline)) return remote;
    if (equal(remote, baseline)) return local;
  }
  return stableStringify(local) >= stableStringify(remote) ? local : remote;
}

function isDeleted(path: string, context: MergeContext): boolean {
  if (context.externalTombstones[`gym/${path}`]) return true;
  const deletion = context.mergedMeta?.tombstones[path];
  if (!deletion) return false;
  const prefix = `${path}/`;
  const newestSurvivingChange = Object.entries(context.mergedMeta?.fields || {})
    .filter(([fieldPath]) => fieldPath === `${path}/$entity` || fieldPath.startsWith(prefix))
    .reduce<GymRevision | undefined>((latest, [, revision]) => maxRevision(latest, revision), undefined);
  // Same logical tick is concurrent: deletion wins. A strictly later action may recreate the entity.
  return !newestSurvivingChange || newestSurvivingChange.counter <= deletion.counter;
}

function mergeCollection<T>(
  local: T[] = [],
  remote: T[] = [],
  baseline: T[] = [],
  key: (item: T, index: number) => string,
  path: (id: string) => string,
  merge: (localItem: T, remoteItem: T, baseItem: T | undefined, entityPath: string) => T,
  context: MergeContext
): T[] {
  const localMap = indexBy(local, key);
  const remoteMap = indexBy(remote, key);
  const baseMap = indexBy(baseline, key);
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys(), ...baseMap.keys()]);
  const baselineOrder = baseline.map(key).filter((id, index, items) => items.indexOf(id) === index);
  const baselineIds = new Set(baselineOrder);
  const ids = [...baselineOrder, ...[...allIds].filter((id) => !baselineIds.has(id)).sort()];
  const result: T[] = [];
  for (const id of ids) {
    const entityPath = path(id);
    if (isDeleted(entityPath, context)) continue;
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const b = baseMap.get(id);
    if (l !== undefined && r !== undefined) result.push(merge(l, r, b, entityPath));
    else if (l !== undefined && r === undefined) {
      if (b === undefined) result.push(l);
      // If it existed in the baseline, absence is a legacy deletion. Delete wins over edit.
    } else if (r !== undefined && l === undefined) {
      if (b === undefined) result.push(r);
    }
  }
  return result;
}

function mergeSet(local: GymSet, remote: GymSet, baseline: GymSet | undefined, path: string, context: MergeContext): GymSet {
  const completed = resolveField(`${path}/completed`, local.completed, remote.completed, baseline?.completed, context);
  const type = resolveField(`${path}/type`, local.type, remote.type, baseline?.type, context);
  const merged: GymSet = {
    id: local.id || remote.id,
    weight: resolveField(`${path}/weight`, local.weight, remote.weight, baseline?.weight, context),
    reps: resolveField(`${path}/reps`, local.reps, remote.reps, baseline?.reps, context),
    completed,
    completedAt: completed
      ? resolveField(`${path}/completedAt`, local.completedAt ?? null, remote.completedAt ?? null, baseline?.completedAt ?? null, context)
      : null,
    rpe: resolveField(`${path}/rpe`, local.rpe, remote.rpe, baseline?.rpe, context),
  };
  if (type !== undefined) merged.type = type;
  return merged;
}

function buildExerciseAliases(collections: Exercise[][]): Map<string, string> {
  const idsByName = new Map<string, Set<string>>();
  for (const exercises of collections) {
    for (const exercise of exercises) {
      if (!exercise.id) continue;
      const name = exercise.name.trim().toLocaleLowerCase();
      if (!idsByName.has(name)) idsByName.set(name, new Set());
      idsByName.get(name)?.add(exercise.id);
    }
  }
  const aliases = new Map<string, string>();
  for (const [name, ids] of idsByName) if (ids.size === 1) aliases.set(name, [...ids][0]);
  return aliases;
}

function mergeExercises(
  local: Exercise[] = [], remote: Exercise[] = [], baseline: Exercise[] = [], ownerPath: string, context: MergeContext
): Exercise[] {
  const aliases = buildExerciseAliases([local, remote, baseline]);
  const key = (exercise: Exercise, index: number) => exercise.id
    || aliases.get(exercise.name.trim().toLocaleLowerCase())
    || legacyExerciseKey(exercise, index);
  return mergeCollection(local, remote, baseline, key, (id) => `${ownerPath}/exercise/${part(id)}`, (l, r, b, path) => {
    const sets = mergeCollection(l.sets, r.sets, b?.sets || [], (set) => set.id, (id) => `${path}/set/${part(id)}`,
      (ls, rs, bs, setPath) => mergeSet(ls, rs, bs, setPath, context), context);
    const result: Exercise = {
      id: l.id || r.id,
      name: resolveField(`${path}/name`, l.name, r.name, b?.name, context),
      equipment: resolveField(`${path}/equipment`, l.equipment, r.equipment, b?.equipment, context),
      weight: resolveField(`${path}/weight`, l.weight, r.weight, b?.weight, context),
      barWeight: resolveField(`${path}/barWeight`, l.barWeight, r.barWeight, b?.barWeight, context),
      reps: resolveField(`${path}/reps`, l.reps, r.reps, b?.reps, context),
      muscleGroup: resolveField(`${path}/muscleGroup`, l.muscleGroup, r.muscleGroup, b?.muscleGroup, context),
      restSeconds: resolveField(`${path}/restSeconds`, l.restSeconds, r.restSeconds, b?.restSeconds, context),
      timerEnabled: resolveField(`${path}/timerEnabled`, l.timerEnabled, r.timerEnabled, b?.timerEnabled, context),
      legacyReps: resolveField(`${path}/legacyReps`, l.legacyReps, r.legacyReps, b?.legacyReps, context),
      sets,
    };
    if (!result.id) delete result.id;
    return result;
  }, context);
}

function mergeSession(local: GymSession, remote: GymSession, baseline: GymSession | undefined, path: string, context: MergeContext): GymSession {
  const status = resolveField(`${path}/status`, local.status, remote.status, baseline?.status, context);
  return {
    id: local.id || remote.id,
    date: resolveField(`${path}/date`, local.date, remote.date, baseline?.date, context),
    weekLabel: resolveField(`${path}/weekLabel`, local.weekLabel, remote.weekLabel, baseline?.weekLabel, context),
    status,
    startedAt: resolveField(`${path}/startedAt`, local.startedAt, remote.startedAt, baseline?.startedAt, context),
    finishedAt: status === 'active'
      ? null
      : resolveField(`${path}/finishedAt`, local.finishedAt, remote.finishedAt, baseline?.finishedAt, context),
    exercises: mergeExercises(local.exercises, remote.exercises, baseline?.exercises, path, context),
  };
}

function mergeTemplate(local: RoutineTemplate, remote: RoutineTemplate, baseline: RoutineTemplate | undefined, path: string, context: MergeContext): RoutineTemplate {
  const exercises = mergeExercises(local.exercises, remote.exercises, baseline?.exercises, path, context);
  const order = resolveField(
    `${path}/exerciseOrder`,
    exerciseOrder(local.exercises),
    exerciseOrder(remote.exercises),
    baseline ? exerciseOrder(baseline.exercises) : undefined,
    context
  );
  const exercisesById = indexBy(exercises, legacyExerciseKey);
  const orderedExercises = order.flatMap((id) => {
    const exercise = exercisesById.get(id);
    if (!exercise) return [];
    exercisesById.delete(id);
    return [exercise];
  });
  orderedExercises.push(...exercisesById.values());
  const appearance = resolveField(`${path}/appearance`, local.appearance, remote.appearance, baseline?.appearance, context);
  const result: RoutineTemplate = {
    id: local.id || remote.id,
    name: resolveField(`${path}/name`, local.name, remote.name, baseline?.name, context),
    days: resolveField(`${path}/days`, local.days, remote.days, baseline?.days, context),
    exercises: orderedExercises,
  };
  if (appearance && typeof appearance === 'object' && 'icon' in appearance && isRoutineIconName(appearance.icon)) {
    result.appearance = { icon: appearance.icon };
  }
  return result;
}

function mergeRestDays(local: string[], remote: string[], baseline: string[], context: MergeContext): string[] {
  const l = new Set(local);
  const r = new Set(remote);
  const b = new Set(baseline);
  const result: string[] = [];
  for (const date of [...new Set([...l, ...r, ...b])].sort()) {
    const path = gymSyncPath.restDay(date);
    if (isDeleted(path, context)) continue;
    if (l.has(date) && r.has(date)) result.push(date);
    else if (!b.has(date)) result.push(date);
    // A missing baseline value is a legacy deletion; delete wins.
  }
  return result;
}

function mergeDatePoints<T extends { date: string }>(
  local: T[], remote: T[], baseline: T[], pathFor: (date: string) => string, field: keyof T, context: MergeContext
): T[] {
  return mergeCollection(local, remote, baseline, (item) => item.date, pathFor, (l, r, b, path) => ({
    date: l.date || r.date,
    [field]: resolveField(`${path}/${String(field)}`, l[field], r[field], b?.[field], context),
  }) as T, context).sort((a, b) => a.date.localeCompare(b.date));
}

/** Pure ACI join. It never reads time and never creates a revision. */
export function mergeGymState(
  local: Gym,
  remote: Gym,
  baseline?: Gym,
  externalTombstones: Record<string, number> = {}
): Gym {
  const localMeta = normalizeGymSyncMetadata(local._sync);
  const remoteMeta = normalizeGymSyncMetadata(remote._sync);
  const mergedMeta = mergeMetadata(localMeta, remoteMeta);
  const context: MergeContext = { localMeta, remoteMeta, mergedMeta, externalTombstones };
  const sessions = mergeCollection(local.sessions || [], remote.sessions || [], baseline?.sessions || [], (session) => session.id,
    gymSyncPath.session, (l, r, b, path) => mergeSession(l, r, b, path, context), context)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
  const templates = mergeCollection(local.routineTemplates || [], remote.routineTemplates || [], baseline?.routineTemplates || [],
    (template) => template.id, gymSyncPath.template, (l, r, b, path) => mergeTemplate(l, r, b, path, context), context)
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    sessions,
    weight: mergeDatePoints<WeightPoint>(local.weight || [], remote.weight || [], baseline?.weight || [], gymSyncPath.weight, 'kg', context),
    measurements: mergeDatePoints<MeasurementPoint>(local.measurements || [], remote.measurements || [], baseline?.measurements || [], gymSyncPath.measurement, 'waist', context),
    routineTemplates: templates,
    restDays: mergeRestDays(local.restDays || [], remote.restDays || [], baseline?.restDays || [], context),
    activeTimer: null,
    ...(mergedMeta ? { _sync: mergedMeta } : {}),
  };
}
