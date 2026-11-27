export type HapticPattern = 'light' | 'success' | 'warning';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  success: [14, 30, 18],
  warning: [22, 38, 22],
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Triggers a subtle, safe tactile vibration on supported mobile devices.
 * Always a no-op on iOS, desktop browsers without Vibration API, or when
 * the user has `prefers-reduced-motion: reduce` enabled.
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  if (prefersReducedMotion()) {
    return false;
  }
  try {
    const ok = navigator.vibrate(HAPTIC_PATTERNS[pattern]);
    return ok !== false;
  } catch {
    return false;
  }
}
