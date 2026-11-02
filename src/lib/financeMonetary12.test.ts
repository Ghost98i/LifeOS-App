import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents,
  fromCents,
  roundMoney,
  diffMoney,
  sumMoney,
  parseDecimalInput,
  formatMoney,
  fmtMoney,
  defaultState,
} from './storage';
import {
  addAccount,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addTransfer,
  reconcileAccount,
  updateReconciliation,
} from './financeFlows';
import { calcSpentMonth } from './calculations';
import { parseQuickFinance } from '../utils/quickFinanceParser';
import {
  canConfirmDraft,
  confirmCaptureDraft,
  parseSingleClauseDraft,
  convertDraftToInbox,
  FinanceDraft,
} from './quickCaptureDrafts';
import type { LifeOSState } from '../types';

function createBaseState(): LifeOSState {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-uyu', name: 'Banco UYU', balance: 100, initialBalance: 100, currency: 'UYU' },
    { id: 'acc-usd', name: 'Banco USD', balance: 50, initialBalance: 50, currency: 'USD' },
  ];
  state.finance.transactions = [];
  state.finance.categories = [
    { id: 'cat-super', name: 'Supermercado', active: true },
    { id: 'cat-servicios', name: 'Servicios', active: true },
  ];
  state.finance.transfers = [];
  return state;
}

test('Finanzas 1.2B — Helpers monetarios fundamentales', async (t) => {
  await t.test('toCents y fromCents redondean con exactitud sin ruido IEEE-754', () => {
    assert.equal(toCents(1.005), 101);
    assert.equal(toCents(35.855), 3586);
    assert.equal(toCents(0.01), 1);
    assert.equal(toCents(0.1), 10);
    assert.equal(toCents(-0.05), -5);
    assert.equal(fromCents(101), 1.01);
    assert.equal(fromCents(-5), -0.05);
  });

  await t.test('roundMoney preserva dos decimales exactos', () => {
    assert.equal(roundMoney(249.5), 249.5);
    assert.equal(roundMoney(100.05), 100.05);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(1.005), 1.01);
  });

  await t.test('diffMoney resta importes sin residuos binarios', () => {
    // 100.00 - 99.95 in standard JS gives 0.05000000000000426
    const standardDiff = 100.00 - 99.95;
    assert.notEqual(standardDiff, 0.05);
    // diffMoney must be exactly 0.05
    assert.equal(diffMoney(100.00, 99.95), 0.05);
    assert.equal(diffMoney(99.95, 100.00), -0.05);
    assert.equal(diffMoney(10.00, 9.99), 0.01);
  });

  await t.test('sumMoney suma importes fraccionarios con exactitud de centésimos', () => {
    // 0.10 + 0.20 in standard JS gives 0.30000000000000004
    assert.equal(sumMoney(0.1, 0.2), 0.3);
    assert.equal(sumMoney([0.1, 0.2]), 0.3);
    assert.equal(sumMoney([0.01, 0.02, 0.03, 0.04]), 0.1);
  });

  await t.test('parseDecimalInput acepta coma y punto, y rechaza entradas ambiguas', () => {
    assert.equal(parseDecimalInput('249,50').value, 249.5);
    assert.equal(parseDecimalInput('249.50').value, 249.5);
    assert.equal(parseDecimalInput('1.234,56').value, 1234.56);
    assert.equal(parseDecimalInput('1,234.56').value, 1234.56);
    assert.equal(parseDecimalInput('100,05').value, 100.05);
    assert.equal(parseDecimalInput('0,01').value, 0.01);
    assert.equal(parseDecimalInput('10').value, 10);
    assert.equal(parseDecimalInput('10,00').value, 10);

    // Entradas ambiguas con 3 decimales
    const ambiguousComma = parseDecimalInput('249,505');
    assert.equal(ambiguousComma.value, null);
    assert.match(ambiguousComma.error!, /hasta 2 decimales/i);

    const ambiguousDot = parseDecimalInput('249.505');
    assert.equal(ambiguousDot.value, null);
    assert.match(ambiguousDot.error!, /ambiguo/i);

    // Entradas inválidas
    assert.equal(parseDecimalInput('').value, null);
    assert.equal(parseDecimalInput('abc').value, null);
  });
});

test('Finanzas 1.2B — Formateador canónico unificado', async (t) => {
  await t.test('formatea importes UYU y USD con convención uruguaya', () => {
    assert.equal(formatMoney(1250, 'UYU'), '$U 1.250');
    assert.equal(formatMoney(249.5, 'UYU'), '$U 249,50');
    assert.equal(formatMoney(19.99, 'USD'), 'US$ 19,99');
    assert.equal(formatMoney(0.01, 'UYU'), '$U 0,01');
    assert.equal(formatMoney(0, 'UYU'), '$U 0');
    assert.equal(formatMoney(0, 'USD'), 'US$ 0');
    assert.equal(formatMoney(-0.05, 'UYU'), '−$U 0,05');
    assert.equal(formatMoney(-19.99, 'USD'), '−US$ 19,99');
  });

  await t.test('soporta opciones forceDecimals y noSymbol', () => {
    assert.equal(formatMoney(1250, 'UYU', { forceDecimals: true }), '$U 1.250,00');
    assert.equal(formatMoney(1250.5, 'UYU', { noSymbol: true }), '1.250,50');
    assert.equal(formatMoney(1250, 'UYU', { noSymbol: true }), '1.250');
  });

  await t.test('fmtMoney es compatible hacia atrás y no redondea centésimos', () => {
    assert.equal(fmtMoney(249.5), '$U 249,50');
    assert.equal(fmtMoney(1250), '$U 1.250');
  });
});

test('Finanzas 1.2B — Aritmética y ciclo contable en el Ledger', async (t) => {
  await t.test('conserva centésimos en creación, actualización y eliminación de movimientos', () => {
    const state = createBaseState();
    // Saldo inicial: 100.00 en acc-uyu
    // Gasto: 0.01
    const tx = addTransaction(state, {
      type: 'gasto',
      amount: 0.01,
      category: 'Supermercado',
      accountId: 'acc-uyu',
      date: '2026-10-17',
    });
    assert.equal(tx.amount, 0.01);
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 99.99);

    // Gasto adicional de 9.99
    const tx2 = addTransaction(state, {
      type: 'gasto',
      amount: 9.99,
      category: 'Supermercado',
      accountId: 'acc-uyu',
      date: '2026-10-17',
    });
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 90.00);

    // Modificar tx de 0.01 a 0.11
    updateTransaction(state, tx.id, {
      type: 'gasto',
      amount: 0.11,
      category: 'Supermercado',
      accountId: 'acc-uyu',
      date: '2026-10-17',
    });
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 89.90);

    // Eliminar tx2 (9.99 revertido)
    deleteTransaction(state, tx2.id);
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 99.89);
  });

  await t.test('transferencia de 25.55 conserva exactitud en origen y destino', () => {
    const state = createBaseState();
    // Crear segunda cuenta UYU
    addAccount(state, 'Caja de Ahorro UYU', 50.00, 'UYU');
    const destAccId = state.finance.accounts[state.finance.accounts.length - 1].id;

    addTransfer(state, {
      fromAccountId: 'acc-uyu',
      toAccountId: destAccId,
      amount: 25.55,
      date: '2026-10-17',
    });

    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 74.45);
    assert.equal(state.finance.accounts.find((a) => a.id === destAccId)?.balance, 75.55);
  });

  await t.test('conciliación de saldo elimina residuos binarios y registra moneda explícita', () => {
    const state = createBaseState();
    // Sistema: 100.00
    // Real: 99.95
    // Diferencia esperada: -0.05
    const recon = reconcileAccount(state, {
      accountId: 'acc-uyu',
      actualBalance: 99.95,
      date: '2026-10-17',
      note: 'Ajuste de centésimos',
    });

    assert.equal(recon.difference, -0.05);
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 99.95);

    // El movimiento de ajuste generado debe tener importe 0.05 y moneda UYU
    const adjTx = state.finance.transactions.find((t) => t.origin === 'adjustment');
    assert.ok(adjTx);
    assert.equal(adjTx.amount, 0.05);
    assert.equal(adjTx.type, 'gasto');
    assert.equal(adjTx.currency, 'UYU');

    // Editar conciliación a 99.90 -> diferencia -0.10
    updateReconciliation(state, recon.id, {
      accountId: 'acc-uyu',
      actualBalance: 99.90,
      date: '2026-10-17',
    });
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 99.90);
    const updatedAdjTx = state.finance.transactions.find((t) => t.origin === 'adjustment');
    assert.equal(updatedAdjTx?.amount, 0.10);
  });
});

test('Finanzas 1.2B — Segregación estricta de monedas en cálculos', async (t) => {
  await t.test('no suma UYU y USD 1:1 en métricas mensuales', context => {
    context.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 17, 12).getTime() });
    context.after(() => context.mock.timers.reset());
    const state = createBaseState();
    // Agregar gasto de 1000 UYU en acc-uyu
    addTransaction(state, {
      type: 'gasto',
      amount: 1000,
      category: 'Supermercado',
      accountId: 'acc-uyu',
      date: '2026-10-17',
    });
    // Agregar gasto de 50 USD en acc-usd
    addTransaction(state, {
      type: 'gasto',
      amount: 50,
      category: 'Servicios',
      accountId: 'acc-usd',
      date: '2026-10-17',
    });

    const spentUYU = calcSpentMonth(state, 0, 'UYU');
    const spentUSD = calcSpentMonth(state, 0, 'USD');

    assert.equal(spentUYU, 1000);
    assert.equal(spentUSD, 50);
  });
});

test('Finanzas 1.2B — Quick Capture y Drafts con centésimos y divisas', async (t) => {
  await t.test('preview USD y borrador USD son coherentes en importe y moneda', () => {
    const state = createBaseState();
    const parsed = parseQuickFinance('gaste 30 dolares en comida', {
      accounts: state.finance.accounts,
      categories: state.finance.categories,
    });
    assert.equal(parsed.amount, 30);
    assert.equal(parsed.currency, 'USD');
    assert.match(parsed.preview, /US\$\s*30/);

    const draft = parseSingleClauseDraft('gaste 30 dolares en comida', state, '2026-10-17') as FinanceDraft;
    assert.ok(draft);
    assert.equal(draft.amount, 30);
    assert.equal(draft.currency, 'USD');
    assert.equal(formatMoney(draft.amount!, draft.currency), 'US$ 30');
    assert.equal(draft.accountId, 'acc-usd');
  });

  await t.test('reconoce entradas con dolares, dólares, US$, U$S y pesos sin confundir monedas', () => {
    const state = createBaseState();
    const opts = { accounts: state.finance.accounts, categories: state.finance.categories };

    const t1 = parseQuickFinance('gasté 30 dólares en comida', opts);
    assert.equal(t1.amount, 30);
    assert.equal(t1.currency, 'USD');

    const t2 = parseQuickFinance('gaste 30 dolares en comida', opts);
    assert.equal(t2.amount, 30);
    assert.equal(t2.currency, 'USD');

    const t3 = parseQuickFinance('pagué US$ 19,99', opts);
    assert.equal(t3.amount, 19.99);
    assert.equal(t3.currency, 'USD');

    const t4 = parseQuickFinance('gasté U$S 12', opts);
    assert.equal(t4.amount, 12);
    assert.equal(t4.currency, 'USD');

    const t5 = parseQuickFinance('gasté 249,50 pesos en comida', opts);
    assert.equal(t5.amount, 249.5);
    assert.equal(t5.currency, 'UYU');
  });

  await t.test('USD sin cuenta compatible: bloquea con mensaje específico sin negar soporte de USD', () => {
    const state = createBaseState();
    state.finance.accounts = state.finance.accounts.filter((a) => a.currency === 'UYU');

    const draft = parseSingleClauseDraft('US$ 50 supermercado', state, '2026-10-17') as FinanceDraft;
    assert.ok(draft);
    assert.equal(draft.currency, 'USD');
    assert.equal(draft.isCurrencyIncompatible, true);
    assert.match(draft.ambiguityWarning!, /cuenta en d[oó]lares/i);
    assert.doesNotMatch(draft.ambiguityWarning!, /únicamente en moneda local/i);

    const validation = canConfirmDraft(state, draft);
    assert.equal(validation.valid, false);
    assert.match(validation.reason!, /cuenta en d[oó]lares|incompatible/i);

    assert.throws(() => confirmCaptureDraft(state, draft), /cuenta en d[oó]lares|Moneda no soportada/i);
  });

  await t.test('USD con cuenta compatible: confirmación válida sin tocar cuenta UYU', () => {
    const state = createBaseState();
    const draft = parseSingleClauseDraft('US$ 50 supermercado', state, '2026-10-17') as FinanceDraft;
    assert.ok(draft);
    assert.equal(draft.currency, 'USD');
    assert.equal(draft.isCurrencyIncompatible, false);
    assert.equal(draft.accountId, 'acc-usd'); // auto-sugerida

    const validation = canConfirmDraft(state, draft);
    assert.equal(validation.valid, true);

    const result = confirmCaptureDraft(state, draft);
    assert.equal(result.sound, 'coins');
    const createdTx = state.finance.transactions[state.finance.transactions.length - 1];
    assert.ok(createdTx);
    assert.equal(createdTx.amount, 50);
    assert.equal(createdTx.currency, 'USD');
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-usd')?.balance, 0);
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-uyu')?.balance, 100); // Intacta
  });

  await t.test('USD con cuenta UYU seleccionada: bloquea hasta cambiar a cuenta USD', () => {
    const state = createBaseState();
    const draft = parseSingleClauseDraft('US$ 50 supermercado', state, '2026-10-17') as FinanceDraft;
    assert.ok(draft);

    // Usuario o estado asocia cuenta UYU por error
    draft.accountId = 'acc-uyu';
    const validationBlocked = canConfirmDraft(state, draft);
    assert.equal(validationBlocked.valid, false);
    assert.match(validationBlocked.reason!, /incompatible/i);
    assert.throws(() => confirmCaptureDraft(state, draft), /incompatible/i);

    // Se corrige seleccionando la cuenta USD
    draft.accountId = 'acc-usd';
    const validationOk = canConfirmDraft(state, draft);
    assert.equal(validationOk.valid, true);
    assert.doesNotThrow(() => confirmCaptureDraft(state, draft));
  });

  await t.test('confirmar todos no escribe borradores bloqueados ni incompatibles en el ledger', () => {
    const state = createBaseState();
    // 1 borrador válido en UYU
    const dValid = parseSingleClauseDraft('200 supermercado', state, '2026-10-17') as FinanceDraft;
    dValid.accountId = 'acc-uyu';

    // 1 borrador USD incompatible (forzado a cuenta UYU)
    const dIncompatible = parseSingleClauseDraft('US$ 50 supermercado', state, '2026-10-17') as FinanceDraft;
    dIncompatible.accountId = 'acc-uyu';

    // 1 borrador en cuotas
    const dCuotas = parseSingleClauseDraft('6000 en 12 cuotas', state, '2026-10-17') as FinanceDraft;

    const drafts = [dValid, dIncompatible, dCuotas];

    let confirmedCount = 0;
    for (const d of drafts) {
      if (canConfirmDraft(state, d).valid) {
        confirmCaptureDraft(state, d);
        confirmedCount++;
      }
    }

    assert.equal(confirmedCount, 1);
    assert.equal(state.finance.transactions.length, 1);
    assert.equal(state.finance.transactions[0].amount, 200);
    assert.equal(state.finance.transactions[0].currency, 'UYU');
    assert.equal(state.finance.accounts.find((a) => a.id === 'acc-usd')?.balance, 50); // Intacta
  });

  await t.test('guardar en Bandeja preserva íntegramente el texto original', () => {
    const state = createBaseState();
    const draft = parseSingleClauseDraft('US$ 1500 pasajes aéreos en 12 cuotas', state, '2026-10-17') as FinanceDraft;
    assert.ok(draft);

    const inboxDraft = convertDraftToInbox(draft);
    assert.equal(inboxDraft.kind, 'inbox');
    assert.equal(inboxDraft.text, 'US$ 1500 pasajes aéreos en 12 cuotas');
    assert.equal(inboxDraft.rawText, 'US$ 1500 pasajes aéreos en 12 cuotas');

    const result = confirmCaptureDraft(state, inboxDraft);
    assert.ok(result.message.includes('Bandeja de Entrada'));
    assert.equal(state.inbox.length, 1);
    assert.equal(state.inbox[0].text, 'US$ 1500 pasajes aéreos en 12 cuotas');
    assert.equal(state.finance.transactions.length, 0); // No toca contabilidad
  });

  await t.test('compra financiada en cuotas bloquea registro inmediato y preserva saldo', () => {
    const state = createBaseState();
    const draft = parseSingleClauseDraft('6000 en 12 cuotas', state, '2026-10-17') as FinanceDraft;
    assert.ok(draft);
    assert.equal(draft.installments, 12);

    const validation = canConfirmDraft(state, draft);
    assert.equal(validation.valid, false);
    assert.match(validation.reason!, /cuotas/i);

    assert.throws(() => confirmCaptureDraft(state, draft), /cuotas/i);
    assert.equal(state.finance.transactions.length, 0);
    assert.equal(state.finance.accounts[0].balance, 100);
  });
});
