import type { LifeOSState, Settings, ViewType } from '../types';
import type { AppIconName } from '../components/AppIcon';
import { hasMeaningfulData } from './storage';

export const NON_HIDEABLE_MODULES: readonly ViewType[] = ['dashboard', 'config', 'checkout'] as const;

export const OPTIONAL_MODULES: readonly ViewType[] = [
  'gimnasio',
  'finanzas',
  'agenda',
  'calendario',
  'trabajo',
  'reventa',
  'estudios',
  'notas',
  'ia',
] as const;

export interface OnboardingModuleOption {
  id: ViewType;
  name: string;
  description: string;
  icon: AppIconName;
}

export const ONBOARDING_MODULE_IDS: readonly ViewType[] = [
  'finanzas',
  'gimnasio',
  'estudios',
  'trabajo',
  'agenda',
  'calendario',
  'notas',
  'reventa',
] as const;

export const ONBOARDING_MODULES: readonly OnboardingModuleOption[] = [
  {
    id: 'finanzas',
    name: 'Finanzas',
    description: 'Control de gastos, ingresos, cuentas bancarias y presupuestos.',
    icon: 'wallet',
  },
  {
    id: 'gimnasio',
    name: 'Gimnasio',
    description: 'Rutinas de entrenamiento, series, pesos y descansos.',
    icon: 'dumbbell',
  },
  {
    id: 'estudios',
    name: 'Estudios',
    description: 'Materias académicas, registro de estudio y exámenes.',
    icon: 'book',
  },
  {
    id: 'trabajo',
    name: 'Trabajo',
    description: 'Seguimiento de postulaciones y oportunidades laborales.',
    icon: 'briefcase',
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Bloques de tiempo semanales y rutinas diarias.',
    icon: 'calendar',
  },
  {
    id: 'calendario',
    name: 'Calendario',
    description: 'Fechas importantes, eventos y compromisos programados.',
    icon: 'calendarDays',
  },
  {
    id: 'notas',
    name: 'Notas',
    description: 'Apuntes rápidos, listas y banco de notas personales.',
    icon: 'note',
  },
  {
    id: 'reventa',
    name: 'Reventa',
    description: 'Inventario de productos, compras, ventas y márgenes.',
    icon: 'repeat',
  },
];

/**
 * Given a list of selected module IDs from onboarding, computes the new hiddenTabs array.
 * Modules in ONBOARDING_MODULE_IDS not selected are marked as hidden.
 * Any non-onboarding hidden modules (e.g. 'ia' if it was already hidden) are preserved.
 */
export function computeHiddenTabsFromSelection(
  selectedIds: (ViewType | string)[],
  currentHiddenTabs: string[] = ['ia']
): string[] {
  const selectedSet = new Set(selectedIds);
  const unselectedOnboarding = ONBOARDING_MODULE_IDS.filter((id) => !selectedSet.has(id));
  const otherHidden = currentHiddenTabs.filter(
    (id) => !ONBOARDING_MODULE_IDS.includes(id as ViewType)
  );
  // Non-onboarding modules outside ONBOARDING_MODULE_IDS (such as 'ia') default to hidden
  const nonOnboardingHidden = otherHidden.length > 0 ? otherHidden : ['ia'];
  return Array.from(new Set([...nonOnboardingHidden, ...unselectedOnboarding]));
}

/**
 * Determines whether onboarding should be shown for the current installation.
 * Returns true ONLY for fresh installations pending onboarding.
 * Legacy installations and users who already completed onboarding return false.
 */
export function isUserPendingOnboarding(
  state: Partial<LifeOSState> | null | undefined,
  storageBackend?: 'localStorage' | 'claude' | 'ninguno'
): boolean {
  if (!state || !state.settings) return false;
  if (state.settings.onboardingCompleted === true) {
    return false;
  }
  if (state.settings.onboardingCompleted === false) {
    return true;
  }
  // Safety check for legacy/existing state where onboardingCompleted was undefined:
  if (storageBackend === 'localStorage' || hasMeaningfulData(state as LifeOSState)) {
    return false;
  }
  return true;
}

export interface ModuleNavMetadata {
  id: ViewType;
  label: string;
  icon: AppIconName;
}

export const MODULE_NAV_METADATA: Record<ViewType, ModuleNavMetadata> = {
  dashboard: { id: 'dashboard', label: 'Hoy', icon: 'home' },
  gimnasio: { id: 'gimnasio', label: 'Gimnasio', icon: 'dumbbell' },
  finanzas: { id: 'finanzas', label: 'Finanzas', icon: 'wallet' },
  agenda: { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  calendario: { id: 'calendario', label: 'Calendario', icon: 'calendarDays' },
  trabajo: { id: 'trabajo', label: 'Trabajo', icon: 'briefcase' },
  reventa: { id: 'reventa', label: 'Reventa', icon: 'repeat' },
  estudios: { id: 'estudios', label: 'Estudios', icon: 'book' },
  notas: { id: 'notas', label: 'Notas', icon: 'note' },
  ia: { id: 'ia', label: 'IA', icon: 'sparkles' },
  config: { id: 'config', label: 'Configuración', icon: 'settings' },
  checkout: { id: 'checkout', label: 'Cerrar Día', icon: 'moon' },
};

/**
 * Safely extracts the list of hidden tabs from LifeOSState or Settings.
 * Returns an empty array if undefined/null, ensuring legacy compatibility.
 */
export function getHiddenTabs(stateOrSettings?: Partial<LifeOSState> | Partial<Settings> | null): string[] {
  if (!stateOrSettings) return [];

  // Check if state object with settings property
  if ('settings' in stateOrSettings && stateOrSettings.settings) {
    const tabs = stateOrSettings.settings.hiddenTabs;
    return Array.isArray(tabs) ? tabs : [];
  }

  // Check if direct settings object with hiddenTabs
  if ('hiddenTabs' in stateOrSettings) {
    const tabs = (stateOrSettings as Partial<Settings>).hiddenTabs;
    return Array.isArray(tabs) ? tabs : [];
  }

  return [];
}

/**
 * Returns true if a module is currently enabled/visible.
 * Non-hideable modules always return true.
 * For optional modules, returns true unless explicitly present in hiddenTabs.
 */
export function isModuleEnabled(
  stateOrSettings: Partial<LifeOSState> | Partial<Settings> | null | undefined,
  moduleId: ViewType | string
): boolean {
  if (NON_HIDEABLE_MODULES.includes(moduleId as ViewType)) {
    return true;
  }
  const hidden = getHiddenTabs(stateOrSettings);
  return !hidden.includes(moduleId);
}

/**
 * Returns true if a module is currently hidden/inactive.
 * Non-hideable modules never return true.
 */
export function isModuleHidden(
  stateOrSettings: Partial<LifeOSState> | Partial<Settings> | null | undefined,
  moduleId: ViewType | string
): boolean {
  return !isModuleEnabled(stateOrSettings, moduleId);
}

/**
 * Returns all ViewType identifiers that are currently enabled.
 */
export function getVisibleModules(
  stateOrSettings: Partial<LifeOSState> | Partial<Settings> | null | undefined
): ViewType[] {
  const hidden = new Set(getHiddenTabs(stateOrSettings));
  const allViews: ViewType[] = [
    'dashboard',
    ...OPTIONAL_MODULES,
    'config',
    'checkout',
  ];
  return allViews.filter((view) => NON_HIDEABLE_MODULES.includes(view) || !hidden.has(view));
}

/**
 * Slot priorities for Mobile Bottom Bar.
 * Slot 1: Hoy (dashboard) - always present
 * Slot 2: First active candidate (defaults to 'gimnasio')
 * Slot 3: Quick Capture (+) - always present
 * Slot 4: Second active candidate (defaults to 'finanzas')
 * Slot 5: Más (drawer) - always present
 */
const SLOT_2_PREFERENCES: ViewType[] = [
  'gimnasio',
  'agenda',
  'notas',
  'calendario',
  'estudios',
  'trabajo',
  'reventa',
  'ia',
];

const SLOT_4_PREFERENCES: ViewType[] = [
  'finanzas',
  'notas',
  'calendario',
  'agenda',
  'estudios',
  'trabajo',
  'reventa',
  'ia',
];

export interface MobileNavSlots {
  slot2: ModuleNavMetadata | null;
  slot4: ModuleNavMetadata | null;
}

/**
 * Computes which modules occupy Slot 2 and Slot 4 in the mobile bottom bar.
 * Ensures Slot 2 and Slot 4 never duplicate the same module.
 */
export function getMobileNavSlots(
  stateOrSettings: Partial<LifeOSState> | Partial<Settings> | null | undefined
): MobileNavSlots {
  let chosenSlot2: ViewType | null = null;
  for (const candidate of SLOT_2_PREFERENCES) {
    if (isModuleEnabled(stateOrSettings, candidate)) {
      chosenSlot2 = candidate;
      break;
    }
  }

  let chosenSlot4: ViewType | null = null;
  for (const candidate of SLOT_4_PREFERENCES) {
    if (candidate !== chosenSlot2 && isModuleEnabled(stateOrSettings, candidate)) {
      chosenSlot4 = candidate;
      break;
    }
  }

  return {
    slot2: chosenSlot2 ? MODULE_NAV_METADATA[chosenSlot2] : null,
    slot4: chosenSlot4 ? MODULE_NAV_METADATA[chosenSlot4] : null,
  };
}
