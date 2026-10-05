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
import { fmtMoney } from '../lib/storage';

interface BentoCommandBarProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onNavigate: (view: ViewType) => void;
  onOpenSearch?: () => void;
  onOpenCapture?: () => void;
  onQuickAction?: (view: ViewType, focusId: string, txType?: 'gasto' | 'ingreso') => void;
}

export const BentoCommandBar: React.FC<BentoCommandBarProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onOpenSearch,
  onOpenCapture,
  onQuickAction,
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
        showToast('Error al persistir localmente.', 'error');
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
        showToast('Error al persistir localmente.', 'error');
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
    <div className="w-full flex flex-col gap-3">
      <div className={`w-full rounded-2xl bg-[var(--card)] border transition-all duration-200 ${
        isFocused || input.trim()
          ? 'p-3 sm:p-4 border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_8px_24px_-4px_rgba(99,102,241,0.18)]'
          : 'p-2 sm:p-2.5 border-[var(--border)] hover:border-[var(--border-hover)] shadow-2xs hover:shadow-xs'
      }`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            {/* Leading Icon / Custom Signature Capture Spark */}
            <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500/15 to-blue-500/10 text-indigo-600 dark:text-indigo-400 shrink-0 transition-all ${
              isFocused || input.trim() ? 'h-8 w-8 ring-2 ring-indigo-500/30 shadow-2xs' : 'h-7 w-7'
            }`}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="transition-transform duration-200" aria-hidden="true">
                <path d="M8 1.5L9.6 6.4L14.5 8L9.6 9.6L8 14.5L6.4 9.6L1.5 8L6.4 6.4L8 1.5Z" fill="currentColor" fillOpacity={isFocused ? '1' : '0.85'} />
              </svg>
            </div>

            {/* Central Input */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={isFocused ? 'Ej. 1200 nafta, repasar física mañana, idea nueva...' : '✦ Capturá algo: gasto, tarea, examen, nota rápida...'}
              className={`flex-1 min-w-0 bg-transparent font-medium text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none transition-all ${
                isFocused || input.trim() ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
              } ${state.settings.privacyMode ? 'privacy-sensitive' : ''}`}
            />

            {/* Desktop Quick Shortcuts (Search & Universal Modal) */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-mono font-bold text-[var(--text-faint)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
                  title="Abrir paleta de comandos (⌘K)"
                >
                  <span>⌘K</span>
                </button>
              )}
              {onOpenCapture && (
                <button
                  type="button"
                  onClick={onOpenCapture}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-500/25 bg-indigo-500/10 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 transition cursor-pointer"
                  title="Abrir ventana de captura universal (C)"
                >
                  <AppIcon name="plus" className="h-3 w-3 text-indigo-500" />
                  <kbd className="font-mono text-[9px] text-indigo-600 dark:text-indigo-400">C</kbd>
                </button>
              )}
            </div>

            {/* Submit Circular Button */}
            <button
              type="submit"
              disabled={!input.trim()}
              className={`flex items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:brightness-110 active:scale-95 disabled:opacity-25 disabled:pointer-events-none text-white transition-all cursor-pointer shrink-0 shadow-2xs border border-white/10 ${
                isFocused || input.trim() ? 'h-8 w-8' : 'h-7 w-7'
              }`}
              aria-label="Capturar"
              title="Capturar y revisar borrador (Enter)"
            >
              <AppIcon name="arrowUp" className={`${isFocused || input.trim() ? 'h-4 w-4' : 'h-3.5 w-3.5'} text-white`} />
            </button>
          </div>

          {/* Smart Intent Match Live Preview Badge */}
          {liveDrafts.length > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs text-[var(--text-soft)] font-medium flex-wrap">
              {liveDrafts.length === 1 ? (
                <LiveDraftPreview draft={liveDrafts[0]} />
              ) : (
                <div className="flex items-center gap-1.5">
                  <AppIcon name="sparkles" className="h-3.5 w-3.5 text-indigo-500" />
                  <span>
                    Se detectaron <strong className="text-[var(--text)]">{liveDrafts.length} intenciones</strong> independientes. Presioná <strong className="text-[var(--text)]">Enter</strong> para generar borradores.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Suggested Shortcut Chips (Recent actions) */}
          {(isModuleEnabled(state, 'finanzas') || isModuleEnabled(state, 'gimnasio') || isModuleEnabled(state, 'notas')) && (
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

              <span className="text-[10px] text-[var(--text-faint)] hidden md:inline font-mono">
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
        <AppIcon name="wallet" className="h-3.5 w-3.5 text-emerald-500" />
        <span>
          Detectado como <strong className="text-[var(--text)]">{draft.type === 'ingreso' ? 'Ingreso' : 'Gasto'}</strong>
          {draft.amount !== undefined && (
            <>
              {' '}de{' '}
              <strong className="text-[var(--text)]">
                <PrivacyAmount>{fmtMoney(draft.amount)}</PrivacyAmount>
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
