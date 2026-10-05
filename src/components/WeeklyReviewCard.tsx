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
  const needsReview = !reviewed || exceptions.length > 0;
  const [expanded, setExpanded] = useState(needsReview);
  const [isGuidedReviewOpen, setIsGuidedReviewOpen] = useState(false);
  const toneClass = { urgent: 'bg-rose-500', attention: 'bg-amber-500', info: 'bg-blue-500' } as const;

  const handleMarkReviewed = () => {
    playSound('success');
    onUpdateState((draft) => {
      draft.settings.lastWeeklyReviewAt = todayISO();
    });
  };

  // If already reviewed and no exceptions, render ultra-compact discreet bar
  if (!needsReview && !expanded) {
    return (
      <>
        <section className="rounded-2xl border border-[var(--border)] bg-gradient-to-r from-[var(--card)] to-[var(--card-subtle)] px-3.5 py-2.5 shadow-xs transition-all flex items-center justify-between text-xs text-[var(--text-soft)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 shadow-2xs">
              <AppIcon name="check" className="h-3 w-3" />
            </span>
            <span className="font-bold text-[11px] text-[var(--text)] truncate">
              Revisión semanal al día
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsGuidedReviewOpen(true)}
            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0"
          >
            Abrir
          </button>
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
  }

  return (
    <>
      <section className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xs transition-all ${
        expanded ? 'p-3.5 sm:p-4' : 'px-3.5 py-2.5'
      }`}>
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-3 text-left cursor-pointer group"
        >
          <span className={`flex h-7 w-7 items-center justify-center rounded-xl shrink-0 shadow-2xs ${
            exceptions.length > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
          }`}>
            <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <strong className="block text-xs sm:text-sm font-bold text-[var(--text)]">Revisión Semanal</strong>
            <span className="text-[10px] sm:text-[11px] text-[var(--text-soft)]">
              {exceptions.length === 0
                ? 'Semana sin revisar'
                : `${exceptions.length} excepción(es) requieren revisión`}
            </span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
              exceptions.length ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25' : 'bg-[var(--surface-muted)] text-[var(--text-faint)]'
            }`}
          >
            {exceptions.length}
          </span>
          <AppIcon
            name={expanded ? 'chevronUp' : 'chevronDown'}
            className="h-3.5 w-3.5 text-[var(--text-faint)] group-hover:text-[var(--text)] transition-colors"
          />
        </button>

        {expanded && (
          <div className="mt-2.5 space-y-2 border-t border-[var(--border)] pt-2.5">
            {exceptions.length === 0 ? (
              <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                ✓ No hay excepciones críticas pendientes esta semana.
              </p>
            ) : (
              exceptions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.view)}
                  className="flex w-full items-start gap-2 rounded-xl border border-[var(--border)] p-2 text-left hover:border-[var(--blue)] hover:bg-[var(--surface-muted)] transition-all cursor-pointer group"
                >
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${toneClass[item.tone]}`} />
                  <div className="flex-1 min-w-0">
                    <strong className="block text-[11px] font-bold text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">
                      {item.title}
                    </strong>
                    <span className="block text-[10px] text-[var(--text-soft)] truncate">
                      {item.detail}
                    </span>
                  </div>
                  <AppIcon name="arrowRight" className="h-3 w-3 text-[var(--text-faint)] group-hover:text-[var(--blue)] shrink-0 mt-0.5 transition-colors" />
                </button>
              ))
            )}

            <div className="mt-2.5 pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsGuidedReviewOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 py-1.5 px-3 text-[11px] font-bold text-white shadow-2xs transition-all cursor-pointer"
              >
                <span>🧭 Revisión Guiada</span>
              </button>
              <button
                type="button"
                onClick={handleMarkReviewed}
                className="rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--border)]/50 border border-[var(--border)] py-1.5 px-2.5 text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] transition-colors cursor-pointer"
                title="Marcar revisión rápida sin asistente"
              >
                {reviewed ? '✓ Hecha' : 'Marcar hecha'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Guided Review Modal */}
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

