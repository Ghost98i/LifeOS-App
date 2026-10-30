import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { JobApplication, JobApplicationType, LifeOSState, ViewType } from '../types';
import { AppIcon, type AppIconName } from './AppIcon';
import { searchLifeOS, type SearchResult } from '../lib/search';
import { fmtMoney, todayISO, uid } from '../lib/storage';
import { PrivacyAmount } from './PrivacyAmount';
import { addTransaction } from '../lib/financeFlows';
import { showToast } from '../lib/toast';
import { playSound } from '../lib/audio';
import { getActiveCategories } from '../lib/financeCategories';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { getJobStageLabel, isJobStatusForType, JOB_STAGES } from '../lib/jobApplications';

export interface GlobalSearchModalProps {
  state: LifeOSState;
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onNavigate: (view: ViewType, focusId?: string, txType?: 'gasto' | 'ingreso') => void;
  onUpdateState?: (fn: (draft: LifeOSState) => void) => boolean | void;
  onOpenCapture?: () => void;
  onToggleTheme?: () => void;
  onTogglePrivacy?: () => void;
}

type PaletteMode = 'palette' | 'new-expense' | 'new-job';

interface PaletteItem {
  id: string;
  category: string;
  categoryOrder: number;
  title: string;
  subtitle: string;
  iconName?: AppIconName;
  iconChar?: string;
  badge?: string;
  badgeTone?: 'blue' | 'green' | 'red' | 'gray';
  shortcutHint?: string;
  isSensitive?: boolean;
  onSelect: () => void;
}

const VIEW_METADATA: { view: ViewType; label: string; desc: string; icon: AppIconName; keywords: string[]; shortcut?: string }[] = [
  { view: 'dashboard', label: 'Hoy / Dashboard', desc: 'Prioridades, checklist diario y resumen', icon: 'home', keywords: ['inicio', 'hoy', 'dashboard', 'habitos', 'rutina'], shortcut: 'G H' },
  { view: 'finanzas', label: 'Finanzas', desc: 'Gastos, ingresos, presupuestos y cuentas', icon: 'wallet', keywords: ['finanzas', 'gastos', 'plata', 'dinero', 'cuentas', 'tarjetas', 'nuevo gasto'], shortcut: 'G F' },
  { view: 'gimnasio', label: 'Gimnasio', desc: 'Rutinas, PRs, temporizador y pesaje', icon: 'dumbbell', keywords: ['gym', 'gimnasio', 'entrenar', 'pesas', 'musculos', 'peso', 'entrenamiento'], shortcut: 'G G' },
  { view: 'trabajo', label: 'Trabajo & Empleo', desc: 'Pipeline Kanban de postulaciones laborales', icon: 'briefcase', keywords: ['trabajo', 'empleo', 'cv', 'postulaciones', 'entrevistas'], shortcut: 'G T' },
  { view: 'agenda', label: 'Agenda Semanal', desc: 'Bloques horarios y rutinas periódicas', icon: 'calendar', keywords: ['agenda', 'horario', 'semana', 'bloques'], shortcut: 'G A' },
  { view: 'calendario', label: 'Calendario', desc: 'Eventos, hitos y fechas clave del mes', icon: 'calendarDays', keywords: ['calendario', 'eventos', 'mes', 'fechas'] },
  { view: 'estudios', label: 'Estudios', desc: 'Materias, exámenes, pomodoro y horas', icon: 'graduation', keywords: ['estudio', 'facultad', 'materias', 'examenes', 'pomodoro'] },
  { view: 'reventa', label: 'Mi negocio', desc: 'Compraventa, inventario y ganancias', icon: 'store', keywords: ['reventa', 'ventas', 'inventario', 'productos', 'negocio'] },
  { view: 'notas', label: 'Notas & Captura', desc: 'Post-its, listas de compras y enlaces', icon: 'note', keywords: ['notas', 'postits', 'compras', 'links', 'enlaces', 'nueva nota'], shortcut: 'G N' },
  { view: 'ia', label: 'IA & Proyectos', desc: 'Asistente personal, ideas y proyectos', icon: 'sparkles', keywords: ['ia', 'ai', 'ideas', 'proyectos', 'asistente'] },
  { view: 'config', label: 'Configuración', desc: 'Copias de seguridad, sincronización y ajustes', icon: 'settings', keywords: ['config', 'ajustes', 'backup', 'nube', 'perfil'] },
  { view: 'checkout', label: 'Cerrar Día (Checkout)', desc: 'Revisión nocturna y balance de la jornada', icon: 'moon', keywords: ['checkout', 'cerrar', 'noche', 'balance', 'dia'] },
];

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
}) => {
  const [mode, setMode] = useState<PaletteMode>('palette');
  const [query, setQuery] = useState(initialQuery);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'actions' | 'views' | 'notes' | 'finance' | 'calendar' | 'gym'>('all');

  const activeFinanceCategories = useMemo(
    () => getActiveCategories(state.finance?.categories),
    [state.finance?.categories]
  );

  // Micro-form state: Expense
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(
    () => getActiveCategories(state.finance?.categories)[0]?.id || 'Comida'
  );
  const [expenseAccount, setExpenseAccount] = useState(state.finance.accounts[0]?.id || '');
  const [expenseNote, setExpenseNote] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);

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

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  // Reset & focus on open
  useEffect(() => {
    if (!open) {
      setMode('palette');
      return;
    }
    setMode('palette');
    setQuery(initialQuery);
    setSelectedIdx(0);
    setCategoryFilter('all');
    setExpenseAccount((curr) => curr || state.finance.accounts[0]?.id || '');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, initialQuery, state.finance.accounts]);

  // Focus on sub-form inputs when mode changes
  useEffect(() => {
    if (mode === 'new-expense') {
      setExpenseAmount('');
      setExpenseNote('');
      setExpenseAccount((curr) => curr || state.finance.accounts[0]?.id || '');
      window.setTimeout(() => expenseAmountRef.current?.focus(), 50);
    } else if (mode === 'new-job') {
      setJobEmpresa('');
      setJobPuesto('');
      setJobTipo('convencional');
      setJobEstado('cv_enviado');
      setJobReclutador('');
      setJobLink('');
      window.setTimeout(() => jobEmpresaRef.current?.focus(), 50);
    } else {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode, state.finance.accounts]);

  // Reset selection index when query or category filter changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [query, categoryFilter]);

  // Scroll active item into view
  useEffect(() => {
    const el = itemRefs.current[selectedIdx];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  // Quick action items
  const quickActions: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [];
    list.push({
      id: 'action-task',
      category: 'Acciones Rápidas',
      categoryOrder: 1,
      title: 'Nueva Tarea',
      subtitle: 'Crear tarea en el día de hoy mediante captura rápida',
      iconName: 'check',
      badge: 'Hoy',
      badgeTone: 'green',
      shortcutHint: 'N',
      onSelect: () => {
        onClose();
        if (onOpenCapture) onOpenCapture();
      },
    });

    if (isModuleEnabled(state, 'finanzas')) {
      list.push({
        id: 'action-expense',
        category: 'Acciones Rápidas',
        categoryOrder: 1,
        title: 'Nuevo Gasto / Registrar Gasto',
        subtitle: 'Abre un micro-formulario para ingresar monto, categoría y cuenta',
        iconName: 'wallet',
        badge: 'Rápido',
        badgeTone: 'blue',
        shortcutHint: '↵ Micro-form',
        onSelect: () => setMode('new-expense'),
      });
    }

    if (isModuleEnabled(state, 'notas')) {
      list.push({
        id: 'action-note',
        category: 'Acciones Rápidas',
        categoryOrder: 1,
        title: 'Nueva Nota',
        subtitle: 'Crear apunte, post-it o idea al instante',
        iconName: 'note',
        badge: 'Nota',
        badgeTone: 'gray',
        shortcutHint: 'N',
        onSelect: () => {
          onClose();
          if (onOpenCapture) onOpenCapture();
        },
      });
    }

    if (isModuleEnabled(state, 'gimnasio')) {
      list.push({
        id: 'action-gym',
        category: 'Acciones Rápidas',
        categoryOrder: 1,
        title: 'Iniciar Entrenamiento',
        subtitle: 'Redirige directamente al módulo de Gimnasio para comenzar la sesión',
        iconName: 'dumbbell',
        badge: 'Gym',
        badgeTone: 'green',
        shortcutHint: 'G G',
        onSelect: () => {
          onNavigate('gimnasio');
          onClose();
        },
      });
    }

    if (isModuleEnabled(state, 'trabajo')) {
      list.push({
        id: 'action-job',
        category: 'Acciones Rápidas',
        categoryOrder: 1,
        title: 'Nueva Postulación',
        subtitle: 'Registrar nueva postulación de empleo en el pipeline',
        iconName: 'briefcase',
        badge: 'Trabajo',
        badgeTone: 'blue',
        shortcutHint: '↵ Micro-form',
        onSelect: () => setMode('new-job'),
      });
    }

    list.push({
      id: 'action-capture',
      category: 'Acciones Rápidas',
      categoryOrder: 1,
      title: 'Captura Rápida Universal',
      subtitle: 'Crear tarea, gasto, nota, idea o recordatorio',
      iconName: 'plus',
      shortcutHint: 'N',
      onSelect: () => {
        onClose();
        if (onOpenCapture) onOpenCapture();
      },
    });

    list.push({
      id: 'action-theme',
      category: 'Acciones Rápidas',
      categoryOrder: 1,
      title: state.settings.darkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro',
      subtitle: 'Alternar entre el tema visual claro y oscuro de Celestian',
      iconName: state.settings.darkMode ? 'sun' : 'moon',
      onSelect: () => {
        if (onToggleTheme) onToggleTheme();
        playSound('click');
        showToast(state.settings.darkMode ? 'Modo claro activado' : 'Modo oscuro activado');
      },
    });

    list.push({
      id: 'action-privacy',
      category: 'Acciones Rápidas',
      categoryOrder: 1,
      title: state.settings.privacyMode ? 'Desactivar Modo Privacidad' : 'Activar Modo Privacidad (Stream Guard)',
      subtitle: 'Ocultar saldos de dinero y montos sensibles en pantalla',
      iconName: 'shield',
      shortcutHint: 'Shift + P',
      onSelect: () => {
        if (onTogglePrivacy) onTogglePrivacy();
        playSound('click');
        showToast(state.settings.privacyMode ? 'Privacidad desactivada' : 'Modo privacidad activado');
      },
    });

    return list;
  }, [state, onNavigate, onClose, onOpenCapture, onToggleTheme, onTogglePrivacy]);

  // View navigation items
  const viewItems: PaletteItem[] = useMemo(() => {
    return VIEW_METADATA.filter((v) => isModuleEnabled(state, v.view)).map((v) => ({
      id: `view-${v.view}`,
      category: 'Cambiar Vista',
      categoryOrder: 2,
      title: v.label,
      subtitle: v.desc,
      iconName: v.icon,
      shortcutHint: v.shortcut,
      onSelect: () => {
        onNavigate(v.view);
        onClose();
      },
    }));
  }, [state, onNavigate, onClose]);

  // Search results from LifeOS state
  const contentResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    return searchLifeOS(state, query);
  }, [state, query]);

  // Combine and filter all items
  const visibleItems = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    // If search query is entered
    if (q.length >= 2) {
      const matchedActions = quickActions.filter(
        (a) => a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q)
      );

      const matchedViews = VIEW_METADATA.filter(
        (v) =>
          isModuleEnabled(state, v.view) &&
          (v.label.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q) || v.keywords.some((k) => k.includes(q)))
      ).map((v) => ({
        id: `view-${v.view}`,
        category: 'Cambiar Vista',
        categoryOrder: 2,
        title: v.label,
        subtitle: v.desc,
        iconName: v.icon,
        onSelect: () => {
          onNavigate(v.view);
          onClose();
        },
      }));

      const mappedContent: PaletteItem[] = contentResults.map((item: SearchResult) => {
        let cat = 'Otras Coincidencias';
        let order = 8;
        if (item.category === 'notes') { cat = 'Notas'; order = 3; }
        else if (item.category === 'finance') { cat = 'Transacciones & Finanzas'; order = 4; }
        else if (item.category === 'calendar') { cat = 'Eventos de Calendario & Agenda'; order = 5; }
        else if (item.category === 'gym') { cat = 'Ejercicios & Gimnasio'; order = 6; }
        else if (item.category === 'jobs') { cat = 'Trabajo & Postulaciones'; order = 7; }

        return {
          id: item.id,
          category: cat,
          categoryOrder: order,
          title: item.title,
          subtitle: item.subtitle,
          iconName: item.iconName,
          iconChar: item.icon,
          badge: item.badge,
          badgeTone: item.badge?.startsWith('+') ? 'green' : item.badge?.startsWith('-') ? 'red' : 'gray',
          isSensitive: item.isSensitive,
          onSelect: () => {
            onNavigate(item.view, item.focusId);
            onClose();
          },
        };
      });

      let all = [...matchedActions, ...matchedViews, ...mappedContent];

      if (categoryFilter === 'actions') all = all.filter((i) => i.category === 'Acciones Rápidas');
      else if (categoryFilter === 'views') all = all.filter((i) => i.category === 'Cambiar Vista');
      else if (categoryFilter === 'notes') all = all.filter((i) => i.category === 'Notas');
      else if (categoryFilter === 'finance') all = all.filter((i) => i.category === 'Transacciones & Finanzas');
      else if (categoryFilter === 'calendar') all = all.filter((i) => i.category.includes('Calendario'));
      else if (categoryFilter === 'gym') all = all.filter((i) => i.category.includes('Gimnasio'));

      return all;
    }

    // Default mode (empty query or 1 char): Show quick actions, views, and recent notes/events
    const recentNotes: PaletteItem[] = isModuleEnabled(state, 'notas')
      ? [...(state.notes?.postits || [])]
          .filter((n) => !n.archived)
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.date).getTime();
            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.date).getTime();
            return timeB - timeA;
          })
          .slice(0, 4)
          .map((n) => {
            const title = n.title?.trim();
            const firstLine = n.text.trim().split('\n')[0]?.trim() || '';
            const displayTitle = title || firstLine.slice(0, 60) || 'Nota sin título';
            const displaySub = title ? n.text.slice(0, 50) : `Nota · ${n.date}`;
            return {
              id: `recent-note-${n.id}`,
              category: 'Notas Recientes',
              categoryOrder: 3,
              title: displayTitle,
              subtitle: `${n.pinned ? '📌 ' : ''}${displaySub}`,
              iconName: 'note',
              badge: n.pinned ? 'Fijada' : undefined,
              badgeTone: n.pinned ? 'blue' : undefined,
              onSelect: () => {
                onNavigate('notas', `note-${n.id}`);
                onClose();
              },
            };
          })
      : [];

    const upcomingEvents: PaletteItem[] = isModuleEnabled(state, 'calendario')
      ? state.calendarEvents.slice(0, 3).map((e) => ({
          id: `recent-event-${e.id}`,
          category: 'Próximos Eventos',
          categoryOrder: 4,
          title: e.name,
          subtitle: `Evento (${e.type}) · ${e.date}`,
          iconName: 'calendarDays',
          onSelect: () => {
            onNavigate('calendario');
            onClose();
          },
        }))
      : [];

    let defaultItems = [...quickActions, ...viewItems, ...recentNotes, ...upcomingEvents];

    if (categoryFilter === 'actions') defaultItems = quickActions;
    else if (categoryFilter === 'views') defaultItems = viewItems;
    else if (categoryFilter === 'notes') defaultItems = recentNotes;
    else if (categoryFilter === 'calendar') defaultItems = upcomingEvents;

    return defaultItems;
  }, [query, quickActions, viewItems, contentResults, categoryFilter, state, onNavigate, onClose]);

  // Group visible items by category
  const groupedItems = useMemo(() => {
    const map = new Map<string, { category: string; order: number; items: { item: PaletteItem; globalIdx: number }[] }>();
    visibleItems.forEach((item, idx) => {
      if (!map.has(item.category)) {
        map.set(item.category, { category: item.category, order: item.categoryOrder, items: [] });
      }
      map.get(item.category)!.items.push({ item, globalIdx: idx });
    });
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [visibleItems]);

  // Keyboard navigation for main list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode !== 'palette') {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMode('palette');
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        setQuery('');
      } else {
        onClose();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        setSelectedIdx((prev) => (prev + 1) % visibleItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        setSelectedIdx((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = visibleItems[selectedIdx];
      if (current) {
        current.onSelect();
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
      if (!onUpdateState) throw new Error('No se puede guardar desde esta búsqueda. Abrí Finanzas para registrar el gasto.');
      {
        const saved = onUpdateState((draft) => {
          addTransaction(draft, {
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
      }
      const accName = state.finance.accounts.find((a) => a.id === accountId)?.name || 'Cuenta';
      const toastAmount = state.settings.privacyMode ? '$U ••••' : fmtMoney(amountNum);
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
      if (!onUpdateState) throw new Error('No se puede guardar desde esta búsqueda. Abrí Trabajo para registrar la postulación.');
      {
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
      }
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-3 pt-[6vh] sm:pt-[10vh] backdrop-blur-md transition-opacity duration-150 animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Comandos de Celestian"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl ring-1 ring-black/10 dark:ring-white/10 transition-all flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* VIEW 1: COMMAND PALETTE LIST */}
        {mode === 'palette' && (
          <>
            {/* Search Input Row */}
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 bg-[var(--bg-elevated)]/50">
              <AppIcon name="search" className="h-5 w-5 shrink-0 text-[var(--text-faint)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe un comando o busca notas, transacciones, ejercicios…"
                className="min-w-0 flex-1 bg-transparent text-sm sm:text-base font-medium text-[var(--text)] placeholder:font-normal placeholder:text-[var(--text-faint)] outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-md text-xs text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text-faint)] shadow-2xs">
                ESC
              </kbd>
            </div>

            {/* Quick Category Filter Pills (Subtle raycast style) */}
            <div className="flex items-center gap-1.5 px-3.5 py-2 border-b border-[var(--border)] bg-[var(--card)] overflow-x-auto no-scrollbar text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] mr-1 hidden sm:inline">
                Filtrar:
              </span>
              {[
                { key: 'all', label: 'Todos' },
                { key: 'actions', label: 'Acciones' },
                { key: 'views', label: 'Vistas' },
                { key: 'notes', label: 'Notas', view: 'notas' },
                { key: 'finance', label: 'Finanzas', view: 'finanzas' },
                { key: 'calendar', label: 'Calendario', view: 'calendario' },
                { key: 'gym', label: 'Gimnasio', view: 'gimnasio' },
              ]
                .filter((f) => !('view' in f) || isModuleEnabled(state, f.view as ViewType))
                .map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setCategoryFilter(f.key as any)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    categoryFilter === f.key
                      ? 'bg-[var(--text)] text-[var(--bg)] shadow-xs'
                      : 'text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List Results */}
            <div className="overflow-y-auto p-2 space-y-3 flex-1 overscroll-contain">
              {visibleItems.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--text-faint)] mb-2.5">
                    <AppIcon name="search" className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--text)]">No se encontraron resultados</p>
                  <p className="text-xs text-[var(--text-faint)] mt-1 max-w-sm mx-auto">
                    No hay elementos que coincidan con “{query}”. Prueba con otra palabra clave como “gasto”, “gym” o “nota”.
                  </p>
                </div>
              ) : (
                groupedItems.map((group) => (
                  <div key={group.category} className="space-y-1">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] flex items-center justify-between">
                      <span>{group.category}</span>
                      <span className="text-[10px] tabular-nums opacity-70">{group.items.length}</span>
                    </div>

                    <div className="space-y-0.5">
                      {group.items.map(({ item, globalIdx }) => {
                        const isSelected = selectedIdx === globalIdx;
                        return (
                          <button
                            key={item.id}
                            ref={(el) => { itemRefs.current[globalIdx] = el; }}
                            type="button"
                            onMouseEnter={() => setSelectedIdx(globalIdx)}
                            onClick={item.onSelect}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer group ${
                              isSelected
                                ? 'bg-[var(--surface-muted)] ring-1 ring-[var(--border-hover)] text-[var(--text)]'
                                : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)]/60'
                            }`}
                          >
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors ${
                                isSelected
                                  ? 'border-[var(--border-hover)] bg-[var(--card)] text-[var(--text)] shadow-xs'
                                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-faint)]'
                              }`}
                            >
                              {item.iconName ? (
                                <AppIcon name={item.iconName} className="h-4 w-4" />
                              ) : item.iconChar ? (
                                <span>{item.iconChar}</span>
                              ) : (
                                <AppIcon name="search" className="h-4 w-4" />
                              )}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs sm:text-sm font-semibold truncate ${isSelected ? 'text-[var(--text)]' : 'text-[var(--text)]'}`}>
                                  {item.title}
                                </span>
                                {item.badge && (
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums font-bold shrink-0 ${
                                      item.isSensitive && state.settings.privacyMode ? 'privacy-sensitive ' : ''
                                    }${
                                      item.badgeTone === 'green'
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                        : item.badgeTone === 'red'
                                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                        : item.badgeTone === 'blue'
                                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                        : 'bg-[var(--bg)] text-[var(--text-faint)] border border-[var(--border)]'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] text-[var(--text-faint)] truncate mt-0.5 ${item.isSensitive && state.settings.privacyMode ? 'privacy-sensitive' : ''}`}>
                                {item.subtitle}
                              </p>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5 text-right">
                              {item.shortcutHint && (
                                <span className="hidden sm:inline-block rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-faint)]">
                                  {item.shortcutHint}
                                </span>
                              )}
                              {isSelected && (
                                <span className="flex items-center text-[11px] font-mono font-semibold text-[var(--blue)]">
                                  <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 shadow-2xs">↵</kbd>
                                </span>
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

            {/* Raycast / Notion style minimal footer */}
            <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[11px] text-[var(--text-faint)]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-soft)]">Celestian · Comandos</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline tabular-nums">{visibleItems.length} opciones</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px]">
                <span className="hidden sm:inline-flex items-center gap-1">
                  <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1">↑↓</kbd> Navegar
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1">↵</kbd> Seleccionar
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1">esc</kbd> Salir
                </span>
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: MICRO-FORM "REGISTRAR GASTO" */}
        {mode === 'new-expense' && (
          <form onSubmit={handleSaveExpense} className="flex flex-col flex-1">
            {/* Sub-header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 bg-[var(--bg-elevated)]/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
                  title="Volver (Esc)"
                >
                  ←
                </button>
                <div className="flex items-center gap-2">
                  <AppIcon name="wallet" className="h-4 w-4 text-[var(--blue)]" />
                  <span className="text-sm font-bold text-[var(--text)]">Registrar Gasto Rápido</span>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] bg-[var(--card)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                Acción Rápida
              </span>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {/* Monto Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                  Monto a Registrar
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 tabular-nums font-bold text-lg text-[var(--text-faint)]">
                    $
                  </span>
                  <input
                    ref={expenseAmountRef}
                    type="number"
                    step="any"
                    min="0"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full pl-8 pr-4 py-2.5 text-xl font-bold tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-none text-[var(--text)]"
                  />
                </div>

                {/* Preset amount buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[500, 1000, 2000, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExpenseAmount(preset.toString())}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs tabular-nums font-semibold text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-colors"
                    >
                      +${preset.toLocaleString('es-AR')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuenta selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                  Cuenta de Origen
                </label>
                {state.finance.accounts.length === 0 ? (
                  <p className="text-xs text-rose-500">No hay cuentas activas. Crea una en Finanzas.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {state.finance.accounts.map((acc) => {
                      const isSelected = expenseAccount === acc.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setExpenseAccount(acc.id)}
                          className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-[var(--blue)] bg-[var(--blue-soft)] ring-1 ring-[var(--blue)]/30'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--surface-muted)]'
                          }`}
                        >
                          <span className="text-xs font-bold text-[var(--text)] truncate w-full">{acc.name}</span>
                          <span className="text-[11px] tabular-nums text-[var(--text-soft)] mt-0.5">
                            <PrivacyAmount>{fmtMoney(acc.balance)}</PrivacyAmount>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Categoría selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
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
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[var(--blue)] text-white shadow-xs'
                            : 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nota / Detalle */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                  Nota / Detalle (Opcional)
                </label>
                <input
                  type="text"
                  value={expenseNote}
                  onChange={(e) => setExpenseNote(e.target.value)}
                  placeholder="Ej: Café con medialunas, Farmacia…"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-none text-[var(--text)]"
                />
              </div>
            </div>

            {/* Footer Form Controls */}
            <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  onNavigate('finanzas', 'qa-focus-tx', 'gasto');
                  onClose();
                }}
                className="text-xs font-semibold text-[var(--blue)] hover:underline"
              >
                Abrir formulario completo ↗
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] transition-colors"
                >
                  Cancelar (Esc)
                </button>
                <button
                  type="submit"
                  disabled={expenseSaving || !expenseAmount}
                  className="rounded-xl bg-[var(--blue)] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  <span>Guardar Gasto</span>
                  <kbd className="rounded bg-white/20 px-1 text-[9px] font-mono">↵</kbd>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* VIEW 3: MICRO-FORM "NUEVA POSTULACIÓN" */}
        {mode === 'new-job' && (
          <form onSubmit={handleSaveJob} className="flex flex-col flex-1">
            {/* Sub-header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 bg-[var(--bg-elevated)]/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
                  title="Volver (Esc)"
                >
                  ←
                </button>
                <div className="flex items-center gap-2">
                  <AppIcon name="briefcase" className="h-4 w-4 text-[var(--blue)]" />
                  <span className="text-sm font-bold text-[var(--text)]">Nueva postulación</span>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] bg-[var(--card)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                Trabajo
              </span>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">Tipo de proceso</label>
                <select value={jobTipo} onChange={(e) => setJobTipo(e.target.value as JobApplicationType)} className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] text-[var(--text)]">
                  <option value="convencional">Empleo convencional</option>
                  <option value="concurso">Concurso / llamado público</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                    {jobTipo === 'concurso' ? 'Organismo *' : 'Empresa *'}
                  </label>
                  <input
                    ref={jobEmpresaRef}
                    type="text"
                    value={jobEmpresa}
                    onChange={(e) => setJobEmpresa(e.target.value)}
                    placeholder={jobTipo === 'concurso' ? 'Ej.: Ministerio de Salud Pública' : 'Ej.: MercadoLibre, Globant, Startup…'}
                    required
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-none text-[var(--text)] font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                    {jobTipo === 'concurso' ? 'Cargo *' : 'Puesto / Rol *'}
                  </label>
                  <input
                    type="text"
                    value={jobPuesto}
                    onChange={(e) => setJobPuesto(e.target.value)}
                    placeholder={jobTipo === 'concurso' ? 'Ej.: Administrativo III' : 'Ej: Fullstack Developer, Product Designer…'}
                    required
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-none text-[var(--text)]"
                  />
                </div>
              </div>

              {/* Estado selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                  {jobTipo === 'concurso' ? 'Etapa del llamado' : 'Etapa laboral'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {JOB_STAGES[jobTipo].map((st) => {
                    const isSelected = jobEstado === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setJobEstado(st.id)}
                        aria-pressed={isSelected}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                          isSelected
                            ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)] ring-1 ring-[var(--blue)]/30'
                            : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)]'
                        }`}
                      >
                        {getJobStageLabel(jobTipo, st.id)}
                      </button>
                    );
                  })}
                </div>
                {!isJobStatusForType(jobTipo, jobEstado) && <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">Elegí una etapa de este tipo de proceso. La selección anterior no se cambiará automáticamente.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                    Reclutador / Contacto (Opcional)
                  </label>
                  <input
                    type="text"
                    value={jobReclutador}
                    onChange={(e) => setJobReclutador(e.target.value)}
                    placeholder="Ej: Sofia (LinkedIn)"
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-none text-[var(--text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-soft)] uppercase tracking-wider block">
                    Enlace a la publicación (Opcional)
                  </label>
                  <input
                    type="url"
                    value={jobLink}
                    onChange={(e) => setJobLink(e.target.value)}
                    placeholder={jobTipo === 'concurso' ? 'https://…' : 'https://linkedin.com/jobs/...'}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-none text-[var(--text)]"
                  />
                </div>
              </div>
            </div>

            {/* Footer Form Controls */}
            <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  onNavigate('trabajo', 'qa-focus-trabajo');
                  onClose();
                }}
                className="text-xs font-semibold text-[var(--blue)] hover:underline"
              >
                Abrir pipeline completo en Trabajo ↗
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('palette')}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)] transition-colors"
                >
                  Cancelar (Esc)
                </button>
                <button
                  type="submit"
                  disabled={jobSaving || !jobEmpresa.trim() || !jobPuesto.trim() || !isJobStatusForType(jobTipo, jobEstado)}
                  className="rounded-xl bg-[var(--blue)] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  <span>Guardar Postulación</span>
                  <kbd className="rounded bg-white/20 px-1 text-[9px] font-mono">↵</kbd>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export { GlobalSearchModal as CommandPalette };
