import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const url = 'https://lifeos.test/';
const output = path.resolve('artifacts', 'audit-blocks-2026-10-24');
fs.mkdirSync(output, { recursive: true });
const portableHtml = fs.readFileSync(path.join(output, 'portable', 'index.html'));

const today = '2026-10-24';
const state = {
  profile: { name: 'Ana' },
  settings: { userName: 'Ana', onboardingCompleted: true, hiddenTabs: [], lastBackupAt: today, lastWeeklyReviewAt: today },
  calendarEvents: [
    { id: 'oct-real', name: 'Encuentro de octubre', date: today, type: 'reunion', time: '10:30', recurring: false },
    { id: 'jan-real', name: 'Encuentro de enero', date: '2027-01-20', type: 'reunion', time: '09:30', recurring: false },
    { id: 'annual', name: 'Aniversario sintético', date: '2024-01-20', type: 'aniversario', recurring: true },
  ],
  todayExtras: [], dailyPriorities: [], taskLog: {},
  agenda: { lunes: [], martes: [], miercoles: [], jueves: [], viernes: [], sabado: [], domingo: [] },
  tasksRecurring: [], projects: [],
  study: { subjects: [{ id: 'subject-1', name: 'Historia sintética' }], exams: [{ id: 'exam-1', title: 'Parcial sintético', date: '2027-01-20', time: '11:00', subjectId: 'subject-1', status: 'pendiente' }], studyLog: [] },
  finance: { accounts: [], transactions: [], commitments: [], agreements: [], budgets: {}, categories: [] },
};

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`${name} page error:`, error.message));
    page.on('console', (message) => { if (message.type() === 'error') console.error(`${name} console error:`, message.text()); });
    await page.clock.setFixedTime(new Date('2026-10-24T10:15:00-03:00'));
    await page.route('https://lifeos.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: portableHtml }));
    await page.addInitScript((fixture) => {
      if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(fixture));
      const NativeAudioContext = window.AudioContext;
      window.__audioAudit = { started: 0, stopped: 0 };
      window.AudioContext = class extends NativeAudioContext {
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source);
          const stop = source.stop.bind(source);
          source.start = (...args) => { window.__audioAudit.started++; return start(...args); };
          source.stop = (...args) => { window.__audioAudit.stopped++; return stop(...args); };
          return source;
        }
      };
    }, state);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.today-observatory-panel').waitFor();
    await page.locator('.today-hero').screenshot({ path: path.join(output, `hero-${name}.png`) });
    const boxes = await page.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      };
      const date = document.querySelector('.today-observatory-date');
      return { hero: rect('.today-hero'), panel: rect('.today-observatory-panel'), clock: rect('.today-observatory-clock'), image: rect('.hero-matterhorn-photo'), dateText: date?.textContent, dateTransform: date ? getComputedStyle(date).textTransform : null };
    });
    console.log(name, JSON.stringify(boxes));
    assert.equal(boxes.dateText, 'Sábado 24 de octubre de 2026');
    assert.ok(boxes.panel.x >= boxes.hero.x && boxes.panel.x + boxes.panel.width <= boxes.hero.x + boxes.hero.width);

    const nav = async (label) => {
      if (name === 'mobile') await page.getByRole('button', { name: 'Abrir menú' }).click();
      await page.getByRole('button', { name: label, exact: true }).click();
    };
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));

    await nav('Calendario');
    await page.getByRole('heading', { name: 'Calendario', exact: true }).waitFor();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Mes siguiente' }).click();
    const grid = page.getByRole('grid');
    await grid.waitFor();
    console.log(name, 'calendar grid:', await grid.getAttribute('aria-label'));
    await grid.getByRole('button', { name: /Miércoles 20 de enero/ }).click();
    assert.match(await grid.locator('button[aria-pressed="true"]').getAttribute('aria-label'), /20 de enero/);
    const chosenDay = page.locator('section[aria-live="polite"]');
    assert.match(await chosenDay.textContent(), /Parcial sintético/);
    assert.match(await chosenDay.textContent(), /Encuentro de enero/);
    const upcomingText = await page.locator('section').filter({ hasText: 'Próximos acontecimientos' }).last().textContent();
    assert.ok(!upcomingText.includes('Encuentro de octubre'));
    await page.screenshot({ path: path.join(output, `calendar-${name}.png`), fullPage: true });

    const beforeSelection = (await stored()).calendarEvents.length;
    await grid.getByRole('button', { name: /Jueves 21 de enero/ }).click();
    assert.equal((await stored()).calendarEvents.length, beforeSelection);
    await chosenDay.getByRole('button', { name: 'Agregar', exact: true }).click();
    assert.equal(await page.locator('#calendar-event-date').inputValue(), '2027-01-21');
    await page.locator('#calendar-event-name').fill('Cita sintética');
    await page.locator('#calendar-event-type').selectOption('cita');
    await page.locator('#calendar-event-time').fill('14:00');
    await page.getByLabel('Se repite cada año').check();
    await page.getByRole('button', { name: 'Guardar acontecimiento' }).click();
    let saved = await stored();
    let created = saved.calendarEvents.find((event) => event.name === 'Cita sintética');
    assert.ok(created?.id);
    assert.equal(created.date, '2027-01-21');
    assert.equal(created.time, '14:00');
    assert.equal(created.recurring, true);

    await chosenDay.getByRole('button', { name: 'Editar Cita sintética' }).click();
    await page.locator('#calendar-event-name').fill('Cita corregida');
    await page.locator('#calendar-event-date').fill('2027-01-22');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    saved = await stored();
    assert.equal(saved.calendarEvents.find((event) => event.id === created.id)?.date, '2027-01-22');
    assert.equal(saved.calendarEvents.find((event) => event.id === created.id)?.recurring, true);
    await chosenDay.getByRole('button', { name: 'Eliminar Cita corregida' }).click();
    saved = await stored();
    assert.equal(saved.calendarEvents.length, beforeSelection);
    assert.equal(saved.calendarEvents.some((event) => event.id === 'annual'), true);
    assert.equal(saved.study.exams.length, 1);
    assert.equal(saved.finance.transactions.length, 0);
    console.log(`${name} calendar flow: selected, created, edited, deleted, recurrence preserved`);

    await nav('Estudios');
    await page.getByRole('heading', { name: 'Estudios', exact: true }).waitFor();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(output, `studies-${name}.png`), fullPage: true });
    assert.ok(!(await page.locator('#qa-focus-timer').textContent()).includes('bloques de 25 min'));
    await page.getByRole('button', { name: '45 min' }).click();
    assert.match(await page.locator('#qa-focus-timer').textContent(), /Enfoque · 45 min/);
    await page.locator('#focus-subject-select').selectOption('subject-1');
    await page.getByRole('button', { name: /Iniciar Enfoque/ }).click();
    assert.equal((await stored()).study.activeSession.targetSubjectId, 'subject-1');
    assert.equal((await stored()).study.activeSession.plannedMinutes, 45);
    await page.getByRole('button', { name: /Pausar/ }).click();
    assert.equal((await stored()).study.activeSession.status, 'paused');
    await page.reload({ waitUntil: 'networkidle' });
    await nav('Estudios');
    await page.getByRole('button', { name: /Reanudar/ }).click();
    assert.equal((await stored()).study.activeSession.status, 'running');
    await page.clock.setFixedTime(new Date('2026-10-24T10:17:00-03:00'));
    await page.getByText('43:00').waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Terminar ahora' }).click();
    saved = await stored();
    assert.equal(saved.study.studyLog.length, 1);
    assert.equal(saved.study.studyLog[0].minutes, 2);
    assert.equal(saved.study.studyLog[0].subjectId, 'subject-1');
    assert.equal(saved.study.studyLog[0].sessionId != null, true);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await stored()).study.studyLog.length, 1);
    await nav('Estudios');
    const originalLogId = (await stored()).study.studyLog[0].id;
    await page.getByRole('button', { name: 'Corregir registro' }).click();
    const correction = page.getByRole('dialog', { name: 'Corregir registro de estudio' });
    await correction.getByRole('spinbutton').fill('30');
    await correction.getByRole('combobox').selectOption('');
    await correction.locator('input[type="date"]').fill('2026-10-23');
    await correction.getByRole('button', { name: 'Guardar corrección' }).click();
    saved = await stored();
    assert.equal(saved.study.studyLog[0].id, originalLogId);
    assert.equal(saved.study.studyLog[0].sessionId != null, true);
    assert.equal(saved.study.studyLog[0].minutes, 30);
    assert.equal(saved.study.studyLog[0].subjectId, null);
    assert.equal(saved.study.studyLog[0].date, '2026-10-23');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Eliminar registro' }).click();
    assert.equal((await stored()).study.studyLog.length, 0);
    console.log(`${name} study flow: pause, reload, resume, early finish, correction and confirmed deletion`);

    await page.getByRole('button', { name: 'Ajustar canales' }).click();
    await page.getByRole('button', { name: /Lluvia \+ Ruido marrón/ }).click();
    await page.getByRole('button', { name: /Escuchar ahora/ }).click();
    await page.getByText('Sonando en vivo').waitFor({ timeout: 5000 });
    let audio = await page.evaluate(() => window.__audioAudit);
    assert.equal(audio.started - audio.stopped, 2);
    await page.getByLabel('Volumen de lluvia').fill('0.25');
    await page.getByLabel('Volumen de ruido marrón').fill('0.75');
    await page.getByRole('button', { name: /Detener sonido/ }).click();
    audio = await page.evaluate(() => window.__audioAudit);
    assert.equal(audio.started - audio.stopped, 0);
    await page.reload({ waitUntil: 'networkidle' });
    await nav('Estudios');
    await page.getByRole('button', { name: 'Ajustar canales' }).click();
    assert.equal(await page.getByLabel('Volumen de lluvia').inputValue(), '0.25');
    assert.equal(await page.getByLabel('Volumen de ruido marrón').inputValue(), '0.75');
    await page.getByRole('button', { name: /Iniciar Enfoque/ }).click();
    await page.getByText('Sonando en vivo').waitFor({ timeout: 5000 });
    audio = await page.evaluate(() => window.__audioAudit);
    assert.equal(audio.started - audio.stopped, 2);
    await page.getByRole('button', { name: /Pausar/ }).click();
    audio = await page.evaluate(() => window.__audioAudit);
    assert.equal(audio.started - audio.stopped, 0);
    await page.getByRole('button', { name: /Reanudar/ }).click();
    await page.getByText('Sonando en vivo').waitFor({ timeout: 5000 });
    await nav('Calendario');
    audio = await page.evaluate(() => window.__audioAudit);
    assert.equal(audio.started - audio.stopped, 0);
    console.log(`${name} audio flow: two channels, volumes, pause/resume, module teardown and saved config`);
    await context.close();
  }

  for (const scenario of [
    { phase: 'focus', cycle: 1, nextPhase: 'short_break', nextCycle: 1, expectedLogs: 1 },
    { phase: 'short_break', cycle: 1, nextPhase: 'focus', nextCycle: 2, expectedLogs: 0 },
    { phase: 'long_break', cycle: 4, nextPhase: 'focus', nextCycle: 1, expectedLogs: 0 },
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-24T10:15:00-03:00'));
    await page.route('https://lifeos.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: portableHtml }));
    const sessionId = `cycle-${scenario.phase}`;
    const fixture = structuredClone(state);
    fixture.study.activeSession = {
      id: sessionId, targetSubjectId: 'subject-1', targetSubjectName: 'Historia sintética',
      plannedMinutes: scenario.phase === 'focus' ? 25 : scenario.phase === 'short_break' ? 5 : 15,
      startedAt: Date.parse('2026-10-24T10:14:00-03:00'),
      status: 'running', endsAt: Date.parse('2026-10-24T10:15:02-03:00'),
      remainingSeconds: 2, lastTickAt: Date.parse('2026-10-24T10:15:00-03:00'),
      phase: scenario.phase, cycle: scenario.cycle, totalCycles: 4,
      focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
    };
    await page.addInitScript((initial) => localStorage.setItem('lifeos-state-v1', JSON.stringify(initial)), fixture);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Estudios', exact: true }).click();
    await page.getByText('00:02').waitFor();
    await page.clock.setFixedTime(new Date('2026-10-24T10:15:03-03:00'));
    await page.waitForFunction((id) => {
      const session = JSON.parse(localStorage.getItem('lifeos-state-v1')).study.activeSession;
      return session && session.id !== id;
    }, sessionId);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
    assert.equal(saved.study.studyLog.length, scenario.expectedLogs);
    assert.equal(saved.study.activeSession.phase, scenario.nextPhase);
    assert.equal(saved.study.activeSession.cycle, scenario.nextCycle);
    assert.equal(saved.study.activeSession.targetSubjectId, 'subject-1');
    console.log(`cycle ${scenario.phase}: ${scenario.nextPhase}, ${scenario.expectedLogs} study logs`);
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Montevideo', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-24T10:15:00-03:00'));
    await page.route('https://lifeos.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: portableHtml }));
    const fixture = structuredClone(state);
    fixture.study.activeSession = {
      id: 'interrupted-focus', targetSubjectId: 'subject-1', targetSubjectName: 'Historia sintética',
      plannedMinutes: 25, startedAt: Date.parse('2026-10-24T09:15:00-03:00'),
      status: 'running', endsAt: Date.parse('2026-10-24T09:40:00-03:00'),
      remainingSeconds: 0, lastTickAt: Date.parse('2026-10-24T09:27:00-03:00'),
      phase: 'focus', cycle: 1, totalCycles: 4,
    };
    await page.addInitScript((initial) => localStorage.setItem('lifeos-state-v1', JSON.stringify(initial)), fixture);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Revisar en Estudios' }).click();
    await page.getByLabel('Minutos efectivamente estudiados').fill('12');
    await page.getByRole('button', { name: 'Registrar tiempo', exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')));
    assert.equal(saved.study.studyLog.length, 1);
    assert.equal(saved.study.studyLog[0].minutes, 12);
    assert.equal(saved.study.studyLog[0].sessionId, 'interrupted-focus');
    console.log('interrupted session: explicit effective minutes and no automatic full credit');
    await context.close();
  }
} finally {
  await browser.close();
}
