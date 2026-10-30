// Run only inside demo-lifeos Auth/Firestore Emulator. Stop on the first failure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
assert.equal(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId, 'demo-lifeos');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
const output = path.resolve('artifacts/sync-reconnect');
mkdirSync(output, { recursive: true });
const results = [];
for (const [index, args] of [[], ['--repeat-head'], []].entries()) {
  const name = `repeat-${index + 1}`;
  const execution = spawnSync(process.execPath, ['scripts/test-finance-simon-e2e.mjs', ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(path.join(output, `${name}.log`), `${execution.stdout || ''}\n${execution.stderr || ''}`);
  for (const file of ['simon-latest-check.json', 'simon-trace.json', 'simon-sync-events.json']) copyFileSync(path.join('artifacts/finance-integrity', file), path.join(output, `${name}-${file}`));
  const trace = JSON.parse(readFileSync(path.join(output, `${name}-simon-trace.json`), 'utf8'));
  results.push({ run: index + 1, mode: args.length ? 'repeated-head' : 'normal', exitCode: execution.status, checkpoints: trace.length, reconnectMs: trace.find(point => point.stage.startsWith('reconexión'))?.elapsedMs });
  writeFileSync(path.join(output, 'repeat-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1)));
  if (execution.status !== 0) { console.error(execution.stderr); process.exit(execution.status ?? 1); }
  assert.equal(trace.length, 19);
  assert.ok(trace.at(-1).clients.every(client => client.transactions.length === 5 && client.balance === 0 && client.syncStatus === 'Sincronización: Sincronizado'));
}
