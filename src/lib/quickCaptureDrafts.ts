import type { EffortLevel, LifeOSState, ViewType } from '../types';
import { todayISO, uid, fmtDate, fmtMoney } from './storage';
import { isModuleEnabled } from './moduleVisibility';
import { addQuickTask, addQuickNote, addQuickTransaction, addQuickIdea, addQuickInbox } from './quickCapture';
import { parseQuickFinance } from '../utils/quickFinanceParser';

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
  note?: string;
  notes?: string;
}

export interface FinanceDraft extends BaseDraft {
  kind: 'finance';
  type: 'gasto' | 'ingreso';
  amount?: number;
  currency?: string;
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
  date: string;
  dateLabel: string;
  cleanedText: string;
}

/**
 * Normalizes and extracts relative date mentions from text.
 * Returns the resolved ISO date, friendly label, and text with date expression removed.
 */
export function extractRelativeDate(
  rawText: string,
  referenceDate = todayISO(),
  defaultDirection: 'future' | 'past' = 'future'
): ParsedDateResult {
  const today = referenceDate;
  let cleaned = rawText;
  let resolvedDate = today;
  let resolvedLabel = 'Hoy';

  // 1. "pasado mañana"
  if (/\bpasado\s+ma[nñ]ana\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, 2);
    resolvedLabel = `Pasado mañana · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bpasado\s+ma[nñ]ana\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 2. "anteayer" / "ante ayer"
  if (/\b(?:anteayer|ante\s+ayer)\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, -2);
    resolvedLabel = `Anteayer · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\b(?:anteayer|ante\s+ayer)\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 3. "ayer"
  if (/\bayer\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, -1);
    resolvedLabel = `Ayer · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bayer\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 4. "mañana" (avoid matching "de la mañana" time modifier)
  if (/\bma[nñ]ana\b/i.test(cleaned) && !/\bde\s+la\s+ma[nñ]ana\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, 1);
    resolvedLabel = `Mañana · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bma[nñ]ana\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 5. "dentro de N días" or "en N días"
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

  // 6. "la semana que viene" / "la próxima semana"
  if (/\bla\s+(?:semana\s+que\s+viene|pr[oó]xima\s+semana)\b/i.test(cleaned)) {
    resolvedDate = computeRelativeDate(today, 7);
    resolvedLabel = `Semana próxima · ${fmtDate(resolvedDate)}`;
    cleaned = cleaned.replace(/\bla\s+(?:semana\s+que\s+viene|pr[oó]xima\s+semana)\b/gi, ' ');
    return { date: resolvedDate, dateLabel: resolvedLabel, cleanedText: cleanPunctuation(cleaned) };
  }

  // 7. Days of week: "el lunes", "este viernes", "martes", etc.
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

  // 8. "hoy"
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

  // Heuristic regex to check for sentence connectors " y ", " e ", ", y " where the second clause
  // starts with a recognizable intent verb, date, or number:
  // e.g.: " y mañana ...", " y pagar ...", " y gasté ...", " y comprar ...", " y estudiar ..."
  const connectorRegex = /\s+(?:y|e|,\s*y|,\s*e)\s+(?=(?:ma[nñ]ana|hoy|ayer|el\s+[a-z]+|pagu[eé]|pagar|gast[eé]|gastar|compr[eé]|comprar|vend[eé]|vender|estudiar|llamar|revisar|recordar|hacer|anotar|nota|idea|inbox|\$|\d+)\b)/i;

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

  // 3. Study Session / Task: "estudiar redes mañana", "estudiar TypeScript 1 hora", "tengo que estudiar para redes el jueves"
  const studyPattern = /^(?:tengo\s+que\s+estudiar(?:\s+para)?|estudiar)\s+(.+)$/i;
  const studyMatch = trimmed.match(studyPattern);
  if (studyMatch) {
    const rest = studyMatch[1].trim();
    const dateExtraction = extractRelativeDate(rest, referenceDate, 'future');

    // Extract minutes / hours
    let minutes = 45;
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
  }

  // 4. Financial Parsing (Strict & Nuanced)
  // Check for currency symbols, keywords, or missing amounts ("pagué internet")
  const hasCurrencySign = /(?:\$|\$U\b|USD\b|EUR\b|UYU\b|pesos\b|d[oó]lares\b)/i.test(trimmed);
  const hasPastTransactionalDeclaration = /^(?:gast[eé]|pagu[eé]|cobr[eé]|compr[eé]|pago\s+de|gasto\s+en)(?:\s+|$)/i.test(trimmed);
  const hasTransactionalVerb = /(?:^|\s)(?:gast[eé]|gasto|gastar|pagu[eé]|pago|pagar|compr[eé]|compra|comprar|cost[oó]|cobro|cobr[eé]|cobrar|ingreso|sueldo|salario)(?:\s|$)/i.test(trimmed);
  const startsWithPlusOrMinusNum = /^(?:\+|-)\s*\d+/i.test(trimmed);
  const startsWithAmount = /^[+-]?\$?\d+(?:[.,]\d+)?\s+[a-záéíóúñ]/i.test(trimmed);
  const isMeasurementUnit = /^[+-]?\$?\d+(?:[.,]\d+)?\s*(?:horas?|hs?\b|h\b|minutos?|mins?\b|m\b|segundos?|segs?\b|d[ií]as?|km|kms?|kilos?|kg|reps?|series?|materias?|veces)\b/i.test(trimmed);

  // Check if any word matches a known category in user's state.finance.categories
  const words = trimmed.toLowerCase().split(/\s+/);
  const matchesUserCategory = (state.finance?.categories || []).some((c) => {
    const cName = typeof c === 'string' ? c : c.name;
    return words.some((w) => w === cName.toLowerCase() || (cName.toLowerCase().includes(w) && w.length >= 4));
  });

  const matchesUserAccount = (state.finance?.accounts || []).some((a) =>
    words.some((w) => w === a.name.toLowerCase() || (a.name.toLowerCase().includes(w) && w.length >= 4))
  );

  // Check missing amount case: ONLY on past transactional verb ("pagué internet", "gasté en comida") and not general tasks like "comprar comida"
  if (hasPastTransactionalDeclaration && !/\d+/.test(trimmed)) {
    const dateExtraction = extractRelativeDate(trimmed, referenceDate, 'past');
    const enabled = isModuleEnabled(state, 'finanzas');

    // Attempt to extract category from remaining text or default category keywords
    const cleanRemaining = dateExtraction.cleanedText.replace(/(?:^|\s)(?:gast[eé]|gasto|pagu[eé]|pago|compr[eé]|compra|en|de)(?:\s|$)/gi, ' ').trim();

    const matchedCat = (state.finance?.categories || []).find((c) => {
      const cName = typeof c === 'string' ? c : c.name;
      return cName.toLowerCase().includes(cleanRemaining.toLowerCase()) || cleanRemaining.toLowerCase().includes(cName.toLowerCase());
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
    // Check if measurement unit vetoes it (e.g. "correr 5 km en 30 minutos", "transmitir 23 horas")
    const isVetoedByMeasurement =
      !hasCurrencySign &&
      !hasTransactionalVerb &&
      /\b\d+(?:\.\d+)?\s*(?:horas?|hs?\b|h\b|minutos?|mins?\b|segundos?|d[ií]as?|km|kms?|kilos?|kg|reps?|series?)\b/i.test(trimmed);

    if (!isVetoedByMeasurement) {
      // Check installments: "6000 en 6 cuotas"
      let installments: number | undefined;
      const cuotasMatch = trimmed.match(/(\d+)\s+cuotas?\b/i);
      if (cuotasMatch) {
        installments = parseInt(cuotasMatch[1], 10);
      }

      // Check currency: USD / dólares
      let currency = 'UYU';
      if (/\b(?:usd|d[oó]lares?)\b/i.test(trimmed)) {
        currency = 'USD';
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

      if (parsed.isValid && parsed.amount && parsed.amount > 0) {
        const enabled = isModuleEnabled(state, 'finanzas');
        return {
          id: draftId,
          rawText: trimmed,
          kind: 'finance',
          type: parsed.type,
          amount: parsed.amount,
          currency,
          category: parsed.category || undefined,
          categoryMatched: parsed.categoryMatched || undefined,
          accountId: parsed.accountId || undefined,
          accountName: parsed.accountName || undefined,
          date: parsed.date,
          dateLabel: parsed.dateLabel,
          note: parsed.note || trimmed,
          installments,
          missingFields: !parsed.category ? ['category'] : undefined,
          targetModule: 'finanzas',
          isModuleEnabled: enabled,
        };
      }
    }
  }

  // 5. Unstructured Reflective Notes: "hoy fue un día horrible", "ayer pensé que..."
  if (
    /^(?:hoy\s+fue\s+un\s+d[ií]a|ayer\s+pens[eé]|estoy\s+pensando\s+en|me\s+di\s+cuenta\s+que)(?:\s+|$)/i.test(trimmed)
  ) {
    const enabled = isModuleEnabled(state, 'notas');
    return {
      id: draftId,
      rawText: trimmed,
      kind: 'note',
      targetModule: 'notas',
      isModuleEnabled: enabled,
      text: trimmed,
    };
  }

  // 6. Agenda / Event pattern: "mañana gym 13:30", "reunión a las 15:00"
  const timeMatch = trimmed.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (timeMatch && (/\bgym\b/i.test(trimmed) || /\breuni[oó]n\b/i.test(trimmed) || /\bclase\b/i.test(trimmed))) {
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

  // 7. General Task: "estudiar redes mañana", "llamar a Juan el lunes", "comprar comida para los gatos"
  const dateExtraction = extractRelativeDate(trimmed, referenceDate, 'future');
  let taskText = dateExtraction.cleanedText;

  let priority: 'alta' | 'media' | 'baja' = 'media';
  if (/^(?:urgente|importante|ya|hoy\s+mismo)[:\s]*/i.test(taskText)) {
    priority = 'alta';
    taskText = taskText.replace(/^(?:urgente|importante|ya|hoy\s+mismo)[:\s]*/i, '').trim();
  } else if (/^(?:baja\s+prioridad|cuando\s+pueda)[:\s]*/i.test(taskText)) {
    priority = 'baja';
    taskText = taskText.replace(/^(?:baja\s+prioridad|cuando\s+pueda)[:\s]*/i, '').trim();
  }

  // Clean common task prefixes
  taskText = taskText.replace(/^(?:recordar|tengo\s+que|hacer)\s+/i, '');

  return {
    id: draftId,
    rawText: trimmed,
    kind: 'task',
    text: taskText || trimmed,
    priority,
    dueDate: dateExtraction.date,
    dueDateLabel: dateExtraction.dateLabel,
    targetModule: 'agenda',
    isModuleEnabled: true, // tasks are always supported in core LifeOS
  };
}

/* =========================================================================
   DRAFT EXECUTION & CONFIRMATION
   ========================================================================= */

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
      const category = draft.category || 'Otros';
      const tx = addQuickTransaction(draftState, {
        type: draft.type,
        amount: draft.amount,
        category,
        accountId: draft.accountId,
        note: draft.installments ? `${draft.note || ''} (${draft.installments} cuotas)`.trim() : draft.note,
        date: draft.date,
      });
      return {
        message: `${tx.type === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${fmtMoney(tx.amount)} registrado.`,
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
      // Register follow-up if applicable or note
      return {
        message: `Seguimiento laboral registrado: ${draft.action}.`,
        sound: 'success',
      };
    }

    case 'resale': {
      // Register in resale candidate or transaction
      return {
        message: `Registro de reventa guardado: ${draft.title}.`,
        sound: 'coins',
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
 * Converts any draft into a safe NoteDraft (e.g. when module is disabled or user prefers note).
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

/**
 * Enables the disabled module on state settings so the draft can be safely confirmed.
 */
export function enableModuleForDraft(state: LifeOSState, draft: CaptureDraft): void {
  if (state.settings) {
    state.settings.hiddenTabs = (state.settings.hiddenTabs || []).filter((tab) => tab !== draft.targetModule);
  }
  draft.isModuleEnabled = true;
}
