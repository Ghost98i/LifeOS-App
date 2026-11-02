import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

assert.equal(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId, 'demo-lifeos');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1',
  'src/lib/financeCurrencyPolicy.emulator.test.ts', 'src/lib/financeCurrencyPersistence.emulator.test.ts',
  'src/lib/financeSyncReconciliation.emulator.test.ts', 'src/lib/cloudWriteRevision.emulator.test.ts',
  'src/lib/financeDuplicateReview.emulator.test.ts'], {
  env: { ...process.env, NODE_ENV: 'test', VITE_FIREBASE_PROJECT_ID: 'demo-lifeos', LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST: '1' },
  stdio: 'inherit', windowsHide: true,
});
process.exit(result.status ?? 1);
