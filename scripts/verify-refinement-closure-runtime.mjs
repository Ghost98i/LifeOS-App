import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Run only under Firebase emulators:exec --project demo-lifeos.
const hub = process.env.FIREBASE_EMULATOR_HUB;
assert.ok(hub && /^(127\.0\.0\.1|localhost):\d+$/.test(hub), 'Local Emulator Suite required');
assert.equal(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId, 'demo-lifeos');
const before = readFileSync('firebase.json', 'utf8');
for (const script of ['scripts/test-hosting-headers.mjs', 'scripts/run-commercial-e2e-with-vite.mjs']) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    env: { ...process.env, TEST_PORT: '5243', LIFEOS_COMMERCIAL_EVIDENCE: 'artifacts/cierre-tandas-1-2/commercial' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
assert.equal(readFileSync('firebase.json', 'utf8'), before, 'Hosting config must stay unchanged');
