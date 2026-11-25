import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  Download,
  ShieldCheck,
  Smartphone,
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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
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
        className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-5 dark:border-white/[0.08] dark:bg-[#0D111A] outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2
                id="cloud-conflict-title"
                className="text-base sm:text-lg font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100 leading-snug"
              >
                Hay cambios distintos entre este dispositivo y la nube
              </h2>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Áreas con diferencias: <span className="font-medium text-slate-800 dark:text-slate-200">{affectedAreasSummary}</span>.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              disabled={isApplying}
              aria-label="Cerrar"
              title="Cerrar"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
          >
            {errorMessage}
          </div>
        )}

        {/* Two clear 1-tap decision cards */}
        <div className="grid grid-cols-1 gap-3">
          {/* Option 1: Use Cloud */}
          <div
            className={`rounded-2xl border p-4 transition-colors space-y-3 ${
              pendingAction === 'cloud'
                ? 'border-[#4F46E5] bg-[#4F46E5]/[0.06] dark:bg-[#4F46E5]/15'
                : recommendedSide === 'cloud'
                ? 'border-[#4F46E5]/45 bg-[#4F46E5]/[0.03] dark:border-indigo-400/35 dark:bg-[#4F46E5]/[0.08]'
                : 'border-slate-200/80 bg-slate-50/60 dark:border-white/[0.08] dark:bg-white/[0.02]'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5]/12 text-[#4F46E5] dark:text-indigo-400">
                <Cloud size={18} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Usar datos de la nube
                  </h3>
                  {recommendedSide === 'cloud' && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[#4F46E5]/12 px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/25 dark:text-indigo-300">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Ideal si entraste desde un dispositivo nuevo y querés traer tu información guardada.
                </p>
              </div>
            </div>

            {cloudHighlights.length > 0 && (
              <ul className="space-y-1 border-t border-slate-200/60 pt-2.5 text-xs text-slate-600 dark:border-white/[0.06] dark:text-slate-300">
                {cloudHighlights.map((line) => (
                  <li key={line} className="flex items-start gap-2 min-w-0">
                    <Check size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                    <span className="break-words min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              disabled={isApplying}
              onClick={() => setPendingAction('cloud')}
              className={`w-full min-h-11 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                recommendedSide === 'cloud'
                  ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                  : 'border border-slate-200/90 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]'
              }`}
            >
              Usar datos de la nube
            </button>
          </div>

          {/* Option 2: Keep This Device */}
          <div
            className={`rounded-2xl border p-4 transition-colors space-y-3 ${
              pendingAction === 'local'
                ? 'border-[#4F46E5] bg-[#4F46E5]/[0.06] dark:bg-[#4F46E5]/15'
                : recommendedSide === 'local'
                ? 'border-[#4F46E5]/45 bg-[#4F46E5]/[0.03] dark:border-indigo-400/35 dark:bg-[#4F46E5]/[0.08]'
                : 'border-slate-200/80 bg-slate-50/60 dark:border-white/[0.08] dark:bg-white/[0.02]'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200/70 text-slate-700 dark:bg-white/[0.08] dark:text-slate-300">
                <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Conservar este dispositivo
                  </h3>
                  {recommendedSide === 'local' && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[#4F46E5]/12 px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5] dark:bg-[#4F46E5]/25 dark:text-indigo-300">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Ideal si trabajaste sin conexión acá y querés reemplazar lo que está en la nube.
                </p>
              </div>
            </div>

            {localHighlights.length > 0 && (
              <ul className="space-y-1 border-t border-slate-200/60 pt-2.5 text-xs text-slate-600 dark:border-white/[0.06] dark:text-slate-300">
                {localHighlights.map((line) => (
                  <li key={line} className="flex items-start gap-2 min-w-0">
                    <Check size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <span className="break-words min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              disabled={isApplying}
              onClick={() => setPendingAction('local')}
              className={`w-full min-h-11 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                recommendedSide === 'local'
                  ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                  : 'border border-slate-200/90 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]'
              }`}
            >
              Conservar este dispositivo
            </button>
          </div>
        </div>

        {/* Brief inline confirmation step */}
        {pendingAction && (
          <div className="rounded-xl border border-[#4F46E5]/35 bg-[#4F46E5]/[0.05] p-3.5 space-y-3 dark:bg-[#4F46E5]/12">
            <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-100">
              {pendingAction === 'cloud'
                ? '¿Confirmás usar los datos de la nube? Antes de aplicar, guardaremos una copia de respaldo automática de este dispositivo.'
                : '¿Confirmás conservar los datos de este dispositivo y actualizar la nube? Antes de aplicar, guardaremos una copia de respaldo automática de la nube.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isApplying}
                onClick={() => setPendingAction(null)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isApplying}
                onClick={handleConfirmPendingAction}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer disabled:opacity-50"
              >
                {isApplying ? 'Aplicando…' : 'Sí, aplicar ahora'}
              </button>
            </div>
          </div>
        )}

        {onCombine && (
          <button
            type="button"
            disabled={isApplying}
            onClick={() => void onCombine()}
            className="w-full min-h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300 cursor-pointer disabled:opacity-50"
          >
            Combinar cambios compatibles automáticamente
          </button>
        )}

        {/* Automatic backup reassurance */}
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
          <ShieldCheck size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Respaldo automático: antes de aplicar cualquier cambio, Celestian guarda una copia local de seguridad para que nunca pierdas información.
          </span>
        </div>

        {/* Secondary collapsible: Advanced options */}
        <div className="border-t border-slate-100 pt-3 dark:border-white/[0.06]">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className="flex w-full min-h-10 items-center justify-between gap-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 rounded-lg"
          >
            <span>Opciones avanzadas: revisar módulo por módulo</span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={`shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-3">
              {hasLinkedBusinessAndFinance && (
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Mi negocio y Finanzas se eligen juntos para mantener tus saldos y ventas siempre exactos.
                </p>
              )}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                {comparisons.map((item) => {
                  const isIdentical = item.status === 'identical';
                  const choice = moduleChoices[item.module] ?? item.recommendedChoice;
                  return (
                    <div
                      key={item.module}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 space-y-2 dark:border-white/[0.07] dark:bg-white/[0.02]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {item.label}
                        </span>
                        {isIdentical ? (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            Sin diferencias
                          </span>
                        ) : onApplyModuleChoices ? (
                          <div
                            role="group"
                            aria-label={`Elegir versión para ${item.label}`}
                            className="inline-flex rounded-lg border border-slate-200/80 bg-white p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectModuleChoice(item.module, 'remote')}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                                choice === 'remote'
                                  ? 'bg-[#4F46E5] text-white'
                                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                              }`}
                            >
                              Nube
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectModuleChoice(item.module, 'local')}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
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

                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-[11px]">
                        <div className="rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                          <span className="block font-semibold text-[#4F46E5] dark:text-indigo-400">En la nube</span>
                          <span className="block break-words text-slate-700 dark:text-slate-300">{item.remoteSummary}</span>
                        </div>
                        <div className="rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                          <span className="block font-semibold text-slate-600 dark:text-slate-400">En este dispositivo</span>
                          <span className="block break-words text-slate-700 dark:text-slate-300">{item.localSummary}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {conflicts.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Detalles puntuales ({conflicts.length})
                  </div>
                  {conflicts.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200/70 bg-white p-2 text-[11px] space-y-1 dark:border-white/[0.06] dark:bg-white/[0.03]">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</div>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        <span className="text-slate-600 dark:text-slate-400">
                          Este dispositivo: <strong className="text-slate-900 dark:text-slate-100">{item.localSummary}</strong>
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          Nube: <strong className="text-[#4F46E5] dark:text-indigo-300">{item.remoteSummary}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {onApplyModuleChoices && (
                <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="conflict-advanced-confirm-switch"
                      className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
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
                    onClick={handleApplyAdvanced}
                    className="w-full min-h-10 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-45 cursor-pointer"
                  >
                    {isApplying ? 'Aplicando selección…' : 'Aplicar selección por módulo'}
                  </button>
                </div>
              )}

              {onExportConflict && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onExportConflict}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/[0.05] cursor-pointer"
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
    </div>
  );
};
