import type { LifeOSState, ViewType } from '../types';
import { isModuleEnabled } from './moduleVisibility';

export type PwaShortcutAction = 'capture' | 'gimnasio' | 'finanzas' | 'hoy';

export const VALID_PWA_SHORTCUTS: readonly PwaShortcutAction[] = [
  'capture',
  'gimnasio',
  'finanzas',
  'hoy',
] as const;

export type PwaShortcutResolution =
  | { kind: 'none' }
  | { kind: 'open-capture' }
  | { kind: 'navigate'; view: ViewType };

/**
 * Safely parses the `?shortcut=` query parameter from a URL search string.
 * Rejects empty, unknown, oversized, or malformed values.
 */
export function parsePwaShortcut(search: string | null | undefined): PwaShortcutAction | null {
  if (!search || typeof search !== 'string') return null;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('shortcut');
  } catch {
    return null;
  }
  if (!raw || raw.length > 32) return null;
  const normalized = raw.trim().toLowerCase();
  return (VALID_PWA_SHORTCUTS as readonly string[]).includes(normalized)
    ? (normalized as PwaShortcutAction)
    : null;
}

/**
 * Resolves the UI effect of a PWA shortcut while respecting onboarding state
 * and active module visibility (`hiddenTabs`).
 */
export function resolvePwaShortcutEffect(
  shortcut: PwaShortcutAction | null,
  state: Partial<LifeOSState> | null | undefined,
  options: { onboardingDone: boolean }
): PwaShortcutResolution {
  if (!shortcut || !options.onboardingDone) {
    return { kind: 'none' };
  }

  if (shortcut === 'capture') {
    return { kind: 'open-capture' };
  }

  if (shortcut === 'hoy') {
    return { kind: 'navigate', view: 'dashboard' };
  }

  if (shortcut === 'gimnasio') {
    return {
      kind: 'navigate',
      view: isModuleEnabled(state, 'gimnasio') ? 'gimnasio' : 'dashboard',
    };
  }

  if (shortcut === 'finanzas') {
    return {
      kind: 'navigate',
      view: isModuleEnabled(state, 'finanzas') ? 'finanzas' : 'dashboard',
    };
  }

  return { kind: 'none' };
}

/**
 * Removes `?shortcut=...` from a location while preserving unrelated query params and hash.
 * Returns `null` if the parameter was not present.
 */
export function stripShortcutQueryParam(locationLike: {
  pathname: string;
  search: string;
  hash?: string;
}): string | null {
  const params = new URLSearchParams(locationLike.search || '');
  if (!params.has('shortcut')) return null;
  params.delete('shortcut');
  const nextSearch = params.toString();
  const pathname = locationLike.pathname || '/';
  const hash = locationLike.hash || '';
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash}`;
}

/**
 * Cleans `?shortcut=...` from the browser address bar via `history.replaceState`
 * so refreshing (`F5`) never re-triggers the shortcut.
 */
export function clearShortcutFromHistory(
  win: {
    location: { pathname: string; search: string; hash: string };
    history: { state: unknown; replaceState: (data: unknown, unused: string, url?: string | URL | null) => void };
  } | null = typeof window !== 'undefined' ? window : null
): boolean {
  if (!win) return false;
  const nextUrl = stripShortcutQueryParam(win.location);
  if (nextUrl === null) return false;
  try {
    win.history.replaceState(win.history.state, '', nextUrl);
    return true;
  } catch {
    return false;
  }
}
