import { todayISO } from '../lib/storage';
import type { Account, FinanceCategoryInput } from '../types';

export interface QuickFinanceParserOptions {
  accounts?: Account[];
  categories?: FinanceCategoryInput[];
  defaultDate?: string;
  defaultAccountId?: string;
}

export interface ParsedMonetaryToken {
  amount: number | null;
  isAmbiguous: boolean;
  rawMatched: string;
}

export interface ParsedQuickFinance {
  raw: string;
  isValid: boolean;
  amount: number | null;
  type: 'gasto' | 'ingreso';
  destination?: 'transaction' | 'commitment';
  currentInstallment?: number;
  totalInstallments?: number;
  category: string | null;
  categoryMatched: string | null;
  accountId: string | null;
  accountName: string | null;
  isAccountSuggested?: boolean;
  currency?: string;
  isCurrencyIncompatible?: boolean;
  date: string;
  dateLabel: string;
  note: string;
  preview: string;
  missing: ('amount' | 'category' | 'account')[];
  confidence: {
    amount: boolean;
    category: boolean;
    account: boolean;
  };
  isAmbiguous?: boolean;
}

export const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

export const SPANISH_MONTH_NAMES = [
  '',
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const DEFAULT_CATEGORY_KEYWORDS: Record<string, string[]> = {
  Comida: [
    'comida', 'almuerzo', 'cena', 'desayuno', 'merienda', 'vianda', 'delivery',
    'pedidosya', 'rappi', 'pizza', 'empanadas', 'burger', 'hamburguesa', 'sushi',
    'cafe', 'café', 'cafeteria', 'cafetería', 'panaderia', 'panadería', 'bar',
    'restaurante', 'resto', 'mcdonalds', 'mostaza', 'burgerking', 'helado', 'lomito'
  ],
  Supermercado: [
    'super', 'supermercado', 'almacen', 'almacén', 'feria', 'verduleria', 'verdulería',
    'carniceria', 'carnicería', 'tienda inglesa', 'disco', 'devoto', 'tata', 'ta-ta',
    'macro', 'frog', 'kiosko', 'kiosco', 'panadería', 'frutas', 'mercado'
  ],
  Transporte: [
    'nafta', 'combustible', 'gasolina', 'gasoil', 'uber', 'taxi', 'cabify', 'boleto',
    'boletos', 'omnibus', 'ómnibus', 'bondi', 'stm', 'peaje', 'estacionamiento',
    'parking', 'sube', 'pasaje', 'viaje', 'auto', 'moto'
  ],
  Gimnasio: [
    'gym', 'gimnasio', 'cuota gym', 'suplementos', 'proteina', 'proteína', 'creatina',
    'pesas', 'smartfit', 'entrenamiento', 'crossfit'
  ],
  Estudio: [
    'estudio', 'facultad', 'curso', 'libros', 'fotocopias', 'utec', 'universidad',
    'facu', 'udelar', 'examen', 'materiales', 'certificacion', 'udemy'
  ],
  Ocio: [
    'ocio', 'cine', 'salida', 'joda', 'boliche', 'recital', 'juegos', 'steam',
    'playstation', 'psn', 'xbox', 'fiesta', 'juntada', 'cerveza', 'tragos'
  ],
  Hogar: [
    'hogar', 'alquiler', 'gastos comunes', 'ute', 'ose', 'antel', 'internet',
    'fibra', 'wifi', 'celular', 'contrato', 'limpieza', 'ferreteria', 'ferretería',
    'muebles', 'reparacion', 'reparación', 'plomero', 'electricista'
  ],
  'Admin/Hogar': [
    'admin', 'hogar', 'alquiler', 'gastos comunes', 'ute', 'ose', 'antel', 'internet',
    'fibra', 'wifi', 'celular', 'contrato', 'limpieza', 'ferreteria', 'ferretería'
  ],
  Suscripciones: [
    'suscripcion', 'suscripción', 'netflix', 'spotify', 'youtube', 'disney',
    'amazon prime', 'prime video', 'chatgpt', 'openai', 'claude', 'github',
    'icloud', 'google one', 'patreon', 'twitch', 'sub'
  ],
  Salud: [
    'medico', 'médico', 'farmacia', 'medicamentos', 'dentista', 'odontologo',
    'odontólogo', 'analisis', 'análisis', 'psicologo', 'psicólogo', 'optica',
    'óptica', 'lentes', 'mutualista'
  ],
  Indumentaria: [
    'ropa', 'zapatillas', 'championes', 'campera', 'pantalon', 'pantalón',
    'remera', 'buzo', 'zara', 'h&m', 'shopping'
  ],
  Otros: [
    'otros', 'varios', 'imprevisto', 'imprevistos', 'regalo', 'donacion', 'donación'
  ]
};

export const DEFAULT_ACCOUNT_KEYWORDS: Record<string, string[]> = {
  efectivo: ['efectivo', 'cash', 'mano', 'plata', 'billetes'],
  banco: ['banco', 'brou', 'itau', 'itaú', 'bbva', 'santander', 'scotiabank', 'transferencia', 'debito', 'débito'],
  tarjeta: ['tarjeta', 'credito', 'crédito', 'visa', 'mastercard', 'oca', 'passcard'],
  digital: ['mp', 'mercado pago', 'mercadopago', 'prex', 'midinero', 'uala', 'ualá'],
};

/**
 * Strict Decimal & Thousands Separator Policy:
 * 1. 1200.50 -> 1200.50
 * 2. 500.50 -> 500.50
 * 3. 1.200,50 -> 1200.50
 * 4. 1,200.50 -> 1200.50
 * 5. 1200,50 -> 1200.50
 * 6. 1200 -> 1200
 * 7. 1.200 -> 1200
 * 8. 1,200 -> 1200
 *
 * Ambiguous (e.g. 1.200.50, 1,200,50, 1.2.3, 12.34.56): isAmbiguous = true, amount = null
 */
export function parseMonetaryToken(str: string): ParsedMonetaryToken {
  const clean = str.trim();
  if (!clean) return { amount: null, isAmbiguous: false, rawMatched: str };

  const dotCount = (clean.match(/\./g) || []).length;
  const commaCount = (clean.match(/,/g) || []).length;

  // Case: both dot and comma present
  if (dotCount > 0 && commaCount > 0) {
    const lastDotIdx = clean.lastIndexOf('.');
    const lastCommaIdx = clean.lastIndexOf(',');

    if (lastCommaIdx > lastDotIdx) {
      // Form: 1.200,50
      const decPart = clean.slice(lastCommaIdx + 1);
      const intPart = clean.slice(0, lastCommaIdx);
      if (decPart.length < 1 || decPart.length > 2) {
        return { amount: null, isAmbiguous: true, rawMatched: str };
      }
      const parts = intPart.split('.');
      const validThousands = parts.every((p, idx) => (idx === 0 ? p.length >= 1 && p.length <= 3 : p.length === 3));
      if (!validThousands) {
        return { amount: null, isAmbiguous: true, rawMatched: str };
      }
      const num = parseFloat(intPart.replace(/\./g, '') + '.' + decPart);
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    } else {
      // Form: 1,200.50
      const decPart = clean.slice(lastDotIdx + 1);
      const intPart = clean.slice(0, lastDotIdx);
      if (decPart.length < 1 || decPart.length > 2) {
        return { amount: null, isAmbiguous: true, rawMatched: str };
      }
      const parts = intPart.split(',');
      const validThousands = parts.every((p, idx) => (idx === 0 ? p.length >= 1 && p.length <= 3 : p.length === 3));
      if (!validThousands) {
        return { amount: null, isAmbiguous: true, rawMatched: str };
      }
      const num = parseFloat(intPart.replace(/,/g, '') + '.' + decPart);
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
  }

  // Case: multiple dots (e.g. 1.000.000)
  if (dotCount > 1) {
    const parts = clean.split('.');
    const validThousands = parts.every((p, idx) => (idx === 0 ? p.length >= 1 && p.length <= 3 : p.length === 3));
    if (validThousands) {
      const num = parseFloat(clean.replace(/\./g, ''));
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
    return { amount: null, isAmbiguous: true, rawMatched: str };
  }

  // Case: multiple commas (e.g. 1,000,000)
  if (commaCount > 1) {
    const parts = clean.split(',');
    const validThousands = parts.every((p, idx) => (idx === 0 ? p.length >= 1 && p.length <= 3 : p.length === 3));
    if (validThousands) {
      const num = parseFloat(clean.replace(/,/g, ''));
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
    return { amount: null, isAmbiguous: true, rawMatched: str };
  }

  // Case: exactly one dot (e.g. 1200.50, 500.50, 1.200)
  if (dotCount === 1) {
    const [intPart, decPart] = clean.split('.');
    if (decPart.length === 1 || decPart.length === 2) {
      const num = parseFloat(intPart + '.' + decPart);
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
    if (decPart.length === 3 && intPart.length >= 1 && intPart.length <= 3) {
      const num = parseFloat(intPart + decPart);
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
    return { amount: null, isAmbiguous: true, rawMatched: str };
  }

  // Case: exactly one comma (e.g. 1200,50, 500,50, 1,200)
  if (commaCount === 1) {
    const [intPart, decPart] = clean.split(',');
    if (decPart.length === 1 || decPart.length === 2) {
      const num = parseFloat(intPart + '.' + decPart);
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
    if (decPart.length === 3 && intPart.length >= 1 && intPart.length <= 3) {
      const num = parseFloat(intPart + decPart);
      return { amount: isNaN(num) ? null : num, isAmbiguous: isNaN(num), rawMatched: str };
    }
    return { amount: null, isAmbiguous: true, rawMatched: str };
  }

  // Pure integer
  const num = parseFloat(clean);
  return { amount: !isNaN(num) && num > 0 ? num : null, isAmbiguous: false, rawMatched: str };
}

export function parseQuickFinance(
  input: string,
  options: QuickFinanceParserOptions = {}
): ParsedQuickFinance {
  const raw = input.trim();
  const today = options.defaultDate || todayISO();

  if (!raw) {
    return {
      raw,
      isValid: false,
      amount: null,
      type: 'gasto',
      category: null,
      categoryMatched: null,
      accountId: null,
      accountName: null,
      date: today,
      dateLabel: 'Hoy',
      note: '',
      preview: 'Ingresá monto y concepto...',
      missing: ['amount', 'category', 'account'],
      confidence: { amount: false, category: false, account: false },
    };
  }

  // Normalize repeated currency prefix in input
  const normalizedRaw = raw.replace(/(?:\$U\s*)+/gi, '$U ').trim();

  // Detect whether it's an explicit past action vs future commitment
  const isPastAction = /^(?:gast[eé]|pagu[eé]|compr[eé]|cobr[eé])\b/i.test(normalizedRaw);
  const isFuturePayment = !isPastAction && (/^(?:pagar|pago\s+de)\b/i.test(normalizedRaw) || /\bcuota\s+\d+/i.test(normalizedRaw));
  const isDebt = !isPastAction && !isFuturePayment && /\b(?:debo|le\s+debo|deuda(?:\s+de)?|adeudo|compromiso\s+de\s+pago)\b/i.test(normalizedRaw);

  if (isDebt) {
    return {
      raw,
      isValid: false,
      amount: null,
      type: 'gasto',
      destination: 'commitment',
      category: null,
      categoryMatched: null,
      accountId: null,
      accountName: null,
      date: today,
      dateLabel: 'Hoy',
      note: raw,
      preview: 'Obligación o deuda pendiente (no es un gasto realizado)',
      missing: ['amount'],
      confidence: { amount: false, category: false, account: false },
    };
  }

  // 1. Detect Currency
  let currency = 'UYU';
  let isCurrencyIncompatible = false;
  if (/\b(?:usd|d[oó]lares?)\b/i.test(normalizedRaw)) {
    currency = 'USD';
    isCurrencyIncompatible = true;
  } else if (/\b(?:eur|euros?)\b/i.test(normalizedRaw)) {
    currency = 'EUR';
    isCurrencyIncompatible = true;
  }

  // 2. Detect Type (income vs expense)
  let type: 'gasto' | 'ingreso' = 'gasto';
  let processed = normalizedRaw;

  if (
    /^(\+U|\$U\s*\+|\+)/i.test(processed) ||
    /\b(ingreso|cobro|cobr[eé]|sueldo|ganancia|honorarios)\b/i.test(processed)
  ) {
    type = 'ingreso';
    processed = processed.replace(/^(\+U|\$U\s*\+|\+)\s*/i, '');
    processed = processed.replace(/\b(ingreso|cobro|cobr[eé]|sueldo|ganancia|honorarios)\b\s*/i, ' ');
  } else if (/^-/.test(processed)) {
    type = 'gasto';
    processed = processed.replace(/^-+\s*/, '');
  }

  // 3. Extract Time (e.g. 13:30) so hours/minutes aren't mistaken for amount
  const timeRegex = /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:hs?\b|horas?\b))?\b/gi;
  processed = processed.replace(timeRegex, ' ');

  // 4. Extract Installments / Cuotas (e.g. "cuota 3 de 12", "6 cuotas")
  let currentInstallment: number | undefined;
  let totalInstallments: number | undefined;

  const planMatch = /\bcuota\s+(\d+)\s*(?:de|\/)\s*(\d+)\b/i.exec(processed);
  if (planMatch) {
    currentInstallment = parseInt(planMatch[1], 10);
    totalInstallments = parseInt(planMatch[2], 10);
    processed = processed.replace(planMatch[0], ' ');
  } else {
    const cuotasCountMatch = /\b(\d+)\s+cuotas?\b/i.exec(processed);
    if (cuotasCountMatch) {
      totalInstallments = parseInt(cuotasCountMatch[1], 10);
      currentInstallment = 1;
      processed = processed.replace(cuotasCountMatch[0], ' ');
    } else {
      const singleCuotaMatch = /\bcuota\s+(\d+)\b/i.exec(processed);
      if (singleCuotaMatch) {
        currentInstallment = parseInt(singleCuotaMatch[1], 10);
        processed = processed.replace(singleCuotaMatch[0], ' ');
      }
    }
  }

  // 5. Extract Date BEFORE Amount (so explicit dates like "25 de octubre" or "15/09" are not eaten as amounts)
  let targetDate = today;
  let dateLabel = 'Hoy';

  // Explicit month dates: "25 de octubre", "el 25 de octubre", "25 de octubre de 2026", "25 de oct"
  const explicitMonthRegex = /(?:\b(?:el|para\s+el|del?|el\s+d[ií]a)\s+)?\b([0-3]?\d)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\b(?:\s+(?:del?|de)\s+(\d{4})|\s+([2][0-9]{3}))?/i;
  const explicitMatch = processed.match(explicitMonthRegex);
  if (explicitMatch) {
    const day = parseInt(explicitMatch[1], 10);
    const monthKey = explicitMatch[2].toLowerCase();
    const month = SPANISH_MONTHS[monthKey];
    const rawYear = explicitMatch[3] || explicitMatch[4];
    const refYear = new Date(today + 'T00:00:00').getFullYear();
    const year = rawYear ? parseInt(rawYear, 10) : refYear;

    if (month && isValidCalendarDate(year, month, day)) {
      const formattedMonth = String(month).padStart(2, '0');
      const formattedDay = String(day).padStart(2, '0');
      targetDate = `${year}-${formattedMonth}-${formattedDay}`;
      dateLabel = rawYear ? `${day} de ${SPANISH_MONTH_NAMES[month]} de ${year}` : `${day} de ${SPANISH_MONTH_NAMES[month]}`;
      processed = processed.replace(explicitMatch[0], ' ');
    }
  } else if (/(?:\b(?:el|para\s+el)\s+)?\b([2][0-9]{3})-([0-1]\d)-([0-3]\d)\b/i.test(processed)) {
    const isoDateRegex = /(?:\b(?:el|para\s+el)\s+)?\b([2][0-9]{3})-([0-1]\d)-([0-3]\d)\b/i;
    const isoMatch = processed.match(isoDateRegex);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      if (isValidCalendarDate(year, month, day)) {
        const formattedMonth = String(month).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        targetDate = `${year}-${formattedMonth}-${formattedDay}`;
        dateLabel = `${formattedDay}/${formattedMonth}/${year}`;
        processed = processed.replace(isoMatch[0], ' ');
      }
    }
  } else {
    // Slashed dates: 15/09, 15/9, 15/09/2026
    const slashedDateRegex = /\b([0-3]?\d)\/([0-1]?\d)(?:\/(\d{2,4}))?\b/;
    const slashedMatch = processed.match(slashedDateRegex);
    if (slashedMatch) {
      const day = parseInt(slashedMatch[1], 10);
      const month = parseInt(slashedMatch[2], 10);
      const year = slashedMatch[3] ? parseInt(slashedMatch[3], 10) : new Date(today + 'T00:00:00').getFullYear();
      const fullYear = year < 100 ? 2000 + year : year;
      const formattedMonth = String(month).padStart(2, '0');
      const formattedDay = String(day).padStart(2, '0');
      targetDate = `${fullYear}-${formattedMonth}-${formattedDay}`;
      dateLabel = `${formattedDay}/${formattedMonth}`;
      processed = processed.replace(slashedMatch[0], ' ');
    } else {
      // Explicit day: "el 15", "vence el 20"
      const explicitDayRegex = /\b(?:el|para\s+el|vence\s+el|d[ií]a)\s+([1-9]|[12]\d|3[01])\b(?![/a-z])/i;
      const dayMatch = processed.match(explicitDayRegex);
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10);
        const refDate = new Date(today + 'T00:00:00');
        let curYear = refDate.getFullYear();
        let curMonth = refDate.getMonth();
        if (day < refDate.getDate() && (isFuturePayment || currentInstallment !== undefined)) {
          curMonth += 1;
          if (curMonth > 11) {
            curYear += 1;
            curMonth = 0;
          }
        }
        const formattedMonth = String(curMonth + 1).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        targetDate = `${curYear}-${formattedMonth}-${formattedDay}`;
        dateLabel = `${day} de ${SPANISH_MONTH_NAMES[curMonth + 1]}`;
        processed = processed.replace(dayMatch[0], ' ');
      } else {
        const normalizedText = normalize(processed);
        if (/\b(ayer)\b/.test(normalizedText)) {
          targetDate = computeRelativeDate(today, -1);
          dateLabel = 'Ayer';
          processed = processed.replace(/\bayer\b/gi, ' ');
        } else if (/\b(anteayer|ante\s+ayer)\b/.test(normalizedText)) {
          targetDate = computeRelativeDate(today, -2);
          dateLabel = 'Anteayer';
          processed = processed.replace(/\b(anteayer|ante\s+ayer)\b/gi, ' ');
        } else if (/\b(pasado\s+ma[nñ]ana)\b/.test(normalizedText)) {
          targetDate = computeRelativeDate(today, 2);
          dateLabel = 'Pasado mañana';
          processed = processed.replace(/\b(pasado\s+ma[nñ]ana)\b/gi, ' ');
        } else if (/\b(ma[nñ]ana)\b/.test(normalizedText)) {
          targetDate = computeRelativeDate(today, 1);
          dateLabel = 'Mañana';
          processed = processed.replace(/\bma[nñ]ana\b/gi, ' ');
        } else if (/\b(hoy)\b/.test(normalizedText)) {
          targetDate = today;
          dateLabel = 'Hoy';
          processed = processed.replace(/\bhoy\b/gi, ' ');
        } else {
          const daysMap: Record<string, number> = {
            domingo: 0,
            lunes: 1,
            martes: 2,
            miercoles: 3,
            jueves: 4,
            viernes: 5,
            sabado: 6,
          };
          for (const [dayName, dayIdx] of Object.entries(daysMap)) {
            const reg = new RegExp(`\\b${dayName}\\b`, 'i');
            if (reg.test(normalizedText)) {
              targetDate = findClosestDayOfWeek(today, dayIdx);
              dateLabel = formatDateLabel(targetDate, today);
              processed = processed.replace(reg, ' ');
              break;
            }
          }
        }
      }
    }
  }

  // 6. Extract Amount (with explicit policy and unit protection)
  const MEASUREMENT_UNITS_SUFFIX = /^\s*(?:horas?|hs?\b|h\b|minutos?|mins?\b|min\b|segundos?|segs?\b|s\b|d[ií]as?|semanas?|meses|a[ñn]os?|km|kms?|kil[oó]metros?|metros?|m\b|cm\b|cent[ií]metros?|mm\b|millas?|kg|kgs?|kilos?|kilogramos?|gramos?|g\b|lbs?|libras?|reps?\b|repeticiones|series?\b|sets?\b|vueltas?|flexiones|caps?\b|c[aá]psulas?|pastillas?|gotas?|dosis|gb\b|mb\b|tb\b|kb\b|fps\b|hz\b|ghz\b|mhz\b|%|por ciento|pts?\b|puntos|p[aá]ginas?|p[aá]gs?\b|cap[ií]tulos?|episodios?|canciones?|art[ií]culos?|videos?)\b/i;

  let amount: number | null = null;
  let isAmbiguous = false;

  // Regex to match candidate number strings (e.g. $U 1.200,50, $500, 1200.50, 500, 1200)
  const numRegex = /(?:\$U|\$)?\s*([0-9]{1,3}(?:[.,][0-9]{1,3})+|[0-9]+(?:[.,][0-9]+)?)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = numRegex.exec(processed)) !== null) {
    const fullMatch = match[0];
    const hasCurrencyPrefix = /(?:\$U|\$)/i.test(fullMatch);
    const afterMatch = processed.slice(match.index + fullMatch.length);
    const hasCurrencySuffix = /^\s*(?:usd|eur|uyu|\$)/i.test(afterMatch);

    // If it has no currency prefix or suffix, and is followed by a measurement unit, it's not money
    if (!hasCurrencyPrefix && !hasCurrencySuffix && MEASUREMENT_UNITS_SUFFIX.test(afterMatch)) {
      continue;
    }

    const tokenRes = parseMonetaryToken(match[1]);
    if (tokenRes.isAmbiguous) {
      isAmbiguous = true;
      amount = null;
      processed = processed.slice(0, match.index) + ' ' + processed.slice(match.index + fullMatch.length);
      break;
    }

    if (tokenRes.amount !== null && tokenRes.amount > 0) {
      amount = tokenRes.amount;
      processed = processed.slice(0, match.index) + ' ' + processed.slice(match.index + fullMatch.length);
      break;
    }
  }

  // Remove currency words from remaining processed note text
  processed = processed.replace(/\b(?:usd|eur|uyu|d[oó]lares?|pesos?)\b/gi, ' ');

  // 7. Extract Account
  let matchedAccountId: string | null = null;
  let matchedAccountName: string | null = null;
  let isAccountSuggested = false;
  const accounts = options.accounts || [];

  // 7a. User explicitly mentioned account name
  for (const acc of accounts) {
    const normAcc = normalize(acc.name);
    const tokens = normAcc.split(/\s+/).filter((t) => t.length > 2);
    for (const token of tokens) {
      const reg = new RegExp(`\\b${token}\\b`, 'i');
      if (reg.test(normalize(processed))) {
        matchedAccountId = acc.id;
        matchedAccountName = acc.name;
        isAccountSuggested = false;
        processed = processed.replace(reg, ' ');
        break;
      }
    }
    if (matchedAccountId) break;
  }

  // 7b. Check default account keywords
  if (!matchedAccountId) {
    for (const [canonicalAccount, keywords] of Object.entries(DEFAULT_ACCOUNT_KEYWORDS)) {
      for (const kw of keywords) {
        const reg = new RegExp(`\\b${normalize(kw)}\\b`, 'i');
        if (reg.test(normalize(processed))) {
          const found = accounts.find(
            (a) =>
              normalize(a.name).includes(canonicalAccount) ||
              keywords.some((k) => normalize(a.name).includes(normalize(k)))
          );
          if (found) {
            matchedAccountId = found.id;
            matchedAccountName = found.name;
            isAccountSuggested = false;
          } else {
            matchedAccountName = canonicalAccount.charAt(0).toUpperCase() + canonicalAccount.slice(1);
            isAccountSuggested = true;
          }
          processed = processed.replace(reg, ' ');
          break;
        }
      }
      if (matchedAccountName) break;
    }
  }

  // 7c. Fallback suggested account if provided
  if (!matchedAccountId && options.defaultAccountId) {
    const defAcc = accounts.find((a) => a.id === options.defaultAccountId);
    if (defAcc) {
      matchedAccountId = defAcc.id;
      matchedAccountName = defAcc.name;
      isAccountSuggested = true;
    }
  }

  // 8. Extract Category (Strictly Reutilize Active Categories)
  let matchedCategoryId: string | null = null;
  let matchedCategoryName: string | null = null;

  const rawCategories = options.categories && options.categories.length > 0
    ? options.categories
    : Object.keys(DEFAULT_CATEGORY_KEYWORDS);

  const availableCategories: { id: string; name: string }[] = rawCategories
    .map((c) => {
      if (typeof c === 'string') return { id: c, name: c, active: true };
      return { id: c.id, name: c.name, active: c.active !== false };
    })
    .filter((c) => c.active !== false);

  // 8a. Check against configured/default keyword map
  for (const [catName, keywords] of Object.entries(DEFAULT_CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const reg = new RegExp(`\\b${normalize(kw)}\\b`, 'i');
      if (reg.test(normalize(processed))) {
        const exactMatch = availableCategories.find(
          (c) => normalize(c.name) === normalize(catName) || normalize(c.name).includes(normalize(catName))
        );
        if (exactMatch) {
          matchedCategoryId = exactMatch.id;
          matchedCategoryName = exactMatch.name;
        } else if (!options.categories || options.categories.length === 0) {
          matchedCategoryId = catName;
          matchedCategoryName = catName;
        }
        processed = processed.replace(reg, ' ');
        break;
      }
    }
    if (matchedCategoryId) break;
  }

  // 8b. Check if any user active category name appears directly
  if (!matchedCategoryId) {
    for (const cat of availableCategories) {
      const normCat = normalize(cat.name);
      if (normCat.length > 2) {
        const reg = new RegExp(`\\b${normCat}\\b`, 'i');
        if (reg.test(normalize(processed))) {
          matchedCategoryId = cat.id;
          matchedCategoryName = cat.name;
          processed = processed.replace(reg, ' ');
          break;
        }
      }
    }
  }

  // 9. Remaining text becomes note
  const cleanNote = processed
    .replace(/(?:\$U|\$)/gi, ' ')
    .replace(/^(?:pagar|pagu[eé]|gast[eé]|compr[eé]|cobr[eé])\s+/gi, '')
    .replace(/[,\-;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 10. Destination (transaction vs commitment)
  const destination: 'transaction' | 'commitment' =
    isFuturePayment || currentInstallment !== undefined || totalInstallments !== undefined
      ? 'commitment'
      : 'transaction';

  // 11. Build missing list
  const missing: ('amount' | 'category' | 'account')[] = [];
  if (amount === null || isAmbiguous) missing.push('amount');
  if (!matchedCategoryId) missing.push('category');
  if (destination === 'transaction' && !matchedAccountId && !matchedAccountName) missing.push('account');

  const formattedAmount =
    amount !== null
      ? (currency === 'USD' ? 'USD ' : currency === 'EUR' ? 'EUR ' : '$U ') +
        Math.round(amount).toLocaleString('es-UY')
      : '$U ?';
  const formattedCategory = matchedCategoryName || 'Categoría pendiente';
  const formattedAccount = matchedAccountName ? (isAccountSuggested ? `${matchedAccountName} (sugerida)` : matchedAccountName) : 'Cuenta no especificada';

  let preview: string;
  if (destination === 'commitment') {
    const comLabel = currentInstallment && totalInstallments
      ? `Cuota ${currentInstallment}/${totalInstallments}`
      : 'Compromiso';
    preview = `${formattedAmount} · ${formattedCategory} · ${comLabel} para ${dateLabel}`;
  } else {
    preview = `${formattedAmount} · ${formattedCategory} · ${formattedAccount} · ${dateLabel}`;
  }

  return {
    raw,
    isValid: amount !== null && amount > 0 && !isAmbiguous && !isCurrencyIncompatible,
    amount,
    type,
    destination,
    currentInstallment,
    totalInstallments,
    category: matchedCategoryId,
    categoryMatched: matchedCategoryName,
    accountId: matchedAccountId,
    accountName: matchedAccountName,
    isAccountSuggested,
    currency,
    isCurrencyIncompatible,
    date: targetDate,
    dateLabel,
    note: cleanNote,
    preview,
    missing,
    confidence: {
      amount: amount !== null && !isAmbiguous,
      category: matchedCategoryId !== null,
      account: matchedAccountId !== null || matchedAccountName !== null,
    },
    isAmbiguous,
  };
}

/* =========================================================================
   INTERNAL UTILITIES
   ========================================================================= */

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function computeRelativeDate(baseISO: string, offsetDays: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return date.toISOString().slice(0, 10);
}

function findClosestDayOfWeek(baseISO: string, targetDayIdx: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d));
  const currentDay = baseDate.getUTCDay();

  let diff = targetDayIdx - currentDay;
  if (diff > 0) {
    diff -= 7;
  }
  return computeRelativeDate(baseISO, diff);
}

function formatDateLabel(targetISO: string, todayISOStr: string): string {
  if (targetISO === todayISOStr) return 'Hoy';
  if (targetISO === computeRelativeDate(todayISOStr, -1)) return 'Ayer';
  if (targetISO === computeRelativeDate(todayISOStr, 1)) return 'Mañana';

  const [y, m, d] = targetISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dt.getUTCDay()];
}
