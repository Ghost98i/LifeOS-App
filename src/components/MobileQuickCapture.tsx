import React, { useEffect, useMemo, useState } from 'react';
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
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';

interface MobileQuickCaptureProps {
  state: LifeOSState;
  open: boolean;
  onClose: () => void;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate?: (view: ViewType) => void;
}

export type CaptureKind = 'inbox' | 'tarea' | 'gasto' | 'nota' | 'idea' | 'entrenamiento' | 'recordatorio';

const captureOptions: { kind: CaptureKind; label: string; icon: string; desc: string }[] = [
  { kind: 'inbox', label: 'Bandeja', icon: '📥', desc: 'Captura libre' },
  { kind: 'tarea', label: 'Tarea', icon: '✓', desc: 'Acción para hoy' },
  { kind: 'gasto', label: 'Gasto', icon: '−', desc: 'Parser rápido' },
  { kind: 'nota', label: 'Nota', icon: '✎', desc: 'Post-it o apunte' },
  { kind: 'idea', label: 'Idea', icon: '💡', desc: 'Nueva propuesta' },
  { kind: 'entrenamiento', label: 'Entrenar', icon: '⚡', desc: 'Iniciar sesión' },
  { kind: 'recordatorio', label: 'Alerta', icon: '⏰', desc: 'Con hora/fecha' },
];

export const MobileQuickCapture: React.FC<MobileQuickCaptureProps> = ({
  state,
  open,
  onClose,
  onUpdateState,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'capture' | 'inbox'>('capture');
  const [kind, setKind] = useState<CaptureKind>('inbox');
  const [text, setText] = useState('');
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
  const [manualCategory, setManualCategory] = useState('Otros');
  const [selectedWorkoutTemplateId, setSelectedWorkoutTemplateId] = useState<string>('');

  // Suggested account for finance
  const fallbackAccountId = useMemo(() => {
    return suggestedQuickAccountId(state, 'gasto');
  }, [state]);

  // Live parsed finance object
  const parsedFinance = useMemo(() => {
    return parseQuickFinance(financeInput, {
      accounts: state.finance.accounts,
      categories: state.finance.categories,
      defaultDate: date,
      defaultAccountId: manualAccountId || fallbackAccountId,
    });
  }, [financeInput, state.finance.accounts, state.finance.categories, date, manualAccountId, fallbackAccountId]);

  // Today's suggested workout
  const todayDayKey = dayKeyFromDate(new Date());
  const suggestedTemplate = useMemo(() => {
    return (
      state.gym.routineTemplates.find((t) => t.days?.includes(todayDayKey)) ||
      state.gym.routineTemplates[0] ||
      null
    );
  }, [state.gym.routineTemplates, todayDayKey]);

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setMessage('');
    setManualAccountId(fallbackAccountId);
    if (suggestedTemplate) {
      setSelectedWorkoutTemplateId(suggestedTemplate.id);
    }
  }, [open, fallbackAccountId, suggestedTemplate]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleStartWorkout = (templateId?: string) => {
    try {
      const template = state.gym.routineTemplates.find((t) => t.id === templateId) || null;
      const newSessionId = uid();
      const exercises = template
        ? template.exercises.map((ex) => ({
            id: uid(),
            exerciseId: ex.exerciseId,
            notes: ex.notes || '',
            sets: Array.from({ length: ex.defaultSets || 3 }).map((_, idx) => ({
              id: uid(),
              setNumber: idx + 1,
              weightKg: 0,
              reps: ex.defaultReps || 10,
              rpe: undefined,
              completed: false,
            })),
          }))
        : [];

      onUpdateState((draft) => {
        // mark any previous active session as completed
        draft.gym.sessions.forEach((s) => {
          if (s.status === 'active') s.status = 'completed';
        });
        draft.gym.sessions.unshift({
          id: newSessionId,
          date: todayISO(),
          startedAt: new Date().toISOString(),
          status: 'active',
          templateId: template?.id || null,
          title: template?.name || 'Entrenamiento Libre',
          notes: '',
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
          addQuickNote(draft, text, date);
        });
        playSound('success');
      } else if (kind === 'idea') {
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
        } else {
          setText((c) => (c ? `${c} ${transcript}` : transcript));
        }
      }
    };
    recognition.start();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Captura universal"
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--card)] border border-[var(--border)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header & Mode Tabs */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--bg)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab('capture')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'capture'
                  ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs border border-[var(--border)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>⚡ Capturar</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'inbox'
                  ? 'bg-[var(--card)] text-[var(--blue)] shadow-xs border border-[var(--border)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <span>📥 Bandeja</span>
              {(state.inbox || []).length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black px-1 animate-pulse">
                  {(state.inbox || []).length}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
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
                        <button
                          type="button"
                          onClick={() => handleConvertInbox(item.id, 'nota')}
                          className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                        >
                          📝 Nota
                        </button>
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
            {/* 7 Category Selector Chips */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 rounded-2xl bg-[var(--bg)] p-1.5 mb-4">
              {captureOptions.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => {
                    setKind(option.kind);
                    setMessage('');
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-[11px] font-bold transition cursor-pointer ${
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

        {/* WORKOUT TAB: 1-click start */}
        {kind === 'entrenamiento' ? (
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
                    {state.gym.routineTemplates.map((t) => (
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
                        <span className="text-xs font-bold text-[var(--text)]">Entrada inteligente</span>
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
                          autoFocus
                          value={financeInput}
                          onChange={(e) => setFinanceInput(e.target.value)}
                          placeholder="Ej: 500 comida banco, 1200 nafta, 2000 super..."
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-3.5 px-4 text-sm font-medium outline-none focus:border-[var(--blue)] shadow-inner"
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
                    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-faint)] block">
                            Interpretación en tiempo real:
                          </span>
                          <span
                            className={`text-xs font-mono font-bold block mt-0.5 truncate ${
                              parsedFinance.isValid ? 'text-emerald-500' : 'text-[var(--text-soft)]'
                            }`}
                          >
                            {parsedFinance.preview}
                          </span>
                        </div>
                        {parsedFinance.isValid && (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-500 shrink-0">
                            Listo para guardar
                          </span>
                        )}
                      </div>

                      {/* Quick Account Picker Chips if account is missing */}
                      {parsedFinance.missing.includes('account') && state.finance.accounts.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--border)]">
                          <span className="text-[10px] text-[var(--text-faint)] block mb-1">
                            Seleccionar cuenta con un toque:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {state.finance.accounts.map((acc) => (
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
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-lg font-black outline-none focus:border-[var(--blue)]"
                        />
                      </label>
                      <label>
                        <span className="block text-xs font-bold text-[var(--text-soft)] mb-1">Cuenta</span>
                        <select
                          value={manualAccountId || fallbackAccountId}
                          onChange={(e) => setManualAccountId(e.target.value)}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"
                        >
                          {state.finance.accounts.map((a) => (
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
                          {state.finance.categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
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

            {/* TEXT INPUT FOR INBOX, TASKS, NOTES, IDEAS, REMINDERS */}
            {kind !== 'gasto' && (
              <label className="block">
                <span className="block text-xs font-bold text-[var(--text-soft)] mb-1.5">
                  {kind === 'inbox'
                    ? '¿Qué querés guardar en tu bandeja?'
                    : kind === 'tarea'
                    ? '¿Qué hay que hacer?'
                    : kind === 'nota'
                    ? '¿Qué querés guardar?'
                    : kind === 'idea'
                    ? '¿Cuál es la idea o proyecto?'
                    : '¿De qué querés acordarte?'}
                </span>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    required
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={
                      kind === 'inbox'
                        ? 'Ej.: Averiguar trámite, mandar presupuesto a cliente, probar app...'
                        : kind === 'tarea'
                        ? 'Ej.: Pedir turno con el médico...'
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
