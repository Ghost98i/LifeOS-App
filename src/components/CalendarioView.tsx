import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LifeOSState, CalendarEvent, ViewType } from '../types';
import {
  todayISO,
  fmtDate,
  fmtMoney,
  uid,
} from '../lib/storage';
import {
  EVENT_TYPE_META,
  calendarItemsOnDate,
  upcomingEvents,
  CalendarDisplayItem,
} from '../lib/calculations';
import { confirmExpectedIncome, confirmFinancialCommitment } from '../lib/financeFlows';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
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
  const weekday = date.toLocaleDateString('es-UY', { weekday: 'long' });
  const monthName = date.toLocaleDateString('es-UY', { month: 'long' }).toLocaleLowerCase('es-UY');
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const formatted = `${capitalizedWeekday} ${parts[2]} de ${monthName}`;
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
  const [eventType, setEventType] = useState<keyof typeof EVENT_TYPE_META>('cumpleanos');
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
    setEventType((evt.type in EVENT_TYPE_META ? evt.type : 'otro') as keyof typeof EVENT_TYPE_META);
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
      showToast(`Pago registrado: -$${Number(item.financialAmount || 0).toLocaleString('es-UY')}`, 'success');
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
      showToast(`Ingreso registrado: +$${Number(item.financialAmount || 0).toLocaleString('es-UY')}`, 'success');
      setSelectedItem(null);
    }
  };

  const itemOrigin = (item: CalendarDisplayItem) =>
    item.taskRef ? (item.isDeadline ? 'Tarea · vencimiento' : 'Tarea programada')
      : item.financialType === 'commitment' ? 'Compromiso financiero'
      : item.financialType === 'income' ? 'Ingreso previsto'
      : item.type === 'examen' ? 'Estudios · examen'
      : item.type === 'entrega' ? 'Tarea · vencimiento'
      : item.id.startsWith('scheduled-extra-') ? 'Elemento programado'
      : `Acontecimiento · ${EVENT_TYPE_META[item.type as keyof typeof EVENT_TYPE_META]?.label || 'Otro'}`;

  const itemDot = (item: CalendarDisplayItem) =>
    item.financialType === 'income' ? 'bg-emerald-500'
      : item.financialType === 'commitment' || item.type === 'entrega' || item.type === 'importante' ? 'bg-rose-500'
      : item.type === 'examen' || item.type === 'otro' ? 'bg-amber-500'
      : item.type === 'cumpleanos' ? 'bg-purple-500'
      : item.type === 'aniversario' ? 'bg-pink-500'
      : item.type === 'reunion' ? 'bg-cyan-500'
      : item.type === 'cita' ? 'bg-indigo-500'
      : item.type === 'tramite' ? 'bg-slate-500'
      : item.type === 'viaje' ? 'bg-sky-500'
      : item.type === 'recordatorio' ? 'bg-orange-500'
      : 'bg-blue-500';

  const upcoming = useMemo(() => upcomingEvents(state, 6, selectedDate), [state, selectedDate]);
  const selectedItems = useMemo(() => selectedDate ? chronologicalItems(state, selectedDate) : [], [state, selectedDate]);

  return (
    <div className="space-y-5">
      <PageHeader title="Calendario" />

      {/* Main Container: 2 columns on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Left Column: Calendar Grid & Navigation */}
        <div className="space-y-4">
          {/* Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleNav(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs"
                title="Mes anterior"
                aria-label="Mes anterior"
              >
                <AppIcon name="chevronLeft" className="h-4 w-4" />
              </button>
              <span className="font-extrabold text-base text-[var(--text)] min-w-[150px] text-center">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => handleNav(1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs"
                title="Mes siguiente"
                aria-label="Mes siguiente"
              >
                <AppIcon name="chevronRight" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleNav('today')}
                className="px-3 h-9 text-xs font-bold rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer transition-colors shadow-2xs"
              >
                Hoy
              </button>
            </div>

            <button
              type="button"
              onClick={() => openAddEvent()}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Agregar acontecimiento</span>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-[11px] font-bold text-[var(--text-faint)] uppercase tracking-wider">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sáb</span>
            <span>Dom</span>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={`Calendario de ${monthLabel}`}>
            {cells.map((d, idx) => {
              if (d === null) {
                return <div key={`empty-${idx}`} className="bg-transparent min-h-[70px] sm:min-h-[88px] xl:min-h-[118px]" aria-hidden="true" />;
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
                  className={`group relative flex flex-col justify-start rounded-xl md:rounded-2xl p-1.5 sm:p-2 xl:p-2.5 min-h-[72px] sm:min-h-[88px] xl:min-h-[118px] min-w-0 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] ${
                    isSelected
                      ? 'border-2 border-[var(--blue)] bg-[var(--blue-soft)]/20 shadow-xs ring-1 ring-[var(--blue)]/40'
                      : isToday
                      ? 'border border-[var(--blue)]/80 bg-[var(--blue-soft)]/10 shadow-2xs'
                      : 'border border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-muted)]/40'
                  }`}
                >
                  {/* Day header row */}
                  <div className="flex w-full items-center justify-between pointer-events-none">
                    <span className={`text-xs xl:text-sm font-bold leading-none ${isToday ? 'text-[var(--blue)] font-black' : isSelected ? 'text-[var(--text)] font-extrabold' : 'text-[var(--text-soft)]'}`}>
                      {d}
                    </span>
                    {isToday && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--blue)]" />
                        <span className="hidden sm:inline text-[9px] font-bold text-[var(--blue)] uppercase">Hoy</span>
                      </span>
                    )}
                  </div>

                  {/* Mobile dots view */}
                  <div className="md:hidden mt-auto pt-1 flex flex-wrap items-center justify-center gap-1 w-full pointer-events-none">
                    {items.slice(0, 3).map((item) => (
                      <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${itemDot(item)}`} />
                    ))}
                    {items.length > 3 && (
                      <span className="text-[9px] font-bold tabular-nums text-[var(--text-soft)]">
                        +{items.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Desktop item pills view */}
                  <div className="hidden md:flex flex-col gap-1 mt-1.5 w-full min-w-0 pointer-events-none">
                    {items.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        title={`${item.isDeadline ? '⏰ Vence: ' : ''}${item.time ? `${item.time} · ` : ''}${item.name}`}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate transition-all ${item.pill}${item.isDone ? ' opacity-40 line-through' : ''}`}
                      >
                        {item.icon} {item.time && `${item.time} `}{item.name}
                      </div>
                    ))}
                    {items.length > 2 && (
                      <span className="text-[10px] font-semibold text-[var(--blue)]">
                        +{items.length - 2} más
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Contextual Date Detail Panel & Upcoming Events */}
        <div className="space-y-4">
          {/* Selected Date Detail Panel */}
          <section
            aria-live="polite"
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/70 pb-3">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-[var(--text)] tracking-tight truncate">
                  {selectedDate ? formatNaturalDate(selectedDate, selectedDate === todayIso) : 'Elegí un día'}
                </h2>
                <p className="text-xs text-[var(--text-soft)] tabular-nums mt-0.5">
                  {selectedItems.length} {selectedItems.length === 1 ? 'elemento' : 'elementos'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openAddEvent(selectedDate)}
                className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--blue-soft)] text-[var(--blue)] hover:bg-[var(--blue)] hover:text-white text-xs font-bold transition-colors cursor-pointer"
                title="Agregar acontecimiento en esta fecha"
              >
                <AppIcon name="plus" className="h-3.5 w-3.5" />
                <span>Agregar</span>
              </button>
            </div>

            {selectedItems.length > 0 ? (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
                {selectedItems.map((item) => {
                  const calendarEvent = (state.calendarEvents || []).find((e) => e.id === item.id);
                  const isUserCreated = Boolean(calendarEvent);

                  return (
                    <div
                      key={item.id}
                      className="group flex w-full items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card-subtle)]/40 p-2.5 sm:p-3 text-left hover:border-[var(--blue)] transition-colors"
                    >
                      <span aria-hidden="true" className="text-base shrink-0 mt-0.5">
                        {item.icon}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span className={`block text-xs sm:text-sm font-semibold text-[var(--text)] leading-snug ${item.isDone ? 'line-through opacity-60' : ''}`}>
                          {item.name}
                        </span>
                        <span className="block text-[11px] text-[var(--text-soft)] mt-0.5">
                          {item.time && <span className="font-semibold text-[var(--blue)]">{item.time} · </span>}
                          {itemOrigin(item)}
                        </span>
                        {item.financialAmount !== undefined && (
                          <span className={`inline-block mt-1 text-[11px] font-bold tabular-nums ${item.financialType === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {item.financialType === 'income' ? '+' : '−'}{fmtMoney(item.financialAmount)}
                          </span>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        {isUserCreated && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditEvent(calendarEvent!)}
                              className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--blue)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                              title="Editar acontecimiento"
                              aria-label={`Editar ${item.name}`}
                            >
                              <AppIcon name="pencil" className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(item.id)}
                              className="p-1 rounded-lg text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Eliminar acontecimiento"
                              aria-label={`Eliminar ${item.name}`}
                            >
                              <AppIcon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {!isUserCreated && (
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--blue)] cursor-pointer"
                            title="Ver detalles"
                            aria-label={`Ver detalles de ${item.name}`}
                          >
                            <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 sm:p-5 text-center space-y-2 bg-[var(--card-subtle)]/30">
                <p className="text-xs text-[var(--text-soft)]">
                  No hay elementos para esta fecha.
                </p>
                <button
                  type="button"
                  onClick={() => openAddEvent(selectedDate)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
                >
                  <AppIcon name="plus" className="h-3 w-3" />
                  <span>Agregar acontecimiento aquí</span>
                </button>
              </div>
            )}
          </section>

          {/* Upcoming events preview */}
          {upcoming.length > 0 && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-soft)]">
                  Próximos acontecimientos
                </h3>
                <span className="text-[11px] text-[var(--text-faint)]" title={`Desde ${formatNaturalDate(selectedDate)}`}>Desde el día elegido</span>
              </div>

              <div className="space-y-1.5 divide-y divide-[var(--border)]/60">
                {upcoming.map((e) => {
                  const isEventToday = e.occursOn === todayIso;
                  const occurrence = new Date(`${e.occursOn}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' });

                  return (
                    <div
                      key={e.id}
                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => selectDate(e.occursOn)}
                        className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer group"
                      >
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${EVENT_TYPE_META[e.type]?.pill || ''}`}>
                          {EVENT_TYPE_META[e.type]?.icon || '•'}
                        </span>
                        <span className="font-medium text-[var(--text)] truncate group-hover:text-[var(--blue)] transition-colors">
                          {e.name}
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`tabular-nums text-[11px] font-semibold ${isEventToday ? 'text-[var(--blue)]' : 'text-[var(--text-soft)]'}`} title={formatNaturalDate(e.occursOn)}>
                          {isEventToday ? `Hoy · ${occurrence}` : occurrence}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(e.id)}
                          className="p-1 text-[var(--text-faint)] hover:text-rose-500 rounded cursor-pointer transition-colors"
                          title="Eliminar evento"
                          aria-label={`Eliminar ${e.name}`}
                        >
                          <AppIcon name="trash" className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
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
                    {Object.entries(EVENT_TYPE_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.icon} {v.label}
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
                <span className="text-xl">{selectedItem.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  {selectedItem.taskRef ? 'Tarea'
                    : selectedItem.financialType === 'commitment'
                    ? 'Compromiso Financiero'
                    : selectedItem.financialType === 'income'
                    ? 'Ingreso Previsto'
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
                    {selectedItem.financialType === 'income' ? '+' : '−'}{fmtMoney(selectedItem.financialAmount)}
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
