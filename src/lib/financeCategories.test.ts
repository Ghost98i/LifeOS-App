import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCategory,
  archiveCategory,
  countTransactionsByCategory,
  deleteCategory,
  getActiveCategories,
  getAllCategories,
  getCategoryById,
  getCategoryName,
  normalizeCategories,
  reactivateCategory,
  renameCategory,
  setCategoryBudget,
  validateCategoryName,
} from './financeCategories';
import {
  CURRENT_SCHEMA_VERSION,
  defaultState,
  normalizeStoredState,
  parseBackupJSON,
} from './storage';
import { mergeFinanceModule, mergeEntityCollection } from './syncMerge';
import { searchLifeOS } from './search';
import { addQuickTransaction } from './quickCapture';
import type { Finance, FinanceCategory, Transaction } from '../types';

function createMockFinance(overrides: Partial<Finance> = {}): Finance {
  return {
    ...defaultState().finance,
    ...overrides,
  };
}

function createMockTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-default',
    date: '2026-09-01',
    amount: 100,
    type: 'gasto',
    category: 'Comida',
    accountId: 'acc-1',
    fixed: 'variable',
    ...overrides,
  };
}

test('presupuesto creado por categoryId sobrevive al renombrado de la categoría', () => {
  const finance = createMockFinance({ categories: [], budgets: {} });
  const category = addCategory(finance, 'Cuidado personal');

  setCategoryBudget(finance, category.id, 4500);
  renameCategory(finance, category.id, 'Bienestar');

  assert.equal(finance.budgets[category.id], 4500);
  assert.equal(finance.budgets['Cuidado personal'], undefined);
  assert.equal(getCategoryName(finance.categories, category.id), 'Bienestar');
});

test('1. Crear categoría válida: se agrega con id, name, active: true', () => {
  const finance = createMockFinance({
    categories: [{ id: 'Comida', name: 'Comida', active: true }],
  });
  const created = addCategory(finance, 'Educación');
  assert.equal(finance.categories.length, 2);
  assert.ok(created);
  assert.ok(created.id);
  assert.equal(created.name, 'Educación');
  assert.equal(created.active, true);
  assert.equal(typeof created.createdAt, 'string');
});

test('2. Rechazar categoría vacía o sólo espacios: no muta ni crea categoría', () => {
  const categories: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
  ];
  assert.equal(validateCategoryName('', categories).valid, false);
  assert.equal(validateCategoryName('   ', categories).valid, false);

  const finance = createMockFinance({ categories });
  assert.throws(() => addCategory(finance, '   '), /no puede estar vacío/);
  assert.equal(finance.categories.length, 1);
});

test('3. Rechazar categoría duplicada (case-insensitive)', () => {
  const categories: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
  ];
  const check = validateCategoryName('comida', categories);
  assert.equal(check.valid, false);
  assert.match(check.error || '', /ya existe/i);

  const finance = createMockFinance({ categories });
  assert.throws(() => addCategory(finance, 'COMIDA'), /ya existe/i);
});

test('4. Rechazar categoría duplicada por espacios extras', () => {
  const categories: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
  ];
  const check = validateCategoryName('  Comida  ', categories);
  assert.equal(check.valid, false);
  assert.match(check.error || '', /ya existe/i);

  const finance = createMockFinance({ categories });
  assert.throws(() => addCategory(finance, '  Comida  '), /ya existe/i);
});

test('5. Renombrar categoría: actualiza el display name sin cambiar el ID', () => {
  const finance = createMockFinance({
    categories: [{ id: 'cat-123', name: 'Comida', active: true }],
  });
  const renamed = renameCategory(finance, 'cat-123', 'Alimentación');
  assert.equal(renamed.id, 'cat-123');
  assert.equal(renamed.name, 'Alimentación');
  assert.ok(renamed.updatedAt);
  assert.equal(finance.categories[0].name, 'Alimentación');
});

test('6. Renombrar conserva referencias históricas: transacciones existentes siguen asociadas', () => {
  const finance = createMockFinance({
    transactions: [
      createMockTx({ id: 'tx-1', amount: 500, category: 'Comida' }),
    ],
    categories: [{ id: 'Comida', name: 'Comida', active: true }],
  });

  // Renombrar categoría de 'Comida' a 'Alimentación y Bebidas'
  renameCategory(finance, 'Comida', 'Alimentación y Bebidas');

  // La transacción sigue teniendo category === 'Comida' (id estable)
  assert.equal(finance.transactions[0].category, 'Comida');
  // Pero la UI y helpers resuelven el nuevo display name
  const displayName = getCategoryName(finance.categories, finance.transactions[0].category);
  assert.equal(displayName, 'Alimentación y Bebidas');
});

test('7. Archivar categoría sin movimientos: pasa a active: false', () => {
  const finance = createMockFinance({
    categories: [{ id: 'Gym', name: 'Gym', active: true }],
  });
  archiveCategory(finance, 'Gym');
  assert.equal(finance.categories[0].active, false);
});

test('8. Archivar categoría con movimientos: pasa a active: false y movimientos permanecen intactos', () => {
  const finance = createMockFinance({
    transactions: [
      createMockTx({ id: 'tx-1', amount: 350, category: 'Comida' }),
      createMockTx({ id: 'tx-2', amount: 450, category: 'Comida' }),
    ],
    categories: [{ id: 'Comida', name: 'Comida', active: true }],
  });

  archiveCategory(finance, 'Comida');
  assert.equal(finance.categories[0].active, false);
  // Movimientos no se modifican ni eliminan
  assert.equal(finance.transactions.length, 2);
  assert.equal(finance.transactions[0].amount, 350);
  assert.equal(finance.transactions[1].amount, 450);
  assert.equal(finance.transactions[0].category, 'Comida');
});

test('9. Eliminar físicamente categoría con 0 movimientos: se elimina del array', () => {
  const finance = createMockFinance({
    transactions: [
      createMockTx({ id: 'tx-1', amount: 100, category: 'Comida' }),
    ],
    categories: [
      { id: 'Comida', name: 'Comida', active: true },
      { id: 'Prueba', name: 'Prueba', active: true },
    ],
  });

  deleteCategory(finance, 'Prueba');
  assert.equal(finance.categories.length, 1);
  assert.equal(finance.categories.some((c) => c.id === 'Prueba'), false);
});

test('10. Impedir eliminación física de categoría con movimientos: lanza error', () => {
  const finance = createMockFinance({
    transactions: [
      createMockTx({ id: 'tx-1', amount: 100, category: 'Comida' }),
    ],
    categories: [{ id: 'Comida', name: 'Comida', active: true }],
  });

  assert.throws(
    () => deleteCategory(finance, 'Comida'),
    /No se puede eliminar una categoría con 1 movimiento\(s\) histórico\(s\)/
  );
  // El conteo de movimientos es 1
  const counts = countTransactionsByCategory(finance.transactions, finance.categories);
  assert.equal(counts['Comida'], 1);
});

test('11. Categoría archivada no aparece en selectores de nuevo movimiento (getActiveCategories)', () => {
  const categories: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
    { id: 'Vieja', name: 'Vieja', active: false },
  ];
  const active = getActiveCategories(categories);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'Comida');
  assert.equal(active.some((c) => c.id === 'Vieja'), false);
});

test('12. Categoría archivada sigue visible en transacciones históricas', () => {
  const categories: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: false },
  ];
  const all = getAllCategories(categories);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'Comida');
  assert.equal(getCategoryName(categories, 'Comida'), 'Comida');
});

test('13. Categoría archivada sigue visible en filtros si tiene movimientos', () => {
  const categories: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
    { id: 'Antigua', name: 'Antigua', active: false },
  ];
  const transactions: Transaction[] = [
    createMockTx({ id: 'tx-1', amount: 100, category: 'Antigua' }),
  ];

  // Las categorías presentes en transacciones o activas se pueden resolver
  const usedCategoryIds = new Set(transactions.map((t) => t.category));
  assert.ok(usedCategoryIds.has('Antigua'));
  const cat = getCategoryById(categories, 'Antigua');
  assert.ok(cat);
  assert.equal(cat.active, false);
});

test('14. Reactivar categoría: pasa de active: false a active: true y reaparece en selectores', () => {
  const finance = createMockFinance({
    categories: [{ id: 'Comida', name: 'Comida', active: false }],
  });
  assert.equal(getActiveCategories(finance.categories).length, 0);

  reactivateCategory(finance, 'Comida');
  assert.equal(finance.categories[0].active, true);
  assert.equal(getActiveCategories(finance.categories).length, 1);
  assert.equal(getActiveCategories(finance.categories)[0].id, 'Comida');
});

test('15. Presupuesto de categoría renombrada sigue funcionando por ID', () => {
  const finance = createMockFinance({
    categories: [{ id: 'Comida', name: 'Comida', active: true }],
    budgets: { Comida: 15000 },
  });

  // Renombrar la categoría a 'Alimentos'
  renameCategory(finance, 'Comida', 'Alimentos');

  // El presupuesto asignado por ID ('Comida') sigue siendo accesible
  assert.equal(finance.budgets['Comida'], 15000);
});

test('16. Reportes y flujo de caja reflejan nombres renombrados sin romper históricos', () => {
  const finance = createMockFinance({
    transactions: [
      createMockTx({ id: 'tx-1', amount: 500, category: 'cat-stream' }),
    ],
    categories: [{ id: 'cat-stream', name: 'Streaming', active: true }],
  });

  // Renombrar a 'Entretenimiento Digital'
  renameCategory(finance, 'cat-stream', 'Entretenimiento Digital');

  // En reportes, agrupamos o formateamos mediante getCategoryName
  const reportRows = finance.transactions.map((t) => ({
    ...t,
    categoryDisplay: getCategoryName(finance.categories, t.category),
  }));

  assert.equal(reportRows[0].categoryDisplay, 'Entretenimiento Digital');
  assert.equal(reportRows[0].amount, 500);
});

test('17. Backup y Restore roundtrip preserva categorías (activas y archivadas)', () => {
  const initial = defaultState();
  initial.finance.categories = [
    { id: 'c1', name: 'Comida', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'c2', name: 'Auto Antiguo', active: false, createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  initial.finance.transactions = [
    createMockTx({ id: 'tx-1', amount: 200, category: 'c2' }),
  ];

  // Serialize to JSON string
  const jsonBackup = JSON.stringify(initial);

  // Parse and normalize
  const restored = normalizeStoredState(parseBackupJSON(jsonBackup));

  assert.equal(restored.schemaVersion, CURRENT_SCHEMA_VERSION);
  const activeCat = restored.finance.categories.find((c) => c.id === 'c1');
  const archivedCat = restored.finance.categories.find((c) => c.id === 'c2');

  assert.ok(activeCat);
  assert.equal(activeCat.active, true);
  assert.ok(archivedCat);
  assert.equal(archivedCat.active, false);
  assert.equal(archivedCat.name, 'Auto Antiguo');
});

test('18. Normalización de estado legado: strings se convierten automáticamente a objetos', () => {
  const legacyCategories = ['Comida', 'Transporte', 'Gimnasio'];
  const legacyTransactions: Transaction[] = [
    createMockTx({ id: 't1', amount: 100, category: 'Comida' }),
    createMockTx({ id: 't2', amount: 100, category: 'Histórico Perdido' }),
  ];

  const normalized = normalizeCategories(legacyCategories, legacyTransactions);
  assert.ok(normalized.every((c) => typeof c === 'object' && c.id && c.name && typeof c.active === 'boolean'));

  // Includes standard legacy categories
  assert.ok(normalized.some((c) => c.id === 'Comida' && c.name === 'Comida' && c.active === true));
  assert.ok(normalized.some((c) => c.id === 'Transporte' && c.name === 'Transporte' && c.active === true));

  // Discovers historical categories used in transactions that were not in categories array
  assert.ok(normalized.some((c) => c.id === 'Histórico Perdido' && c.name === 'Histórico Perdido'));
});

test('19. Sincronización multi-dispositivo: concurrent creation, rename conflict, y tombstones', () => {
  // 19a. Concurrent additions: Dispositivo A crea 'Gym', Dispositivo B crea 'Cursos'
  const baseCats: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
  ];
  const localCats: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
    { id: 'Gym', name: 'Gym', active: true },
  ];
  const remoteCats: FinanceCategory[] = [
    { id: 'Comida', name: 'Comida', active: true },
    { id: 'Cursos', name: 'Cursos', active: true },
  ];

  const merged = mergeEntityCollection<FinanceCategory>(localCats, remoteCats, baseCats);
  assert.equal(merged.length, 3);
  assert.ok(merged.some((c) => c.id === 'Gym'));
  assert.ok(merged.some((c) => c.id === 'Cursos'));

  // 19b. Rename conflict: Local renombra a 'Supermercado', Remote renombra a 'Alimentos'
  let conflictRecorded = false;
  const localConflictCats: FinanceCategory[] = [
    { id: 'Comida', name: 'Supermercado', active: true, updatedAt: '2026-09-01T12:00:00Z' },
  ];
  const remoteConflictCats: FinanceCategory[] = [
    { id: 'Comida', name: 'Alimentos', active: true, updatedAt: '2026-09-01T12:05:00Z' },
  ];

  mergeFinanceModule(
    { ...defaultState().finance, categories: localConflictCats },
    { ...defaultState().finance, categories: remoteConflictCats },
    { ...defaultState().finance, categories: baseCats },
    {},
    () => {
      conflictRecorded = true;
    }
  );
  assert.equal(conflictRecorded, true);

  // 19c. Tombstone deletion: Categoría sin movimientos borrada en A no resucita tras sincronizar con B
  const tombstones = { 'del-cat': Date.now() };
  const localWithTombstone: FinanceCategory[] = [];
  const remoteWithCategory: FinanceCategory[] = [
    { id: 'del-cat', name: 'Borrable', active: true },
  ];
  const baseWithCategory: FinanceCategory[] = [
    { id: 'del-cat', name: 'Borrable', active: true },
  ];

  const mergedTombstone = mergeEntityCollection<FinanceCategory>(
    localWithTombstone,
    remoteWithCategory,
    baseWithCategory,
    tombstones
  );
  assert.equal(mergedTombstone.some((c) => c.id === 'del-cat'), false);
});

test('20. Stream Guard en conteo de categorías: conteo exacto e integridad', () => {
  const txs: Transaction[] = [
    createMockTx({ id: 't1', amount: 100, category: 'Comida' }),
    createMockTx({ id: 't2', amount: 200, category: 'Comida' }),
  ];
  const cats: FinanceCategory[] = [{ id: 'Comida', name: 'Comida', active: true }];
  const counts = countTransactionsByCategory(txs, cats);
  assert.equal(counts['Comida'], 2);
  assert.equal(counts['Inexistente'] || 0, 0);
});

test('21. schemaVersion permanece en 2 estrictamente', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
  const state = defaultState();
  assert.equal(state.schemaVersion, 2);
  const normalized = normalizeStoredState({ schemaVersion: 2, finance: { categories: ['Comida'] } });
  assert.equal(normalized.schemaVersion, 2);
});

test('22. Bug resolution: Nueva categoría con ID generado resuelve a su nombre visible en UI', () => {
  const categories: FinanceCategory[] = [
    { id: 'cat_doejkk4dkghq', name: 'Regalos', active: true },
    { id: 'Comida', name: 'Comida', active: true },
  ];

  // 1. New category ID resolves to human name
  assert.equal(getCategoryName(categories, 'cat_doejkk4dkghq'), 'Regalos');

  // 2. Legacy category (id === name) resolves to name
  assert.equal(getCategoryName(categories, 'Comida'), 'Comida');

  // 3. Fallback for unknown category returns raw string without crashing
  assert.equal(getCategoryName(categories, 'NoExiste'), 'NoExiste');
  assert.equal(getCategoryName(categories, ''), '');
  assert.equal(getCategoryName(categories, null), '');
});

test('23. Renombrado y archivado preservan la resolución de nombre', () => {
  const finance = createMockFinance({
    categories: [{ id: 'cat_doejkk4dkghq', name: 'Regalos', active: true }],
  });

  // Renombrado actualiza el nombre visible
  renameCategory(finance, 'cat_doejkk4dkghq', 'Obsequios');
  assert.equal(getCategoryName(finance.categories, 'cat_doejkk4dkghq'), 'Obsequios');

  // Archivado preserva la resolución de nombre para transacciones históricas
  archiveCategory(finance, 'cat_doejkk4dkghq');
  assert.equal(getCategoryName(finance.categories, 'cat_doejkk4dkghq'), 'Obsequios');
  assert.equal(finance.categories[0].active, false);
});

test('24. Búsqueda global: encuentra transacciones por nombre de categoría nueva y no muestra IDs crudos', () => {
  const state = defaultState();
  state.finance.categories = [
    { id: 'cat_doejkk4dkghq', name: 'Regalos', active: true },
  ];
  state.finance.transactions = [
    createMockTx({
      id: 'tx-regalo',
      amount: 500,
      type: 'ingreso',
      category: 'cat_doejkk4dkghq',
      note: 'Regalo mamá',
    }),
  ];

  // Búsqueda por nombre de categoría "Regalos"
  const results = searchLifeOS(state, 'Regalos');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'tx-tx-regalo');
  // Verifica que el subtítulo use el nombre humano "Regalos" y NO "cat_doejkk4dkghq"
  assert.ok(results[0].subtitle.includes('Regalos'));
  assert.ok(!results[0].subtitle.includes('cat_doejkk4dkghq'));
});

test('25. Quick Capture: resuelve categorías por nombre o ID sin exponer IDs crudos en historial', () => {
  const state = defaultState();
  state.finance.categories = [
    { id: 'cat_doejkk4dkghq', name: 'Regalos', active: true },
  ];

  // Agrega movimiento rápido pasando el nombre humano
  const tx = addQuickTransaction(state, {
    type: 'ingreso',
    amount: 500,
    category: 'Regalos',
    note: 'Regalo mamá',
  });

  // La transacción interna se asocia al ID estable
  assert.equal(tx.category, 'cat_doejkk4dkghq');

  // La resolución para la UI siempre muestra el nombre humano
  assert.equal(getCategoryName(state.finance.categories, tx.category), 'Regalos');
});
