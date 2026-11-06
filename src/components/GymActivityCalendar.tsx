import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GymSession } from '../types';
import { todayISO } from '../lib/storage';
import { getCompletedGymSets } from '../lib/gymMetrics';
import { buildGymActivityIndex, buildGymActivityMonth, gymActivityKeyboardDate, isGymActivityDate, selectGymActivityMonth, shiftGymActivityMonth } from '../lib/gymActivityCalendar';
import { AppIcon } from './AppIcon';

function useCalendarToday() {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setToday(todayISO());
      const now = new Date();
      const next = new Date(now); next.setDate(now.getDate() + 1); next.setHours(0, 0, 0, 20);
      timer = setTimeout(refresh, next.getTime() - now.getTime());
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return today;
}

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MONTH_FORMATTER = new Intl.DateTimeFormat('es-UY', { month: 'long', year: 'numeric' });
const fullDateCache = new Map<string, string>();
const fullDate = (date: string) => {
  let formatted = fullDateCache.get(date);
  if (!formatted) {
    formatted = FULL_DATE_FORMATTER.format(new Date(`${date}T12:00:00`));
    fullDateCache.set(date, formatted);
  }
  return formatted;
};
const nameOf = (session: GymSession) => session.weekLabel?.trim() || session.exercises?.[0]?.name?.trim() || 'Entrenamiento';

interface GymActivityCalendarProps {
  sessions: GymSession[];
  restDates: string[];
  onOpenSession: (sessionId: string) => void;
}

export const GymActivityCalendar: React.FC<GymActivityCalendarProps> = React.memo(({ sessions, restDates, onOpenSession }) => {
  const today = useCalendarToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(() => today);
  const index = useMemo(() => buildGymActivityIndex(sessions, today), [sessions, today]);
  const weeks = useMemo(() => buildGymActivityMonth(month), [month]);
  const rest = useMemo(() => new Set(restDates.filter(isGymActivityDate)), [restDates]);
  const root = useRef<HTMLElement>(null);
  const headingId = useId();
  const selectedHeadingId = useId();
  const monthLabel = useMemo(() => MONTH_FORMATTER.format(new Date(`${month}-01T12:00:00`)), [month]);
  const selectedSessions = index.byDate.get(selected) || [];
  const changeMonth = (next: string) => {
    const date = selectGymActivityMonth(next, selected);
    if (date) { setMonth(next); setSelected(date); }
  };
  const moveMonth = (offset: number) => { const next = shiftGymActivityMonth(month, offset); if (next) changeMonth(next); };
  const selectDate = (date: string, focus = false) => {
    setSelected(date); setMonth(date.slice(0, 7));
    if (focus) requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`button[data-calendar-date="${date}"]`)?.focus());
  };
  return <section ref={root} className="gym-activity-calendar" data-empty-selection={selectedSessions.length === 0 || undefined} aria-labelledby={headingId}>
    <header className="gym-activity-heading">
      <div>
        <h2 id={headingId}>Actividad</h2>
        <div className="gym-activity-week-row">
          <p className="gym-activity-week">Esta semana: <strong>{index.weekDays} {index.weekDays === 1 ? 'día entrenado' : 'días entrenados'}</strong></p>
          <details className="gym-activity-help" onBlur={event => { event.currentTarget.open = false; }} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
          }}>
            <summary aria-label="Ayuda: cómo se cuenta la actividad">Ayuda</summary>
            <p>Se cuentan los días con entrenamientos finalizados. Varias sesiones en un mismo día cuentan como uno. Los descansos no suman.</p>
          </details>
        </div>
      </div>
    </header>
    <div className="gym-activity-layout">
      <div className="gym-activity-month">
        <div className="gym-activity-controls">
          <input type="month" aria-label="Mes del calendario" value={month} min="0001-01" max="9999-12" onChange={e => changeMonth(e.target.value)} />
          <button type="button" aria-label="Mes anterior" onClick={() => moveMonth(-1)} disabled={!shiftGymActivityMonth(month, -1)}><AppIcon name="chevronLeft" className="h-4 w-4" /></button>
          <button type="button" aria-label="Mes siguiente" onClick={() => moveMonth(1)} disabled={!shiftGymActivityMonth(month, 1)}><AppIcon name="chevronRight" className="h-4 w-4" /></button>
          <button type="button" onClick={() => selectDate(today)}>Hoy</button>
        </div>
        <table role="grid" aria-label={monthLabel} className="gym-activity-grid">
          <thead><tr>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{weeks.map((week, row) => <tr key={row}>{week.map((date, column) => {
            if (!date) return <td key={`empty-${column}`} aria-hidden="true" />;
            const count = index.byDate.get(date)?.length || 0;
            return <td key={date} role="gridcell" aria-selected={date === selected}>
              <button type="button" data-calendar-date={date} data-trained={count > 0 || undefined} tabIndex={date === selected ? 0 : -1} aria-current={date === today ? 'date' : undefined}
                aria-label={`${fullDate(date)}${date === today ? ', hoy' : ''}${count ? `, ${count} ${count === 1 ? 'sesión completada' : 'sesiones completadas'}` : rest.has(date) ? ', descanso registrado' : ''}`}
                onClick={() => selectDate(date)} onKeyDown={event => {
                  const next = gymActivityKeyboardDate(date, event.key);
                  if (next) { event.preventDefault(); selectDate(next, true); }
                }}>
                <span>{Number(date.slice(-2))}</span>
                {count > 0 && <AppIcon name="dumbbell" className="h-5 w-5" />}
              </button>
            </td>;
          })}</tr>)}</tbody>
        </table>
        <p className="gym-activity-legend"><AppIcon name="dumbbell" className="h-4 w-4" />Entrenamiento realizado</p>
      </div>
      <div className="gym-activity-selection" aria-labelledby={selectedHeadingId}>
        <div aria-live="polite" aria-atomic="true">
          <h3 id={selectedHeadingId}>{fullDate(selected)}</h3>
          {selectedSessions.length > 0 && <p>{selectedSessions.length} {selectedSessions.length === 1 ? 'sesión registrada' : 'sesiones registradas'}</p>}
        </div>
        {selectedSessions.length ? <ul>{selectedSessions.map((session, position) => {
          const time = session.startedAt?.match(/^([01]\d|2[0-3]):[0-5]\d$/)?.[0];
          const count = getCompletedGymSets(session).length;
          return <li key={`${session.id}-${position}`}><button type="button" data-open-calendar-session={session.id} onClick={() => onOpenSession(session.id)}>
            <span><strong>{nameOf(session)}</strong><span>{time ? `${time} · ` : ''}{count} {count === 1 ? 'serie realizada' : 'series realizadas'}</span></span>
            <span className="gym-activity-link">Ver sesión<AppIcon name="chevronRight" className="h-4 w-4" /></span>
          </button></li>;
        })}</ul> : <p className="gym-activity-empty">{rest.has(selected) ? 'Descanso registrado. No suma un día entrenado.' : 'Sin entrenamientos completados en esta fecha.'}</p>}
      </div>
    </div>
    {index.invalidDateCount > 0 && <p className="gym-activity-date-note">{index.invalidDateCount} {index.invalidDateCount === 1 ? 'registro con trabajo no tiene una fecha válida' : 'registros con trabajo no tienen una fecha válida'}. Se conservan sin asignarles un día.</p>}
    {index.futureDateCount > 0 && <p className="gym-activity-date-note">{index.futureDateCount} {index.futureDateCount === 1 ? 'registro finalizado tiene fecha futura y no cuenta' : 'registros finalizados tienen fecha futura y no cuentan'} como asistencia.</p>}
  </section>;
});
