import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EffortLevel, LifeOSState, ViewType } from '../types';
import {
  addQuickIdea,
  addQuickInbox,
  addQuickNote,
  addQuickReminder,
  addQuickTask,
  addQuickTransaction,
  convertInboxItem,
  deleteInboxItem,
  suggestedQuickAccountId,
} from '../lib/quickCapture';
import { parseQuickFinance } from '../utils/quickFinanceParser';
import { todayISO, uid, dayKeyFromDate, fmtDate } from '../lib/storage';
import { applyHistoryToTemplateExercises } from '../lib/gymMetrics';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { getActiveCategories } from '../lib/financeCategories';
import { isModuleEnabled } from '../lib/moduleVisibility';
import {
  parseCaptureDrafts,
  confirmCaptureDraft,
  canConfirmDraft,
  convertDraftToNote,
  enableModuleForDraft,
  type CaptureDraft,
} from '../lib/quickCaptureDrafts';
import { DraftConfirmationTray } from './DraftConfirmationTray';
import { PrivacyAmount } from './PrivacyAmount';

interface MobileQuickCaptureProps {
  state: LifeOSState;
  open: boolean;
  onClose: () => void;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onNavigate?: (view: ViewType) => void;
  initialKind?: CaptureKind;
}

export type CaptureKind = 'universal' | 'tarea' | 'gasto' | 'nota' | 'entrenamiento' | 'inbox' | 'idea' | 'recordatorio';

const captureOptions: { kind: CaptureKind; label: string; icon: string; desc: string; primary?: boolean }[] = [
  { kind: 'universal', label: 'Universal', icon: '✨', desc: 'Auto-detectar', primary: true },
  { kind: 'tarea', label: 'Tarea', icon: '✓', desc: 'Acción para hoy', primary: true },
  { kind: 'gasto', label: 'Gasto', icon: '−', desc: 'Parser rápido', primary: true },
  { kind: 'nota', label: 'Nota', icon: '✎', desc: 'Post-it o apunte', primary: true },
  { kind: 'entrenamiento', label: 'Entrenar', icon: '⚡', desc: 'Iniciar sesión', primary: true },
  { kind: 'inbox', label: 'Bandeja', icon: '📥', desc: 'Captura libre' },
  { kind: 'idea', label: 'Idea', icon: '💡', desc: 'Nueva propuesta' },
  { kind: 'recordatorio', label: 'Alerta', icon: '⏰', desc: 'Con hora/fecha' },
];

export const MobileQuickCapture: React.FC<MobileQuickCaptureProps> = ({
  state,
  open,
  onClose,
  onUpdateState,
  onNavigate,
  initialKind,
}) => {
  const [activeTab, setActiveTab] = useState<'capture' | 'inbox'>('capture');
  const [kind, setKind] = useState<CaptureKind>(() => initialKind || 'universal');
  const [universalInput, setUniversalInput] = useState('');
  const [mobileDrafts, setMobileDrafts] = useState<CaptureDraft[]>([]);
  const [confirmingDraftIds, setConfirmingDraftIds] = useState<Set<string>>(new Set());
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [text, setText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [priority, setPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [effort, setEffort] = useState<EffortLevel>('medium');
  const [reminderTime, setReminderTime] = useState('');
  const [date, setDate] = useState(todayISO());
  const [message, setMessage] = useState('');
  const [listening, setListening] = useState(false);

  // Fast Finance Parser state
  const [financeInput, setFinanceInput] = useState('');
  const [manualFinanceMode, setManualFinanceMode] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualAccountId, setManualAccountId] = useState('');

  const activeCategories = useMemo(
    () => getActiveCategories(state.finance?.categories),
    [state.finance?.categories]
  );

  const [manualCategory, setManualCategory] = useState(() => activeCategories[0]?.id || 'Otros');
  const [selectedWorkoutTemplateId, setSelectedWorkoutTemplateId] = useState<string>('');

  // Suggested account for finance
  const fallbackAccountId = useMemo(() => {
    return suggestedQuickAccountId(state, 'gasto');
  }, [state]);

  // Live parsed finance object
  const parsedFinance = useMemo(() => {
    return parseQuickFinance(financeInput, {
      accounts: state.finance?.accounts || [],
      categories: state.finance?.categories || [],
      defaultDate: date,
      defaultAccountId: manualAccountId || fallbackAccountId,
    });
  }, [financeInput, state.finance?.accounts, state.finance?.categories, date, manualAccountId, fallbackAccountId]);

  // Today's suggested workout
  const todayDayKey = dayKeyFromDate(new Date());
  const suggestedTemplate = useMemo(() => {
    const templates = state.gym?.routineTemplates || [];
    return (
      templates.find((t) => t.days?.includes(todayDayKey)) ||
      templates[0] ||
      null
    );
  }, [state.gym?.routineTemplates, todayDayKey]);

  const availableCaptureOptions = useMemo(() => {
    return captureOptions.filter((opt) => {
      if (opt.kind === 'gasto') return isModuleEnabled(state.settings, 'finanzas');
      if (opt.kind === 'nota') return isModuleEnabled(state.settings, 'notas');
      if (opt.kind === 'entrenamiento') return isModuleEnabled(state.settings, 'gimnasio');
      if (opt.kind === 'idea') return isModuleEnabled(state.settings, 'ia');
      return true;
    });
  }, [state.settings]);

  const prevOpenRef = useRef(false);

  useEffect(() => {
    const isOpening = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;

    const isAllowed = (k: CaptureKind) => {
      if (k === 'gasto') return isModuleEnabled(state.settings, 'finanzas');
      if (k === 'nota') return isModuleEnabled(state.settings, 'notas');
      if (k === 'entrenamiento') return isModuleEnabled(state.settings, 'gimnasio');
      if (k === 'idea') return isModuleEnabled(state.settings, 'ia');
      return true;
    };

    if (isOpening) {
      if (initialKind && isAllowed(initialKind)) {
        setKind(initialKind);
      } else {
        setKind((prev) => (isAllowed(prev) ? prev : 'universal'));
      }
      setUniversalInput('');
      setMobileDrafts([]);
      setDate(todayISO());
      setMessage('');
      setNoteTitle('');
      setNotePinned(false);
      setManualAccountId(fallbackAccountId);
      if (suggestedTemplate) {
        setSelectedWorkoutTemplateId(suggestedTemplate.id);
      }
    } else {
      // If module visibility changed while open, ensure kind remains valid without wiping drafts or input
      setKind((prev) => (isAllowed(prev) ? prev : 'universal'));
    }
  }, [open, initialKind, fallbackAccountId, suggestedTemplate, state.settings]);

  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const financeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (document.activeElement instanceof HTMLElement) {
      previousFocusedElementRef.current = document.activeElement;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (previousFocusedElementRef.current && typeof previousFocusedElementRef.current.focus === 'function') {
        previousFocusedElementRef.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (activeTab === 'capture') {
        if (kind === 'gasto' && !manualFinanceMode) {
          financeInputRef.current?.focus();
        } else if (kind !== 'entrenamiento') {
          inputRef.current?.focus();
        }
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open, kind, manualFinanceMode, activeTab]);

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleRequestClose = () => {
    const hasPendingContent = (kind === 'universal' && (mobileDrafts.length > 0 || universalInput.trim().length > 0)) ||
      (kind !== 'universal' && (text.trim().length > 0 || financeInput.trim().length > 0));

    if (hasPendingContent) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  const handleForceCloseDiscard = () => {
    setShowExitConfirm(false);
    onClose();
  };

  const handleForceCloseSaveInbox = () => {
    try {
      if (kind === 'universal') {
        if (universalInput.trim()) {
          onUpdateState((s) => {
            addQuickInbox(s, universalInput.trim(), 'quick-capture');
          });
        }
        for (const draft of mobileDrafts) {
          onUpdateState((s) => {
            addQuickInbox(s, draft.rawText, 'quick-capture');
          });
        }
      } else {
        const textToSave = text.trim() || financeInput.trim();
        if (textToSave) {
          onUpdateState((s) => {
            addQuickInbox(s, textToSave, 'quick-capture');
          });
        }
      }
      playSound('success');
      showToast('Guardado en Bandeja de Entrada');
    } catch {
      // ignore
    }
    setShowExitConfirm(false);
    onClose();
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleRequestClose();
    }
  };

  if (!open) return null;

  const handleStartWorkout = (templateId?: string) => {
    try {
      const template = (state.gym?.routineTemplates || []).find((t) => t.id === templateId) || null;
      const newSessionId = uid();
      const exercises = template
        ? applyHistoryToTemplateExercises(template.exercises, state.gym?.sessions || [])
        : [];

      onUpdateState((draft) => {
        if (!draft.gym) draft.gym = { sessions: [], exercises: [], routineTemplates: [], weight: [] } as any;
        if (!draft.gym.sessions) draft.gym.sessions = [];
        // mark any previous active session as completed
        draft.gym.sessions.forEach((s) => {
          if (s.status === 'active') {
            s.status = 'completed';
            if (!s.finishedAt) s.finishedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        });
        draft.gym.sessions.unshift({
          id: newSessionId,
          date: todayISO(),
          weekLabel: template?.name || undefined,
          startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          finishedAt: null,
          status: 'active',
          exercises,
        });
      });

      playSound('success');
      onClose();
      if (onNavigate) {
        onNavigate('gimnasio');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al iniciar entrenamiento.');
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (kind === 'gasto') {
        if (manualFinanceMode) {
          const amt = Number(manualAmount.replace(',', '.'));
          if (!Number.isFinite(amt) || amt <= 0) throw new Error('Ingresá un monto válido.');
          onUpdateState((draft) => {
            addQuickTransaction(draft, {
              type: 'gasto',
              amount: amt,
              accountId: manualAccountId || fallbackAccountId,
              category: manualCategory,
              note: text,
              date,
            });
          });
        } else {
          // Use parsed quick finance
          if (!parsedFinance.isValid || parsedFinance.amount === null) {
            throw new Error('Escribí un monto válido, ej: 500 comida banco');
          }
          const chosenAccountId = parsedFinance.accountId || manualAccountId || fallbackAccountId;
          onUpdateState((draft) => {
            addQuickTransaction(draft, {
              type: parsedFinance.type,
              amount: parsedFinance.amount!,
              accountId: chosenAccountId,
              category: parsedFinance.category || 'Otros',
              note: parsedFinance.note,
              date: parsedFinance.date,
            });
          });
        }
        playSound('coins');
      } else if (kind === 'inbox') {
        onUpdateState((draft) => {
          addQuickInbox(draft, text, 'quick-capture');
        });
        playSound('success');
      } else if (kind === 'tarea') {
        onUpdateState((draft) => {
          addQuickTask(draft, text, priority, date, effort);
        });
        playSound('success');
      } else if (kind === 'nota') {
        onUpdateState((draft) => {
          addQuickNote(draft, text, date, {
            title: noteTitle.trim() || undefined,
            pinned: notePinned,
          });
        });
        playSound('success');
      } else if (kind === 'idea') {
        if (!isModuleEnabled(state.settings, 'ia')) {
          throw new Error('El módulo IA está desactivado.');
        }
        onUpdateState((draft) => {
          addQuickIdea(draft, text);
        });
        playSound('success');
      } else if (kind === 'recordatorio') {
        onUpdateState((draft) => {
          addQuickReminder(draft, text, date, reminderTime);
        });
        playSound('success');
      }

      setMessage('✓ Guardado al instante');
      setText('');
      setFinanceInput('');
      setManualAmount('');
      window.setTimeout(onClose, 400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  const handleConvertInbox = (id: string, target: 'tarea' | 'nota' | 'recordatorio' | 'proyecto') => {
    try {
      onUpdateState((draft) => {
        convertInboxItem(draft, id, target);
      });
      playSound('success');
      const targetLabels: Record<string, string> = {
        tarea: 'tarea de hoy',
        proyecto: 'proyecto activo',
        nota: 'nota post-it',
        recordatorio: 'recordatorio',
      };
      showToast(`Convertido a ${targetLabels[target] || target}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo convertir.', 'error');
    }
  };

  const handleDiscardInbox = (id: string) => {
    onUpdateState((draft) => {
      deleteInboxItem(draft, id);
    });
    playSound('click');
    showToast('Elemento descartado de la bandeja', 'info');
  };

  const startDictation = () => {
    const browserWindow = window as typeof window & {
      webkitSpeechRecognition?: new () => any;
      SpeechRecognition?: new () => any;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setMessage('El dictado no está disponible en este navegador.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'es-UY';
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setMessage('No pude escuchar. Podés escribir con el teclado.');
    };
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) {
        if (kind === 'gasto' && !manualFinanceMode) {
          setFinanceInput((c) => (c ? `${c} ${transcript}` : transcript));
        } else if (kind === 'universal') {
          setUniversalInput((c) => (c ? `${c} ${transcript}` : transcript));
        } else {
          setText((c) => (c ? `${c} ${transcript}` : transcript));
        }
      }
    };
    recognition.start();
  };

  const handleUniversalParse = () => {
    const trimmed = universalInput.trim();
    if (!trimmed) return;
    const drafts = parseCaptureDrafts(trimmed, state);
    if (drafts.length > 0) {
      setMobileDrafts((prev) => [...prev, ...drafts]);
      setUniversalInput('');
      playSound('click');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs transition-opacity"
      onClick={handleRequestClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Captura universal"
        onKeyDown={handleDialogKeyDown}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--card)] border border-[var(--border)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform relative"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Exit Confirmation Dialog */}
        {showExitConfirm && (
          <div className="absolute inset-0 z-50 rounded-t-3xl sm:rounded-3xl bg-[var(--card)]/95 backdrop-blur-sm p-6 flex flex-col justify-center items-center text-center gap-4 animate-fadeIn">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="text-base font-bold text-[var(--text)]">¿Descartar cambios sin guardar?</h3>
              <p className="text-xs text-[var(--text-soft)] mt-1 max-w-xs">
                Tenés capturas o borradores pendientes. Podés guardarlos en la Bandeja de Entrada para no perderlos.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
              <button
                type="button"
                onClick={handleForceCloseSaveInbox}
                className="flex-1 py-2 px-3 rounded-xl bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold hover:opacity-90 transition cursor-pointer"
              >
                Guardar en Bandeja
              </button>
              <button
                type="button"
                onClick={handleForceCloseDiscard}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold hover:bg-rose-500/20 transition cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="py-2 px-3 rounded-xl bg-[var(--surface-muted)] text-[var(--text-soft)] text-xs font-semibold hover:bg-[var(--border)] transition cursor-pointer"
              >
                Volver
              </button>
            </div>
          </div>
        )}

        {/* Header & Mode Tabs */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--bg)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab('capture')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'capture'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-xs border border-[var(--border)] font-bold'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>Captura</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'inbox'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-xs border border-[var(--border)] font-bold'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>Bandeja</span>
              {(state.inbox || []).length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
                  {(state.inbox || []).length}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] font-bold flex items-center justify-center transition cursor-pointer"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {activeTab === 'inbox' ? (
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[var(--text)] block">
                  Bandeja de entrada personal ({(state.inbox || []).length})
                </span>
                <p className="text-[11px] text-[var(--text-faint)]">
                  Ideas y notas sin clasificar listas para convertir en 1 toque.
                </p>
              </div>
              {(state.inbox || []).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('capture');
                    setKind('inbox');
                  }}
                  className="rounded-lg bg-[var(--blue-soft)] border border-[var(--blue)]/30 px-2 py-1 text-[10px] font-bold text-[var(--blue)] cursor-pointer"
                >
                  ＋ Nueva
                </button>
              )}
            </div>

            {(state.inbox || []).length === 0 ? (
              <div className="py-10 text-center space-y-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-6">
                <span className="text-3xl block">✨</span>
                <p className="text-sm font-bold text-[var(--text)]">Bandeja al día</p>
                <p className="text-xs text-[var(--text-faint)] max-w-xs mx-auto">
                  No tenés capturas pendientes de clasificar. Escribí cualquier idea o pensamiento rápido para procesarlo cuando quieras.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('capture');
                    setKind('inbox');
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--blue-hover)] cursor-pointer"
                >
                  ⚡ Capturar en bandeja
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
                {(state.inbox || []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 space-y-2.5 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                        {item.text}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDiscardInbox(item.id)}
                        className="text-xs text-[var(--text-faint)] hover:text-rose-500 px-1.5 py-0.5 rounded cursor-pointer"
                        title="Descartar"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                      <span className="text-[10px] text-[var(--text-faint)] font-mono">
                        {fmtDate(item.createdAt.slice(0, 10))} • {item.createdAt.slice(11, 16)}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'tarea')}
                          className="rounded-lg bg-[var(--blue-soft)] border border-[var(--blue)]/30 px-2.5 py-1 text-[10px] font-bold text-[var(--blue)] hover:bg-[var(--blue)] hover:text-white transition cursor-pointer"
                        >
                          ✓ Tarea hoy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'proyecto')}
                          className="rounded-lg bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500 hover:text-white transition cursor-pointer"
                        >
                          🎯 Proyecto
                        </button>
                        {isModuleEnabled(state, 'notas') && (
                          <button
                            type="button"
                            onClick={() => handleConvertInbox(item.id, 'nota')}
                            className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                          >
                            📝 Nota
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'recordatorio')}
                          className="rounded-lg bg-slate-500/10 border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-soft)] hover:bg-[var(--text)] hover:text-[var(--bg)] transition cursor-pointer"
                        >
                          ⏰ Alerta
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Category Selector Chips */}
            <div className="flex flex-wrap gap-1.5 rounded-2xl bg-[var(--bg)] p-1.5 mb-4">
              {availableCaptureOptions.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => {
                    setKind(option.kind);
                    setMessage('');
                  }}
                  className={`flex-1 min-w-[52px] flex flex-col items-center justify-center rounded-xl py-2 px-1 text-[11px] font-bold transition cursor-pointer ${
                    kind === option.kind
                      ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs border border-[var(--border)]'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="text-base leading-none mb-1">{option.icon}</span>
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>

        {/* UNIVERSAL / WORKOUT / STANDARD TABS */}
        {kind === 'universal' ? (
          <div className="space-y-4 py-1">
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--text)] mb-1.5 block">
                  Captura Universal (intérprete inteligente)
                </span>
                <div className="relative flex gap-2">
                  <input
                    autoFocus
                    value={universalInput}
                    onChange={(e) => setUniversalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleUniversalParse();
                      }
                    }}
                    placeholder="Ej: 1200 nafta, estudiar redes mañana..."
                    className={`w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-3.5 px-4 text-sm font-medium outline-none focus:border-[var(--blue)] shadow-inner text-[var(--text)] ${
                      state.settings.privacyMode ? 'privacy-sensitive' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={startDictation}
                    className={`flex items-center justify-center w-12 h-12 rounded-2xl border transition cursor-pointer shrink-0 ${
                      listening
                        ? 'bg-rose-500 text-white animate-pulse border-rose-600'
                        : 'bg-[var(--card)] text-[var(--text-soft)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                    title="Dictado por voz"
                  >
                    🎤
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[var(--text-faint)]">
                  Podés combinar varias intenciones con &quot;y&quot;.
                </span>
                <button
                  type="button"
                  onClick={handleUniversalParse}
                  disabled={!universalInput.trim()}
                  className="px-4 py-2 rounded-xl bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold hover:opacity-90 active:scale-95 disabled:opacity-30 transition cursor-pointer shadow-xs"
                >
                  Interpretar
                </button>
              </div>
            </div>

            {mobileDrafts.length > 0 && (
              <DraftConfirmationTray
                drafts={mobileDrafts}
                state={state}
                confirmingDraftIds={confirmingDraftIds}
                isConfirmingAll={isConfirmingAll}
                onUpdateDraft={(updated) =>
                  setMobileDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
                }
                onConfirmDraft={(draft) => {
                  if (confirmingDraftIds.has(draft.id)) return;
                  const validation = canConfirmDraft(state, draft);
                  if (!validation.valid) {
                    setMessage(validation.reason || 'Borrador no válido.');
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
                      setMessage('Error al persistir localmente.');
                      return;
                    }
                    playSound(feedback.sound);
                    showToast(feedback.message);
                    setMobileDrafts((prev) => {
                      const next = prev.filter((d) => d.id !== draft.id);
                      if (next.length === 0) onClose();
                      return next;
                    });
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : 'Error al registrar.');
                  } finally {
                    setConfirmingDraftIds((prev) => {
                      const next = new Set(prev);
                      next.delete(draft.id);
                      return next;
                    });
                  }
                }}
                onConfirmAll={() => {
                  if (isConfirmingAll) return;
                  setIsConfirmingAll(true);
                  try {
                    let count = 0;
                    const confirmedIds = new Set<string>();
                    const saved = onUpdateState((s) => {
                      for (const d of mobileDrafts) {
                        if (canConfirmDraft(s, d).valid) {
                          try {
                            confirmCaptureDraft(s, d);
                            confirmedIds.add(d.id);
                            count++;
                          } catch {
                            // individual draft error, keep in tray
                          }
                        }
                      }
                    });
                    if (saved === false) {
                      setMessage('Error al persistir localmente.');
                      return;
                    }
                    if (count > 0) {
                      playSound('success');
                      showToast(`${count} elementos registrados.`);
                    }
                    setMobileDrafts((prev) => {
                      const remaining = prev.filter((d) => !confirmedIds.has(d.id));
                      if (remaining.length === 0) onClose();
                      return remaining;
                    });
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : 'Error al registrar borradores.');
                  } finally {
                    setIsConfirmingAll(false);
                  }
                }}
                onDiscardDraft={(draftId) => {
                  setMobileDrafts((prev) => prev.filter((d) => d.id !== draftId));
                }}
                onDiscardAll={() => {
                  setMobileDrafts([]);
                }}
                onEnableModule={(draft) => {
                  onUpdateState((s) => {
                    enableModuleForDraft(s, draft);
                  });
                  setMobileDrafts((prev) =>
                    prev.map((d) => (d.id === draft.id ? { ...d, isModuleEnabled: true } : d))
                  );
                  showToast('Módulo activado.');
                }}
                onConvertToNote={(draft) => {
                  const noteDraft = convertDraftToNote(draft);
                  setMobileDrafts((prev) =>
                    prev.map((d) => (d.id === draft.id ? noteDraft : d))
                  );
                  showToast('Convertido a nota.');
                }}
                onConvertToInbox={(draft) => {
                  const inboxDraft: CaptureDraft = {
                    id: draft.id,
                    rawText: draft.rawText,
                    kind: 'inbox',
                    targetModule: 'dashboard',
                    isModuleEnabled: true,
                    text: draft.rawText,
                  };
                  setMobileDrafts((prev) =>
                    prev.map((d) => (d.id === draft.id ? inboxDraft : d))
                  );
                  showToast('Convertido a bandeja de entrada.');
                }}
              />
            )}
          </div>
        ) : kind === 'entrenamiento' ? (
          <div className="space-y-4 py-1">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3">
              <span className="text-xs font-bold text-[var(--text)] block">
                {suggestedTemplate ? `Sugerido para hoy (${todayDayKey}):` : 'Iniciar sesión:'}
              </span>

              {suggestedTemplate && (
                <div className="flex items-center justify-between rounded-xl border border-[var(--blue)]/30 bg-[var(--blue-soft)]/20 p-3">
                  <div>
                    <strong className="text-sm font-bold text-[var(--text)] block">
                      {suggestedTemplate.name}
                    </strong>
                    <span className="text-[11px] text-[var(--text-soft)]">
                      {suggestedTemplate.exercises.length} ejercicios configurados
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartWorkout(suggestedTemplate.id)}
                    className="rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--blue-hover)] transition cursor-pointer"
                  >
                    Iniciar ya
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border)]">
                <label className="block text-xs text-[var(--text-soft)] mb-1.5 font-semibold">
                  O elegí otra rutina:
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedWorkoutTemplateId}
                    onChange={(e) => setSelectedWorkoutTemplateId(e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--text)]"
                  >
                    <option value="">Sesión Libre (sin rutina fija)</option>
                    {(state.gym?.routineTemplates || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleStartWorkout(selectedWorkoutTemplateId || undefined)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:border-[var(--blue)] transition cursor-pointer"
                  >
                    Iniciar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD FORM FOR OTHER 5 KINDS */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* FAST EXPENSE PARSER */}
            {kind === 'gasto' && (
              <div className="space-y-3">
                {!manualFinanceMode ? (
                  <div>
                    <label className="block">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--text)]">Entrada rápida</span>
                        <button
                          type="button"
                          onClick={() => setManualFinanceMode(true)}
                          className="text-[11px] text-[var(--blue)] font-semibold hover:underline cursor-pointer"
                        >
                          Modo tradicional
                        </button>
                      </div>
                      <div className="relative flex gap-2">
                        <input
                          ref={financeInputRef}
                          autoFocus
                          value={financeInput}
                          onChange={(e) => setFinanceInput(e.target.value)}
                          placeholder="Monto, categoría o cuenta (ej: 500 super)..."
                          className={`w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-3.5 px-4 text-sm font-medium outline-none focus:border-[var(--blue)] shadow-inner text-[var(--text)] ${
                            state.settings.privacyMode ? 'privacy-sensitive' : ''
                          }`}
                        />
                        <button
                          type="button"
                          onClick={startDictation}
                          className={`w-11 shrink-0 rounded-2xl border text-base flex items-center justify-center transition cursor-pointer ${
                            listening
                              ? 'border-rose-500 bg-rose-500/15 animate-pulse'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)]'
                          }`}
                          title="Dictar por voz"
                        >
                          🎙️
                        </button>
                      </div>
                    </label>

                    {/* Compact Live Parser Preview Badge */}
                    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-faint)] block">
                            Interpretación:
                          </span>
                          <span
                            className={`text-xs font-mono font-bold block mt-0.5 truncate ${
                              parsedFinance.isValid ? 'text-emerald-500' : 'text-[var(--text-soft)]'
                            } ${state.settings.privacyMode ? 'privacy-sensitive' : ''}`}
                          >
                            <PrivacyAmount>{parsedFinance.preview}</PrivacyAmount>
                          </span>
                        </div>
                        {parsedFinance.isValid && (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-500 shrink-0">
                            Listo
                          </span>
                        )}
                      </div>

                      {/* Quick Account Picker Chips if account is missing */}
                      {parsedFinance.missing.includes('account') && (state.finance?.accounts || []).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--border)]">
                          <span className="text-[10px] text-[var(--text-faint)] block mb-1">
                            Cuenta:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(state.finance?.accounts || []).map((acc) => (
                              <button
                                key={acc.id}
                                type="button"
                                onClick={() => setManualAccountId(acc.id)}
                                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                                  (manualAccountId || fallbackAccountId) === acc.id
                                    ? 'bg-[var(--blue)] text-white'
                                    : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                                }`}
                              >
                                {acc.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Manual input fallback */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text)]">Formulario detallado</span>
                      <button
                        type="button"
                        onClick={() => setManualFinanceMode(false)}
                        className="text-[11px] text-[var(--blue)] font-semibold hover:underline cursor-pointer"
                      >
                        ← Volver a parser rápido
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Monto ($U)</span>
                        <input
                          autoFocus
                          required
                          inputMode="decimal"
                          value={manualAmount}
                          onChange={(e) => setManualAmount(e.target.value)}
                          placeholder="0"
                          className={`w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-lg font-black outline-none focus:border-[var(--blue)] ${
                            state.settings.privacyMode ? 'privacy-sensitive' : ''
                          }`}
                        />
                      </label>
                      <label>
                        <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Cuenta</span>
                        <select
                          value={manualAccountId || fallbackAccountId}
                          onChange={(e) => setManualAccountId(e.target.value)}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"
                        >
                          {(state.finance?.accounts || []).map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Categoría</span>
                        <select
                          value={manualCategory}
                          onChange={(e) => setManualCategory(e.target.value)}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"
                        >
                          {activeCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Fecha</span>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Nota / Detalle</span>
                      <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Ej.: Almuerzo en el centro..."
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs outline-none focus:border-[var(--blue)]"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Optional Title for Note */}
            {kind === 'nota' && (
              <label className="block mb-2">
                <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">
                  Título (opcional)
                </span>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Ej.: Soporte monitor, Configuración OBS..."
                  className="min-w-0 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--blue)]"
                />
              </label>
            )}

            {/* TEXT INPUT FOR INBOX, TASKS, NOTES, IDEAS, REMINDERS */}
            {kind !== 'gasto' && (
              <label className="block">
                <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">
                  {kind === 'inbox'
                    ? '¿Qué querés guardar en tu bandeja?'
                    : kind === 'tarea'
                    ? '¿Qué querés registrar para hoy?'
                    : kind === 'nota'
                    ? '¿Qué querés guardar?'
                    : kind === 'idea'
                    ? '¿Cuál es la idea o proyecto?'
                    : '¿De qué querés acordarte?'}
                </span>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    autoFocus
                    required
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={
                      kind === 'inbox'
                        ? 'Ej.: Averiguar trámite, mandar presupuesto a cliente, probar app...'
                        : kind === 'tarea'
                        ? 'Ej.: Enviar CV a Micro1, Comprar alimento para gatos...'
                        : kind === 'nota'
                        ? 'Ej.: Código de acceso al portón es 4912...'
                        : kind === 'idea'
                        ? 'Ej.: Automatizar presupuestos con webhook...'
                        : 'Ej.: Enviar informe antes de las 18...'
                    }
                    className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm outline-none focus:border-[var(--blue)]"
                  />
                  <button
                    type="button"
                    onClick={startDictation}
                    className={`w-11 shrink-0 rounded-xl border text-base flex items-center justify-center transition cursor-pointer ${
                      listening
                        ? 'border-rose-500 bg-rose-500/15 animate-pulse'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-soft)]'
                    }`}
                    aria-label="Dictar por voz"
                  >
                    🎙️
                  </button>
                </div>
              </label>
            )}

            {/* NOTE EXTRAS: Pin toggle */}
            {kind === 'nota' && (
              <div className="flex items-center justify-between pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[var(--text-soft)] hover:text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={notePinned}
                    onChange={(e) => setNotePinned(e.target.checked)}
                    className="rounded border-[var(--border)] text-[var(--blue)] focus:ring-0"
                  />
                  <span>📌 Fijar nota arriba</span>
                </label>
              </div>
            )}

            {/* TAREA EXTRAS: Priority & Effort */}
            {kind === 'tarea' && (
              <div className="space-y-2.5 pt-1">
                <div>
                  <span className="block text-[11px] font-bold text-[var(--text-faint)] mb-1">Prioridad</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['alta', 'media', 'baja'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPriority(item)}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold capitalize transition cursor-pointer ${
                          priority === item
                            ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]'
                            : 'border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-[var(--text-faint)] mb-1">Nivel de Energía</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'low', label: 'Baja energía' },
                        { id: 'medium', label: 'Media' },
                        { id: 'high', label: 'Alta concentración' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEffort(item.id)}
                        className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition cursor-pointer ${
                          effort === item.id
                            ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                            : 'border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* RECORDATORIO EXTRAS: Time */}
            {kind === 'recordatorio' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label>
                  <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Hora (opcional)</span>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono"
                  />
                </label>
                <label>
                  <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Fecha</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs font-mono"
                  />
                </label>
              </div>
            )}

            {/* Status Message */}
            {message && (
              <p className="text-center text-xs font-bold text-emerald-500 animate-fade-in">
                {message}
              </p>
            )}

            {/* Save Button */}
            <button
              type="submit"
              className="w-full rounded-2xl bg-[var(--blue)] py-3.5 text-sm font-extrabold text-white shadow-md hover:bg-[var(--blue-hover)] transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Guardar</span>
              <kbd className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">↵ Enter</kbd>
            </button>
          </form>
        )}
      </>
    )}
  </section>
</div>
  );
};
