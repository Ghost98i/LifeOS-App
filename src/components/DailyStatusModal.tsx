import React, { useRef } from 'react';
import { Activity, X } from 'lucide-react';
import type { LifeOSState, ViewType } from '../types';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { PersonalContextCard } from './PersonalContextCard';

export interface DailyStatusModalProps {
  open: boolean;
  onClose: () => void;
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  onNavigate?: (view: ViewType) => void;
}

export const DailyStatusModal: React.FC<DailyStatusModalProps> = ({
  open,
  onClose,
  state,
  onUpdateState,
  onNavigate,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-status-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-xl dark:border-white/[0.07] dark:bg-[#0D111A] dark:shadow-none sm:rounded-2xl"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-white/[0.06] sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Activity
              className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <h2
              id="daily-status-modal-title"
              className="truncate text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100"
            >
              Estado de hoy y evolución (7 días)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar estado diario"
            className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
          <PersonalContextCard
            state={state}
            onUpdateState={onUpdateState}
            onNavigate={(view) => {
              onClose();
              onNavigate?.(view);
            }}
            embedded={true}
          />
        </div>
      </div>
    </div>
  );
};
