import type { EffortLevel, LifeOSState, ViewType } from '../types';
import { todayISO, uid, fmtDate, fmtMoney } from './storage';
import { isModuleEnabled } from './moduleVisibility';
import { addQuickTask, addQuickNote, addQuickTransaction, addQuickIdea, addQuickInbox } from './quickCapture';
import { parseQuickFinance, SPANISH_MONTHS, SPANISH_MONTH_NAMES, isValidCalendarDate } from '../utils/quickFinanceParser';

export type DraftKind =
  | 'finance'
  | 'task'
  | 'note'
  | 'idea'
  | 'study'
  | 'work'
  | 'resale'
  | 'agenda'
  | 'inbox';

export interface BaseDraft {
  id: string;
  rawText: string;
  kind: DraftKind;
  targetModule: ViewType;
  isModuleEnabled: boolean;
  missingFields?: ('amount' | 'category' | 'account' | 'title')[];
  ambiguityWarning?: string;
  originalInput?: string;
  note?: string;
  notes?: string;
}

export interface FinanceDraft extends BaseDraft {
  kind: 'finance';
  type: 'gasto' | 'ingreso';
  amount?: number;
  currency?: string;
  isCurrencyIncompatible?: boolean;
  isAccountSuggested?: boolean;
  category?: string;
  categoryMatched?: string;
  accountId?: string;
  accountName?: string;
  date: string;
  dateLabel: string;
  installments?: number;
}

export interface TaskDraft extends BaseDraft {
  kind: 'task';
  text: string;
  priority: 'alta' | 'media' | 'baja';
  dueDate?: string;
  dueDateLabel?: string;
  time?: string;
  effort?: EffortLevel;
}

export interface NoteDraft extends BaseDraft {
  kind: 'note';
  title?: string;
  text: string;
  tags?: string[];
  pinned?: boolean;
}

export interface IdeaDraft extends BaseDraft {
  kind: 'idea';
  text: string;
}

export interface StudyDraft extends BaseDraft {
  kind: 'study';
  subjectName?: string;
  subjectId?: string;
  minutes: number;
  date: string;
  dateLabel?: string;
  note?: string;
}

export interface WorkDraft extends BaseDraft {
  kind: 'work';
  company?: string;
  action: string;
  date: string;
  dateLabel?: string;
}

export interface ResaleDraft extends BaseDraft {
  kind: 'resale';
  type: 'compra' | 'venta';
  title: string;
  price?: number;
  date: string;
  dateLabel?: string;
}

export interface AgendaDraft extends BaseDraft {
  kind: 'agenda';
  activity: string;
  time?: string;
  date: string;
  dateLabel?: string;
}

export interface InboxDraft extends BaseDraft {
  kind: 'inbox';
  text: string;
}

export type CaptureDraft =
  | FinanceDraft
  | TaskDraft
  | NoteDraft
  | IdeaDraft
  | StudyDraft
  | WorkDraft
  | ResaleDraft
  | AgendaDraft
  | InboxDraft;

/* =========================================================================
   DATE UTILITIES FOR QUICK CAPTURE 2.0
   ========================================================================= */

function computeRelativeDate(baseISO: string, offsetDays: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return date.toISOString().slice(0, 10);
}

const DAYS_OF_WEEK: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Calculates upcoming or past day of the week relative to baseISO.
 * For future tasks/events, direction is 'future'.
 * For past financial expenses, direction can be 'past'.
 */
function findDayOfWeek(baseISO: string, targetDayIndex: number, direction: 'future' | 'past' = 'future'): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d));
  const currentDay = baseDate.getUTCDay();

  let diff = targetDayIndex - currentDay;
  if (direction === 'future') {
    if (diff <= 0) diff += 7;
  } else {
    if (diff > 0) diff -= 7;
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + diff);
  return baseDate.toISOString().slice(0, 10);
}

export interface ParsedDateResult {
  date?: string;
  dateLabel: string;
  cleanedText: string;
  hasExplicitDate?: boolean;
  ambiguityWarning?: string;
}

/**
 * Normalizes and extracts relative or explicit date mentions from text.
 * Returns the resolved ISO date, friendly label, and text with date expression removed.
 *
 * Year policy:
 * - When explicit year is given (e.g. "25 de octubre de 2026"), that exact year is used.
 * - When only day + month is given (e.g. "25 de octubre"):
 *   LifeOS defaults to the reference date's calendar year.
 * - Calendar validity is strictly validated (e.g. "31 de febrero" is rejected with ambiguityWarning).
 */
export function extractRelativeDate(
  rawText: string,
  referenceDate = todayISO(),
  defaultDirection: 'future' | 'past' = 'future'
): ParsedDateResult {
  const today = referenceDate;
  const [refYearStr] = today.split('-');
  const refYear = parseInt(refYearStr, 10) || new Date().getFullYear();
  let cleaned = rawText;
  let resolvedDate: string | undefined = today;
  let resolvedLabel = 'Hoy';

  // 1. Explicit calendar date: "el 25 de octubre de 2026", "25 de octubre", "el 5 de mayo"
  const explicitMonthRegex = /\b(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+(?:de\s+|del\s+)?(\d{4}))?\b/i;
  const monthMatch = cleaned.match(explicitMonthRegex);
  if (monthMatch) {
    const rawDay = parseInt(monthMatch[1], 10);
    const rawMonthStr = monthMatch[2].toLowerCase();
    const hasExplicitYear = Boolean(monthMatch[3]);

    if (rawMonthStr in SPANISH_MONTHS) {
      const monthNum = SPANISH_MONTHS[rawMonthStr];

      // Year resolution policy:
      // - Explicit year: authoritatively respected.
      // - No year:
      //   Evaluate day/month in reference year (refYear).
      //   If candidate date is today or in the future (>= today): resolves naturally to refYear.
      //   If candidate date is strictly in the past (< today):
      //     * If context indicates past action/log/history (defaultDirection === 'past' or past indicators in text):
      //       resolves to refYear (past date of the current year, e.g. "gasté el 15 de mayo").
      //     * If context indicates a future obligation/task/payment (e.g. "pagar el 25 de septiembre", "examen el 10 de marzo", "estudiar..."):
      //       DO NOT roll over silently to next year. Flag ambiguity for review so the user explicitly confirms whether
      //       it is an overdue obligation or a commitment for next year.
      const targetYear = hasExplicitYear ? parseInt(monthMatch[3]!, 10) : refYear;

      if (!isValidCalendarDate(targetYear, monthNum, rawDay)) {
        // Detected temporal expression is calendar-invalid (e.g. "31 de febrero")
        // NEVER fall back silently to 'Hoy'. Flag uncertainty, require user review, block auto-confirmation.
        cleaned = cleaned.replace(monthMatch[0], ' ');
        return {
          date: undefined,
          dateLabel: 'Fecha inválida a revisar',
          cleanedText: cleanPunctuation(cleaned),
          hasExplicitDate: true,
          ambiguityWarning: `Fecha inválida en el calendario: "${monthMatch[0]}". Por favor revisá o editá la fecha antes de confirmar.`,
        };
      }

      const isoDateCandidate = `${targetYear}-${String(monthNum).padStart(2, '0')}-${String(rawDay).padStart(2, '0')}`;
      const monthNameRaw = SPANISH_MONTH_NAMES[monthNum] || rawMonthStr;
      const monthNameCap = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1).toLowerCase();

      // Check for past date without explicit year in a future-intent context
      if (!hasExplicitYear && isoDateCandidate < today && defaultDirection === 'future') {
        const isClearlyPastContext = /\b(?:hice|fui|pas[oó]|venci[oó]|era|ayer|anteayer|pasad[oa])\b/i.test(cleaned);
        if (!isClearlyPastContext) {
          cleaned = cleaned.replace(monthMatch[0], ' ');
          return {
            date: isoDateCandidate,
            dateLabel: `${rawDay} de ${monthNameCap} (${targetYear}) · Pasada`,
            cleanedText: cleanPunctuation(cleaned),
            hasExplicitDate: true,
            ambiguityWarning: `La fecha "${rawDay} de ${monthNameCap}" ya pasó en ${targetYear}. Confirmá si corresponde a una obligación vencida o especificá el año.`,
          };
        }
      }

      resolvedDate = isoDateCandidate;
      resolvedLabel = `${rawDay} de ${monthNameCap}`;
      cleaned = cleaned.replace(monthMatch[0], ' ');
      return {
        date: resolvedDate,
        dateLabel: resolvedLabel,
        cleanedText: cleanPunctuation(cleaned),
        hasExplicitDate: true,
      };
    }
  }

  // 2. Explicit numeric date: "25/10/2026", "25/10", "25-10"
  const numericDateRegex = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/;
  const numMatch = cleaned.match(numericDateRegex);
  if (numMatch) {
    const rawDay = parseInt(numMatch[1], 10);
    const rawMonth = parseInt(numMatch[2], 10);
    const hasExplicitYear = Boolean(numMatch[3]);
    let targetYear = refYear;
    if (numMatch[3]) {
      const parsedY = parseInt(numMatch[3], 10);
      targetYear = parsedY < 100 ? 2000 + parsedY : parsedY;
    }

    if (rawMonth >= 1 && rawMonth <= 12) {
      if (!isValidCalendarDate(targetYear, rawMonth, rawDay)) {
        cleaned = cleaned.replace(numMatch[0], ' ');
        return {
          date: undefined,
          dateLabel: 'Fecha inválida a revisar',
          cleanedText: cleanPunctuation(cleaned),
          hasExplicitDate: true,
          ambiguityWarning: `Fecha inválida en el calendario: "${numMatch[0]}". Por favor revisá o editá la fecha antes de confirmar.`,
        };
      }

      const isoDateCandidate = `${targetYear}-${String(rawMonth).padStart(2, '0')}-${String(rawDay).padStart(2, '0')}`;
      const monthNameRaw = SPANISH_MONTH_NAMES[rawMonth] || String(rawMonth);
      const monthNameCap = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1).toLowerCase();

      if (!hasExplicitYear && isoDateCandidate < today && defaultDirection === 'future') {
        const isClearlyPastContext = /\b(?:hice|fui|pas[oó]|venci[oó]|era|ayer|anteayer|pasad[oa])\b/i.test(cleaned);
        if (!isClearlyPastContext) {
          cleaned = cleaned.replace(numMatch[0], ' ');
          return {
            date: isoDateCandidate,
            dateLabel: `${rawDay} de ${monthNameCap} (${targetYear}) · Pasada`,
            cleanedText: cleanPunctuation(cleaned),
            hasExplicitDate: true,
            ambiguityWarning: `La fecha "${numMatch[0]}" ya pasó en ${targetYear}. Confirmá si corresponde a una obligación vencida o especificá el año.`,
          };
        }
      }

      resolvedDate = isoDateCandidate;
      resolvedLabel = `${rawDay} de ${monthNameCap}`;
      cleaned = cleaned.replace(numMatch[0], ' ');
      return {
        date: resolvedDate,
        dateLabel: resolvedLabel,
        cleanedText: cleanPunctuation(cleaned),
        hasExplicitDate: true,
      };
    }
  }

  // 3. Ambiguous temporal range expressions (e.g. "el 15 o 16 de octubre", "fin de semana")
  const ambiguousRangeMatch = cleaned.match(/\b(?:el\s+)?(\d{1,2})\s+(?:o|a|al)\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\b/i);
  if (ambiguousRangeMatch) {
    cleaned = cleaned.replace(ambiguousRangeMatch[0], ' ');
    return {
      date: undefined,
      dateLabel: 'Fecha ambigua a definir',
      cleanedText: cleanPunctuation(cleaned),
      hasExplicitDate: true,
      ambiguityWarning: `Expresión temporal ambigua ("${ambiguousRangeMatch[0]}"). Elegí una fecha exacta antes de confirmar.`,
    };
  }

  // 4. "pasado mañana"
  if (/\bpasado\s+ma[nñ]ana\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, 2);
    resolvedLabel = `Pasado mañana · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bpasado\s+ma[nñ]ana\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 5. "anteayer" / "ante ayer"
  if (/\b(?:anteayer|ante\s+ayer)\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, -2);
    resolvedLabel = `Anteayer · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\b(?:anteayer|ante\s+ayer)\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 6. "ayer"
  if (/\bayer\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, -1);
    resolvedLabel = `Ayer · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bayer\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 7. "mañana" (avoid matching "de la mañana" time modifier)
  if (/\bma[nñ]ana\b/i.test(cleaned) && !/\bde\s+la\s+ma[nñ]ana\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, 1);
    resolvedLabel = `Mañana · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bma[nñ]ana\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 8. "dentro de N días" or "en N días"
  const inNDaysMatch = cleaned.match(/\b(?:dentro\s+de|en)\s+(\d+)\s+d[ií]as?\b/i);
  if (inNDaysMatch) {
    const daysOffset = parseInt(inNDaysMatch[1], 10);
    if (!isNaN(daysOffset)) {
      resolvedDate = computeRelativeDate(today, daysOffset);
      resolvedLabel = `En ${daysOffset} días · ${fmtDate(resolvedDate)}`;
      cleaned = cleaned.replace(inNDaysMatch[0], ' ');
      return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
    }
  }

  // 9. "la semana que viene" / "la próxima semana"
  if (/\bla\s+(?:semana\s+que\s+viene|pr[oó]xima\s+semana)\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, 7);
    resolvedLabel = `Semana próxima · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bla\s+(?:semana\s+que\s+viene|pr[oó]xima\s+semana)\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 10. Days of week: "el lunes", "este viernes", "martes", etc.
  for (const [dayName, dayIndex] of Object.entries(DAYS_OF_WEEK)) {
    const dayRegex = new RegExp(`\\b(?:el\\s+|este\\s+|pr[oó]ximo\\s+)?${dayName}\\b`, 'i');
    const dayMatch = cleaned.match(dayRegex);
    if (dayMatch) {
      resolvedDate = findDayOfWeek(today, dayIndex, defaultDirection);
      resolvedLabel = `${DAY_NAMES_ES[dayIndex]} · ${fmtDate(resolvedDate)}`;
      cleaned = cleaned.replace(dayMatch[0], ' ');
      return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
    }
  }

  // 11. "hoy"
  if (/\bhoy\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\bhoy\b/gi, ' ');
    return { date: today, dateLabel: 'Hoy', cleanedText: cleanPunctuation(cleaned) };
  }

  return { date: today, dateLabel: 'Hoy', cleanedText: cleanPunctuation(cleaned) };
}

function cleanPunctuation(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[,;.\-\s]+|[,;.\-\s]+$/g, '')
    .trim();
}

/* =========================================================================
   CLAUSE SEGMENTATION (MULTI-INTENT DETECTION)
   ========================================================================= */

/**
 * Splits a composite input into distinct intent clauses if genuine evidence exists.
 * E.g.: "mañana estudiar redes y pagar 1200 de internet" -> ["mañana estudiar redes", "pagar 1200 de internet"]
 * Does NOT split non-intent conjunctions like "comprar pan y leche" or "vianda y agua".
 */
export function segmentCompoundClauses(rawInput: string): string[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  // If explicit newlines or semicolons exist, split on them first
  if (/[\n;]/.test(trimmed)) {
    return trimmed
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // If input has an explicit single intent prefix (e.g. "nota:", "inbox:", "idea:"),
  // treat the entire content as a single clause so internal conjunctions ("y comprar...") are preserved.
  if (/^(?:nota|note|pensar|inbox|idea|ideas):\s*/i.test(trimmed)) {
    return [trimmed];
  }

  // Heuristic regex to check for sentence connectors:
  // 1. Explicit clause sequence connectors: " y después ...", " y luego ...", ", y después ..."
  // 2. Intent connectors: " y ", " e ", ", y " where the second clause starts with a recognizable
  //    intent verb, date, or explicit money token ($ or number with currency).
  // Does NOT split on simple noun conjunctions like " y 2 leches" or "comprar pan y leche".
  const connectorRegex =
    /\s+(?:y\s+(?:luego|despu[eé]s)\b|e\s+(?:luego|despu[eé]s)\b|,\s*y\s+(?:luego|despu[eé]s)\b|,\s*e\s+(?:luego|despu[eé]s)\b|(?:y|e|,\s*y|,\s*e)\s+(?=(?:ma[nñ]ana|hoy|ayer|el\s+[a-z]+|pagu[eé]|pagar|gast[eé]|gastar|compr[eé]|comprar|vend[eé]|vender|estudiar|repasar|llamar|revisar|recordar|hacer|anotar|nota|idea|inbox|\$(?:U)?\s*\d+|\d+\s*(?:pesos|d[oó]lares|usd|eur|uyu))\b))/i;

  if (connectorRegex.test(trimmed)) {
    const parts = trimmed.split(connectorRegex);
    const validParts = parts.map((p) => p.trim()).filter((p) => p.length > 0);
    if (validParts.length > 1) {
      return validParts;
    }
  }

  return [trimmed];
}

/* =========================================================================
   PARSER ENGINE (INPUT -> INTENT -> DRAFTS)
   ========================================================================= */

export function parseCaptureDrafts(
  rawInput: string,
  state: LifeOSState,
  options?: { defaultDate?: string }
): CaptureDraft[] {
  const segments = segmentCompoundClauses(rawInput);
  if (segments.length === 0) return [];

  const referenceDate = options?.defaultDate || todayISO();
  const drafts: CaptureDraft[] = [];

  for (const segment of segments) {
    const draft = parseSingleClauseDraft(segment, state, referenceDate);
    if (draft) {
      draft.originalInput = rawInput;
      drafts.push(draft);
    }
  }

  return drafts;
}

function parseSingleClauseDraft(
  clause: string,
  state: LifeOSState,
  referenceDate: string
): CaptureDraft {
  const trimmed = clause.trim();
  const draftId = uid();

  // 1. Explicit Prefixes
  // 1a. Inbox: "inbox: ..."
  if (/^inbox:\s*/i.test(trimmed)) {
    const text = trimmed.replace(/^inbox:\s*/i, '').trim();
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'inbox',
      targetModule: 'dashboard',
      isModuleEnabled: true,
      text,
    };
  }

  // 1b. Ideas: "idea: ...", "ideas: ...", "idea para ...", "me gustaría algún día ..."
  if (/^ideas?:\s*/i.test(trimmed) || /^me\s+gustar[ií]a\s+alg[uú]n\s+d[ií]a\b/i.test(trimmed)) {
    const text = trimmed.replace(/^ideas?:\s*/i, '').trim();
    const enabled = isModuleEnabled(state, 'ia');
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'idea',
      targetModule: 'ia',
      isModuleEnabled: enabled,
      text,
    };
  }

  // 1c. Notes: "nota: ...", "note: ...", "pensar: ..."
  if (/^(?:nota|note|pensar):\s*/i.test(trimmed)) {
    const text = trimmed.replace(/^(?:nota|note|pensar):\s*/i, '').trim();
    const enabled = isModuleEnabled(state, 'notas');
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'note',
      targetModule: 'notas',
      isModuleEnabled: enabled,
      text,
    };
  }

  // 2. Resale: "vendí monitor por 4500", "vendo ...", "compré para revender ..."
  const resaleSellMatch = trimmed.match(/^vend[ií]\s+(.+?)(?:\s+(?:por|a)\s+([0-9.,]+|\$[0-9.,]+))?$/i);
  if (resaleSellMatch) {
    const itemTitle = resaleSellMatch[1].trim();
    const rawPrice = resaleSellMatch[2]?.replace(/[$.]/g, '').replace(',', '.');
    const price = rawPrice ? parseFloat(rawPrice) : undefined;
    const enabled = isModuleEnabled(state, 'reventa');
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'resale',
      type: 'venta',
      title: itemTitle,
      price: !isNaN(price!) ? price : undefined,
      targetModule: 'reventa',
      isModuleEnabled: enabled,
      date: referenceDate,
      dateLabel: 'Hoy',
    };
  }

  // 3. Gym with schedule or time: "mañana gym 13:30", "gym 18:00", "hoy gym 14:00"
  // Must be captured as core TaskDraft with time and priority 'media' (works with Agenda OFF, no Agenda event)
  const timeMatch = trimmed.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (timeMatch && /\bgym\b/i.test(trimmed)) {
    const time = timeMatch[0];
    const dateExtraction = extractRelativeDate(trimmed.replace(time, ' '), referenceDate, 'future');
    let taskText = cleanPunctuation(dateExtraction.cleanedText);
    taskText = taskText.replace(/^(?:recordar|tengo\s+que|hacer)\s+/i, '');

    return {
      id: draftId,
      rawText: trimmed,
      kind: 'task',
      text: taskText || 'Gym',
      time,
      priority: 'media',
      dueDate: dateExtraction.date,
      dueDateLabel: dateExtraction.dateLabel,
      targetModule: 'dashboard',
      isModuleEnabled: true,
    };
  }

  // 4. Study Tasks vs Sessions:
  // "estudiar redes mañana", "mañana estudiar redes", "tengo que estudiar para redes el jueves", "estudiar redes el 25 de octubre"
  // Future intentions are TASKS (medium priority), NOT past study logs, do NOT invent 45 mins, do NOT create subjects.
  const isStudyVerb = /\b(?:estudiar|repasar)\b/i.test(trimmed);
  const dateExtractionStudy = extractRelativeDate(trimmed, referenceDate, 'future');
  const hasFutureDateMention = /\b(?:ma[nñ]ana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|pr[oó]xim[oa]|semana\s+que\s+viene|en\s+\d+\s+d[ií]as)\b/i.test(trimmed) || Boolean(dateExtractionStudy.hasExplicitDate);

  if (isStudyVerb && (hasFutureDateMention || dateExtractionStudy.hasExplicitDate)) {
    let taskText = cleanPunctuation(dateExtractionStudy.cleanedText);
    taskText = taskText.replace(/^(?:recordar|tengo\s+que|hacer)\s+/i, '');

    const targetModule: ViewType = isModuleEnabled(state, 'estudios') ? 'estudios' : 'dashboard';

    return {
      id: draftId,
      rawText: trimmed,
      kind: 'task',
      text: taskText || trimmed,
      priority: 'media',
      dueDate: dateExtractionStudy.date,
      dueDateLabel: dateExtractionStudy.dateLabel,
      ambiguityWarning: dateExtractionStudy.ambiguityWarning,
      targetModule,
      isModuleEnabled: true,
    };
  }

  // Study log/session with explicit duration (e.g. "estudiar redes 2 horas", "estudiar 45 min de redes")
  const studyMatch = trimmed.match(/^(?:tengo\s+que\s+estudiar(?:\s+para)?|estudiar)\s+(.+)$/i);
  if (studyMatch) {
    const rest = studyMatch[1].trim();
    const dateExtraction = extractRelativeDate(rest, referenceDate, 'future');

    // Extract minutes / hours if explicitly specified
    let minutes: number | undefined;
    let subjectText = dateExtraction.cleanedText;

    const hourMatch = subjectText.match(/(\d+(?:\.\d+)?)\s*(?:horas?|hs?\b|h\b)/i);
    const minMatch = subjectText.match(/(\d+)\s*(?:minutos?|mins?\b|m\b)/i);
    if (hourMatch) {
      minutes = Math.round(parseFloat(hourMatch[1]) * 60);
      subjectText = subjectText.replace(hourMatch[0], ' ');
    } else if (minMatch) {
      minutes = parseInt(minMatch[1], 10);
      subjectText = subjectText.replace(minMatch[0], ' ');
    }

    if (minutes !== undefined) {
      subjectText = cleanPunctuation(subjectText.replace(/\b(?:durante|por|para|de)\b/gi, ' '));
      const matchedSubject = (state.study?.subjects || []).find(
        (s) => s.name.toLowerCase().includes(subjectText.toLowerCase()) || subjectText.toLowerCase().includes(s.name.toLowerCase())
      );
      const enabled = isModuleEnabled(state, 'estudios');
      return {
        id: draftId,
        rawText: trimmed,
        kind: 'study',
        subjectName: matchedSubject?.name || subjectText || 'General',
        subjectId: matchedSubject?.id,
        minutes,
        date: dateExtraction.date,
        dateLabel: dateExtraction.dateLabel,
        note: `Sesión de ${minutes} min de ${subjectText}`,
        targetModule: 'estudios',
        isModuleEnabled: enabled,
      };
    } else {
      // No duration provided -> It's a task!
      let taskText = cleanPunctuation(subjectText);
      taskText = taskText.replace(/^(?:recordar|tengo\s+que|hacer)\s+/i, '');
      return {
        id: draftId,
        rawText: trimmed,
        kind: 'task',
        text: taskText ? `Estudiar ${taskText}` : trimmed,
        priority: 'media',
        dueDate: dateExtraction.date,
        dueDateLabel: dateExtraction.dateLabel,
        ambiguityWarning: dateExtraction.ambiguityWarning,
        targetModule: 'dashboard',
        isModuleEnabled: true,
      };
    }
  }

  // 5. Future payments and debts/obligations as Tasks:
  // e.g. "Debo 5939 pesos a Jorge pagar el 25 de septiembre", "pagar 1200 internet mañana", "tengo que pagar la luz"
  // Semantics: These are pending commitments/obligations, NOT completed transactions.
  // They must NOT mutate account balances or create immediate financial records.
  const isDebtOrObligation = /\b(?:debo|le\s+debo|deuda|deudas|por\s+pagar|tengo\s+que\s+pagar|hay\s+que\s+pagar)\b/i.test(trimmed);
  const hasFuturePayment = /^(?:pagar|pago\s+de)\s+/i.test(trimmed) || (/\bpagar\b/i.test(trimmed) && (hasFutureDateMention || dateExtractionStudy.hasExplicitDate));

  if (isDebtOrObligation || (hasFuturePayment && (hasFutureDateMention || dateExtractionStudy.hasExplicitDate))) {
    const dateExtraction = extractRelativeDate(trimmed, referenceDate, 'future');
    let taskText = cleanPunctuation(dateExtraction.cleanedText);
    taskText = taskText.replace(/^(?:recordar|tengo\s+que|hacer)\s+/i, '');
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'task',
      text: taskText || trimmed,
      priority: 'media',
      dueDate: dateExtraction.date,
      dueDateLabel: dateExtraction.dateLabel,
      ambiguityWarning: dateExtraction.ambiguityWarning,
      targetModule: 'dashboard',
      isModuleEnabled: true,
    };
  }

  // 6. Financial Parsing (Strict & Nuanced)
  // Check for currency symbols, keywords, or missing amounts ("pagué internet")
  const hasCurrencySign = /(?:\$|\$U\b|USD\b|EUR\b|UYU\b|pesos\b|d[oó]lares\b|euros?\b)/i.test(trimmed);
  const hasPastTransactionalDeclaration = /^(?:gast[eé]|pagu[eé]|cobr[eé]|compr[eé]|pago\s+de|gasto\s+en)(?:\s+|$)/i.test(trimmed);
  const hasTransactionalVerb = /(?:^|\s)(?:gast[eé]|gasto|gastar|pagu[eé]|pago|pagar|compr[eé]|compra|comprar|cost[oó]|cobro|cobr[eé]|cobrar|ingreso|sueldo|salario)(?:\s|$)/i.test(trimmed);
  const startsWithPlusOrMinusNum = /^(?:\+|-)\s*\d+/i.test(trimmed);
  const startsWithAmount = /^[+-]?\$?\d+(?:[.,]\d+)?\s+[a-záéíóúñ]/i.test(trimmed);
  const isMeasurementUnit = /^[+-]?\$?\d+(?:[.,]\d+)?\s*(?:horas?|hs?\b|h\b|minutos?|mins?\b|m\b|segundos?|segs?\b|d[ií]as?|km|kms?|kilos?|kg|reps?|series?|materias?|veces)\b/i.test(trimmed);

  // Check if any word matches an active category in user's state.finance.categories
  const words = trimmed.toLowerCase().split(/\s+/);
  const matchesUserCategory = (state.finance?.categories || []).some((c) => {
    const cName = typeof c === 'string' ? c : c.name;
    const cActive = typeof c === 'string' ? true : c.active !== false;
    return cActive && words.some((w) => w === cName.toLowerCase() || (cName.toLowerCase().includes(w) && w.length >= 4));
  });

  const matchesUserAccount = (state.finance?.accounts || []).some((a) =>
    words.some((w) => w === a.name.toLowerCase() || (a.name.toLowerCase().includes(w) && w.length >= 4))
  );

  // Check missing amount case: ONLY on past transactional verb ("pagué internet", "gasté en comida") and not general tasks like "comprar comida"
  if (hasPastTransactionalDeclaration && !/\d+/.test(trimmed)) {
    const dateExtraction = extractRelativeDate(trimmed, referenceDate, 'past');
    const enabled = isModuleEnabled(state, 'finanzas');

    const cleanRemaining = dateExtraction.cleanedText.replace(/(?:^|\s)(?:gast[eé]|gasto|pagu[eé]|pago|compr[eé]|compra|en|de)(?:\s|$)/gi, ' ').trim();

    const matchedCat = (state.finance?.categories || []).find((c) => {
      const cName = typeof c === 'string' ? c : c.name;
      const cActive = typeof c === 'string' ? true : c.active !== false;
      return cActive && (cName.toLowerCase().includes(cleanRemaining.toLowerCase()) || cleanRemaining.toLowerCase().includes(cName.toLowerCase()));
    });

    const categoryName = typeof matchedCat === 'string' ? matchedCat : matchedCat?.name;
    const categoryId = typeof matchedCat === 'string' ? matchedCat : matchedCat?.id;

    return {
      id: draftId,
      rawText: trimmed,
      kind: 'finance',
      type: 'gasto',
      amount: undefined,
      category: categoryId,
      categoryMatched: categoryName || cleanRemaining || 'Sin especificar',
      date: dateExtraction.date,
      dateLabel: dateExtraction.dateLabel,
      missingFields: ['amount'],
      targetModule: 'finanzas',
      isModuleEnabled: enabled,
    };
  }

  // Standard Finance check
  const isFinanceCandidate =
    (hasCurrencySign ||
      hasTransactionalVerb ||
      startsWithPlusOrMinusNum ||
      (startsWithAmount && !isMeasurementUnit) ||
      matchesUserCategory ||
      matchesUserAccount) &&
    !isMeasurementUnit;

  if (isFinanceCandidate) {
    const isVetoedByMeasurement =
      !hasCurrencySign &&
      !hasTransactionalVerb &&
      /\b\d+(?:\.\d+)?\s*(?:horas?|hs?\b|h\b|minutos?|mins?\b|segundos?|d[ií]as?|km|kms?|kilos?|kg|reps?|series?)\b/i.test(trimmed);

    if (!isVetoedByMeasurement) {
      let installments: number | undefined;
      const cuotasMatch = trimmed.match(/(\d+)\s+cuotas?\b/i);
      if (cuotasMatch) {
        installments = parseInt(cuotasMatch[1], 10);
      }

      let financeCandidate = trimmed;
      if (/^(?:gast[eé]|pagu[eé]|compr[eé]|pagar)\s+/i.test(trimmed)) {
        financeCandidate = trimmed.replace(/^(?:gast[eé]|pagu[eé]|compr[eé]|pagar)\s+/i, '');
      }

      const parsed = parseQuickFinance(financeCandidate, {
        accounts: state.finance?.accounts || [],
        categories: state.finance?.categories || [],
        defaultDate: referenceDate,
      });

      // Currency check from parsed result
      const parsedCurrency = parsed.currency || 'UYU';
      const isCurrencyIncompatible = parsed.isCurrencyIncompatible || parsedCurrency !== 'UYU';

      // If valid or if amount/currency detected
      if (parsed.amount !== null || isCurrencyIncompatible || parsed.isAmbiguous) {
        // Contextual Guard for Ambiguity:
        // If there is NO currency sign, NO transactional verb, NO matching user category/account,
        // and the input is merely a name/word followed by a number (e.g. "Juan 1600"),
        // do NOT assume it is a financial expense. Let it fall through to Inbox/free capture.
        const hasStrongFinanceEvidence =
          hasCurrencySign ||
          hasTransactionalVerb ||
          startsWithPlusOrMinusNum ||
          matchesUserCategory ||
          matchesUserAccount ||
          Boolean(parsed.category) ||
          Boolean(installments) ||
          isCurrencyIncompatible;

        if (!hasStrongFinanceEvidence) {
          // Fall through to other intents or Inbox
          // return not taken
        } else {
          const enabled = isModuleEnabled(state, 'finanzas');
          const missingFields: ('amount' | 'category' | 'account' | 'title')[] = [];
          if (!parsed.amount || parsed.isAmbiguous) missingFields.push('amount');
          if (!parsed.category) missingFields.push('category');

          let ambiguityWarning: string | undefined;
          if (isCurrencyIncompatible) {
            ambiguityWarning = `Moneda no soportada (${parsedCurrency}). LifeOS opera únicamente en moneda local. Podés guardarlo en tu Bandeja de Entrada.`;
          } else if (parsed.isAmbiguous) {
            ambiguityWarning = 'Importe con formato de separadores ambiguo. Revisá el valor antes de confirmar.';
          }

          return {
            id: draftId,
            rawText: trimmed,
            kind: 'finance',
            type: parsed.type,
            amount: parsed.amount || undefined,
            currency: parsedCurrency,
            isCurrencyIncompatible,
            isAccountSuggested: parsed.isAccountSuggested,
            category: parsed.category || undefined,
            categoryMatched: parsed.categoryMatched || undefined,
            accountId: parsed.accountId || undefined,
            accountName: parsed.accountName || undefined,
            date: parsed.date,
            dateLabel: parsed.dateLabel,
            note: parsed.note || trimmed,
            installments,
            missingFields: missingFields.length > 0 ? missingFields : undefined,
            ambiguityWarning,
            targetModule: 'finanzas',
            isModuleEnabled: enabled,
          };
        }
      }
    }
  }

  // 7. Unstructured Reflective Notes and Non-actionable Facts:
  // "hoy fue un día horrible", "ayer pensé que...", "hoy me siento cansado", "me siento cansado",
  // "Juan está pensando mudarse", "el auto hizo un ruido raro"
  const isReflectiveOrFactual =
    /^(?:hoy\s+(?:fue\s+un\s+d[ií]a|me\s+siento)|ayer\s+pens[eé]|estoy\s+pensando\s+en|me\s+di\s+cuenta\s+que|me\s+siento\s+|el\s+auto\s+hizo|pensando\s+(?:en\s+)?mudarse|est[aá]\s+pensando\b)/i.test(trimmed) ||
    /(?:est[aá]\s+pensando|pensando\s+(?:en\s+)?mudarse|hizo\s+un\s+ruido\s+raro|me\s+siento\s+(?:cansado|agotado|bien|mal|triste|feliz|motivado))/i.test(trimmed);

  if (isReflectiveOrFactual) {
    const isNotasEnabled = isModuleEnabled(state, 'notas');
    if (isNotasEnabled) {
      return {
        id: draftId,
        rawText: trimmed,
        kind: 'note',
        targetModule: 'notas',
        isModuleEnabled: true,
        text: trimmed,
      };
    }
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'inbox',
      targetModule: 'dashboard',
      isModuleEnabled: true,
      text: trimmed,
    };
  }

  // 8. Agenda / Event pattern: "reunión a las 15:00", "clase a las 18:30" (gym with time is already handled above)
  if (timeMatch && (/\breuni[oó]n\b/i.test(trimmed) || /\bclase\b/i.test(trimmed) || /\bllamada\b/i.test(trimmed))) {
    const time = timeMatch[0];
    const dateExtraction = extractRelativeDate(trimmed.replace(time, ' '), referenceDate, 'future');
    const activity = cleanPunctuation(dateExtraction.cleanedText);
    const enabled = isModuleEnabled(state, 'agenda');

    return {
      id: draftId,
      rawText: trimmed,
      kind: 'agenda',
      activity: activity || 'Actividad programada',
      time,
      date: dateExtraction.date,
      dateLabel: dateExtraction.dateLabel,
      targetModule: 'agenda',
      isModuleEnabled: enabled,
    };
  }

  // 9. Fact, measurement or non-actionable statement fallback vs genuine actionable Task
  const dateExtraction = extractRelativeDate(trimmed, referenceDate, 'future');
  let taskText = dateExtraction.cleanedText;

  let priority: 'alta' | 'media' | 'baja' = 'media';
  let hasExplicitPriority = false;
  if (/^(?:urgente|importante|ya|hoy\s+mismo)[:\s]*/i.test(taskText)) {
    priority = 'alta';
    hasExplicitPriority = true;
    taskText = taskText.replace(/^(?:urgente|importante|ya|hoy\s+mismo)[:\s]*/i, '').trim();
  } else if (/^(?:baja\s+prioridad|cuando\s+pueda)[:\s]*/i.test(taskText)) {
    priority = 'baja';
    hasExplicitPriority = true;
    taskText = taskText.replace(/^(?:baja\s+prioridad|cuando\s+pueda)[:\s]*/i, '').trim();
  }

  // Clean common task prefixes
  const hasTaskPrefix = /^(?:recordar|tengo\s+que|hacer)\s+/i.test(taskText);
  taskText = taskText.replace(/^(?:recordar|tengo\s+que|hacer)\s+/i, '');

  // Actionable evidence detection:
  // A TaskDraft represents an understanding that a pending action exists.
  // We require reasonable evidence of actionable intent:
  // - explicit priority prefix (e.g. "urgente:", "importante:")
  // - imperative or task prefix (e.g. "recordar ...", "tengo que ...", "hacer ...")
  // - recognized actionable verb or commitment noun (e.g. comprar, llamar, estudiar, revisar, mandar, enviar, reunión, etc.)
  const ACTIONABLE_KEYWORDS =
    /\b(?:llamar|llamada|comprar|compra|pagar|pago|estudiar|estudio|repasar|repaso|revisar|revisi[oó]n|enviar|env[ií]o|mandar|pedir|pedido|escribir|buscar|terminar|arreglar|reparar|limpiar|limpieza|ir|llevar|traer|preparar|entrenar|entrenamiento|correr|cocinar|hablar|ver|visitar|visita|comer|cenar|almorzar|salir|entregar|entrega|firmar|firma|leer|lectura|hacer|examen|parcial|final|turno|m[eé]dico|dentista|veterinario|reuni[oó]n|clase|cita|viaje|vuelo|tr[aá]mite)\b/i;

  const hasActionKeyword = ACTIONABLE_KEYWORDS.test(taskText) || ACTIONABLE_KEYWORDS.test(trimmed);

  const isActionableIntent = hasExplicitPriority || hasTaskPrefix || hasActionKeyword;

  // If there is NO actionable evidence, do NOT invent a task! Fallback safely to Inbox.
  if (!isActionableIntent) {
    const isTemporalMention = Boolean(dateExtraction.hasExplicitDate) || /\b(?:ma[nñ]ana|hoy|ayer|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(trimmed);
    const ambiguityWarning = isTemporalMention
      ? 'Mención temporal sin acción definida. Podés revisarla en tu Bandeja de Entrada.'
      : undefined;

    return {
      id: draftId,
      rawText: trimmed,
      kind: 'inbox',
      targetModule: 'dashboard',
      isModuleEnabled: true,
      text: trimmed,
      ambiguityWarning,
    };
  }

  return {
    id: draftId,
    rawText: trimmed,
    kind: 'task',
    text: taskText || trimmed,
    priority,
    dueDate: dateExtraction.date,
    dueDateLabel: dateExtraction.dateLabel,
    ambiguityWarning: dateExtraction.ambiguityWarning,
    targetModule: 'dashboard',
    isModuleEnabled: true, // tasks are always supported in core LifeOS
  };
}

/* =========================================================================
   DRAFT EXECUTION & CONFIRMATION
   ========================================================================= */

export function canConfirmDraft(
  state: LifeOSState,
  draft: CaptureDraft
): { valid: boolean; reason?: string } {
  if (draft.ambiguityWarning) {
    return { valid: false, reason: 'Fecha o datos ambiguos requieren revisión' };
  }
  if (!isModuleEnabled(state, draft.targetModule)) {
    return { valid: false, reason: `Módulo ${draft.targetModule} desactivado` };
  }
  if (!draft.isModuleEnabled) {
    return { valid: false, reason: 'Módulo desactivado' };
  }
  if (draft.missingFields && draft.missingFields.length > 0) {
    return { valid: false, reason: 'Campos requeridos faltantes' };
  }
  if (draft.kind === 'finance') {
    if (draft.amount === undefined || draft.amount <= 0) {
      return { valid: false, reason: 'Importe requerido' };
    }
    if (draft.isCurrencyIncompatible || (draft.currency && draft.currency !== 'UYU')) {
      return { valid: false, reason: 'Moneda extranjera no soportada' };
    }
    if (draft.accountId) {
      const accExists = (state.finance?.accounts || []).some((a) => a.id === draft.accountId);
      if (!accExists) {
        return { valid: false, reason: 'Cuenta inexistente' };
      }
    }
    if (draft.category) {
      const catObj = (state.finance?.categories || []).find((c) =>
        typeof c === 'string' ? c === draft.category : c.id === draft.category
      );
      if (catObj && typeof catObj !== 'string' && catObj.active === false) {
        return { valid: false, reason: 'Categoría archivada' };
      }
    }
  }
  return { valid: true };
}

export function confirmCaptureDraft(
  draftState: LifeOSState,
  draft: CaptureDraft
): { message: string; sound: 'coins' | 'success' | 'click' } {
  // Guard against mutating disabled modules
  if (!isModuleEnabled(draftState, draft.targetModule)) {
    throw new Error(`El módulo ${draft.targetModule} está desactivado. No se puede confirmar.`);
  }

  switch (draft.kind) {
    case 'finance': {
      if (!draft.amount || draft.amount <= 0) {
        throw new Error('El importe es obligatorio para registrar un movimiento.');
      }
      if (draft.isCurrencyIncompatible || (draft.currency && draft.currency !== 'UYU')) {
        throw new Error(`Moneda no soportada (${draft.currency || 'extranjera'}). LifeOS no realiza conversiones automáticas.`);
      }

      // Check account exists
      const accounts = draftState.finance?.accounts || [];
      if (draft.accountId) {
        const accExists = accounts.some((a) => a.id === draft.accountId);
        if (!accExists) {
          throw new Error('La cuenta seleccionada no existe o fue eliminada.');
        }
      }

      // Check category is active if specified
      const category = draft.category || 'Otros';
      const userCategories = draftState.finance?.categories || [];
      if (userCategories.length > 0 && draft.category) {
        const catObj = userCategories.find((c) => (typeof c === 'string' ? c === draft.category : c.id === draft.category));
        if (catObj && typeof catObj !== 'string' && catObj.active === false) {
          throw new Error('La categoría seleccionada está archivada o desactivada.');
        }
      }

      const tx = addQuickTransaction(draftState, {
        type: draft.type,
        amount: draft.amount,
        category,
        accountId: draft.accountId,
        note: draft.installments ? `${draft.note || ''} (${draft.installments} cuotas)`.trim() : draft.note,
        date: draft.date,
      });

      // Stream Guard: Do NOT leak raw numbers in toast
      const displayCategory = draft.categoryMatched || draft.category || 'Finanzas';
      return {
        message: `${tx.type === 'ingreso' ? 'Ingreso' : 'Gasto'} registrado en ${displayCategory}.`,
        sound: 'coins',
      };
    }

    case 'task': {
      addQuickTask(draftState, draft.text, draft.priority, draft.dueDate || todayISO(), draft.effort || 'medium');
      const dueSuffix = draft.dueDateLabel && draft.dueDateLabel !== 'Hoy' ? ` (${draft.dueDateLabel})` : '';
      return {
        message: `Tarea creada: "${draft.text}"${dueSuffix}.`,
        sound: 'success',
      };
    }

    case 'note': {
      addQuickNote(draftState, draft.text, draft.title ? { title: draft.title } : undefined);
      return {
        message: 'Nota guardada en tus apuntes.',
        sound: 'success',
      };
    }

    case 'idea': {
      addQuickIdea(draftState, draft.text);
      return {
        message: 'Idea registrada en tu banco de ideas.',
        sound: 'success',
      };
    }

    case 'study': {
      if (!draftState.study) draftState.study = { subjects: [], exams: [], studyLog: [] };
      if (!draftState.study.studyLog) draftState.study.studyLog = [];

      let subjectId = draft.subjectId;
      if (!subjectId && draft.subjectName) {
        const existing = draftState.study.subjects.find(
          (s) => s.name.toLowerCase() === draft.subjectName!.toLowerCase()
        );
        if (existing) {
          subjectId = existing.id;
        } else {
          const newSub = { id: uid(), name: draft.subjectName };
          draftState.study.subjects.push(newSub);
          subjectId = newSub.id;
        }
      }

      draftState.study.studyLog.push({
        id: uid(),
        date: draft.date,
        minutes: draft.minutes,
        subjectId: subjectId || null,
      });

      return {
        message: `Sesión de estudio registrada: ${draft.minutes} min en ${draft.subjectName || 'general'}.`,
        sound: 'success',
      };
    }

    case 'work': {
      // Unimplemented domain mutation: Save to Inbox honestly without inventing follow-up
      addQuickInbox(draftState, draft.rawText, 'quick-capture');
      return {
        message: `Guardado en Bandeja de Entrada como captura pendiente (${draft.action}).`,
        sound: 'click',
      };
    }

    case 'resale': {
      // Unimplemented domain mutation: Save to Inbox honestly without inventing fake resale entity
      addQuickInbox(draftState, draft.rawText, 'quick-capture');
      return {
        message: `Guardado en Bandeja de Entrada como captura pendiente (${draft.title}).`,
        sound: 'click',
      };
    }

    case 'agenda': {
      // Add block or task
      addQuickTask(draftState, `${draft.activity} (${draft.time || ''})`, 'alta', draft.date);
      return {
        message: `Actividad agendada: ${draft.activity}.`,
        sound: 'success',
      };
    }

    case 'inbox':
    default: {
      addQuickInbox(draftState, draft.text);
      return {
        message: 'Guardado en tu Bandeja de Entrada.',
        sound: 'click',
      };
    }
  }
}

/**
 * Converts any draft into a safe NoteDraft or InboxDraft (e.g. when module is disabled or user prefers note/inbox).
 */
export function convertDraftToNote(draft: CaptureDraft): NoteDraft {
  let content = draft.rawText;
  if (draft.kind === 'finance') {
    content = `${draft.type === 'ingreso' ? 'Ingreso' : 'Gasto'}: ${draft.amount ? fmtMoney(draft.amount) : 'Monto pendiente'} · ${draft.categoryMatched || draft.category || 'Sin categoría'} · ${draft.rawText}`;
  }

  return {
    id: draft.id,
    rawText: draft.rawText,
    kind: 'note',
    targetModule: 'notas',
    isModuleEnabled: true,
    text: content,
  };
}

export function convertDraftToInbox(draft: CaptureDraft): InboxDraft {
  return {
    id: draft.id,
    rawText: draft.rawText,
    kind: 'inbox',
    targetModule: 'dashboard',
    isModuleEnabled: true,
    text: draft.rawText,
  };
}

/**
 * Enables the disabled module on state settings so the draft can be safely confirmed.
 */
export function enableModuleForDraft(state: LifeOSState, draft: CaptureDraft): void {
  if (state.settings) {
    state.settings.hiddenTabs = (state.settings.hiddenTabs || []).filter((tab) => tab !== draft.targetModule);
  }
  draft.isModuleEnabled = true;
}
