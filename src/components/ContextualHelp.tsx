import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Small, reusable non-modal help popover for concepts that should stay out of the way. */
export const ContextualHelp: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextFocusOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const cancelClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const close = useCallback(() => { cancelClose(); setOpen(false); setPinned(false); }, [cancelClose]);
  const closeAndReturnFocus = useCallback(() => {
    close();
    if (document.activeElement !== triggerRef.current) suppressNextFocusOpen.current = true;
    triggerRef.current?.focus();
  }, [close]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    timerRef.current = setTimeout(() => {
      if (!pinned && !triggerRef.current?.matches(':focus') && !panelRef.current?.contains(document.activeElement)) setOpen(false);
    }, 120);
  }, [cancelClose, pinned]);

  useEffect(() => () => {
    cancelClose();
  }, [cancelClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAndReturnFocus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close, closeAndReturnFocus]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;
      const margin = 12;
      const width = Math.min(288, Math.max(0, window.innerWidth - margin * 2));
      const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - width - margin));
      const below = trigger.bottom + 8;
      const top = below + panel.height <= window.innerHeight - margin
        ? below : Math.max(margin, trigger.top - panel.height - 8);
      setPosition({ position: 'fixed', zIndex: 1000, top, left, width, maxHeight: `calc(100dvh - ${margin * 2}px)`, visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, children]);

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div ref={panelRef} id={id} role="dialog" aria-label={`Ayuda: ${label}`} style={position}
      onMouseEnter={cancelClose} onMouseLeave={scheduleClose}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !pinned) scheduleClose();
      }}
      className="w-[min(18rem,calc(100vw-24px))] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs leading-relaxed text-[var(--text-soft)] shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0">{children}</p>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
          closeAndReturnFocus();
        }} aria-label="Cerrar ayuda" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">×</button>
      </div>
    </div>, document.body) : null;

  return <>
    <button ref={triggerRef} type="button" aria-label={`Ayuda: ${label}`} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? id : undefined}
      onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}
      onFocus={() => {
        if (suppressNextFocusOpen.current) { suppressNextFocusOpen.current = false; return; }
        cancelClose(); setOpen(true);
      }}
      onBlur={(event) => {
        if (!panelRef.current?.contains(event.relatedTarget as Node | null) && !pinned) scheduleClose();
      }}
      onClick={() => {
        cancelClose();
        if (pinned) { setPinned(false); setOpen(false); }
        else { setPinned(true); setOpen(true); }
      }}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--blue)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
      >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="7.25" /><path d="M10 9v4M10 6.5h.01" strokeLinecap="round" />
      </svg>
    </button>
    {panel}
  </>;
};
