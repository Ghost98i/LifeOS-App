import React, { useState, useEffect } from 'react';
import { LifeOSState, Transaction } from '../types';
import {
  todayISO,
  daysBetween,
  fmtDate,
  fmtMoney,
  uid,
} from '../lib/storage';
import {
  EVENT_TYPE_META,
  calendarItemsOnDate,
  upcomingEvents,
  defaultAccountId,
  CalendarDisplayItem,
  advanceCommitmentDueDate,
  advanceExpectedIncomeDate,
} from '../lib/calculations';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { showToast } from '../lib/toast';
import { playSound } from '../lib/audio';
import { getCategoryName } from '../lib/financeCategories';

interface CalendarioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate?: (view: any) => void;
}

export const CalendarioView: React.FC<CalendarioViewProps> = ({ state, onUpdateState, onNavigate }) => {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedItem, setSelectedItem] = useState<CalendarDisplayItem | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(todayISO());
  const [eventType, setEventType] = useState<'cumpleanos' | 'estreno' | 'importante' | 'otro'>('cumpleanos');
  const [eventRecurring, setEventRecurring] = useState(false);

  useEffect(() => {
    if (!selectedItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSelectedItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let monthLabel = firstOfMonth.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
  monthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const todayIso = todayISO();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const handleNav = (dir: -1 | 1 | 'today') => {
    if (dir === 'today') {
      setViewDate(new Date());
    } else {
      setViewDate(new Date(year, month + dir, 1));
    }
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) return;
    onUpdateState((draft) => {
      if (!draft.calendarEvents) draft.calendarEvents = [];
      draft.calendarEvents.push({
        id: uid(),
        name: eventName.trim(),
        date: eventDate || todayISO(),
        type: eventType,
        recurring: eventRecurring,
      });
    });
    setEventName('');
  };

  const handleDeleteEvent = (id: string) => {
    onUpdateState((draft) => {
      draft.calendarEvents = (draft.calendarEvents || []).filter((e) => e.id !== id);
    });
  };

  const handleConfirmFinancialFromCalendar = (item: CalendarDisplayItem) => {
    if (item.financialType === 'commitment') {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        const target = draft.finance.commitments?.find((c) => c.id === item.financialId);
        if (!target) return;
        const accId = target.accountId || defaultAccountId(draft) || draft.finance.accounts[0]?.id || 'acc-1';
        const tx: Transaction = {
          id: uid(),
          amount: Number(target.amount),
          type: 'gasto',
          category: target.category || 'Varios',
          accountId: accId,
          fixed: 'fijo',
          date: item.date || todayISO(),
          note: `Pago de compromiso: ${target.name}`,
        };
        draft.finance.transactions.push(tx);
        const acc = draft.finance.accounts.find((a) => a.id === accId);
        if (acc) {
          acc.balance = Number(acc.balance || 0) - tx.amount;
        }
        const advanced = advanceCommitmentDueDate(target);
        target.nextDueDate = advanced.nextDueDate;
        target.remainingOccurrences = advanced.remainingOccurrences;
        target.active = advanced.active;
        if (advanced.dueDay) target.dueDay = advanced.dueDay;
        target.updatedAt = new Date().toISOString();
      });
      playSound('coins');
      showToast(`Pago registrado: -$${Number(item.financialAmount || 0).toLocaleString('es-UY')}`);
      setSelectedItem(null);
    } else if (item.financialType === 'income') {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        const target = draft.finance.expectedIncomes?.find((i) => i.id === item.financialId);
        if (!target) return;
        const accId = target.accountId || defaultAccountId(draft) || draft.finance.accounts[0]?.id || 'acc-1';
        const tx: Transaction = {
          id: uid(),
          amount: Number(target.amount),
          type: 'ingreso',
          category: target.category || 'Varios',
          accountId: accId,
          fixed: 'variable',
          date: item.date || todayISO(),
          note: `Previsión confirmada: ${target.name}`,
        };
        draft.finance.transactions.push(tx);
        const acc = draft.finance.accounts.find((a) => a.id === accId);
        if (acc) {
          acc.balance = Number(acc.balance || 0) + tx.amount;
        }
        const advanced = advanceExpectedIncomeDate(target);
        target.startDate = advanced.startDate;
        target.active = advanced.active;
        target.updatedAt = new Date().toISOString();
      });
      playSound('coins');
      showToast(`Ingreso registrado: +$${Number(item.financialAmount || 0).toLocaleString('es-UY')}`);
      setSelectedItem(null);
    }
  };

  const upcoming = upcomingEvents(state, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario & Fechas"
        subtitle="Cumpleaños, estrenos, vencimientos y fechas especiales."
      />

      {/* Calendar Month Navigation */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => handleNav(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs"
          title="Mes anterior"
          aria-label="Mes anterior"
        >
          <AppIcon name="chevronLeft" className="h-4 w-4" />
        </button>
        <span className="font-extrabold text-base text-[var(--text)] min-w-[160px] text-center">{monthLabel}</span>
        <button
          onClick={() => handleNav(1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs"
          title="Mes siguiente"
          aria-label="Mes siguiente"
        >
          <AppIcon name="chevronRight" className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleNav('today')}
          className="px-3.5 h-9 text-xs font-bold rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer ml-auto sm:ml-2 transition-colors shadow-2xs"
        >
          Hoy
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-[var(--text-faint)] uppercase tracking-wider">
        <span>Lun</span>
        <span>Mar</span>
        <span>Mié</span>
        <span>Jue</span>
        <span>Vie</span>
        <span>Sáb</span>
        <span>Dom</span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {cells.map((d, idx) => {
          if (d === null) {
            return <div key={`empty-${idx}`} className="bg-transparent h-16 sm:h-22" />;
          }

          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const items = calendarItemsOnDate(state, iso);
          const isToday = iso === todayIso;

          return (
            <div
              key={iso}
              className={`bg-[var(--card)] border rounded-2xl p-2 min-h-[70px] sm:min-h-[90px] flex flex-col gap-1 overflow-hidden transition-all ${
                isToday
                  ? 'border-[var(--blue)] shadow-xs ring-2 ring-[var(--blue)]/30 bg-[var(--blue-soft)]/20'
                  : 'border-[var(--border)] hover:border-[var(--border-hover)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${isToday ? 'text-[var(--blue)] font-black' : 'text-[var(--text-soft)]'}`}>
                  {d}
                </span>
                {isToday && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--blue)]" />
                )}
              </div>
              <div className="space-y-1 overflow-y-auto max-h-[56px] no-scrollbar">
                {items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    title={`${item.isDeadline ? '⏰ Vence: ' : ''}${item.name}`}
                    className={`w-full text-left text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate cursor-pointer hover:opacity-90 transition-all ${item.pill}${item.isDone ? ' opacity-40 line-through' : ''}`}
                  >
                    {item.icon} {item.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Form to add event */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Agregar evento</h2>
        <form onSubmit={handleAddEvent} className="flex flex-wrap items-end gap-2 p-4 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-2xl">
          <div className="flex-1 min-w-[170px]">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Nombre</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Ej: Cumpleaños de Ana"
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Tipo</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
            >
              {Object.entries(EVENT_TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.icon} {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 pb-2.5 px-1">
            <input
              type="checkbox"
              id="eventRecurringCheck"
              checked={eventRecurring}
              onChange={(e) => setEventRecurring(e.target.checked)}
              className="rounded cursor-pointer"
            />
            <label htmlFor="eventRecurringCheck" className="text-xs text-[var(--text-soft)] cursor-pointer select-none">
              Se repite cada año
            </label>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            <span>Agregar</span>
          </button>
        </form>
      </div>

      {/* Upcoming events list */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Próximos eventos</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 divide-y divide-[var(--border)] shadow-2xs">
          {upcoming.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)]">Sin eventos cargados.</p>
          ) : (
            upcoming.map((e) => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${EVENT_TYPE_META[e.type].pill}`}>
                  {EVENT_TYPE_META[e.type].icon} {EVENT_TYPE_META[e.type].label}
                </span>
                <span className="flex-1 font-medium text-[var(--text)] truncate">
                  {e.name}
                  {e.recurring && <span className="text-xs text-[var(--text-faint)] ml-1 font-normal">(cada año)</span>}
                </span>
                <span className="font-mono text-xs text-[var(--text-soft)]">
                  {daysBetween(todayIso, e.occursOn) === 0 ? 'Hoy' : `${daysBetween(todayIso, e.occursOn)} día(s)`}
                </span>
                <button
                  onClick={() => handleDeleteEvent(e.id)}
                  className="text-[var(--text-faint)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                  title="Eliminar evento"
                  aria-label="Eliminar evento"
                >
                  <AppIcon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selected Item Details Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setSelectedItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-item-title"
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedItem.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  {selectedItem.financialType === 'commitment'
                    ? 'Compromiso Financiero'
                    : selectedItem.financialType === 'income'
                    ? 'Ingreso Previsto'
                    : selectedItem.type === 'examen'
                    ? 'Examen'
                    : selectedItem.type === 'entrega'
                    ? 'Vencimiento de Tarea'
                    : 'Evento de Calendario'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Cerrar detalles"
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <div>
              <h3 id="calendar-item-title" className="text-base font-bold text-[var(--text)]">{selectedItem.name}</h3>
              <p className="text-xs text-[var(--text-soft)] mt-0.5">
                Fecha: <strong className="font-mono text-[var(--text)]">{fmtDate(selectedItem.date)}</strong>
              </p>
            </div>

            {selectedItem.financialAmount !== undefined && (
              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-soft)] font-medium">Monto programado:</span>
                  <span
                    className={`font-mono font-black text-base ${
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
                    <span className="font-mono font-bold text-[var(--text)]">
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
