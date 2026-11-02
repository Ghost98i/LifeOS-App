import React, { useMemo, useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import {
  parseCaptureDrafts,
  confirmCaptureDraft,
  canConfirmDraft,
  convertDraftToNote,
  enableModuleForDraft,
  CaptureDraft,
} from '../lib/quickCaptureDrafts';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { AppIcon } from './AppIcon';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { DraftConfirmationTray } from './DraftConfirmationTray';
import { PrivacyAmount } from './PrivacyAmount';
import { fmtMoney, formatMoney } from '../lib/storage';

interface BentoCommandBarProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onNavigate: (view: ViewType) => void;
  onOpenSearch?: () => void;
  onOpenCapture?: () => void;
  onQuickAction?: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
  compactBar?: boolean;
}

export const BentoCommandBar: React.FC<BentoCommandBarProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onOpenSearch,
  onOpenCapture,
  onQuickAction,
  compactBar = false,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [detectedDrafts, setDetectedDrafts] = useState<CaptureDraft[]>([]);
  const [confirmingDraftIds, setConfirmingDraftIds] = useState<Set<string>>(new Set());
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);

  // Live parsed drafts for preview chip while typing
  const liveDrafts = useMemo(() => {
    const trimmed = input.trim();
    if (trimmed.length < 2) return [];
    return parseCaptureDrafts(trimmed, state);
  }, [input, state]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = input.trim();
    if (!raw) return;

    const parsed = parseCaptureDrafts(raw, state);
    if (parsed.length > 0) {
      setDetectedDrafts((prev) => [...prev, ...parsed]);
      setInput('');
      playSound('click');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleConfirmDraft = (draft: CaptureDraft) => {
    if (confirmingDraftIds.has(draft.id)) return;
    const validation = canConfirmDraft(state, draft);
    if (!validation.valid) {
      showToast(validation.reason || 'Borrador no válido.', 'error');
      return;
    }
    setConfirmingDraftIds((prev) => new Set(prev).add(draft.id));

    try {
      let feedback: { message: string; sound: 'success' | 'coins' | 'click' } = {
        message: 'Elemento registrado.',
        sound: 'success',
      };
      const saved = onUpdateState((s) => {
        feedback = confirmCaptureDraft(s, draft);
      });
      if (saved === false) {
        showToast('No se pudo guardar en este dispositivo. El borrador sigue disponible.', 'error');
        return;
      }
      playSound(feedback.sound);
      showToast(feedback.message);
      setDetectedDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al registrar.', 'error');
    } finally {
      setConfirmingDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
    }
  };

  const handleConfirmAll = () => {
    if (isConfirmingAll) return;
    setIsConfirmingAll(true);
    try {
      let registeredCount = 0;
      const confirmedIds = new Set<string>();
      const saved = onUpdateState((s) => {
        for (const draft of detectedDrafts) {
          if (canConfirmDraft(s, draft).valid) {
            try {
              confirmCaptureDraft(s, draft);
              confirmedIds.add(draft.id);
              registeredCount++;
            } catch {
              // individual draft failed, keep in tray
            }
          }
        }
      });
      if (saved === false) {
        showToast('No se pudo guardar en este dispositivo. Los borradores siguen disponibles.', 'error');
        return;
      }
      if (registeredCount > 0) {
        playSound('success');
        showToast(`${registeredCount} elementos registrados.`);
      }
      setDetectedDrafts((prev) => prev.filter((d) => !confirmedIds.has(d.id)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al registrar borradores.', 'error');
    } finally {
      setIsConfirmingAll(false);
    }
  };

  const handleDiscardDraft = (draftId: string) => {
    setDetectedDrafts((prev) => prev.filter((d) => d.id !== draftId));
    playSound('click');
  };

  const handleDiscardAll = () => {
    setDetectedDrafts([]);
    playSound('click');
  };

  const handleUpdateDraft = (updated: CaptureDraft) => {
    setDetectedDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleEnableModule = (draft: CaptureDraft) => {
    onUpdateState((s) => {
      enableModuleForDraft(s, draft);
    });
    setDetectedDrafts((prev) =>
      prev.map((d) => (d.id === draft.id ? { ...d, isModuleEnabled: true } : d))
    );
    showToast(`Módulo activado.`);
  };

  const handleConvertToNote = (draft: CaptureDraft) => {
    const noteDraft = convertDraftToNote(draft);
    setDetectedDrafts((prev) => prev.map((d) => (d.id === draft.id ? noteDraft : d)));
    showToast('Convertido a nota.');
  };

  const handleConvertToInbox = (draft: CaptureDraft) => {
    const inboxDraft: CaptureDraft = {
      id: draft.id,
      rawText: draft.rawText,
      kind: 'inbox',
      targetModule: 'dashboard',
      isModuleEnabled: true,
      text: draft.rawText,
    };
    setDetectedDrafts((prev) => prev.map((d) => (d.id === draft.id ? inboxDraft : d)));
    showToast('Convertido a bandeja de entrada.');
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      <div className={`today-command-bar w-full rounded-2xl backdrop-blur-md transition-all duration-200 ${
        compactBar
          ? isFocused || input.trim()
            ? 'border border-blue-500/45 bg-[var(--card)] px-4 py-2.5 shadow-[0_10px_28px_-18px_rgba(37,99,235,.45)]'
            : 'border border-[var(--border)] bg-[var(--card)]/90 px-4 py-2.5 shadow-[var(--card-shadow)] hover:border-[var(--border-hover)]'
          : isFocused || input.trim()
          ? 'border border-blue-500/45 bg-[var(--card)] p-3 shadow-[0_10px_28px_-18px_rgba(37,99,235,.45)] sm:px-4'
          : 'border border-[var(--border)] bg-[var(--card)]/88 p-3 shadow-[var(--card-shadow)] hover:border-[var(--border-hover)] sm:px-4'
      }`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            {/* Quick Capture / Icons8 Square Plus */}
            <div className="relative flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 h-8 w-8">
              <AppIcon name="squarePlus" className="h-6 w-6 text-[#4F46E5] dark:text-indigo-400 transition-transform duration-200" />
            </div>

            {/* Central Input */}
            <input
              type="text"
              aria-label="Captura rápida"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={isFocused ? 'Ej. gasto de nafta, repasar física mañana, idea nueva…' : 'Capturá un gasto, tarea, examen o nota…'}
              className="flex-1 min-w-0 bg-transparent font-medium text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none text-sm sm:text-base transition-all"
            />

            {/* Desktop Quick Shortcuts (Search & Universal Modal) */}
            <div className={`${compactBar ? 'hidden' : 'hidden sm:flex'} items-center gap-1.5 shrink-0`}>
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[12px] font-mono font-bold text-[var(--text-faint)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
                  title={typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent) ? 'Abrir paleta de comandos (⌘K)' : 'Abrir paleta de comandos (Ctrl+K)'}
                >
                  <span>{typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'}</span>
                </button>
              )}
              {onOpenCapture && (
                <button
                  type="button"
                  onClick={onOpenCapture}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/25 bg-blue-500/10 text-[12px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-500/15 transition cursor-pointer"
                  title="Abrir ventana de captura universal (C)"
                >
                  <AppIcon name="squarePlus" className="h-4 w-4 text-[var(--blue)]" />
                  <kbd className="font-mono text-[11px] text-blue-600 dark:text-blue-400">C</kbd>
                </button>
              )}
            </div>

            {/* Submit Circular Button */}
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex items-center justify-center rounded-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] active:scale-95 disabled:opacity-25 disabled:pointer-events-none text-white transition-all cursor-pointer shrink-0 shadow-2xs border border-white/10 h-8 w-8"
              aria-label="Revisar captura"
              title="Revisar el borrador antes de guardar (Enter)"
            >
              <AppIcon name="arrowUp" className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* Smart Intent Match Live Preview Badge */}
          {liveDrafts.length > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--text-soft)] font-medium flex-wrap">
              {liveDrafts.length === 1 ? (
                <LiveDraftPreview draft={liveDrafts[0]} />
              ) : (
                <div className="flex items-center gap-1.5">
                  <AppIcon name="sparkles" className="h-3.5 w-3.5 text-blue-500" />
                  <span>
                    Hay <strong className="text-[var(--text)]">{liveDrafts.length} borradores</strong> para revisar. Presioná <strong className="text-[var(--text)]">Enter</strong>.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Suggested Shortcut Chips (Recent actions) */}
          {!compactBar && (isModuleEnabled(state, 'finanzas') || isModuleEnabled(state, 'gimnasio') || isModuleEnabled(state, 'notas')) && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] hidden sm:inline mr-1">
                  Atajos:
                </span>
                {isModuleEnabled(state, 'finanzas') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (onQuickAction) onQuickAction('finanzas', 'qa-focus-tx', 'gasto');
                        else onNavigate('finanzas');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer shrink-0"
                    >
                      <AppIcon name="plus" className="h-3 w-3 text-rose-500" />
                      <span>Gasto</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onQuickAction) onQuickAction('finanzas', 'qa-focus-tx', 'ingreso');
                        else onNavigate('finanzas');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer shrink-0"
                    >
                      <AppIcon name="plus" className="h-3 w-3 text-emerald-500" />
                      <span>Ingreso</span>
                    </button>
                  </>
                )}

                {isModuleEnabled(state, 'gimnasio') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onQuickAction) onQuickAction('gimnasio', 'qa-focus-peso');
                      else onNavigate('gimnasio');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer shrink-0"
                  >
                    <AppIcon name="dumbbell" className="h-3 w-3 text-blue-500" />
                    <span>Peso / Gym</span>
                  </button>
                )}

                {isModuleEnabled(state, 'notas') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('notas')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer shrink-0"
                  >
                    <AppIcon name="note" className="h-3 w-3 text-amber-500" />
                    <span>Notas</span>
                  </button>
                )}
              </div>

              <span className="text-[10px] text-[var(--text-faint)] hidden md:inline">
                Presioná Enter para capturar
              </span>
            </div>
          )}
        </form>
      </div>

      {/* Draft Confirmation Tray */}
      {detectedDrafts.length > 0 && (
        <DraftConfirmationTray
          drafts={detectedDrafts}
          state={state}
          confirmingDraftIds={confirmingDraftIds}
          isConfirmingAll={isConfirmingAll}
          onUpdateDraft={handleUpdateDraft}
          onConfirmDraft={handleConfirmDraft}
          onConfirmAll={handleConfirmAll}
          onDiscardDraft={handleDiscardDraft}
          onDiscardAll={handleDiscardAll}
          onEnableModule={handleEnableModule}
          onConvertToNote={handleConvertToNote}
          onConvertToInbox={handleConvertToInbox}
        />
      )}
    </div>
  );
};

const LiveDraftPreview: React.FC<{ draft: CaptureDraft }> = ({ draft }) => {
  if (draft.kind === 'finance') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon
          name="wallet"
          className={`h-3.5 w-3.5 ${draft.type === 'ingreso' ? 'text-emerald-500' : 'text-rose-500'}`}
        />
        <span>
          Detectado como <strong className="text-[var(--text)]">{draft.type === 'ingreso' ? 'Ingreso' : 'Gasto'}</strong>
          {draft.amount !== undefined && (
            <>
              {' '}de{' '}
              <strong className="text-[var(--text)]">
                <PrivacyAmount>{formatMoney(draft.amount, draft.currency || 'UYU')}</PrivacyAmount>
              </strong>
            </>
          )}
          {draft.categoryMatched && (
            <>
              {' '}en <strong className="text-[var(--text)]">{draft.categoryMatched}</strong>
            </>
          )}
          {!draft.isModuleEnabled && (
            <span className="text-amber-500 ml-1 font-semibold">(Módulo Finanzas desactivado)</span>
          )}
        </span>
      </div>
    );
  }

  if (draft.kind === 'study') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon name="book" className="h-3.5 w-3.5 text-indigo-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">Estudio</strong> ({draft.minutes} min) en{' '}
          <strong className="text-[var(--text)]">{draft.subjectName}</strong>
          {!draft.isModuleEnabled && (
            <span className="text-amber-500 ml-1 font-semibold">(Módulo Estudios desactivado)</span>
          )}
        </span>
      </div>
    );
  }

  if (draft.kind === 'task') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon name="check" className="h-3.5 w-3.5 text-blue-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">Tarea</strong>: {draft.text} ({draft.priority})
        </span>
      </div>
    );
  }

  if (draft.kind === 'note') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon name="note" className="h-3.5 w-3.5 text-amber-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">Nota rápida</strong>
        </span>
      </div>
    );
  }

  if (draft.kind === 'idea') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon name="zap" className="h-3.5 w-3.5 text-purple-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">Idea</strong>
        </span>
      </div>
    );
  }

  if (draft.kind === 'resale') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon name="repeat" className="h-3.5 w-3.5 text-cyan-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">Reventa</strong>: {draft.title}
          {draft.price !== undefined && (
            <>
              {' '}(<PrivacyAmount>{fmtMoney(draft.price)}</PrivacyAmount>)
            </>
          )}
        </span>
      </div>
    );
  }

  if (draft.kind === 'agenda') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppIcon name="calendar" className="h-3.5 w-3.5 text-teal-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">Agenda</strong>: {draft.activity}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <AppIcon name="note" className="h-3.5 w-3.5 text-[var(--text-soft)]" />
      <span>
        Detectado para <strong className="text-[var(--text)]">Bandeja de Entrada</strong>
      </span>
    </div>
  );
};
