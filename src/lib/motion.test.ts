import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { routineScheduledFor, todayItems } from './calculations';
import { dayKeyFromDate, defaultState } from './storage';
import { motionItemKey, shouldPlayCompletionMotion } from './motion';

test('completion motion only acknowledges a pending-to-completed transition', () => {
  assert.equal(shouldPlayCompletionMotion(false, true), true);
  assert.equal(shouldPlayCompletionMotion(true, true), false);
  assert.equal(shouldPlayCompletionMotion(true, false), false);
  assert.equal(shouldPlayCompletionMotion(false, false), false);
});

test('motion item keys are stable and prefer persisted ids', () => {
  assert.equal(motionItemKey('exercise-1', 'set-1', 0), 'set-1');
  assert.equal(motionItemKey('exercise-1', undefined, 2), 'exercise-1-2');
});

test('Agenda completion and Hoy read the same taskLog entry without duplicating state', () => {
  const iso = '2026-10-14';
  const state = defaultState();
  const day = dayKeyFromDate(new Date(`${iso}T00:00:00`));
  state.agenda[day] = [{
    id: 'agenda-motion-task',
    time: '18:00',
    activity: 'Preparar revisión semanal',
    effort: 'medium',
  }];
  state.tasksRecurring = [{
    id: 'routine-motion-task',
    name: 'Repasar prioridades',
    freq: 'daily',
    effort: 'medium',
  }];

  assert.equal(routineScheduledFor(state, state.tasksRecurring[0], iso), true);
  assert.deepEqual(
    Object.fromEntries(todayItems(state, iso, false).map(({ id, done }) => [id, done])),
    {
      'agenda-motion-task': false,
      'routine-motion-task': false,
    },
  );

  state.taskLog[iso] = {
    'agenda-motion-task': true,
    'routine-motion-task': true,
  };
  assert.deepEqual(
    Object.fromEntries(todayItems(state, iso, false).map(({ id, done }) => [id, done])),
    {
      'agenda-motion-task': true,
      'routine-motion-task': true,
    },
  );

  state.taskLog[iso]['agenda-motion-task'] = false;
  assert.equal(todayItems(state, iso, false).find((item) => item.id === 'agenda-motion-task')?.done, false);
  assert.equal(shouldPlayCompletionMotion(true, false), false);
});

test('the original LifeOS violet micro-check Lottie assets are LF-normalized and hash-verified', async () => {
  const [normalBytes, fastBytes] = await Promise.all([
    readFile(new URL('../../public/motion/lifeos-micro-check-violet.json', import.meta.url)),
    readFile(new URL('../../public/motion/lifeos-micro-check-fast-violet.json', import.meta.url)),
  ]);

  assert.equal(normalBytes.includes(0x0d), false, 'lifeos-micro-check-violet.json must use LF line endings');
  assert.equal(fastBytes.includes(0x0d), false, 'lifeos-micro-check-fast-violet.json must use LF line endings');

  assert.equal(
    createHash('sha256').update(normalBytes).digest('hex'),
    'be037d6e734e650ba762884cde3072d514f7241f85b5b1809694b5ae7d4ed85f',
  );
  assert.equal(
    createHash('sha256').update(fastBytes).digest('hex'),
    'd008c1ed4e7f00865d3ac41cfb375871d9bc952f2abe4be23a4351eb12196940',
  );

  for (const bytes of [normalBytes, fastBytes]) {
    const animation = JSON.parse(bytes.toString('utf8')) as {
      w: number;
      h: number;
      fr: number;
      ip: number;
      op: number;
      assets?: Array<{ p?: string }>;
    };
    assert.deepEqual([animation.w, animation.h], [240, 240]);
    assert.ok((animation.op - animation.ip) / animation.fr > 0 && (animation.op - animation.ip) / animation.fr <= 1);
    assert.equal(animation.assets?.some((asset) => Boolean(asset.p)), false);
  }
});

test('the original LifeOS Gym workout success Lottie JSON replaces the unlicensed .lottie archive', async () => {
  const legacyUrl = new URL('../../public/motion/gym-workout-success.lottie', import.meta.url);
  assert.equal(existsSync(legacyUrl), false, 'legacy unlicensed gym-workout-success.lottie must be removed');

  const bytes = await readFile(new URL('../../public/motion/gym-workout-success.json', import.meta.url));
  assert.equal(bytes.includes(0x0d), false, 'gym-workout-success.json must use LF line endings');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'b56d6fe37fa8d25c30d84ba25bd1697053f49e45271c820f35b23f52f3df6dd3',
  );

  const animation = JSON.parse(bytes.toString('utf8')) as {
    w: number;
    h: number;
    fr: number;
    ip: number;
    op: number;
    nm?: string;
    assets?: Array<{ p?: string }>;
  };
  assert.equal(animation.nm, 'lifeos-gym-workout-success');
  assert.deepEqual([animation.w, animation.h], [240, 240]);
  assert.equal(animation.assets?.some((asset) => Boolean(asset.p)), false);
});

test('the approved PR trophy and streak flame assets remain byte-for-byte intact', async () => {
  const [trophy, flame] = await Promise.all([
    readFile(new URL('../../public/motion/gym-pr-trophy.lottie', import.meta.url)),
    readFile(new URL('../../public/motion/gym-streak-fire.lottie', import.meta.url)),
  ]);

  assert.equal(createHash('sha256').update(trophy).digest('hex'), '6c484a86f18e0d4fec28f0ef607c64b6d25c1719fc64bf37678956b820feb6c2');
  assert.equal(createHash('sha256').update(flame).digest('hex'), '124c88699a34a05129866abaa4c0932ec85338a3a8208de27fcf22872f850df7');
});

test('LifeOSLottie advances celebrations from the real dotLottie complete event', async () => {
  const source = await readFile(new URL('../components/visual/LifeOSLottie.tsx', import.meta.url), 'utf8');

  assert.match(source, /dotLottieRefCallback=\{setPlayer\}/);
  assert.match(source, /addEventListener\('complete', handleComplete\)/);
  assert.match(source, /removeEventListener\('complete', handleComplete\)/);
  assert.doesNotMatch(source, /onComplete=\{onComplete\}/);
});

test('the three approved task and routine completion assets remain byte-for-byte intact', async () => {
  const [pendingSvg, completedSvg, completionJson] = await Promise.all([
    readFile(new URL('../../public/motion/lifeos-task-pending.svg', import.meta.url)),
    readFile(new URL('../../public/motion/lifeos-task-completed.svg', import.meta.url)),
    readFile(new URL('../../public/motion/lifeos-task-completion.json', import.meta.url)),
  ]);

  assert.equal(createHash('sha256').update(pendingSvg).digest('hex'), 'bd4a4bb182c0187fd0ba8cefc5238f3600b3900bd3db5c2565228c4186f24948');
  assert.equal(createHash('sha256').update(completedSvg).digest('hex'), '5f95c6d93ff70fa9bb3787d3a5edc1d4642b228832d2384447e997161b1cf0be');
  assert.equal(createHash('sha256').update(completionJson).digest('hex'), '4a52841849428e3d60a077dd9ca2fcf7dd96a6a69ce14e54ad016bf59a500989');

  const pendingStr = pendingSvg.toString('utf8');
  assert.match(pendingStr, /width="50px"/);
  assert.match(pendingStr, /height="50px"/);
  assert.match(pendingStr, /#4f46e5/);

  const completedStr = completedSvg.toString('utf8');
  assert.match(completedStr, /width="50px"/);
  assert.match(completedStr, /height="50px"/);
  assert.match(completedStr, /#4f46e5/);

  const lottie = JSON.parse(completionJson.toString('utf8')) as {
    w: number;
    h: number;
    fr: number;
    ip: number;
    op: number;
  };
  assert.equal(lottie.w, 50);
  assert.equal(lottie.h, 50);
  assert.equal(lottie.fr, 24);
  assert.equal(lottie.ip, 0);
  assert.equal(lottie.op, 15);
});

test('CompletionCheckMark wires the three approved assets with full motion fidelity and reduced-motion guard', async () => {
  const source = await readFile(new URL('../components/visual/CompletionCheckMark.tsx', import.meta.url), 'utf8');

  assert.match(source, /TASK_PENDING_SVG_SRC = '\/motion\/lifeos-task-pending\.svg'/);
  assert.match(source, /TASK_COMPLETED_SVG_SRC = '\/motion\/lifeos-task-completed\.svg'/);
  assert.match(source, /TASK_COMPLETION_LOTTIE_SRC = '\/motion\/lifeos-task-completion\.json'/);
  assert.match(source, /prefersReducedMotion/);
  assert.match(source, /speed=\{1\}/);
  assert.doesNotMatch(source, /segment=\{/);
  assert.doesNotMatch(source, /VIOLET_CHECK_DRAW_SEGMENT=\{/);
});

