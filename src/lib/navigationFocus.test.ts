import assert from 'node:assert/strict';
import test from 'node:test';
import {
  focusTargetElement,
  clearActiveTargetHighlight,
  prefersReducedMotion,
} from './navigationFocus';

function setupDomMock() {
  const elements = new Map<string, any>();
  const mutationCallbacks: Array<() => void> = [];

  class MockElement {
    id: string;
    classList: {
      _classes: Set<string>;
      add(cls: string): void;
      remove(cls: string): void;
      contains(cls: string): boolean;
    };
    scrollIntoViewCalls: any[] = [];

    constructor(id: string) {
      this.id = id;
      const set = new Set<string>();
      this.classList = {
        _classes: set,
        add: (cls: string) => set.add(cls),
        remove: (cls: string) => set.delete(cls),
        contains: (cls: string) => set.has(cls),
      };
    }

    scrollIntoView(options?: any) {
      this.scrollIntoViewCalls.push(options);
    }
  }

  class MockMutationObserver {
    callback: () => void;
    constructor(cb: () => void) {
      this.callback = cb;
      mutationCallbacks.push(cb);
    }
    observe() {}
    disconnect() {
      const idx = mutationCallbacks.indexOf(this.callback);
      if (idx !== -1) mutationCallbacks.splice(idx, 1);
    }
  }

  const prevDoc = (globalThis as any).document;
  const prevWin = (globalThis as any).window;
  const prevMO = (globalThis as any).MutationObserver;
  const prevRAF = (globalThis as any).requestAnimationFrame;
  const prevCAF = (globalThis as any).cancelAnimationFrame;

  let reducedMotion = false;

  (globalThis as any).window = {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce') ? reducedMotion : false,
    }),
  };

  (globalThis as any).document = {
    body: {},
    getElementById: (id: string) => elements.get(id) || null,
  };

  (globalThis as any).MutationObserver = MockMutationObserver;

  const rafCallbacks: Array<() => void> = [];
  (globalThis as any).requestAnimationFrame = (cb: () => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    rafCallbacks[id - 1] = () => {};
  };

  return {
    addElement(id: string) {
      const el = new MockElement(id);
      elements.set(id, el);
      // Trigger observers
      for (const cb of [...mutationCallbacks]) {
        cb();
      }
      return el;
    },
    triggerRaf() {
      const cbs = [...rafCallbacks];
      rafCallbacks.length = 0;
      for (const cb of cbs) {
        cb();
      }
    },
    setReducedMotion(val: boolean) {
      reducedMotion = val;
    },
    teardown() {
      clearActiveTargetHighlight();
      (globalThis as any).document = prevDoc;
      (globalThis as any).window = prevWin;
      (globalThis as any).MutationObserver = prevMO;
      (globalThis as any).requestAnimationFrame = prevRAF;
      (globalThis as any).cancelAnimationFrame = prevCAF;
    },
  };
}

test('focusTargetElement: immediate focus when element is already in DOM', () => {
  const env = setupDomMock();
  try {
    const el = env.addElement('item-123');
    let found = false;

    const cancel = focusTargetElement('item-123', {
      onFocusFound: () => {
        found = true;
      },
    });

    assert.equal(found, true, 'Callback onFocusFound should be called synchronously');
    assert.equal(el.scrollIntoViewCalls.length, 1);
    assert.deepEqual(el.scrollIntoViewCalls[0], { behavior: 'smooth', block: 'center' });
    assert.equal(el.classList.contains('lifeos-target-highlight'), true);

    cancel();
  } finally {
    env.teardown();
  }
});

test('focusTargetElement: respects prefers-reduced-motion with behavior auto', () => {
  const env = setupDomMock();
  try {
    env.setReducedMotion(true);
    assert.equal(prefersReducedMotion(), true);

    const el = env.addElement('item-reduced');
    focusTargetElement('item-reduced');

    assert.equal(el.scrollIntoViewCalls.length, 1);
    assert.deepEqual(el.scrollIntoViewCalls[0], { behavior: 'auto', block: 'center' });
  } finally {
    env.teardown();
  }
});

test('focusTargetElement: delayed resolution via MutationObserver without arbitrary setTimeout', () => {
  const env = setupDomMock();
  try {
    let foundEl: any = null;
    const cancel = focusTargetElement('delayed-item', {
      onFocusFound: (el) => {
        foundEl = el;
      },
    });

    assert.equal(foundEl, null, 'Should not find element before it mounts');

    // Element appears in DOM via React update
    const el = env.addElement('delayed-item');

    assert.equal(foundEl, el, 'Should resolve immediately upon DOM addition');
    assert.equal(el.classList.contains('lifeos-target-highlight'), true);
    assert.equal(el.scrollIntoViewCalls.length, 1);

    cancel();
  } finally {
    env.teardown();
  }
});

test('focusTargetElement: single highlight ring invariant on consecutive fast navigations', () => {
  const env = setupDomMock();
  try {
    const el1 = env.addElement('item-first');
    const el2 = env.addElement('item-second');

    focusTargetElement('item-first');
    assert.equal(el1.classList.contains('lifeos-target-highlight'), true);
    assert.equal(el2.classList.contains('lifeos-target-highlight'), false);

    // Rapid second click
    focusTargetElement('item-second');
    assert.equal(el1.classList.contains('lifeos-target-highlight'), false, 'Previous highlight must be cleared');
    assert.equal(el2.classList.contains('lifeos-target-highlight'), true, 'New highlight must be set');
  } finally {
    env.teardown();
  }
});

test('focusTargetElement: cancellation before element appears aborts focus', () => {
  const env = setupDomMock();
  try {
    let found = false;
    const cancel = focusTargetElement('never-arrives', {
      onFocusFound: () => {
        found = true;
      },
    });

    cancel();

    // Element mounts after cancel
    const el = env.addElement('never-arrives');
    assert.equal(found, false, 'Should not trigger callback after cancellation');
    assert.equal(el.classList.contains('lifeos-target-highlight'), false);
    assert.equal(el.scrollIntoViewCalls.length, 0);
  } finally {
    env.teardown();
  }
});
