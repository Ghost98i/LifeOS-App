import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUserPendingOnboarding,
  computeHiddenTabsFromSelection,
  ONBOARDING_MODULE_IDS,
  isModuleEnabled,
  isModuleHidden,
  getVisibleModules,
  NON_HIDEABLE_MODULES,
} from './moduleVisibility';
import {
  defaultState,
  loadStoredState,
  saveStoredState,
  normalizeStoredState,
  parseBackupJSON,
  hasMeaningfulData,
} from './storage';
import { mergeProfileModule } from './syncMerge';

test('LifeOS — Phase 2: Onboarding & Module Selection Contract', async (t) => {
  await t.test('1. Onboarding is pending for a fresh installation', () => {
    const freshState = defaultState();
    assert.equal(freshState.settings.onboardingCompleted, false);
    // Fresh state defaults to hiding experimental/contextual IA module
    assert.deepEqual(freshState.settings.hiddenTabs, ['ia']);
    assert.equal(isModuleEnabled(freshState, 'ia'), false);
    assert.equal(isUserPendingOnboarding(freshState), true);
  });

  await t.test('2. Onboarding does not reappear after completion', () => {
    const state = defaultState();
    state.settings.onboardingCompleted = true;
    assert.equal(isUserPendingOnboarding(state), false);
  });

  await t.test('3. Module selection computes correct hiddenTabs (including default hidden IA)', () => {
    // User selects only Finanzas and Gimnasio
    const selected = ['finanzas', 'gimnasio'];
    const hidden = computeHiddenTabsFromSelection(selected);

    // The other 6 optional modules must be hidden
    assert.equal(hidden.includes('agenda'), true);
    assert.equal(hidden.includes('calendario'), true);
    assert.equal(hidden.includes('estudios'), true);
    assert.equal(hidden.includes('trabajo'), true);
    assert.equal(hidden.includes('reventa'), true);
    assert.equal(hidden.includes('notas'), true);

    // Non-onboarding module IA must remain hidden
    assert.equal(hidden.includes('ia'), true);

    // Selected modules must NOT be hidden
    assert.equal(hidden.includes('finanzas'), false);
    assert.equal(hidden.includes('gimnasio'), false);

    // Core modules must never be hidden
    assert.equal(hidden.includes('dashboard'), false);
    assert.equal(hidden.includes('config'), false);
    assert.equal(hidden.includes('checkout'), false);
  });

  await t.test('4. Empty selection is valid (zero optional modules chosen, IA remains hidden)', () => {
    const emptySelected: string[] = [];
    const hidden = computeHiddenTabsFromSelection(emptySelected);

    // All 8 optional onboarding modules should be marked as hidden
    for (const modId of ONBOARDING_MODULE_IDS) {
      assert.equal(hidden.includes(modId), true, `Module ${modId} should be in hiddenTabs`);
    }

    // IA is also marked as hidden
    assert.equal(hidden.includes('ia'), true);

    const state = defaultState();
    state.settings.hiddenTabs = hidden;
    state.settings.onboardingCompleted = true;

    // Optional modules are disabled
    for (const modId of ONBOARDING_MODULE_IDS) {
      assert.equal(isModuleEnabled(state, modId), false);
    }
    assert.equal(isModuleEnabled(state, 'ia'), false);
    assert.equal(getVisibleModules(state).includes('ia'), false);
  });

  await t.test('5. Core modules remain active regardless of selection', () => {
    const hidden = computeHiddenTabsFromSelection([]);
    const state = defaultState();
    state.settings.hiddenTabs = hidden;
    state.settings.onboardingCompleted = true;

    for (const core of NON_HIDEABLE_MODULES) {
      assert.equal(isModuleEnabled(state, core), true, `Core ${core} must remain enabled`);
      assert.equal(isModuleHidden(state, core), false, `Core ${core} must not be hidden`);
    }
  });

  await t.test('6. Non-selected modules become inactive', () => {
    const selected = ['estudios', 'notas'];
    const hidden = computeHiddenTabsFromSelection(selected);
    const state = defaultState();
    state.settings.hiddenTabs = hidden;
    state.settings.onboardingCompleted = true;

    assert.equal(isModuleEnabled(state, 'estudios'), true);
    assert.equal(isModuleEnabled(state, 'notas'), true);

    assert.equal(isModuleEnabled(state, 'finanzas'), false);
    assert.equal(isModuleEnabled(state, 'gimnasio'), false);
    assert.equal(isModuleEnabled(state, 'trabajo'), false);
    assert.equal(isModuleEnabled(state, 'reventa'), false);
    assert.equal(isModuleEnabled(state, 'agenda'), false);
    assert.equal(isModuleEnabled(state, 'calendario'), false);
    assert.equal(isModuleEnabled(state, 'ia'), false);
  });

  await t.test('7. Reactivation in settings preserves all user data', () => {
    const state = defaultState();
    const initialAccountCount = state.finance.accounts.length;
    // Add data to Finanzas
    state.finance.transactions.push({
      id: 'tx-1',
      type: 'gasto',
      amount: 1500,
      category: 'comida',
      fixed: 'variable',
      date: '2026-10-02',
    });
    state.finance.accounts.push({
      id: 'acc-custom-1',
      name: 'Banco Personal Test',
      balance: 50000,
    });

    // Deactivate Finanzas
    state.settings.hiddenTabs = ['finanzas'];
    assert.equal(isModuleEnabled(state, 'finanzas'), false);
    // Data remains intact
    assert.equal(state.finance.transactions.length, 1);
    assert.equal(state.finance.accounts.length, initialAccountCount + 1);

    // Reactivate Finanzas
    state.settings.hiddenTabs = [];
    assert.equal(isModuleEnabled(state, 'finanzas'), true);
    assert.equal(state.finance.transactions[0].id, 'tx-1');
    assert.equal(state.finance.transactions[0].amount, 1500);
    assert.ok(state.finance.accounts.some((a) => a.id === 'acc-custom-1'));
  });

  await t.test('8. Deactivation does not delete data', () => {
    const state = defaultState();
    state.gym.sessions.push({
      id: 'gym-1',
      date: '2026-10-02',
      exercises: [],
    });

    // Deactivate Gimnasio
    state.settings.hiddenTabs = ['gimnasio'];
    assert.equal(isModuleEnabled(state, 'gimnasio'), false);

    // Gym session is preserved
    assert.equal(state.gym.sessions.length, 1);
    assert.equal(state.gym.sessions[0].id, 'gym-1');
  });

  await t.test('9. Legacy user with existing data / stored state does NOT receive onboarding', () => {
    // Legacy state with tasks or habits, but without onboardingCompleted flag
    const legacyState = defaultState();
    delete legacyState.settings.onboardingCompleted;
    legacyState.todayExtras.push({
      id: 'task-1',
      date: '2026-10-02',
      text: 'Comprar café',
      done: false,
      priority: 'alta',
    });

    assert.equal(hasMeaningfulData(legacyState), true);

    // Normalizing legacy state sets onboardingCompleted = true
    const normalized = normalizeStoredState(legacyState);
    assert.equal(normalized.settings.onboardingCompleted, true);
    assert.equal(isUserPendingOnboarding(normalized), false);

    // parseBackupJSON also protects legacy backups
    const legacyJson = JSON.stringify(legacyState);
    const parsedBackup = parseBackupJSON(legacyJson);
    assert.equal(parsedBackup.settings.onboardingCompleted, true);
  });

  await t.test('10. Reload preserves onboardingCompleted: true', () => {
    const memoryStore = new Map<string, string>();
    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k: string) => memoryStore.get(k) ?? null,
      setItem: (k: string, v: string) => { memoryStore.set(k, String(v)); },
      removeItem: (k: string) => { memoryStore.delete(k); },
      clear: () => memoryStore.clear(),
      length: 0,
      key: () => null,
    } as any;

    try {
      const state = defaultState();
      state.settings.onboardingCompleted = true;
      state.settings.hiddenTabs = ['gimnasio', 'reventa'];

      saveStoredState(state);
      const loaded = loadStoredState();

      assert.equal(loaded.backend, 'localStorage');
      assert.equal(loaded.state.settings.onboardingCompleted, true);
      assert.deepEqual(loaded.state.settings.hiddenTabs, ['gimnasio', 'reventa']);
      assert.equal(isUserPendingOnboarding(loaded.state), false);
    } finally {
      globalThis.localStorage = prevLocalStorage;
    }
  });

  await t.test('11. Hoy/dashboard respects the resulting module visibility and excludes IA', () => {
    const state = defaultState();
    // User selected only Agenda and Notas
    state.settings.hiddenTabs = computeHiddenTabsFromSelection(['agenda', 'notas']);
    state.settings.onboardingCompleted = true;

    const visible = getVisibleModules(state);
    assert.equal(visible.includes('dashboard'), true);
    assert.equal(visible.includes('agenda'), true);
    assert.equal(visible.includes('notas'), true);
    assert.equal(visible.includes('finanzas'), false);
    assert.equal(visible.includes('gimnasio'), false);
    assert.equal(visible.includes('estudios'), false);
    assert.equal(visible.includes('trabajo'), false);
    assert.equal(visible.includes('reventa'), false);
    // Explicit assertion: IA is excluded
    assert.equal(visible.includes('ia'), false);
  });

  await t.test('12. All optional modules inactive still allows core tasks/inbox', () => {
    const state = defaultState();
    state.settings.hiddenTabs = computeHiddenTabsFromSelection([]);
    state.settings.onboardingCompleted = true;

    // Add a core task to todayExtras
    state.todayExtras.push({
      id: 'task-core',
      date: '2026-10-02',
      text: 'Revisar correo',
      done: false,
      priority: 'alta',
    });

    // Add daily priority
    state.dailyPriorities.push({
      id: 'prio-1',
      date: '2026-10-02',
      text: 'Prioridad principal del día',
    });

    assert.equal(state.todayExtras.length, 1);
    assert.equal(state.dailyPriorities.length, 1);
    assert.equal(isModuleEnabled(state, 'dashboard'), true);
  });

  await t.test('13. IA module visibility contract across all onboarding scenarios and ConfigView reactivation', () => {
    // Scenario A: 0 modules selected
    const state0 = defaultState();
    state0.settings.hiddenTabs = computeHiddenTabsFromSelection([]);
    state0.settings.onboardingCompleted = true;
    assert.equal(isModuleEnabled(state0, 'ia'), false);
    assert.equal(isModuleHidden(state0, 'ia'), true);
    assert.equal(getVisibleModules(state0).includes('ia'), false);

    // Scenario B: Only Finanzas selected
    const stateFin = defaultState();
    stateFin.settings.hiddenTabs = computeHiddenTabsFromSelection(['finanzas'], stateFin.settings.hiddenTabs);
    stateFin.settings.onboardingCompleted = true;
    assert.equal(isModuleEnabled(stateFin, 'finanzas'), true);
    assert.equal(isModuleEnabled(stateFin, 'ia'), false);
    assert.equal(isModuleHidden(stateFin, 'ia'), true);
    assert.equal(getVisibleModules(stateFin).includes('finanzas'), true);
    assert.equal(getVisibleModules(stateFin).includes('ia'), false);

    // Scenario C: All 8 modules selected
    const stateAll8 = defaultState();
    stateAll8.settings.hiddenTabs = computeHiddenTabsFromSelection(
      [...ONBOARDING_MODULE_IDS],
      stateAll8.settings.hiddenTabs
    );
    stateAll8.settings.onboardingCompleted = true;
    for (const mod of ONBOARDING_MODULE_IDS) {
      assert.equal(isModuleEnabled(stateAll8, mod), true, `Module ${mod} should be enabled`);
    }
    // IA remains strictly inactive
    assert.equal(isModuleEnabled(stateAll8, 'ia'), false);
    assert.equal(isModuleHidden(stateAll8, 'ia'), true);
    assert.equal(getVisibleModules(stateAll8).includes('ia'), false);

    // Scenario D: User manually reactivates IA later in ConfigView
    // ConfigView path: handleToggleTab removes 'ia' from hiddenTabs
    stateAll8.settings.hiddenTabs = stateAll8.settings.hiddenTabs.filter((id) => id !== 'ia');
    assert.equal(isModuleEnabled(stateAll8, 'ia'), true);
    assert.equal(isModuleHidden(stateAll8, 'ia'), false);
    assert.equal(getVisibleModules(stateAll8).includes('ia'), true);

    // User deactivates IA again in ConfigView:
    stateAll8.settings.hiddenTabs.push('ia');
    assert.equal(isModuleEnabled(stateAll8, 'ia'), false);
    assert.equal(isModuleHidden(stateAll8, 'ia'), true);
    assert.equal(getVisibleModules(stateAll8).includes('ia'), false);
  });

  await t.test('14. Multi-device sync: onboardingCompleted merge resolution', () => {
    const baseProfile = { name: '', height: 175, bodyCompositionSex: null };

    // Case 1: local=false + remote=true -> true
    const res1 = mergeProfileModule(
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: false } },
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: true } }
    );
    assert.equal(res1.settings.onboardingCompleted, true);

    // Case 2: local=true + remote=false -> true
    const res2 = mergeProfileModule(
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: true } },
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: false } }
    );
    assert.equal(res2.settings.onboardingCompleted, true);

    // Case 3: baseline=false + both false -> false
    const res3 = mergeProfileModule(
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: false } },
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: false } },
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: false } }
    );
    assert.equal(res3.settings.onboardingCompleted, false);

    // Case 4: once true, stale remote with false never reverts
    const res4 = mergeProfileModule(
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: true } },
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: false } },
      { profile: baseProfile, settings: { darkMode: false, hiddenTabs: [], onboardingCompleted: true } }
    );
    assert.equal(res4.settings.onboardingCompleted, true);
  });

  await t.test('15. Legacy user regression: existing user with IA enabled does NOT lose IA', () => {
    // Existing user who already completed onboarding and has all tabs active (hiddenTabs: [])
    const existingState = defaultState();
    existingState.settings.onboardingCompleted = true;
    existingState.settings.hiddenTabs = []; // IA is active

    assert.equal(isModuleEnabled(existingState, 'ia'), true);

    // Normalizing existing state must preserve hiddenTabs: [] and NOT hide IA
    const normalizedExisting = normalizeStoredState(existingState);
    assert.deepEqual(normalizedExisting.settings.hiddenTabs, []);
    assert.equal(isModuleEnabled(normalizedExisting, 'ia'), true);
    assert.equal(getVisibleModules(normalizedExisting).includes('ia'), true);

    // Legacy user without onboardingCompleted flag, but with hiddenTabs: []
    const legacyState = {
      ...defaultState(),
      settings: {
        darkMode: false,
        hiddenTabs: [],
      } as any,
    };
    const normalizedLegacy = normalizeStoredState(legacyState);
    assert.deepEqual(normalizedLegacy.settings.hiddenTabs, []);
    assert.equal(isModuleEnabled(normalizedLegacy, 'ia'), true);
    assert.equal(getVisibleModules(normalizedLegacy).includes('ia'), true);
  });
});
