import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { cashFlowProjection } from './calculations';
import { createFinancingAgreement } from './financeAgreements';
import { FinanceAccountsView } from '../components/FinanceAccountsView';
import { FinanceAnalyticsView } from '../components/FinanceAnalyticsView';
import { FinanceFutureView, computeProjectionXAxisTicks } from '../components/FinanceFutureView';

const noop = () => undefined;

test('Bloque 18 (Cuentas): grilla adaptativa sin hueco en 1 y 2 cuentas, íconos de financeIcons y acciones Trash2 sin ×', () => {
  // 1. Con 2 cuentas (Efectivo + Banco) -> md:grid-cols-2 (sin lg:grid-cols-3)
  const stateTwo = defaultState();
  stateTwo.finance.accounts = [
    { id: 'a1', name: 'Efectivo', currency: 'UYU', balance: 4500, initialBalance: 4500 },
    { id: 'a2', name: 'Banco Itaú', currency: 'UYU', balance: 28000, initialBalance: 28000 },
  ];
  createFinancingAgreement(stateTwo, {
    title: 'Auriculares cuotas',
    creditorName: 'Tienda',
    currency: 'UYU',
    initialRemainingBalance: 6000,
    initialReferenceDate: todayISO(),
  });

  const htmlTwo = renderToStaticMarkup(
    <FinanceAccountsView
      state={stateTwo}
      onUpdateState={noop}
      onAddAccount={noop}
      onDeleteAccount={noop}
      onAddDebt={noop}
      onDeleteDebt={noop}
      onAddInvestment={noop}
      onDeleteInvestment={noop}
      onOpenTransfer={noop}
      onOpenReconcile={noop}
    />
  );

  assert.match(htmlTwo, /data-accounts-grid="true"[^>]*data-accounts-grid-cols="2"[^>]*class="grid grid-cols-1 md:grid-cols-2/);
  assert.doesNotMatch(htmlTwo, /data-accounts-grid="true"[^>]*lg:grid-cols-3/);
  assert.match(htmlTwo, /data-finance-account-icon="Banknote"/);
  assert.match(htmlTwo, /data-finance-account-icon="Landmark"/);
  assert.match(htmlTwo, /aria-label="Eliminar cuenta Efectivo"/);
  assert.match(htmlTwo, /aria-label="Eliminar acuerdo Auriculares cuotas"/);
  assert.doesNotMatch(htmlTwo, />✕<\/button>/);
  assert.doesNotMatch(htmlTwo, /[▾▴▼▲▶◀]/);

  // 2. Con 1 cuenta -> grid-cols-1
  const stateOne = defaultState();
  stateOne.finance.accounts = [{ id: 'a1', name: 'Prex UYU', currency: 'UYU', balance: 1500, initialBalance: 1500 }];
  const htmlOne = renderToStaticMarkup(
    <FinanceAccountsView
      state={stateOne}
      onUpdateState={noop}
      onAddAccount={noop}
      onDeleteAccount={noop}
      onAddDebt={noop}
      onDeleteDebt={noop}
      onAddInvestment={noop}
      onDeleteInvestment={noop}
    />
  );
  assert.match(htmlOne, /data-accounts-grid="true"[^>]*data-accounts-grid-cols="1"[^>]*class="grid grid-cols-1 gap-3\.5"/);
  assert.match(htmlOne, /data-finance-account-icon="Wallet"/);

  // 3. Con 3 cuentas -> lg:grid-cols-3
  const stateThree = defaultState();
  stateThree.finance.accounts = [
    { id: 'a1', name: 'Efectivo', currency: 'UYU', balance: 1000, initialBalance: 1000 },
    { id: 'a2', name: 'Banco BROU', currency: 'UYU', balance: 10000, initialBalance: 10000 },
    { id: 'a3', name: 'Prex', currency: 'UYU', balance: 2500, initialBalance: 2500 },
  ];
  const htmlThree = renderToStaticMarkup(
    <FinanceAccountsView
      state={stateThree}
      onUpdateState={noop}
      onAddAccount={noop}
      onDeleteAccount={noop}
      onAddDebt={noop}
      onDeleteDebt={noop}
      onAddInvestment={noop}
      onDeleteInvestment={noop}
    />
  );
  assert.match(htmlThree, /data-accounts-grid="true"[^>]*data-accounts-grid-cols="3"[^>]*lg:grid-cols-3/);
});

test('Bloque 18 (Análisis): ceros neutros sin signo ni color alarmista, copy limpio, jerarquía en Presupuesto y cero triángulos ASCII', () => {
  const emptyMonthState = defaultState();
  emptyMonthState.finance.accounts = [
    { id: 'a1', name: 'Banco', currency: 'UYU', balance: 12000, initialBalance: 12000 },
  ];
  emptyMonthState.finance.transactions = [];

  const htmlZero = renderToStaticMarkup(
    <FinanceAnalyticsView
      state={emptyMonthState}
      ingresoMes={0}
      gastadoMes={0}
      balanceMes={0}
      patrimonioNeto={12000}
      fijoMes={0}
      gastoVariable={0}
      totalGastadoAnio={0}
      gananciaReventa={null}
      gananciaReventaMoneda={null}
      catSpentThisMonth={{}}
      catSpentAllTime={{}}
      monthlyEvolutionData={[]}
      cmp={{ dir: 'flat', pct: 0 }}
      onSetBudget={noop}
      onSetGlobalBudget={noop}
      onOpenCategoryManager={noop}
    />
  );

  // Ceros neutros: nunca -$U 0 ni +$U 0
  assert.doesNotMatch(htmlZero, /[−-]\$U 0\b/);
  assert.doesNotMatch(htmlZero, /\+\$U 0\b/);
  // Salidas reales en 0 usa color neutro (no rose)
  assert.match(htmlZero, /text-3xl sm:text-4xl tracking-tight text-\[var\(--finance-text-primary\)\][^>]*>\$U 0</);
  // Ingresos menos gastos en 0 usa color neutro (no emerald ni rose)
  assert.match(htmlZero, /text-2xl sm:text-3xl tracking-tight mt-0\.5 text-\[var\(--finance-text-primary\)\][^>]*>\$U 0</);

  // Copy limpio sin redundancia "entradas registradas"
  assert.doesNotMatch(htmlZero, /entradas registradas/);
  assert.match(htmlZero, /Sin ingresos en el mes/);

  // Jerarquía limpia en estado vacío de presupuesto: CTA primario claro y sin "Ver todas" duplicado
  assert.match(htmlZero, /data-budget-empty-state="true"/);
  assert.match(htmlZero, /bg-\[#4F46E5\][^"]*">Fijar límites de categorías<\/button>/);
  assert.doesNotMatch(htmlZero, />Ver todas<\/button>/);

  // Cero triángulos ASCII ni <details> nativo con flecha de navegador
  assert.doesNotMatch(htmlZero, /[▾▴▼▲▶◀]/);
  assert.doesNotMatch(htmlZero, /<details\b/);
  assert.match(htmlZero, /Más detalles del mes[\s\S]*data-app-icon="chevronDown"/);

  // Con valores reales distintos de cero conserva semántica de color y conteo real de ingresos
  const activeState = defaultState();
  activeState.finance.accounts = [
    { id: 'a1', name: 'Banco', currency: 'UYU', balance: 15000, initialBalance: 10000 },
  ];
  activeState.finance.transactions = [
    {
      id: 't-inc-1',
      type: 'ingreso',
      amount: 5000,
      category: 'Trabajo',
      fixed: 'fijo',
      date: todayISO(),
      note: 'Cobro 1',
      accountId: 'a1',
      currency: 'UYU',
    },
    {
      id: 't-exp-1',
      type: 'gasto',
      amount: 1500,
      category: 'Comida',
      fixed: 'variable',
      date: todayISO(),
      note: 'Super',
      accountId: 'a1',
      currency: 'UYU',
    },
  ];
  const htmlActive = renderToStaticMarkup(
    <FinanceAnalyticsView
      state={activeState}
      ingresoMes={5000}
      gastadoMes={1500}
      balanceMes={3500}
      patrimonioNeto={15000}
      fijoMes={0}
      gastoVariable={1500}
      totalGastadoAnio={1500}
      gananciaReventa={null}
      gananciaReventaMoneda={null}
      catSpentThisMonth={{ Comida: 1500 }}
      catSpentAllTime={{ Comida: 1500 }}
      monthlyEvolutionData={[]}
      cmp={{ dir: 'up', pct: 25 }}
      onSetBudget={noop}
      onSetGlobalBudget={noop}
      onOpenCategoryManager={noop}
    />
  );
  assert.match(htmlActive, /text-rose-600 dark:text-rose-400[^>]*>−\$U 1\.500</);
  assert.match(htmlActive, /text-emerald-600 dark:text-emerald-400[^>]*>\+\$U 3\.500</);
  assert.match(htmlActive, /1 ingreso en el mes/);
  assert.doesNotMatch(htmlActive, /[▾▴▼▲▶◀]/);
});

test('Bloque 18 (Futuro): sin doble + +, sin 30 días★, Registrar pago sobrio vs Confirmar cobro esmeralda, eje X espaciado, fade en Hitos y cero triángulos ASCII', () => {
  const state = defaultState();
  const today = todayISO();
  state.finance.accounts = [
    { id: 'a1', name: 'Banco', currency: 'UYU', balance: 20000, initialBalance: 20000 },
  ];
  state.finance.commitments = [
    {
      id: 'com-1',
      name: 'Antel Fibra',
      amount: 1800,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: today,
      active: true,
      category: 'Servicios',
      accountId: 'a1',
    },
    {
      id: 'com-2',
      name: 'UTE',
      amount: 2400,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: today,
      active: true,
      category: 'Servicios',
      accountId: 'a1',
    },
  ];
  state.finance.expectedIncomes = [
    {
      id: 'inc-1',
      name: 'Sueldo',
      amount: 40000,
      currency: 'UYU',
      frequency: 'monthly',
      startDate: today,
      active: true,
      category: 'Trabajo',
      accountId: 'a1',
    },
  ];

  const projection = cashFlowProjection(state, 30, today, 'UYU');
  const html = renderToStaticMarkup(
    <FinanceFutureView
      state={state}
      projection={projection}
      projHorizon={30}
      onSetProjHorizon={noop}
      onOpenCommitmentModal={noop}
      onOpenIncomeModal={noop}
      onOpenCushionModal={noop}
      onPayCommitment={noop}
      onEditCommitment={noop}
      onToggleCommitment={noop}
      onDeleteCommitment={noop}
      onConfirmIncomeReal={noop}
      onEditIncome={noop}
      onToggleIncome={noop}
      onDeleteIncome={noop}
      onAddSubscription={noop}
      onDeleteSubscription={noop}
    />
  );

  // 1. Sin doble "+ +" en Compromiso, Ingreso, Suscripción
  assert.doesNotMatch(html, /data-app-icon="plus"[\s\S]{0,120}>\s*\+\s*(?:Compromiso|Ingreso|Suscripción)/);
  assert.match(html, /data-app-icon="plus"[\s\S]{0,120}><span>Compromiso<\/span>/);
  assert.match(html, /data-app-icon="plus"[\s\S]{0,120}><span>Ingreso<\/span>/);
  assert.match(html, /data-app-icon="plus"[\s\S]{0,120}><span>Suscripción<\/span>/);

  // 2. Sin estrellita ★ en selector de horizonte y estado activo índigo limpio
  assert.doesNotMatch(html, /★/);
  assert.match(html, /aria-pressed="true"[^>]*bg-\[#4F46E5\] text-white[^>]*>30 días<\/button>/);

  // 3. Registrar pago NO es verde esmeralda; Confirmar cobro SÍ conserva acento esmeralda
  const payBtnMatch = html.match(/<button[^>]*title="Registrar un pago ya realizado"[^>]*>Registrar pago<\/button>/);
  assert.ok(payBtnMatch, 'Debe renderizar el botón Registrar pago');
  assert.doesNotMatch(payBtnMatch[0], /bg-emerald-/);
  assert.match(payBtnMatch[0], /bg-indigo-500\/10/);

  const confirmIncomeBtnMatch = html.match(/<button[^>]*title="Confirmar cobro real hoy"[^>]*>Confirmar cobro<\/button>/);
  assert.ok(confirmIncomeBtnMatch, 'Debe renderizar el botón Confirmar cobro');
  assert.match(confirmIncomeBtnMatch[0], /bg-emerald-600/);

  // 4. Hitos del horizonte con fade sutil derecho y sin ▲
  assert.match(html, /Hitos del horizonte \(30d\)/);
  assert.match(html, /data-milestones-fade="true"/);

  // 5. Desplegable Pagos y cobros por fecha con foco limpio y chevron Lucide, cero triángulos ASCII
  assert.match(
    html,
    /aria-expanded="false"[^>]*aria-controls="finance-future-schedule"[^>]*outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70/
  );
  assert.match(html, /Pagos y cobros por fecha \(30 días\)[\s\S]*data-app-icon="chevronDown"/);
  assert.doesNotMatch(html, /[▾▴▼▲▶◀]/);

  // 6. Helper de ticks del eje X espacia 31 días en ~6 etiquetas incluyendo inicio y fin
  const thirtyOneDates = projection.dailyTrajectory.map((pt) => pt.date);
  const ticks = computeProjectionXAxisTicks(thirtyOneDates, 6);
  assert.equal(ticks.length, 6);
  assert.equal(ticks[0], thirtyOneDates[0]);
  assert.equal(ticks.at(-1), thirtyOneDates.at(-1));
});
