import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId, 'demo-lifeos');
assert.ok(/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_EMULATOR_HUB || ''));
for (const script of ['scripts/run-all-emulator-tests.mjs', 'scripts/test-hosting-headers.mjs', 'scripts/run-commercial-e2e-with-vite.mjs', 'scripts/verify-consolidated-browser.mjs']) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit', env: { ...process.env, TEST_PORT: '5243', LIFEOS_COMMERCIAL_EVIDENCE: 'artifacts/consolidacion-tres-tandas-20261029/commercial' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
