import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Postit } from '../types';
import { formatRelativeTime } from '../lib/notesFlows';
import { AppIcon } from './AppIcon';

interface TodayNotesSectionProps {
  pinnedNotes: Postit[];
  recentNotes: Postit[];
  privacyMode?: boolean;
  onNavigate: () => void;
  onOpenNote: (noteId: string) => void;
  onAddNote: () => void;
}

const noteTitle = (note: Postit): string =>
  note.title?.trim() || note.text.trim().split('\n')[0] || 'Nota sin título';

export const TodayNotesSection: React.FC<TodayNotesSectionProps> = ({
  pinnedNotes,
  recentNotes,
  privacyMode,
  onNavigate,
  onOpenNote,
  onAddNote,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const activeNote = pinnedNotes[activeIndex] || pinnedNotes[0];

  useEffect(() => {
    setActiveIndex((current) => current < pinnedNotes.length ? current : 0);
  }, [pinnedNotes.length]);

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + pinnedNotes.length) % pinnedNotes.length);
  }, [pinnedNotes.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % pinnedNotes.length);
  }, [pinnedNotes.length]);

  return (
    <section
      className="space-y-2.5 sm:space-y-3"
      aria-labelledby="today-notes-title"
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="today-section-icon today-section-icon-notes">
            <AppIcon name="note" className="h-4 w-4" />
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <h2 id="today-notes-title" className="text-sm sm:text-base font-bold tracking-[-0.025em] text-[var(--text)]">Notas</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAddNote}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/70 px-2 text-[13px] font-medium text-[var(--text-soft)] transition-colors hover:border-amber-500/35 hover:text-[var(--text)] cursor-pointer"
          >
            <AppIcon name="plus" className="h-3 w-3 text-amber-500" />
            <span>Nota</span>
          </button>
          <button type="button" onClick={onNavigate} className="inline-flex items-center gap-0.5 text-[13px] font-bold text-[var(--blue)] hover:underline cursor-pointer">
            Ver todas <AppIcon name="arrowRight" className="h-3 w-3" />
          </button>
        </div>
      </div>

      {activeNote && (
        <div className="space-y-1.5" role="region" aria-roledescription="carrusel" aria-label="Notas fijadas">
          <div
            className="today-pinned-note relative rounded-xl border border-amber-500/30 bg-amber-500/[0.035] p-3 transition hover:border-amber-500/50 hover:bg-amber-500/[0.06] touch-pan-y"
            tabIndex={pinnedNotes.length > 1 ? 0 : undefined}
            onKeyDown={(event) => {
              if (pinnedNotes.length < 2) return;
              if (event.key === 'ArrowLeft') { event.preventDefault(); showPrevious(); }
              if (event.key === 'ArrowRight') { event.preventDefault(); showNext(); }
            }}
            onTouchStart={(event) => { touchStartRef.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              if (touchStartRef.current == null || pinnedNotes.length < 2) return;
              const delta = (event.changedTouches[0]?.clientX ?? touchStartRef.current) - touchStartRef.current;
              touchStartRef.current = null;
              if (Math.abs(delta) < 42) return;
              if (delta < 0) showNext();
              else showPrevious();
            }}
          >
            <div className="flex items-center justify-between text-[13px] font-medium text-amber-700 dark:text-amber-300 mb-1">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Fijada
              </span>
              {pinnedNotes.length > 1 && (
                <div className="flex items-center gap-1 font-semibold text-[var(--text-faint)]">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showPrevious(); }}
                    className="today-carousel-control cursor-pointer"
                    aria-label="Nota anterior"
                  >
                    <AppIcon name="chevronLeft" className="h-3 w-3" />
                  </button>
                  <span>{activeIndex + 1} / {pinnedNotes.length}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showNext(); }}
                    className="today-carousel-control cursor-pointer"
                    aria-label="Nota siguiente"
                  >
                    <AppIcon name="chevronRight" className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            <button
              key={activeNote.id}
              type="button"
              onClick={() => onOpenNote(activeNote.id)}
              className="today-note-enter block w-full text-left cursor-pointer"
            >
              <h3 className="line-clamp-1 text-sm font-semibold text-[var(--text)]">
                {privacyMode ? 'Nota fijada' : noteTitle(activeNote)}
              </h3>
              {!privacyMode && activeNote.title && activeNote.text.trim() && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-soft)]">
                  {activeNote.text.trim()}
                </p>
              )}
            </button>
          </div>
        </div>
      )}

      {recentNotes.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-[var(--border)]/50">
          <span className="text-[13px] font-medium text-[var(--text-soft)]">Recientes</span>
          <div className="divide-y divide-[var(--border)]/40">
            {recentNotes.slice(0, 2).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote(note.id)}
                className="flex w-full items-center justify-between py-1 px-1 text-left group hover:text-[var(--blue)] transition cursor-pointer"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--blue)] mr-2">
                  {privacyMode ? 'Nota reciente' : noteTitle(note)}
                </span>
                <span className="shrink-0 text-[12px] text-[var(--text-soft)]">
                  {formatRelativeTime(note.updatedAt || note.createdAt || note.date)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!activeNote && recentNotes.length === 0 && (
        <button
          type="button"
          onClick={onAddNote}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-amber-500/25 bg-amber-500/[0.035] px-3 py-2.5 text-left transition hover:border-amber-500/45 cursor-pointer"
        >
          <span className="text-xs font-semibold text-[var(--text)]">Guardá tu primera nota</span>
          <AppIcon name="plus" className="h-3.5 w-3.5 text-[var(--blue)]" />
        </button>
      )}
    </section>
  );
};
