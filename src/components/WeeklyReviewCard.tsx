import React, { useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { reviewedThisWeek, weeklyReviewExceptions } from '../lib/review';
import { todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';
import { GuidedWeeklyReviewModal } from './GuidedWeeklyReviewModal';

interface WeeklyReviewCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
}

export const WeeklyReviewCard: React.FC<WeeklyReviewCardProps> = ({ state, onUpdateState, onNavigate }) => {
  const exceptions = weeklyReviewExceptions(state);
  const reviewed = reviewedThisWeek(state);
  const needsReview = !reviewed;
  const [isGuidedReviewOpen, setIsGuidedReviewOpen] = useState(false);

  const handleMarkReviewed = () => {
    playSound('success');
    onUpdateState((draft) => {
      draft.settings.lastWeeklyReviewAt = todayISO();
    });
  };

  if (!needsReview) return null;

  return (
    <>
      <section className="flex items-center gap-3 border-t border-[var(--border)]/70 px-1 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <strong className="block text-xs font-semibold text-[var(--text)]">Revisión semanal pendiente</strong>
          <span className="block truncate text-[10px] text-[var(--text-soft)] sm:text-[11px]">
            {exceptions.length > 0
              ? `${exceptions.length} ${exceptions.length === 1 ? 'señal requiere' : 'señales requieren'} tu revisión`
              : 'Todavía no completaste la revisión de esta semana'}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!reviewed && (
            <button
              type="button"
              onClick={handleMarkReviewed}
              className="hidden rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] sm:block"
            >
              Marcar hecha
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsGuidedReviewOpen(true)}
            className="rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 transition-colors hover:bg-[var(--surface-muted)] dark:text-indigo-400"
          >
            Revisar
          </button>
        </div>
      </section>

      <GuidedWeeklyReviewModal
        state={state}
        open={isGuidedReviewOpen}
        onClose={() => setIsGuidedReviewOpen(false)}
        onUpdateState={onUpdateState}
        onNavigate={onNavigate}
      />
    </>
  );
};

