import type { DailyContextEntry, LifeOSState } from '../types';
import { todayISO } from './storage';

export function upsertDailyContext(state: LifeOSState, entry: DailyContextEntry): void {
  const existing = state.dailyContext.find((item) => item.date === entry.date);
  if (existing) Object.assign(existing, entry);
  else state.dailyContext.push(entry);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function energyValues(entries: DailyContextEntry[]): number[] {
  return entries.flatMap((entry) => entry.energy == null ? [] : [entry.energy]);
}

export interface ContextInsight {
  id: string;
  text: string;
}

export function buildContextInsights(state: LifeOSState): ContextInsight[] {
  const entries = state.dailyContext.filter((entry) => entry.energy != null);
  if (entries.length < 5) return [];
  const insights: ContextInsight[] = [];

  const rested = energyValues(entries.filter((entry) => Number(entry.sleepHours || 0) >= 7));
  const shortSleep = energyValues(entries.filter((entry) => entry.sleepHours != null && Number(entry.sleepHours) < 7));
  if (rested.length >= 2 && shortSleep.length >= 2) {
    const delta = average(rested) - average(shortSleep);
    if (Math.abs(delta) >= 0.5) {
      insights.push({
        id: 'sleep-energy',
        text: delta > 0
          ? `Dormir 7 h o más coincidió con ${delta.toFixed(1)} puntos más de energía.`
          : `Tus días con menos de 7 h coincidieron con ${Math.abs(delta).toFixed(1)} puntos más de energía; seguí registrando para ver si se sostiene.`,
      });
    }
  }

  const connected = energyValues(entries.filter((entry) => entry.connection === 'mensaje' || entry.connection === 'encuentro'));
  const alone = energyValues(entries.filter((entry) => entry.connection === 'solo'));
  if (connected.length >= 2 && alone.length >= 2) {
    const delta = average(connected) - average(alone);
    if (Math.abs(delta) >= 0.5) {
      insights.push({
        id: 'connection-energy',
        text: delta > 0
          ? `El contacto útil con alguien coincidió con ${delta.toFixed(1)} puntos más de energía.`
          : `Los días más solitarios coincidieron con ${Math.abs(delta).toFixed(1)} puntos más de energía; puede ser descanso que te hace bien.`,
      });
    }
  }

  const gymDates = new Set(state.gym.sessions.map((session) => session.date));
  const gymDays = energyValues(entries.filter((entry) => gymDates.has(entry.date)));
  const nonGymDays = energyValues(entries.filter((entry) => !gymDates.has(entry.date)));
  if (gymDays.length >= 2 && nonGymDays.length >= 2) {
    const delta = average(gymDays) - average(nonGymDays);
    if (Math.abs(delta) >= 0.5) insights.push({ id: 'gym-energy', text: `Los días con gimnasio coincidieron con ${Math.abs(delta).toFixed(1)} puntos ${delta > 0 ? 'más' : 'menos'} de energía.` });
  }

  return insights.slice(0, 2);
}

export function todayContext(state: LifeOSState): DailyContextEntry {
  return state.dailyContext.find((entry) => entry.date === todayISO()) || {
    date: todayISO(), sleepHours: null, energy: null, mood: null, connection: null, note: '',
  };
}
