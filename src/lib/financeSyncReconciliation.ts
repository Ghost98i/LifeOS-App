import type { LifeOSState } from '../types';
import { extractPureModuleData, mergeSyncModuleWithConflicts, syncDataFingerprint, syncModuleFingerprint } from './syncModel';

/** The merge result is local work, never evidence of a server acknowledgement. */
export function reconcileFinancePublication(
  local: LifeOSState, remoteData: unknown, remoteRevision: string,
  baselineData: unknown, tombstones: Record<string, number>,
) {
  const baseline = extractPureModuleData(remoteData);
  const merged = mergeSyncModuleWithConflicts(local, 'finance', baseline, baselineData, tombstones);
  const fingerprint = syncDataFingerprint(baseline);
  return { ...merged, confirmed: { revision: remoteRevision, data: baseline, fingerprint },
    needsUpload: merged.conflicts.length === 0 && syncModuleFingerprint(merged.state, 'finance') !== fingerprint };
}
