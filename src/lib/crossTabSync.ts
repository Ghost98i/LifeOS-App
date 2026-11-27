import type { LifeOSState } from '../types';
import {
  commercialHydrationBlock,
  getStorageKey,
  normalizeStoredState,
} from './storage';

export const TAB_SYNC_CHANNEL_NAME = 'lifeos-tab-sync';

export interface CrossTabMessage {
  type: 'tab-state-update';
  senderTabId: string;
  userId: string | null;
  state: LifeOSState;
  serialized?: string;
  writtenAt?: number;
}

export type CrossTabReconcileResult =
  | { action: 'ignore'; reason: 'finance_blocked' | 'already_applied' | 'self_echo' }
  | { action: 'noop_sync_marker'; serialized: string }
  | { action: 'block_resale'; diagnostic: string }
  | { action: 'block_finance'; conflicts: unknown[] }
  | { action: 'apply'; state: LifeOSState; serialized: string };

export function createTabInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `tab-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/**
 * Preserves active local per-tab ephemeral timers/sessions (gym rest timer,
 * running study focus timer / practice session) when absorbing a cross-tab
 * state update so an active workout or study session is never abruptly reset.
 */
export function preserveLocalEphemeralSessions(
  current: LifeOSState,
  incoming: LifeOSState
): LifeOSState {
  const localGymTimer = current.gym?.activeTimer ?? null;
  const incomingGymTimer = incoming.gym?.activeTimer ?? null;
  const nextGymTimer = localGymTimer ?? incomingGymTimer;

  const localStudySession = current.study?.activeSession ?? null;
  const incomingStudySession = incoming.study?.activeSession ?? null;
  const nextStudySession = localStudySession ?? incomingStudySession;

  const localPracticeSession = current.study?.activePracticeSession ?? null;
  const incomingPracticeSession = incoming.study?.activePracticeSession ?? null;
  const nextPracticeSession = localPracticeSession ?? incomingPracticeSession;

  if (
    nextGymTimer === incomingGymTimer &&
    nextStudySession === incomingStudySession &&
    nextPracticeSession === incomingPracticeSession
  ) {
    return incoming;
  }

  return {
    ...incoming,
    gym: {
      ...incoming.gym,
      activeTimer: nextGymTimer,
    },
    study: {
      ...incoming.study,
      activeSession: nextStudySession,
      activePracticeSession: nextPracticeSession,
    },
  };
}

export function parseCrossTabStorageEvent(
  event: Pick<StorageEvent, 'key' | 'newValue'>,
  activeUserId: string | null
): { state: LifeOSState; serialized: string } | null {
  const expectedKey = getStorageKey(activeUserId);
  if (event.key !== expectedKey || typeof event.newValue !== 'string' || !event.newValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(event.newValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return {
      state: normalizeStoredState(parsed),
      serialized: event.newValue,
    };
  } catch {
    return null;
  }
}

export function readCrossTabStorageSnapshot(
  activeUserId: string | null,
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined
): { state: LifeOSState; serialized: string } | null {
  if (!storage) return null;
  try {
    const key = getStorageKey(activeUserId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    return parseCrossTabStorageEvent({ key, newValue: raw }, activeUserId);
  } catch {
    return null;
  }
}

/**
 * Pure cross-tab reconciliation guard:
 * - Short-circuits identical payloads (prevents storage ping-pong & redundant renders)
 * - Blocks commercial/finance regressions
 * - Preserves active local gym/study timers
 * - Never writes back to storage or broadcasts back (caller only updates in-memory React state)
 */
export function reconcileCrossTabUpdate(params: {
  currentState: LifeOSState;
  incomingState: LifeOSState;
  incomingSerialized: string;
  lastKnownSerialized: string | null;
  financeWriteBlocked?: boolean;
  detectFinanceRegression?: (
    localFinance: LifeOSState['finance'],
    incomingFinance: LifeOSState['finance']
  ) => unknown[];
}): CrossTabReconcileResult {
  const {
    currentState,
    incomingState,
    incomingSerialized,
    lastKnownSerialized,
    financeWriteBlocked = false,
    detectFinanceRegression,
  } = params;

  if (financeWriteBlocked) {
    return { action: 'ignore', reason: 'finance_blocked' };
  }

  if (lastKnownSerialized !== null && incomingSerialized === lastKnownSerialized) {
    return { action: 'ignore', reason: 'already_applied' };
  }

  if (detectFinanceRegression) {
    const financeConflicts = detectFinanceRegression(currentState.finance, incomingState.finance);
    if (financeConflicts.length > 0) {
      return { action: 'block_finance', conflicts: financeConflicts };
    }
  }

  const diagnostic = commercialHydrationBlock(currentState, incomingState);
  if (diagnostic) {
    return { action: 'block_resale', diagnostic };
  }

  const normalized = normalizeStoredState(incomingState);
  const nextState = preserveLocalEphemeralSessions(currentState, normalized);

  try {
    if (JSON.stringify(nextState) === JSON.stringify(currentState)) {
      return { action: 'noop_sync_marker', serialized: incomingSerialized };
    }
  } catch {
    // Proceed to apply if comparison fails unexpectedly
  }

  return {
    action: 'apply',
    state: nextState,
    serialized: incomingSerialized,
  };
}

export type OnlineRecoveryStatus =
  | 'unavailable'
  | 'signed-out'
  | 'connecting'
  | 'saving'
  | 'synced'
  | 'offline'
  | 'locked'
  | 'conflict'
  | 'error';

/**
 * Computes the honest sync indicator state when connectivity returns (`online`)
 * or when a backgrounded tab returns to the foreground (`visibilitychange` / `focus`),
 * ensuring Topbar never gets stuck on "Sin conexión" or "Sincronizando…".
 */
export function resolveOnlineSyncStatus(params: {
  isOnline: boolean;
  cloudSyncConfigured: boolean;
  hasCloudUser: boolean;
  isInitializedForUser: boolean;
  hasBlockedConflict: boolean;
  isVaultLocked: boolean;
  hasModulesToFlush: boolean;
  hasPendingRevisions: boolean;
  hasFailedModules: boolean;
}): OnlineRecoveryStatus {
  if (params.hasBlockedConflict) return 'conflict';
  if (!params.isOnline) return 'offline';
  if (!params.hasCloudUser) {
    return params.cloudSyncConfigured ? 'signed-out' : 'unavailable';
  }
  if (params.isVaultLocked) return 'locked';
  if (params.hasModulesToFlush || params.hasPendingRevisions) return 'saving';
  if (params.hasFailedModules) return 'error';
  if (params.isInitializedForUser) return 'synced';
  return 'connecting';
}
