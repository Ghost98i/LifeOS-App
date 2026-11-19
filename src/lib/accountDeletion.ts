import type { LifeOSState } from '../types';
import {
  clearCloudAccountLocalState,
  markDeletedCloudUserId,
} from './cloudSync';
import { clearWrappedKeyEnvelope, cryptoSession } from './cryptoCore';
import { forgetDeviceTrust } from './deviceTrust';
import {
  defaultState,
  getRecoveryKey,
  getStorageKey,
  saveStoredState,
} from './storage';

const GUEST_NOTE_PLACEMENTS_KEY = 'celestea-note-placements-v1:local-guest';

export interface AccountDeletionCleanupDeps {
  forgetDeviceTrustFn?: (userId: string) => Promise<void>;
  saveStoredStateFn?: typeof saveStoredState;
}

function removeKeySafe(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Private mode or restricted storage may block access.
  }
}

/**
 * Transitions the device from a just-deleted cloud account to local-only mode:
 * - Saves a single unscoped local copy with `{ allowCommercialOverride: true }`
 *   and verifies the boolean return value.
 * - Removes every scoped key for `userId` (state, recovery, sync metadata,
 *   tombstones, rotation pending, resale conflict, note placements, gym chunk
 *   hashes, wrapped key envelope, and IndexedDB Device Trust).
 * - Marks `LAST_USER_KEY` as `__deleted__:${userId}` so a future sign-in with
 *   the same Google account boots clean without re-uploading or resurrecting
 *   deleted cloud data.
 */
export async function preserveLocalStateAfterCloudDeletion(
  userId: string,
  currentState: LifeOSState,
  deps: AccountDeletionCleanupDeps = {},
): Promise<{ preservedLocally: boolean }> {
  const persistState = deps.saveStoredStateFn ?? saveStoredState;
  const revokeTrust = deps.forgetDeviceTrustFn ?? forgetDeviceTrust;

  let preservedLocally = persistState(currentState, null, undefined, {
    allowCommercialOverride: true,
  });

  clearCloudAccountLocalState(userId);
  removeKeySafe(getStorageKey(userId));
  removeKeySafe(getRecoveryKey(userId));
  clearWrappedKeyEnvelope(userId);
  cryptoSession.lock();

  if (!preservedLocally) {
    // Retry once after freeing scoped keys in case localStorage was near quota.
    removeKeySafe(getRecoveryKey(null));
    preservedLocally = persistState(currentState, null, undefined, {
      allowCommercialOverride: true,
    });
  }

  markDeletedCloudUserId(userId);

  try {
    await revokeTrust(userId);
  } catch {
    // A failed IndexedDB Device Trust cleanup must not block completing deletion.
  }

  return { preservedLocally };
}

/**
 * Wipes both scoped (when `userId` is known, including via `lastDeletedUserIdRef`)
 * and unscoped local data on this device and resets to a fresh default state.
 */
export function wipeLocalStateAfterDeletion(
  userId: string | null,
  deps: AccountDeletionCleanupDeps = {},
): LifeOSState {
  const persistState = deps.saveStoredStateFn ?? saveStoredState;
  const revokeTrust = deps.forgetDeviceTrustFn ?? forgetDeviceTrust;

  if (userId) {
    removeKeySafe(getStorageKey(userId));
    removeKeySafe(getRecoveryKey(userId));
    clearCloudAccountLocalState(userId);
    markDeletedCloudUserId(userId);
    clearWrappedKeyEnvelope(userId);
    void revokeTrust(userId).catch(() => {
      // A failed device-trust revoke must not block the local wipe.
    });
    cryptoSession.lock();
  }

  removeKeySafe(getStorageKey(null));
  removeKeySafe(getRecoveryKey(null));
  removeKeySafe(GUEST_NOTE_PLACEMENTS_KEY);
  clearWrappedKeyEnvelope(null);

  const fresh = defaultState();
  persistState(fresh, null, undefined, { allowCommercialOverride: true });
  return fresh;
}
