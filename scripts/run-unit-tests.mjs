import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Discover tests without shell-specific globs; include mounted component regressions.
const files = ['src/lib', 'src/components'].flatMap(dir => readdirSync(dir)
  .filter(name => /\.test\.tsx?$/.test(name) && !name.includes('.emulator.'))
  .sort().map(name => `${dir}/${name}`));
const result = spawnSync(process.execPath, [
  '--import', 'tsx', '--import', './scripts/register-test-assets.mjs',
  '--test', ...process.argv.slice(2), ...files,
], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
