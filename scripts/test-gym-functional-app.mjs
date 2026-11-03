import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { defaultState, normalizeStoredState } from '../src/lib/storage.ts';
import { getExerciseGhostValues } from '../src/lib/gymMetrics.ts';

const before = process.argv.includes('--before');
const progressOnly = process.argv.includes('--progress-only');
const output = `artifacts/gym-functional-closure/${before ? 'before' : progressOnly ? 'progress' : 'after'}`;
await fs.mkdir(output, { recursive: true });
const root = path.resolve('dist');
const sources = await Promise.all((await fs.readdir(path.join(root, 'assets'))).filter(n => n.endsWith('.js')).map(n => fs.readFile(path.join(root, 'assets', n), 'utf8')));
assert.ok(sources.some(s => /VITE_FIREBASE_PROJECT_ID["']?\s*:\s*["']demo-lifeos["']/.test(s)), 'Only an explicit demo build is allowed');
assert.ok(sources.every(s => !/gymRefinementState|tests\/gym-refinement/.test(s)), 'The application build must exclude fixture hooks');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    let file = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    assert.ok(file === root || file.startsWith(root + path.sep));
    if (!path.extname(file)) file = path.join(root, 'index.html');
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(await fs.readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
const now = new Date('2026-11-02T18:35:00-03:00').getTime();
const results = [], errors = [], external = [];
let lastPage;
function seed(active = false, rest = false) {
  const state = defaultState();
  state.settings.onboardingCompleted = true; state.settings.hiddenTabs = [];
  state.gym.routineTemplates = [{ id: 'plan', name: 'Plan sintético', exercises: [
    { id: 'press', name: 'Press banca', equipment: 'barra', barWeight: 20, timerEnabled: false, restSecondsMode: 'custom', restSeconds: 75, sets: [
      { id: 'warm', type: 'warmup', weight: 20, reps: 12, completed: false },
      { id: 'work', type: 'normal', weight: 60, reps: 8, completed: false },
    ] },
    { id: 'floor', name: 'Sentadilla corporal', equipment: 'corporal', timerEnabled: true, restSecondsMode: 'inherit', weight: 0, sets: [{ id: 'floor-set', weight: 0, reps: 12, completed: false }] },
  ] }];
  state.gym.sessions = []; state.gym.weight = []; state.gym.measurements = []; state.gym.restDays = [];
  state.gym.settings = { restBetweenSetsSeconds: 90, restBetweenExercisesSeconds: 120, autoTimerEnabled: true, showQuickRestAdjustments: true, allowManualRestEditing: true };
  if (active) {
    state.gym.sessions = [{ id: 'active', date: '2026-11-02', startedAt: '18:30', status: 'active', weekLabel: 'Sesión sintética', exercises: structuredClone(state.gym.routineTemplates[0].exercises) }];
    if (rest) {
      state.gym.sessions[0].exercises[0].sets[0].completed = true;
      state.gym.activeTimer = { sessionId: 'active', exerciseId: 'press', exerciseIndex: 0, setId: 'warm', kind: 'set', endsAt: now + 20000, durationSeconds: 20, pausedAt: now, remainingSecondsWhenPaused: 20 };
    }
  }
  return normalizeStoredState(state);
}
try {
  for (const [width, height] of (before ? [[1440, 900]] : [[1440, 900], [390, 844], [375, 812]])) for (const theme of (before ? ['light'] : ['light', 'dark'])) {
    const contexts = [];
    const open = async value => {
      value.settings.darkMode = theme === 'dark';
      const context = await browser.newContext({ viewport: { width, height }, locale: 'es-UY', timezoneId: 'America/Montevideo', serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context);
      await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(route.request().url()); return route.abort(); });
      const page = await context.newPage(); lastPage = page; page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
      await page.clock.setFixedTime(new Date(now));
      await page.addInitScript(state => {
        if (!localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
        localStorage.setItem('lifeos_offline_ready_ack', 'true'); localStorage.setItem('lifeos_dismissed_anywhere_banner', '1');
      }, value);
      await page.goto(`${origin}/?view=gimnasio`); await page.locator('[data-active-workout-view], [data-gym-launcher]').first().waitFor();
      return page;
    };
    const snapshot = page => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos-state-v1')).gym);
    const failSave = page => page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.gymRestoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) { if (key === 'lifeos-state-v1') throw new DOMException('Synthetic failure', 'QuotaExceededError'); return original.call(this, key, value); };
    });
    const restore = page => page.evaluate(() => window.gymRestoreStorage());
    const routines = async page => {
      await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: 'Rutinas', exact: true }).click();
      await page.locator('[data-gym-routines]').waitFor();
    };
    const edit = async page => { await routines(page); await page.getByRole('button', { name: 'Editar', exact: true }).first().click(); return page.locator('[data-gym-routine-editor]'); };
    const observations = { width, theme };

    const verifyProgress = async () => {
      const value = seed();
      value.gym.sessions = [['prior', '2026-10-01', 50], ['recent', '2026-11-01', 65], ['future', '2026-11-10', 900]].map(([id, date, weight]) => ({
        id, date, status: 'completed', exercises: [{ id: 'press', name: 'Press banca', equipment: 'barra', sets: [
          { id: `${id}-warm`, type: 'warmup', weight: 2000, reps: 100, completed: true },
          { id: `${id}-work`, weight, reps: 8, completed: true },
          { id: `${id}-pending`, weight: 900, reps: 100, completed: false },
        ] }],
      }));
      const progressPage = await open(value); const original = await snapshot(progressPage);
      await progressPage.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Progreso/ }).click();
      await progressPage.getByText('Tu mejor serie reciente superó el período anterior.', { exact: false }).waitFor();
      await progressPage.locator('summary').filter({ hasText: 'Récords personales' }).click();
      const records = progressPage.locator('section').filter({ has: progressPage.getByRole('heading', { name: 'Récords Personales (PRs)', exact: true }) });
      const text = await records.innerText(); assert.match(text, /65/); assert.doesNotMatch(text, /2000|900/);
      assert.deepEqual(await snapshot(progressPage), original, 'Reading progress does not rewrite history');
      assert.equal(await progressPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await progressPage.screenshot({ path: `${output}/${width}-${theme}-progress.png`, fullPage: true });
      return { historicalComparison: true, recordsIgnoreWarmupsPendingAndFuture: true, noReadWrites: true };
    };
    if (progressOnly) {
      observations.progress = await verifyProgress(); results.push(observations);
      for (const context of contexts) await context.close();
      console.log(`Verified ${width}px ${theme}: historical progress and real records`);
      continue;
    }

    // A real storage rejection must not be followed by a successful deletion toast.
    let page = await open(seed()); let editor = await edit(page);
    await failSave(page); await editor.getByRole('button', { name: 'Eliminar', exact: true }).first().click();
    observations.rejectedDeletion = { exerciseCount: (await snapshot(page)).routineTemplates[0].exercises.length, falseSuccess: (await page.locator('body').innerText()).includes('Ejercicio eliminado de la plantilla.') };
    if (!before) {
      assert.deepEqual(observations.rejectedDeletion, { exerciseCount: 2, falseSuccess: false });
      await restore(page); await editor.getByRole('button', { name: 'Eliminar', exact: true }).first().click();
      assert.equal((await snapshot(page)).routineTemplates[0].exercises.length, 1);
    }

    // Saving a performed workout as a routine must retain the planned set categories and rest policy.
    const copyState = seed(true);
    copyState.gym.sessions[0].exercises[0].sets.forEach(s => { s.completed = true; });
    page = await open(copyState); const originalSession = (await snapshot(page)).sessions[0];
    await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
    page.once('dialog', d => d.accept('Copia sintética'));
    await page.getByRole('button', { name: 'Guardar como plantilla', exact: true }).click();
    const copy = (await snapshot(page)).routineTemplates.at(-1);
    observations.savedTemplate = { type: copy.exercises[0].sets[0].type ?? null, timerEnabled: copy.exercises[0].timerEnabled, restSeconds: copy.exercises[0].restSeconds, restMode: copy.exercises[0].restSecondsMode };
    if (!before) {
      const reference = getExerciseGhostValues([{ ...originalSession, status: 'completed' }], { exerciseId: copy.exercises[0].id, exerciseName: copy.exercises[0].name });
      if (process.argv.includes('--reproduce-identity')) await fs.writeFile('artifacts/gym-functional-closure/before-identity.json', JSON.stringify({ sourceExerciseId: originalSession.exercises[0].id, copiedExerciseId: copy.exercises[0].id, referenceFound: Boolean(reference) }, null, 2));
      assert.equal(copy.exercises[0].id, originalSession.exercises[0].id, 'Save as routine preserves the same logical exercise identity used by history');
      assert.ok(reference, 'The performed source remains a historical reference for the copied routine');
      assert.deepEqual(observations.savedTemplate, { type: 'warmup', timerEnabled: false, restSeconds: 75, restMode: 'custom' });
      assert.deepEqual((await snapshot(page)).sessions[0], originalSession);
      assert.ok(copy.exercises.every(ex => ex.sets.every(s => !s.completed && !s.completedAt)));
      const sessionActions = page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true });
      if (!await sessionActions.evaluate(el => el.closest('details').open)) await sessionActions.click();
      await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      await page.getByRole('button', { name: 'Continuar en Celestian', exact: true }).click();
      await page.locator('#gym-routine-choice').selectOption(`routine:${copy.id}`);
      await page.locator('[data-gym-launcher]').getByRole('button', { name: 'Iniciar Copia sintética', exact: true }).click();
      await page.locator('.c-prev-best-pill').getByText(/Última vez/).waitFor();
      assert.equal((await snapshot(page)).sessions.length, 2);
      observations.savedTemplate.historyReferenceRetained = true;
    }

    // Editing only the set count must not silently replace heterogeneous loads and reps.
    page = await open(seed()); editor = await edit(page);
    await editor.getByLabel('Series', { exact: true }).first().fill('3');
    let configured = (await snapshot(page)).routineTemplates[0].exercises[0];
    observations.configured = configured.sets.map(s => ({ id: s.id, weight: s.weight, reps: s.reps, type: s.type ?? null }));
    if (!before) {
      assert.deepEqual(configured.sets.slice(0, 2).map(s => [s.id, s.weight, s.reps, s.type || 'normal']), [['warm', 20, 12, 'warmup'], ['work', 60, 8, 'normal']]);
      await editor.getByLabel('Reps', { exact: true }).first().fill('10');
      configured = (await snapshot(page)).routineTemplates[0].exercises[0];
      assert.deepEqual(configured.sets.slice(0, 2).map(s => s.weight), [20, 60]);
      assert.ok(configured.sets.every(s => s.reps === 10));
    }

    // Reducing a paused rest to zero used to run a nested update that restored the original timer.
    page = await open(seed(true, true));
    await page.evaluate(() => {
      window.gymStateWrites = 0; const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'lifeos-state-v1') window.gymStateWrites++; return original.call(this, key, value); };
    });
    await page.getByRole('button', { name: 'Restar 30 segundos', exact: true }).click();
    observations.zeroRest = { timer: (await snapshot(page)).activeTimer, writes: await page.evaluate(() => window.gymStateWrites) };
    if (!before) { assert.equal(observations.zeroRest.timer, null); assert.equal(observations.zeroRest.writes, 1); }
    await page.screenshot({ path: `${output}/${width}-${theme}-rest-adjustment.png`, fullPage: true });

    // A rejected rest completion must leave the current exercise in place and remain retryable.
    const restState = seed(true, true); restState.gym.activeTimer.kind = 'exercise'; restState.gym.activeTimer.targetExerciseIndex = 1;
    page = await open(restState); await failSave(page);
    await page.getByRole('button', { name: /Pasar al siguiente ejercicio/ }).click();
    observations.rejectedRest = { exercise: await page.locator('.c-exercise-title').innerText(), timerPresent: Boolean((await snapshot(page)).activeTimer) };
    if (!before) {
      assert.deepEqual(observations.rejectedRest, { exercise: 'Press banca', timerPresent: true });
      await restore(page); await page.getByRole('button', { name: /Pasar al siguiente ejercicio/ }).click();
      await page.getByRole('heading', { name: 'Sentadilla corporal', exact: true }).waitFor();
      assert.equal((await snapshot(page)).activeTimer, null);
      assert.equal((await snapshot(page)).sessions[0].exercises[1].sets[0].completed, false);
    }

    if (!before) {
      // An expired rest whose clear was rejected retains its existing manual retry.
      page = await open(seed(true, true));
      const resume = page.getByRole('button', { name: 'Reanudar descanso', exact: true });
      if (await resume.isVisible()) await resume.click();
      await failSave(page); await page.clock.setFixedTime(new Date(now + 21000));
      await page.locator('.c-rest-timer-text').filter({ hasText: '00:00' }).waitFor();
      assert.ok((await snapshot(page)).activeTimer);
      assert.doesNotMatch(await page.locator('body').innerText(), /Descanso finalizado\. ¡Siguiente serie lista!/);
      await restore(page); await page.locator('.c-next-effort-cta').click();
      assert.equal((await snapshot(page)).activeTimer, null);
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[1].completed, false);
      observations.expiredRest = { rejectedClearRetainsRetry: true, noFalseSuccess: true, retryDoesNotCompleteSet: true };

      page = await open(seed(true, true));
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: /Salir sin finalizar/ }).click();
      await page.getByRole('button', { name: 'Editar tiempo', exact: true }).click();
      const timeDialog = page.getByRole('dialog', { name: 'Editar descanso en curso', exact: true });
      await timeDialog.getByLabel('Segundos restantes', { exact: true }).fill('47'); await failSave(page);
      await timeDialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
      assert.equal(await timeDialog.isVisible(), true);
      assert.equal(await timeDialog.getByLabel('Segundos restantes', { exact: true }).inputValue(), '47');
      await restore(page); await timeDialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
      await timeDialog.waitFor({ state: 'hidden' });
      assert.equal((await snapshot(page)).activeTimer.durationSeconds, 47);
      observations.manualRest = { failedEditRetainsDialogAndDraft: true, successfulRetry: true };

      // Routine lifecycle in the real UI, including drafts rejected by local storage.
      page = await open(seed()); await routines(page);
      await page.getByRole('button', { name: 'Nueva rutina', exact: true }).click();
      const routineName = page.getByLabel('Nombre de la nueva rutina', { exact: true });
      await routineName.fill('Rutina operativa'); await failSave(page);
      await page.getByRole('button', { name: 'Crear rutina', exact: true }).click();
      assert.equal(await routineName.inputValue(), 'Rutina operativa');
      assert.equal((await snapshot(page)).routineTemplates.length, 1);
      await restore(page); await page.getByRole('button', { name: 'Crear rutina', exact: true }).click();
      const templateId = (await snapshot(page)).routineTemplates.at(-1).id;
      const card = page.locator('article').filter({ has: page.getByText('Rutina operativa', { exact: true }) });
      await card.getByRole('button', { name: 'Editar', exact: true }).click();
      editor = card.locator('[data-gym-routine-editor]');
      const exerciseName = editor.getByLabel('Nombre del ejercicio de la rutina', { exact: true });
      await exerciseName.fill('Remo sentado'); await failSave(page);
      await editor.getByRole('button', { name: /Agregar/ }).click();
      assert.equal(await exerciseName.inputValue(), 'Remo sentado');
      assert.equal((await snapshot(page)).routineTemplates.at(-1).exercises.length, 0);
      await restore(page); await editor.getByRole('button', { name: /Agregar/ }).click();
      await exerciseName.fill('Sentadilla corporal');
      await editor.getByLabel('Equipamiento del ejercicio de la rutina', { exact: true }).selectOption('corporal');
      await editor.getByRole('button', { name: /Agregar/ }).click();
      await editor.getByRole('button', { name: 'Subir Sentadilla corporal', exact: true }).click();
      assert.equal((await snapshot(page)).routineTemplates.at(-1).exercises[0].name, 'Sentadilla corporal');
      await editor.getByLabel('Objetivo (kg)', { exact: true }).first().fill('0');
      await editor.getByLabel('Reps', { exact: true }).first().fill('12');
      await editor.locator('select[id^="rest-mode-"]').first().selectOption('disabled');
      const configuredTemplate = structuredClone((await snapshot(page)).routineTemplates.at(-1));
      await card.getByLabel('Más acciones para Rutina operativa', { exact: true }).click();
      await card.getByRole('button', { name: 'Duplicar rutina', exact: true }).click();
      assert.equal(await card.getByLabel('Más acciones para Rutina operativa', { exact: true }).evaluate(el => el === document.activeElement && !el.closest('details').open), true, 'Successful duplication closes its menu and preserves keyboard focus');
      const duplicate = (await snapshot(page)).routineTemplates.at(-1);
      assert.notEqual(duplicate.id, templateId);
      assert.deepEqual(duplicate.exercises.map(e => [e.name, e.restSecondsMode, e.sets.map(s => [s.weight, s.reps, s.type])]), configuredTemplate.exercises.map(e => [e.name, e.restSecondsMode, e.sets.map(s => [s.weight, s.reps, s.type])]));
      assert.notEqual(duplicate.exercises[0].sets[0].id, configuredTemplate.exercises[0].sets[0].id);
      const duplicateCard = page.locator('article').filter({ has: page.getByText('Rutina operativa (copia)', { exact: true }) });
      await duplicateCard.getByLabel('Más acciones para Rutina operativa (copia)', { exact: true }).click();
      page.once('dialog', d => d.dismiss()); await duplicateCard.getByRole('button', { name: 'Eliminar rutina', exact: true }).click();
      assert.equal((await snapshot(page)).routineTemplates.length, 3);
      page.once('dialog', d => d.accept()); await duplicateCard.getByRole('button', { name: 'Eliminar rutina', exact: true }).click();
      assert.equal((await snapshot(page)).routineTemplates.length, 2);

      // Start, reject an empty finish, record/unmark/correct warmups, reload and resume.
      await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^(Entrenar|Continuar entrenamiento)$/ }).click();
      await page.locator('#gym-routine-choice').selectOption(`routine:${templateId}`);
      await page.locator('[data-gym-launcher]').getByRole('button', { name: 'Iniciar Rutina operativa', exact: true }).click();
      await page.locator('[data-active-workout-view]').waitFor();
      assert.equal(await page.getByLabel('Peso en kilogramos', { exact: true }).inputValue(), '0');
      const sessionId = (await snapshot(page)).sessions[0].id;
      const sessionSnapshot = structuredClone((await snapshot(page)).sessions[0].exercises);
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: /Salir sin finalizar/ }).click(); await routines(page);
      await card.getByLabel('Más acciones para Rutina operativa', { exact: true }).click();
      page.once('dialog', d => d.accept()); await card.getByRole('button', { name: 'Eliminar rutina', exact: true }).click();
      assert.deepEqual((await snapshot(page)).sessions[0].exercises, sessionSnapshot);
      await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^(Entrenar|Continuar entrenamiento)$/ }).click();
      assert.equal((await snapshot(page)).sessions[0].id, sessionId);
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      assert.equal((await snapshot(page)).sessions[0].status, 'active'); assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: /^Tipo de serie:/ }).click();
      await page.locator('.c-primary-cta').click();
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[0].type, 'warmup');
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[0].completed, true);
      assert.equal((await snapshot(page)).activeTimer, null, 'Disabled rest must stay disabled');
      await page.getByRole('button', { name: /^Serie 1:/ }).click(); await page.locator('.c-primary-cta').click();
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[0].completed, false);
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[0].completedAt, null);
      await page.context().setOffline(true);
      await page.getByLabel('Repeticiones', { exact: true }).fill('13'); await page.locator('.c-primary-cta').click();
      await page.context().setOffline(false); await page.reload(); await page.locator('[data-active-workout-view]').waitFor();
      assert.equal((await snapshot(page)).sessions.length, 1); assert.equal((await snapshot(page)).sessions[0].id, sessionId);
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[0].reps, 13);
      assert.equal((await snapshot(page)).sessions[0].exercises[0].sets[0].completed, true);
      await page.getByLabel('Acciones de la sesión: finalizar o salir sin perder datos', { exact: true }).click();
      await page.getByRole('button', { name: 'Finalizar sesión', exact: true }).click();
      await page.getByRole('dialog', { name: 'Entrenamiento completado', exact: true }).waitFor();
      assert.equal((await snapshot(page)).sessions[0].status, 'completed');
      assert.equal((await snapshot(page)).activeTimer, null);
      await page.screenshot({ path: `${output}/${width}-${theme}-summary.png`, fullPage: true });
      await page.getByRole('button', { name: 'Continuar en Celestian', exact: true }).click();
      await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Historial/ }).click();
      await page.locator(`[data-gym-history-session="${sessionId}"]`).first().waitFor();
      await page.screenshot({ path: `${output}/${width}-${theme}-history.png`, fullPage: true });
      observations.lifecycle = { createRejectRetry: true, addRejectRetry: true, reorder: true, duplicate: true, deleteCancelConfirm: true, zeroLoadStart: true, invalidFinish: true, warmupCorrection: true, offlineEditReloadResume: true, validFinish: true, history: true };

      // Existing body-composition flow: no clinical inference, retained draft on failure and paired save.
      const bodyState = seed(); bodyState.profile.height = 177.3; bodyState.profile.bodyCompositionSex = 'male';
      page = await open(bodyState);
      await page.getByRole('navigation', { name: 'Secciones de Gimnasio' }).getByRole('button', { name: /^Progreso/ }).click();
      await page.getByRole('button', { name: /^Peso y composición corporal/ }).click();
      const body = page.locator('[data-gym-body-composition]'); await body.waitFor();
      await body.getByRole('button', { name: /Registrar medición/ }).click();
      await body.getByLabel('Peso (kg)', { exact: true }).fill('82.7'); await body.getByLabel('Cintura (cm)', { exact: true }).fill('92.2');
      await failSave(page); await body.getByRole('button', { name: /Guardar/ }).click(); await body.getByRole('alert').waitFor();
      assert.equal(await body.getByLabel('Peso (kg)', { exact: true }).inputValue(), '82.7'); assert.equal((await snapshot(page)).weight.length, 0);
      await restore(page); await body.getByRole('button', { name: /Guardar/ }).click();
      assert.deepEqual((await snapshot(page)).weight, [{ date: '2026-11-02', kg: 82.7 }]);
      assert.deepEqual((await snapshot(page)).measurements, [{ date: '2026-11-02', waist: 92.2 }]);
      await page.screenshot({ path: `${output}/${width}-${theme}-body.png`, fullPage: true });
      observations.body = { measurementRejectRetry: true, pairedWeightWaist: true };
      observations.progress = await verifyProgress();
    }
    results.push(observations);
    console.log(`Verified ${width}px ${theme}: ${before ? 'baseline reproduction' : 'routine, workout, rest, history and body flows'}`);
    for (const context of contexts) await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ results, errors, external, demoBuild: true }, null, 2));
  console.log(`${before ? 'REPRODUCED' : 'PASS'}: ${results.length} real-app viewport/theme cases, isolated synthetic storage, no external requests.`);
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: `${output}/failure.png`, fullPage: true });
    await fs.writeFile(`${output}/failure-text.txt`, await lastPage.locator('body').innerText());
  }
  await fs.writeFile(`${output}/failure.json`, JSON.stringify({ error: error.message, results, errors, external }, null, 2));
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
