import React, { useRef } from 'react';
import { X } from 'lucide-react';
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
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[var(--card)] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)]/60 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="daily-status-modal-title" className="text-base font-bold tracking-[-0.02em] text-[var(--text)]">
              Estado de hoy y evolución (7 días)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-soft)]">
              Registrá sueño, energía y ánimo, o revisá tu tendencia semanal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar estado diario"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <PersonalContextCard
            state={state}
            onUpdateState={onUpdateState}
            onNavigate={(view) => {
              onClose();
              onNavigate?.(view);
            }}
            className="border-0 shadow-none"
          />
        </div>
      </div>
    </div>
  );
};
