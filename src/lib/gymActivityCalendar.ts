import type { GymSession } from '../types';
import { isPerformedGymSession } from './gymMetrics';
import { gymWeekMonday } from './gymHistory';

/** Recorded local date only. Never recover a missing day from a clock or UTC. */
export function isGymActivityDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && gymActivityDateKey(date) === value;
}

export function gymActivityDateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftGymActivityDate(value: string, days: number): string | null {
  if (!isGymActivityDate(value) || !Number.isInteger(days)) return null;
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const result = gymActivityDateKey(date);
  return isGymActivityDate(result) ? result : null;
}

export function shiftGymActivityMonth(month: string, offset: number): string | null {
  if (!isGymActivityDate(`${month}-01`) || !Number.isInteger(offset)) return null;
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  const result = gymActivityDateKey(date);
  return isGymActivityDate(result) ? result.slice(0, 7) : null;
}

export function selectGymActivityMonth(month: string, selected: string): string | null {
  if (!isGymActivityDate(`${month}-01`) || !isGymActivityDate(selected)) return null;
  let day = Number(selected.slice(-2));
  while (day > 0) {
    const result = `${month}-${String(day).padStart(2, '0')}`;
    if (isGymActivityDate(result)) return result;
    day--;
  }
  return null;
}

export function buildGymActivityMonth(month: string): (string | null)[][] {
  if (!isGymActivityDate(`${month}-01`)) return [];
  const first = new Date(`${month}-01T12:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= 31; day++) {
    const key = `${month}-${String(day).padStart(2, '0')}`;
    if (!isGymActivityDate(key)) break;
    cells.push(key);
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

/** The same performed-work rule as history; explicit unfinished states never count. */
export function buildGymActivityIndex(sessions: GymSession[], today: string) {
  if (!isGymActivityDate(today)) throw new Error('Fecha local de referencia inválida.');
  const byDate = new Map<string, GymSession[]>();
  let invalidDateCount = 0;
  let futureDateCount = 0;
  for (const session of sessions) {
    if (session.status !== undefined && session.status !== 'completed') continue;
    if (!isPerformedGymSession(session)) continue;
    if (!isGymActivityDate(session.date)) { invalidDateCount++; continue; }
    if (session.date > today) { futureDateCount++; continue; }
    const group = byDate.get(session.date);
    if (group) group.push(session);
    else byDate.set(session.date, [session]);
  }
  for (const group of byDate.values()) group.sort((a, b) =>
    (a.startedAt || a.finishedAt || '').localeCompare(b.startedAt || b.finishedAt || '') || a.id.localeCompare(b.id)
  );
  const monday = gymWeekMonday(today).padStart(10, '0');
  const weekDays = [...byDate.keys()].filter(date => date >= monday && date <= today).length;
  return { byDate, weekDays, monday, invalidDateCount, futureDateCount };
}

export function gymActivityKeyboardDate(date: string, key: string): string | null {
  if (!isGymActivityDate(date)) return null;
  const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[key];
  if (offset !== undefined) return shiftGymActivityDate(date, offset);
  if (key === 'Home') return gymWeekMonday(date).padStart(10, '0');
  if (key === 'End') return shiftGymActivityDate(gymWeekMonday(date).padStart(10, '0'), 6);
  if (key === 'PageUp' || key === 'PageDown') {
    const month = shiftGymActivityMonth(date.slice(0, 7), key === 'PageUp' ? -1 : 1);
    return month ? selectGymActivityMonth(month, date) : null;
  }
  return null;
}
