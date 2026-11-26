import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon, type AppIconName } from './AppIcon';
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
import { startGymSession } from '../lib/gymFlows';
import { nowTimeHHmm } from '../lib/gymMetrics';
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
import { LiveCapturePreview } from './LiveCapturePreview';
import { PrivacyAmount } from './PrivacyAmount';
import { CelestianSwitch } from './ui/CelestianSwitch';

interface MobileQuickCaptureProps {
  state: LifeOSState;
  open: boolean;
  onClose: () => void;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onNavigate?: (view: ViewType) => void;
  initialKind?: CaptureKind;
  initialText?: string;
}

export type CaptureKind = 'universal' | 'tarea' | 'gasto' | 'nota' | 'entrenamiento' | 'inbox' | 'idea' | 'recordatorio';

const captureOptions: { kind: CaptureKind; label: string; icon: AppIconName; desc: string; primary?: boolean }[] = [
  { kind: 'universal', label: 'Automática', icon: 'squarePlus', desc: 'Detectar el tipo de registro', primary: true },
  { kind: 'tarea', label: 'Tarea', icon: 'task', desc: 'Acción para hoy', primary: true },
  { kind: 'gasto', label: 'Gasto', icon: 'expense', desc: 'Parser rápido', primary: true },
  { kind: 'nota', label: 'Nota', icon: 'note', desc: 'Post-it o apunte', primary: true },
  { kind: 'entrenamiento', label: 'Entrenar', icon: 'dumbbell', desc: 'Iniciar sesión', primary: true },
  { kind: 'inbox', label: 'Bandeja', icon: 'inbox', desc: 'Captura libre' },
  { kind: 'idea', label: 'Idea', icon: 'lightbulb', desc: 'Nueva propuesta' },
  { kind: 'recordatorio', label: 'Alerta', icon: 'reminder', desc: 'Con hora/fecha' },
];

export const MobileQuickCapture: React.FC<MobileQuickCaptureProps> = ({
  state,
  open,
  onClose,
  onUpdateState,
  onNavigate,
  initialKind,
  initialText,
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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [listening, setListening] = useState(false);

  // Fast Finance Parser state
  const [financeInput, setFinanceInput] = useState('');
  const [manualFinanceMode, setManualFinanceMode] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualAccountId, setManualAccountId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const financeOperationId = useRef<string | null>(null);
  useEffect(() => { if (!open) financeOperationId.current = null; }, [open]);

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

  const universalPreviewDrafts = useMemo(() => {
    const trimmed = universalInput.trim();
    if (trimmed.length < 2) return [];
    return parseCaptureDrafts(trimmed, state);
  }, [universalInput, state]);

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
      const targetKind: CaptureKind =
        initialKind && isAllowed(initialKind) ? initialKind : 'universal';
      if (initialKind && isAllowed(initialKind)) {
        setKind(initialKind);
      } else {
        setKind((prev) => (isAllowed(prev) ? prev : 'universal'));
      }
      const trimmedSeed = (initialText || '').trim();
      setUniversalInput(targetKind === 'universal' ? trimmedSeed : '');
      if (trimmedSeed) {
        if (targetKind === 'gasto') {
          setFinanceInput(trimmedSeed);
        } else if (targetKind !== 'universal' && targetKind !== 'entrenamiento') {
          setText(trimmedSeed);
        }
      }
      setMobileDrafts([]);
      setDate(todayISO());
      setFeedback(null);
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
  }, [open, initialKind, initialText, fallbackAccountId, suggestedTemplate, state.settings]);

  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const universalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const financeInputRef = useRef<HTMLInputElement>(null);
  const manualAmountRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!open || activeTab !== 'capture') return;
    const focusPrimary = () => {
      if (kind === 'universal') {
        universalInputRef.current?.focus();
      } else if (kind === 'gasto') {
        if (manualFinanceMode) manualAmountRef.current?.focus();
        else financeInputRef.current?.focus();
      } else if (kind === 'nota') {
        noteTextareaRef.current?.focus();
      } else if (kind !== 'entrenamiento') {
        inputRef.current?.focus();
      }
    };
    focusPrimary();
    const timer = window.setTimeout(focusPrimary, 40);
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

  const requestCloseRef = useRef(handleRequestClose);
  requestCloseRef.current = handleRequestClose;
  const showExitConfirmRef = useRef(showExitConfirm);
  showExitConfirmRef.current = showExitConfirm;

  useEffect(() => {
    if (!open) return;
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (showExitConfirmRef.current) {
        setShowExitConfirm(false);
        return;
      }
      requestCloseRef.current();
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [open]);

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
      e.preventDefault();
      e.stopPropagation();
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return;
      }
      handleRequestClose();
    }
  };

  if (!open) return null;

  const handleStartWorkout = (templateId?: string) => {
    try {
      onUpdateState((draft) => {
        startGymSession(draft.gym, {
          templateId,
          date: todayISO(),
          startedAt: nowTimeHHmm(),
          sessionId: uid(),
        });
      });

      playSound('success');
      showToast('Entrenamiento iniciado.', 'success');
      onClose();
      if (onNavigate) {
        onNavigate('gimnasio');
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Error al iniciar entrenamiento.' });
    }
  };

  const submitCapture = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let successMessage = 'Guardado al instante';
      if (kind === 'gasto') {
        if (manualFinanceMode) {
          const amt = Number(manualAmount.replace(',', '.'));
          if (!Number.isFinite(amt) || amt <= 0) throw new Error('Ingresá un monto válido.');
          const saved = onUpdateState((draft) => {
            addQuickTransaction(draft, {
              id: financeOperationId.current ??= globalThis.crypto?.randomUUID?.() || uid(),
              type: 'gasto',
              amount: amt,
              accountId: manualAccountId || fallbackAccountId,
              category: manualCategory,
              note: text,
              date,
            });
          });
          if (saved === false) throw new Error('No se pudo guardar. Conservamos el gasto para que puedas reintentar.');
          playSound('coins');
          successMessage = 'Gasto registrado';
        } else {
          // Use parsed quick finance
          if (!parsedFinance.isValid || parsedFinance.amount === null) {
            throw new Error('Escribí un monto válido, ej: 500 comida banco');
          }
          if (parsedFinance.destination === 'commitment') {
            onUpdateState((draft) => {
              addQuickTask(
                draft,
                parsedFinance.raw,
                'media',
                todayISO(),
                'medium',
                parsedFinance.date !== todayISO() ? parsedFinance.date : undefined
              );
            });
            playSound('success');
            successMessage = 'Obligación registrada como tarea';
          } else {
            const chosenAccountId = parsedFinance.accountId || manualAccountId || fallbackAccountId;
            const saved = onUpdateState((draft) => {
              addQuickTransaction(draft, {
                id: financeOperationId.current ??= globalThis.crypto?.randomUUID?.() || uid(),
                type: parsedFinance.type,
                amount: parsedFinance.amount!,
                accountId: chosenAccountId,
                category: parsedFinance.category || 'Otros',
                note: parsedFinance.note,
                date: parsedFinance.date,
              });
            });
            if (saved === false) throw new Error('No se pudo guardar. Conservamos el gasto para que puedas reintentar.');
            playSound('coins');
            successMessage = parsedFinance.type === 'ingreso' ? 'Ingreso registrado' : 'Gasto registrado';
          }
        }
      } else if (kind === 'inbox') {
        if (!text.trim()) throw new Error('Escribí un texto para guardar en tu bandeja.');
        onUpdateState((draft) => {
          addQuickInbox(draft, text, 'quick-capture');
        });
        playSound('success');
        successMessage = 'Guardado en bandeja';
      } else if (kind === 'tarea') {
        if (!text.trim()) throw new Error('Escribí una tarea para guardar.');
        onUpdateState((draft) => {
          addQuickTask(draft, text, priority, date, effort);
        });
        playSound('success');
        successMessage = 'Tarea guardada';
      } else if (kind === 'nota') {
        if (!text.trim()) throw new Error('Escribí el contenido de la nota.');
        onUpdateState((draft) => {
          addQuickNote(draft, text, date, {
            title: noteTitle.trim() || undefined,
            pinned: notePinned,
          });
        });
        playSound('success');
        successMessage = 'Nota guardada';
      } else if (kind === 'idea') {
        if (!isModuleEnabled(state.settings, 'ia')) {
          throw new Error('El módulo IA está desactivado.');
        }
        if (!text.trim()) throw new Error('Escribí una idea para guardar.');
        onUpdateState((draft) => {
          addQuickIdea(draft, text);
        });
        playSound('success');
        successMessage = 'Idea guardada';
      } else if (kind === 'recordatorio') {
        if (!text.trim()) throw new Error('Escribí un recordatorio para guardar.');
        onUpdateState((draft) => {
          addQuickReminder(draft, text, date, reminderTime);
        });
        playSound('success');
        successMessage = 'Recordatorio guardado';
      }

      setFeedback({ type: 'success', text: successMessage });
      showToast(successMessage, 'success');
      setText('');
      setNoteTitle('');
      setFinanceInput('');
      setManualAmount('');
      window.setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 220);
    } catch (error) {
      setIsSubmitting(false);
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar.' });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitCapture();
  };

  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submitCapture();
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
    const existing = (state.inbox || []).find((item) => item.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      deleteInboxItem(draft, id);
    });
    if (saved === false) return;
    playSound('click');
    showToast('Elemento descartado de la bandeja', 'info', snapshot ? {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (onUpdateState((draft) => {
          if (!draft.inbox) draft.inbox = [];
          if (!draft.inbox.some((item) => item.id === snapshot.id)) {
            draft.inbox.unshift({ ...snapshot });
          }
        }) !== false) {
          showToast('Elemento restaurado en bandeja', 'success');
        }
      },
    } : undefined);
  };

  const startDictation = () => {
    const browserWindow = window as typeof window & {
      webkitSpeechRecognition?: new () => any;
      SpeechRecognition?: new () => any;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setFeedback({ type: 'error', text: 'El dictado no está disponible en este navegador.' });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'es-UY';
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setFeedback({ type: 'error', text: 'No pude escuchar. Podés escribir con el teclado.' });
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
      setFeedback(null);
      setMobileDrafts((prev) => [...prev, ...drafts]);
      setUniversalInput('');
      playSound('click');
    }
  };

  const handleUniversalQuickConfirm = () => {
    const trimmed = universalInput.trim();
    if (trimmed) {
      const drafts = parseCaptureDrafts(trimmed, state);
      if (drafts.length === 1 && canConfirmDraft(state, drafts[0]).valid) {
        let confirmFeedback: { message: string; sound: 'success' | 'coins' | 'click' } = {
          message: 'Elemento registrado.',
          sound: 'success',
        };
        const saved = onUpdateState((s) => {
          confirmFeedback = confirmCaptureDraft(s, drafts[0]);
        });
        if (saved === false) {
          setFeedback({ type: 'error', text: 'No se pudo guardar en este dispositivo.' });
          return;
        }
        playSound(confirmFeedback.sound);
        showToast(confirmFeedback.message, 'success');
        setUniversalInput('');
        onClose();
        return;
      }
      handleUniversalParse();
    }
  };

  const cleanFieldBase =
    'celestian-clean-field rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors';

  const typeSelectorBar = (
    <div
      role="tablist"
      aria-label="Tipo de captura"
      className="flex flex-wrap gap-1.5"
    >
      {availableCaptureOptions.map((option) => {
        const isSelected = kind === option.kind;
        return (
          <button
            key={option.kind}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => {
              setKind(option.kind);
              setFeedback(null);
            }}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
              isSelected
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:border-[#4F46E5]/40 hover:text-[var(--text)]'
            }`}
          >
            <AppIcon name={option.icon} className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  const feedbackBanner = feedback ? (
    <p
      role={feedback.type === 'success' ? 'status' : 'alert'}
      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold leading-relaxed ${
        feedback.type === 'success'
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
      }`}
    >
      <AppIcon name={feedback.type === 'success' ? 'check' : 'alertCircle'} className="h-4 w-4 shrink-0" />
      <span>{feedback.text}</span>
    </p>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end p-0 sm:items-center sm:p-4 justify-center bg-black/55 backdrop-blur-xs transition-opacity"
      onClick={handleRequestClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Captura rápida"
        onKeyDown={handleDialogKeyDown}
        className="relative flex w-full sm:max-w-lg max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl transition-transform"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />

        {/* Exit Confirmation Dialog */}
        {showExitConfirm && (
          <div className="absolute inset-0 z-50 rounded-t-2xl sm:rounded-2xl bg-[var(--card)]/95 backdrop-blur-sm p-6 flex flex-col justify-center items-center text-center gap-4 animate-fadeIn">
            <AppIcon name="alertTriangle" className="h-8 w-8 text-amber-500" />
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
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#4F46E5] text-white text-xs font-bold hover:bg-[#4338CA] transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                Guardar en Bandeja
              </button>
              <button
                type="button"
                onClick={handleForceCloseDiscard}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold hover:bg-rose-500/20 transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="py-2.5 px-3 rounded-xl bg-[var(--surface-muted)] text-[var(--text-soft)] text-xs font-semibold hover:bg-[var(--border)] transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                Volver
              </button>
            </div>
          </div>
        )}

        {/* Sticky Header & Mode Tabs */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)]/70 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('capture')}
              className={`flex min-h-8 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                activeTab === 'capture'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <AppIcon name="squarePlus" className="h-3.5 w-3.5" />
              <span>Captura</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className={`flex min-h-8 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                activeTab === 'inbox'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>Bandeja</span>
              {(state.inbox || []).length > 0 && (
                <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  activeTab === 'inbox' ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {(state.inbox || []).length}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)] active:scale-95 transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            aria-label="Cerrar"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {activeTab === 'inbox' ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
            {feedbackBanner}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
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
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#4F46E5]/10 border border-[#4F46E5]/30 px-2.5 py-1.5 text-[11px] font-bold text-[#4F46E5] dark:text-[#818CF8] cursor-pointer"
                >
                  <AppIcon name="plus" className="h-3 w-3" />
                  <span>Nueva</span>
                </button>
              )}
            </div>

            {(state.inbox || []).length === 0 ? (
              <div className="py-10 text-center space-y-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-6">
                <AppIcon name="sparkles" className="mx-auto h-7 w-7 text-[#4F46E5] dark:text-[#818CF8]" />
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
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#4338CA] cursor-pointer"
                >
                  <AppIcon name="zap" className="h-3.5 w-3.5" />
                  <span>Capturar en bandeja</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 pr-0.5">
                {(state.inbox || []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 space-y-2.5 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--text)] whitespace-pre-wrap leading-relaxed break-words">
                        {item.text}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDiscardInbox(item.id)}
                        className="inline-flex items-center justify-center text-xs text-[var(--text-faint)] hover:text-rose-500 px-1.5 py-0.5 rounded cursor-pointer"
                        aria-label="Descartar"
                        title="Descartar"
                      >
                        <AppIcon name="x" className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                      <span className="text-[10px] text-[var(--text-faint)] tabular-nums">
                        {fmtDate(item.createdAt.slice(0, 10))} • {item.createdAt.slice(11, 16)}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'tarea')}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5]/10 border border-[#4F46E5]/30 px-2.5 py-1 text-[10px] font-bold text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#4F46E5] hover:text-white transition cursor-pointer"
                        >
                          <AppIcon name="check" className="h-3 w-3" />
                          <span>Tarea hoy</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'proyecto')}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500 hover:text-white transition cursor-pointer"
                        >
                          <AppIcon name="target" className="h-3 w-3" />
                          <span>Proyecto</span>
                        </button>
                        {isModuleEnabled(state, 'notas') && (
                          <button
                            type="button"
                            onClick={() => handleConvertInbox(item.id, 'nota')}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                          >
                            <AppIcon name="note" className="h-3 w-3" />
                            <span>Nota</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'recordatorio')}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-500/10 border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-soft)] hover:bg-[var(--text)] hover:text-[var(--bg)] transition cursor-pointer"
                        >
                          <AppIcon name="clock" className="h-3 w-3" />
                          <span>Alerta</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : kind === 'universal' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3.5 px-4 py-3.5 sm:px-5">
              {typeSelectorBar}
              {feedbackBanner}

              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--text)] mb-1.5 block">
                    ¿Qué querés registrar?
                  </span>
                  <div className="relative flex gap-2">
                    <input
                      ref={universalInputRef}
                      autoFocus
                      value={universalInput}
                      onChange={(e) => setUniversalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault();
                          handleUniversalQuickConfirm();
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          handleUniversalParse();
                        }
                      }}
                      placeholder="Ej: 1200 nafta, estudiar redes mañana..."
                      className={`${cleanFieldBase} min-w-0 flex-1 py-3 px-3.5 text-sm font-medium`}
                    />
                    <button
                      type="button"
                      onClick={startDictation}
                      className={`flex items-center justify-center w-11 h-11 rounded-xl border transition cursor-pointer shrink-0 ${
                        listening
                          ? 'bg-rose-500 text-white animate-pulse border-rose-600'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-soft)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}
                      title="Dictado por voz"
                      aria-label="Dictado por voz"
                    >
                      <AppIcon name="mic" className="h-4 w-4" />
                    </button>
                  </div>
                </label>

                {universalPreviewDrafts.length > 0 && (
                  <LiveCapturePreview drafts={universalPreviewDrafts} state={state} />
                )}
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
                      setFeedback({ type: 'error', text: validation.reason || 'Borrador no válido.' });
                      return;
                    }
                    setConfirmingDraftIds((prev) => new Set(prev).add(draft.id));
                    setFeedback(null);
                    try {
                      let confirmFeedback: { message: string; sound: 'success' | 'coins' | 'click' } = {
                        message: 'Elemento registrado.',
                        sound: 'success',
                      };
                      const saved = onUpdateState((s) => {
                        confirmFeedback = confirmCaptureDraft(s, draft);
                      });
                      if (saved === false) {
                        setFeedback({ type: 'error', text: 'No se pudo guardar en este dispositivo. El borrador sigue disponible.' });
                        return;
                      }
                      playSound(confirmFeedback.sound);
                      showToast(confirmFeedback.message);
                      setMobileDrafts((prev) => {
                        const next = prev.filter((d) => d.id !== draft.id);
                        if (next.length === 0) onClose();
                        return next;
                      });
                    } catch (err) {
                      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Error al registrar.' });
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
                    setFeedback(null);
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
                        setFeedback({ type: 'error', text: 'No se pudo guardar en este dispositivo. Los borradores siguen disponibles.' });
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
                      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Error al registrar borradores.' });
                    } finally {
                      setIsConfirmingAll(false);
                    }
                  }}
                  onDiscardDraft={(draftId) => {
                    const removed = mobileDrafts.find((d) => d.id === draftId);
                    setMobileDrafts((prev) => prev.filter((d) => d.id !== draftId));
                    if (removed) {
                      showToast('Borrador descartado.', 'info', {
                        actionLabel: 'Deshacer',
                        onAction: () => setMobileDrafts((prev) => (prev.some((d) => d.id === removed.id) ? prev : [...prev, removed])),
                      });
                    }
                  }}
                  onDiscardAll={() => {
                    const snapshot = [...mobileDrafts];
                    setMobileDrafts([]);
                    if (snapshot.length > 0) {
                      showToast(`${snapshot.length} borradores descartados.`, 'info', {
                        actionLabel: 'Deshacer',
                        onAction: () => setMobileDrafts((prev) => [...prev, ...snapshot]),
                      });
                    }
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

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)]/70 bg-[var(--card)] px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
              <span className="text-[11px] text-[var(--text-faint)] truncate">
                Combiná registros con &quot;y&quot;
              </span>
              <button
                type="button"
                onClick={handleUniversalParse}
                disabled={!universalInput.trim()}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-40 transition cursor-pointer shadow-xs outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                <span>Revisar captura</span>
                <kbd className="hidden sm:inline rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd>
              </button>
            </div>
          </div>
        ) : kind === 'entrenamiento' ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3.5 px-4 py-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
            {typeSelectorBar}
            {feedbackBanner}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3">
              <span className="text-xs font-bold text-[var(--text)] block">
                {suggestedTemplate ? `Sugerido para hoy (${todayDayKey}):` : 'Iniciar sesión:'}
              </span>

              {suggestedTemplate && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#4F46E5]/30 bg-[#4F46E5]/[0.06] p-3">
                  <div className="min-w-0">
                    <strong className="text-sm font-bold text-[var(--text)] block truncate">
                      {suggestedTemplate.name}
                    </strong>
                    <span className="text-[11px] text-[var(--text-soft)]">
                      {suggestedTemplate.exercises.length} ejercicios configurados
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartWorkout(suggestedTemplate.id)}
                    className="shrink-0 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#4338CA] transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
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
                    className={`${cleanFieldBase} min-w-0 flex-1 p-2.5 text-xs`}
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
                    className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:border-[#4F46E5]/50 transition cursor-pointer"
                  >
                    Iniciar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD FORM FOR OTHER 6 KINDS WITH PINNED FOOTER */
          <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3.5 px-4 py-3.5 sm:px-5">
              {typeSelectorBar}
              {feedbackBanner}

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
                            className="text-[11px] text-[#4F46E5] dark:text-[#818CF8] font-semibold hover:underline cursor-pointer"
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
                            className={`${cleanFieldBase} min-w-0 flex-1 py-3 px-3.5 text-sm font-medium`}
                          />
                          <button
                            type="button"
                            onClick={startDictation}
                            className={`w-11 h-11 shrink-0 rounded-xl border text-base flex items-center justify-center transition cursor-pointer ${
                              listening
                                ? 'border-rose-500 bg-rose-500/15 animate-pulse'
                                : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                            }`}
                            title="Dictar por voz"
                            aria-label="Dictar por voz"
                          >
                            <AppIcon name="mic" className="h-4 w-4" />
                          </button>
                        </div>
                      </label>

                      {/* Compact Live Parser Preview Badge */}
                      <div className="mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-faint)] block">
                              Interpretación:
                            </span>
                            <span
                              className={`text-xs tabular-nums font-bold block mt-0.5 truncate ${
                                parsedFinance.isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-soft)]'
                              }`}
                            >
                              <PrivacyAmount>{parsedFinance.preview}</PrivacyAmount>
                            </span>
                          </div>
                          {parsedFinance.isValid && (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
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
                                      ? 'bg-[#4F46E5] text-white'
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
                          className="inline-flex items-center gap-1 text-[11px] text-[#4F46E5] dark:text-[#818CF8] font-semibold hover:underline cursor-pointer"
                        >
                          <AppIcon name="chevronLeft" className="h-3.5 w-3.5" />
                          <span>Volver a entrada rápida</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label>
                          <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Monto ($U)</span>
                          <input
                            ref={manualAmountRef}
                            autoFocus
                            required
                            inputMode="decimal"
                            value={manualAmount}
                            onChange={(e) => setManualAmount(e.target.value)}
                            placeholder="0"
                            className={`${cleanFieldBase} w-full p-2.5 text-base font-bold ${
                              state.settings?.privacyMode ? 'privacy-sensitive' : ''
                            }`}
                          />
                        </label>
                        <label>
                          <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Cuenta</span>
                          <select
                            value={manualAccountId || fallbackAccountId}
                            onChange={(e) => setManualAccountId(e.target.value)}
                            className={`${cleanFieldBase} w-full p-2.5 text-xs`}
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
                            className={`${cleanFieldBase} w-full p-2.5 text-xs`}
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
                            className={`${cleanFieldBase} w-full p-2.5 text-xs`}
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Nota / Detalle</span>
                        <input
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          placeholder="Ej.: Almuerzo en el centro..."
                          className={`${cleanFieldBase} w-full p-2.5 text-xs`}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Optional Title for Note */}
              {kind === 'nota' && (
                <label className="block">
                  <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">
                    Título (opcional)
                  </span>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Ej.: Soporte monitor, Configuración OBS..."
                    className={`${cleanFieldBase} min-w-0 w-full p-2.5 text-xs font-semibold`}
                  />
                </label>
              )}

              {/* TEXT INPUT / TEXTAREA FOR INBOX, TASKS, NOTES, IDEAS, REMINDERS */}
              {kind === 'nota' ? (
                <label className="block">
                  <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">
                    ¿Qué querés guardar?
                  </span>
                  <div className="flex items-start gap-2">
                    <textarea
                      ref={noteTextareaRef}
                      autoFocus
                      required
                      rows={3}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Ej.: Código de acceso al portón es 4912..."
                      className={`${cleanFieldBase} min-w-0 flex-1 resize-none p-3 text-sm leading-relaxed`}
                    />
                    <button
                      type="button"
                      onClick={startDictation}
                      className={`w-11 h-11 shrink-0 rounded-xl border text-base flex items-center justify-center transition cursor-pointer ${
                        listening
                          ? 'border-rose-500 bg-rose-500/15 animate-pulse'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                      }`}
                      aria-label="Dictar por voz"
                    >
                      <AppIcon name="mic" className="h-4 w-4" />
                    </button>
                  </div>
                </label>
              ) : kind !== 'gasto' && (
                <label className="block">
                  <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">
                    {kind === 'inbox'
                      ? '¿Qué querés guardar en tu bandeja?'
                      : kind === 'tarea'
                      ? '¿Qué querés registrar para hoy?'
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
                          ? 'Ej.: Averiguar trámite, mandar presupuesto a cliente...'
                          : kind === 'tarea'
                          ? 'Ej.: Enviar CV a Micro1, Comprar alimento...'
                          : kind === 'idea'
                          ? 'Ej.: Automatizar presupuestos con webhook...'
                          : 'Ej.: Enviar informe antes de las 18...'
                      }
                      className={`${cleanFieldBase} min-w-0 flex-1 p-3 text-sm`}
                    />
                    <button
                      type="button"
                      onClick={startDictation}
                      className={`w-11 h-11 shrink-0 rounded-xl border text-base flex items-center justify-center transition cursor-pointer ${
                        listening
                          ? 'border-rose-500 bg-rose-500/15 animate-pulse'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                      }`}
                      aria-label="Dictar por voz"
                    >
                      <AppIcon name="mic" className="h-4 w-4" />
                    </button>
                  </div>
                </label>
              )}

              {/* NOTE EXTRAS: Pin switch */}
              {kind === 'nota' && (
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs">
                  <span id="quick-capture-pin-label" className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-soft)]">
                    <AppIcon name="pin" className="h-3.5 w-3.5 text-[#4F46E5] dark:text-[#818CF8]" />
                    <span>Fijar nota arriba</span>
                  </span>
                  <CelestianSwitch
                    checked={notePinned}
                    onChange={setNotePinned}
                    ariaLabelledBy="quick-capture-pin-label"
                    size="sm"
                  />
                </div>
              )}

              {/* TAREA EXTRAS: Priority & Effort */}
              {kind === 'tarea' && (
                <div className="space-y-2.5">
                  <div>
                    <span className="block text-[11px] font-bold text-[var(--text-faint)] mb-1">Prioridad</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(['alta', 'media', 'baja'] as const).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPriority(item)}
                          className={`min-h-9 rounded-xl border px-3 py-1.5 text-xs font-bold capitalize transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                            priority === item
                              ? 'border-[#4F46E5] bg-[#4F46E5]/12 text-[#4F46E5] dark:border-[#818CF8] dark:bg-indigo-500/20 dark:text-[#818CF8]'
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
                          { id: 'low', label: 'Baja' },
                          { id: 'medium', label: 'Media' },
                          { id: 'high', label: 'Alta' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setEffort(item.id)}
                          className={`min-h-9 rounded-xl border px-2 py-1.5 text-xs font-bold transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                            effort === item.id
                              ? 'border-[#4F46E5] bg-[#4F46E5]/12 text-[#4F46E5] dark:border-[#818CF8] dark:bg-indigo-500/20 dark:text-[#818CF8]'
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
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Hora (opcional)</span>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className={`${cleanFieldBase} w-full p-2.5 text-xs tabular-nums`}
                    />
                  </label>
                  <label>
                    <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Fecha</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={`${cleanFieldBase} w-full p-2.5 text-xs tabular-nums`}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Pinned Save Footer — always accessible on 389px even with virtual keyboard */}
            <div className="shrink-0 border-t border-[var(--border)]/70 bg-[var(--card)] px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#4338CA] active:scale-[0.99] disabled:opacity-60 transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                <span>{isSubmitting ? 'Guardando…' : 'Guardar'}</span>
                <kbd className="hidden sm:inline rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">
                  {kind === 'nota' ? 'Ctrl + Enter' : 'Enter'}
                </kbd>
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
