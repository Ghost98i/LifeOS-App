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
  const [expanded, setExpanded] = useState(!reviewed && exceptions.length > 0);
  const [isGuidedReviewOpen, setIsGuidedReviewOpen] = useState(false);
  const toneClass = { urgent: 'bg-rose-500', attention: 'bg-amber-500', info: 'bg-blue-500' } as const;

  const handleMarkReviewed = () => {
    playSound('success');
    onUpdateState((draft) => {
      draft.settings.lastWeeklyReviewAt = todayISO();
    });
  };

  return (
    <>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs transition-all">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-3 text-left cursor-pointer group"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 shrink-0">
            <AppIcon name="rotateCcw" className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <strong className="block text-sm font-bold text-[var(--text)]">Revisión Semanal</strong>
            <span className="text-[11px] text-[var(--text-soft)]">
              {exceptions.length === 0
                ? 'Todo está al día'
                : `${exceptions.length} asunto(s) requieren atención`}
            </span>
          </div>
          <span
            className={`rounded-lg px-2 py-0.5 text-xs font-mono font-bold ${
              exceptions.length ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
            }`}
          >
            {exceptions.length}
          </span>
          <AppIcon
            name={expanded ? 'chevronUp' : 'chevronDown'}
            className="h-4 w-4 text-[var(--text-faint)] group-hover:text-[var(--text)] transition-colors"
          />
        </button>

        {expanded && (
          <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
            {exceptions.length === 0 ? (
              <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-medium text-emerald-600">
                ✓ Todo está razonablemente al día. No hay asuntos críticos pendientes.
              </p>
            ) : (
              exceptions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.view)}
                  className="flex w-full items-start gap-2.5 rounded-xl border border-[var(--border)] p-2.5 text-left hover:border-[var(--blue)] hover:bg-[var(--surface-muted)] transition-all cursor-pointer group"
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toneClass[item.tone]}`} />
                  <div className="flex-1 min-w-0">
                    <strong className="block text-xs font-bold text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">
                      {item.title}
                    </strong>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-soft)]">
                      {item.detail}
                    </span>
                  </div>
                  <AppIcon name="arrowRight" className="h-3.5 w-3.5 text-[var(--text-faint)] group-hover:text-[var(--blue)] shrink-0 mt-0.5 transition-colors" />
                </button>
              ))
            )}

            <div className="mt-3 pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setIsGuidedReviewOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 py-2.5 px-3 text-xs font-bold text-white shadow-xs transition-all cursor-pointer"
              >
                <span>🧭 Iniciar Revisión Guiada</span>
              </button>
              <button
                type="button"
                onClick={handleMarkReviewed}
                className="rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--border)]/50 border border-[var(--border)] py-2 px-3 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] transition-colors cursor-pointer"
                title="Marcar revisión rápida sin asistente"
              >
                {reviewed ? 'Revisado ✓' : 'Marcar hecha'}
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

