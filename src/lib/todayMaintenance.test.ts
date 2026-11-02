import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, todayISO } from './storage';
import { computeHiddenTabsFromSelection, OPTIONAL_MODULES } from './moduleVisibility';
import { getAllAttentionCandidates, getDismissedAttentionItems, getTodayAttentionItems } from './todayAttention';
import { isWeeklyReviewDue, weeklyReviewExceptions } from './review';
import { accountHasRecordedActivity, hasBackupContent, hasReviewableActivity } from './todayMaintenance';

for (const modules of [[], ['finanzas'], ['finanzas', 'gimnasio'], [...OPTIONAL_MODULES]]) {
  test(`Hoy vacío no genera mantenimiento: ${modules.join(', ') || 'sin módulos'}`, () => {
    const state = defaultState();
    state.settings.onboardingCompleted = true;
    state.settings.darkMode = true;
    state.settings.hiddenTabs = computeHiddenTabsFromSelection(modules);
    const before = JSON.stringify(state);
    assert.equal(hasReviewableActivity(state), false);
    assert.equal(hasBackupContent(state), false);
    assert.deepEqual(getTodayAttentionItems(state), []);
    assert.deepEqual(weeklyReviewExceptions(state), []);
    assert.equal(isWeeklyReviewDue(state), false);
    assert.equal(JSON.stringify(state), before, 'Evaluar avisos no escribe metadatos ni fechas');
  });
}

test('contenido propio habilita una primera copia y una invitación real a revisar, sin período de espera', () => {
  const state = defaultState();
  state.todayExtras.push({ id: 'task', text: 'Preparar la reunión', date: todayISO(), done: false, priority: 'media' });
  const before = JSON.stringify(state);
  const notices = getAllAttentionCandidates(state);
  const backup = notices.find((item) => item.signalKind === 'backup_urgent')!;
  const review = notices.find((item) => item.signalKind === 'weekly_review_due')!;
  assert.equal(backup.title, 'Copia de seguridad');
  assert.equal(backup.detail, 'No hay una copia de seguridad registrada.');
  assert.equal(backup.urgency, 'warning');
  assert.equal(review.title, 'Revisá tu semana');
  assert.equal(review.urgency, 'info');
  assert.equal(weeklyReviewExceptions(state).find((item) => item.id === 'backup')?.detail, backup.detail);
  assert.equal(JSON.stringify(state), before);
});

test('la antigüedad conocida conserva el aviso y no se confunde con una primera copia', () => {
  const state = defaultState();
  state.todayExtras.push({ id: 'task', text: 'Actividad real', date: '2026-10-31', done: false, priority: 'media' });
  state.settings.lastBackupAt = '2026-10-20';
  state.settings.lastWeeklyReviewAt = '2026-10-20';
  const notices = getAllAttentionCandidates(state, { todayIso: '2026-10-31' });
  assert.equal(notices.find((item) => item.signalKind === 'backup_urgent')?.detail, 'La última copia registrada fue hace 11 días.');
  assert.equal(notices.find((item) => item.signalKind === 'backup_urgent')?.urgency, 'urgent');
  assert.equal(notices.find((item) => item.signalKind === 'weekly_review_due')?.title, 'Revisión semanal pendiente');
  state.settings.lastBackupAt = '2026-10-31';
  state.settings.lastWeeklyReviewAt = '2026-10-31';
  assert.deepEqual(getTodayAttentionItems(state, { todayIso: '2026-10-31' }), []);
});

test('las cuentas sin uso no son atrasos; saldos iniciales, movimientos y conciliaciones reales sí cuentan', () => {
  const state = defaultState();
  const account = state.finance.accounts[0];
  assert.equal(accountHasRecordedActivity(state, account), false);
  assert.equal(weeklyReviewExceptions(state).some((item) => item.id === 'stale-accounts'), false);
  account.initialBalance = 15000;
  assert.equal(accountHasRecordedActivity(state, account), true);
  assert.equal(weeklyReviewExceptions(state).find((item) => item.id === 'stale-accounts')?.detail, account.name);
  account.initialBalance = 0;
  state.finance.transactions.push({ id: 'tx', accountId: account.id, amount: 500, type: 'gasto', category: 'Otros', date: todayISO(), fixed: 'variable' });
  assert.equal(accountHasRecordedActivity(state, account), true);
  account.lastReconciledAt = todayISO();
  assert.equal(weeklyReviewExceptions(state).some((item) => item.id === 'stale-accounts'), false);
  state.finance.transactions = [];
  account.lastReconciledAt = '2020-01-01';
  assert.equal(weeklyReviewExceptions(state).some((item) => item.id === 'stale-accounts'), true);
});

test('ocultar un módulo no elimina la necesidad de proteger su contenido, pero no exige revisarlo', () => {
  const state = defaultState();
  state.settings.hiddenTabs = [...OPTIONAL_MODULES];
  state.notes.postits.push({ id: 'note', text: 'Apunte propio', date: todayISO() });
  assert.equal(hasBackupContent(state), true);
  assert.equal(hasReviewableActivity(state), false);
  assert.equal(isWeeklyReviewDue(state), false);
  state.settings.hiddenTabs = [];
  assert.equal(isWeeklyReviewDue(state), true);
  state.settings.lastWeeklyReviewAt = todayISO();
  assert.equal(isWeeklyReviewDue(state), false);
});

test('planes propios se respaldan; registros vacíos de Estado no crean actividad', () => {
  const state = defaultState();
  state.dailyContext.push({ date: todayISO(), sleepHours: null, energy: null, mood: null, connection: null });
  assert.equal(hasReviewableActivity(state), false);
  assert.equal(hasBackupContent(state), false);
  state.tasksRecurring.push({ id: 'own-routine', name: 'Revisar el correo', freq: 'daily' });
  assert.equal(hasBackupContent(state), true);
  state.tasksRecurring.pop();
  state.dailyContext[0].sleepHours = 0;
  assert.equal(hasReviewableActivity(state), true, 'Cero horas es un dato real');
});

test('privacidad enmascara importes y números libres de avisos financieros, incluidos los descartados', () => {
  const state = defaultState();
  state.finance.commitments = [{ id: 'payment', name: 'Servicio $U 7689,45', amount: 3500, currency: 'UYU', frequency: 'once', nextDueDate: '2026-10-30', active: true }];
  state.finance.agreements = [{ id: 'agreement', title: 'Compra USD 9876', creditorName: 'Comercio de prueba', status: 'active', currency: 'USD', initialRemainingBalance: 2500, initialReferenceDate: '2026-10-01', createdAt: '2026-10-01', updatedAt: '2026-10-01', schedule: { totalInstallments: 2, installmentAmount: 1250, firstDueDate: '2026-10-30', dueDay: 30, frequency: 'monthly' } }];
  const options = { todayIso: '2026-10-31' };
  const publicItems = getAllAttentionCandidates(state, options).filter((item) => item.module === 'finanzas');
  assert.equal(publicItems.length, 2);
  assert.match(JSON.stringify(publicItems), /3\.500/);
  assert.match(JSON.stringify(publicItems), /1[.,]250/);
  state.settings.privacyMode = true;
  const before = JSON.stringify(state);
  const privateItems = getAllAttentionCandidates(state, options).filter((item) => item.module === 'finanzas');
  assert.equal(JSON.stringify(state), before);
  assert.doesNotMatch(JSON.stringify(privateItems), /3500|3\.500|7689|9876|1[.,]250/);
  assert.ok(privateItems.every((item) => item.detail.includes('••••') && item.detail.includes('venció ayer')));
  assert.deepEqual(privateItems.map((item) => item.dismissKey), publicItems.map((item) => item.dismissKey));
  state.settings.dismissedAttentionKeys = privateItems.map((item) => item.dismissKey);
  const dismissed = getDismissedAttentionItems(state, options);
  assert.equal(dismissed.length, 2);
  assert.doesNotMatch(JSON.stringify(dismissed), /3\.500|7689|9876|1[.,]250/);
  assert.equal(getTodayAttentionItems(state, options).some((item) => item.module === 'finanzas'), false);
  state.settings.privacyMode = false;
  assert.match(JSON.stringify(getDismissedAttentionItems(state, options)), /3\.500/);
  assert.equal(state.finance.commitments[0].amount, 3500);
});
