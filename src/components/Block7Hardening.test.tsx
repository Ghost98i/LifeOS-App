import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from '../lib/storage';
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  PRELOAD_ERROR_RELOAD_KEY,
  handleVitePreloadError,
  syncDocumentThemeColor,
} from '../lib/pwaRecovery';
import { NotasView } from './NotasView';
import { ProjectsManager } from './ProjectsManager';

test('Block 7: NotasView oculta + Nueva nota en estado vacío sin filtros y lo muestra cuando hay notas activas', () => {
  const emptyState = defaultState();
  emptyState.notes.postits = [];

  const emptyHtml = renderToStaticMarkup(
    <NotasView state={emptyState} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} />
  );
  assert.doesNotMatch(emptyHtml, />Nueva nota</, 'No debe duplicar el CTA en header cuando no hay notas activas');
  assert.match(emptyHtml, />Crear primera nota</, 'Debe conservar el CTA único del estado vacío');

  const populatedState = defaultState();
  populatedState.notes.postits = [
    { id: 'n1', title: 'Nota 1', text: 'Contenido', date: todayISO(), pinned: false },
  ];

  const populatedHtml = renderToStaticMarkup(
    <NotasView state={populatedState} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} />
  );
  assert.match(populatedHtml, />Nueva nota</, 'Debe mostrar + Nueva nota cuando existen notas activas');
});

test('Block 7: ProjectsManager oculta + Nuevo proyecto en estado vacío y lo muestra cuando existen proyectos', () => {
  const emptyState = defaultState();
  emptyState.projects = [];

  const emptyHtml = renderToStaticMarkup(
    <ProjectsManager state={emptyState} onUpdateState={() => true} />
  );
  assert.doesNotMatch(emptyHtml, />Nuevo proyecto</, 'No debe duplicar el CTA en header cuando projects.length === 0');
  assert.match(emptyHtml, />Crear tu primer proyecto</, 'Debe conservar el CTA del estado vacío');

  const populatedState = defaultState();
  populatedState.projects = [
    {
      id: 'p1',
      name: 'Proyecto demo',
      objective: 'Objetivo',
      status: 'activo',
      nextStep: 'Paso 1',
      tasks: [],
      createdAt: todayISO(),
    },
  ];

  const populatedHtml = renderToStaticMarkup(
    <ProjectsManager state={populatedState} onUpdateState={() => true} />
  );
  assert.match(populatedHtml, />Nuevo proyecto</, 'Debe mostrar + Nuevo proyecto cuando existen proyectos');
});

test('Block 7: NotasView usa sub-píldoras compactas en móvil (< sm) y anillo de foco limpio sin doble borde', () => {
  const state = defaultState();
  const toolsHtml = renderToStaticMarkup(
    <NotasView state={state} onUpdateState={() => true} storageUserId={null} onOpenGym={() => {}} initialTab="proyectos" />
  );

  assert.match(toolsHtml, /Proyectos<span class="hidden sm:inline"> · tareas y próximo paso<\/span>/);
  assert.match(toolsHtml, /Objetivos<span class="hidden sm:inline"> · avance numérico<\/span>/);
  assert.match(toolsHtml, /aria-label="Herramientas personales"[^>]*p-0\.5/);
  assert.match(toolsHtml, /p-0\.5[^>]*aria-label="Tipo de seguimiento"/);
  assert.match(toolsHtml, /focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-\[#4F46E5\]\/50/);
});

test('Block 7: handleVitePreloadError recarga exactamente una vez por sesión y previene bucles infinitos', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  let reloadCount = 0;
  let preventedCount = 0;
  const fakeEvent = {
    preventDefault: () => {
      preventedCount += 1;
    },
  };

  const first = handleVitePreloadError(fakeEvent, {
    storage,
    reload: () => {
      reloadCount += 1;
    },
    now: () => 1700000000000,
  });
  const second = handleVitePreloadError(fakeEvent, {
    storage,
    reload: () => {
      reloadCount += 1;
    },
    now: () => 1700000005000,
  });

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(reloadCount, 1);
  assert.equal(preventedCount, 2);
  assert.equal(store.get(PRELOAD_ERROR_RELOAD_KEY), '1700000000000');
});

test('Block 7: syncDocumentThemeColor actualiza meta[name="theme-color"] en Modo Claro y Oscuro', () => {
  let content = '';
  const fakeDoc = {
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]'
        ? ({
            setAttribute: (_name: string, value: string) => {
              content = value;
            },
          } as unknown as Element)
        : null,
  };

  assert.equal(syncDocumentThemeColor(true, fakeDoc), DARK_THEME_COLOR);
  assert.equal(content, '#07090E');

  assert.equal(syncDocumentThemeColor(false, fakeDoc), LIGHT_THEME_COLOR);
  assert.equal(content, '#F3F6FA');
});
