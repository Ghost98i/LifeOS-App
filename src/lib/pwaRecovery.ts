export const PRELOAD_ERROR_RELOAD_KEY = 'lifeos_preload_reload_ts';
export const LIGHT_THEME_COLOR = '#F3F6FA';
export const DARK_THEME_COLOR = '#07090E';

export interface PreloadErrorEventLike {
  preventDefault?: () => void;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/**
 * Recovers once per browser session when a stale deployment chunk fails to load
 * (`vite:preloadError`). Stores a timestamp in sessionStorage to prevent reload loops.
 */
export function handleVitePreloadError(
  event?: PreloadErrorEventLike,
  deps?: {
    storage?: StorageLike | null;
    reload?: () => void;
    now?: () => number;
  }
): boolean {
  event?.preventDefault?.();

  const storage =
    deps && 'storage' in deps
      ? deps.storage
      : typeof window !== 'undefined'
      ? window.sessionStorage
      : null;
  const reload =
    deps?.reload ??
    (typeof window !== 'undefined' ? () => window.location.reload() : undefined);
  const now = deps?.now ?? Date.now;

  if (!storage || !reload) return false;

  try {
    if (storage.getItem(PRELOAD_ERROR_RELOAD_KEY)) {
      return false;
    }
    storage.setItem(PRELOAD_ERROR_RELOAD_KEY, String(now()));
  } catch {
    return false;
  }

  reload();
  return true;
}

export function installPreloadErrorRecovery(): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    handleVitePreloadError(event);
  };
  window.addEventListener('vite:preloadError', listener);
  return () => window.removeEventListener('vite:preloadError', listener);
}

/**
 * Keeps `<meta name="theme-color">` aligned with the active Light/Dark surface canvas.
 */
export function syncDocumentThemeColor(
  isDark: boolean,
  doc: Pick<Document, 'querySelector'> | null = typeof document !== 'undefined' ? document : null
): string {
  const color = isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  const meta = doc?.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', color);
  return color;
}
