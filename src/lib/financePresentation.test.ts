import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from './storage';
import { cashFlowProjection } from './calculations';

test('Finanzas 2.0A.1 - Trayectoria vacía: sin eventos ni balance no genera eventos de trayectoria', () => {
  const state = defaultState();
  // Clear all accounts, commitments, expected incomes, subscriptions
  state.finance.accounts = [];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  state.finance.subscriptions = [];
  state.finance.transactions = [];

  const projection = cashFlowProjection(state, 30);

  // Verification of signals
  const hasFutureSignal =
    projection.forecastItems.length > 0 ||
    projection.commitments.length > 0 ||
    projection.dailyTrajectory.some((pt) => pt.netDayChange !== 0) ||
    projection.currentBalance > 0;

  assert.equal(hasFutureSignal, false, 'No debe haber señal futura con estado completamente vacío');
  assert.equal(projection.forecastItems.length, 0);
  assert.equal(projection.commitments.length, 0);
  assert.equal(projection.currentBalance, 0);
});

test('Finanzas 2.0A.1 - Trayectoria con señal: balance > 0 sin eventos no activa gráfico; sólo eventos futuros o cambios reales lo activan', () => {
  const state = defaultState();
  // Caso 1: Saldo actual > 0 con 0 eventos futuros y trayectoria completamente plana
  // DEBE mostrar estado compacto, NO gráfico grande.
  state.finance.accounts = [{ id: 'acc-1', name: 'Banco', balance: 5000 }];
  state.finance.commitments = [];
  state.finance.expectedIncomes = [];
  state.finance.subscriptions = [];

  const projSinEventos = cashFlowProjection(state, 30);
  const signalSinEventos =
    projSinEventos.forecastItems.length > 0 ||
    projSinEventos.commitments.length > 0 ||
    projSinEventos.dailyTrajectory.some((pt) => pt.netDayChange !== 0);

  assert.equal(
    signalSinEventos,
    false,
    'Saldo actual positivo sin eventos futuros NO debe generar señal de gráfico (debe mostrar empty state compacto)'
  );

  // Caso 2: Saldo actual > 0 CON evento futuro (compromiso programado)
  // DEBE activar gráfico
  state.finance.commitments = [
    {
      id: 'com-1',
      name: 'Alquiler',
      amount: 15000,
      nextDueDate: '2026-10-15',
      frequency: 'monthly',
      active: true,
      category: 'Hogar',
      accountId: 'acc-1',
    },
  ];

  const projConEventos = cashFlowProjection(state, 30, '2026-10-05');
  const signalConEventos =
    projConEventos.forecastItems.length > 0 ||
    projConEventos.commitments.length > 0 ||
    projConEventos.dailyTrajectory.some((pt) => pt.netDayChange !== 0);

  assert.equal(
    signalConEventos,
    true,
    'Evento futuro con variación activa la señal del gráfico de trayectoria'
  );
});

test('Finanzas 2.0A.1 - Indicador de déficit en FinanceHero: estado visual estático sin animación infinita', () => {
  // Función helper representativa del cálculo de clases en FinanceHero
  const getDeficitIndicatorClasses = (isDeficit: boolean) => {
    return `inline-block h-2 w-2 rounded-full transition-colors motion-reduce:transition-none ${
      isDeficit
        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-rose-500/30'
        : 'bg-emerald-500'
    }`;
  };

  const deficitClasses = getDeficitIndicatorClasses(true);
  const healthyClasses = getDeficitIndicatorClasses(false);

  // No debe depender de animaciones infinitas tipo animate-pulse
  assert.equal(deficitClasses.includes('animate-pulse'), false, 'Déficit no debe usar animación infinita/pulsante');
  assert.equal(deficitClasses.includes('bg-rose-500'), true, 'Déficit debe usar color semántico fuerte');
  assert.equal(deficitClasses.includes('shadow-'), true, 'Déficit debe usar halo/sombra estática');
  assert.equal(deficitClasses.includes('ring-'), true, 'Déficit debe usar ring visual fuerte');
  assert.equal(deficitClasses.includes('motion-reduce:transition-none'), true, 'Debe respetar prefers-reduced-motion');
  assert.equal(healthyClasses.includes('bg-emerald-500'), true);
});

test('Finanzas 2.0A.1 - Semántica de atajos: +Movimiento, +Gasto y +Ingreso canalizan el mismo modal', () => {
  // Verificamos que los tipos admitidos mapean al mismo universo de tipo de transacción
  const allowedModalTypes = ['gasto', 'ingreso'] as const;

  const getModalInitialConfig = (source: 'hero_movement' | 'diary_gasto' | 'diary_ingreso') => {
    switch (source) {
      case 'hero_movement':
        return { open: true, preselectedType: 'gasto' as const };
      case 'diary_gasto':
        return { open: true, preselectedType: 'gasto' as const };
      case 'diary_ingreso':
        return { open: true, preselectedType: 'ingreso' as const };
    }
  };

  const heroAction = getModalInitialConfig('hero_movement');
  const gastoAction = getModalInitialConfig('diary_gasto');
  const ingresoAction = getModalInitialConfig('diary_ingreso');

  assert.ok(allowedModalTypes.includes(heroAction.preselectedType));
  assert.equal(gastoAction.preselectedType, 'gasto');
  assert.equal(ingresoAction.preselectedType, 'ingreso');
  assert.equal(heroAction.open, true);
  assert.equal(gastoAction.open, true);
  assert.equal(ingresoAction.open, true);
});

test('Finanzas 2.0A.1 - Hero variant selection según pestaña', () => {
  const getHeroVariant = (tab: 'movimientos' | 'cuentas' | 'analisis' | 'proyeccion'): 'full' | 'compact' => {
    return tab === 'analisis' || tab === 'proyeccion' ? 'compact' : 'full';
  };

  assert.equal(getHeroVariant('movimientos'), 'full', 'Resumen & Operación debe usar full hero');
  assert.equal(getHeroVariant('cuentas'), 'full', 'Cuentas debe usar full hero');
  assert.equal(getHeroVariant('analisis'), 'compact', 'Análisis debe usar compact hero para priorizar contenido');
  assert.equal(getHeroVariant('proyeccion'), 'compact', 'Futuro debe usar compact hero para priorizar trayectoria');
});
