import { spawn } from 'node:child_process';
import path from 'node:path';

const port = process.env.TEST_PORT || '5239';
process.env.TEST_PORT = port;
console.log(`[E2E Runner] Starting Vite on port ${port}...`);
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  stdio: 'pipe',
  env: {
    ...process.env,
    VITE_FIREBASE_EMULATORS: '1',
    VITE_FIREBASE_PROJECT_ID: 'demo-lifeos',
    VITE_COMMERCIAL_PILOT: '0',
  },
});

vite.stdout?.on('data', data => {
  const text = data.toString();
  if (text.includes('ready in') || text.includes('Local:')) {
    console.log('[Vite]', text.trim());
  }
});
vite.stderr?.on('data', data => {
  console.error('[Vite err]', data.toString().trim());
});

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (vite.exitCode !== null) throw new Error(`Vite exited before it was ready (${vite.exitCode}).`);
    try {
      const res = await fetch(url);
      if (res.ok && (await fetch(new URL('/src/lib/cloudSync.ts', url))).ok) return true;
    } catch {
      // Wait and retry
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function killProcessTree(pid) {
  if (!pid) return;
  try {
    const killCmd = spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
    await new Promise(r => killCmd.on('close', r));
  } catch {
    // Ignore error if already dead
  }
}

try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  console.log('[E2E Runner] Vite is ready. Executing Playwright E2E test...');

  const testProcess = spawn('node', ['scripts/test-commercial-production-e2e.mjs'], {
    stdio: 'inherit',
    env: process.env,
  });

  const exitCode = await new Promise((resolve) => {
    testProcess.on('close', resolve);
  });

  if (exitCode !== 0) {
    console.error(`[E2E Runner] Test failed with exit code ${exitCode}`);
    process.exitCode = exitCode;
  } else {
    console.log('[E2E Runner] Test passed successfully!');
  }
} catch (error) {
  console.error('[E2E Runner] Error:', error);
  process.exitCode = 1;
} finally {
  console.log('[E2E Runner] Cleaning up Vite dev server...');
  await killProcessTree(vite.pid);
}
