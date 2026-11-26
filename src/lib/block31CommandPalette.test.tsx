import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO, uid } from './storage';
import { searchLifeOS } from './search';
import {
  COMMAND_PALETTE_RECENTS_KEY,
  clearCommandPaletteRecents,
  loadCommandPaletteRecents,
  recordCommandPaletteRecent,
} from './commandPaletteRecents';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import { PrivacyProvider } from '../components/PrivacyAmount';
import type { CaptureKind } from '../components/MobileQuickCapture';
import type { LifeOSState, ViewType } from '../types';

function setupMockDom() {
  const windowListeners: Record<string, Array<(ev: unknown) => void>> = {};
  const docListeners: Record<string, Array<(ev: unknown) => void>> = {};
  const storageMap = new Map<string, string>();
  const scrollCalls: Array<{ id: string | null; options: unknown }> = [];

  function createMockElement(tag = 'div') {
    type ListenerFn = (...args: unknown[]) => void;
    const listeners: Record<string, ListenerFn[]> = {};
    const el: any = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
      ownerDocument: null,
      parentNode: null,
      childNodes: [],
      children: [],
      style: {},
      attributes: {} as Record<string, string>,
      value: '',
      checked: false,
      focused: false,
      isConnected: true,
      tabIndex: tag.toLowerCase() === 'button' || tag.toLowerCase() === 'input' ? 0 : -1,
      _textContent: undefined as string | undefined,
      get textContent() {
        if (el._textContent !== undefined) return el._textContent;
        return el.childNodes.map(getNodeText).join('');
      },
      set textContent(val: string) {
        el._textContent = String(val);
        el.childNodes = [];
        el.children = [];
      },
      get firstChild() {
        return el.childNodes[0] || null;
      },
      get lastChild() {
        return el.childNodes[el.childNodes.length - 1] || null;
      },
      get nextSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.childNodes.indexOf(el);
        return idx !== -1 && idx < el.parentNode.childNodes.length - 1
          ? el.parentNode.childNodes[idx + 1]
          : null;
      },
      get previousSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.childNodes.indexOf(el);
        return idx > 0 ? el.parentNode.childNodes[idx - 1] : null;
      },
      setAttribute(k: string, v: string) {
        el.attributes[k] = String(v);
      },
      getAttribute(k: string) {
        return el.attributes[k] ?? null;
      },
      removeAttribute(k: string) {
        delete el.attributes[k];
      },
      getClientRects() {
        return [{ width: 100, height: 40 }];
      },
      matches(selector: string) {
        if (selector.includes(':disabled')) return Boolean(el.disabled);
        if (selector.includes('input')) return el.tagName === 'INPUT';
        return false;
      },
      closest() {
        return null;
      },
        contains(target: any) {
        if (!target) return false;
        let cur = target;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      querySelectorAll(selector: string) {
        if (selector.includes('[role="dialog"]')) {
          return findElements(el, (n) => n.attributes?.role === 'dialog');
        }
        if (selector.includes('button') || selector.includes('input')) {
          return findElements(el, (n) => n.tagName === 'BUTTON' || n.tagName === 'INPUT');
        }
        return [];
      },
        appendChild(child: any) {
        el._textContent = undefined;
        child.parentNode = el;
        el.childNodes.push(child);
        if (child.nodeType === 1) el.children.push(child);
        return child;
      },
        removeChild(child: any) {
        el._textContent = undefined;
        const idx = el.childNodes.indexOf(child);
        if (idx !== -1) el.childNodes.splice(idx, 1);
        const cIdx = el.children.indexOf(child);
        if (cIdx !== -1) el.children.splice(cIdx, 1);
        child.parentNode = null;
        return child;
      },
        insertBefore(newChild: any, refChild: any) {
        el._textContent = undefined;
        const idx = el.childNodes.indexOf(refChild);
        if (idx !== -1) el.childNodes.splice(idx, 0, newChild);
        else el.childNodes.push(newChild);
        if (newChild.nodeType === 1) {
          const cIdx = el.children.indexOf(refChild);
          if (cIdx !== -1) el.children.splice(cIdx, 0, newChild);
          else el.children.push(newChild);
        }
        newChild.parentNode = el;
        return newChild;
      },
      addEventListener(event: string, fn: ListenerFn) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      removeEventListener(event: string, fn: ListenerFn) {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== fn);
        }
      },
        dispatchEvent(event: any) {
        const fns = listeners[event.type] || [];
        fns.forEach((f) => f(event));
        return true;
      },
      focus() {
        el.focused = true;
        if (el.ownerDocument) el.ownerDocument.activeElement = el;
      },
      blur() {
        el.focused = false;
        if (el.ownerDocument && el.ownerDocument.activeElement === el) {
          el.ownerDocument.activeElement = null;
        }
      },
      scrollIntoView(options?: unknown) {
        scrollCalls.push({ id: el.attributes?.['data-palette-item-id'] ?? null, options });
      },
    };
    return el;
  }

  const mockDoc: any = {
    nodeType: 9,
    createElement(tag: string) {
      const el = createMockElement(tag);
      el.ownerDocument = mockDoc;
      return el;
    },
    createElementNS(_ns: string, tag: string) {
      const el = createMockElement(tag);
      el.ownerDocument = mockDoc;
      return el;
    },
    createTextNode(text: string) {
        const tNode: any = {
        nodeType: 3,
        nodeName: '#text',
        _val: String(text),
        get data() {
          return tNode._val;
        },
        set data(v: string) {
          tNode._val = String(v);
        },
        get nodeValue() {
          return tNode._val;
        },
        set nodeValue(v: string) {
          tNode._val = String(v);
        },
        get textContent() {
          return tNode._val;
        },
        set textContent(v: string) {
          tNode._val = String(v);
        },
        get nextSibling() {
          if (!tNode.parentNode) return null;
          const idx = tNode.parentNode.childNodes.indexOf(tNode);
          return idx !== -1 && idx < tNode.parentNode.childNodes.length - 1
            ? tNode.parentNode.childNodes[idx + 1]
            : null;
        },
        get previousSibling() {
          if (!tNode.parentNode) return null;
          const idx = tNode.parentNode.childNodes.indexOf(tNode);
          return idx > 0 ? tNode.parentNode.childNodes[idx - 1] : null;
        },
        parentNode: null,
        ownerDocument: mockDoc,
      };
      return tNode;
    },
    createComment(text: string) {
      return {
        nodeType: 8,
        nodeName: '#comment',
        nodeValue: String(text),
        parentNode: null,
        ownerDocument: mockDoc,
      };
    },
    documentElement: createMockElement('html'),
    body: createMockElement('body'),
    activeElement: null,
    querySelectorAll(selector: string) {
      return mockDoc.body.querySelectorAll(selector);
    },
    addEventListener(event: string, fn: (ev: unknown) => void) {
      docListeners[event] = docListeners[event] || [];
      docListeners[event].push(fn);
    },
    removeEventListener(event: string, fn: (ev: unknown) => void) {
      if (docListeners[event]) {
        docListeners[event] = docListeners[event].filter((f) => f !== fn);
      }
    },
  };
  mockDoc.defaultView = globalThis;
  mockDoc.documentElement.ownerDocument = mockDoc;
  mockDoc.body.ownerDocument = mockDoc;

  const mockStorage: Storage = {
    get length() {
      return storageMap.size;
    },
    key(i: number) {
      return Array.from(storageMap.keys())[i] ?? null;
    },
    getItem(k: string) {
      return storageMap.has(k) ? storageMap.get(k)! : null;
    },
    setItem(k: string, v: string) {
      storageMap.set(k, String(v));
    },
    removeItem(k: string) {
      storageMap.delete(k);
    },
    clear() {
      storageMap.clear();
    },
  };

  const g = globalThis as any;
  g.window = globalThis;
  g.document = mockDoc;
  g.HTMLElement = class {};
  g.HTMLInputElement = class {};
  g.HTMLIFrameElement = class {};
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.requestAnimationFrame = (cb: () => void) => {
    cb();
    return 1;
  };
  g.cancelAnimationFrame = () => {};
  g.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  g.dispatchEvent = (ev: { type?: string }) => {
    for (const fn of windowListeners[ev?.type || ''] || []) fn(ev);
    return true;
  };
  g.addEventListener = (event: string, fn: (ev: unknown) => void) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(fn);
  };
  g.removeEventListener = (event: string, fn: (ev: unknown) => void) => {
    if (windowListeners[event]) {
      windowListeners[event] = windowListeners[event].filter((f) => f !== fn);
    }
  };
  g.localStorage = mockStorage;

  return { mockDoc, mockStorage, scrollCalls };
}

function findElements(node: any, predicate: (el: any) => boolean): any[] {
  const matches: any[] = [];
  if (predicate(node)) matches.push(node);
  if (node.childNodes) {
    for (const child of node.childNodes) {
      matches.push(...findElements(child, predicate));
    }
  }
  return matches;
}

function getReactProps(el: any): any {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps'));
  return key ? el[key] : {};
}

function triggerChange(el: any, value: string) {
  el.value = value;
  const props = getReactProps(el);
  if (typeof props?.onChange === 'function') {
    props.onChange({ target: { value } });
  }
}

function triggerClick(el: any) {
  const props = getReactProps(el);
  if (typeof props?.onClick === 'function') {
    props.onClick({ target: el, preventDefault() {}, stopPropagation() {} });
  }
}

function triggerKeyDown(el: any, key: string) {
  const props = getReactProps(el);
  if (typeof props?.onKeyDown === 'function') {
    props.onKeyDown({
      key,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    });
  }
}

function getNodeText(node: any): string {
  if (!node) return '';
  if (node.nodeType === 3) return node.data || node.nodeValue || node.textContent || '';
  if (node._textContent !== undefined) return node._textContent;
  if (!node.childNodes || node.childNodes.length === 0) return node.textContent || '';
  return node.childNodes.map(getNodeText).join('');
}

function buildRichState(): LifeOSState {
  const state = defaultState();
  state.settings.hiddenTabs = [];
  state.settings.darkMode = true;
  state.settings.privacyMode = false;

  state.todayExtras.push({
    id: 't1',
    date: todayISO(),
    text: 'Enviar factura cliente Orion',
    done: false,
    priority: 'alta',
  });
  state.notes.postits.push({
    id: 'n1',
    title: 'Guía de presupuesto anual',
    text: 'Revisar gasto de $U 12.500 en equipamiento',
    date: todayISO(),
  });
  state.finance.accounts = [
    { id: 'acc-1', name: 'Cuenta Itaú Principal', currency: 'UYU', balance: 87450 },
  ];
  state.finance.transactions.push({
    id: 'tx-1',
    date: todayISO(),
    type: 'gasto',
    amount: 4850,
    category: 'Comida',
    fixed: 'variable',
    note: 'Compra mayorista Orion',
    accountId: 'acc-1',
  });
  state.gym.routineTemplates.push({
    id: 'rt-1',
    name: 'Torso Fuerza A',
    exercises: [
      {
        id: 'ex-1',
        name: 'Press militar barra',
        muscleGroup: 'Hombros',
        sets: [{ id: 's1', weight: 50, reps: 8 }],
      },
    ],
  });
  state.study.subjects.push({ id: 'sub-1', name: 'Arquitectura de Computadoras' });
  state.study.exams.push({
    id: 'exm-1',
    title: 'Parcial Arquitectura',
    subjectId: 'sub-1',
    date: todayISO(),
    status: 'pendiente',
  });
  state.jobs.applications.push({
    id: 'job-1',
    empresa: 'PedidosYa',
    puesto: 'Frontend Engineer',
    estado: 'entrevista',
    fecha: todayISO(),
  });
  state.resale.commercial = {
    items: [{ id: 'prod-1', name: 'Auriculares Bluetooth Pro', unit: 'unit' }],
    operations: [],
    movements: [],
  };
  state.resale.inventory.push({
    id: 'inv-1',
    item: 'Teclado Mecánico Orion',
    buyPrice: 3200,
    buyDate: todayISO(),
    status: 'comprado',
  });
  return state;
}

test('Bloque 31.1: Estado vacío muestra grupos Recientes (condicional + filtrado por hiddenTabs), Acciones rápidas e Ir a módulo', () => {
  setupMockDom();
  clearCommandPaletteRecents();

  const state = buildRichState();

  // Sin recientes guardados, el grupo Recientes NO debe aparecer
  const htmlEmpty = renderToStaticMarkup(
    <PrivacyProvider active={false}>
      <GlobalSearchModal
        state={state}
        open={true}
        onClose={() => {}}
        onNavigate={() => {}}
        onOpenCapture={() => {}}
        cloudConnected={false}
      />
    </PrivacyProvider>
  );

  assert.doesNotMatch(htmlEmpty, /data-palette-group="Recientes"/, 'Recientes debe ocultarse cuando está vacío');
  assert.match(htmlEmpty, /data-palette-group="Acciones rápidas"/, 'Debe mostrar grupo Acciones rápidas');
  assert.match(htmlEmpty, /data-palette-group="Ir a módulo"/, 'Debe mostrar grupo Ir a módulo');
  assert.match(htmlEmpty, /Nuevo gasto/);
  assert.match(htmlEmpty, /Nueva tarea/);
  assert.match(htmlEmpty, /Nueva nota/);
  assert.match(htmlEmpty, /Iniciar entrenamiento/);
  assert.match(htmlEmpty, /Armar contexto para IA/);
  assert.match(htmlEmpty, /Activar Modo Privacidad/);
  assert.match(htmlEmpty, /Cambiar a Modo Claro/);
  assert.doesNotMatch(htmlEmpty, /Sincronizar ahora/, 'Sincronizar ahora debe ocultarse sin sesión de Google');
  assert.match(htmlEmpty, /lucide-bot/, 'Módulo IA debe usar Bot via AppIcon');

  // Con sesión de Google y recientes en localStorage + un módulo oculto en hiddenTabs
  recordCommandPaletteRecent({
    id: 'view-finanzas',
    kind: 'view',
    title: 'Finanzas',
    iconName: 'wallet',
    module: 'finanzas',
    view: 'finanzas',
  });
  recordCommandPaletteRecent({
    id: 'view-estudios',
    kind: 'view',
    title: 'Estudios',
    iconName: 'graduation',
    module: 'estudios',
    view: 'estudios',
  });
  recordCommandPaletteRecent({
    id: 'action-sync',
    kind: 'action',
    title: 'Sincronizar ahora',
    iconName: 'cloud',
  });

  // Ocultar 'finanzas' e 'ia' -> deben desaparecer de Recientes, Acciones rápidas e Ir a módulo
  state.settings.hiddenTabs = ['finanzas', 'ia'];
  const htmlWithRecents = renderToStaticMarkup(
    <PrivacyProvider active={false}>
      <GlobalSearchModal
        state={state}
        open={true}
        onClose={() => {}}
        onNavigate={() => {}}
        onOpenCapture={() => {}}
        cloudConnected={true}
        onForceSync={() => {}}
      />
    </PrivacyProvider>
  );

  assert.match(htmlWithRecents, /data-palette-group="Recientes"/, 'Debe mostrar grupo Recientes cuando hay elementos visibles');
  assert.match(htmlWithRecents, /data-palette-item-id="recent:view-estudios"/, 'Reciente de módulo visible debe permanecer');
  assert.doesNotMatch(htmlWithRecents, /data-palette-item-id="recent:view-finanzas"/, 'Reciente de módulo oculto en hiddenTabs debe filtrarse');
  assert.doesNotMatch(htmlWithRecents, /data-palette-item-id="action-expense"/, 'Nuevo gasto debe ocultarse si Finanzas está en hiddenTabs');
  assert.doesNotMatch(htmlWithRecents, /data-palette-item-id="action-ai-context"/, 'Armar contexto para IA debe ocultarse si IA está en hiddenTabs');
  assert.match(htmlWithRecents, /data-palette-item-id="action-sync"/, 'Sincronizar ahora debe aparecer si cloudConnected=true');

  // Confirmar que Recientes vive solo en localStorage bajo su clave dedicada
  const rawStored = globalThis.localStorage.getItem(COMMAND_PALETTE_RECENTS_KEY);
  assert.ok(rawStored && rawStored.includes('view-estudios'), 'Recientes debe persistir en localStorage bajo clave dedicada');
});

test('Bloque 31.2: Ejecución real de acciones directas (Privacidad, Tema, Captura por modo, Gym activo, IA y Sincronizar ahora)', async () => {
  const { mockDoc } = setupMockDom();
  clearCommandPaletteRecents();

  const state = buildRichState();
  state.gym.sessions.push({
    id: 'active-gym-1',
    date: todayISO(),
    status: 'active',
    exercises: [],
  });

  const captureCalls: Array<{ kind?: CaptureKind; text?: string }> = [];
  const navCalls: Array<{ view: ViewType; focusId?: string }> = [];
  let themeToggled = 0;
  let privacyToggled = 0;
  let syncTriggered = 0;
  let closeCalls = 0;

  const container = mockDoc.createElement('div');
  mockDoc.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <PrivacyProvider active={false}>
        <GlobalSearchModal
          state={state}
          open={true}
          onClose={() => {
            closeCalls += 1;
          }}
          onNavigate={(view, focusId) => navCalls.push({ view, focusId })}
          onOpenCapture={(kind, text) => captureCalls.push({ kind, text })}
          onToggleTheme={() => {
            themeToggled += 1;
          }}
          onTogglePrivacy={() => {
            privacyToggled += 1;
          }}
          cloudConnected={true}
          onForceSync={() => {
            syncTriggered += 1;
          }}
        />
      </PrivacyProvider>
    );
  });

  const findBtn = (id: string) =>
    findElements(container, (el) => el.attributes?.['data-palette-item-id'] === id)[0];

  // Gym con sesión activa muestra "Ir a sesión activa"
  const gymBtn = findBtn('action-gym');
  assert.ok(gymBtn);
  assert.match(getNodeText(gymBtn), /Ir a sesión activa/);

  await act(async () => {
    triggerClick(findBtn('action-expense'));
    triggerClick(findBtn('action-task'));
    triggerClick(findBtn('action-note'));
    triggerClick(findBtn('action-ai-context'));
    triggerClick(findBtn('action-privacy'));
    triggerClick(findBtn('action-theme'));
    triggerClick(findBtn('action-sync'));
  });

  assert.deepEqual(
    captureCalls.map((c) => c.kind),
    ['gasto', 'tarea', 'nota'],
    'Nuevo gasto, Nueva tarea y Nueva nota deben abrir + Capturar en su modo exacto'
  );
  assert.equal(navCalls[0]?.view, 'ia', 'Armar contexto para IA debe navegar a IA');
  assert.equal(privacyToggled, 1, 'Modo Privacidad debe ejecutarse al instante');
  assert.equal(themeToggled, 1, 'Modo Claro/Oscuro debe ejecutarse al instante');
  assert.equal(syncTriggered, 1, 'Sincronizar ahora debe disparar onForceSync');
  assert.ok(closeCalls >= 5);

  const recents = loadCommandPaletteRecents();
  assert.equal(recents.length, 5, 'Recientes debe caparse a máximo 5 ítems');
  assert.equal(recents[0].id, 'action-sync', 'La acción más reciente debe quedar primera');

  await act(async () => {
    root.unmount();
  });
});

test('Bloque 31.3: Búsqueda unificada respeta estrictamente hiddenTabs y enmascara montos con privacyMode activo', () => {
  setupMockDom();
  clearCommandPaletteRecents();

  const state = buildRichState();
  state.settings.privacyMode = true;

  // Búsqueda por "Orion" cubre tarea (dashboard), gasto (finanzas) y producto (reventa)
  const resultsAll = searchLifeOS(state, 'Orion');
  assert.ok(resultsAll.some((r) => r.view === 'dashboard'), 'Debe encontrar tarea');
  assert.ok(resultsAll.some((r) => r.view === 'finanzas'), 'Debe encontrar movimiento de Finanzas');
  assert.ok(resultsAll.some((r) => r.view === 'reventa'), 'Debe encontrar producto de Mi negocio');

  // En modo privacidad NINGÚN monto exacto debe filtrarse en resultados
  const finRes = resultsAll.find((r) => r.view === 'finanzas')!;
  assert.ok(!finRes.subtitle.includes('4.850'), 'No debe filtrar monto exacto en Finanzas');
  assert.ok(finRes.subtitle.includes('••••'), 'Debe mostrar máscara limpia en Finanzas');
  assert.equal(finRes.badge, '-••••');

  const resaleRes = resultsAll.find((r) => r.view === 'reventa')!;
  assert.ok(!resaleRes.subtitle.includes('3.200'), 'No debe filtrar costo exacto en Mi negocio');
  assert.ok(resaleRes.subtitle.includes('••••'));

  // Producto comercial en Mi negocio también se indexa
  const prodRes = searchLifeOS(state, 'Auriculares Bluetooth');
  assert.equal(prodRes[0]?.view, 'reventa');
  assert.equal(prodRes[0]?.title, 'Auriculares Bluetooth Pro');

  // Notas con cifras también enmascaran montos en privacyMode
  const noteRes = searchLifeOS(state, 'presupuesto anual');
  assert.equal(noteRes[0]?.view, 'notas');
  assert.ok(!noteRes[0].subtitle.includes('12.500'), 'No debe filtrar montos monetarios en snippets de notas');
  assert.ok(noteRes[0].subtitle.includes('••••'));

  // Render completo de la paleta con query "Cuenta Itaú" y privacyMode=true
  const htmlPrivateSearch = renderToStaticMarkup(
    <PrivacyProvider active={true}>
      <GlobalSearchModal
        state={state}
        open={true}
        initialQuery="Cuenta Itaú"
        onClose={() => {}}
        onNavigate={() => {}}
      />
    </PrivacyProvider>
  );
  assert.ok(!htmlPrivateSearch.includes('87.450'), 'La paleta nunca debe renderizar saldos reales en privacyMode');
  assert.ok(htmlPrivateSearch.includes('••••'), 'La paleta debe mostrar la máscara de privacidad');

  // Ocultar finanzas, reventa y notas -> cero resultados de esos módulos
  state.settings.hiddenTabs = ['finanzas', 'reventa', 'notas'];
  const filteredResults = searchLifeOS(state, 'Orion');
  assert.equal(filteredResults.some((r) => r.view === 'finanzas'), false);
  assert.equal(filteredResults.some((r) => r.view === 'reventa'), false);
  assert.equal(filteredResults.some((r) => r.view === 'notas'), false);
  assert.equal(filteredResults.length, 1);
  assert.equal(filteredResults[0].view, 'dashboard');
});

test('Bloque 31.4: Navegación 100 % teclado (ArrowDown, ArrowUp con wrap-around, Enter, Escape y sugerencia en estado vacío)', async () => {
  const { mockDoc, scrollCalls } = setupMockDom();
  clearCommandPaletteRecents();

  const state = buildRichState();
  state.settings.hiddenTabs = ['trabajo', 'reventa', 'estudios', 'agenda', 'calendario', 'ia'];

  const captureCalls: Array<{ kind?: CaptureKind; text?: string }> = [];
  let closedCount = 0;

  const container = mockDoc.createElement('div');
  mockDoc.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <PrivacyProvider active={false}>
        <GlobalSearchModal
          state={state}
          open={true}
          onClose={() => {
            closedCount += 1;
          }}
          onNavigate={() => {}}
          onOpenCapture={(kind, text) => captureCalls.push({ kind, text })}
        />
      </PrivacyProvider>
    );
  });

  const dialog = findElements(container, (el) => el.attributes?.role === 'dialog')[0];
  const input = findElements(container, (el) => el.tagName === 'INPUT' && el.attributes?.role === 'combobox')[0];
  assert.ok(dialog && input, 'Debe montar dialog y combobox');
  assert.equal(mockDoc.activeElement, input, 'El input de búsqueda debe recibir foco automático al abrir');

  const getSelectedId = () =>
    findElements(container, (el) => el.attributes?.['data-palette-selected'] === 'true')[0]?.attributes?.[
      'data-palette-item-id'
    ];
  const allOptions = () => findElements(container, (el) => el.attributes?.role === 'option');

  const initialCount = allOptions().length;
  assert.ok(initialCount >= 4);
  assert.equal(getSelectedId(), allOptions()[0].attributes['data-palette-item-id']);

  // ArrowDown avanza al segundo ítem y llama scrollIntoView({ block: 'nearest' })
  await act(async () => {
    triggerKeyDown(dialog, 'ArrowDown');
  });
  assert.equal(getSelectedId(), allOptions()[1].attributes['data-palette-item-id']);
  assert.ok(scrollCalls.some((c) => (c.options as { block?: string })?.block === 'nearest'));

  // ArrowUp vuelve al primero y otro ArrowUp hace wrap-around al último
  await act(async () => {
    triggerKeyDown(dialog, 'ArrowUp');
  });
  assert.equal(getSelectedId(), allOptions()[0].attributes['data-palette-item-id']);

  await act(async () => {
    triggerKeyDown(dialog, 'ArrowUp');
  });
  assert.equal(getSelectedId(), allOptions()[initialCount - 1].attributes['data-palette-item-id']);

  // Home vuelve al 0 y ArrowDown selecciona 'action-task' (índice 1: después de action-expense)
  await act(async () => {
    triggerKeyDown(dialog, 'Home');
    triggerKeyDown(dialog, 'ArrowDown');
  });
  assert.equal(getSelectedId(), 'action-task');

  // Re-render con nuevo objeto state (ej. al alternar Modo Privacidad / Tema) NO debe resetear selectedIdx
  const clonedState: LifeOSState = structuredClone(state);
  clonedState.settings.privacyMode = true;
  await act(async () => {
    root.render(
      <PrivacyProvider active={true}>
        <GlobalSearchModal
          state={clonedState}
          open={true}
          onClose={() => {
            closedCount += 1;
          }}
          onNavigate={() => {}}
          onOpenCapture={(kind, text) => captureCalls.push({ kind, text })}
        />
      </PrivacyProvider>
    );
  });
  assert.equal(
    getSelectedId(),
    'action-task',
    'Actualizar state en caliente (ej. Privacidad/Tema) no debe resetear el índice de selección'
  );

  // Enter ejecuta Nueva tarea y la persiste en Recientes
  await act(async () => {
    triggerKeyDown(dialog, 'Enter');
  });
  assert.equal(captureCalls[0]?.kind, 'tarea');
  assert.equal(loadCommandPaletteRecents()[0]?.id, 'action-task');

  // Escribir una consulta sin coincidencias y presionar Enter sugiere/ejecuta + Capturar con el texto
  await act(async () => {
    triggerChange(input, 'zzxxyy9911');
  });
  assert.equal(allOptions().length, 0, 'Sin coincidencias no debe listar opciones falsas');
  assert.match(getNodeText(container), /Crear “zzxxyy9911” en \+ Capturar/);

  await act(async () => {
    triggerKeyDown(dialog, 'Enter');
  });
  assert.equal(captureCalls[1]?.kind, 'universal');
  assert.equal(captureCalls[1]?.text, 'zzxxyy9911');

  // Escape cierra limpiamente incluso con texto escrito
  const prevClosed = closedCount;
  await act(async () => {
    triggerKeyDown(dialog, 'Escape');
  });
  assert.equal(closedCount, prevClosed + 1, 'Escape debe cerrar la paleta limpiamente');

  await act(async () => {
    root.unmount();
  });
});

test('Bloque 31.5: Estética Celestian, ergonomía móvil Bloque 30, pie desktop con Lucide, cero azules residuales y cero símbolos ASCII', () => {
  const modalSrc = readFileSync('src/components/GlobalSearchModal.tsx', 'utf8');
  const searchSrc = readFileSync('src/lib/search.ts', 'utf8');

  for (const [name, src] of [
    ['GlobalSearchModal.tsx', modalSrc],
    ['search.ts', searchSrc],
  ]) {
    assert.doesNotMatch(
      src,
      /\b(?:bg|text|border|ring|accent|from|to|via|decoration)-(?:blue|sky)-/,
      `Azul residual detectado en ${name}`
    );
    assert.doesNotMatch(src, /var\(--blue/, `var(--blue) residual detectado en ${name}`);
    assert.doesNotMatch(
      src,
      /[▲▼▶▾×✕↗↘⇄←→↑↓↵✓]/,
      `Símbolo ASCII prohibido detectado en ${name}`
    );
  }

  // Ergonomía móvil Bloque 30 preservada
  assert.match(modalSrc, /max-h-\[90dvh\]/);
  assert.match(modalSrc, /overscroll-contain/);
  assert.match(modalSrc, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(modalSrc, /min-h-\[44px\] min-w-\[44px\]/);
  assert.match(modalSrc, /inputMode="decimal"/);

  // Pie discreto solo desktop con íconos Lucide
  assert.match(modalSrc, /hidden sm:flex/);
  assert.match(modalSrc, /import \{ ArrowDown, ArrowUp, CornerDownLeft \} from 'lucide-react'/);
  assert.match(modalSrc, /Navegar/);
  assert.match(modalSrc, /Ejecutar/);
  assert.match(modalSrc, /Cerrar/);

  // Confirmar que uid no genera advertencias y search maneja correctamente un id nuevo
  const probeState = defaultState();
  probeState.todayExtras.push({
    id: uid(),
    date: todayISO(),
    text: 'Chequeo rápido',
    done: false,
    priority: 'media',
  });
  assert.equal(searchLifeOS(probeState, 'Chequeo')[0]?.view, 'dashboard');
});
