import { todayISO } from '../lib/storage';
import type { Account } from '../types';

export interface QuickFinanceParserOptions {
  accounts?: Account[];
  categories?: string[];
  defaultDate?: string;
  defaultAccountId?: string;
}

export interface ParsedQuickFinance {
  raw: string;
  isValid: boolean;
  amount: number | null;
  type: 'gasto' | 'ingreso';
  category: string | null;
  categoryMatched: string | null;
  accountId: string | null;
  accountName: string | null;
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
    'hogar', 'ute', 'ose', 'antel', 'wifi', 'internet', 'luz', 'agua', 'gas',
    'alquiler', 'gastos comunes', 'expensas', 'ferreteria', 'limpieza', 'muebles'
  ],
  Suscripciones: [
    'suscripcion', 'suscripción', 'suscripciones', 'netflix', 'spotify', 'youtube',
    'icloud', 'chatgpt', 'prime', 'amazon prime', 'disney', 'hbo', 'max', 'game pass'
  ],
  Salud: [
    'salud', 'farmacia', 'remedios', 'medicamentos', 'medico', 'médico', 'dentista',
    'psicologo', 'psicólogo', 'optica', 'óptica', 'mutualista', 'consulta'
  ],
  Ropa: [
    'ropa', 'indumentaria', 'zapatillas', 'calzado', 'championes', 'camisa',
    'pantalon', 'pantalón', 'shopping', 'remera', 'buzo'
  ],
};

export const DEFAULT_ACCOUNT_KEYWORDS: Record<string, string[]> = {
  banco: ['banco', 'brou', 'bbva', 'santander', 'itau', 'itaú', 'scotiabank', 'hsbc', 'heritage', 'transferencia'],
  efectivo: ['efectivo', 'cash', 'mano', 'plata', 'billetera'],
  mp: ['mp', 'mercadopago', 'mercado pago'],
  prex: ['prex', 'prexcard'],
  tarjeta: ['tarjeta', 'credito', 'crédito', 'debito', 'débito', 'visa', 'mastercard', 'oca', 'amex', 'passcard', 'cabal'],
  midinero: ['midinero', 'mi dinero'],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function formatDateLabel(iso: string, today: string): string {
  if (iso === today) return 'Hoy';
  const [ty, tm, td] = today.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const targetMs = Date.UTC(y, m - 1, d);
  const diffDays = Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays === -1) return 'Ayer';
  if (diffDays === -2) return 'Anteayer';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === 2) return 'Pasado mañana';

  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
}

function computeRelativeDate(baseISO: string, offsetDays: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return date.toISOString().slice(0, 10);
}

function findClosestDayOfWeek(baseISO: string, targetDayIndex: number): string {
  // targetDayIndex: 0 = domingo, 1 = lunes, ..., 6 = sabado
  const [y, m, d] = baseISO.split('-').map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d));
  const currentDay = baseDate.getUTCDay();
  let diff = targetDayIndex - currentDay;
  if (diff > 0) {
    diff -= 7; // look to the most recent past occurrence of that day
  }
  baseDate.setUTCDate(baseDate.getUTCDate() + diff);
  return baseDate.toISOString().slice(0, 10);
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

  // 1. Detect Type (income vs expense)
  let type: 'gasto' | 'ingreso' = 'gasto';
  let processed = raw;

  if (/^(\+U|\$U\s*\+|\+)/i.test(processed) || /\b(ingreso|cobro|sueldo|ganancia|honorarios)\b/i.test(processed)) {
    type = 'ingreso';
    processed = processed.replace(/^(\+U|\$U\s*\+|\+)\s*/i, '');
    processed = processed.replace(/\b(ingreso|cobro|sueldo|ganancia|honorarios)\b\s*/i, ' ');
  } else if (/^-/.test(processed)) {
    type = 'gasto';
    processed = processed.replace(/^-+\s*/, '');
  }

  // 2. Extract Amount
  // Matches: 500, 1200, 1.200, 1200.50, 1200,50, $500, $U 500
  let amount: number | null = null;
  const amountMatch = processed.match(/(?:\$U|\$)?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b/);

  if (amountMatch) {
    const rawNum = amountMatch[1].replace(/\./g, '').replace(',', '.');
    const parsedNum = parseFloat(rawNum);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      amount = parsedNum;
      // Remove amount from text to avoid false keyword matches
      processed = processed.replace(amountMatch[0], ' ');
    }
  }

  // 3. Extract Date (ayer, mañana, anteayer, viernes, 15/09, etc.)
  let targetDate = today;
  let dateLabel = 'Hoy';

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
    // Check day names
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

  // 4. Extract Account
  let matchedAccountId: string | null = null;
  let matchedAccountName: string | null = null;
  const accounts = options.accounts || [];

  // 4a. Check against user's actual accounts first
  for (const acc of accounts) {
    const normAcc = normalize(acc.name);
    const tokens = normAcc.split(/\s+/).filter((t) => t.length > 2);
    for (const token of tokens) {
      const reg = new RegExp(`\\b${token}\\b`, 'i');
      if (reg.test(normalize(processed))) {
        matchedAccountId = acc.id;
        matchedAccountName = acc.name;
        processed = processed.replace(reg, ' ');
        break;
      }
    }
    if (matchedAccountId) break;
  }

  // 4b. If no direct account matched, check against default account keywords
  if (!matchedAccountId) {
    for (const [canonicalAccount, keywords] of Object.entries(DEFAULT_ACCOUNT_KEYWORDS)) {
      for (const kw of keywords) {
        const reg = new RegExp(`\\b${normalize(kw)}\\b`, 'i');
        if (reg.test(normalize(processed))) {
          // Find matching account in options.accounts
          const found = accounts.find((a) =>
            normalize(a.name).includes(canonicalAccount) ||
            keywords.some((k) => normalize(a.name).includes(normalize(k)))
          );
          if (found) {
            matchedAccountId = found.id;
            matchedAccountName = found.name;
          } else {
            // Capitalized alias
            matchedAccountName = canonicalAccount.charAt(0).toUpperCase() + canonicalAccount.slice(1);
          }
          processed = processed.replace(reg, ' ');
          break;
        }
      }
      if (matchedAccountName) break;
    }
  }

  // 5. Extract Category
  let matchedCategory: string | null = null;
  const availableCategories = options.categories && options.categories.length > 0
    ? options.categories
    : Object.keys(DEFAULT_CATEGORY_KEYWORDS);

  // 5a. Check against configured/default keyword map
  for (const [catName, keywords] of Object.entries(DEFAULT_CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const reg = new RegExp(`\\b${normalize(kw)}\\b`, 'i');
      if (reg.test(normalize(processed))) {
        // Map to exact category in user's categories if available
        const exactMatch = availableCategories.find(
          (c) => normalize(c) === normalize(catName) || normalize(c).includes(normalize(catName))
        );
        matchedCategory = exactMatch || catName;
        processed = processed.replace(reg, ' ');
        break;
      }
    }
    if (matchedCategory) break;
  }

  // 5b. Check if any user category name appears directly
  if (!matchedCategory) {
    for (const cat of availableCategories) {
      const normCat = normalize(cat);
      if (normCat.length > 2) {
        const reg = new RegExp(`\\b${normCat}\\b`, 'i');
        if (reg.test(normalize(processed))) {
          matchedCategory = cat;
          processed = processed.replace(reg, ' ');
          break;
        }
      }
    }
  }

  // 6. Any remaining text becomes the note
  const cleanNote = processed
    .replace(/[,\-;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If fallback account is needed and default provided
  if (!matchedAccountId && options.defaultAccountId) {
    const defAcc = accounts.find((a) => a.id === options.defaultAccountId);
    if (defAcc) {
      matchedAccountId = defAcc.id;
      matchedAccountName = defAcc.name;
    }
  }

  // Build missing list
  const missing: ('amount' | 'category' | 'account')[] = [];
  if (amount === null) missing.push('amount');
  if (!matchedCategory) missing.push('category');
  if (!matchedAccountName && !matchedAccountId) missing.push('account');

  // Build formatted preview:
  // e.g.: "$U 500 · Comida · Banco · Hoy"
  // or: "$U 1.200 · Transporte · Cuenta no especificada"
  const formattedAmount = amount !== null
    ? `$U ${Math.round(amount).toLocaleString('es-UY')}`
    : '$U ?';
  const formattedCategory = matchedCategory || 'Categoría pendiente';
  const formattedAccount = matchedAccountName || 'Cuenta no especificada';

  const preview = `${formattedAmount} · ${formattedCategory} · ${formattedAccount} · ${dateLabel}`;

  return {
    raw,
    isValid: amount !== null && amount > 0,
    amount,
    type,
    category: matchedCategory,
    categoryMatched: matchedCategory,
    accountId: matchedAccountId,
    accountName: matchedAccountName,
    date: targetDate,
    dateLabel,
    note: cleanNote,
    preview,
    missing,
    confidence: {
      amount: amount !== null,
      category: matchedCategory !== null,
      account: (matchedAccountId !== null || matchedAccountName !== null),
    },
  };
}
