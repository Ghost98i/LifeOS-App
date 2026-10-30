import type { DayKey, RoutineTemplate } from '../types';
import { isGymActivityDate } from './gymActivityCalendar';

export interface GymLauncherChoice { date: string; templateId: string; }

/** Weekly preferences prepare the UI only. No dated session or persisted choice. */
export function getGymLauncherPlan(routines: RoutineTemplate[], date: string, explicitRest: boolean, choice: GymLauncherChoice | null = null) {
  if (!isGymActivityDate(date)) throw new Error('Fecha local de referencia inválida.');
  const days: DayKey[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const day = days[new Date(`${date}T12:00:00`).getDay()];
  const applicable = routines.filter(routine => routine.days?.includes(day));
  const manual = choice?.date === date;
  const unavailableChoice = Boolean(manual && choice.templateId && !routines.some(routine => routine.id === choice.templateId));
  const templateId = manual
    ? unavailableChoice ? null : choice.templateId
    : applicable.length === 1 && !explicitRest ? applicable[0].id
    : applicable.length > 1 || (explicitRest && applicable.length > 0) ? null : '';
  const selected = routines.find(routine => routine.id === templateId) || null;
  return {
    day, applicable, templateId, selected, manual, unavailableChoice,
    explicitRest, conflict: explicitRest && applicable.length > 0,
    canStart: templateId !== null && (!selected || selected.exercises.length > 0),
  };
}
