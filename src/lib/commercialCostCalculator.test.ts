import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommercialCostCalculator } from '../components/CommercialCostCalculator';
import { ReventaView } from '../components/ReventaView';
import { defaultState } from './storage';
import { calculateUnitCost, type CalculatorComponent } from './commercialCostCalculator';

const ingredients: CalculatorComponent[] = [
  { name: 'Pan', purchasedQuantity: 20, purchasedUnit: 'unit', totalCost: 600, usedQuantity: 1, usedUnit: 'unit' },
  { name: 'Carne', purchasedQuantity: 2, purchasedUnit: 'kg', totalCost: 900, usedQuantity: 100, usedUnit: 'g' },
  { name: 'Verduras', purchasedQuantity: 20, purchasedUnit: 'unit', totalCost: 200, usedQuantity: 1, usedUnit: 'unit' },
];

test('hamburguesa: costo unitario, envase y margen estimado', () => {
  const input = { components: ingredients, extraCosts: [{ name: 'Envase', amount: 12 }], salePrice: 180 };
  const before = structuredClone(input);
  const result = calculateUnitCost(input);
  assert.deepEqual(result.componentCosts.map((item) => item.costCents), [3000, 4500, 1000]);
  assert.equal(result.componentsCents, 8500);
  assert.equal(result.unitCostCents, 9700);
  assert.equal(result.marginCents, 8300);
  assert.equal(result.marginPercent, 8300 / 18000 * 100);
  assert.deepEqual(input, before);
});

test('cambiar el precio de una compra actualiza la estimación sin tocar el cálculo anterior', () => {
  const previous = calculateUnitCost({ components: ingredients });
  const next = calculateUnitCost({ components: ingredients.map((item) => item.name === 'Carne' ? { ...item, totalCost: 1000 } : item) });
  assert.equal(previous.unitCostCents, 8500);
  assert.equal(next.unitCostCents, 9000);
  assert.equal(previous.unitCostCents, 8500);
});

test('reventa: compra, adquisición y comisión producen resultado comercial de 2200', () => {
  const result = calculateUnitCost({ components: [{ name: 'Tarjeta gráfica', purchasedQuantity: 1, purchasedUnit: 'unit', totalCost: 8000, usedQuantity: 1, usedUnit: 'unit' }],
    extraCosts: [{ name: 'Envío de compra', amount: 300 }, { name: 'Comisión de venta', amount: 500 }], salePrice: 11000 });
  assert.equal(result.unitCostCents, 880000);
  assert.equal(result.marginCents, 220000);
  assert.equal(result.marginPercent, 20);
});

test('costos nulos permitidos y valores inválidos rechazados', () => {
  const free = calculateUnitCost({ components: [{ name: 'Muestra', purchasedQuantity: 1, purchasedUnit: 'unit', totalCost: 0, usedQuantity: 1, usedUnit: 'unit' }], extraCosts: [{ name: 'Sin costo', amount: 0 }] });
  assert.equal(free.unitCostCents, 0);
  assert.equal(free.marginPercent, null);
  assert.throws(() => calculateUnitCost({ components: [{ ...ingredients[0], purchasedQuantity: 0 }] }), /Cantidad inválida/);
  assert.throws(() => calculateUnitCost({ components: [{ ...ingredients[0], totalCost: -1 }] }), /Costo inválido/);
  assert.throws(() => calculateUnitCost({ components: ingredients, extraCosts: [{ name: 'Envase', amount: -1 }] }), /importe válido/);
  assert.throws(() => calculateUnitCost({ components: ingredients, salePrice: 0 }), /mayor que cero/);
  assert.throws(() => calculateUnitCost({ components: ingredients, salePrice: 1.005 }), /dos decimales/);
});

test('unidades incompatibles, uso excesivo y margen negativo', () => {
  assert.throws(() => calculateUnitCost({ components: [{ ...ingredients[1], usedUnit: 'unit' }] }), /Unidad incompatible/);
  assert.throws(() => calculateUnitCost({ components: [{ ...ingredients[0], usedQuantity: 21 }] }), /Existencias insuficientes/);
  const loss = calculateUnitCost({ components: ingredients, salePrice: 50 });
  assert.equal(loss.marginCents, -3500);
  assert.equal(loss.marginPercent, -70);
});

test('Mi negocio inicia con la calculadora cerrada y su panel temporal puede renderizarse sin actualizar el estado', () => {
  const state = defaultState();
  const before = structuredClone(state);
  const closed = renderToStaticMarkup(React.createElement(ReventaView, { state, onUpdateState: () => {
    throw new Error('La calculadora no debe actualizar el estado.');
  } }));
  assert.match(closed, /Calcular costos/);
  assert.match(closed, /aria-expanded="false"/);
  assert.doesNotMatch(closed, /Calculadora de costos/);
  const opened = renderToStaticMarkup(React.createElement(CommercialCostCalculator, { onClose: () => undefined }));
  assert.match(opened, /Calculadora de costos/);
  assert.match(opened, /Cerrar/);
  assert.match(opened, /no guarda operaciones ni mueve dinero/);
  assert.deepEqual(state, before);
});
