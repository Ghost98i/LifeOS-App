import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CornerDownLeft } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { JobApplication, JobApplicationType, LifeOSState, ViewType } from '../types';
import type { CaptureKind } from './MobileQuickCapture';
import { AppIcon, type AppIconName } from './AppIcon';
import { scoreSearchMatch, searchLifeOS, type SearchResult } from '../lib/search';
import { formatMoney, todayISO, uid } from '../lib/storage';
import { PrivateFinancialText, PrivacyAmount } from './PrivacyAmount';
import { maskFinancialText } from '../lib/financialPrivacy';
import { addTransaction } from '../lib/financeFlows';
import { showToast } from '../lib/toast';
import { playSound } from '../lib/audio';
import { getActiveCategories } from '../lib/financeCategories';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { getJobStageLabel, isJobStatusForType, JOB_STAGES } from '../lib/jobApplications';
import {
  parseCaptureDrafts,
  confirmCaptureDraft,
  canConfirmDraft,
  type CaptureDraft,
} from '../lib/quickCaptureDrafts';
import {
  filterCommandPaletteRecents,
  loadCommandPaletteRecents,
  recordCommandPaletteRecent,
  type PaletteRecentEntry,
} from '../lib/commandPaletteRecents';
import { LiveCapturePreview } from './LiveCapturePreview';

export interface GlobalSearchModalProps {
  state: LifeOSState;
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onNavigate: (view: ViewType, focusId?: string, txType?: 'gasto' | 'ingreso') => void;
  onUpdateState?: (fn: (draft: LifeOSState) => void) => boolean | void;
  onOpenCapture?: (kind?: CaptureKind, initialText?: string) => void;
  onToggleTheme?: () => void;
  onTogglePrivacy?: () => void;
  cloudConnected?: boolean;
  onForceSync?: () => void;
}

type PaletteMode = 'palette' | 'new-expense' | 'new-job';

interface PaletteItem {
  id: string;
  category: string;
  categoryOrder: number;
  title: string;
  subtitle: string;
  iconName: AppIconName;
  badge?: string;
  badgeTone?: 'indigo' | 'green' | 'red' | 'gray';
  shortcutHint?: string;
  isSensitive?: boolean;
  keywords?: string[];
  score?: number;
  onSelect: () => void;
}

interface ViewMeta {
  view: ViewType;
  label: string;
  desc: string;
  icon: AppIconName;
  keywords: string[];
  shortcut?: string;
}

const VIEW_METADATA: ViewMeta[] = [
  { view: 'dashboard', label: 'Hoy', desc: 'Prioridades, checklist diario y resumen', icon: 'home', keywords: ['inicio', 'hoy', 'dashboard', 'habitos', 'rutina'], shortcut: 'G H' },
  { view: 'finanzas', label: 'Finanzas', desc: 'Gastos, ingresos, presupuestos y cuentas', icon: 'wallet', keywords: ['finanzas', 'gastos', 'plata', 'dinero', 'cuentas', 'tarjetas'], shortcut: 'G F' },
  { view: 'gimnasio', label: 'Gimnasio', desc: 'Rutinas, PRs, temporizador y pesaje', icon: 'dumbbell', keywords: ['gym', 'gimnasio', 'entrenar', 'pesas', 'musculos', 'peso', 'entrenamiento'], shortcut: 'G G' },
  { view: 'agenda', label: 'Agenda', desc: 'Bloques horarios y rutinas semanales', icon: 'calendar', keywords: ['agenda', 'horario', 'semana', 'bloques'], shortcut: 'G A' },
  { view: 'calendario', label: 'Calendario', desc: 'Eventos, hitos y fechas clave del mes', icon: 'calendarDays', keywords: ['calendario', 'eventos', 'mes', 'fechas'] },
  { view: 'estudios', label: 'Estudios', desc: 'Materias, exámenes, foco y práctica', icon: 'graduation', keywords: ['estudio', 'estudios', 'facultad', 'materias', 'examenes', 'pomodoro'] },
  { view: 'trabajo', label: 'Trabajo', desc: 'Postulaciones laborales, etapas y entrevistas', icon: 'briefcase', keywords: ['trabajo', 'empleo', 'cv', 'postulaciones', 'entrevistas'], shortcut: 'G T' },
  { view: 'reventa', label: 'Mi negocio', desc: 'Productos, inventario, ventas y márgenes', icon: 'store', keywords: ['reventa', 'ventas', 'inventario', 'productos', 'negocio', 'stock'] },
  { view: 'notas', label: 'Notas', desc: 'Apuntes, listas de compras y enlaces', icon: 'note', keywords: ['notas', 'postits', 'compras', 'links', 'enlaces'], shortcut: 'G N' },
  { view: 'ia', label: 'IA', desc: 'Contexto personal, ideas y copiloto', icon: 'ai', keywords: ['ia', 'ai', 'ideas', 'copiloto', 'contexto', 'asistente'] },
  { view: 'config', label: 'Configuración', desc: 'Cuenta, sincronización, privacidad y respaldos', icon: 'settings', keywords: ['config', 'ajustes', 'backup', 'nube', 'perfil', 'privacidad'] },
  { view: 'checkout', label: 'Cerrar Día', desc: 'Revisión nocturna y balance de la jornada', icon: 'moon', keywords: ['checkout', 'cerrar', 'noche', 'balance', 'dia'] },
];

function sanitizeRecentSubtitle(
  subtitle: string | undefined,
  isSensitive: boolean | undefined,
  privacyMode: boolean,
  fallbackView?: ViewType
): string {
  if (!subtitle) return fallbackView ? 'Acceso reciente' : 'Reciente';
  if (!privacyMode) return subtitle;
  if (isSensitive) {
    const viewLabel = VIEW_METADATA.find((v) => v.view === fallbackView)?.label;
    return viewLabel ? `${viewLabel} · Privacidad activa` : 'Información protegida';
  }
  return maskFinancialText(subtitle, true);
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  state,
  open,
  initialQuery = '',
  onClose,
  onNavigate,
  onUpdateState,
  onOpenCapture,
  onToggleTheme,
  onTogglePrivacy,
  cloudConnected = false,
  onForceSync,
}) => {
  const [mode, setMode] = useState<PaletteMode>('palette');
  const [query, setQuery] = useState(initialQuery);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recentEntries, setRecentEntries] = useState<PaletteRecentEntry[]>(() =>
    loadCommandPaletteRecents()
  );

  const privacyMode = Boolean(state.settings?.privacyMode);
  const darkMode = Boolean(state.settings?.darkMode);

  const activeFinanceCategories = useMemo(
    () => getActiveCategories(state.finance?.categories),
    [state.finance?.categories]
  );

  // Micro-form state: Expense (fallback when onOpenCapture is not provided)
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(
    () => getActiveCategories(state.finance?.categories)[0]?.id || 'Comida'
  );
  const [expenseAccount, setExpenseAccount] = useState(state.finance.accounts[0]?.id || '');
  const [expenseNote, setExpenseNote] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);
  const expenseOperationId = useRef<string | null>(null);
  useEffect(() => {
    if (!open || mode !== 'new-expense') expenseOperationId.current = null;
  }, [open, mode]);

  // Micro-form state: Job
  const [jobEmpresa, setJobEmpresa] = useState('');
  const [jobPuesto, setJobPuesto] = useState('');
  const [jobEstado, setJobEstado] = useState<JobApplication['estado']>('cv_enviado');
  const [jobTipo, setJobTipo] = useState<JobApplicationType>('convencional');
  const [jobReclutador, setJobReclutador] = useState('');
  const [jobLink, setJobLink] = useState('');
  const [jobSaving, setJobSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const expenseAmountRef = useRef<HTMLInputElement>(null);
  const jobEmpresaRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const selectionSourceRef = useRef<'keyboard' | 'pointer'>('keyboard');
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  // Keep default expense account populated without resetting palette state on unrelated state updates
  useEffect(() => {
    if (!expenseAccount && state.finance.accounts[0]?.id) {
      setExpenseAccount(state.finance.accounts[0].id);
    }
  }, [expenseAccount, state.finance.accounts]);

  // Reset, reload recents, and immediately focus search input ONLY when opening
  useEffect(() => {
    if (!open) {
      setMode('palette');
      return;
    }
    setMode('palette');
    setQuery(initialQuery);
    setSelectedIdx(0);
    selectionSourceRef.current = 'keyboard';
    lastPointerRef.current = null;
    setRecentEntries(loadCommandPaletteRecents());

    inputRef.current?.focus();
    const frameId =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(() => inputRef.current?.focus())
        : null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId);
      }
      window.clearTimeout(timer);
    };
  }, [open, initialQuery]);

  // Focus on sub-form inputs when mode changes
  useEffect(() => {
    if (!open) return;
    if (mode === 'new-expense') {
      setExpenseAmount('');
      setExpenseNote('');
      window.setTimeout(() => expenseAmountRef.current?.focus(), 40);
    } else if (mode === 'new-job') {
      setJobEmpresa('');
      setJobPuesto('');
      setJobTipo('convencional');
      setJobEstado('cv_enviado');
      setJobReclutador('');
      setJobLink('');
      window.setTimeout(() => jobEmpresaRef.current?.focus(), 40);
    } else {
      inputRef.current?.focus();
    }
  }, [open, mode]);

  // Reset selection index when query changes
  useEffect(() => {
    setSelectedIdx(0);
    selectionSourceRef.current = 'keyboard';
  }, [query]);

  // Scroll active item into view ONLY when navigating by keyboard
  useEffect(() => {
    if (selectionSourceRef.current !== 'keyboard') return;
    const el = itemRefs.current[selectedIdx];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  const hasActiveGymSession = useMemo(
    () =>
      Boolean(
        state.gym?.sessions?.some((session) => session.status === 'active') ||
          state.gym?.activeTimer
      ),
    [state.gym?.sessions, state.gym?.activeTimer]
  );

  // Core Quick Actions (shown in smart empty state and searchable)
  const quickActions: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [];

    if (isModuleEnabled(state, 'finanzas')) {
      list.push({
        id: 'action-expense',
        category: 'Acciones rápidas',
        categoryOrder: 1,
        title: 'Nuevo gasto',
        subtitle: 'Abrir + Capturar directo en modo gasto',
        iconName: 'wallet',
        badge: 'Finanzas',
        badgeTone: 'indigo',
        keywords: ['gasto', 'nuevo gasto', 'registrar gasto', 'dinero', 'plata', 'compra', 'finanzas', 'capturar'],
        onSelect: () => {
          recordCommandPaletteRecent({
            id: 'action-expense',
            kind: 'action',
            title: 'Nuevo gasto',
            subtitle: 'Abrir + Capturar directo en modo gasto',
            iconName: 'wallet',
            module: 'finanzas',
          });
          if (onOpenCapture) {
            onClose();
            onOpenCapture('gasto');
          } else {
            setMode('new-expense');
          }
        },
      });
    }

    list.push({
      id: 'action-task',
      category: 'Acciones rápidas',
      categoryOrder: 1,
      title: 'Nueva tarea',
      subtitle: 'Abrir + Capturar directo en modo tarea para hoy',
      iconName: 'task',
      badge: 'Hoy',
      badgeTone: 'green',
      shortcutHint: 'N',
      keywords: ['tarea', 'nueva tarea', 'pendiente', 'todo', 'checklist', 'capturar'],
      onSelect: () => {
        recordCommandPaletteRecent({
          id: 'action-task',
          kind: 'action',
          title: 'Nueva tarea',
          subtitle: 'Abrir + Capturar directo en modo tarea para hoy',
          iconName: 'task',
          module: 'dashboard',
        });
        onClose();
        if (onOpenCapture) onOpenCapture('tarea');
      },
    });

    if (isModuleEnabled(state, 'notas')) {
      list.push({
        id: 'action-note',
        category: 'Acciones rápidas',
        categoryOrder: 1,
        title: 'Nueva nota',
        subtitle: 'Abrir + Capturar directo en modo nota rápida',
        iconName: 'note',
        badge: 'Notas',
        badgeTone: 'gray',
        shortcutHint: 'Q',
        keywords: ['nota', 'nueva nota', 'apunte', 'postit', 'escribir', 'capturar'],
        onSelect: () => {
          recordCommandPaletteRecent({
            id: 'action-note',
            kind: 'action',
            title: 'Nueva nota',
            subtitle: 'Abrir + Capturar directo en modo nota rápida',
            iconName: 'note',
            module: 'notas',
          });
          onClose();
          if (onOpenCapture) onOpenCapture('nota');
        },
      });
    }

    if (isModuleEnabled(state, 'gimnasio')) {
      const gymTitle = hasActiveGymSession ? 'Ir a sesión activa' : 'Iniciar entrenamiento';
      const gymSubtitle = hasActiveGymSession
        ? 'Retomar tu entrenamiento en curso en Gimnasio'
        : 'Ir a Gimnasio para comenzar una nueva sesión';
      list.push({
        id: 'action-gym',
        category: 'Acciones rápidas',
        categoryOrder: 1,
        title: gymTitle,
        subtitle: gymSubtitle,
        iconName: 'dumbbell',
        badge: hasActiveGymSession ? 'En curso' : 'Gym',
        badgeTone: 'green',
        shortcutHint: 'G G',
        keywords: ['entrenar', 'entrenamiento', 'gym', 'gimnasio', 'sesion', 'rutina', 'pesas'],
        onSelect: () => {
          recordCommandPaletteRecent({
            id: 'action-gym',
            kind: 'action',
            title: gymTitle,
            subtitle: gymSubtitle,
            iconName: 'dumbbell',
            module: 'gimnasio',
            view: 'gimnasio',
          });
          onNavigate('gimnasio');
          onClose();
        },
      });
    }

    if (isModuleEnabled(state, 'ia')) {
      list.push({
        id: 'action-ai-context',
        category: 'Acciones rápidas',
        categoryOrder: 1,
        title: 'Armar contexto para IA',
        subtitle: 'Abrir IA para generar y copiar tu contexto personal',
        iconName: 'ai',
        badge: 'IA',
        badgeTone: 'indigo',
        keywords: ['ia', 'ai', 'contexto', 'prompt', 'copiloto', 'asistente', 'armar contexto'],
        onSelect: () => {
          recordCommandPaletteRecent({
            id: 'action-ai-context',
            kind: 'action',
            title: 'Armar contexto para IA',
            subtitle: 'Abrir IA para generar y copiar tu contexto personal',
            iconName: 'ai',
            module: 'ia',
            view: 'ia',
          });
          onNavigate('ia');
          onClose();
        },
      });
    }

    const privacyTitle = privacyMode ? 'Desactivar Modo Privacidad' : 'Activar Modo Privacidad';
    const privacySubtitle = privacyMode
      ? 'Volver a mostrar montos y saldos en pantalla'
      : 'Ocultar montos y saldos sensibles al instante';
    list.push({
      id: 'action-privacy',
      category: 'Acciones rápidas',
      categoryOrder: 1,
      title: privacyTitle,
      subtitle: privacySubtitle,
      iconName: 'shield',
      badge: privacyMode ? 'Activo' : undefined,
      badgeTone: privacyMode ? 'indigo' : 'gray',
      shortcutHint: 'Shift + P',
      keywords: ['privacidad', 'modo privacidad', 'ocultar', 'montos', 'saldos', 'stream guard'],
      onSelect: () => {
        recordCommandPaletteRecent({
          id: 'action-privacy',
          kind: 'action',
          title: privacyTitle,
          subtitle: privacySubtitle,
          iconName: 'shield',
        });
        if (onTogglePrivacy) onTogglePrivacy();
        playSound('click');
        showToast(privacyMode ? 'Modo Privacidad desactivado' : 'Modo Privacidad activado');
      },
    });

    const themeTitle = darkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro';
    const themeSubtitle = 'Alternar el tema visual de Celestian al instante';
    list.push({
      id: 'action-theme',
      category: 'Acciones rápidas',
      categoryOrder: 1,
      title: themeTitle,
      subtitle: themeSubtitle,
      iconName: darkMode ? 'sun' : 'moon',
      badge: darkMode ? 'Oscuro' : 'Claro',
      badgeTone: 'gray',
      keywords: ['tema', 'modo oscuro', 'modo claro', 'dark', 'light', 'apariencia', 'colores'],
      onSelect: () => {
        recordCommandPaletteRecent({
          id: 'action-theme',
          kind: 'action',
          title: themeTitle,
          subtitle: themeSubtitle,
          iconName: darkMode ? 'sun' : 'moon',
        });
        if (onToggleTheme) onToggleTheme();
        playSound('click');
        showToast(darkMode ? 'Modo Claro activado' : 'Modo Oscuro activado');
      },
    });

    if (cloudConnected) {
      list.push({
        id: 'action-sync',
        category: 'Acciones rápidas',
        categoryOrder: 1,
        title: 'Sincronizar ahora',
        subtitle: 'Actualizar y respaldar tus datos en la nube',
        iconName: 'cloud',
        badge: 'Nube',
        badgeTone: 'indigo',
        keywords: ['sincronizar', 'sync', 'nube', 'cloud', 'respaldo', 'google'],
        onSelect: () => {
          recordCommandPaletteRecent({
            id: 'action-sync',
            kind: 'action',
            title: 'Sincronizar ahora',
            subtitle: 'Actualizar y respaldar tus datos en la nube',
            iconName: 'cloud',
          });
          playSound('click');
          if (onForceSync) onForceSync();
          onClose();
        },
      });
    }

    return list;
  }, [
    state,
    hasActiveGymSession,
    privacyMode,
    darkMode,
    cloudConnected,
    onOpenCapture,
    onNavigate,
    onTogglePrivacy,
    onToggleTheme,
    onForceSync,
    onClose,
  ]);

  // Extra searchable actions (available on search without cluttering the empty state)
  const extraSearchActions: PaletteItem[] = useMemo(() => {
    const extras: PaletteItem[] = [];
    if (isModuleEnabled(state, 'trabajo')) {
      extras.push({
        id: 'action-job',
        category: 'Acciones rápidas',
        categoryOrder: 1,
        title: 'Nueva postulación',
        subtitle: 'Registrar una nueva postulación laboral en Trabajo',
        iconName: 'briefcase',
        badge: 'Trabajo',
        badgeTone: 'indigo',
        keywords: ['postulacion', 'trabajo', 'empleo', 'cv', 'entrevista', 'nuevo trabajo'],
        onSelect: () => setMode('new-job'),
      });
    }
    return extras;
  }, [state]);

  // Visible navigation modules (strictly respecting hiddenTabs)
  const viewItems: PaletteItem[] = useMemo(() => {
    return VIEW_METADATA.filter((v) => isModuleEnabled(state, v.view)).map((v) => ({
      id: `view-${v.view}`,
      category: 'Ir a módulo',
      categoryOrder: 2,
      title: v.label,
      subtitle: v.desc,
      iconName: v.icon,
      shortcutHint: v.shortcut,
      keywords: v.keywords,
      onSelect: () => {
        recordCommandPaletteRecent({
          id: `view-${v.view}`,
          kind: 'view',
          title: v.label,
          subtitle: v.desc,
          iconName: v.icon,
          module: v.view,
          view: v.view,
        });
        onNavigate(v.view);
        onClose();
      },
    }));
  }, [state, onNavigate, onClose]);

  // Recents hydrated against current state & visibility
  const recentItems: PaletteItem[] = useMemo(() => {
    const filtered = filterCommandPaletteRecents(recentEntries, state, { cloudConnected });
    if (filtered.length === 0) return [];

    const actionsById = new Map(quickActions.map((item) => [item.id, item]));
    const viewsById = new Map(viewItems.map((item) => [item.id, item]));
    const resolved: PaletteItem[] = [];

    for (const entry of filtered) {
      if (entry.kind === 'action') {
        const live = actionsById.get(entry.id);
        if (!live) continue;
        resolved.push({
          ...live,
          id: `recent:${entry.id}`,
          category: 'Recientes',
          categoryOrder: 0,
        });
      } else if (entry.kind === 'view') {
        const live = viewsById.get(entry.id);
        if (!live) continue;
        resolved.push({
          ...live,
          id: `recent:${entry.id}`,
          category: 'Recientes',
          categoryOrder: 0,
        });
      } else if (entry.kind === 'result' && entry.view && isModuleEnabled(state, entry.view)) {
        const displayTitle = privacyMode
          ? maskFinancialText(entry.title, true)
          : entry.title;
        const displaySubtitle = sanitizeRecentSubtitle(
          entry.subtitle,
          entry.isSensitive,
          privacyMode,
          entry.view
        );
        resolved.push({
          id: `recent:${entry.id}`,
          category: 'Recientes',
          categoryOrder: 0,
          title: displayTitle,
          subtitle: displaySubtitle,
          iconName: entry.iconName,
          isSensitive: entry.isSensitive,
          onSelect: () => {
            recordCommandPaletteRecent({
              id: entry.id,
              kind: 'result',
              title: entry.title,
              subtitle: entry.subtitle,
              iconName: entry.iconName,
              module: entry.module,
              view: entry.view,
              focusId: entry.focusId,
              isSensitive: entry.isSensitive,
            });
            onNavigate(entry.view!, entry.focusId);
            onClose();
          },
        });
      }
    }

    return resolved;
  }, [recentEntries, state, cloudConnected, quickActions, viewItems, privacyMode, onNavigate, onClose]);

  // Search results from real user content
  const contentResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    return searchLifeOS(state, query);
  }, [state, query]);

  // Live natural-language capture interpretation inside Command Palette
  const livePaletteDrafts = useMemo<CaptureDraft[]>(() => {
    const trimmed = query.trim();
    if (!onUpdateState || trimmed.length < 3) return [];
    return parseCaptureDrafts(trimmed, state);
  }, [onUpdateState, query, state]);

  const buildDirectCapturePaletteItem = useCallback(
    (draft: CaptureDraft): PaletteItem | null => {
      if (!onUpdateState) return null;
      const validation = canConfirmDraft(state, draft);
      if (!validation.valid) return null;

      let title = 'Registrar captura directa';
      let subtitle = draft.rawText;
      let iconName: AppIconName = 'squarePlus';
      let badge = 'Directo';
      let badgeTone: PaletteItem['badgeTone'] = 'indigo';
      let isSensitive = false;

      if (draft.kind === 'finance' && draft.amount !== undefined) {
        const formatted = privacyMode ? '••••' : formatMoney(draft.amount, draft.currency || 'UYU');
        const kindLabel = draft.type === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto';
        const cat = draft.categoryMatched || draft.category || 'Otros';
        const acc = draft.accountName ? maskFinancialText(draft.accountName, privacyMode) : '';
        title = `${kindLabel}: ${formatted} en ${cat}`;
        subtitle = `${acc ? `Cuenta: ${acc} · ` : ''}${draft.dateLabel || 'Hoy'}`;
        iconName = 'wallet';
        badge = draft.type === 'ingreso' ? 'Ingreso' : 'Gasto';
        badgeTone = draft.type === 'ingreso' ? 'green' : 'red';
        isSensitive = true;
      } else if (draft.kind === 'study') {
        title = `Registrar estudio: ${draft.minutes} min en ${draft.subjectName || 'General'}`;
        subtitle = draft.dateLabel || 'Hoy';
        iconName = 'book';
        badge = 'Estudio';
        badgeTone = 'indigo';
      } else if (draft.kind === 'note') {
        title = `Guardar nota: ${draft.title || draft.text.slice(0, 48)}`;
        subtitle = draft.tags?.length ? `Etiquetas: #${draft.tags.join(' #')}` : 'Notas';
        iconName = 'note';
        badge = 'Nota';
        badgeTone = 'gray';
      } else if (draft.kind === 'idea') {
        title = `Guardar idea: ${draft.text.slice(0, 52)}`;
        subtitle = 'Módulo IA';
        iconName = 'lightbulb';
        badge = 'Idea';
        badgeTone = 'indigo';
      } else if (draft.kind === 'agenda') {
        title = `Agendar: ${draft.activity}`;
        subtitle = `${draft.dateLabel || 'Hoy'}${draft.time ? ` · ${draft.time}` : ''}`;
        iconName = 'calendar';
        badge = 'Agenda';
        badgeTone = 'green';
      } else if (draft.kind === 'task') {
        title = `Crear tarea para hoy: ${draft.text}`;
        subtitle = `Prioridad ${draft.priority}${draft.dueDateLabel ? ` · ${draft.dueDateLabel}` : ''}`;
        iconName = 'task';
        badge = 'Tarea';
        badgeTone = 'indigo';
      } else {
        return null;
      }

      return {
        id: `direct-capture-${draft.id}`,
        category: 'Captura directa',
        categoryOrder: 0,
        title,
        subtitle,
        iconName,
        badge,
        badgeTone,
        shortcutHint: 'Enter',
        isSensitive,
        onSelect: () => {
          try {
            let feedback: { message: string; sound: 'success' | 'coins' | 'click' } = {
              message: 'Elemento registrado.',
              sound: 'success',
            };
            const saved = onUpdateState((s) => {
              feedback = confirmCaptureDraft(s, draft);
            });
            if (saved === false) {
              showToast('No se pudo guardar en este dispositivo.', 'error');
              return;
            }
            playSound(feedback.sound);
            showToast(feedback.message, 'success');
            onClose();
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Error al registrar captura.', 'error');
          }
        },
      };
    },
    [onUpdateState, state, privacyMode, onClose]
  );

  // Build ordered groups & flat visible items (strictly synchronized indices)
  const { groupedItems, visibleItems } = useMemo(() => {
    const trimmed = query.trim();

    let rawItems: PaletteItem[] = [];

    if (trimmed.length > 0) {
      // Unified search: Actions + Modules + Real content + Direct capture
      const matchedActions: PaletteItem[] = [...quickActions, ...extraSearchActions]
        .map((action) => ({
          ...action,
          score: scoreSearchMatch(trimmed, action.title, action.keywords || [], [action.subtitle]),
        }))
        .filter((action) => (action.score ?? 0) > 0)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      const matchedViews: PaletteItem[] = viewItems
        .map((view) => ({
          ...view,
          score: scoreSearchMatch(trimmed, view.title, view.keywords || [], [view.subtitle]),
        }))
        .filter((view) => (view.score ?? 0) > 0)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      const mappedContent: PaletteItem[] = contentResults.map((item: SearchResult) => {
        let cat = 'Otros';
        let order = 11;
        if (item.category === 'tasks') {
          cat = 'Tareas';
          order = 3;
        } else if (item.category === 'notes') {
          cat = 'Notas';
          order = 4;
        } else if (item.category === 'finance') {
          cat = 'Finanzas';
          order = 5;
        } else if (item.category === 'gym') {
          cat = 'Gimnasio';
          order = 6;
        } else if (item.category === 'study') {
          cat = 'Estudios';
          order = 7;
        } else if (item.category === 'jobs') {
          cat = 'Trabajo';
          order = 8;
        } else if (item.category === 'resale') {
          cat = 'Mi negocio';
          order = 9;
        } else if (item.category === 'calendar') {
          cat = 'Agenda y Calendario';
          order = 10;
        }

        const safeSubtitleForRecent = item.isSensitive
          ? VIEW_METADATA.find((v) => v.view === item.view)?.label || cat
          : item.subtitle;

        return {
          id: item.id,
          category: cat,
          categoryOrder: order,
          title: item.title,
          subtitle: item.subtitle,
          iconName: item.iconName || 'search',
          badge: item.badge,
          badgeTone: item.badge?.startsWith('+')
            ? 'green'
            : item.badge?.startsWith('-')
            ? 'red'
            : 'gray',
          isSensitive: item.isSensitive,
          score: item.score,
          onSelect: () => {
            recordCommandPaletteRecent({
              id: `result:${item.id}`,
              kind: 'result',
              title: item.title,
              subtitle: safeSubtitleForRecent,
              iconName: item.iconName || 'search',
              module: item.view,
              view: item.view,
              focusId: item.focusId,
              isSensitive: item.isSensitive,
            });
            onNavigate(item.view, item.focusId);
            onClose();
          },
        };
      });

      const dedupedById = new Map<string, PaletteItem>();
      for (const candidate of [...matchedActions, ...matchedViews, ...mappedContent]) {
        if (!dedupedById.has(candidate.id)) {
          dedupedById.set(candidate.id, candidate);
        }
      }
      rawItems = Array.from(dedupedById.values());

      if (livePaletteDrafts.length === 1) {
        const candidateDraft = livePaletteDrafts[0];
        const isStructuredIntent =
          candidateDraft.kind === 'finance' ||
          candidateDraft.kind === 'study' ||
          candidateDraft.kind === 'note' ||
          candidateDraft.kind === 'idea' ||
          candidateDraft.kind === 'agenda';
        if (isStructuredIntent || rawItems.length === 0) {
          const directItem = buildDirectCapturePaletteItem(candidateDraft);
          if (directItem) {
            rawItems = [directItem, ...rawItems];
          }
        }
      }
    } else {
      // Smart initial state: Recientes (when non-empty) + Acciones rápidas + Ir a módulo
      rawItems = [...recentItems, ...quickActions, ...viewItems];
    }

    const groupMap = new Map<
      string,
      { category: string; order: number; items: PaletteItem[] }
    >();

    for (const item of rawItems) {
      let group = groupMap.get(item.category);
      if (!group) {
        group = { category: item.category, order: item.categoryOrder, items: [] };
        groupMap.set(item.category, group);
      }
      group.items.push(item);
    }

    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);

    const flatVisible: PaletteItem[] = [];
    const indexedGroups = sortedGroups.map((group) => ({
      category: group.category,
      order: group.order,
      items: group.items.map((item) => {
        const globalIdx = flatVisible.length;
        flatVisible.push(item);
        return { item, globalIdx };
      }),
    }));

    return { groupedItems: indexedGroups, visibleItems: flatVisible };
  }, [
    query,
    recentItems,
    quickActions,
    extraSearchActions,
    viewItems,
    contentResults,
    livePaletteDrafts,
    buildDirectCapturePaletteItem,
    onNavigate,
    onClose,
  ]);

  // Keep selectedIdx clamped when list shrinks
  useEffect(() => {
    if (visibleItems.length === 0) {
      if (selectedIdx !== 0) setSelectedIdx(0);
    } else if (selectedIdx >= visibleItems.length) {
      setSelectedIdx(visibleItems.length - 1);
    }
  }, [visibleItems.length, selectedIdx]);

  // 100% Keyboard navigation (Linear / Raycast standard)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode !== 'palette') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMode('palette');
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        selectionSourceRef.current = 'keyboard';
        setSelectedIdx((prev) => (prev + 1) % visibleItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        selectionSourceRef.current = 'keyboard';
        setSelectedIdx((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
      }
    } else if (e.key === 'Home' && visibleItems.length > 0) {
      e.preventDefault();
      selectionSourceRef.current = 'keyboard';
      setSelectedIdx(0);
    } else if (e.key === 'End' && visibleItems.length > 0) {
      e.preventDefault();
      selectionSourceRef.current = 'keyboard';
      setSelectedIdx(visibleItems.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = visibleItems[selectedIdx];
      if (current) {
        current.onSelect();
      } else if (query.trim().length > 0 && onOpenCapture) {
        const seed = query.trim();
        onClose();
        onOpenCapture('universal', seed);
      }
    }
  };

  // Submit micro-form: Expense
  const handleSaveExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const amountNum = parseFloat(expenseAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showToast('Ingresá un monto válido mayor a 0', 'error');
      expenseAmountRef.current?.focus();
      return;
    }

    const accountId = expenseAccount || state.finance.accounts[0]?.id;
    if (!accountId) {
      showToast('No tenés cuentas configuradas en Finanzas', 'error');
      return;
    }

    setExpenseSaving(true);
    try {
      if (!onUpdateState) {
        throw new Error('No se puede guardar desde esta búsqueda. Abrí Finanzas para registrar el gasto.');
      }
      const saved = onUpdateState((draft) => {
        addTransaction(draft, {
          id: (expenseOperationId.current ??= globalThis.crypto?.randomUUID?.() || uid()),
          type: 'gasto',
          amount: amountNum,
          category: expenseCategory || 'Varios',
          accountId,
          note: expenseNote.trim() || undefined,
          fixed: 'variable',
          origin: 'manual',
          date: todayISO(),
        });
      });
      if (saved === false) return;

      const accObj = state.finance.accounts.find((a) => a.id === accountId);
      const accName = maskFinancialText(accObj?.name || 'Cuenta', privacyMode);
      const accCur = accObj?.currency || 'UYU';
      const toastAmount = privacyMode ? '••••' : formatMoney(amountNum, accCur);
      showToast(`Gasto de ${toastAmount} registrado en ${accName}`);
      playSound('success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar gasto', 'error');
    } finally {
      setExpenseSaving(false);
    }
  };

  // Submit micro-form: Job
  const handleSaveJob = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!jobEmpresa.trim()) {
      showToast('Ingresá el nombre de la empresa', 'error');
      jobEmpresaRef.current?.focus();
      return;
    }
    if (!jobPuesto.trim()) {
      showToast('Ingresá el puesto o rol', 'error');
      return;
    }
    if (!isJobStatusForType(jobTipo, jobEstado)) {
      showToast('Elegí una etapa compatible con el tipo de proceso', 'error');
      return;
    }

    setJobSaving(true);
    try {
      if (!onUpdateState) {
        throw new Error('No se puede guardar desde esta búsqueda. Abrí Trabajo para registrar la postulación.');
      }
      const saved = onUpdateState((draft) => {
        draft.jobs.applications.unshift({
          id: uid(),
          tipo: jobTipo,
          empresa: jobEmpresa.trim(),
          puesto: jobPuesto.trim(),
          estado: jobEstado,
          fecha: todayISO(),
          reclutador: jobReclutador.trim() || undefined,
          link: jobLink.trim() || undefined,
        });
      });
      if (saved === false) return;

      showToast(`Postulación a "${jobEmpresa.trim()}" guardada en el pipeline`);
      playSound('success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar postulación', 'error');
    } finally {
      setJobSaving(false);
    }
  };

  if (!open) return null;

  const activeOptionId =
    visibleItems[selectedIdx] ? `palette-opt-${selectedIdx}` : undefined;

  return (
    <div
      className="celestian-modal-backdrop fixed inset-0 z-[100] flex items-start justify-center bg-black/55 p-3 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-[10vh] backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Centro de mando de Celestian"
        className="celestian-modal-panel flex w-full max-w-2xl max-h-[90dvh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* VIEW 1: COMMAND PALETTE */}
        {mode === 'palette' && (
          <>
            {/* Search Input Row */}
            <div className="command-search-row flex shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]/60 px-4 py-3 transition-colors">
              <AppIcon
                name="search"
                className="h-5 w-5 shrink-0 text-[#4F46E5] dark:text-[#818CF8]"
              />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={true}
                aria-controls="command-palette-listbox"
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                aria-label="Buscar acciones, módulos o contenido"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar acciones, módulos, tareas, notas o finanzas…"
                className="celestian-clean-field-bare min-w-0 flex-1 bg-transparent text-sm sm:text-base font-medium text-[var(--text)] placeholder:font-normal placeholder:text-[var(--text-faint)] outline-none"
              />
              {privacyMode && (
                <span
                  className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-md border border-[#4F46E5]/30 bg-[#4F46E5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#4F46E5] dark:border-[#818CF8]/35 dark:bg-indigo-500/15 dark:text-[#818CF8]"
                  title="Modo Privacidad activo: cifras ocultas"
                >
                  <AppIcon name="shield" className="h-3 w-3" />
                  <span>Privacidad</span>
                </span>
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="inline-flex h-11 w-11 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                  aria-label="Limpiar búsqueda"
                >
                  <AppIcon name="x" className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition sm:hidden cursor-pointer"
                aria-label="Cerrar búsqueda"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
              <kbd className="hidden sm:inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--text-faint)]">
                ESC
              </kbd>
            </div>

            {livePaletteDrafts.length === 1 &&
              livePaletteDrafts[0].kind !== 'task' &&
              livePaletteDrafts[0].kind !== 'inbox' && (
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)]/50 px-3.5 py-2">
                  <LiveCapturePreview drafts={livePaletteDrafts} state={state} enterHint="Enter" />
                </div>
              )}

            {/* List Results */}
            <div
              id="command-palette-listbox"
              role="listbox"
              aria-label="Resultados y acciones"
              className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-2"
            >
              {visibleItems.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-faint)]">
                    <AppIcon name="search" className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    Sin coincidencias para “{query.trim()}”
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-faint)]">
                    Probá con otra palabra clave o registralo directo en captura rápida.
                  </p>
                  {onOpenCapture && query.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const seed = query.trim();
                        onClose();
                        onOpenCapture('universal', seed);
                      }}
                      className="mt-4 inline-flex min-h-11 sm:min-h-9 items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#4338CA] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                    >
                      <AppIcon name="squarePlus" className="h-4 w-4" />
                      <span>Crear “{query.trim().slice(0, 40)}” en + Capturar</span>
                    </button>
                  )}
                </div>
              ) : (
                groupedItems.map((group) => (
                  <div
                    key={group.category}
                    role="group"
                    aria-label={group.category}
                    data-palette-group={group.category}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                      <span>{group.category}</span>
                      <span className="tabular-nums opacity-70">{group.items.length}</span>
                    </div>

                    <div className="space-y-0.5">
                      {group.items.map(({ item, globalIdx }) => {
                        const isSelected = selectedIdx === globalIdx;
                        return (
                          <button
                            key={item.id}
                            id={`palette-opt-${globalIdx}`}
                            role="option"
                            aria-selected={isSelected}
                            data-palette-item-id={item.id}
                            data-palette-selected={isSelected ? 'true' : undefined}
                            ref={(el) => {
                              itemRefs.current[globalIdx] = el;
                            }}
                            type="button"
                            onMouseMove={(e) => {
                              const prev = lastPointerRef.current;
                              if (prev && prev.x === e.clientX && prev.y === e.clientY) return;
                              lastPointerRef.current = { x: e.clientX, y: e.clientY };
                              selectionSourceRef.current = 'pointer';
                              if (selectedIdx !== globalIdx) {
                                setSelectedIdx(globalIdx);
                              }
                            }}
                            onClick={item.onSelect}
                            className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 cursor-pointer ${
                              isSelected
                                ? 'bg-[#4F46E5]/[0.09] text-[var(--text)] ring-1 ring-[#4F46E5]/30 dark:bg-[#818CF8]/[0.14] dark:ring-[#818CF8]/35'
                                : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)]/60'
                            }`}
                          >
                            {isSelected && (
                              <span
                                aria-hidden="true"
                                className="absolute left-1 top-2 bottom-2 w-0.5 rounded-full bg-[#4F46E5] dark:bg-[#818CF8]"
                              />
                            )}
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                                isSelected
                                  ? 'border-[#4F46E5]/35 bg-[#4F46E5]/10 text-[#4F46E5] dark:border-[#818CF8]/40 dark:bg-indigo-500/20 dark:text-[#818CF8]'
                                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-faint)]'
                              }`}
                            >
                              <AppIcon name={item.iconName} className="h-4 w-4" />
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs sm:text-sm font-semibold text-[var(--text)]">
                                  {renderHighlightedText(
                                    item.title,
                                    query,
                                    Boolean(item.isSensitive && privacyMode) ||
                                      item.category === 'Captura directa'
                                  )}
                                </span>
                                {item.badge && (
                                  <span
                                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                                      item.isSensitive && privacyMode ? 'privacy-sensitive ' : ''
                                    }${
                                      item.badgeTone === 'green'
                                        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                                        : item.badgeTone === 'red'
                                        ? 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
                                        : item.badgeTone === 'indigo'
                                        ? 'bg-[#4F46E5]/12 text-[#4F46E5] dark:bg-indigo-500/20 dark:text-[#818CF8]'
                                        : 'border border-[var(--border)] bg-[var(--bg)] text-[var(--text-faint)]'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p
                                className={`mt-0.5 truncate text-[11px] text-[var(--text-faint)] ${
                                  item.isSensitive && privacyMode ? 'privacy-sensitive' : ''
                                }`}
                              >
                                {item.subtitle}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5 text-right">
                              {item.shortcutHint && (
                                <span className="hidden sm:inline-block rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-faint)]">
                                  {item.shortcutHint}
                                </span>
                              )}
                              {isSelected && (
                                <kbd
                                  aria-hidden="true"
                                  className="hidden sm:inline-flex h-5 items-center rounded border border-[#4F46E5]/30 bg-[#4F46E5]/10 px-1.5 text-[#4F46E5] dark:border-[#818CF8]/35 dark:bg-indigo-500/20 dark:text-[#818CF8]"
                                >
                                  <CornerDownLeft className="h-3 w-3" />
                                </kbd>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Discrete desktop-only keyboard legend footer */}
            <div className="hidden sm:flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[11px] text-[var(--text-faint)]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-soft)]">Celestian</span>
                <span>·</span>
                <span className="tabular-nums">
                  {visibleItems.length} {visibleItems.length === 1 ? 'opción' : 'opciones'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1 text-[var(--text-soft)]">
                    <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  </kbd>
                  <span>Navegar</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1 text-[var(--text-soft)]">
                    <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                  </kbd>
                  <span>Ejecutar</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 font-mono text-[10px] font-semibold text-[var(--text-soft)]">
                    Esc
                  </kbd>
                  <span>Cerrar</span>
                </span>
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: MICRO-FORM "REGISTRAR GASTO" */}
        {mode === 'new-expense' && (
          <form onSubmit={handleSaveExpense} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)]/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="flex h-11 w-11 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                  title="Volver (Esc)"
                  aria-label="Volver"
                >
                  <AppIcon name="chevronLeft" className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-2">
                  <AppIcon name="wallet" className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span className="text-sm font-bold text-[var(--text)]">Registrar Gasto Rápido</span>
                </div>
              </div>
              <span className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Acción rápida
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Monto a Registrar
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold tabular-nums text-[var(--text-faint)]">
                    {state.finance.accounts.find((a) => a.id === expenseAccount)?.currency === 'USD' ? 'US$' : '$U'}
                  </span>
                  <input
                    ref={expenseAmountRef}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-11 pr-4 text-xl font-bold tabular-nums text-[var(--text)]"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[500, 1000, 2000, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExpenseAmount(preset.toString())}
                      className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-soft)] hover:border-[var(--border-hover)] hover:text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                    >
                      +${preset.toLocaleString('es-AR')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Cuenta de Origen
                </label>
                {state.finance.accounts.length === 0 ? (
                  <p className="text-xs text-rose-500">No hay cuentas activas. Crea una en Finanzas.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {state.finance.accounts.map((acc) => {
                      const isSelected = expenseAccount === acc.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setExpenseAccount(acc.id)}
                          className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 cursor-pointer ${
                            isSelected
                              ? 'border-[#4F46E5] bg-[#4F46E5]/12 ring-1 ring-[#4F46E5]/30 dark:border-[#818CF8] dark:bg-indigo-500/20'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--surface-muted)]'
                          }`}
                        >
                          <span className="w-full truncate text-xs font-bold text-[var(--text)]">
                            <PrivateFinancialText>{acc.name}</PrivateFinancialText>
                          </span>
                          <span className="mt-0.5 text-[11px] tabular-nums text-[var(--text-soft)]">
                            <PrivacyAmount>{formatMoney(acc.balance, acc.currency)}</PrivacyAmount>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Categoría
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {activeFinanceCategories.map((cat) => {
                    const isSelected = expenseCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setExpenseCategory(cat.id)}
                        className={`min-h-9 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 cursor-pointer ${
                          isSelected
                            ? 'bg-[#4F46E5] text-white shadow-xs'
                            : 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Nota / Detalle (Opcional)
                </label>
                <input
                  type="text"
                  value={expenseNote}
                  onChange={(e) => setExpenseNote(e.target.value)}
                  placeholder="Ej: Café con medialunas, Farmacia…"
                  className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm text-[var(--text)]"
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-3">
              <button
                type="button"
                onClick={() => {
                  onNavigate('finanzas', 'qa-focus-tx', 'gasto');
                  onClose();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-[#818CF8] cursor-pointer"
              >
                <span>Abrir formulario completo</span>
                <AppIcon name="externalLink" className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="min-h-11 sm:min-h-0 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                >
                  Cancelar (Esc)
                </button>
                <button
                  type="submit"
                  disabled={expenseSaving || !expenseAmount}
                  className="flex min-h-11 sm:min-h-0 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#4338CA] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-all cursor-pointer"
                >
                  <span>Guardar Gasto</span>
                  <CornerDownLeft className="h-3 w-3 opacity-85" aria-hidden="true" />
                </button>
              </div>
            </div>
          </form>
        )}

        {/* VIEW 3: MICRO-FORM "NUEVA POSTULACIÓN" */}
        {mode === 'new-job' && (
          <form onSubmit={handleSaveJob} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)]/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="flex h-11 w-11 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                  title="Volver (Esc)"
                  aria-label="Volver"
                >
                  <AppIcon name="chevronLeft" className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-2">
                  <AppIcon name="briefcase" className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8]" />
                  <span className="text-sm font-bold text-[var(--text)]">Nueva postulación</span>
                </div>
              </div>
              <span className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Trabajo
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Tipo de proceso
                </label>
                <select
                  value={jobTipo}
                  onChange={(e) => setJobTipo(e.target.value as JobApplicationType)}
                  className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm text-[var(--text)]"
                >
                  <option value="convencional">Empleo convencional</option>
                  <option value="concurso">Concurso / llamado público</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                    {jobTipo === 'concurso' ? 'Organismo *' : 'Empresa *'}
                  </label>
                  <input
                    ref={jobEmpresaRef}
                    type="text"
                    value={jobEmpresa}
                    onChange={(e) => setJobEmpresa(e.target.value)}
                    placeholder={
                      jobTipo === 'concurso'
                        ? 'Ej.: Ministerio de Salud Pública'
                        : 'Ej.: MercadoLibre, Globant, Startup…'
                    }
                    required
                    className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                    {jobTipo === 'concurso' ? 'Cargo *' : 'Puesto / Rol *'}
                  </label>
                  <input
                    type="text"
                    value={jobPuesto}
                    onChange={(e) => setJobPuesto(e.target.value)}
                    placeholder={
                      jobTipo === 'concurso'
                        ? 'Ej.: Administrativo III'
                        : 'Ej: Fullstack Developer, Product Designer…'
                    }
                    required
                    className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  {jobTipo === 'concurso' ? 'Etapa del llamado' : 'Etapa laboral'}
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {JOB_STAGES[jobTipo].map((st) => {
                    const isSelected = jobEstado === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setJobEstado(st.id)}
                        aria-pressed={isSelected}
                        className={`min-h-11 sm:min-h-0 rounded-xl border px-3 py-2 text-center text-xs font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 cursor-pointer ${
                          isSelected
                            ? 'border-[#4F46E5] bg-[#4F46E5]/12 text-[#4F46E5] ring-1 ring-[#4F46E5]/30 dark:border-[#818CF8] dark:bg-indigo-500/20 dark:text-[#818CF8]'
                            : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)]'
                        }`}
                      >
                        {getJobStageLabel(jobTipo, st.id)}
                      </button>
                    );
                  })}
                </div>
                {!isJobStatusForType(jobTipo, jobEstado) && (
                  <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                    Elegí una etapa de este tipo de proceso. La selección anterior no se cambiará automáticamente.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                    Reclutador / Contacto (Opcional)
                  </label>
                  <input
                    type="text"
                    value={jobReclutador}
                    onChange={(e) => setJobReclutador(e.target.value)}
                    placeholder="Ej: Sofia (LinkedIn)"
                    className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm text-[var(--text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                    Enlace a la publicación (Opcional)
                  </label>
                  <input
                    type="url"
                    value={jobLink}
                    onChange={(e) => setJobLink(e.target.value)}
                    placeholder={jobTipo === 'concurso' ? 'https://…' : 'https://linkedin.com/jobs/...'}
                    className="celestian-clean-field w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm text-[var(--text)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-3">
              <button
                type="button"
                onClick={() => {
                  onNavigate('trabajo', 'qa-focus-trabajo');
                  onClose();
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-[#818CF8] cursor-pointer"
              >
                <span>Abrir pipeline completo en Trabajo</span>
                <AppIcon name="externalLink" className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="min-h-11 sm:min-h-0 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors cursor-pointer"
                >
                  Cancelar (Esc)
                </button>
                <button
                  type="submit"
                  disabled={
                    jobSaving ||
                    !jobEmpresa.trim() ||
                    !jobPuesto.trim() ||
                    !isJobStatusForType(jobTipo, jobEstado)
                  }
                  className="flex min-h-11 sm:min-h-0 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#4338CA] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-all cursor-pointer"
                >
                  <span>Guardar Postulación</span>
                  <CornerDownLeft className="h-3 w-3 opacity-85" aria-hidden="true" />
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

function renderHighlightedText(text: string, rawQuery: string, skip: boolean): React.ReactNode {
  const needle = rawQuery.trim();
  if (skip || needle.length < 2) return text;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const idx = lowerText.indexOf(lowerNeedle);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + needle.length);
  const after = text.slice(idx + needle.length);
  return (
    <>
      {before}
      <mark className="bg-transparent font-extrabold text-[#4F46E5] underline decoration-[#4F46E5]/40 underline-offset-2 dark:text-[#818CF8]">
        {match}
      </mark>
      {after}
    </>
  );
}

export { GlobalSearchModal as CommandPalette };
