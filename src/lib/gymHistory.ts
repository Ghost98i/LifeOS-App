import type { GymSession } from '../types';
import { todayISO } from './storage';
import { isPerformedGymSession } from './gymMetrics';

export interface GymWeekGroup {
  key: string;
  weekName: string;
  rangeLabel: string;
  sessions: GymSession[];
}

export interface GymMonthArchive {
  key: string;
  label: string;
  sessionsCount: number;
  weeks: GymWeekGroup[];
}

function dateFromISO(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function gymWeekMonday(iso: string): string {
  const date = dateFromISO(iso);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return toISO(date);
}

function shiftDays(iso: string, days: number): string {
  const date = dateFromISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

function shortDate(iso: string): string {
  return dateFromISO(iso).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }).replace('.', '');
}

function weekTitle(monday: string, referenceMonday: string, customLabel?: string): string {
  if (customLabel) return customLabel;
  if (monday === referenceMonday) return 'Semana actual';
  if (monday === shiftDays(referenceMonday, -7)) return 'Semana anterior';
  return `Semana del ${shortDate(monday)}`;
}

export function buildGymHistory(sessions: GymSession[], referenceDate = todayISO()): { recentWeeks: GymWeekGroup[]; archivedMonths: GymMonthArchive[] } {
  const referenceMonday = gymWeekMonday(referenceDate);
  const recentCutoff = shiftDays(referenceMonday, -21);
  const grouped = new Map<string, GymSession[]>();

  sessions.filter(isPerformedGymSession).forEach((session) => {
    if (!session.date || Number.isNaN(dateFromISO(session.date).getTime())) return;
    const monday = gymWeekMonday(session.date);
    grouped.set(monday, [...(grouped.get(monday) || []), session]);
  });

  const weeks = [...grouped.entries()].map(([monday, weekSessions]) => {
    const ordered = [...weekSessions].sort((a, b) => b.date.localeCompare(a.date));
    const customLabel = ordered.find((session) => session.weekLabel?.trim())?.weekLabel?.trim();
    return {
      key: monday,
      weekName: weekTitle(monday, referenceMonday, customLabel),
      rangeLabel: `${shortDate(monday)} – ${shortDate(shiftDays(monday, 6))}`,
      sessions: ordered,
    };
  }).sort((a, b) => b.key.localeCompare(a.key));

  const recentWeeks = weeks.filter((week) => week.key >= recentCutoff);
  const archiveMap = new Map<string, GymWeekGroup[]>();
  weeks.filter((week) => week.key < recentCutoff).forEach((week) => {
    const monthKey = week.key.slice(0, 7);
    archiveMap.set(monthKey, [...(archiveMap.get(monthKey) || []), week]);
  });

  const archivedMonths = [...archiveMap.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, monthWeeks]) => {
    const label = dateFromISO(`${key}-01`).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
    return {
      key,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      sessionsCount: monthWeeks.reduce((sum, week) => sum + week.sessions.length, 0),
      weeks: monthWeeks,
    };
  });

  return { recentWeeks, archivedMonths };
}
