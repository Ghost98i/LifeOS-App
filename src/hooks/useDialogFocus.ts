import { useEffect, useRef, type RefObject } from 'react';

const controls = 'button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])';

/** Keep keyboard navigation inside an open dialog and return to its real trigger. */
export function useDialogFocus(open: boolean, container: RefObject<HTMLElement | null>, onClose: () => void, returnFocusSelector?: string) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog: HTMLElement | null = container.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from<HTMLElement>(dialog.querySelectorAll<HTMLElement>(controls)).filter(element =>
      element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'));
    if (!dialog.contains(document.activeElement)) (focusable().find(element => element.matches('input, textarea, select')) || focusable()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      const topDialog = Array.from<HTMLElement>(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(element => element.getClientRects().length > 0).at(-1);
      if (topDialog && topDialog !== dialog) return;
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (!dialog.contains(document.activeElement) || event.shiftKey && document.activeElement === first) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    // Bubble after the dialog's own handlers: e.g. search uses Escape to clear a query first.
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      const target = previous?.isConnected && previous !== document.body && !dialog.contains(previous)
        ? previous : returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
      target?.focus({ preventScroll: true });
    };
  }, [open, container, returnFocusSelector]);
}
