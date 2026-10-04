import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileQuickCapture } from '../components/MobileQuickCapture';
import { defaultState } from './storage';
import type { LifeOSState } from '../types';

// Lightweight mock DOM environment for React 19 testing in Node
function setupMockDom() {
  function createMockElement(tag = 'div') {
    type ListenerFn = (...args: unknown[]) => void;
    const listeners: Record<string, ListenerFn[]> = {};
    const el: any = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
      ownerDocument: null,
      childNodes: [],
      children: [],
      style: {},
      attributes: {},
      value: '',
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
      },
      focus() {},
      blur() {},
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
    addEventListener() {},
    removeEventListener() {},
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
  (globalThis as any).dispatchEvent = () => true;
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
  (globalThis as any).localStorage = {
    getItem() { return 'false'; },
    setItem() {},
    removeItem() {},
    clear() {},
  };

  return mockDoc;
}

// Helper to recursively find elements by tag or text content
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
    props.onClick({ preventDefault() {}, stopPropagation() {} });
  }
}

function getNodeText(node: any): string {
  if (!node) return '';
  if (node.nodeType === 3) return node.data || node.nodeValue || node.textContent || '';
  if (node._textContent !== undefined) return node._textContent;
  if (!node.childNodes || node.childNodes.length === 0) return node.textContent || '';
  return node.childNodes.map(getNodeText).join('');
}

test('LifeOS — Fase 4: Real mounted MobileQuickCapture test (interpret 2 drafts, confirm 1, preserve 2nd and external change resilience)', async () => {
  const mockDoc = setupMockDom();
  const container = mockDoc.createElement('div');
  mockDoc.body.appendChild(container);
  const root = createRoot(container);

  let appState: LifeOSState = defaultState();
  let closed = false;

  const handleUpdateState = (updater: (draft: LifeOSState) => void): boolean => {
    const clone = structuredClone(appState);
    updater(clone);
    appState = clone;
    return true;
  };

  const handleClose = () => {
    closed = true;
  };

  // Mount MobileQuickCapture
  await act(async () => {
    root.render(
      React.createElement(MobileQuickCapture, {
        open: true,
        onClose: handleClose,
        state: appState,
        onUpdateState: handleUpdateState,
      })
    );
  });

  // Verify modal is rendered in DOM
  const inputs = findElements(container, (el) => el.tagName === 'INPUT');
  assert.ok(inputs.length > 0, 'Universal input should be rendered');
  const universalInput = inputs[0];

  // 1. Enter text with two independent intents: "1200 nafta y estudiar redes mañana"
  await act(async () => {
    triggerChange(universalInput, '1200 nafta y estudiar redes mañana');
  });

  // Click "Interpretar" button
  const buttons = findElements(container, (el) => el.tagName === 'BUTTON');
  const interpretBtn = buttons.find((b) => getNodeText(b).includes('Interpretar'));
  assert.ok(interpretBtn, 'Interpret button must exist');

  await act(async () => {
    triggerClick(interpretBtn);
  });

  // Check that 2 drafts are rendered
  const draftCardsBefore = findElements(container, (el) => getNodeText(el).includes('Gasto') || getNodeText(el).includes('Tarea'));
  assert.ok(draftCardsBefore.length >= 2, 'Both Gasto and Tarea drafts must be visible');

  const allButtonsAfterParse = findElements(container, (el) => el.tagName === 'BUTTON');
  const confirmButtons = allButtonsAfterParse.filter((b) => getNodeText(b).includes('Confirmar') && !getNodeText(b).includes('todos'));
  assert.equal(confirmButtons.length, 2, 'Must have 2 individual confirm buttons for the 2 drafts');

  // Initial state check
  const initialTxCount = appState.finance.transactions.length;
  const initialExtrasCount = appState.todayExtras.length;

  // 2. Confirm the FIRST draft (finance draft "1200 nafta")
  await act(async () => {
    triggerClick(confirmButtons[0]);
  });

  // Verify: Exactly 1 transaction saved, task NOT saved yet
  assert.equal(appState.finance.transactions.length, initialTxCount + 1, 'Only draft 1 was saved to state');
  assert.equal(appState.todayExtras.length, initialExtrasCount, 'Draft 2 was not saved yet');
  assert.equal(closed, false, 'Modal must NOT close because 1 draft is still pending');

  // Verify only 1 draft remains visible in the tray
  const remainingConfirmButtons = findElements(container, (el) => el.tagName === 'BUTTON').filter(
    (b) => getNodeText(b).includes('Confirmar') && !getNodeText(b).includes('todos')
  );
  const allCurrentButtons = findElements(container, (el) => el.tagName === 'BUTTON').map((b) => getNodeText(b));
  assert.equal(
    remainingConfirmButtons.length,
    1,
    `Draft 2 must remain visible in tray. Found buttons: ${allCurrentButtons.join(' | ')}`
  );

  // 3. Trigger external state change: e.g. toggling a module or updating settings
  appState = structuredClone(appState);
  appState.settings.hiddenTabs = ['ia']; // Module settings change while capture modal is open

  await act(async () => {
    root.render(
      React.createElement(MobileQuickCapture, {
        open: true,
        onClose: handleClose,
        state: appState,
        onUpdateState: handleUpdateState,
      })
    );
  });

  // Verify: Draft 2 remains visible after external state change, NOT wiped!
  const buttonsAfterExternalChange = findElements(container, (el) => el.tagName === 'BUTTON').filter(
    (b) => getNodeText(b).includes('Confirmar') && !getNodeText(b).includes('todos')
  );
  assert.equal(buttonsAfterExternalChange.length, 1, 'Pending draft must NOT be wiped by external state change');

  // Confirm the second draft
  await act(async () => {
    triggerClick(buttonsAfterExternalChange[0]);
  });

  // Verify both are now saved
  assert.equal(appState.todayExtras.length, initialExtrasCount + 1, 'Draft 2 is now saved to state');
  assert.equal(closed, true, 'Modal closes once all drafts are confirmed');
});

test('LifeOS — Fase 4: MobileQuickCapture mounted persistence failure: retains draft on updateState=false, reattempt succeeds without duplicate', async () => {
  const mockDoc = setupMockDom();
  const container = mockDoc.createElement('div');
  mockDoc.body.appendChild(container);
  const root = createRoot(container);

  let appState: LifeOSState = defaultState();
  let failPersistence = true;

  const handleUpdateState = (updater: (draft: LifeOSState) => void): boolean => {
    const clone = structuredClone(appState);
    updater(clone);
    if (failPersistence) {
      return false;
    }
    appState = clone;
    return true;
  };

  await act(async () => {
    root.render(
      React.createElement(MobileQuickCapture, {
        open: true,
        onClose: () => {},
        state: appState,
        onUpdateState: handleUpdateState,
      })
    );
  });

  const universalInput = findElements(container, (el) => el.tagName === 'INPUT')[0];
  await act(async () => {
    triggerChange(universalInput, '1200 nafta');
  });

  const buttons = findElements(container, (el) => el.tagName === 'BUTTON');
  const interpretBtn = buttons.find((b) => getNodeText(b).includes('Interpretar'));
  await act(async () => {
    triggerClick(interpretBtn);
  });

  const initialTxCount = appState.finance.transactions.length;
  const initialBalance = appState.finance.accounts[0].balance;

  // Confirm with persistence failure
  const confirmBtn = findElements(container, (el) => el.tagName === 'BUTTON').find(
    (b) => getNodeText(b).includes('Confirmar') && !getNodeText(b).includes('todos')
  );
  assert.ok(confirmBtn, 'Confirm button must exist');

  await act(async () => {
    triggerClick(confirmBtn);
  });

  // Verify: State was NOT modified because updateState returned false!
  assert.equal(appState.finance.transactions.length, initialTxCount, 'Transactions must not change on persistence failure');
  assert.equal(appState.finance.accounts[0].balance, initialBalance, 'Balance must not change on persistence failure');

  // Verify: Draft was NOT removed from tray
  const draftsAfterFailure = findElements(container, (el) => el.tagName === 'BUTTON').filter(
    (b) => getNodeText(b).includes('Confirmar') && !getNodeText(b).includes('todos')
  );
  assert.equal(draftsAfterFailure.length, 1, 'Draft must be retained after persistence failure');

  // Now fix persistence and reattempt
  failPersistence = false;
  await act(async () => {
    triggerClick(draftsAfterFailure[0]);
  });

  // Verify: Exactly 1 transaction registered now, balance decreased exactly once
  assert.equal(appState.finance.transactions.length, initialTxCount + 1, 'Transaction must be registered once on retry');
  assert.equal(appState.finance.accounts[0].balance, initialBalance - 1200, 'Balance must decrease exactly once');
});
