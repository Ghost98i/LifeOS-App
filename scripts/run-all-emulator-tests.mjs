process.env.NODE_ENV = 'test';
process.env.LIFEOS_COMMERCIAL_PILOT_EMULATOR_TEST = '1';
process.env.VITE_FIREBASE_PROJECT_ID = 'demo-lifeos';

import { spawnSync } from 'node:child_process';

const files = [
  'src/lib/firestoreRules.emulator.test.ts',
  'src/lib/commercialPhaseA.emulator.test.ts',
  'src/lib/commercialPilot.firebase.emulator.test.ts',
  'src/lib/gymAtomicWrite.emulator.test.ts',
  'src/lib/resaleAtomicWrite.emulator.test.ts',
  'src/lib/cloudWriteRevision.emulator.test.ts',
];

const res = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit', env: process.env }
);

process.exit(res.status ?? 1);
