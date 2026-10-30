import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppIcon } from '../components/AppIcon';

test('Icons8 icons retain dynamic color, original proportions and requested dimensions', () => {
  const html = renderToStaticMarkup(React.createElement(AppIcon, {
    name: 'touchpad', className: 'h-6 w-6 text-white',
  }));
  assert.match(html, /viewBox="0 0 50 50"/);
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /class="h-6 w-6 text-white"/);
  assert.match(html, /<path /);
  assert.doesNotMatch(html, /width="50px"|fill="#/);
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

test('existing fallback icons keep their stroke rendering', () => {
  const html = renderToStaticMarkup(React.createElement(AppIcon, { name: 'x' }));
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.match(html, /fill="none"/);
  assert.match(html, /stroke="currentColor"/);
  assert.match(html, /<path /);
});
