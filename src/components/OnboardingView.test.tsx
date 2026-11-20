import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState } from '../lib/storage';
import { DEFAULT_ONBOARDING_MODULE_IDS } from '../lib/moduleVisibility';
import { OnboardingView } from './OnboardingView';

test('OnboardingView — Paso 1 muestra identidad, bloque de privacidad en 3 puntos y omite check-in de sueño/energía/ánimo', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(
    <OnboardingView state={state} onComplete={() => {}} initialStep={1} />
  );

  assert.match(html, /Paso 1 de 2/);
  assert.match(html, /onboarding-name/);
  assert.match(html, /Tu privacidad en 3 puntos/);
  assert.match(html, /Datos aislados en tu cuenta:/);
  assert.match(html, /Finanzas 100 % privadas y manuales:/);
  assert.match(html, /Control total:/);
  assert.doesNotMatch(html, /Paso 1 de 3|Horas de sueño|Energía \(1 - 5\)|Ánimo \(1 - 5\)/);
});

test('OnboardingView — Paso 2 preselecciona 4 espacios esenciales y ofrece accesos rápidos y aclaración de Configuración', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(
    <OnboardingView state={state} onComplete={() => {}} initialStep={2} />
  );

  assert.equal(DEFAULT_ONBOARDING_MODULE_IDS.length, 4);
  assert.deepEqual(
    [...DEFAULT_ONBOARDING_MODULE_IDS],
    ['agenda', 'gimnasio', 'finanzas', 'notas']
  );

  assert.match(html, /Paso 2 de 2/);
  assert.match(html, /4 de 8 seleccionados/);
  assert.match(html, /Seleccionar todos/);
  assert.match(html, /Solo lo esencial/);
  assert.match(html, /activar o desactivar cualquier módulo después en Configuración sin perder datos/);

  const checkedCount = (html.match(/aria-checked="true"/g) || []).length;
  const uncheckedCount = (html.match(/aria-checked="false"/g) || []).length;
  assert.equal(checkedCount, 4);
  assert.equal(uncheckedCount, 4);
});
