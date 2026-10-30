import { useEffect, useRef } from 'react';

export interface NavigationFocusOptions {
  maxWaitMs?: number;
  highlightDurationMs?: number;
  scrollBlock?: ScrollLogicalPosition;
  onFocusFound?: (element: HTMLElement) => void;
}

let activeHighlightTimer: ReturnType<typeof setTimeout> | null = null;
let activeHighlightedElement: HTMLElement | null = null;

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
 * Immediately clears any active highlight ring across the app.
 * Guarantees no phantom outlines or duplicate focus indicators when
 * clicking alerts rapidly or switching between records.
 */
export function clearActiveTargetHighlight(): void {
  if (activeHighlightTimer) {
    clearTimeout(activeHighlightTimer);
    activeHighlightTimer = null;
  }
  if (activeHighlightedElement) {
    try {
      activeHighlightedElement.classList.remove('lifeos-target-highlight');
    } catch {
      // Ignore if element is disconnected or in mock DOM
    }
    activeHighlightedElement = null;
  }
}

/**
 * Robust, DOM-availability-driven navigation focus utility.
 * Replaces arbitrary setTimeout (150-200ms) with direct element resolution
 * via immediate check, MutationObserver, and requestAnimationFrame polling.
 *
 * Guarantees:
 * 1. Immediate resolution if the element is already mounted in the DOM.
 * 2. Instant resolution as soon as the element mounts following React state updates.
 * 3. Strict cancellation on unmount or when focusNonce / targetId changes.
 * 4. Automatic respects of prefers-reduced-motion.
 * 5. Single-ring invariant: removes previous target highlight before applying a new one.
 * 6. Hard bounded maximum wait time (default 1200ms) to prevent resource leaks.
 */
export function focusTargetElement(
  targetId: string,
  options?: NavigationFocusOptions
): () => void {
  if (!targetId || typeof document === 'undefined') {
    return () => {};
  }

  let cancelled = false;
  let observer: MutationObserver | null = null;
  let rafId: number | null = null;
  let safetyTimeout: ReturnType<typeof setTimeout> | null = null;
  let localHighlightTimer: ReturnType<typeof setTimeout> | null = null;

  const maxWaitMs = options?.maxWaitMs ?? 1200;
  const highlightDurationMs = options?.highlightDurationMs ?? 2400;
  const scrollBlock = options?.scrollBlock ?? 'center';

function isElementVisible(el: HTMLElement): boolean {
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    } catch {
      // Ignore
    }
  }
  return true;
}

  const applyFocus = (el: HTMLElement) => {
    if (cancelled) return;

    // Invariant: remove any existing highlight across the app
    clearActiveTargetHighlight();

    const isReduced = prefersReducedMotion();
    try {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          behavior: isReduced ? 'auto' : 'smooth',
          block: scrollBlock,
        });
      }
    } catch {
      try {
        el.scrollIntoView();
      } catch {
        // Safe fallback in minimal mock DOM
      }
    }

    // Accessible keyboard / screen reader focus
    try {
      const hadTabIndex = el.hasAttribute('tabindex');
      if (!hadTabIndex) {
        el.setAttribute('tabindex', '-1');
      }
      if (typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
      }
      if (!hadTabIndex) {
        const onBlur = () => {
          el.removeAttribute('tabindex');
          el.removeEventListener('blur', onBlur);
        };
        el.addEventListener('blur', onBlur);
      }
    } catch {
      // Ignore in mock DOM
    }

    try {
      el.classList.add('lifeos-target-highlight');
      activeHighlightedElement = el;

      localHighlightTimer = setTimeout(() => {
        try {
          el.classList.remove('lifeos-target-highlight');
        } catch {
          // Ignore
        }
        if (activeHighlightedElement === el) {
          activeHighlightedElement = null;
        }
        localHighlightTimer = null;
      }, highlightDurationMs);
      activeHighlightTimer = localHighlightTimer;
    } catch {
      // Ignore in mock DOM if classList is missing
    }

    options?.onFocusFound?.(el);
  };

  const tryFind = (): boolean => {
    if (cancelled) return true;
    const el = document.getElementById(targetId);
    if (el && isElementVisible(el)) {
      applyFocus(el);
      return true;
    }
    return false;
  };

  // 1. Immediate synchronous check
  if (tryFind()) {
    return () => {
      cancelled = true;
      if (localHighlightTimer) {
        clearTimeout(localHighlightTimer);
      }
    };
  }

  // 2. Setup MutationObserver if available
  if (typeof MutationObserver !== 'undefined' && document.body) {
    try {
      observer = new MutationObserver(() => {
        if (tryFind()) {
          observer?.disconnect();
          observer = null;
          if (rafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['id', 'style', 'class'],
      });
    } catch {
      observer = null;
    }
  }

  // 3. Polling backup with requestAnimationFrame
  const startTime = Date.now();
  const poll = () => {
    if (cancelled) return;
    if (tryFind()) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }
    if (Date.now() - startTime >= maxWaitMs) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(poll);
    } else {
      rafId = setTimeout(poll, 16) as unknown as number;
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(poll);
  } else {
    rafId = setTimeout(poll, 16) as unknown as number;
  }

  // 4. Max safety timer
  safetyTimeout = setTimeout(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      } else {
        clearTimeout(rafId as unknown as ReturnType<typeof setTimeout>);
      }
      rafId = null;
    }
  }, maxWaitMs);

  return () => {
    cancelled = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      } else {
        clearTimeout(rafId as unknown as ReturnType<typeof setTimeout>);
      }
      rafId = null;
    }
    if (safetyTimeout) {
      clearTimeout(safetyTimeout);
      safetyTimeout = null;
    }
    if (localHighlightTimer) {
      clearTimeout(localHighlightTimer);
      localHighlightTimer = null;
    }
  };
}

/**
 * Declarative hook for views and sections that receive initialFocusId and focusNonce.
 */
export function useNavigationFocus(
  targetId: string | null | undefined,
  focusNonce?: number,
  options?: NavigationFocusOptions
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!targetId) return;
    return focusTargetElement(targetId, optionsRef.current);
  }, [targetId, focusNonce]);
}
