import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppIcon } from '../components/AppIcon';
import { NAV_ITEMS } from '../components/Sidebar';

test('AppIcon renders unified Lucide stroke icons with strokeWidth 1.75 and requested dimensions', () => {
  const html = renderToStaticMarkup(React.createElement(AppIcon, {
    name: 'touchpad', className: 'h-6 w-6 text-white',
  }));
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.match(html, /fill="none"/);
  assert.match(html, /stroke="currentColor"/);
  assert.match(html, /stroke-width="1\.75"/);
  assert.match(html, /class="[^"]*h-6 w-6 text-white[^"]*"/);
  assert.match(html, /data-app-icon="touchpad"/);
  assert.doesNotMatch(html, /fill="#|stroke="#/);
});

test('labelled icons are exposed and decorative icons stay hidden', () => {
  const labelled = renderToStaticMarkup(React.createElement(AppIcon, {
    name: 'pin', 'aria-label': 'Nota fijada',
  }));
  assert.match(labelled, /role="img"/);
  assert.match(labelled, /aria-label="Nota fijada"/);
  assert.doesNotMatch(labelled, /aria-hidden="true"/);
  const decorative = renderToStaticMarkup(React.createElement(AppIcon, { name: 'store' }));
  assert.match(decorative, /aria-hidden="true"/);
  assert.match(decorative, /focusable="false"/);
});

test('all Sidebar NAV_ITEMS icons share unified Lucide strokeWidth 1.75 rendering', () => {
  for (const item of NAV_ITEMS) {
    const html = renderToStaticMarkup(React.createElement(AppIcon, { name: item.icon, className: 'h-[18px] w-[18px]' }));
    assert.match(html, /viewBox="0 0 24 24"/, `Expected 24x24 viewBox for ${item.label}`);
    assert.match(html, /stroke-width="1\.75"/, `Expected stroke-width 1.75 for ${item.label}`);
    assert.match(html, /fill="none"/, `Expected stroke icon for ${item.label}`);
  }
});
