import React, { useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import { isWeeklyReviewDue, weeklyReviewExceptions } from '../lib/review';
import { todayISO } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';
import { GuidedWeeklyReviewModal } from './GuidedWeeklyReviewModal';

interface WeeklyReviewCardProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  borderLess?: boolean;
}

export const WeeklyReviewCard: React.FC<WeeklyReviewCardProps> = ({ state, onUpdateState, onNavigate, borderLess }) => {
  const exceptions = weeklyReviewExceptions(state);
  const needsReview = isWeeklyReviewDue(state);
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
      <section className={`today-attention-row ${borderLess ? '' : 'border-t border-[var(--border)]/70'}`}>
        <span className="today-attention-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)]">
          <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
        </span>

        <div className="today-attention-copy min-w-0">
          <strong className="block text-[13px] font-semibold text-[var(--text)]">{state.settings.lastWeeklyReviewAt ? 'Revisión semanal pendiente' : 'Revisá tu semana'}</strong>
          <span className="block text-xs leading-relaxed text-[var(--text-soft)]">
            {exceptions.length > 0
              ? `${exceptions.length} ${exceptions.length === 1 ? 'asunto' : 'asuntos'} para revisar`
              : 'Repasá tus actividades y próximas prioridades.'}
          </span>
        </div>

        <div className="today-attention-actions flex flex-wrap items-center gap-1.5">
          {needsReview && (
            <button
              type="button"
              onClick={handleMarkReviewed}
              className="hidden min-h-11 rounded-lg px-2 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] sm:block"
            >
              Ya revisé la semana
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsGuidedReviewOpen(true)}
            className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-[var(--blue)] transition-colors hover:bg-[var(--surface-muted)]"
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

