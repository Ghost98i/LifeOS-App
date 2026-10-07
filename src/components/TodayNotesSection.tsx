import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Postit } from '../types';
import { formatRelativeTime } from '../lib/notesFlows';
import { AppIcon } from './AppIcon';

interface TodayNotesSectionProps {
  pinnedNotes: Postit[];
  recentNotes: Postit[];
  privacyMode?: boolean;
  onNavigate: () => void;
  onAddNote: () => void;
}

const noteTitle = (note: Postit): string =>
  note.title?.trim() || note.text.trim().split('\n')[0] || 'Nota sin título';

export const TodayNotesSection: React.FC<TodayNotesSectionProps> = ({
  pinnedNotes,
  recentNotes,
  privacyMode,
  onNavigate,
  onAddNote,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [transitionFrom, setTransitionFrom] = useState<Postit | null>(null);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const transitionTimerRef = useRef<number | null>(null);
  const activeNote = pinnedNotes[activeIndex] || pinnedNotes[0];

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    setActiveIndex((current) => current < pinnedNotes.length ? current : 0);
    setTransitionFrom(null);
  }, [pinnedNotes.length]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const navigateTo = useCallback((nextIndex: number, nextDirection: 'next' | 'previous') => {
    if (!activeNote || nextIndex === activeIndex || transitionFrom) return;

    if (prefersReducedMotion) {
      setActiveIndex(nextIndex);
      return;
    }

    setDirection(nextDirection);
    setTransitionFrom(activeNote);
    setActiveIndex(nextIndex);
    transitionTimerRef.current = window.setTimeout(() => {
      setTransitionFrom(null);
      transitionTimerRef.current = null;
    }, 340);
  }, [activeIndex, activeNote, prefersReducedMotion, transitionFrom]);

  const showPrevious = useCallback(() => {
    navigateTo((activeIndex - 1 + pinnedNotes.length) % pinnedNotes.length, 'previous');
  }, [activeIndex, navigateTo, pinnedNotes.length]);

  const showNext = useCallback(() => {
    navigateTo((activeIndex + 1) % pinnedNotes.length, 'next');
  }, [activeIndex, navigateTo, pinnedNotes.length]);

  useEffect(() => {
    if (pinnedNotes.length < 2 || isPaused || prefersReducedMotion || transitionFrom) return;
    const timer = window.setInterval(showNext, 8000);
    return () => window.clearInterval(timer);
  }, [isPaused, pinnedNotes.length, prefersReducedMotion, showNext, transitionFrom]);

  const privacyClass = privacyMode ? 'privacy-sensitive' : '';

  return (
    <section
      className="space-y-3"
      aria-labelledby="today-notes-title"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
      }}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onPointerDown={() => setIsPaused(true)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-soft)]">
            <AppIcon name="note" className="h-3.5 w-3.5" />
          </span>
          <h3 id="today-notes-title" className="text-xs font-bold text-[var(--text)] sm:text-sm">Notas</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAddNote}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text)]"
          >
            <AppIcon name="plus" className="h-3 w-3" />
            Nota
          </button>
          <button type="button" onClick={onNavigate} className="text-[11px] font-bold text-[var(--blue)] hover:underline">
            Ver todas
          </button>
        </div>
      </div>

      {activeNote && (
        <div className="space-y-2" role="region" aria-roledescription="carrusel" aria-label="Notas fijadas">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Fijadas</p>
            {pinnedNotes.length > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={showPrevious} className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]" aria-label="Nota fijada anterior">
                  <AppIcon name="chevronLeft" className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={showNext} className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]" aria-label="Nota fijada siguiente">
                  <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="relative min-h-36 overflow-hidden rounded-xl">
            {transitionFrom && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={onNavigate}
                className={`absolute inset-0 flex w-full flex-col rounded-xl border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3.5 text-left pointer-events-none ${direction === 'next' ? 'note-carousel-exit-next' : 'note-carousel-exit-previous'}`}
              >
                <span className={`line-clamp-1 text-sm font-semibold leading-5 text-[var(--text)] ${privacyClass}`}>
                  {noteTitle(transitionFrom)}
                </span>
                {transitionFrom.title && transitionFrom.text.trim() && (
                  <span className={`mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-soft)] ${privacyClass}`}>
                    {transitionFrom.text.trim()}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onNavigate}
              onAnimationEnd={() => {
                if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
                transitionTimerRef.current = null;
                setTransitionFrom(null);
              }}
              className={`absolute inset-0 flex w-full flex-col rounded-xl border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3.5 text-left transition-colors hover:border-[var(--border-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] ${transitionFrom ? (direction === 'next' ? 'note-carousel-enter-next' : 'note-carousel-enter-previous') : ''}`}
              aria-label={`Abrir nota fijada ${activeIndex + 1} de ${pinnedNotes.length}: ${noteTitle(activeNote)}`}
            >
              <span className={`line-clamp-1 text-sm font-semibold leading-5 text-[var(--text)] ${privacyClass}`}>
                {noteTitle(activeNote)}
              </span>
              {activeNote.title && activeNote.text.trim() && (
                <span className={`mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-soft)] ${privacyClass}`}>
                  {activeNote.text.trim()}
                </span>
              )}
            </button>
          </div>

          {pinnedNotes.length > 1 && (
            <div className="flex justify-center gap-1.5" aria-label={`Nota ${activeIndex + 1} de ${pinnedNotes.length}`}>
              {pinnedNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => navigateTo(index, index > activeIndex ? 'next' : 'previous')}
                  className={`h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none ${index === activeIndex ? 'w-4 bg-[var(--text-soft)]' : 'w-1.5 bg-[var(--border-hover)] hover:bg-[var(--text-faint)]'}`}
                  aria-label={`Mostrar nota fijada ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {recentNotes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Recientes</p>
          <div className="divide-y divide-[var(--border)]/70">
            {recentNotes.map((note) => (
              <button key={note.id} type="button" onClick={onNavigate} className="group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-[var(--surface-muted)]/50">
                <span className={`min-w-0 flex-1 truncate text-xs font-medium text-[var(--text)] group-hover:text-[var(--blue)] ${privacyClass}`}>
                  {noteTitle(note)}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--text-faint)]">
                  {formatRelativeTime(note.updatedAt || note.createdAt || note.date)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
