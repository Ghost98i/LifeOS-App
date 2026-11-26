import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { dayKeyFromDate, defaultState, todayISO } from './storage';
import { getTodayRadarMilestones } from './todayControlCenter';
import { getDismissedAttentionItems } from './todayAttention';
import { Sidebar } from '../components/Sidebar';
import { DashboardView } from '../components/DashboardView';
import { MobileQuickCapture } from '../components/MobileQuickCapture';
import type { LifeOSState } from '../types';

function setupMockDom() {
  const windowListeners: Record<string, Array<(ev: any) => void>> = {};
  const docListeners: Record<string, Array<(ev: any) => void>> = {};

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
      get firstChild() { return el.childNodes[0] || null; },
      get lastChild() { return el.childNodes[el.childNodes.length - 1] || null; },
      get nextSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.childNodes.indexOf(el);
        return idx !== -1 && idx < el.parentNode.childNodes.length - 1 ? el.parentNode.childNodes[idx + 1] : null;
      },
      get previousSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.childNodes.indexOf(el);
        return idx > 0 ? el.parentNode.childNodes[idx - 1] : null;
      },
      setAttribute(k: string, v: string) { el.attributes[k] = String(v); },
      getAttribute(k: string) { return el.attributes[k] ?? null; },
      removeAttribute(k: string) { delete el.attributes[k]; },
      closest(selector: string) {
        let cur: any = el;
        while (cur && cur.nodeType === 1) {
          if (selector === 'button[role="switch"]' && cur.tagName === 'BUTTON' && cur.attributes?.role === 'switch') {
            return cur;
          }
          cur = cur.parentNode;
        }
        return null;
      },
      querySelector(selector: string) {
        if (selector === '[aria-label="Cerrar navegación"]') {
          return findElements(el, (n) => n.attributes?.['aria-label'] === 'Cerrar navegación')[0] || null;
        }
        return null;
      },
      querySelectorAll(selector: string) {
        if (selector.includes('button')) {
          return findElements(el, (n) => n.tagName === 'BUTTON');
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
        get data() { return tNode._val; },
        set data(v: string) { tNode._val = String(v); },
        get nodeValue() { return tNode._val; },
        set nodeValue(v: string) { tNode._val = String(v); },
        get textContent() { return tNode._val; },
        set textContent(v: string) { tNode._val = String(v); },
        get nextSibling() {
          if (!tNode.parentNode) return null;
          const idx = tNode.parentNode.childNodes.indexOf(tNode);
          return idx !== -1 && idx < tNode.parentNode.childNodes.length - 1 ? tNode.parentNode.childNodes[idx + 1] : null;
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
    addEventListener(event: string, fn: (ev: any) => void) {
      docListeners[event] = docListeners[event] || [];
      docListeners[event].push(fn);
    },
    removeEventListener(event: string, fn: (ev: any) => void) {
      if (docListeners[event]) {
        docListeners[event] = docListeners[event].filter((f) => f !== fn);
      }
    },
  };
  mockDoc.defaultView = globalThis;
  mockDoc.documentElement.ownerDocument = mockDoc;
  mockDoc.body.ownerDocument = mockDoc;

  (globalThis as any).window = globalThis;
  (globalThis as any).document = mockDoc;
  (globalThis as any).HTMLElement = class {};
  (globalThis as any).HTMLInputElement = class {};
  (globalThis as any).HTMLIFrameElement = class {};
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  (globalThis as any).dispatchEvent = (ev: any) => {
    for (const fn of windowListeners[ev?.type] || []) fn(ev);
    return true;
  };
  (globalThis as any).addEventListener = (event: string, fn: (ev: any) => void) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(fn);
  };
  (globalThis as any).removeEventListener = (event: string, fn: (ev: any) => void) => {
    if (windowListeners[event]) {
      windowListeners[event] = windowListeners[event].filter((f) => f !== fn);
    }
  };
  (globalThis as any).localStorage = {
    getItem() { return 'false'; },
    setItem() {},
    removeItem() {},
    clear() {},
  };

  return { mockDoc, windowListeners };
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

function triggerKeyDown(el: any, init: { key: string; ctrlKey?: boolean; metaKey?: boolean }) {
  const props = getReactProps(el);
  if (typeof props?.onKeyDown === 'function') {
    props.onKeyDown({
      key: init.key,
      ctrlKey: Boolean(init.ctrlKey),
      metaKey: Boolean(init.metaKey),
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
    });
  }
}

function triggerSubmit(el: any) {
  const props = getReactProps(el);
  if (typeof props?.onSubmit === 'function') {
    props.onSubmit({ preventDefault() {}, stopPropagation() {} });
  }
}

function getNodeText(node: any): string {
  if (!node) return '';
  if (node.nodeType === 3) return node.data || node.nodeValue || node.textContent || '';
  if (node._textContent !== undefined) return node._textContent;
  if (!node.childNodes || node.childNodes.length === 0) return node.textContent || '';
  return node.childNodes.map(getNodeText).join('');
}

test('Bloque 27.1: Sidebar (desktop y drawer móvil) usa CelestianSwitch animado para Modo Oscuro/Claro y conmuta el tema efectivamente', async () => {
  const sidebarSrc = readFileSync('src/components/Sidebar.tsx', 'utf8');
  assert.match(sidebarSrc, /CelestianSwitch/, 'Sidebar debe reutilizar CelestianSwitch');
  assert.doesNotMatch(sidebarSrc, /justify-end.*justify-start/, 'No debe usar el viejo toggle genérico sin slide');

  const { mockDoc } = setupMockDom();
  const container = mockDoc.createElement('div');
  mockDoc.body.appendChild(container);
  const root = createRoot(container);

  const state: LifeOSState = defaultState();
  state.settings.darkMode = false;

  const renderSidebar = async (isOpenMobile: boolean) => {
    await act(async () => {
      root.render(
        React.createElement(Sidebar, {
          currentView: 'dashboard',
          state: structuredClone(state),
          onNavigate: () => {},
          onToggleTheme: () => {
            state.settings.darkMode = !state.settings.darkMode;
          },
          isOpenMobile,
          onCloseMobile: () => {},
        })
      );
    });
  };

  // 1. Desktop (isOpenMobile=false) en Modo Claro
  await renderSidebar(false);
  const switchBtnLight = findElements(container, (el) => el.attributes?.role === 'switch' && el.attributes?.['data-celestian-switch'] === 'true')[0];
  assert.ok(switchBtnLight, 'Debe renderizar CelestianSwitch con role="switch"');
  assert.equal(switchBtnLight.attributes['aria-checked'], 'false');
  assert.ok(getNodeText(container).includes('Modo claro'));
  const iconLight = findElements(container, (el) => el.attributes?.['data-theme-icon'])[0];
  assert.equal(iconLight?.attributes?.['data-theme-icon'], 'sun');

  // 2. Clic real en el switch -> pasa a Modo Oscuro
  await act(async () => {
    triggerClick(switchBtnLight);
  });
  assert.equal(state.settings.darkMode, true, 'El clic en CelestianSwitch debe activar darkMode');

  // 3. Re-render en Drawer Móvil (isOpenMobile=true) verificando reflejo inmediato y toggle de vuelta
  await renderSidebar(true);
  const switchBtnDark = findElements(container, (el) => el.attributes?.role === 'switch' && el.attributes?.['data-celestian-switch'] === 'true')[0];
  assert.ok(switchBtnDark);
  assert.equal(switchBtnDark.attributes['aria-checked'], 'true');
  assert.ok(getNodeText(container).includes('Modo oscuro'));
  const iconDark = findElements(container, (el) => el.attributes?.['data-theme-icon'])[0];
  assert.equal(iconDark?.attributes?.['data-theme-icon'], 'moon');

  await act(async () => {
    triggerClick(switchBtnDark);
  });
  assert.equal(state.settings.darkMode, false, 'El clic desde el drawer móvil debe alternar de vuelta a modo claro');

  await act(async () => { root.unmount(); });
});

test('Bloque 27.2: Hoy respeta hiddenTabs, usa CompletionCheck en rutinas, permite silenciar Radar compatible con Avisos silenciados y tiene cero azules/ASCII', () => {
  const today = todayISO();
  const dayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));
  const tomorrowDate = new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;

  // Caso A: Módulos activos con rutina, bloque, vencimiento financiero y examen
  const activeState = defaultState();
  activeState.tasksRecurring = [{ id: 'r1', name: 'Meditar 10 min', freq: 'daily' }];
  activeState.agenda[dayKey] = [{ id: 'b1', time: '11:00', activity: 'Revisar finanzas' }];
  activeState.finance.commitments.push({
    id: 'com-rent',
    name: 'Alquiler',
    amount: 20000,
    currency: 'UYU',
    frequency: 'monthly',
    nextDueDate: today,
    active: true,
  });
  activeState.study.exams.push({
    id: 'ex-1',
    title: 'Parcial Redes',
    date: tomorrowIso,
    status: 'pendiente',
  });

  const htmlActive = renderToStaticMarkup(
    <DashboardView
      state={activeState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      onOpenCapture={() => {}}
      nowOverride={new Date(`${today}T10:30:00`)}
    />
  );

  // CompletionCheck presente para tareas y rutinas
  assert.match(htmlActive, /data-completion-check="true"/);
  assert.match(htmlActive, /Meditar 10 min/);
  // Radar muestra señales reales con botón discreto de silenciar
  assert.match(htmlActive, /Alquiler/);
  assert.match(htmlActive, /Parcial Redes/);
  assert.match(htmlActive, /aria-label="Silenciar aviso: Alquiler"/);
  assert.match(htmlActive, /aria-label="Silenciar aviso: Parcial Redes"/);
  // Cero azules residuales ni ASCII en Hoy
  assert.doesNotMatch(htmlActive, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(htmlActive, /var\(--blue/);
  assert.doesNotMatch(htmlActive, /[▲▼▶▾×↗→←✓]/);

  // Silenciar el vencimiento financiero lo oculta de Radar y lo expone en Avisos silenciados
  const dismissKey = `finance_commitment:com-rent:${today}`;
  activeState.settings.attentionDismissals = {
    [dismissKey]: { status: 'dismissed', updatedAt: Date.now() },
  };
  activeState.settings.dismissedAttentionKeys = [dismissKey];

  const remainingRadar = getTodayRadarMilestones(activeState, today);
  assert.equal(remainingRadar.some((m) => m.id === 'radar-fin-com-com-rent'), false, 'Aviso silenciado no debe reaparecer en Radar');
  const dismissedList = getDismissedAttentionItems(activeState, { todayIso: today });
  assert.equal(dismissedList.some((d) => d.dismissKey === dismissKey), true, 'El aviso silenciado debe aparecer en Avisos silenciados de Configuración');

  // Caso B: Respeto estricto a hiddenTabs (ocultando finanzas, estudios, trabajo, gimnasio y notas)
  const minimalState = defaultState();
  minimalState.settings.hiddenTabs = ['finanzas', 'estudios', 'trabajo', 'gimnasio', 'notas'];
  minimalState.finance.commitments.push({
    id: 'com-hidden',
    name: 'Cuota oculta',
    amount: 5000,
    currency: 'UYU',
    frequency: 'once',
    nextDueDate: today,
    active: true,
  });
  minimalState.notes.postits = [{ id: 'n1', title: 'Nota oculta', text: 'Privada', date: today, pinned: true }];

  const htmlHidden = renderToStaticMarkup(
    <DashboardView
      state={minimalState}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T12:00:00`)}
    />
  );

  assert.doesNotMatch(htmlHidden, /Cuota oculta/, 'No debe filtrar compromisos cuando Finanzas está oculto');
  assert.doesNotMatch(htmlHidden, /Nota oculta/, 'No debe mostrar notas fijadas cuando Notas está oculto');
  assert.doesNotMatch(htmlHidden, /id="today-radar-title"/, 'No debe renderizar tarjeta muerta de Radar si todos los módulos de Radar están ocultos');
  assert.doesNotMatch(htmlHidden, /Estudio hoy/);
  assert.doesNotMatch(htmlHidden, />Gimnasio</);
});

test('Bloque 27.3: + Capturar enfoca al abrir con .celestian-clean-field, cambia de tipo en 1 toque, guarda con Enter y Ctrl+Enter y cierra con Escape', async () => {
  const { mockDoc } = setupMockDom();
  const container = mockDoc.createElement('div');
  mockDoc.body.appendChild(container);
  const root = createRoot(container);

  const appState: LifeOSState = defaultState();
  let closeCount = 0;

  await act(async () => {
    root.render(
      React.createElement(MobileQuickCapture, {
        open: true,
        initialKind: 'tarea',
        onClose: () => { closeCount += 1; },
        state: appState,
        onUpdateState: (updater) => {
          updater(appState);
          return true;
        },
      })
    );
  });

  // 1. Ergonomía 90dvh + cero azules/ASCII en el modal
  const dialog = findElements(container, (el) => el.attributes?.role === 'dialog')[0];
  assert.ok(dialog, 'Debe renderizar el modal de captura');
  const dialogCls = String(dialog.attributes?.class || dialog.className || '');
  assert.match(dialogCls, /max-h-\[90dvh\]/, 'Debe respetar max-h-[90dvh] para ergonomía móvil 389px');

  // 2. Foco automático inmediato en el input principal con .celestian-clean-field
  const taskInput = findElements(container, (el) => el.tagName === 'INPUT')[0];
  assert.ok(taskInput, 'Debe renderizar el input de tarea');
  assert.equal(mockDoc.activeElement, taskInput, 'El campo principal debe recibir foco automático inmediato al abrir');
  assert.match(String(taskInput.attributes?.class || taskInput.className || ''), /celestian-clean-field/);

  // 3. Cierre rápido con Escape cuando no hay contenido sin guardar
  await act(async () => {
    triggerKeyDown(dialog, { key: 'Escape' });
  });
  assert.equal(closeCount, 1, 'Escape debe cerrar el modal de inmediato');

  // 4. Reabrir, escribir tarea y guardar con submit (Enter)
  closeCount = 0;
  await act(async () => {
    triggerChange(taskInput, 'Pagar patente');
  });
  const form = findElements(container, (el) => el.tagName === 'FORM')[0];
  await act(async () => {
    triggerSubmit(form);
  });
  assert.equal(appState.todayExtras.some((t) => t.text === 'Pagar patente'), true, 'Enter/submit debe guardar la tarea');

  // Esperar reset interno de isSubmitting
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });

  // 5. Cambiar a pestaña Nota en 1 toque -> textarea con foco automático + CelestianSwitch + Ctrl+Enter guarda
  const notaTab = findElements(container, (el) => el.attributes?.role === 'tab' && getNodeText(el).includes('Nota'))[0];
  assert.ok(notaTab, 'Debe existir la pastilla de tipo Nota');
  await act(async () => {
    triggerClick(notaTab);
  });

  const noteTextarea = findElements(container, (el) => el.tagName === 'TEXTAREA')[0];
  assert.ok(noteTextarea, 'Nota debe usar textarea para escritura rápida');
  assert.equal(mockDoc.activeElement, noteTextarea, 'Al cambiar a Nota el textarea principal debe recibir foco automático');
  assert.match(String(noteTextarea.attributes?.class || noteTextarea.className || ''), /celestian-clean-field/);

  const pinSwitch = findElements(container, (el) => el.attributes?.role === 'switch' && el.attributes?.['data-celestian-switch'] === 'true')[0];
  assert.ok(pinSwitch, 'Fijar nota debe usar CelestianSwitch en lugar de checkbox nativo');
  const rawCheckboxes = findElements(container, (el) => el.tagName === 'INPUT' && el.attributes?.type === 'checkbox');
  assert.equal(rawCheckboxes.length, 0, 'Cero checkboxes nativos en + Capturar');

  await act(async () => {
    triggerChange(noteTextarea, 'Clave wifi oficina 2026');
  });
  const noteForm = findElements(container, (el) => el.tagName === 'FORM')[0];
  await act(async () => {
    triggerKeyDown(noteForm, { key: 'Enter', ctrlKey: true });
  });
  assert.equal(
    appState.notes.postits.some((n) => n.text.includes('Clave wifi oficina 2026')),
    true,
    'Ctrl+Enter debe guardar la nota al instante'
  );

  // SSR check: cero azules residuales y cero ASCII en MobileQuickCapture
  const ssrCapture = renderToStaticMarkup(
    <MobileQuickCapture
      open={true}
      initialKind="tarea"
      onClose={() => {}}
      state={defaultState()}
      onUpdateState={() => true}
    />
  );
  assert.doesNotMatch(ssrCapture, /\b(?:bg|text|border|ring|accent)-(?:blue|sky)-/);
  assert.doesNotMatch(ssrCapture, /var\(--blue/);
  assert.doesNotMatch(ssrCapture, /[▲▼▶▾×↗→←✓↵]/);

  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
  await act(async () => { root.unmount(); });
});
