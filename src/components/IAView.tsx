import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bot,
  Briefcase,
  CalendarClock,
  CalendarRange,
  Check,
  ChevronDown,
  Copy,
  Download,
  Dumbbell,
  ExternalLink,
  Eye,
  GraduationCap,
  Layers,
  Shield,
  SlidersHorizontal,
  Store,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { LifeOSState } from '../types';
import {
  AI_CONTEXT_DETAIL_LEVELS,
  AI_CONTEXT_TIME_WINDOWS,
  AI_GOALS,
  buildAIContextPrompt,
  buildContextMarkdownFilename,
  DEFAULT_AI_DETAIL_LEVEL,
  DEFAULT_AI_TIME_WINDOW_DAYS,
  getDefaultModulesForGoal,
  getGoalDataIndicator,
  getVisibleContextModules,
  type AIContextDetailLevel,
  type AIContextMode,
  type AIContextModuleId,
  type AIContextTimeWindowDays,
  type AIGoalId,
} from '../lib/aiContextBuilder';
import { fmtMoney, todayISO } from '../lib/storage';
import { PageHeader } from './PageHeader';
import { CelestianSwitch } from './ui/CelestianSwitch';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';

function safeExternalLink(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function downloadContextMarkdown(
  text: string,
  referenceDate: string = todayISO()
): string | null {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const filename = buildContextMarkdownFilename(referenceDate);
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  globalThis.setTimeout(() => {
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }, 0);
  return filename;
}

const GOAL_ICONS: Record<AIGoalId, React.ReactNode> = {
  organizar_dia: <CalendarClock size={18} strokeWidth={1.75} aria-hidden="true" />,
  revisar_finanzas: <Wallet size={18} strokeWidth={1.75} aria-hidden="true" />,
  plan_estudio: <GraduationCap size={18} strokeWidth={1.75} aria-hidden="true" />,
  analizar_entrenamiento: <Dumbbell size={18} strokeWidth={1.75} aria-hidden="true" />,
  impulsar_negocio: <Store size={18} strokeWidth={1.75} aria-hidden="true" />,
  busqueda_laboral: <Briefcase size={18} strokeWidth={1.75} aria-hidden="true" />,
};

export interface IAViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onOpenBusiness?: () => void;
  defaultPreviewOpen?: boolean;
  defaultLegacyOpen?: boolean;
  defaultMode?: AIContextMode;
  defaultTimeWindowDays?: AIContextTimeWindowDays;
  defaultDetailLevel?: AIContextDetailLevel;
}

const CLEAN_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]';

function blurOnMouseClick(event: React.MouseEvent<HTMLElement>) {
  if (event.detail > 0) {
    event.currentTarget.blur();
  }
}

export const IAView: React.FC<IAViewProps> = ({
  state,
  onUpdateState,
  defaultPreviewOpen = false,
  defaultLegacyOpen = false,
  defaultMode = 'guided',
  defaultTimeWindowDays = DEFAULT_AI_TIME_WINDOW_DAYS,
  defaultDetailLevel = DEFAULT_AI_DETAIL_LEVEL,
}) => {
  const visibleModules = useMemo(() => getVisibleContextModules(state), [state]);
  const visibleModuleIds = useMemo(
    () => new Set<AIContextModuleId>(visibleModules.map((mod) => mod.id)),
    [visibleModules]
  );

  const [lastGoalId, setLastGoalId] = useState<AIGoalId>('organizar_dia');
  const [selectedGoalId, setSelectedGoalId] = useState<AIGoalId | null>(() =>
    defaultMode === 'data_only' ? null : 'organizar_dia'
  );
  const [selectedModules, setSelectedModules] = useState<AIContextModuleId[]>(() =>
    getDefaultModulesForGoal('organizar_dia', state)
  );
  const [timeWindowDays, setTimeWindowDays] = useState<AIContextTimeWindowDays>(defaultTimeWindowDays);
  const [detailLevel, setDetailLevel] = useState<AIContextDetailLevel>(defaultDetailLevel);
  const [hideExactAmounts, setHideExactAmounts] = useState<boolean>(() =>
    Boolean(state.settings?.privacyMode)
  );
  const [customQuestion, setCustomQuestion] = useState('');
  const [showPreview, setShowPreview] = useState(defaultPreviewOpen);
  const [showLegacy, setShowLegacy] = useState(defaultLegacyOpen);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloadedRecently, setDownloadedRecently] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const copyTimerRef = useRef<number | null>(null);
  const downloadTimerRef = useRef<number | null>(null);

  const mode: AIContextMode = selectedGoalId === null ? 'data_only' : 'guided';

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (downloadTimerRef.current !== null) {
        window.clearTimeout(downloadTimerRef.current);
      }
    };
  }, []);

  const effectiveSelectedModules = useMemo(
    () => selectedModules.filter((id) => visibleModuleIds.has(id)),
    [selectedModules, visibleModuleIds]
  );

  const goalIndicators = useMemo(() => {
    const map = {} as Record<AIGoalId, ReturnType<typeof getGoalDataIndicator>>;
    for (const goal of AI_GOALS) {
      map[goal.id] = getGoalDataIndicator(goal.id, state, undefined, timeWindowDays);
    }
    return map;
  }, [state, timeWindowDays]);

  const contextResult = useMemo(
    () =>
      buildAIContextPrompt(state, {
        goalId: selectedGoalId,
        mode,
        selectedModules: effectiveSelectedModules,
        hideExactAmounts,
        timeWindowDays,
        detailLevel,
        customQuestion,
      }),
    [state, selectedGoalId, mode, effectiveSelectedModules, hideExactAmounts, timeWindowDays, detailLevel, customQuestion]
  );

  // Retrocompatibilidad: registros guardados con el formato anterior
  const legacyIdeas = state.ideas || [];
  const legacyJobOpportunities = (state.jobs?.opportunities || []).filter(
    (item) => item.status === 'nueva'
  );
  const legacyResaleOpportunities = (state.resale?.opportunities || []).filter(
    (item) => item.status === 'nueva'
  );
  const legacyTotal =
    legacyIdeas.length + legacyJobOpportunities.length + legacyResaleOpportunities.length;

  const handleChangeMode = (nextMode: AIContextMode) => {
    if (nextMode === 'data_only') {
      setSelectedGoalId(null);
    } else {
      const targetGoal = selectedGoalId ?? lastGoalId;
      setSelectedGoalId(targetGoal);
      if (effectiveSelectedModules.length === 0) {
        setSelectedModules(getDefaultModulesForGoal(targetGoal, state));
      }
    }
    setCopiedKey(null);
    setStatusMessage('');
  };

  const handleSelectGoal = (goalId: AIGoalId) => {
    if (selectedGoalId === goalId) {
      setSelectedGoalId(null);
      setCopiedKey(null);
      setStatusMessage('');
      return;
    }
    setLastGoalId(goalId);
    setSelectedGoalId(goalId);
    setSelectedModules(getDefaultModulesForGoal(goalId, state));
    setCopiedKey(null);
    setStatusMessage('');
  };

  const handleToggleModule = (moduleId: AIContextModuleId) => {
    setSelectedModules((prev) => {
      const current = prev.filter((id) => visibleModuleIds.has(id));
      if (current.includes(moduleId)) {
        return current.filter((id) => id !== moduleId);
      }
      return [...current, moduleId];
    });
    setCopiedKey(null);
  };

  const handleCopyText = async (key: string, text: string) => {
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      // Fallback below for restricted environments.
    }

    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setCopiedKey(key);
      setStatusMessage('');
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey(null);
        copyTimerRef.current = null;
      }, 1800);
    } else {
      setStatusMessage('No pude copiar automáticamente. Abrí la vista previa y copiá el texto.');
    }
  };

  const handleDownloadMarkdown = () => {
    try {
      const filename = downloadContextMarkdown(contextResult.text);
      if (filename) {
        setDownloadedRecently(true);
        setStatusMessage('');
        if (downloadTimerRef.current !== null) {
          window.clearTimeout(downloadTimerRef.current);
        }
        downloadTimerRef.current = window.setTimeout(() => {
          setDownloadedRecently(false);
          downloadTimerRef.current = null;
        }, 1800);
      } else {
        setStatusMessage('No pude iniciar la descarga en este navegador. Usá Copiar contexto.');
      }
    } catch {
      setStatusMessage('No pude descargar el archivo .md. Probá con Copiar contexto.');
    }
  };

  const saveStateChange = (updater: (draft: LifeOSState) => void) => {
    try {
      if (onUpdateState(updater) !== false) return;
    } catch {
      // Keep UI responsive on failed save.
    }
    setStatusMessage('No se pudo guardar el cambio. Intentá nuevamente.');
  };

  const handleDeleteLegacyIdea = (id: string) => {
    saveStateChange((draft) => {
      draft.ideas = (draft.ideas || []).filter((idea) => idea.id !== id);
    });
  };

  const handleDeleteLegacyJob = (id: string) => {
    saveStateChange((draft) => {
      if (!draft.jobs?.opportunities) return;
      const target = draft.jobs.opportunities.find((item) => item.id === id);
      if (target) target.status = 'descartada';
    });
  };

  const handleDeleteLegacyResale = (id: string) => {
    saveStateChange((draft) => {
      if (!draft.resale?.opportunities) return;
      const target = draft.resale.opportunities.find((item) => item.id === id);
      if (target) target.status = 'descartada';
    });
  };

  const formattedChars = contextResult.charCount.toLocaleString('es-UY');

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        title="IA"
        subtitle="Armá tu contexto real en 1 toque para consultarlo en tu IA favorita. Celestian no envía tus datos automáticamente."
      />

      {/* Bloque 1 — Elegí un objetivo */}
      <SurfaceCard className="p-4 sm:p-5 space-y-3.5" aria-labelledby="ia-goals-heading">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true">
              <Bot size={16} strokeWidth={1.75} />
            </span>
            <h2
              id="ia-goals-heading"
              className="truncate text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100"
            >
              1. Elegí un objetivo
            </h2>
          </div>

          <div
            role="group"
            aria-label="Modo de contexto"
            className="inline-flex w-full sm:w-auto items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]"
          >
            <button
              type="button"
              aria-pressed={mode === 'guided'}
              data-ia-mode="guided"
              onClick={(event) => {
                blurOnMouseClick(event);
                handleChangeMode('guided');
              }}
              className={`flex-1 sm:flex-initial min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                mode === 'guided'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Con guía
            </button>
            <button
              type="button"
              aria-pressed={mode === 'data_only'}
              data-ia-mode="data_only"
              onClick={(event) => {
                blurOnMouseClick(event);
                handleChangeMode('data_only');
              }}
              className={`flex-1 sm:flex-initial min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                mode === 'data_only'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Solo mis datos
            </button>
          </div>
        </div>

        {mode === 'data_only' && (
          <p className="rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-3 py-2 text-xs text-slate-700 dark:border-indigo-400/25 dark:bg-indigo-500/[0.08] dark:text-slate-300">
            Modo <strong className="font-semibold text-slate-900 dark:text-slate-100">Solo mis datos</strong> activo: se exportan tus módulos sin objetivo fijo. Tocá cualquier tarjeta para volver a usar una guía.
          </p>
        )}

        <div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          role="group"
          aria-label="Objetivos rápidos de contexto"
        >
          {AI_GOALS.map((goal) => {
            const isSelected = selectedGoalId === goal.id;
            const indicator = goalIndicators[goal.id];
            return (
              <button
                key={goal.id}
                type="button"
                aria-pressed={isSelected}
                data-ia-goal={goal.id}
                onClick={(event) => {
                  blurOnMouseClick(event);
                  handleSelectGoal(goal.id);
                }}
                className={`group flex min-h-[108px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${CLEAN_FOCUS} ${
                  isSelected
                    ? 'border-[#4F46E5] bg-[#4F46E5]/[0.06] dark:border-[#818CF8] dark:bg-[#4F46E5]/[0.16]'
                    : 'border-slate-200/80 bg-white hover:border-indigo-300/80 hover:bg-slate-50/70 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.04]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-[#4F46E5] text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-[#4F46E5] dark:bg-white/[0.06] dark:text-slate-300 dark:group-hover:bg-indigo-500/15 dark:group-hover:text-indigo-300'
                      }`}
                    >
                      {GOAL_ICONS[goal.id]}
                    </span>
                    {isSelected && (
                      <span
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-white"
                        aria-hidden="true"
                      >
                        <Check size={13} strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                      {goal.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {goal.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                  <span
                    className={`inline-block text-xs font-medium tabular-nums ${
                      indicator.hasData
                        ? isSelected
                          ? 'text-[#4F46E5] dark:text-indigo-300'
                          : 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {indicator.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </SurfaceCard>

      {/* Bloque 2 — Personalizá qué incluir */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4" aria-labelledby="ia-customize-heading">
        <SectionHeader
          id="ia-customize-heading"
          icon={<SlidersHorizontal size={16} strokeWidth={1.75} />}
          title="2. Personalizá qué incluir"
          count={`${effectiveSelectedModules.length} ${effectiveSelectedModules.length === 1 ? 'módulo' : 'módulos'}`}
        />

        {/* Chips de módulos */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Módulos incluidos en el contexto
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Módulos para incluir en el contexto"
          >
            {visibleModules.map((mod) => {
              const active = effectiveSelectedModules.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  aria-pressed={active}
                  data-ia-module={mod.id}
                  onClick={(event) => {
                    blurOnMouseClick(event);
                    handleToggleModule(mod.id);
                  }}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                    active
                      ? 'border-[#4F46E5] bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                      : 'border-slate-200/80 bg-white text-slate-700 hover:border-indigo-300/80 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  {active && <Check size={14} strokeWidth={2.25} aria-hidden="true" />}
                  <span>{mod.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ventana de tiempo */}
        <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            >
              <CalendarRange size={16} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Período de datos
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filtra movimientos de Finanzas, Gimnasio, Estudios y Mi negocio.
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Período de datos"
            className="inline-flex w-full sm:w-auto items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]"
          >
            {AI_CONTEXT_TIME_WINDOWS.map((option) => {
              const active = timeWindowDays === option.days;
              return (
                <button
                  key={option.days}
                  type="button"
                  aria-pressed={active}
                  data-ia-window={option.days}
                  onClick={(event) => {
                    blurOnMouseClick(event);
                    setTimeWindowDays(option.days);
                    setCopiedKey(null);
                  }}
                  className={`flex-1 sm:flex-initial min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                    active
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nivel de detalle */}
        <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            >
              <Layers size={16} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Nivel de detalle
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Resumido mantiene el contexto ágil; Detallado amplía sesiones, notas y desgloses.
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Nivel de detalle"
            className="inline-flex w-full sm:w-auto items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]"
          >
            {AI_CONTEXT_DETAIL_LEVELS.map((option) => {
              const active = detailLevel === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  data-ia-detail={option.id}
                  onClick={(event) => {
                    blurOnMouseClick(event);
                    setDetailLevel(option.id);
                    setCopiedKey(null);
                  }}
                  className={`flex-1 sm:flex-initial min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${CLEAN_FOCUS} ${
                    active
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Switch de privacidad */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={`mt-0.5 shrink-0 ${
                hideExactAmounts
                  ? 'text-[#4F46E5] dark:text-indigo-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
              aria-hidden="true"
            >
              <Shield size={16} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <label
                htmlFor="ia-hide-exact-amounts"
                className="block text-sm font-medium text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                Ocultar montos y datos personales
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reemplaza cifras por porcentajes, oculta nombres de cuentas bancarias y anonimiza nombres propios de terceros.
              </p>
            </div>
          </div>
          <CelestianSwitch
            id="ia-hide-exact-amounts"
            checked={hideExactAmounts}
            onChange={setHideExactAmounts}
            ariaLabel="Ocultar montos y datos personales"
          />
        </div>

        {/* Pregunta o restricción opcional */}
        <div className="space-y-1.5 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="ia-custom-question"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {mode === 'data_only'
                ? '¿Querés sumar una pregunta o consigna propia?'
                : '¿Querés sumar alguna pregunta o restricción?'}
            </label>
            <span className="text-xs text-slate-400 dark:text-slate-500">Opcional</span>
          </div>
          <textarea
            id="ia-custom-question"
            aria-label={
              mode === 'data_only'
                ? '¿Querés sumar una pregunta o consigna propia?'
                : '¿Querés sumar alguna pregunta o restricción?'
            }
            value={customQuestion}
            onChange={(event) => setCustomQuestion(event.target.value)}
            rows={2}
            placeholder={
              mode === 'data_only'
                ? 'Ej. "Analizá estos datos y marcame 3 puntos ciegos"'
                : 'Ej. "Tengo 2 horas libres hoy" o "Priorizá lo más urgente"'
            }
            className="celestian-clean-field block w-full min-h-[72px] resize-y rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/[0.09] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </SurfaceCard>

      {/* Bloque 3 — Listo para copiar */}
      <SurfaceCard className="p-4 sm:p-5 space-y-4" aria-labelledby="ia-ready-heading">
        <SectionHeader
          id="ia-ready-heading"
          icon={<Copy size={16} strokeWidth={1.75} />}
          title="3. Listo para copiar"
          action={
            <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
              ~{contextResult.wordCount} palabras
            </span>
          }
        />

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={(event) => {
                blurOnMouseClick(event);
                void handleCopyText('context', contextResult.text);
              }}
              className={`inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${CLEAN_FOCUS}`}
            >
              {copiedKey === 'context' ? (
                <Check size={16} strokeWidth={2.25} aria-hidden="true" />
              ) : (
                <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{copiedKey === 'context' ? 'Copiado' : 'Copiar contexto'}</span>
            </button>

            <button
              type="button"
              onClick={(event) => {
                blurOnMouseClick(event);
                handleDownloadMarkdown();
              }}
              className={`inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300/80 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-200 dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.04] cursor-pointer ${CLEAN_FOCUS}`}
            >
              {downloadedRecently ? (
                <Check size={15} strokeWidth={2.25} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              ) : (
                <Download size={15} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{downloadedRecently ? 'Descargado' : 'Descargar .md'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300/80 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-200 dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.04] ${CLEAN_FOCUS}`}
            >
              <span>Gemini</span>
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            </a>
            <a
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300/80 hover:bg-slate-50 dark:border-white/[0.1] dark:text-slate-200 dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.04] ${CLEAN_FOCUS}`}
            >
              <span>ChatGPT</span>
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </div>
        </div>

        {statusMessage && (
          <p role="status" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {statusMessage}
          </p>
        )}

        {/* Vista previa desplegable */}
        <div className="border-t border-slate-100 pt-3 dark:border-white/[0.06]">
          <button
            type="button"
            aria-expanded={showPreview}
            aria-controls="ia-context-preview"
            onClick={(event) => {
              blurOnMouseClick(event);
              setShowPreview((prev) => !prev);
            }}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-1 text-left text-sm font-medium text-slate-700 transition-colors hover:text-[#4F46E5] dark:text-slate-300 dark:hover:text-indigo-300 cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Eye size={15} strokeWidth={1.75} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <span className="truncate">Ver exactamente qué se va a copiar</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">{formattedChars} caracteres</span>
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className={`transition-transform duration-150 ${showPreview ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          {showPreview && (
            <div id="ia-context-preview" className="mt-2.5 space-y-2">
              <pre
                aria-label="Vista previa del contexto generado"
                className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 font-sans text-xs leading-relaxed text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
              >
                {contextResult.text}
              </pre>
              <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                Extensión aproximada: ~{contextResult.wordCount} palabras ({formattedChars} caracteres).
              </p>
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* Pie discreto — Registros anteriores (solo si existen datos previos) */}
      {legacyTotal > 0 && (
        <SurfaceCard className="p-4 sm:p-5" aria-label="Registros anteriores">
          <button
            type="button"
            aria-expanded={showLegacy}
            aria-controls="ia-legacy-records"
            onClick={(event) => {
              blurOnMouseClick(event);
              setShowLegacy((prev) => !prev);
            }}
            className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl text-left cursor-pointer ${CLEAN_FOCUS}`}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Archive size={16} strokeWidth={1.75} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                Registros anteriores ({legacyTotal})
              </span>
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={`shrink-0 text-slate-400 transition-transform duration-150 dark:text-slate-500 ${
                showLegacy ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showLegacy && (
            <div id="ia-legacy-records" className="mt-3 space-y-4 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ideas y oportunidades guardadas con el formato anterior. Podés consultarlas, copiarlas o eliminarlas.
              </p>

              {legacyIdeas.length > 0 && (
                <section className="space-y-1">
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Ideas ({legacyIdeas.length})
                  </h3>
                  <ListDivider>
                    {legacyIdeas.map((idea) => {
                      const rowCopyKey = `idea:${idea.id}`;
                      return (
                        <article
                          key={idea.id}
                          className="flex items-start justify-between gap-3 py-2.5 first:pt-1.5 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-900 dark:text-slate-100 break-words">
                              {idea.text}
                            </p>
                            <span className="mt-0.5 block text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {idea.date}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label="Copiar idea"
                              title="Copiar"
                              onClick={() => handleCopyText(rowCopyKey, idea.text)}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer ${CLEAN_FOCUS}`}
                            >
                              {copiedKey === rowCopyKey ? (
                                <Check size={15} strokeWidth={2} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                              ) : (
                                <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label="Eliminar idea"
                              title="Eliminar"
                              onClick={() => handleDeleteLegacyIdea(idea.id)}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer ${CLEAN_FOCUS}`}
                            >
                              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </ListDivider>
                </section>
              )}

              {legacyJobOpportunities.length > 0 && (
                <section className="space-y-1">
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Oportunidades laborales ({legacyJobOpportunities.length})
                  </h3>
                  <ListDivider>
                    {legacyJobOpportunities.map((job) => {
                      const rowCopyKey = `job:${job.id}`;
                      const safeLink = safeExternalLink(job.link);
                      const copyPayload = [
                        `${job.empresa}${job.puesto ? ` — ${job.puesto}` : ''}`,
                        job.nota || '',
                        safeLink || '',
                      ]
                        .filter(Boolean)
                        .join('\n');

                      return (
                        <article
                          key={job.id}
                          className="flex items-start justify-between gap-3 py-2.5 first:pt-1.5 last:pb-0"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                              {job.empresa}
                              {job.puesto ? ` · ${job.puesto}` : ''}
                            </p>
                            {job.nota && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 break-words">
                                {job.nota}
                              </p>
                            )}
                            {safeLink && (
                              <a
                                href={safeLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline dark:text-indigo-400"
                              >
                                <span>Abrir enlace</span>
                                <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
                              </a>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Copiar oportunidad ${job.empresa}`}
                              title="Copiar"
                              onClick={() => handleCopyText(rowCopyKey, copyPayload)}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer ${CLEAN_FOCUS}`}
                            >
                              {copiedKey === rowCopyKey ? (
                                <Check size={15} strokeWidth={2} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                              ) : (
                                <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar oportunidad ${job.empresa}`}
                              title="Eliminar"
                              onClick={() => handleDeleteLegacyJob(job.id)}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer ${CLEAN_FOCUS}`}
                            >
                              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </ListDivider>
                </section>
              )}

              {legacyResaleOpportunities.length > 0 && (
                <section className="space-y-1">
                  <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Posibles compras ({legacyResaleOpportunities.length})
                  </h3>
                  <ListDivider>
                    {legacyResaleOpportunities.map((resale) => {
                      const rowCopyKey = `resale:${resale.id}`;
                      const copyPayload = [
                        resale.item,
                        `Compra: ${fmtMoney(resale.buyPrice)} · Mercado: ${fmtMoney(resale.marketPrice)}`,
                        resale.nota || '',
                      ]
                        .filter(Boolean)
                        .join('\n');

                      return (
                        <article
                          key={resale.id}
                          className="flex items-start justify-between gap-3 py-2.5 first:pt-1.5 last:pb-0"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                              {resale.item}
                            </p>
                            <p className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
                              Compra {fmtMoney(resale.buyPrice)} · Mercado {fmtMoney(resale.marketPrice)}
                            </p>
                            {resale.nota && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                                {resale.nota}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Copiar posible compra ${resale.item}`}
                              title="Copiar"
                              onClick={() => handleCopyText(rowCopyKey, copyPayload)}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer ${CLEAN_FOCUS}`}
                            >
                              {copiedKey === rowCopyKey ? (
                                <Check size={15} strokeWidth={2} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                              ) : (
                                <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar posible compra ${resale.item}`}
                              title="Eliminar"
                              onClick={() => handleDeleteLegacyResale(resale.id)}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer ${CLEAN_FOCUS}`}
                            >
                              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </ListDivider>
                </section>
              )}
            </div>
          )}
        </SurfaceCard>
      )}
    </div>
  );
};
