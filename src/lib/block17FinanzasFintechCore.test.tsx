import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { cashFlowProjection } from './calculations';
import {
  getFinanceAccountIcon,
  getFinanceCategoryIcon,
  resolveDefaultCategoryForType,
} from './financeIcons';
import { DEFAULT_FINANCE_CATEGORIES } from './financeCategories';
import { playExpenseLogged, setSoundEnabled } from './audio';
import { FinanceHero } from '../components/FinanceHero';
import { FinanzasView } from '../components/FinanzasView';
import { FinanceTransactionTable } from '../components/FinanceTransactionTable';
import { FinanceTransactionModal } from '../components/FinanceTransactionModal';
import { FinanceTransferModal } from '../components/FinanceTransferModal';

const noop = () => undefined;

test('Bloque 17: FinanceHero reemplaza el dropdown por acciones de 1 toque (Gasto, Ingreso, Transferir) y colapsa el detalle diario por defecto', () => {
  const state = defaultState();
  state.finance.accounts = [
    { id: 'acc-banco', name: 'Banco Itaú', currency: 'UYU', balance: 25000, initialBalance: 25000 },
  ];
  state.finance.transactions = [
    {
      id: 'tx-1',
      type: 'gasto',
      amount: 1200,
      category: 'Comida',
      fixed: 'variable',
      date: todayISO(),
      note: 'Supermercado',
      accountId: 'acc-banco',
      currency: 'UYU',
    },
  ];
  state.finance.commitments = [
    {
      id: 'com-1',
      name: 'Antel',
      amount: 2000,
      currency: 'UYU',
      frequency: 'monthly',
      nextDueDate: todayISO(),
      active: true,
      category: 'Servicios',
      accountId: 'acc-banco',
    },
  ];

  const fullHtml = renderToStaticMarkup(
    <FinanceHero
      state={state}
      cashFlow={cashFlowProjection(state, 30)}
      variant="full"
      onOpenNewTx={noop}
      onOpenNewTxType={noop}
      onOpenTransfer={noop}
      onOpenCushionModal={noop}
      onOpenCustomize={noop}
    />
  );

  // Acciones rápidas en 1 toque sin dropdown intermedio
  assert.match(fullHtml, /data-finance-quick-actions="true"/);
  assert.match(fullHtml, /data-app-icon="expense"[\s\S]*?>Gasto<\/span>/);
  assert.match(fullHtml, /data-app-icon="income"[\s\S]*?>Ingreso<\/span>/);
  assert.match(fullHtml, /data-app-icon="transfer"[\s\S]*?>Transferir<\/span>/);
  assert.doesNotMatch(fullHtml, /Nuevo movimiento/);
  assert.doesNotMatch(fullHtml, /aria-haspopup="true"/);

  // Tira compacta visible con los 3 datos clave
  assert.match(fullHtml, /data-finance-summary-strip="true"/);
  assert.match(fullHtml, /Margen libre/);
  assert.match(fullHtml, /Pagos pendientes del mes/);
  assert.match(fullHtml, /Colchón mínimo/);

  // Desplegable diario cerrado por defecto, con chevron Lucide y sin triángulos ASCII
  assert.match(fullHtml, /aria-expanded="false"[^>]*aria-controls="finance-hero-daily-details"/);
  assert.match(fullHtml, /Ver ritmo y margen diario/);
  assert.match(fullHtml, /data-app-icon="chevronDown"/);
  assert.doesNotMatch(fullHtml, /Tope diario sugerido/);
  assert.doesNotMatch(fullHtml, /Ritmo de gasto diario/);
  assert.doesNotMatch(fullHtml, /▾|▴/);

  // Variante compacta (Cuentas / Análisis / Futuro) conserva consistencia de acciones rápidas
  const compactHtml = renderToStaticMarkup(
    <FinanceHero
      state={state}
      cashFlow={cashFlowProjection(state, 30)}
      variant="compact"
      onOpenNewTx={noop}
      onOpenNewTxType={noop}
      onOpenTransfer={noop}
      onOpenCushionModal={noop}
    />
  );
  assert.match(compactHtml, /data-finance-quick-actions="true"/);
  assert.match(compactHtml, />Gasto<\/span>/);
  assert.match(compactHtml, />Ingreso<\/span>/);
  assert.match(compactHtml, />Transferir<\/span>/);
  assert.doesNotMatch(compactHtml, /Nuevo movimiento/);
});

test('Bloque 17: Tabs de Finanzas destacan pestaña activa en índigo Celestian (#4F46E5) y evitan anillo de foco clavado', () => {
  const state = defaultState();
  state.finance.accounts = [{ id: 'a1', name: 'Efectivo', currency: 'UYU', balance: 5000, initialBalance: 5000 }];

  const html = renderToStaticMarkup(
    <FinanzasView state={state} initialTab="movimientos" onUpdateState={() => true} />
  );

  assert.match(html, /role="tablist"[^>]*aria-label="Secciones de Finanzas"/);
  assert.match(
    html,
    /role="tab"[^>]*aria-selected="true"[^>]*class="[^"]*outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400\/70[^"]*finance-tab-active bg-\[#4F46E5\] text-white/
  );
  assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*>[\s\S]*?Cuentas/);
  assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*>[\s\S]*?Análisis/);
  assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*>[\s\S]*?Futuro/);
});

test('Bloque 17: financeIcons mapea categorías y tipos de cuenta de forma determinista con fallbacks seguros', () => {
  const expectedCategories: Array<[string, string]> = [
    ['Comida', 'Utensils'],
    ['Admin/Hogar', 'Home'],
    ['Servicios', 'Zap'],
    ['Préstamos y deudas', 'HandCoins'],
    ['Trabajo', 'Briefcase'],
    ['Sueldo', 'Banknote'],
    ['Reventa', 'Package'],
    ['Compras', 'ShoppingBag'],
    ['Transporte', 'Car'],
    ['Salud', 'HeartPulse'],
    ['Ocio', 'Gamepad2'],
    ['Educación', 'GraduationCap'],
    ['Mi negocio', 'Store'],
    ['Transferencia', 'ArrowLeftRight'],
    ['Categoría inventada XYZ', 'Tag'],
    ['', 'Tag'],
  ];

  for (const [label, expectedIconName] of expectedCategories) {
    const meta = getFinanceCategoryIcon(label);
    assert.equal(meta.iconName, expectedIconName, `Categoría "${label}" debe mapear a ${expectedIconName}`);
    assert.ok(meta.icon, `Categoría "${label}" debe devolver un componente Lucide`);
    assert.ok(meta.containerClass.length > 0 && meta.iconClass.length > 0);
  }

  assert.equal(getFinanceAccountIcon('Efectivo').iconName, 'Banknote');
  assert.equal(getFinanceAccountIcon('Caja chica en efectivo').iconName, 'Banknote');
  assert.equal(getFinanceAccountIcon('Banco Itaú').iconName, 'Landmark');
  assert.equal(getFinanceAccountIcon('BROU').iconName, 'Landmark');
  assert.equal(getFinanceAccountIcon('Prex UYU').iconName, 'Wallet');
  assert.equal(getFinanceAccountIcon('').iconName, 'Wallet');
});

test('Bloque 17: Feed de Movimientos elimina columna Tipo, usa íconos de categoría/cuenta y acciones Pencil/Trash2', () => {
  const html = renderToStaticMarkup(
    <FinanceTransactionTable
      accounts={[
        { id: 'acc-cash', name: 'Efectivo', currency: 'UYU', balance: 3000, initialBalance: 3000 },
        { id: 'acc-bank', name: 'Banco Itaú', currency: 'UYU', balance: 20000, initialBalance: 20000 },
      ]}
      categories={DEFAULT_FINANCE_CATEGORIES}
      transactions={[
        {
          id: 'tx-exp',
          type: 'gasto',
          amount: 150,
          category: 'Comida',
          fixed: 'variable',
          date: '2026-11-20',
          operationTime: '13:45',
          note: 'Café y medialuna',
          accountId: 'acc-cash',
          currency: 'UYU',
        },
        {
          id: 'tx-inc',
          type: 'ingreso',
          amount: 300,
          category: 'Reventa',
          fixed: 'variable',
          date: '2026-11-21',
          note: 'Venta auricular',
          accountId: 'acc-bank',
          currency: 'UYU',
        },
      ]}
      onEdit={noop}
      onDelete={noop}
    />
  );

  // Sin tabla Excel ni columna redundante Tipo
  assert.match(html, /data-finance-feed="true"/);
  assert.doesNotMatch(html, /<table\b/);
  assert.doesNotMatch(html, /<th[^>]*>Tipo<\/th>/);

  // Íconos de categoría y cuenta renderizados
  assert.match(html, /data-finance-category-icon="Utensils"/);
  assert.match(html, /data-finance-category-icon="Package"/);
  assert.match(html, /data-finance-account-icon="Banknote"/);
  assert.match(html, /data-finance-account-icon="Landmark"/);

  // Montos firmados con semántica clara + hora cuando existe
  assert.match(html, /−\$U 150/);
  assert.match(html, /\+\$U 300/);
  assert.match(html, /13:45/);

  // Acciones con íconos Pencil/Trash2 (sin textos sueltos Editar ni × cruda)
  assert.match(html, /aria-label="Editar movimiento Café y medialuna"/);
  assert.match(html, /aria-label="Eliminar movimiento Café y medialuna"/);
  assert.doesNotMatch(html, />Editar<\/button>/);
  assert.doesNotMatch(html, />✕<\/button>/);
});

test('Bloque 17: Modal de Ingreso nunca preselecciona Comida, unifica íconos, limpia inputs y elimina triángulos ASCII', () => {
  // 1. Helper puro con categorías por defecto de LifeOS (no incluye Sueldo, sí Reventa/Otros)
  const defaultIncomeCat = resolveDefaultCategoryForType('ingreso', DEFAULT_FINANCE_CATEGORIES);
  assert.notEqual(defaultIncomeCat, 'Comida', 'Ingreso nunca debe preseleccionar Comida');
  assert.equal(defaultIncomeCat, 'Reventa');

  // 2. Helper con categorías personalizadas incluyendo Sueldo/Trabajo
  const customCats = [
    { id: 'c1', name: 'Comida', active: true },
    { id: 'c2', name: 'Trabajo', active: true },
    { id: 'c3', name: 'Sueldo', active: true },
  ];
  assert.equal(resolveDefaultCategoryForType('ingreso', customCats), 'c3');
  assert.equal(resolveDefaultCategoryForType('gasto', customCats), 'c1');

  // 3. Helper cuando solo hay categorías de gasto/neutrales
  const onlyGeneral = [
    { id: 'food', name: 'Comida', active: true },
    { id: 'gen', name: 'General', active: true },
  ];
  assert.equal(resolveDefaultCategoryForType('ingreso', onlyGeneral), 'gen');

  // 4. SSR de FinanceTransactionModal en modo Ingreso
  const incomeModalHtml = renderToStaticMarkup(
    <FinanceTransactionModal
      open
      initialType="ingreso"
      onClose={noop}
      onSubmit={noop}
      accounts={[{ id: 'a1', name: 'Banco', currency: 'UYU', balance: 1000 }]}
      categories={DEFAULT_FINANCE_CATEGORIES}
    />
  );
  assert.match(incomeModalHtml, /Registrar Ingreso/);
  assert.match(incomeModalHtml, /data-app-icon="income"/);
  assert.match(incomeModalHtml, /class="finance-amount-input /);
  assert.match(incomeModalHtml, /<option value="Reventa" selected="">/);
  assert.doesNotMatch(incomeModalHtml, /<option value="Comida" selected="">/);
  assert.match(incomeModalHtml, /Hoy · Más detalles \(fecha, hora, tipo\)/);
  assert.match(incomeModalHtml, /data-app-icon="chevronDown"/);
  assert.doesNotMatch(incomeModalHtml, /Podés cambiarla en «Más detalles»/);
  assert.doesNotMatch(incomeModalHtml, /▾|▴/);

  // 5. SSR de FinanceTransferModal: ícono unificado, prefijo de moneda y Lucide chevronDown
  const transferState = defaultState();
  transferState.finance.accounts = [
    { id: 'a1', name: 'Banco', currency: 'UYU', balance: 10000, initialBalance: 10000 },
    { id: 'a2', name: 'Efectivo', currency: 'UYU', balance: 2000, initialBalance: 2000 },
  ];
  transferState.finance.transfers = [
    { id: 'tr-1', fromAccountId: 'a1', toAccountId: 'a2', amount: 1500, date: todayISO(), note: 'Extracción' },
  ];
  const transferModalHtml = renderToStaticMarkup(
    <FinanceTransferModal
      open
      onClose={noop}
      state={transferState}
      onUpdateState={() => true}
    />
  );
  assert.match(transferModalHtml, /data-app-icon="transfer"/);
  assert.match(transferModalHtml, /data-transfer-currency-prefix="\$U"/);
  assert.match(transferModalHtml, /class="finance-amount-input /);
  assert.match(transferModalHtml, /Transferencias recientes \(1\)/);
  assert.match(transferModalHtml, /data-app-icon="chevronDown"/);
  assert.doesNotMatch(transferModalHtml, /▾|▴/);
});

test('Bloque 17: playExpenseLogged respeta SSR, silencio global y pasa por la cadena maestra con compresor', () => {
  // 1. SSR (sin window): no debe arrojar error
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  try {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
    assert.doesNotThrow(() => playExpenseLogged());

    // 2. Entorno navegador mockeado
    const values = new Map<string, string>();
    let compressorCreated = 0;
    const oscs: Array<{ type: string; startFreq: number; endFreq: number; start: number; stop: number }> = [];
    const linearRamps: Array<{ value: number; time: number }> = [];
    const expRamps: Array<{ value: number; time: number }> = [];

    class FakeContext {
      state = 'running';
      currentTime = 10;
      destination = {};
      addEventListener() {}
      resume() {
        return Promise.resolve();
      }
      createDynamicsCompressor() {
        compressorCreated++;
        return {
          threshold: { setValueAtTime() {} },
          knee: { setValueAtTime() {} },
          ratio: { setValueAtTime() {} },
          attack: { setValueAtTime() {} },
          release: { setValueAtTime() {} },
          connect() {},
        };
      }
      createOscillator() {
        const rec = { type: 'sine', startFreq: 0, endFreq: 0, start: 0, stop: 0 };
        oscs.push(rec);
        return {
          get type() {
            return rec.type;
          },
          set type(v: string) {
            rec.type = v;
          },
          frequency: {
            setValueAtTime: (val: number) => {
              rec.startFreq = val;
            },
            exponentialRampToValueAtTime: (val: number) => {
              rec.endFreq = val;
            },
          },
          connect() {},
          start: (t: number) => {
            rec.start = t;
          },
          stop: (t: number) => {
            rec.stop = t;
          },
        };
      }
      createGain() {
        return {
          connect() {},
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime: (value: number, time: number) => {
              linearRamps.push({ value, time });
            },
            exponentialRampToValueAtTime: (value: number, time: number) => {
              expRamps.push({ value, time });
            },
          },
        };
      }
    }

    const target = new EventTarget();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.assign(target, { AudioContext: FakeContext }),
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    // Silencio global desactiva síntesis
    setSoundEnabled(false);
    playExpenseLogged();
    assert.equal(oscs.length, 0, 'Con sonido silenciado no debe sintetizar audio');

    // Con sonido habilitado, sintetiza pulso táctil breve pasando por el compresor maestro
    setSoundEnabled(true);
    playExpenseLogged();
    assert.equal(compressorCreated, 1, 'Debe pasar por fxMasterGain -> DynamicsCompressorNode');
    assert.equal(oscs.length, 1);
    assert.equal(oscs[0].type, 'sine');
    assert.equal(oscs[0].startFreq, 440);
    assert.equal(oscs[0].endFreq, 392);
    assert.equal(Math.round((oscs[0].stop - oscs[0].start) * 1000), 70);
    assert.equal(linearRamps[0].value, 0.14);
    assert.equal(Math.round((expRamps[0].time - 10) * 1000), 55);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
