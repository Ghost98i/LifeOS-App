import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { dayKeyFromDate, defaultState, todayISO } from '../lib/storage';
import { DashboardView } from './DashboardView';
import { CompletionCheck } from './ui/CompletionCheck';

class TestNode {
  nodeType: number;
  nodeName: string;
  childNodes: TestNode[] = [];
  parentNode: TestNode | null = null;
  ownerDocument: TestDocument | null = null;
  nodeValue = '';

  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  appendChild(child: TestNode): TestNode {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: TestNode): TestNode {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(child: TestNode, ref: TestNode | null): TestNode {
    child.parentNode = this;
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx >= 0) this.childNodes.splice(idx, 0, child);
    else this.childNodes.push(child);
    return child;
  }
}

class TestElement extends TestNode {
  tagName: string;
  attributes = new Map<string, string>();
  style: Record<string, string> = {};

  constructor(tag: string, doc: TestDocument) {
    super(1, tag.toUpperCase());
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
  }

  setAttribute(key: string, value: string): void {
    this.attributes.set(key, String(value));
  }

  setAttributeNS(_ns: string | null, key: string, value: string): void {
    this.attributes.set(key, String(value));
  }

  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
  }

  removeAttribute(key: string): void {
    this.attributes.delete(key);
  }

  get className(): string {
    return this.getAttribute('class') ?? '';
  }

  set className(value: string) {
    this.setAttribute('class', value);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

class TestDocument {
  nodeType = 9;
  documentElement: TestElement;
  body: TestElement;
  activeElement: TestElement | null = null;
  defaultView = { HTMLIFrameElement: class {} };

  constructor() {
    this.documentElement = new TestElement('html', this);
    this.body = new TestElement('body', this);
  }

  createElement(tag: string): TestElement {
    return new TestElement(tag, this);
  }

  createElementNS(_ns: string, tag: string): TestElement {
    return new TestElement(tag, this);
  }

  createTextNode(text: string): TestNode {
    const node = new TestNode(3, '#text');
    node.nodeValue = text;
    node.ownerDocument = this;
    return node;
  }

  createComment(text: string): TestNode {
    const node = new TestNode(8, '#comment');
    node.nodeValue = text;
    node.ownerDocument = this;
    return node;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

function collectElements(node: TestNode, out: TestElement[] = []): TestElement[] {
  if (node instanceof TestElement) out.push(node);
  for (const child of node.childNodes) collectElements(child, out);
  return out;
}

async function withMountedDom(run: (doc: TestDocument) => Promise<void>): Promise<void> {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevActEnv = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;

  const doc = new TestDocument();
  Object.assign(globalThis, {
    window: globalThis,
    document: doc,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  try {
    await run(doc);
  } finally {
    if (prevWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else globalThis.window = prevWindow;
    if (prevDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
    else globalThis.document = prevDocument;
    if (prevActEnv === undefined) Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    else (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
  }
}

test('CompletionCheck: render SSR en estado pendiente y completado sin errores ni botones anidados', () => {
  const pendingMd = renderToStaticMarkup(<CompletionCheck checked={false} size="md" />);
  assert.match(pendingMd, /^<span\b/);
  assert.doesNotMatch(pendingMd, /<button\b/);
  assert.match(pendingMd, /data-state="unchecked"/);
  assert.match(pendingMd, /data-animating="false"/);
  assert.match(pendingMd, /h-5 w-5/);
  assert.match(pendingMd, /border-slate-300/);
  assert.match(pendingMd, /dark:border-slate-500\/50/);
  assert.match(pendingMd, /group-hover:border-\[#4F46E5\]/);
  assert.match(pendingMd, /active:scale-90/);
  assert.doesNotMatch(pendingMd, /<svg\b/);
  assert.doesNotMatch(pendingMd, /completion-check--animate/);

  const completedSm = renderToStaticMarkup(<CompletionCheck checked={true} size="sm" />);
  assert.match(completedSm, /data-state="checked"/);
  assert.match(completedSm, /data-animating="false"/);
  assert.match(completedSm, /h-\[18px\] w-\[18px\]/);
  assert.match(completedSm, /bg-\[#4F46E5\]/);
  assert.match(completedSm, /stroke="#FFFFFF"/);
  assert.match(completedSm, /stroke-width="2\.5"/);
  assert.match(completedSm, /stroke-linecap="round"/);
  assert.match(completedSm, /stroke-linejoin="round"/);
  assert.doesNotMatch(completedSm, /completion-check--animate/);
  assert.doesNotMatch(completedSm, /completion-check-tick--animate/);
  assert.doesNotMatch(completedSm, /completion-check-halo/);

  const standalone = renderToStaticMarkup(<CompletionCheck checked={true} label="Completado" />);
  assert.match(standalone, /role="img"/);
  assert.match(standalone, /aria-label="Completado"/);
});

test('CompletionCheck: montar con checked={true} NO activa la clase de animación ni al re-renderizar', async () => {
  await withMountedDom(async (doc) => {
    const container = doc.createElement('div');
    const root = createRoot(container as unknown as HTMLElement);

    try {
      await act(async () => {
        root.render(<CompletionCheck checked={true} size="md" />);
      });

      const el = container.childNodes[0] as TestElement;
      assert.equal(el.getAttribute('data-state'), 'checked');
      assert.equal(el.getAttribute('data-animating'), 'false');
      assert.equal(el.className.includes('completion-check--animate'), false);
      assert.equal(
        collectElements(el).some((child) => child.className.includes('completion-check-halo')),
        false
      );

      // Re-rendering an already completed item must never trigger animation either.
      await act(async () => {
        root.render(<CompletionCheck checked={true} size="md" className="extra-cls" />);
      });

      assert.equal(el.getAttribute('data-animating'), 'false');
      assert.equal(el.className.includes('completion-check--animate'), false);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});

test('CompletionCheck: pasar de checked={false} a checked={true} activa la animación y desmarcar la limpia sin rebote', async () => {
  await withMountedDom(async (doc) => {
    const container = doc.createElement('div');
    const root = createRoot(container as unknown as HTMLElement);

    try {
      await act(async () => {
        root.render(<CompletionCheck checked={false} size="md" />);
      });

      const el = container.childNodes[0] as TestElement;
      assert.equal(el.getAttribute('data-state'), 'unchecked');
      assert.equal(el.getAttribute('data-animating'), 'false');
      assert.equal(el.className.includes('completion-check--animate'), false);

      // Live false -> true transition activates circle pop, SVG draw, and subtle indigo halo.
      await act(async () => {
        root.render(<CompletionCheck checked={true} size="md" />);
      });

      assert.equal(el.getAttribute('data-state'), 'checked');
      assert.equal(el.getAttribute('data-animating'), 'true');
      assert.equal(el.className.includes('completion-check--animate'), true);

      const descendants = collectElements(el);
      assert.equal(
        descendants.some((child) => child.className.includes('completion-check-halo')),
        true,
        'Debe renderizar el halo índigo sutil durante la transición false -> true'
      );
      assert.equal(
        descendants.some((child) => child.className.includes('completion-check-tick--animate')),
        true,
        'Debe activar la clase check-draw en el <path> del tick SVG'
      );

      // Unchecking (true -> false) immediately clears animated classes without bounce.
      await act(async () => {
        root.render(<CompletionCheck checked={false} size="md" />);
      });

      assert.equal(el.getAttribute('data-state'), 'unchecked');
      assert.equal(el.getAttribute('data-animating'), 'false');
      assert.equal(el.className.includes('completion-check--animate'), false);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});

test('Hoy: Tu día y HÁBITOS DE HOY unifican CompletionCheck y el atenuado de completado no opaca al check', async () => {
  const state = defaultState();
  const today = todayISO();
  const dayKey = dayKeyFromDate(new Date(`${today}T12:00:00`));

  state.agenda[dayKey] = [
    { id: 'blk-done', time: '08:00', activity: 'Lectura matinal' },
    { id: 'blk-pending', time: '11:00', activity: 'Planificar semana' },
  ];
  state.tasksRecurring = [
    { id: 'hab-done', name: 'Tomar agua', freq: 'daily' },
    { id: 'hab-pending', name: 'Caminar 15 min', freq: 'daily' },
  ];
  state.taskLog[today] = {
    'blk-done': true,
    'hab-done': true,
  };

  const html = renderToStaticMarkup(
    <DashboardView
      state={state}
      onUpdateState={() => true}
      onNavigate={() => {}}
      onExportJSON={() => {}}
      nowOverride={new Date(`${today}T10:00:00`)}
    />
  );

  // Tu día uses size="md" and Hábitos de hoy uses size="sm"
  assert.match(html, /data-completion-check="true" data-size="md" data-state="checked" data-animating="false"/);
  assert.match(html, /data-completion-check="true" data-size="md" data-state="unchecked" data-animating="false"/);
  assert.match(html, /data-completion-check="true" data-size="sm" data-state="checked" data-animating="false"/);
  assert.match(html, /data-completion-check="true" data-size="sm" data-state="unchecked" data-animating="false"/);

  // Completed row wrapper in Tu día must NOT carry opacity-70 (only text/metadata does)
  const agendaRowMatches = html.match(/<div[^>]*class="today-agenda-entry[^"]*"/g) || [];
  assert.ok(agendaRowMatches.length >= 2);
  for (const rowTag of agendaRowMatches) {
    assert.doesNotMatch(rowTag, /opacity-70/, 'El contenedor de fila que envuelve a CompletionCheck nunca debe llevar opacity-70');
  }

  // No translucent indigo check left in Hábitos de hoy
  assert.doesNotMatch(html, /bg-indigo-600\/80/);
  assert.doesNotMatch(html, /dark:bg-indigo-500\/80/);

  // CSS keyframes, Bloque 13 timings & prefers-reduced-motion guard exist in src/index.css
  const css = await readFile(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /@keyframes check-pop[\s\S]*scale\(0\.82\)[\s\S]*scale\(1\.12\)/);
  assert.match(css, /animation:\s*check-pop 340ms cubic-bezier\(0\.34, 1\.56, 0\.64, 1\) both/);
  assert.match(css, /@keyframes check-draw/);
  assert.match(css, /animation:\s*check-draw 280ms ease-out 60ms both/);
  assert.match(css, /@keyframes check-halo[\s\S]*opacity:\s*0\.45[\s\S]*scale\(1\.65\)/);
  assert.match(css, /animation:\s*check-halo 440ms ease-out forwards/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.completion-check--animate/);
});
