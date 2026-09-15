import React, { useState, useEffect, useRef } from 'react';
import { AppIcon } from './AppIcon';

export interface QuickNoteModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (snippet: string) => void;
}

export const QuickNoteModal: React.FC<QuickNoteModalProps> = ({
  open,
  onClose,
  onSave,
}) => {
  const [snippet, setSnippet] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSnippet('');
      const timer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = snippet.trim();
    if (!clean) return;
    onSave(clean);
    setSnippet('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-note-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl transition-all space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <AppIcon name="note" className="h-4 w-4" />
            </div>
            <div>
              <h2 id="quick-note-title" className="text-base font-extrabold text-[var(--text)] tracking-tight">
                Nota rápida
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                Se guardará directamente en tus Notas / Post-its
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
            aria-label="Cerrar modal"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <textarea
              ref={textareaRef}
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí un apunte, número, idea o fragmento de texto..."
              rows={4}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)] resize-y min-h-[110px] max-h-[260px] transition-colors"
            />
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <div className="text-[11px] font-mono text-[var(--text-faint)]">
              <span className="hidden sm:inline">Ctrl+Enter para guardar · Esc para cerrar</span>
              <span className="sm:hidden">{snippet.length} caracteres</span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!snippet.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--blue-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <AppIcon name="check" className="h-3.5 w-3.5" />
                <span>Guardar nota</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
