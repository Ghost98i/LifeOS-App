import type { CheckoutLogDay, LifeOSState, Postit } from '../types';
import { fmtDate, uid } from './storage';

export interface DayCheckoutInput {
  date: string;
  trainedSkipped: boolean;
  trainedSkippedTouched: boolean;
  studiedSkipped: boolean;
  expensesSkipped: boolean;
  sleepHours?: number;
  energyLevel?: number;
  dailyNote: string;
  closedAt: string;
}

export type DayCheckoutStatus = 'ready' | 'unchanged' | 'ambiguous-reflection';

const reflectionText = (date: string, note: string) => `[Cierre del ${fmtDate(date)}] ${note}`;

function findReflection(state: LifeOSState, date: string, log: CheckoutLogDay): { note?: Postit; ambiguous: boolean } {
  const previousText = log.dailyNote?.trim();
  if (!previousText) return { ambiguous: false };
  const linked = state.notes.postits.find((note) => note.id === log.reflectionPostitId && note.date === date);
  if (linked) return { note: linked, ambiguous: false };
  const matches = state.notes.postits.filter((note) => note.date === date && note.text === reflectionText(date, previousText));
  return { note: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 };
}

export function inspectDayCheckout(state: LifeOSState, input: DayCheckoutInput): DayCheckoutStatus {
  const previous = state.checkoutLog[input.date] || {};
  const nextNote = input.dailyNote.trim();
  const previousNote = previous.dailyNote?.trim() || '';
  if (nextNote !== previousNote && nextNote && findReflection(state, input.date, previous).ambiguous) {
    return 'ambiguous-reflection';
  }
  if (
    previous.closedAt &&
    (!input.trainedSkippedTouched || input.trainedSkipped === Boolean(previous.trainedSkipped)) &&
    input.studiedSkipped === Boolean(previous.studiedSkipped) &&
    input.expensesSkipped === Boolean(previous.expensesSkipped) &&
    input.sleepHours === previous.sleepHours &&
    input.energyLevel === previous.energyLevel &&
    nextNote === previousNote
  ) return 'unchanged';
  return 'ready';
}

export function applyDayCheckout(
  state: LifeOSState,
  input: DayCheckoutInput,
  createId: () => string = uid,
): DayCheckoutStatus {
  const status = inspectDayCheckout(state, input);
  if (status !== 'ready') return status;

  const previous = state.checkoutLog[input.date] || {};
  const nextNote = input.dailyNote.trim();
  const previousNote = previous.dailyNote?.trim() || '';
  let reflectionPostitId = previous.reflectionPostitId;

  if (nextNote !== previousNote) {
    if (nextNote) {
      const linked = findReflection(state, input.date, previous).note;
      if (linked) {
        linked.text = reflectionText(input.date, nextNote);
        reflectionPostitId = linked.id;
      } else {
        reflectionPostitId = createId();
        state.notes.postits.unshift({ id: reflectionPostitId, text: reflectionText(input.date, nextNote), date: input.date });
      }
    } else {
      // Keep the historical note; clearing the checkout field does not delete Notes data.
      reflectionPostitId = undefined;
    }
  }

  const trainedSkipped = input.trainedSkippedTouched
    ? input.trainedSkipped
    : previous.trainedSkipped ?? Boolean(state.gym.restDays?.includes(input.date));
  state.checkoutLog[input.date] = {
    ...previous,
    trainedSkipped,
    studiedSkipped: input.studiedSkipped,
    expensesSkipped: input.expensesSkipped,
    sleepHours: input.sleepHours,
    energyLevel: input.energyLevel,
    dailyNote: nextNote || undefined,
    reflectionPostitId,
    closedAt: previous.closedAt || input.closedAt,
  };

  if (input.trainedSkippedTouched && !state.gym.sessions.some((session) => session.date === input.date)) {
    if (input.trainedSkipped) {
      if (!state.gym.restDays) state.gym.restDays = [];
      if (!state.gym.restDays.includes(input.date)) state.gym.restDays.push(input.date);
    } else if (state.gym.restDays) {
      state.gym.restDays = state.gym.restDays.filter((date) => date !== input.date);
    }
  }

  return 'ready';
}
