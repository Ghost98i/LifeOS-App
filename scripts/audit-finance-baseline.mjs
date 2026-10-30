// Synthetic audit only. Reads HEAD without checking out or changing any files.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const directory = path.resolve('artifacts/finance-integrity');
mkdirSync(directory, { recursive: true });
const source = `
import { defaultState } from './src/lib/storage.ts';
import { addTransaction, markTransactionReviewed } from './src/lib/financeFlows.ts';
import { mergeFinanceModule } from './src/lib/syncMerge.ts';
import { parseCaptureDrafts, confirmCaptureDraft } from './src/lib/quickCaptureDrafts.ts';
function fixture() {
  const state = defaultState();
  state.settings.hiddenTabs = [];
  state.finance.accounts = [{ id: 'cash', name: 'Sintética', balance: 10000, initialBalance: 10000 }];
  return state;
}
export function run() {
  const state = fixture();
  const input = { id: 'same-technical-operation', type: 'gasto', amount: 500, category: 'Otros', note: 'Almuerzo', accountId: 'cash' };
  addTransaction(state, input);
  addTransaction(state, input);
  const retryLocal = { count: state.finance.transactions.length, balance: state.finance.accounts[0].balance };
  state.finance = mergeFinanceModule(state.finance, structuredClone(state.finance));
  const retryMerged = { count: state.finance.transactions.length, balance: state.finance.accounts[0].balance };
  const capture = fixture();
  const [draft] = parseCaptureDrafts('gaste 500 almuerzo', capture);
  confirmCaptureDraft(capture, draft);
  confirmCaptureDraft(capture, draft);
  const simon = fixture();
  simon.finance.accounts[0].balance = 1000;
  simon.finance.accounts[0].initialBalance = 1000;
  const simonInput = { ...input, id: 'simon-a', amount: 200, category: 'Comida', note: '' };
  addTransaction(simon, simonInput);
  const stale = structuredClone(simon.finance);
  const second = addTransaction(simon, { ...simonInput, id: 'simon-b' });
  markTransactionReviewed(simon, second.id);
  const acknowledged = structuredClone(simon.finance);
  const conflicts = [];
  const staleMerged = mergeFinanceModule(simon.finance, stale, acknowledged, {}, item => conflicts.push(item));
  return { retryLocal, retryMerged, reconfirmCapture: { count: capture.finance.transactions.length, balance: capture.finance.accounts[0].balance },
    simonStaleMerge: { beforeBalance: simon.finance.accounts[0].balance, afterBalance: staleMerged.accounts[0].balance, count: staleMerged.transactions.length, conflicts: conflicts.length } };
}`;
const results = {};
for (const baseline of [true, false]) {
  const result = await build({
    stdin: { contents: source, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent',
    plugins: baseline ? [{ name: 'read-head-finance', setup(builder) {
      builder.onLoad({ filter: /src[\\/]lib[\\/](financeFlows|quickCapture|quickCaptureDrafts|syncMerge)\.ts$/ }, args => ({
        contents: execFileSync('git', ['show', `HEAD:${path.relative(root, args.path).replaceAll('\\', '/')}`], { encoding: 'utf8' }),
        loader: 'ts', resolveDir: path.dirname(args.path),
      }));
    } }] : [],
  });
  const target = path.join(directory, baseline ? 'baseline-audit.mjs' : 'current-audit.mjs');
  writeFileSync(target, result.outputFiles[0].text);
  results[baseline ? 'before' : 'after'] = (await import(pathToFileURL(target).href)).run();
}
writeFileSync(path.join(directory, 'before-after.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
