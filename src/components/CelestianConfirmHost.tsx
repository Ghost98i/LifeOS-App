import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  subscribeConfirmDialogs,
  type ConfirmDialogTone,
  type DialogRequest,
} from '../lib/confirmDialog';
import { triggerHaptic } from '../lib/haptics';

export interface CelestianConfirmDialogProps {
  open: boolean;
  mode?: 'confirm' | 'prompt';
  title: string;
  message?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  onCancel: () => void;
  onConfirm: (value?: string) => void;
}

const CLEAN_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

export const CelestianConfirmDialog: React.FC<CelestianConfirmDialogProps> = ({
  open,
  mode = 'confirm',
  title,
  message,
  details,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  defaultValue = '',
  placeholder = '',
  required = true,
  onCancel,
  onConfirm,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const [inputValue, setInputValue] = useState(defaultValue);
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInputValue(defaultValue);
    setInputError(null);
  }, [open, defaultValue]);

  const handleCancel = useCallback(() => {
    triggerHaptic('light');
    onCancel();
  }, [onCancel]);

  useDialogFocus(open, dialogRef, handleCancel);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      if (mode === 'prompt') {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        // Safe default focus on Cancel so accidental Enter never confirms destructive actions
        cancelBtnRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, mode]);

  if (!open) return null;

  const isDanger = mode === 'confirm' && tone === 'danger';
  const resolvedConfirmLabel =
    confirmLabel || (mode === 'prompt' ? 'Guardar' : isDanger ? 'Eliminar' : 'Continuar');

  const submitConfirm = () => {
    if (mode === 'prompt') {
      const trimmed = inputValue.trim();
      if (required && !trimmed) {
        setInputError('Ingresá un nombre válido para continuar.');
        triggerHaptic('warning');
        inputRef.current?.focus();
        return;
      }
      triggerHaptic('success');
      onConfirm(trimmed);
      return;
    }
    triggerHaptic(isDanger ? 'warning' : 'light');
    onConfirm();
  };

  return (
    <div
      className="celestian-modal-backdrop fixed inset-0 z-[115] flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? descId : undefined}
        tabIndex={-1}
        data-celestian-confirm-dialog="true"
        data-tone={isDanger ? 'danger' : 'primary'}
        className="celestian-modal-panel relative flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0D111A] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden"
        />

        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2 sm:px-6 sm:pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                isDanger
                  ? 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-400'
                  : 'border-indigo-500/20 bg-indigo-500/10 text-[#4F46E5] dark:border-indigo-400/25 dark:bg-indigo-500/15 dark:text-[#818CF8]'
              }`}
            >
              {isDanger ? (
                <AlertTriangle className="h-5 w-5" strokeWidth={1.85} />
              ) : (
                <HelpCircle className="h-5 w-5" strokeWidth={1.85} />
              )}
            </span>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-[15px] font-semibold leading-snug tracking-[-0.015em] text-slate-900 dark:text-slate-100"
              >
                {title}
              </h2>
              {message && (
                <p
                  id={descId}
                  className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                >
                  {message}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cerrar confirmación"
            className={`-mr-1.5 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer sm:h-9 sm:w-9 ${CLEAN_FOCUS}`}
          >
            <X className="h-4 w-4" strokeWidth={1.85} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2 sm:px-6">
          {details && details.length > 0 && (
            <ul className="mt-1 space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-700 dark:border-white/[0.07] dark:bg-white/[0.03] dark:text-slate-300">
              {details.map((item, idx) => (
                <li key={`${idx}-${item}`} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-400"
                  />
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          )}

          {mode === 'prompt' && (
            <form
              id="celestian-prompt-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitConfirm();
              }}
              className="mt-2 space-y-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  if (inputError) setInputError(null);
                }}
                placeholder={placeholder}
                aria-label={title}
                className="celestian-clean-field w-full min-h-[44px] rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/[0.1] dark:bg-[#111623] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {inputError && (
                <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {inputError}
                </p>
              )}
            </form>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.06] sm:flex-row sm:justify-end sm:px-6 sm:py-4">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={handleCancel}
            className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] cursor-pointer sm:min-h-10 sm:w-auto ${CLEAN_FOCUS}`}
          >
            {cancelLabel}
          </button>
          <button
            type={mode === 'prompt' ? 'submit' : 'button'}
            form={mode === 'prompt' ? 'celestian-prompt-form' : undefined}
            onClick={mode === 'prompt' ? undefined : submitConfirm}
            className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer sm:min-h-10 sm:w-auto ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500'
                : 'bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#4F46E5] dark:hover:bg-[#4338CA]'
            } ${CLEAN_FOCUS}`}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const CelestianConfirmHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const settledIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribeConfirmDialogs((request) => {
      setQueue((current) => [...current, request]);
    });
  }, []);

  const active = queue[0] ?? null;

  const resolveActive = useCallback(
    (confirmed: boolean, value?: string) => {
      if (!active || settledIdsRef.current.has(active.id)) return;
      settledIdsRef.current.add(active.id);
      if (active.kind === 'confirm') {
        active.resolve(confirmed);
      } else {
        active.resolve(confirmed ? (value ?? '') : null);
      }
      setQueue((current) => current.filter((item) => item.id !== active.id));
    },
    [active]
  );

  if (!active) return null;

  if (active.kind === 'prompt') {
    return (
      <CelestianConfirmDialog
        key={active.id}
        open={true}
        mode="prompt"
        title={active.options.title}
        message={active.options.message}
        defaultValue={active.options.defaultValue}
        placeholder={active.options.placeholder}
        confirmLabel={active.options.confirmLabel}
        cancelLabel={active.options.cancelLabel}
        required={active.options.required ?? true}
        tone="primary"
        onCancel={() => resolveActive(false)}
        onConfirm={(val) => resolveActive(true, val)}
      />
    );
  }

  return (
    <CelestianConfirmDialog
      key={active.id}
      open={true}
      mode="confirm"
      title={active.options.title}
      message={active.options.message}
      details={active.options.details}
      confirmLabel={active.options.confirmLabel}
      cancelLabel={active.options.cancelLabel}
      tone={active.options.tone ?? 'danger'}
      onCancel={() => resolveActive(false)}
      onConfirm={() => resolveActive(true)}
    />
  );
};
