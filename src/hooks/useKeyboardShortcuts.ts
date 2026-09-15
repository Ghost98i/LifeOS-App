import { useEffect, useRef } from 'react';
import type { ViewType } from '../types';

export interface KeyboardShortcutsHandlers {
  onNavigate: (view: ViewType) => void;
  onOpenQuickCapture: () => void;
  onOpenQuickNote?: () => void;
  onToggleCommandPalette: () => void;
  onTogglePrivacy?: () => void;
  onCloseModals: () => void;
  isModalOpen?: boolean;
}

function isEditing(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true'
  );
}

export function useKeyboardShortcuts({
  onNavigate,
  onOpenQuickCapture,
  onOpenQuickNote,
  onToggleCommandPalette,
  onTogglePrivacy,
  onCloseModals,
  isModalOpen = false,
}: KeyboardShortcutsHandlers): void {
  const pendingPrefixRef = useRef<'g' | null>(null);
  const prefixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlersRef = useRef({
    onNavigate,
    onOpenQuickCapture,
    onOpenQuickNote,
    onToggleCommandPalette,
    onTogglePrivacy,
    onCloseModals,
    isModalOpen,
  });

  // Keep handlers up to date without re-attaching listeners
  useEffect(() => {
    handlersRef.current = {
      onNavigate,
      onOpenQuickCapture,
      onOpenQuickNote,
      onToggleCommandPalette,
      onTogglePrivacy,
      onCloseModals,
      isModalOpen,
    };
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const {
        onNavigate,
        onOpenQuickCapture,
        onOpenQuickNote,
        onToggleCommandPalette,
        onTogglePrivacy,
        onCloseModals,
        isModalOpen,
      } = handlersRef.current;

      // 1. Command Palette (Ctrl+K or Cmd+K) - always available
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onToggleCommandPalette();
        return;
      }

      // 2. Escape - close modals/palette/overlays
      if (event.key === 'Escape') {
        onCloseModals();
        pendingPrefixRef.current = null;
        if (prefixTimerRef.current) clearTimeout(prefixTimerRef.current);
        return;
      }

      // If user is typing in an input, textarea, select, contenteditable -> ignore all single-key / sequence shortcuts
      if (isEditing(event.target)) {
        return;
      }

      // If a modal or palette is open, do not trigger background navigation or capture
      if (isModalOpen) {
        return;
      }

      // Privacy toggle: Shift + P
      if (event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (onTogglePrivacy) onTogglePrivacy();
        return;
      }

      // Ignore if modifier keys are active
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      // Check if we are waiting for the second key of a 'G' sequence
      if (pendingPrefixRef.current === 'g') {
        pendingPrefixRef.current = null;
        if (prefixTimerRef.current) clearTimeout(prefixTimerRef.current);

        switch (key) {
          case 'h': // G H -> Dashboard / Hoy
            event.preventDefault();
            onNavigate('dashboard');
            return;
          case 'f': // G F -> Finanzas
            event.preventDefault();
            onNavigate('finanzas');
            return;
          case 'g': // G G -> Gimnasio
            event.preventDefault();
            onNavigate('gimnasio');
            return;
          case 't': // G T -> Trabajo
            event.preventDefault();
            onNavigate('trabajo');
            return;
          case 'a': // G A -> Agenda
            event.preventDefault();
            onNavigate('agenda');
            return;
          case 'n': // G N -> Notas
            event.preventDefault();
            onNavigate('notas');
            return;
          default:
            break;
        }
      }

      // Check for first key 'g' (prefix for navigation)
      if (key === 'g') {
        pendingPrefixRef.current = 'g';
        if (prefixTimerRef.current) clearTimeout(prefixTimerRef.current);
        prefixTimerRef.current = setTimeout(() => {
          pendingPrefixRef.current = null;
        }, 1000);
        return;
      }

      // Quick Note shortcut: Shift + N or Q (if handler provided)
      if ((event.shiftKey && key === 'n') || key === 'q') {
        if (onOpenQuickNote) {
          event.preventDefault();
          onOpenQuickNote();
          return;
        }
      }

      // Quick Capture universal: 'n' (or 'c') without Shift
      if (!event.shiftKey && (key === 'n' || key === 'c')) {
        event.preventDefault();
        onOpenQuickCapture();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (prefixTimerRef.current) clearTimeout(prefixTimerRef.current);
    };
  }, []);
}
