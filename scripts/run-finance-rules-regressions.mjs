// Execute only inside local demo emulators; no deploy commands or production I/O.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

assert.equal(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId, 'demo-lifeos');
assert.ok(/^127\.0\.0\.1:8080$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
assert.ok(/^127\.0\.0\.1:9099$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || ''));
const environment = { ...process.env, NODE_ENV: 'test', VITE_FIREBASE_PROJECT_ID: 'demo-lifeos', LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST: '1' };
const files = process.argv.includes('--focused') ? [
  'src/lib/financeRulesBoundary.emulator.test.ts', 'src/lib/publishedFinanceRulesCompatibility.emulator.test.ts',
] : [
  'src/lib/firestoreRules.emulator.test.ts', 'src/lib/commercialPhaseA.emulator.test.ts',
  'src/lib/commercialPilot.firebase.emulator.test.ts', 'src/lib/gymAtomicWrite.emulator.test.ts',
  'src/lib/resaleAtomicWrite.emulator.test.ts', 'src/lib/cloudWriteRevision.emulator.test.ts',
  'src/lib/financeRepeatedIntegrity.emulator.test.ts', 'src/lib/financeRevisionProposal.emulator.test.ts',
  'src/lib/financeRulesBoundary.emulator.test.ts', 'src/lib/publishedFinanceRulesCompatibility.emulator.test.ts',
  'src/lib/financeDuplicateReview.emulator.test.ts',
  'src/lib/financeSyncReconciliation.emulator.test.ts',
];
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], { env: environment, stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
if (process.argv.includes('--browser')) {
  const browser = spawnSync(process.execPath, ['scripts/test-finance-simon-e2e.mjs'], { env: environment, stdio: 'inherit', windowsHide: true });
  process.exit(browser.status ?? 1);
}
