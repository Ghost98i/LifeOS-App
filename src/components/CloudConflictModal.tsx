import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  Download,
  Laptop,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LifeOSState } from '../types';
import {
  getHumanModuleLabel,
  syncModuleData,
  type SyncConflictItem,
  type SyncModuleKey,
} from '../lib/syncModel';
import { summarizeModuleForReconciliation } from '../lib/resaleConflictResolution';
import { CelestianSwitch } from './ui/CelestianSwitch';
import { useDialogFocus } from '../hooks/useDialogFocus';

const CLEAN_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

function blurOnMouseClick(event: React.MouseEvent<HTMLElement>) {
  if (event.detail > 0) {
    event.currentTarget.blur();
  }
}

export interface ConflictModuleComparison {
  module: SyncModuleKey;
  label: string;
  localSummary: string;
  remoteSummary: string;
  recommendedChoice: 'local' | 'remote';
  status?: 'identical' | 'local_only_changes' | 'remote_only_changes' | 'diverged' | 'missing_remote';
}

export interface CloudConflictModalProps {
  modules: SyncModuleKey[];
  localState?: LifeOSState;
  remoteState?: LifeOSState;
  moduleComparisons?: ConflictModuleComparison[];
  conflicts?: SyncConflictItem[];
  recommendedSide?: 'cloud' | 'local';
  isApplying?: boolean;
  errorMessage?: string | null;
  onUseCloud: () => void | Promise<void>;
  onUseLocal: () => void | Promise<void>;
  onApplyModuleChoices?: (choices: Partial<Record<SyncModuleKey, 'local' | 'remote'>>) => void | Promise<void>;
  onCombine?: () => void | Promise<void>;
  onExportConflict?: () => void;
  onClose?: () => void;
}

function compactHumanSummary(raw: string): string {
  const parts = raw
    .split('·')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw;
  const nonZero = parts.filter((part) => !/^0\s/.test(part) && !/^sin\s/i.test(part));
  const chosen = nonZero.length > 0 ? nonZero : parts.slice(0, 2);
  return chosen.slice(0, 3).join(' · ');
}

function buildHumanSideHighlights(
  items: ConflictModuleComparison[],
  side: 'local' | 'remote'
): string[] {
  const differing = items.filter((item) => item.status !== 'identical');
  const source = differing.length > 0 ? differing : items;
  return source.slice(0, 4).map((item) => {
    const raw = side === 'remote' ? item.remoteSummary : item.localSummary;
    return `${item.label}: ${compactHumanSummary(raw)}`;
  });
}

export const CloudConflictModal: React.FC<CloudConflictModalProps> = ({
  modules,
  localState,
  remoteState,
  moduleComparisons,
  conflicts = [],
  recommendedSide = 'cloud',
  isApplying = false,
  errorMessage = null,
  onUseCloud,
  onUseLocal,
  onApplyModuleChoices,
  onCombine,
  onExportConflict,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [pendingAction, setPendingAction] = useState<'cloud' | 'local' | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmAdvancedMix, setConfirmAdvancedMix] = useState(false);

  const comparisons = useMemo<ConflictModuleComparison[]>(() => {
    if (moduleComparisons && moduleComparisons.length > 0) {
      return moduleComparisons.map((item) => ({
        ...item,
        label: getHumanModuleLabel(item.module),
      }));
    }
    return modules.map((mod) => ({
      module: mod,
      label: getHumanModuleLabel(mod),
      localSummary: localState
        ? summarizeModuleForReconciliation(mod, syncModuleData(localState, mod))
        : 'Cambios guardados en este dispositivo',
      remoteSummary: remoteState
        ? summarizeModuleForReconciliation(mod, syncModuleData(remoteState, mod))
        : 'Versión guardada en la nube',
      recommendedChoice: recommendedSide === 'local' ? 'local' : 'remote',
      status: 'diverged',
    }));
  }, [moduleComparisons, modules, localState, remoteState, recommendedSide]);

  const differingComparisons = useMemo(
    () => comparisons.filter((item) => item.status !== 'identical'),
    [comparisons]
  );

  const [moduleChoices, setModuleChoices] = useState<Partial<Record<SyncModuleKey, 'local' | 'remote'>>>(() => {
    const initial: Partial<Record<SyncModuleKey, 'local' | 'remote'>> = {};
    for (const item of comparisons) {
      initial[item.module] = item.recommendedChoice;
    }
    return initial;
  });

  useEffect(() => {
    setModuleChoices((prev) => {
      const next: Partial<Record<SyncModuleKey, 'local' | 'remote'>> = { ...prev };
      for (const item of comparisons) {
        if (!next[item.module]) {
          next[item.module] = item.recommendedChoice;
        }
      }
      return next;
    });
  }, [comparisons]);

  const handleClose = () => {
    if (isApplying) return;
    onClose?.();
  };

  useDialogFocus(true, dialogRef, handleClose);

  const cloudHighlights = useMemo(
    () => buildHumanSideHighlights(comparisons, 'remote'),
    [comparisons]
  );
  const localHighlights = useMemo(
    () => buildHumanSideHighlights(comparisons, 'local'),
    [comparisons]
  );

  const hasLinkedBusinessAndFinance =
    differingComparisons.some((item) => item.module === 'resale') &&
    differingComparisons.some((item) => item.module === 'finance');

  const handleSelectModuleChoice = (mod: SyncModuleKey, choice: 'local' | 'remote') => {
    setModuleChoices((prev) => {
      const next = { ...prev, [mod]: choice };
      if ((mod === 'resale' || mod === 'finance') && hasLinkedBusinessAndFinance) {
        next.resale = choice;
        next.finance = choice;
      }
      return next;
    });
  };

  const handleConfirmPendingAction = () => {
    if (isApplying || !pendingAction) return;
    if (pendingAction === 'cloud') {
      void onUseCloud();
    } else {
      void onUseLocal();
    }
  };

  const handleApplyAdvanced = () => {
    if (isApplying || !onApplyModuleChoices || !confirmAdvancedMix) return;
    void onApplyModuleChoices(moduleChoices);
  };

  const affectedAreasSummary = useMemo(() => {
    const names = (differingComparisons.length > 0 ? differingComparisons : comparisons).map(
      (item) => item.label
    );
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`;
  }, [comparisons, differingComparisons]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-conflict-title"
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0D111A] outline-none"
      >
        {/* Pinned Header */}
        <header className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5 dark:border-white/[0.06]">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <AlertTriangle size={19} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2
                id="cloud-conflict-title"
                className="text-base sm:text-[17px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100 leading-snug"
              >
                Hay cambios distintos entre este dispositivo y la nube
              </h2>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Áreas con diferencias:{' '}
                <span className="font-medium text-slate-800 dark:text-slate-200">{affectedAreasSummary}</span>.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={(event) => {
                blurOnMouseClick(event);
                handleClose();
              }}
              disabled={isApplying}
              aria-label="Cerrar"
              title="Cerrar"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer disabled:opacity-40 ${CLEAN_FOCUS}`}
            >
              <X size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
            >
              {errorMessage}
            </div>
          )}

          {/* Side-by-side Decision Cards (stack cleanly on 389px mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option 1: Use Cloud */}
            <div
              className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors gap-3.5 ${
                pendingAction === 'cloud'
                  ? 'border-[#4F46E5] bg-[#4F46E5]/[0.05] dark:border-[#818CF8] dark:bg-[#4F46E5]/[0.14]'
                  : recommendedSide === 'cloud'
                  ? 'border-[#4F46E5]/40 bg-[#4F46E5]/[0.025] dark:border-[#818CF8]/35 dark:bg-[#4F46E5]/[0.07]'
                  : 'border-slate-200/85 bg-white dark:border-white/[0.08] dark:bg-white/[0.02]'
              }`}
            >
              <div className="space-y-3">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/18 dark:text-[#818CF8]">
                      <Cloud size={18} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    {recommendedSide === 'cloud' && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-[#4F46E5]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/25 dark:text-[#818CF8]">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      Usar datos de la nube
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      Ideal si entraste desde un dispositivo nuevo y querés traer tu información guardada.
                    </p>
                  </div>
                </div>

                {cloudHighlights.length > 0 && (
                  <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-white/[0.06] dark:text-slate-300">
                    {cloudHighlights.map((line) => (
                      <li key={line} className="flex items-start gap-2 min-w-0">
                        <Check size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                        <span className="break-words min-w-0 leading-snug">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-1">
                {pendingAction === 'cloud' ? (
                  <div className="space-y-2 rounded-xl border border-[#4F46E5]/25 bg-white/80 p-2.5 dark:border-[#818CF8]/25 dark:bg-[#0D111A]/60">
                    <p className="text-[11px] leading-snug font-medium text-slate-700 dark:text-slate-200">
                      ¿Confirmás usar la nube? Se guarda respaldo local automático.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isApplying}
                        onClick={(event) => {
                          blurOnMouseClick(event);
                          setPendingAction(null);
                        }}
                        className={`min-h-10 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS}`}
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        disabled={isApplying}
                        onClick={(event) => {
                          blurOnMouseClick(event);
                          handleConfirmPendingAction();
                        }}
                        className={`flex-1 min-h-10 rounded-xl bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS}`}
                      >
                        {isApplying ? 'Aplicando…' : 'Sí, aplicar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isApplying}
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      setPendingAction('cloud');
                    }}
                    className={`w-full min-h-11 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS} ${
                      recommendedSide === 'cloud'
                        ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                        : 'border border-slate-200/90 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    Usar datos de la nube
                  </button>
                )}
              </div>
            </div>

            {/* Option 2: Keep This Device */}
            <div
              className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors gap-3.5 ${
                pendingAction === 'local'
                  ? 'border-[#4F46E5] bg-[#4F46E5]/[0.05] dark:border-[#818CF8] dark:bg-[#4F46E5]/[0.14]'
                  : recommendedSide === 'local'
                  ? 'border-[#4F46E5]/40 bg-[#4F46E5]/[0.025] dark:border-[#818CF8]/35 dark:bg-[#4F46E5]/[0.07]'
                  : 'border-slate-200/85 bg-white dark:border-white/[0.08] dark:bg-white/[0.02]'
              }`}
            >
              <div className="space-y-3">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        recommendedSide === 'local'
                          ? 'bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/18 dark:text-[#818CF8]'
                          : 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300'
                      }`}
                    >
                      <Laptop size={18} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    {recommendedSide === 'local' && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-[#4F46E5]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/25 dark:text-[#818CF8]">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      Conservar este dispositivo
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      Ideal si trabajaste sin conexión acá y querés reemplazar lo que está en la nube.
                    </p>
                  </div>
                </div>

                {localHighlights.length > 0 && (
                  <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-white/[0.06] dark:text-slate-300">
                    {localHighlights.map((line) => (
                      <li key={line} className="flex items-start gap-2 min-w-0">
                        <Check size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        <span className="break-words min-w-0 leading-snug">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-1">
                {pendingAction === 'local' ? (
                  <div className="space-y-2 rounded-xl border border-[#4F46E5]/25 bg-white/80 p-2.5 dark:border-[#818CF8]/25 dark:bg-[#0D111A]/60">
                    <p className="text-[11px] leading-snug font-medium text-slate-700 dark:text-slate-200">
                      ¿Confirmás subir este dispositivo? Se respalda la nube antes.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isApplying}
                        onClick={(event) => {
                          blurOnMouseClick(event);
                          setPendingAction(null);
                        }}
                        className={`min-h-10 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS}`}
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        disabled={isApplying}
                        onClick={(event) => {
                          blurOnMouseClick(event);
                          handleConfirmPendingAction();
                        }}
                        className={`flex-1 min-h-10 rounded-xl bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS}`}
                      >
                        {isApplying ? 'Aplicando…' : 'Sí, aplicar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isApplying}
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      setPendingAction('local');
                    }}
                    className={`w-full min-h-11 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS} ${
                      recommendedSide === 'local'
                        ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                        : 'border border-slate-200/90 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    Conservar este dispositivo
                  </button>
                )}
              </div>
            </div>
          </div>

          {onCombine && (
            <button
              type="button"
              disabled={isApplying}
              onClick={(event) => {
                blurOnMouseClick(event);
                void onCombine();
              }}
              className={`w-full min-h-11 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300 cursor-pointer disabled:opacity-50 ${CLEAN_FOCUS}`}
            >
              Combinar cambios compatibles automáticamente
            </button>
          )}

          {/* Secondary collapsible: Advanced options */}
          <div className="border-t border-slate-100 pt-3 dark:border-white/[0.06]">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={(event) => {
                blurOnMouseClick(event);
                setAdvancedOpen((prev) => !prev);
              }}
              className={`flex w-full min-h-10 items-center justify-between gap-2 rounded-lg px-1 text-left text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer ${CLEAN_FOCUS}`}
            >
              <span>Opciones avanzadas: revisar módulo por módulo</span>
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className={`shrink-0 transition-transform duration-150 ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {advancedOpen && (
              <div className="mt-3 space-y-3">
                {hasLinkedBusinessAndFinance && (
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Mi negocio y Finanzas se eligen juntos para mantener tus saldos y ventas siempre exactos.
                  </p>
                )}

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 divide-y divide-slate-200/70 dark:border-white/[0.08] dark:bg-white/[0.015] dark:divide-white/[0.06]">
                  {comparisons.map((item) => {
                    const isIdentical = item.status === 'identical';
                    const choice = moduleChoices[item.module] ?? item.recommendedChoice;
                    return (
                      <div key={item.module} className="p-3 sm:p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {item.label}
                          </span>
                          {isIdentical ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              Sin diferencias
                            </span>
                          ) : onApplyModuleChoices ? (
                            <div
                              role="group"
                              aria-label={`Elegir versión para ${item.label}`}
                              className="inline-flex rounded-lg border border-slate-200/80 bg-slate-100/80 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]"
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  blurOnMouseClick(event);
                                  handleSelectModuleChoice(item.module, 'remote');
                                }}
                                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                                  choice === 'remote'
                                    ? 'bg-[#4F46E5] text-white'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                                }`}
                              >
                                Nube
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  blurOnMouseClick(event);
                                  handleSelectModuleChoice(item.module, 'local');
                                }}
                                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                                  choice === 'local'
                                    ? 'bg-[#4F46E5] text-white'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                                }`}
                              >
                                Este dispositivo
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px]">
                          <div className="min-w-0 rounded-lg border border-slate-200/70 bg-white px-2.5 py-2 dark:border-white/[0.06] dark:bg-[#0D111A]/60">
                            <span className="block font-semibold text-[#4F46E5] dark:text-[#818CF8]">En la nube</span>
                            <span className="mt-0.5 block break-words leading-snug text-slate-700 dark:text-slate-300">
                              {item.remoteSummary}
                            </span>
                          </div>
                          <div className="min-w-0 rounded-lg border border-slate-200/70 bg-white px-2.5 py-2 dark:border-white/[0.06] dark:bg-[#0D111A]/60">
                            <span className="block font-semibold text-slate-600 dark:text-slate-400">En este dispositivo</span>
                            <span className="mt-0.5 block break-words leading-snug text-slate-700 dark:text-slate-300">
                              {item.localSummary}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {conflicts.length > 0 && (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 divide-y divide-slate-200/70 dark:border-white/[0.08] dark:bg-white/[0.015] dark:divide-white/[0.06]">
                    <div className="px-3 py-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Detalles puntuales ({conflicts.length})
                    </div>
                    {conflicts.map((item) => (
                      <div key={item.id} className="px-3 py-2.5 text-[11px] space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</div>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          <span className="break-words text-slate-600 dark:text-slate-400">
                            Este dispositivo:{' '}
                            <strong className="text-slate-900 dark:text-slate-100">{item.localSummary}</strong>
                          </span>
                          <span className="break-words text-slate-600 dark:text-slate-400">
                            Nube:{' '}
                            <strong className="text-[#4F46E5] dark:text-[#818CF8]">{item.remoteSummary}</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {onApplyModuleChoices && (
                  <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="conflict-advanced-confirm-switch"
                        className="text-xs leading-snug text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Confirmo aplicar la combinación personalizada elegida arriba
                      </label>
                      <CelestianSwitch
                        id="conflict-advanced-confirm-switch"
                        checked={confirmAdvancedMix}
                        onChange={setConfirmAdvancedMix}
                        ariaLabel="Confirmar combinación personalizada por módulo"
                        size="sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!confirmAdvancedMix || isApplying}
                      onClick={(event) => {
                        blurOnMouseClick(event);
                        handleApplyAdvanced();
                      }}
                      className={`w-full min-h-11 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-45 cursor-pointer ${CLEAN_FOCUS}`}
                    >
                      {isApplying ? 'Aplicando selección…' : 'Aplicar selección por módulo'}
                    </button>
                  </div>
                )}

                {onExportConflict && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={(event) => {
                        blurOnMouseClick(event);
                        onExportConflict();
                      }}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/[0.05] cursor-pointer ${CLEAN_FOCUS}`}
                    >
                      <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Exportar copia del conflicto</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pinned Automatic Backup Footer */}
        <footer className="shrink-0 flex items-start gap-2.5 border-t border-slate-100 bg-slate-50/75 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 text-[11px] leading-relaxed text-slate-600 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
          <ShieldCheck size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Respaldo automático: antes de aplicar cualquier cambio, Celestian guarda una copia local de seguridad para que nunca pierdas información.
          </span>
        </footer>
      </div>
    </div>
  );
};
