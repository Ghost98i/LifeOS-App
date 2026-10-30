import type { LifeOSState, ResaleItem, Transaction } from '../types';
import { defaultState } from './storage';
import {
  SYNC_MODULE_LABELS,
  applySyncModule,
  buildStateFromModules,
  syncDataFingerprint,
  syncModuleData,
  type SyncModuleKey,
  type SyncRevisionMap,
} from './syncModel';
import { validateDurableCommercial } from './commercialDurable';
import type { ResaleConflictRecord } from './resaleConflictRecovery';
import { addRemoteResaleVersion } from './resaleConflictRecovery';
import {
  chunkSyncModulesForTransaction,
  CloudRevisionConflict,
  ResaleRevisionConflict,
} from './cloudSync';

export type ResaleResolutionPlan =
  | { status: 'ready'; modules: SyncModuleKey[] }
  | { status: 'blocked'; reason: string };

function linkedTransactionsValid(state: LifeOSState): boolean {
  const transactions = state.finance.transactions;
  const byId = new Map<string, Transaction>();
  for (const transaction of transactions) {
    if (byId.has(transaction.id)) return false;
    byId.set(transaction.id, transaction);
  }
  const used = new Set<string>();
  const matches = (id: string | null | undefined, type: Transaction['type'], amount: number, accountId?: string | null) => {
    if (!id) return true;
    const transaction = byId.get(id);
    if (!transaction || used.has(id) || transaction.type !== type || transaction.amount !== amount ||
        (accountId && transaction.accountId !== accountId) ||
        (transaction.accountId && !state.finance.accounts.some((account) => account.id === transaction.accountId)) ||
        !['reventa', 'resale_purchase', 'resale_sale'].includes(transaction.origin ?? '')) return false;
    used.add(id);
    return true;
  };
  for (const item of state.resale.inventory as ResaleItem[]) {
    const breakdown = Number(item.shippingCost || 0) + Number(item.platformFees || 0) + Number(item.taxes || 0);
    const fees = breakdown > 0 ? breakdown : Number(item.fees || 0);
    if (!matches(item.purchaseTxId, 'gasto', item.buyPrice, item.purchaseAccountId) ||
        !matches(item.saleTxId || item.financeTxId, 'ingreso', Number(item.sellPrice || 0), item.saleAccountId) ||
        !matches(item.feeTxId, 'gasto', fees, item.saleAccountId)) return false;
  }
  return true;
}

export function assessResaleConflictResolution(
  record: ResaleConflictRecord,
  localState: LifeOSState,
  remoteData: Partial<Record<SyncModuleKey, unknown>>,
  remoteRevisions: SyncRevisionMap,
): ResaleResolutionPlan {
  if (record.modules.some((module) => module !== 'resale' && module !== 'finance')) {
    return { status: 'blocked', reason: 'La publicación incluye otros módulos; no se puede cerrarla desde Mi negocio.' };
  }
  const hasLinks = localState.resale.inventory.some((item) => Boolean(item.purchaseTxId || item.saleTxId || item.financeTxId || item.feeTxId));
  const modules: SyncModuleKey[] = hasLinks || record.modules.includes('finance') ? ['resale', 'finance'] : ['resale'];
  const priorRemote = record.remoteVersions.at(-1);
  for (const module of modules) {
    if (!remoteData[module] || !remoteRevisions[module]) {
      return { status: 'blocked', reason: `Falta una versión remota verificable de ${module}.` };
    }
    if (record.modules.includes(module) && syncDataFingerprint(record.local[module]) !== syncDataFingerprint(syncModuleData(localState, module))) {
      return { status: 'blocked', reason: `Hay cambios locales posteriores en ${module}; requieren revisión.` };
    }
    if (priorRemote?.revisions[module] && priorRemote.revisions[module] !== remoteRevisions[module]) {
      return { status: 'blocked', reason: `La revisión remota de ${module} volvió a cambiar; revisá la nueva versión.` };
    }
    if (syncDataFingerprint(syncModuleData(localState, module)) !== syncDataFingerprint(remoteData[module])) {
      return { status: 'blocked', reason: `Las versiones de ${module} contienen datos distintos; no se elegirá una automáticamente.` };
    }
  }
  if (!linkedTransactionsValid(localState)) {
    return { status: 'blocked', reason: 'Algún vínculo entre un artículo y su transacción financiera es inexistente o inconsistente.' };
  }
  return { status: 'ready', modules };
}

export async function confirmMatchingResaleConflict(
  record: ResaleConflictRecord,
  localState: LifeOSState,
  remoteData: Partial<Record<SyncModuleKey, unknown>>,
  remoteRevisions: SyncRevisionMap,
  dependencies: {
    save: (record: ResaleConflictRecord) => boolean;
    publish: (modules: SyncModuleKey[], revisions: SyncRevisionMap) => Promise<{
      writes: Array<{ module: SyncModuleKey; revision: string }>;
      diverged?: boolean;
      incompatibleProtocol?: boolean;
      completion: Promise<void>;
    }>;
    currentState: () => LifeOSState;
  },
): Promise<
  | { status: 'confirmed'; record: ResaleConflictRecord; writes: Array<{ module: SyncModuleKey; revision: string }>; modules: SyncModuleKey[] }
  | { status: 'blocked'; record: ResaleConflictRecord; reason: string; durable: boolean }
> {
  const plan = assessResaleConflictResolution(record, localState, remoteData, remoteRevisions);
  const pending = addRemoteResaleVersion({ ...record, diagnostic: record.diagnostic || (plan.status === 'blocked' ? plan.reason : record.diagnostic) },
    remoteData, remoteRevisions);
  if (!dependencies.save(pending)) {
    return { status: 'blocked', record: pending, reason: 'No se pudo conservar el respaldo antes de resolver.', durable: false };
  }
  if (plan.status === 'blocked') return { status: 'blocked', record: pending, reason: plan.reason, durable: true };
  const blockAfterAttempt = (reason: string) => {
    const diagnosed = { ...pending, diagnostic: pending.diagnostic || reason };
    return { status: 'blocked' as const, record: diagnosed, reason, durable: dependencies.save(diagnosed) };
  };
  try {
    const publication = await dependencies.publish(plan.modules, remoteRevisions);
    if (publication.diverged || publication.incompatibleProtocol) {
      return blockAfterAttempt('La revisión remota cambió antes de confirmar.');
    }
    await publication.completion;
    if (plan.modules.some((module) => syncDataFingerprint(syncModuleData(dependencies.currentState(), module)) !== syncDataFingerprint(syncModuleData(localState, module)))) {
      return blockAfterAttempt('Hubo cambios locales nuevos durante la publicación.');
    }
    const resolved: ResaleConflictRecord = { ...pending, status: 'resolved', resolvedAt: new Date().toISOString() };
    if (!dependencies.save(resolved)) {
      return { status: 'blocked', record: pending, reason: 'La publicación terminó, pero no pudo guardarse su confirmación local.', durable: false };
    }
    return { status: 'confirmed', record: resolved, writes: publication.writes, modules: plan.modules };
  } catch {
    return blockAfterAttempt('La publicación falló o la revisión remota cambió. El conflicto sigue bloqueado.');
  }
}

export type ReconciliationModuleStatus =
  | 'identical'
  | 'local_only_changes'
  | 'remote_only_changes'
  | 'diverged'
  | 'missing_remote';

export interface ReconciliationModulePreview {
  module: SyncModuleKey;
  label: string;
  status: ReconciliationModuleStatus;
  localSummary: string;
  remoteSummary: string;
  baseSummary: string;
  localMatchesConflictSnapshot: boolean;
  basePresent: boolean;
  baseRevision: string | null;
  remoteRevision: string | null;
  revisionMatchesBase: boolean;
  baseRevisionMatchesRemote: boolean;
  remoteIsDefaultTemplate: boolean;
  reconciledInPartialRun: boolean;
  recommendedChoice: 'local' | 'remote';
}

export interface ResaleConflictReconciliationPreview {
  conflictId: string;
  diagnostic: string;
  modules: ReconciliationModulePreview[];
  identicalCount: number;
  differingCount: number;
  reconciledCount: number;
  pendingCount: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  divergedCount: number;
  missingRemoteCount: number;
  allLocalMatchCurrentLocal: boolean;
  allBaseRevisionsMatchRemote: boolean;
  baseIsEmpty: boolean;
  canReconcile: boolean;
  blockingReason?: string;
}

export function extractInitialRemoteData(
  record: ResaleConflictRecord,
  fallbackData?: Partial<Record<SyncModuleKey, unknown>>,
): Partial<Record<SyncModuleKey, unknown>> {
  const initial: Partial<Record<SyncModuleKey, unknown>> = {};
  for (const version of record.remoteVersions) {
    for (const [mod, val] of Object.entries(version.data || {})) {
      const key = mod as SyncModuleKey;
      if (val !== undefined && initial[key] === undefined) {
        initial[key] = structuredClone(val);
      }
    }
  }
  if (fallbackData) {
    for (const [mod, val] of Object.entries(fallbackData)) {
      const key = mod as SyncModuleKey;
      if (val !== undefined && initial[key] === undefined) {
        initial[key] = structuredClone(val);
      }
    }
  }
  return initial;
}

function hasRelatedCommercialOrFinance(state: LifeOSState): boolean {
  if (state.resale?.commercial) return true;
  if (
    (state.resale?.inventory ?? []).some((item) =>
      Boolean(item.purchaseTxId || item.saleTxId || item.feeTxId || item.financeTxId),
    )
  ) {
    return true;
  }
  return (state.finance?.transactions ?? []).some(
    (tx) =>
      tx.origin === 'resale_purchase' ||
      tx.origin === 'resale_sale' ||
      tx.origin === 'reventa' ||
      (typeof tx.origin === 'string' && tx.origin.startsWith('commercial:')),
  );
}

export function mergeConflictRemoteVersions(
  record: ResaleConflictRecord,
  latestRemoteData?: Partial<Record<SyncModuleKey, unknown>>,
  latestRemoteRevisions?: SyncRevisionMap,
): {
  data: Partial<Record<SyncModuleKey, unknown>>;
  revisions: SyncRevisionMap;
} {
  const data: Partial<Record<SyncModuleKey, unknown>> = {};
  const revisions: SyncRevisionMap = {};
  for (const version of record.remoteVersions) {
    for (const [mod, val] of Object.entries(version.data || {})) {
      if (val !== undefined) data[mod as SyncModuleKey] = structuredClone(val);
    }
    for (const [mod, rev] of Object.entries(version.revisions || {})) {
      if (typeof rev === 'string' && rev) revisions[mod as SyncModuleKey] = rev;
    }
  }
  if (latestRemoteData) {
    for (const [mod, val] of Object.entries(latestRemoteData)) {
      if (val !== undefined) data[mod as SyncModuleKey] = structuredClone(val);
    }
  }
  if (latestRemoteRevisions) {
    for (const [mod, rev] of Object.entries(latestRemoteRevisions)) {
      if (typeof rev === 'string' && rev) revisions[mod as SyncModuleKey] = rev;
    }
  }
  return { data, revisions };
}

export function isModuleEffectivelyDefaultTemplate(module: SyncModuleKey, rawData: unknown): boolean {
  if (!rawData || typeof rawData !== 'object') return false;
  const def = defaultState();
  const defData = syncModuleData(def, module);
  if (syncDataFingerprint(rawData) === syncDataFingerprint(defData)) return true;
  try {
    const state = applySyncModule(defaultState(), module, rawData);
    switch (module) {
      case 'profile':
        return (
          !state.profile.name.trim() &&
          state.profile.height === def.profile.height &&
          !state.profile.bodyCompositionSex &&
          !state.settings.darkMode &&
          !state.settings.lastBackupAt &&
          !state.settings.lastWeeklyReviewAt &&
          (state.settings.dismissedAttentionKeys || []).length === 0 &&
          Object.keys(state.settings.attentionDismissals || {}).length === 0
        );
      case 'tasks': {
        const sig = (items: LifeOSState['tasksRecurring']) =>
          (items || []).map(({ name, freq, days }) => ({ name, freq, days: days || [] }));
        return (
          Object.keys(state.taskLog || {}).length === 0 &&
          (state.todayExtras || []).length === 0 &&
          (state.dailyPriorities || []).length === 0 &&
          (state.inbox || []).length === 0 &&
          JSON.stringify(sig(state.tasksRecurring)) === JSON.stringify(sig(def.tasksRecurring))
        );
      }
      case 'finance': {
        const accounts = state.finance.accounts || [];
        const defaultAccounts =
          accounts.length === 2 &&
          accounts[0]?.name === 'Efectivo' &&
          accounts[1]?.name === 'Banco' &&
          accounts.every((a) => Number(a.balance) === 0);
        return (
          defaultAccounts &&
          state.finance.transactions.length === 0 &&
          state.finance.transfers.length === 0 &&
          state.finance.reconciliations.length === 0 &&
          state.finance.debts.length === 0 &&
          state.finance.investments.length === 0 &&
          state.finance.subscriptions.length === 0 &&
          state.finance.expectedIncomes.length === 0 &&
          (state.finance.commitments || []).length === 0 &&
          (state.finance.agreements || []).length === 0 &&
          Object.keys(state.finance.budgets || {}).every((k) => Number(state.finance.budgets[k]) === 0)
        );
      }
      case 'gym':
        return (
          state.gym.weight.length === 0 &&
          state.gym.measurements.length === 0 &&
          state.gym.sessions.length === 0 &&
          state.gym.routineTemplates.length === 0 &&
          state.gym.restDays.length === 0
        );
      default:
        return syncDataFingerprint(syncModuleData(state, module)) === syncDataFingerprint(defData);
    }
  } catch {
    return false;
  }
}

export function summarizeModuleForReconciliation(module: SyncModuleKey, rawData: unknown): string {
  if (rawData === undefined || rawData === null || typeof rawData !== 'object') return 'Sin copia disponible';
  try {
    const state = applySyncModule(defaultState(), module, rawData);
    switch (module) {
      case 'profile': {
        const hasName = Boolean(state.profile.name.trim());
        const dismissed = (state.settings.dismissedAttentionKeys || []).length;
        const hidden = (state.settings.hiddenTabs || []).length;
        const parts = [
          hasName ? 'Perfil configurado' : 'Perfil en plantilla',
          state.settings.darkMode ? 'tema oscuro' : 'tema claro',
          `${hidden} pestaña(s) oculta(s)`,
        ];
        if (dismissed > 0) parts.push(`${dismissed} aviso(s) gestionado(s)`);
        if (state.settings.lastWeeklyReviewAt) parts.push('revisión semanal registrada');
        return parts.join(' · ');
      }
      case 'agenda': {
        const total = Object.values(state.agenda || {}).reduce(
          (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
          0,
        );
        return `${total} bloque(s) semanal(es)`;
      }
      case 'tasks': {
        const rec = (state.tasksRecurring || []).length;
        const days = Object.keys(state.taskLog || {}).length;
        const extras = (state.todayExtras || []).length;
        const prio = (state.dailyPriorities || []).length;
        return `${rec} recurrente(s) · ${days} día(s) en historial · ${extras} extra(s) · ${prio} prioridad(es)`;
      }
      case 'context':
        return `${(state.dailyContext || []).length} registro(s) de contexto diario`;
      case 'finance': {
        const f = state.finance;
        return `${f.transactions.length} mov. · ${f.transfers.length} transf. · ${f.accounts.length} cuenta(s) · ${(f.commitments || []).length} comprom. · ${(f.agreements || []).length} acuerdo(s)`;
      }
      case 'gym': {
        const g = state.gym;
        return `${g.sessions.length} sesión(es) · ${g.routineTemplates.length} rutina(s) · ${g.weight.length} peso(s) · ${g.measurements.length} medida(s)`;
      }
      case 'study': {
        const s = state.study;
        return `${s.subjects.length} materia(s) · ${s.exams.length} examen(es) · ${s.studyLog.length} sesión(es)`;
      }
      case 'streaming':
        return `${state.streaming.sessions.length} sesión(es) · meta ${state.streaming.monthlyGoal}h`;
      case 'jobs':
        return `${state.jobs.applications.length} postulación(es) · ${state.jobs.opportunities.length} oportunidad(es)`;
      case 'resale': {
        const r = state.resale;
        const b = r.commercial?.business;
        const comm = b
          ? `${b.purchases.length} compra(s), ${b.sales.length} venta(s), ${b.moneyEvents.length} cobro(s)/pago(s)`
          : 'sin operaciones comerciales';
        return `${r.inventory.length} art. legacy · ${comm}`;
      }
      case 'ideas':
        return `${state.ideas.length} idea(s)`;
      case 'calendar':
        return `${state.calendarEvents.length} evento(s)`;
      case 'goals':
        return `${state.goals.length} objetivo(s) · ${(state.projects || []).length} proyecto(s)`;
      case 'notes': {
        const n = state.notes;
        return `${n.postits.length} nota(s) · ${n.links.length} enlace(s) · ${n.shopping.length} compra(s) · ${n.possessions.length} posesión(es)`;
      }
      case 'checkout':
        return `${Object.keys(state.checkoutLog || {}).length} cierre(s) diario(s)`;
    }
  } catch {
    return 'Formato no reconocido';
  }
}

export function buildResaleConflictReconciliationPreview(
  record: ResaleConflictRecord,
  localState: LifeOSState,
  latestRemoteData?: Partial<Record<SyncModuleKey, unknown>>,
  latestRemoteRevisions?: SyncRevisionMap,
): ResaleConflictReconciliationPreview {
  const combinedRemote = mergeConflictRemoteVersions(record, latestRemoteData, latestRemoteRevisions);
  const reconciledSet = new Set<SyncModuleKey>(record.reconciledModules ?? []);
  const modulesPreview: ReconciliationModulePreview[] = [];

  let identicalCount = 0;
  let differingCount = 0;
  let reconciledCount = 0;
  let localOnlyCount = 0;
  let remoteOnlyCount = 0;
  let divergedCount = 0;
  let missingRemoteCount = 0;
  let allLocalMatchCurrentLocal = true;
  let allBaseRevisionsMatchRemote = true;

  for (const module of record.modules) {
    const currentModData = syncModuleData(localState, module);
    const conflictLocalData = record.local[module] ?? currentModData;
    const remoteModData = combinedRemote.data[module];
    const baseModData = record.base[module];
    const reconciledInPartialRun = reconciledSet.has(module);
    if (reconciledInPartialRun) reconciledCount += 1;

    const currentFp = syncDataFingerprint(currentModData);
    const conflictLocalFp = syncDataFingerprint(conflictLocalData);
    const localMatchesConflictSnapshot = currentFp === conflictLocalFp;
    if (!localMatchesConflictSnapshot) allLocalMatchCurrentLocal = false;

    const basePresent = baseModData !== undefined;
    const baseRevision = record.baseRevisions[module] ?? null;
    const remoteRevision = combinedRemote.revisions[module] ?? null;
    const revisionMatchesBase = baseRevision !== null && baseRevision === remoteRevision;
    if (!revisionMatchesBase) allBaseRevisionsMatchRemote = false;

    let status: ReconciliationModuleStatus;
    let recommendedChoice: 'local' | 'remote' = 'local';
    const remoteIsTemplate = remoteModData !== undefined
      ? isModuleEffectivelyDefaultTemplate(module, remoteModData)
      : false;

    if (remoteModData === undefined || !remoteRevision) {
      status = 'missing_remote';
      missingRemoteCount += 1;
      differingCount += 1;
    } else {
      const remoteFp = syncDataFingerprint(remoteModData);
      if (currentFp === remoteFp || reconciledInPartialRun) {
        status = 'identical';
        identicalCount += 1;
      } else {
        differingCount += 1;
        const localIsTemplate = isModuleEffectivelyDefaultTemplate(module, currentModData);
        const baseFp = basePresent ? syncDataFingerprint(baseModData) : null;

        if ((baseFp && baseFp === remoteFp) || (remoteIsTemplate && !localIsTemplate)) {
          status = 'local_only_changes';
          localOnlyCount += 1;
          recommendedChoice = 'local';
        } else if ((baseFp && baseFp === currentFp) || (localIsTemplate && !remoteIsTemplate)) {
          status = 'remote_only_changes';
          remoteOnlyCount += 1;
          recommendedChoice = 'remote';
        } else {
          status = 'diverged';
          divergedCount += 1;
          recommendedChoice = 'local';
        }
      }
    }

    modulesPreview.push({
      module,
      label: SYNC_MODULE_LABELS[module] ?? module,
      status,
      localSummary: summarizeModuleForReconciliation(module, currentModData),
      remoteSummary: summarizeModuleForReconciliation(module, remoteModData),
      baseSummary: basePresent ? summarizeModuleForReconciliation(module, baseModData) : 'Vacío (sin línea base previa)',
      localMatchesConflictSnapshot,
      basePresent,
      baseRevision,
      remoteRevision,
      revisionMatchesBase,
      baseRevisionMatchesRemote: revisionMatchesBase,
      remoteIsDefaultTemplate: remoteIsTemplate,
      reconciledInPartialRun,
      recommendedChoice,
    });
  }

  let blockingReason: string | undefined;
  if (missingRemoteCount > 0) {
    blockingReason = 'Falta recibir la versión remota verificable de uno o más módulos afectados.';
  } else if (!linkedTransactionsValid(localState)) {
    blockingReason = 'Algún vínculo entre un artículo de reventa y su transacción financiera es inconsistente.';
  } else if (
    localState.resale.commercial &&
    !validateDurableCommercial(localState.resale.commercial, {
      finance: localState.finance,
      resaleInventory: localState.resale.inventory,
    }).valid
  ) {
    blockingReason = 'El historial comercial local no supera la validación de integridad con Finanzas.';
  }

  return {
    conflictId: record.id,
    diagnostic: record.diagnostic,
    modules: modulesPreview,
    identicalCount,
    differingCount,
    reconciledCount,
    pendingCount: differingCount,
    localOnlyCount,
    remoteOnlyCount,
    divergedCount,
    missingRemoteCount,
    allLocalMatchCurrentLocal,
    allBaseRevisionsMatchRemote,
    baseIsEmpty: Object.keys(record.base || {}).length === 0,
    canReconcile: !blockingReason,
    blockingReason,
  };
}

export async function executeAuthorizedConflictReconciliation(
  record: ResaleConflictRecord,
  localState: LifeOSState,
  options: {
    authorized: boolean;
    choices?: Partial<Record<SyncModuleKey, 'local' | 'remote'>>;
    latestRemoteData?: Partial<Record<SyncModuleKey, unknown>>;
    latestRemoteRevisions?: SyncRevisionMap;
    maxBatchSize?: number;
  },
  dependencies: {
    saveConflict: (record: ResaleConflictRecord) => boolean;
    saveBackup?: (localSnapshot: LifeOSState, remoteSnapshot: LifeOSState) => boolean;
    onBatchConfirmed?: (
      batchWrites: Array<{ module: SyncModuleKey; revision: string }>,
      completedModules: SyncModuleKey[],
      pendingModules: SyncModuleKey[],
    ) => void;
    publish: (reconciledState: LifeOSState, modules: SyncModuleKey[], revisions: SyncRevisionMap) => Promise<{
      writes: Array<{ module: SyncModuleKey; revision: string }>;
      diverged?: boolean;
      incompatibleProtocol?: boolean;
      completion: Promise<void>;
    }>;
    currentState: () => LifeOSState;
  },
): Promise<
  | {
      status: 'confirmed';
      record: ResaleConflictRecord;
      reconciledState: LifeOSState;
      writes: Array<{ module: SyncModuleKey; revision: string }>;
      adoptedRevisions: SyncRevisionMap;
      modules: SyncModuleKey[];
      completedModules: SyncModuleKey[];
      pendingModules: SyncModuleKey[];
    }
  | {
      status: 'blocked';
      record: ResaleConflictRecord;
      reason: string;
      durable: boolean;
      confirmedWrites: Array<{ module: SyncModuleKey; revision: string }>;
      completedModules: SyncModuleKey[];
      pendingModules: SyncModuleKey[];
    }
> {
  const alreadyReconciled = new Set<SyncModuleKey>(record.reconciledModules ?? []);
  const initialPendingModules = record.modules.filter((m) => !alreadyReconciled.has(m));

  if (!options?.authorized) {
    return {
      status: 'blocked',
      record,
      reason: 'La conciliación requiere autorización explícita del usuario antes de publicar o reemplazar datos.',
      durable: true,
      confirmedWrites: [],
      completedModules: [...alreadyReconciled],
      pendingModules: initialPendingModules,
    };
  }

  // Merge remote data without overwriting the conflict's expected baseRevisions for still-pending modules
  const combined = mergeConflictRemoteVersions(record, options.latestRemoteData);
  const currentRemoteData: Partial<Record<SyncModuleKey, unknown>> = { ...combined.data };
  const currentBaseRevisions: SyncRevisionMap = {
    ...combined.revisions,
    ...record.baseRevisions,
  };

  let currentRecord = addRemoteResaleVersion(record, currentRemoteData, currentBaseRevisions);
  if (!dependencies.saveConflict(currentRecord)) {
    return {
      status: 'blocked',
      record: currentRecord,
      reason: 'No se pudo conservar el respaldo del conflicto antes de conciliar.',
      durable: false,
      confirmedWrites: [],
      completedModules: [...alreadyReconciled],
      pendingModules: initialPendingModules,
    };
  }

  for (const mod of record.modules) {
    if (currentRemoteData[mod] === undefined || !currentBaseRevisions[mod]) {
      return {
        status: 'blocked',
        record: currentRecord,
        reason: `Falta una versión remota verificable de ${mod}.`,
        durable: true,
        confirmedWrites: [],
        completedModules: [...alreadyReconciled],
        pendingModules: initialPendingModules,
      };
    }
  }

  const choices = options.choices ?? {};
  const resaleChoice = choices.resale ?? 'local';
  const financeChoice = choices.finance ?? 'local';
  if (record.modules.includes('resale') && record.modules.includes('finance') && resaleChoice !== financeChoice) {
    return {
      status: 'blocked',
      record: currentRecord,
      reason: 'Mi negocio y Finanzas deben conciliarse con la misma fuente para preservar la integridad contable.',
      durable: true,
      confirmedWrites: [],
      completedModules: [...alreadyReconciled],
      pendingModules: initialPendingModules,
    };
  }

  let reconciledState = structuredClone(localState);
  for (const mod of record.modules) {
    const choice = choices[mod] ?? 'local';
    const sourceData = choice === 'remote' ? currentRemoteData[mod] : syncModuleData(localState, mod);
    reconciledState = applySyncModule(reconciledState, mod, sourceData);
  }

  if (!linkedTransactionsValid(reconciledState)) {
    return {
      status: 'blocked',
      record: currentRecord,
      reason: 'La combinación elegida deja vínculos inconsistentes entre Mi negocio y Finanzas.',
      durable: true,
      confirmedWrites: [],
      completedModules: [...alreadyReconciled],
      pendingModules: initialPendingModules,
    };
  }
  if (
    reconciledState.resale.commercial &&
    !validateDurableCommercial(reconciledState.resale.commercial, {
      finance: reconciledState.finance,
      resaleInventory: reconciledState.resale.inventory,
    }).valid
  ) {
    return {
      status: 'blocked',
      record: currentRecord,
      reason: 'El historial comercial resultante no supera la validación con Finanzas.',
      durable: true,
      confirmedWrites: [],
      completedModules: [...alreadyReconciled],
      pendingModules: initialPendingModules,
    };
  }

  // Always preserve the original pre-reconciliation remote snapshot in backups before starting any write
  const initialRemoteSnapshot = buildStateFromModules(extractInitialRemoteData(record, currentRemoteData));
  if (dependencies.saveBackup && !dependencies.saveBackup(localState, initialRemoteSnapshot)) {
    return {
      status: 'blocked',
      record: currentRecord,
      reason: 'No se pudo guardar la copia de recuperación previa en este dispositivo. La conciliación fue detenida.',
      durable: false,
      confirmedWrites: [],
      completedModules: [...alreadyReconciled],
      pendingModules: initialPendingModules,
    };
  }
  currentRecord = {
    ...currentRecord,
    backupConfirmedAt: currentRecord.backupConfirmedAt ?? new Date().toISOString(),
  };

  // Identify modules that still differ and have not already been confirmed in a previous partial batch
  const differingModules = record.modules.filter(
    (mod) =>
      !alreadyReconciled.has(mod) &&
      syncDataFingerprint(syncModuleData(reconciledState, mod)) !== syncDataFingerprint(currentRemoteData[mod]),
  );

  // Ensure resale and finance remain atomic whenever commercial or linked resale-finance operations exist
  const relatedCommercial =
    hasRelatedCommercialOrFinance(reconciledState) || hasRelatedCommercialOrFinance(localState);
  if (
    relatedCommercial &&
    record.modules.includes('resale') &&
    record.modules.includes('finance') &&
    (differingModules.includes('resale') || differingModules.includes('finance')) &&
    !(alreadyReconciled.has('resale') && alreadyReconciled.has('finance'))
  ) {
    if (!differingModules.includes('finance')) differingModules.unshift('finance');
    if (!differingModules.includes('resale')) differingModules.unshift('resale');
  }

  const completedSet = new Set<SyncModuleKey>([
    ...alreadyReconciled,
    ...record.modules.filter((mod) => !differingModules.includes(mod)),
  ]);
  currentRecord = {
    ...currentRecord,
    reconciledModules: [...completedSet],
  };
  dependencies.saveConflict(currentRecord);

  const batches = chunkSyncModulesForTransaction(differingModules, options.maxBatchSize ?? 5);
  const confirmedWrites: Array<{ module: SyncModuleKey; revision: string }> = [];

  const blockWithProgress = (reason: string) => {
    const completedModules = [...completedSet];
    const pendingModules = record.modules.filter((m) => !completedSet.has(m));
    const diagnosed: ResaleConflictRecord = {
      ...currentRecord,
      status: 'pending',
      diagnostic: currentRecord.diagnostic || reason,
      reconciledModules: completedModules,
    };
    return {
      status: 'blocked' as const,
      record: diagnosed,
      reason,
      durable: dependencies.saveConflict(diagnosed),
      confirmedWrites,
      completedModules,
      pendingModules,
    };
  };

  let activeBatch: SyncModuleKey[] = [];
  try {
    for (const batch of batches) {
      activeBatch = batch;
      const batchExpectedRevisions: SyncRevisionMap = Object.fromEntries(
        batch.map((m) => [m, currentBaseRevisions[m]]),
      );

      // If caller provided latestRemoteRevisions, reject if any pending module in this batch changed concurrently
      if (options.latestRemoteRevisions) {
        const concurrentMods = batch.filter(
          (m) =>
            options.latestRemoteRevisions?.[m] &&
            currentBaseRevisions[m] &&
            options.latestRemoteRevisions[m] !== currentBaseRevisions[m],
        );
        if (concurrentMods.length > 0) {
          throw new CloudRevisionConflict(concurrentMods);
        }
      }

      const publication = await dependencies.publish(reconciledState, batch, batchExpectedRevisions);
      if (publication.diverged || publication.incompatibleProtocol) {
        throw new CloudRevisionConflict(batch);
      }
      await publication.completion;

      confirmedWrites.push(...publication.writes);
      for (const w of publication.writes) {
        completedSet.add(w.module);
        currentRemoteData[w.module] = structuredClone(syncModuleData(reconciledState, w.module));
        currentBaseRevisions[w.module] = w.revision;
      }

      currentRecord = {
        ...addRemoteResaleVersion(currentRecord, currentRemoteData, currentBaseRevisions),
        baseRevisions: { ...currentBaseRevisions },
        reconciledModules: [...completedSet],
        status: 'pending',
      };
      dependencies.saveConflict(currentRecord);
      dependencies.onBatchConfirmed?.(
        publication.writes,
        [...completedSet],
        record.modules.filter((m) => !completedSet.has(m)),
      );
    }

    if (
      record.modules.some(
        (mod) =>
          syncDataFingerprint(syncModuleData(dependencies.currentState(), mod)) !==
          syncDataFingerprint(syncModuleData(localState, mod)),
      )
    ) {
      return blockWithProgress('Hubo cambios locales nuevos durante la publicación.');
    }

    const resolved: ResaleConflictRecord = {
      ...currentRecord,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      reconciledModules: [...record.modules],
    };
    if (!dependencies.saveConflict(resolved)) {
      return {
        status: 'blocked',
        record: currentRecord,
        reason: 'La publicación terminó, pero no pudo guardarse su confirmación local.',
        durable: false,
        confirmedWrites,
        completedModules: [...completedSet],
        pendingModules: record.modules.filter((m) => !completedSet.has(m)),
      };
    }

    return {
      status: 'confirmed',
      record: resolved,
      reconciledState,
      writes: confirmedWrites,
      adoptedRevisions: { ...currentBaseRevisions },
      modules: [...record.modules],
      completedModules: [...record.modules],
      pendingModules: [],
    };
  } catch (error) {
    const completedModules = [...completedSet];
    const pendingModules = record.modules.filter((m) => !completedSet.has(m));
    const isRevConflict =
      error instanceof CloudRevisionConflict ||
      error instanceof ResaleRevisionConflict ||
      (error !== null && typeof error === 'object' && 'modules' in error && Array.isArray((error as { modules: unknown }).modules));
    const conflictMods = isRevConflict
      ? ((error as { modules?: SyncModuleKey[] }).modules ?? activeBatch).join(', ')
      : '';

    if (confirmedWrites.length > 0 || alreadyReconciled.size > 0) {
      const reason = isRevConflict
        ? `Progreso parcial: se confirmaron ${confirmedWrites.length} módulo(s) nuevos (${completedModules.length}/${record.modules.length} listos), pero se rechazó sobrescribir ${conflictMods} porque su revisión remota cambió concurrentemente. Quedan ${pendingModules.length} módulo(s) pendientes.`
        : `Progreso parcial: se confirmaron ${confirmedWrites.length} módulo(s) en este intento (${completedModules.length}/${record.modules.length} listos; quedan ${pendingModules.length} pendientes). El conflicto sigue pendiente para reintentar solo los módulos restantes.`;
      return blockWithProgress(reason);
    }

    const reason = isRevConflict
      ? `Se rechazó la publicación porque la revisión remota cambió concurrentemente en: ${conflictMods}. No se sobrescribió ningún módulo.`
      : 'La publicación falló o la revisión remota cambió. El conflicto sigue bloqueado.';
    return blockWithProgress(reason);
  }
}
