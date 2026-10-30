import React, { useEffect, useRef } from 'react';
import type { AttentionItem } from '../lib/todayAttention';
import { AppIcon, AppIconName } from './AppIcon';

export interface DismissedAttentionModalProps {
  open: boolean;
  onClose: () => void;
  dismissedItems: AttentionItem[];
  onRestoreItem: (item: AttentionItem) => void;
  onRestoreAll: () => void;
}

export const DismissedAttentionModal: React.FC<DismissedAttentionModalProps> = ({
  open,
  onClose,
  dismissedItems,
  onRestoreItem,
  onRestoreAll,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const getItemIcon = (signalKind: AttentionItem['signalKind']): AppIconName => {
    switch (signalKind) {
      case 'financial_commitment_due':
      case 'financial_agreement_due':
        return 'wallet';
      case 'task_overdue':
        return 'clock';
      case 'exam_upcoming':
        return 'book';
      case 'agenda_event_soon':
      case 'agenda_event_tomorrow':
        return 'calendarDays';
      case 'backup_urgent':
        return 'shield';
      default:
        return 'bell';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dismissed-attention-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl transition-all space-y-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)]/60 pb-3">
          <div>
            <h3 id="dismissed-attention-title" className="text-base font-bold text-[var(--text)]">
              Avisos descartados
            </h3>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">
              Avisos silenciados para su ocurrencia actual. Podés restaurarlos para que vuelvan a evaluarse en Atención ahora.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--surface-muted)] transition cursor-pointer"
            aria-label="Cerrar ventana de avisos descartados"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto space-y-2.5 pr-1">
          {dismissedItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-faint)]">
              No tenés avisos descartados actualmente.
            </div>
          ) : (
            dismissedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-[var(--border)]/60 bg-[var(--surface-muted)]/40 hover:bg-[var(--surface-muted)] transition"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <AppIcon name={getItemIcon(item.signalKind)} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <strong className="text-[13px] font-semibold text-[var(--text)]">
                        {item.title}
                      </strong>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--surface)] text-[var(--text-faint)] border border-[var(--border)]/60 uppercase tracking-wider font-semibold">
                        {item.module}
                      </span>
                    </div>
                    <span className="block truncate text-xs text-[var(--text-faint)] mt-0.5">
                      {item.detail}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRestoreItem(item)}
                  className="shrink-0 px-2.5 py-1 text-xs font-semibold text-[var(--blue)] hover:bg-[var(--blue)]/10 rounded-lg transition cursor-pointer"
                  aria-label={`Restaurar aviso: ${item.title}`}
                >
                  Restaurar
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/60">
          {dismissedItems.length > 1 ? (
            <button
              type="button"
              onClick={onRestoreAll}
              className="text-xs font-semibold text-[var(--text-faint)] hover:text-[var(--text)] transition underline cursor-pointer"
            >
              Restaurar todos
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-[var(--surface-muted)] text-[var(--text)] hover:bg-[var(--surface-muted)]/80 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
