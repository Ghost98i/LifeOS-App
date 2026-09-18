import React, { useState } from 'react';
import { LifeOSState } from '../types';
import {
  todayISO,
  daysBetween,
  uid,
} from '../lib/storage';
import {
  EVENT_TYPE_META,
  eventsOnDate,
  upcomingEvents,
} from '../lib/calculations';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';

interface CalendarioViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const CalendarioView: React.FC<CalendarioViewProps> = ({ state, onUpdateState }) => {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(todayISO());
  const [eventType, setEventType] = useState<'cumpleanos' | 'estreno' | 'importante' | 'otro'>('cumpleanos');
  const [eventRecurring, setEventRecurring] = useState(false);

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

  const upcoming = upcomingEvents(state, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        category="Organización"
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
          const evs = eventsOnDate(state, iso);
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
                {evs.map((e) => (
                  <div
                    key={e.id}
                    title={e.name}
                    className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate ${
                      EVENT_TYPE_META[e.type].pill
                    }`}
                  >
                    {EVENT_TYPE_META[e.type].icon} {e.name}
                  </div>
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
    </div>
  );
};
