import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, normalizeStoredState } from './storage';
import { mergeFinanceModule } from './syncMerge';
import { ExpectedIncome } from '../types';

test('normalizeStoredState initializes expectedIncomes if absent and cleans invalid fields', () => {
  const raw: any = {
    finance: {
      accounts: [],
      transactions: [],
      categories: ['Comida'],
      budgets: {},
      subscriptions: [],
      debts: [],
      investments: [],
      // expectedIncomes missing entirely
    },
  };

  const normalized = normalizeStoredState(raw);
  assert.ok(Array.isArray(normalized.finance.expectedIncomes));
  assert.equal(normalized.finance.expectedIncomes.length, 0);

  // With dirty data
  const rawDirty: any = {
    finance: {
      accounts: [],
      expectedIncomes: [
        {
          id: 'inc-1',
          name: '  Cobro freelance  ',
          amount: '12000',
          startDate: '2026-09-01',
          frequency: 'monthly',
          active: true,
        },
        {
          // invalid item: no name or amount <= 0
          id: 'inc-invalid',
          name: '',
          amount: 0,
        },
      ],
    },
  };

  const normalizedDirty = normalizeStoredState(rawDirty);
  assert.equal(normalizedDirty.finance.expectedIncomes.length, 1);
  assert.equal(normalizedDirty.finance.expectedIncomes[0].id, 'inc-1');
  assert.equal(normalizedDirty.finance.expectedIncomes[0].name, 'Cobro freelance');
  assert.equal(normalizedDirty.finance.expectedIncomes[0].amount, 12000);
});

test('mergeFinanceModule merges expectedIncomes from two devices without loss (3-way merge)', () => {
  const base = defaultState().finance;
  const incA: ExpectedIncome = {
    id: 'inc-a',
    name: 'Cobro A',
    amount: 15000,
    startDate: '2026-09-01',
    frequency: 'monthly',
    active: true,
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
  const incB: ExpectedIncome = {
    id: 'inc-b',
    name: 'Cobro B',
    amount: 20000,
    startDate: '2026-09-15',
    frequency: 'biweekly',
    active: true,
    updatedAt: '2026-09-01T11:00:00.000Z',
  };

  const local = {
    ...base,
    expectedIncomes: [incA],
  };

  const remote = {
    ...base,
    expectedIncomes: [incB],
  };

  const merged = mergeFinanceModule(local, remote, base);

  assert.equal(merged.expectedIncomes.length, 2);
  const ids = merged.expectedIncomes.map((i) => i.id).sort();
  assert.deepEqual(ids, ['inc-a', 'inc-b']);
});

test('mergeFinanceModule applies Last-Write-Wins on conflicting expectedIncome edits', () => {
  const original: ExpectedIncome = {
    id: 'inc-shared',
    name: 'Sueldo Original',
    amount: 50000,
    startDate: '2026-09-05',
    frequency: 'monthly',
    active: true,
    updatedAt: '2026-09-01T10:00:00.000Z',
  };

  const base = {
    ...defaultState().finance,
    expectedIncomes: [original],
  };

  // Device A modifies amount to 55.000 at 10:15
  const local = {
    ...base,
    expectedIncomes: [
      {
        ...original,
        amount: 55000,
        updatedAt: '2026-09-01T10:15:00.000Z',
      },
    ],
  };

  // Device B modifies amount to 60.000 at 10:30 (newer)
  const remote = {
    ...base,
    expectedIncomes: [
      {
        ...original,
        amount: 60000,
        updatedAt: '2026-09-01T10:30:00.000Z',
      },
    ],
  };

  const merged = mergeFinanceModule(local, remote, base);
  assert.equal(merged.expectedIncomes.length, 1);
  assert.equal(merged.expectedIncomes[0].amount, 60000, 'Device B must win by LWW timestamp');
});

test('mergeFinanceModule respects tombstones when an expectedIncome is deleted', () => {
  const original: ExpectedIncome = {
    id: 'inc-to-delete',
    name: 'Cobro caduco',
    amount: 10000,
    startDate: '2026-09-01',
    frequency: 'once',
    active: true,
    updatedAt: '2026-09-01T10:00:00.000Z',
  };

  const base = {
    ...defaultState().finance,
    expectedIncomes: [original],
  };

  // Local deletes it
  const local = {
    ...base,
    expectedIncomes: [],
  };

  // Remote hasn't deleted it (still has original)
  const remote = {
    ...base,
    expectedIncomes: [original],
  };

  const merged = mergeFinanceModule(local, remote, base, { 'inc-to-delete': Date.now() });
  assert.equal(merged.expectedIncomes.length, 0, 'Deleted expected income must not resurrect');
});
