import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LifeOSState, CalendarEvent, ViewType } from '../types';
import {
  todayISO,
  fmtDate,
  formatMoney,
  uid,
} from '../lib/storage';
import { PrivacyAmount } from './PrivacyAmount';
import {
  EVENT_TYPE_META,
  calendarItemsOnDate,
  upcomingEvents,
  CalendarDisplayItem,
} from '../lib/calculations';
import { confirmExpectedIncome, confirmFinancialCommitment } from '../lib/financeFlows';
import { PageHeader } from './PageHeader';
import { AppIcon, type AppIconName } from './AppIcon';
import { SurfaceCard, SectionHeader, ListDivider } from './ui/SurfacePrimitives';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { showToast } from '../lib/toast';
import { playSound } from '../lib/audio';
import { getCategoryName } from '../lib/financeCategories';
import { datedTaskDestination } from '../lib/datedAgendaTasks';

interface CalendarioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  onNavigate?: (view: any) => void;
  onNavigateToRecord?: (view: ViewType, options?: { tab?: string; focusId?: string; date?: string }) => void;
}

function formatNaturalDate(iso: string, isToday = false): string {
  if (!iso) return '';
  const parts = iso.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  const weekday = date.toLocaleDateString('es-UY', { weekday: 'short' }).replace(/\.$/, '');
  const monthName = date.toLocaleDateString('es-UY', { month: 'short' }).replace(/\.$/, '').toLocaleLowerCase('es-UY');
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const formatted = `${capitalizedWeekday} ${parts[2]} ${monthName}`;
  return isToday ? `${formatted} · Hoy` : formatted;
}

function chronologicalItems(state: LifeOSState, iso: string): CalendarDisplayItem[] {
  return calendarItemsOnDate(state, iso).sort((a, b) =>
    (a.time || '99:99').localeCompare(b.time || '99:99') || a.name.localeCompare(b.name, 'es'));
}

export const CalendarioView: React.FC<CalendarioViewProps> = ({ state, onUpdateState, onNavigate, onNavigateToRecord }) => {
  const todayIso = todayISO();
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CalendarDisplayItem | null>(null);

  // Form state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(todayIso);
  const [eventType, setEventType] = useState<CalendarEvent['type']>('cumpleanos');
  const [eventRecurring, setEventRecurring] = useState(false);
  const [eventTime, setEventTime] = useState('');
  const eventNameInputRef = useRef<HTMLInputElement>(null);
  const eventDialogRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (showEventModal) {
      const previousFocus = document.activeElement as HTMLElement | null;
      const t = window.setTimeout(() => eventNameInputRef.current?.focus(), 50);
      const keepFocusInForm = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(eventDialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []) as HTMLElement[];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      };
      document.addEventListener('keydown', keepFocusInForm);
      return () => {
        window.clearTimeout(t);
        document.removeEventListener('keydown', keepFocusInForm);
        if (previousFocus?.isConnected) previousFocus.focus();
      };
    }
  }, [showEventModal]);

  // Handle Escape key for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedItem) {
          e.stopPropagation();
          setSelectedItem(null);
        } else if (showEventModal) {
          e.stopPropagation();
          setShowEventModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, showEventModal]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let monthLabel = firstOfMonth.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
  monthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const cells: (number | null)[] = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [startOffset, daysInMonth]);

  const handleNav = (dir: -1 | 1 | 'today') => {
    if (dir === 'today') {
      const now = new Date();
      setViewDate(now);
      setSelectedDate(todayIso);
    } else {
      const nextDate = new Date(year, month + dir, 1);
      setViewDate(nextDate);
      const nextIso = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
      setSelectedDate(nextIso);
    }
  };

  const selectDate = (iso: string) => {
    setSelectedDate(iso);
    const [selectedYear, selectedMonth] = iso.split('-').map(Number);
    if (selectedYear !== year || selectedMonth !== month + 1) {
      setViewDate(new Date(selectedYear, selectedMonth - 1, 1));
    }
  };

  const openAddEvent = (targetIso?: string) => {
    const iso = targetIso || selectedDate || todayIso;
    setEditingEventId(null);
    setEventName('');
    setEventDate(iso);
    setEventType('cumpleanos');
    setEventRecurring(false);
    setEventTime('');
    setShowEventModal(true);
  };

  const openEditEvent = (evt: CalendarEvent) => {
    setEditingEventId(evt.id);
    setEventName(evt.name);
    setEventDate(evt.date);
    setEventType((evt.type in EVENT_TYPE_META ? evt.type : 'otro') as CalendarEvent['type']);
    setEventRecurring(Boolean(evt.recurring));
    setEventTime(evt.time || '');
    setShowEventModal(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = eventName.trim();
    if (!trimmed) {
      showToast('Ingresá un nombre para el acontecimiento.', 'info');
      return;
    }

    const iso = eventDate || selectedDate || todayIso;
    if (editingEventId && !state.calendarEvents.some((event) => event.id === editingEventId)) {
      showToast('Este acontecimiento ya no existe. Conservá el texto antes de cerrar.', 'error');
      return;
    }

    const saved = onUpdateState((draft) => {
      if (!draft.calendarEvents) draft.calendarEvents = [];
      if (editingEventId) {
        const idx = draft.calendarEvents.findIndex((ev) => ev.id === editingEventId);
        if (idx !== -1) {
          draft.calendarEvents[idx] = {
            ...draft.calendarEvents[idx],
            name: trimmed,
            date: iso,
            type: eventType,
            recurring: eventRecurring,
            time: eventTime.trim() || undefined,
          };
        }
      } else {
        draft.calendarEvents.push({
          id: uid(),
          name: trimmed,
          date: iso,
          type: eventType,
          recurring: eventRecurring,
          time: eventTime.trim() || undefined,
        });
      }
    });

    if (!saved) return;
    setSelectedDate(iso);
    setShowEventModal(false);
    playSound('success');
    showToast(editingEventId ? 'Acontecimiento actualizado.' : 'Acontecimiento agregado.', 'success');
  };

  const handleDeleteEvent = (id: string) => {
    const saved = onUpdateState((draft) => {
      draft.calendarEvents = (draft.calendarEvents || []).filter((e) => e.id !== id);
    });
    if (!saved) return;
    showToast('Acontecimiento eliminado.', 'info');
  };

  const handleConfirmFinancialFromCalendar = (item: CalendarDisplayItem) => {
    const cur = item.financialCurrency || 'UYU';
    const privacyActive = Boolean(state.settings?.privacyMode);
    try {
      if (item.financialType === 'commitment') {
        const saved = onUpdateState((draft) => {
          if (!draft.finance) return;
          const target = draft.finance.commitments?.find((c) => c.id === item.financialId);
          if (!target) return;
          confirmFinancialCommitment(draft, {
            commitmentId: target.id,
            accountId: target.accountId,
            date: item.date || todayIso,
          });
        });
        if (!saved) return;
        playSound('coins');
        const amtLabel = privacyActive ? '••••' : formatMoney(Number(item.financialAmount || 0), cur);
        showToast(`Pago registrado: -${amtLabel}`, 'success');
        setSelectedItem(null);
      } else if (item.financialType === 'income') {
        const saved = onUpdateState((draft) => {
          if (!draft.finance) return;
          const target = draft.finance.expectedIncomes?.find((i) => i.id === item.financialId);
          if (!target) return;
          confirmExpectedIncome(draft, {
            expectedIncomeId: target.id,
            accountId: target.accountId,
            date: item.date || todayIso,
          });
        });
        if (!saved) return;
        playSound('coins');
        const amtLabel = privacyActive ? '••••' : formatMoney(Number(item.financialAmount || 0), cur);
        showToast(`Ingreso registrado: +${amtLabel}`, 'success');
        setSelectedItem(null);
      }
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'No se pudo confirmar el movimiento desde el calendario.',
        'error'
      );
    }
  };

  const itemOrigin = (item: CalendarDisplayItem) =>
    item.taskRef ? (item.isDeadline ? 'Tarea · vencimiento' : 'Tarea programada')
      : item.financialType === 'commitment' ? 'Compromiso financiero'
      : item.financialType === 'income' ? 'Ingreso previsto'
      : item.type === 'job_deadline' ? 'Trabajo · fecha clave'
      : item.type === 'examen' ? 'Estudios · examen'
      : item.type === 'entrega' ? 'Tarea · vencimiento'
      : item.id.startsWith('scheduled-extra-') ? 'Elemento programado'
      : `Acontecimiento · ${EVENT_TYPE_META[item.type as keyof typeof EVENT_TYPE_META]?.label || 'Otro'}`;

  const itemIconName = (type: CalendarDisplayItem['type']): AppIconName => {
    switch (type) {
      case 'finanza_ingreso': return 'income';
      case 'finanza_compromiso': return 'expense';
      case 'examen': return 'exam';
      case 'entrega': return 'clock';
      case 'job_deadline': return 'briefcase';
      case 'cumpleanos': return 'gift';
      case 'reunion': return 'user';
      case 'cita': return 'calendar';
      case 'recordatorio': return 'reminder';
      case 'viaje': return 'mapPin';
      case 'tramite': return 'note';
      case 'importante': return 'flame';
      default: return 'calendarDays';
    }
  };

  const itemDot = (item: CalendarDisplayItem) =>
    item.financialType === 'income'
      ? 'bg-emerald-500'
      : item.financialType === 'commitment'
      ? 'bg-rose-500'
      : item.type === 'examen' || item.type === 'entrega'
      ? 'bg-amber-500'
      : 'bg-[#4F46E5] dark:bg-indigo-400';

  const itemIconTone = (item: CalendarDisplayItem) =>
    item.financialType === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : item.financialType === 'commitment'
      ? 'text-rose-600 dark:text-rose-400'
      : item.type === 'examen' || item.type === 'entrega'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-[#4F46E5] dark:text-indigo-300';

  const itemPillTone = (item: CalendarDisplayItem) =>
    item.financialType === 'income'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : item.financialType === 'commitment'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
      : item.type === 'examen' || item.type === 'entrega'
      ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
      : 'bg-indigo-50 text-[#4F46E5] dark:bg-indigo-500/15 dark:text-indigo-300';

  const upcoming = useMemo(() => upcomingEvents(state, 6, selectedDate), [state, selectedDate]);
  const selectedItems = useMemo(() => selectedDate ? chronologicalItems(state, selectedDate) : [], [state, selectedDate]);

  return (
    <div className="space-y-5">
      <PageHeader title="Calendario" />

      {/* Main Container: 2 columns on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Left Column: Calendar Grid & Navigation inside a single flat SurfaceCard */}
        <SurfaceCard className="overflow-hidden">
          {/* Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 px-3.5 py-3 dark:border-white/[0.06] sm:px-5 sm:py-3.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => handleNav(-1)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:hover:border-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
                title="Mes anterior"
                aria-label="Mes anterior"
              >
                <AppIcon name="chevronLeft" className="h-4 w-4" />
              </button>
              <span className="min-w-[132px] text-center text-sm font-semibold text-[var(--text)] sm:min-w-[152px] sm:text-base">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => handleNav(1)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-[var(--text)] transition-colors hover:border-[#4F46E5] hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:hover:border-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
                title="Mes siguiente"
                aria-label="Mes siguiente"
              >
                <AppIcon name="chevronRight" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleNav('today')}
                className="min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:border-[#4F46E5] hover:text-[var(--text)] dark:border-white/[0.08] dark:bg-transparent cursor-pointer"
              >
                Hoy
              </button>
            </div>

            <button
              type="button"
              onClick={() => openAddEvent()}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] sm:w-auto cursor-pointer"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              <span>Agregar acontecimiento</span>
            </button>
          </div>

          <div className="p-2.5 sm:p-4">
            {/* Weekday headers */}
            <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 sm:mb-2 sm:gap-1.5">
              <span>Lun</span>
              <span>Mar</span>
              <span>Mié</span>
              <span>Jue</span>
              <span>Vie</span>
              <span>Sáb</span>
              <span>Dom</span>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Calendario de ${monthLabel}`}>
              {cells.map((d, idx) => {
                if (d === null) {
                  return <div key={`empty-${idx}`} className="min-h-[46px] bg-transparent sm:min-h-[84px] xl:min-h-[108px]" aria-hidden="true" />;
                }

                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const items = chronologicalItems(state, iso);
                const isToday = iso === todayIso;
                const isSelected = selectedDate === iso;

                return (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => selectDate(iso)}
                    aria-label={`${formatNaturalDate(iso, isToday)}, ${items.length} elemento${items.length === 1 ? '' : 's'}`}
                    aria-pressed={isSelected}
                    className={`group relative flex min-h-[46px] min-w-0 flex-col justify-start rounded-xl p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] sm:min-h-[84px] sm:p-2 xl:min-h-[108px] xl:p-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-500/15'
                        : isToday
                        ? 'bg-slate-50/90 dark:bg-white/[0.03]'
                        : 'hover:bg-slate-50/70 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* Day header row */}
                    <div className="pointer-events-none flex w-full items-center justify-center sm:justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums leading-none sm:text-xs xl:text-sm ${
                          isSelected
                            ? 'bg-[#4F46E5] font-bold text-white'
                            : isToday
                            ? 'font-bold text-[#4F46E5] dark:text-indigo-300'
                            : 'font-medium text-[var(--text-soft)]'
                        }`}
                      >
                        {d}
                      </span>
                      {isToday && !isSelected && (
                        <span className="hidden items-center gap-1 sm:flex">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4F46E5] dark:bg-indigo-400" />
                          <span className="text-[10px] font-semibold uppercase text-[#4F46E5] dark:text-indigo-300">Hoy</span>
                        </span>
                      )}
                    </div>

                    {/* Mobile dots view */}
                    <div className="pointer-events-none mt-1 flex w-full flex-wrap items-center justify-center gap-1 md:hidden">
                      {items.slice(0, 3).map((item) => (
                        <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${itemDot(item)}`} />
                      ))}
                      {items.length > 3 && (
                        <span className="text-[9px] font-semibold tabular-nums text-[var(--text-soft)]">
                          +{items.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Desktop item pills view */}
                    <div className="pointer-events-none mt-1.5 hidden w-full min-w-0 flex-col gap-1 md:flex">
                      {items.slice(0, 2).map((item) => (
                        <div
                          key={item.id}
                          title={`${item.isDeadline ? 'Vence: ' : ''}${item.time ? `${item.time} · ` : ''}${item.name}`}
                          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium truncate ${itemPillTone(item)}${item.isDone ? ' opacity-45 line-through' : ''}`}
                        >
                          <AppIcon name={itemIconName(item.type)} className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.time && `${item.time} `}{item.name}</span>
                        </div>
                      ))}
                      {items.length > 2 && (
                        <span className="px-1 text-[10px] font-semibold text-[#4F46E5] dark:text-indigo-300">
                          +{items.length - 2} más
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </SurfaceCard>

        {/* Right Column: Contextual Date Detail Panel & Upcoming Events */}
        <div className="space-y-4">
          {/* Selected Date Detail Panel */}
          <SurfaceCard aria-live="polite" className="overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
              <SectionHeader
                icon={<AppIcon name="calendarDays" className="h-4 w-4" />}
                title={selectedDate ? formatNaturalDate(selectedDate, selectedDate === todayIso) : 'Elegí un día'}
                count={selectedItems.length > 0 ? selectedItems.length : null}
                action={
                  <button
                    type="button"
                    onClick={() => openAddEvent(selectedDate)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-indigo-50 px-3 text-xs font-semibold text-[#4F46E5] transition-colors hover:bg-[#4F46E5] hover:text-white dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-[#4F46E5] dark:hover:text-white cursor-pointer"
                    title="Agregar acontecimiento en esta fecha"
                  >
                    <AppIcon name="plus" className="h-4 w-4" />
                    <span>Agregar</span>
                  </button>
                }
              />
            </div>

            {selectedItems.length > 0 ? (
              <ListDivider className="xl:max-h-[420px] xl:overflow-y-auto">
                {selectedItems.map((item) => {
                  const calendarEvent = (state.calendarEvents || []).find((e) => e.id === item.id);
                  const isUserCreated = Boolean(calendarEvent);

                  return (
                    <div
                      key={item.id}
                      className="group flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-5"
                    >
                      <AppIcon name={itemIconName(item.type)} className={`h-4 w-4 shrink-0 ${itemIconTone(item)}`} />
                      <button
                        type="button"
                        onClick={() => {
                          if (item.type === 'job_deadline' && item.jobApplicationId && onNavigateToRecord) {
                            onNavigateToRecord('trabajo', { focusId: `job-app-${item.jobApplicationId}` });
                          } else {
                            setSelectedItem(item);
                          }
                        }}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span className={`block text-sm font-medium leading-snug text-[var(--text)] ${item.isDone ? 'line-through opacity-60' : ''}`}>
                          {item.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-soft)]">
                          {item.time && <span className="font-semibold tabular-nums text-[#4F46E5] dark:text-indigo-300">{item.time} · </span>}
                          {itemOrigin(item)}
                        </span>
                        {item.financialAmount !== undefined && (
                          <span className={`mt-1 inline-block text-xs font-semibold tabular-nums ${item.financialType === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            <PrivacyAmount>
                              {item.financialType === 'income' ? '+' : '−'}{formatMoney(item.financialAmount, item.financialCurrency || 'UYU')}
                            </PrivacyAmount>
                          </span>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {isUserCreated && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditEvent(calendarEvent!)}
                              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] dark:hover:text-indigo-300 cursor-pointer"
                              title="Editar acontecimiento"
                              aria-label={`Editar ${item.name}`}
                            >
                              <AppIcon name="edit" className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(item.id)}
                              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-faint)] transition-colors hover:bg-rose-500/10 hover:text-rose-500 cursor-pointer"
                              title="Eliminar acontecimiento"
                              aria-label={`Eliminar ${item.name}`}
                            >
                              <AppIcon name="trash" className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {!isUserCreated && (
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[#4F46E5] dark:hover:text-indigo-300 cursor-pointer"
                            title="Ver detalles"
                            aria-label={`Ver detalles de ${item.name}`}
                          >
                            <AppIcon name="chevronRight" className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </ListDivider>
            ) : (
              <div className="px-4 py-6 text-center sm:px-5">
                <p className="text-xs text-[var(--text-soft)]">
                  No hay elementos para esta fecha.
                </p>
                <button
                  type="button"
                  onClick={() => openAddEvent(selectedDate)}
                  className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-[#4F46E5] hover:underline dark:text-indigo-300 cursor-pointer"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                  <span>Agregar acontecimiento aquí</span>
                </button>
              </div>
            )}
          </SurfaceCard>

          {/* Upcoming events preview */}
          {upcoming.length > 0 && (
            <SurfaceCard className="overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3.5 dark:border-white/[0.06] sm:px-5">
                <SectionHeader
                  icon={<AppIcon name="clock" className="h-4 w-4" />}
                  title="Próximos acontecimientos"
                  count={upcoming.length}
                />
              </div>

              <ListDivider>
                {upcoming.map((e) => {
                  const isEventToday = e.occursOn === todayIso;
                  const occurrence = new Date(`${e.occursOn}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' });

                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02] sm:px-5"
                    >
                      <button
                        type="button"
                        onClick={() => selectDate(e.occursOn)}
                        className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                      >
                        <AppIcon name={itemIconName(e.type)} className="h-4 w-4 shrink-0 text-[#4F46E5] dark:text-indigo-300" />
                        <span className="truncate text-sm font-medium text-[var(--text)] transition-colors group-hover:text-[#4F46E5] dark:group-hover:text-indigo-300">
                          {e.name}
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <span className={`tabular-nums text-[11px] font-semibold ${isEventToday ? 'text-[#4F46E5] dark:text-indigo-300' : 'text-[var(--text-soft)]'}`} title={formatNaturalDate(e.occursOn)}>
                          {isEventToday ? `Hoy · ${occurrence}` : occurrence}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(e.id)}
                          className="flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--text-faint)] transition-colors hover:bg-rose-500/10 hover:text-rose-500 cursor-pointer"
                          title="Eliminar evento"
                          aria-label={`Eliminar ${e.name}`}
                        >
                          <AppIcon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </ListDivider>
            </SurfaceCard>
          )}
        </div>
      </div>

      {/* Add / Edit Event Modal */}
      {showEventModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-form-title"
            ref={eventDialogRef}
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id="event-form-title" className="text-base font-bold text-[var(--text)]">
                  {editingEventId ? 'Editar acontecimiento' : 'Nuevo acontecimiento'}
                </h3>
                <p className="text-xs text-[var(--text-soft)] mt-0.5">
                  {formatNaturalDate(eventDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                aria-label="Cerrar formulario"
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1.5 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-3.5">
              <div>
                <label htmlFor="calendar-event-name" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Nombre o descripción *
                </label>
                <input
                  id="calendar-event-name"
                  ref={eventNameInputRef}
                  type="text"
                  required
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="Ej: Cumpleaños de Lucas, Turno médico, Reunión..."
                  className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)] outline-hidden text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="calendar-event-date" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Fecha
                  </label>
                  <input
                    id="calendar-event-date"
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
                  />
                </div>
                <div>
                  <label htmlFor="calendar-event-type" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Tipo
                  </label>
                  <select
                    id="calendar-event-type"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
                  >
                    {Object.entries(EVENT_TYPE_META)
                      .filter(([k]) => k !== 'job_deadline')
                      .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="calendar-event-time" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Hora (opcional)
                </label>
                <input
                  id="calendar-event-time"
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  placeholder="HH:MM"
                  className="w-full sm:w-1/2 px-3 py-2 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={eventRecurring}
                    onChange={(e) => setEventRecurring(e.target.checked)}
                    className="rounded h-4 w-4 cursor-pointer accent-[var(--blue)]"
                  />
                  <span className="text-xs text-[var(--text)] font-medium">
                    Se repite cada año (cumpleaños, aniversarios)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                  <span>{editingEventId ? 'Actualizar' : 'Guardar acontecimiento'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Item Details Modal (for financial commitments, exams, etc.) */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setSelectedItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-item-title"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AppIcon name={itemIconName(selectedItem.type)} className={`h-4 w-4 shrink-0 ${itemIconTone(selectedItem)}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  {selectedItem.taskRef ? 'Tarea'
                    : selectedItem.financialType === 'commitment'
                    ? 'Compromiso Financiero'
                    : selectedItem.financialType === 'income'
                    ? 'Ingreso Previsto'
                    : selectedItem.type === 'job_deadline'
                    ? 'Trabajo · Fecha clave'
                    : selectedItem.type === 'examen'
                    ? 'Examen'
                    : selectedItem.type === 'entrega'
                    ? 'Vencimiento de Tarea'
                    : 'Acontecimiento'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Cerrar detalles"
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1.5 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <div>
              <h3 id="calendar-item-title" className="text-base font-bold text-[var(--text)]">
                {selectedItem.name}
              </h3>
              <p className="text-xs text-[var(--text-soft)] mt-0.5">
                Fecha: <strong className="tabular-nums text-[var(--text)]">{fmtDate(selectedItem.date)}</strong>
                {selectedItem.time && <span className="ml-2 tabular-nums">{selectedItem.time}</span>}
              </p>
            </div>

            {selectedItem.taskRef && <p className="text-sm text-[var(--text-soft)]">{selectedItem.isDone ? 'Completada' : 'Pendiente'}{selectedItem.isDeadline ? ' · fecha de vencimiento' : ''}</p>}
            {selectedItem.taskRef && onNavigateToRecord && <button type="button" className="min-h-11 rounded-xl bg-[var(--blue)] px-4 text-sm font-semibold text-white" onClick={() => {
              const target = datedTaskDestination(selectedItem.taskRef!); setSelectedItem(null); onNavigateToRecord(target.view, target.options);
            }}>Abrir tarea original</button>}
            {selectedItem.type === 'job_deadline' && selectedItem.jobApplicationId && onNavigateToRecord && (
              <button
                type="button"
                className="min-h-11 rounded-xl bg-[var(--blue)] px-4 text-sm font-semibold text-white cursor-pointer"
                onClick={() => {
                  const appId = selectedItem.jobApplicationId!;
                  setSelectedItem(null);
                  onNavigateToRecord('trabajo', { focusId: `job-app-${appId}` });
                }}
              >
                Abrir postulación en Trabajo
              </button>
            )}
            {selectedItem.financialAmount !== undefined && (
              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-soft)] font-medium">Monto programado:</span>
                  <span
                    className={`tabular-nums font-black text-base ${
                      selectedItem.financialType === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    <PrivacyAmount>
                      {selectedItem.financialType === 'income' ? '+' : '−'}{formatMoney(selectedItem.financialAmount, selectedItem.financialCurrency || 'UYU')}
                    </PrivacyAmount>
                  </span>
                </div>
                {selectedItem.frequency && (
                  <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
                    <span>Frecuencia:</span>
                    <span className="font-semibold text-[var(--text)] capitalize">{selectedItem.frequency}</span>
                  </div>
                )}
                {selectedItem.remainingOccurrences !== undefined && selectedItem.remainingOccurrences !== null && (
                  <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
                    <span>Cuotas restantes:</span>
                    <span className="tabular-nums font-bold text-[var(--text)]">
                      {selectedItem.remainingOccurrences} cuota{selectedItem.remainingOccurrences === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
                {selectedItem.category && (
                  <div className="flex items-center justify-between text-xs text-[var(--text-soft)]">
                    <span>Categoría:</span>
                    <span className="font-semibold text-[var(--text)]">{getCategoryName(state.finance?.categories, selectedItem.category)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              {selectedItem.financialType && isModuleEnabled(state, 'finanzas') && (
                <>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItem(null);
                        onNavigate('finanzas');
                      }}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--blue)] text-[var(--text)] transition-colors cursor-pointer"
                    >
                      Ir a Finanzas →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleConfirmFinancialFromCalendar(selectedItem)}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white transition-colors cursor-pointer shadow-2xs"
                  >
                    {selectedItem.financialType === 'income' ? 'Registrar ingreso real' : 'Registrar pago real'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
