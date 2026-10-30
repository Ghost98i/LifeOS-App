import type { LifeOSState, DayKey } from '../types';
import type { CalendarDisplayItem } from './calculations';
import { routineScheduledFor } from './calculations';
import { DAYS, dayKeyFromDate, isoWeekMonday, todayISO } from './storage';
import { getTodayAgendaCalendarItems } from './todayOverview';
import { isModuleEnabled } from './moduleVisibility';

export interface AgendaDay {
  date: string;
  day: DayKey;
  blocks: LifeOSState['agenda'][DayKey];
  routines: LifeOSState['tasksRecurring'];
  events: CalendarDisplayItem[];
}

export interface AgendaDaySummary {
  kind: 'event' | 'block' | 'routine' | 'empty';
  headline: string;
  counts: string;
}

/** A compact, read-only preview. Counts always describe the full day. */
export function agendaDaySummary(day: AgendaDay): AgendaDaySummary {
  const counts = [
    day.events.length && `${day.events.length} ${day.events.length === 1 ? 'evento' : 'eventos'}`,
    day.blocks.length && `${day.blocks.length} ${day.blocks.length === 1 ? 'actividad' : 'actividades'}`,
    day.routines.length && `${day.routines.length} ${day.routines.length === 1 ? 'rutina' : 'rutinas'}`,
  ].filter(Boolean).join(' · ');

  if (day.events.length > 0) {
    const first = [...day.events].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))[0];
    return { kind: 'event', headline: `${first.time ? `${first.time} · ` : ''}${first.name}`, counts };
  }
  if (day.blocks.length > 0) {
    const first = [...day.blocks].sort((a, b) => a.time.localeCompare(b.time));
    const headline = first.length === 1
      ? `${first[0].time} · ${first[0].activity}`
      : `${first[0].activity} · ${first[1].activity}`;
    return { kind: 'block', headline, counts };
  }
  if (day.routines.length > 0) {
    return { kind: 'routine', headline: 'Sin compromisos programados', counts };
  }
  return { kind: 'empty', headline: 'Sin actividades previstas', counts: '' };
}

export function localDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseLocalDateISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return localDateISO(date) === value ? date : null;
}

export function validatePunctualEvent(name: string, date: string, time: string): string | null {
  if (!name.trim()) return 'Escribí un título.';
  if (name.trim().length > 200) return 'El título no puede superar 200 caracteres.';
  if (!parseLocalDateISO(date)) return 'Elegí una fecha válida.';
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'La hora debe tener formato HH:MM.';
  return null;
}

export function validateWeeklyBlock(activity: string, day: string, time: string): Partial<Record<'activity' | 'day' | 'time', string>> {
  const errors: Partial<Record<'activity' | 'day' | 'time', string>> = {};
  if (!activity.trim()) errors.activity = 'Escribí una actividad.';
  else if (activity.trim().length > 200) errors.activity = 'El nombre no puede superar 200 caracteres.';
  if (!day || !DAYS.includes(day as DayKey)) errors.day = 'Elegí un día válido.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'Elegí una hora válida en formato de 24 horas.';
  return errors;
}

/** An edited weekly activity may intentionally have no scheduled time. */
export function editedWeeklyBlockTime(time: string): string {
  return time.trim();
}

export function weekDates(reference: Date): string[] {
  const monday = isoWeekMonday(reference);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + offset);
    return localDateISO(date);
  });
}

export function shiftWeek(reference: Date, offset: number): Date {
  const date = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
  date.setDate(date.getDate() + offset * 7);
  return date;
}

export function agendaWeek(state: LifeOSState, reference: Date): AgendaDay[] {
  return weekDates(reference).map((date) => {
    const day = dayKeyFromDate(parseLocalDateISO(date)!);
    return {
      date,
      day,
      blocks: isModuleEnabled(state, 'agenda') ? state.agenda?.[day] || [] : [],
      routines: isModuleEnabled(state, 'agenda')
        ? (state.tasksRecurring || []).filter((routine) => {
            // The existing recurrence rule must remain the single source of scheduling.
            return routineScheduledFor(state, routine, date);
          })
        : [],
      events: getTodayAgendaCalendarItems(state, date),
    };
  });
}

export function isCurrentWeek(reference: Date): boolean {
  return weekDates(reference)[0] === weekDates(parseLocalDateISO(todayISO())!)[0];
}
