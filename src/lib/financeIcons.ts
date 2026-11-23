import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Car,
  Dumbbell,
  Gamepad2,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Package,
  Repeat,
  ShoppingBag,
  Store,
  Tag,
  Tv,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface FinanceIconMeta {
  icon: LucideIcon;
  iconName: string;
  containerClass: string;
  iconClass: string;
}

function normalizeFinanceLabel(raw?: string | null): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(normalized: string, keyword: string): boolean {
  if (!normalized || !keyword) return false;
  if (normalized === keyword) return true;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(keyword)}(?:$|[^a-z0-9])`);
  return pattern.test(normalized);
}

const TINTS = {
  amber: {
    containerClass: 'bg-amber-500/10 border-amber-500/20 dark:bg-amber-400/10 dark:border-amber-400/20',
    iconClass: 'text-amber-700 dark:text-amber-300',
  },
  indigo: {
    containerClass: 'bg-indigo-500/10 border-indigo-500/20 dark:bg-indigo-400/12 dark:border-indigo-400/22',
    iconClass: 'text-indigo-700 dark:text-indigo-300',
  },
  emerald: {
    containerClass: 'bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-400/10 dark:border-emerald-400/20',
    iconClass: 'text-emerald-700 dark:text-emerald-300',
  },
  rose: {
    containerClass: 'bg-rose-500/10 border-rose-500/20 dark:bg-rose-400/10 dark:border-rose-400/20',
    iconClass: 'text-rose-700 dark:text-rose-300',
  },
  violet: {
    containerClass: 'bg-violet-500/10 border-violet-500/20 dark:bg-violet-400/10 dark:border-violet-400/20',
    iconClass: 'text-violet-700 dark:text-violet-300',
  },
  teal: {
    containerClass: 'bg-teal-500/10 border-teal-500/20 dark:bg-teal-400/10 dark:border-teal-400/20',
    iconClass: 'text-teal-700 dark:text-teal-300',
  },
  slate: {
    containerClass: 'bg-slate-500/10 border-slate-500/20 dark:bg-slate-400/10 dark:border-slate-400/20',
    iconClass: 'text-slate-600 dark:text-slate-300',
  },
} as const;

interface CategoryMatcher {
  keywords: string[];
  icon: LucideIcon;
  iconName: string;
  tint: keyof typeof TINTS;
}

const CATEGORY_MATCHERS: CategoryMatcher[] = [
  {
    keywords: ['mi negocio', 'negocio', 'comercial', 'tienda propia'],
    icon: Store,
    iconName: 'Store',
    tint: 'indigo',
  },
  {
    keywords: ['transferencia', 'transferir', 'traspaso'],
    icon: ArrowLeftRight,
    iconName: 'ArrowLeftRight',
    tint: 'indigo',
  },
  {
    keywords: ['comida', 'alimentacion', 'almuerzo', 'cena', 'desayuno', 'restaurante', 'supermercado', 'cafe', 'delivery'],
    icon: Utensils,
    iconName: 'Utensils',
    tint: 'amber',
  },
  {
    keywords: ['admin/hogar', 'hogar', 'casa', 'alquiler', 'vivienda', 'administracion', 'inmueble'],
    icon: Home,
    iconName: 'Home',
    tint: 'indigo',
  },
  {
    keywords: ['servicios', 'servicio', 'luz', 'agua', 'internet', 'telefono', 'antel', 'ute', 'ose', 'gas'],
    icon: Zap,
    iconName: 'Zap',
    tint: 'amber',
  },
  {
    keywords: ['prestamos y deudas', 'prestamo', 'prestamos', 'deuda', 'deudas', 'cuota', 'credito', 'financiamiento'],
    icon: HandCoins,
    iconName: 'HandCoins',
    tint: 'rose',
  },
  {
    keywords: ['sueldo', 'salario', 'haberes', 'aguinaldo', 'nomina', 'ingreso', 'ingresos', 'honorarios', 'cobro'],
    icon: Banknote,
    iconName: 'Banknote',
    tint: 'emerald',
  },
  {
    keywords: ['trabajo', 'laboral', 'freelance', 'empleo', 'oficina', 'proyecto'],
    icon: Briefcase,
    iconName: 'Briefcase',
    tint: 'emerald',
  },
  {
    keywords: ['reventa', 'stock', 'mercaderia', 'venta', 'ventas'],
    icon: Package,
    iconName: 'Package',
    tint: 'violet',
  },
  {
    keywords: ['compras', 'compra', 'ropa', 'indumentaria', 'shopping', 'regalos', 'regalo'],
    icon: ShoppingBag,
    iconName: 'ShoppingBag',
    tint: 'indigo',
  },
  {
    keywords: ['transporte', 'nafta', 'combustible', 'uber', 'taxi', 'omnibus', 'boleto', 'auto', 'moto', 'estacionamiento', 'peaje'],
    icon: Car,
    iconName: 'Car',
    tint: 'slate',
  },
  {
    keywords: ['salud', 'farmacia', 'medico', 'clinica', 'hospital', 'mutualista', 'odontologo', 'psicologo', 'bienestar'],
    icon: HeartPulse,
    iconName: 'HeartPulse',
    tint: 'rose',
  },
  {
    keywords: ['streaming', 'netflix', 'spotify', 'youtube', 'disney', 'hbo', 'twitch'],
    icon: Tv,
    iconName: 'Tv',
    tint: 'violet',
  },
  {
    keywords: ['suscripciones', 'suscripcion', 'membresia'],
    icon: Repeat,
    iconName: 'Repeat',
    tint: 'indigo',
  },
  {
    keywords: ['ocio', 'entretenimiento', 'salidas', 'cine', 'juegos', 'gaming', 'viajes', 'vacaciones', 'hobbies'],
    icon: Gamepad2,
    iconName: 'Gamepad2',
    tint: 'violet',
  },
  {
    keywords: ['educacion', 'estudio', 'estudios', 'facultad', 'universidad', 'curso', 'cursos', 'libros', 'capacitacion'],
    icon: GraduationCap,
    iconName: 'GraduationCap',
    tint: 'indigo',
  },
  {
    keywords: ['gimnasio', 'gym', 'deporte', 'entrenamiento', 'fitness', 'suplementos'],
    icon: Dumbbell,
    iconName: 'Dumbbell',
    tint: 'teal',
  },
];

/**
 * Maps a finance category name or origin label deterministically to a Lucide icon
 * and subtle sober tint classes suitable for light and dark themes.
 */
export function getFinanceCategoryIcon(categoryLabel?: string | null): FinanceIconMeta {
  const normalized = normalizeFinanceLabel(categoryLabel);
  if (normalized) {
    for (const matcher of CATEGORY_MATCHERS) {
      if (matcher.keywords.some((kw) => matchesKeyword(normalized, kw))) {
        const tint = TINTS[matcher.tint];
        return {
          icon: matcher.icon,
          iconName: matcher.iconName,
          containerClass: tint.containerClass,
          iconClass: tint.iconClass,
        };
      }
    }
  }

  return {
    icon: Tag,
    iconName: 'Tag',
    containerClass: TINTS.slate.containerClass,
    iconClass: TINTS.slate.iconClass,
  };
}

const CASH_ACCOUNT_KEYWORDS = ['efectivo', 'cash', 'mano', 'caja chica', 'billete', 'billetes'];
const BANK_ACCOUNT_KEYWORDS = [
  'banco',
  'bancaria',
  'bancario',
  'itau',
  'brou',
  'santander',
  'scotiabank',
  'scotia',
  'bbva',
  'hsbc',
  'bandes',
  'heritage',
  'caja de ahorro',
  'cuenta corriente',
  'debito',
];

/**
 * Maps an account name or type deterministically to a Lucide icon:
 * Efectivo -> Banknote, Banco -> Landmark, fallback -> Wallet.
 */
export function getFinanceAccountIcon(accountNameOrType?: string | null): FinanceIconMeta {
  const normalized = normalizeFinanceLabel(accountNameOrType);
  if (normalized) {
    if (CASH_ACCOUNT_KEYWORDS.some((kw) => matchesKeyword(normalized, kw))) {
      return {
        icon: Banknote,
        iconName: 'Banknote',
        containerClass: TINTS.emerald.containerClass,
        iconClass: TINTS.emerald.iconClass,
      };
    }
    if (BANK_ACCOUNT_KEYWORDS.some((kw) => matchesKeyword(normalized, kw))) {
      return {
        icon: Landmark,
        iconName: 'Landmark',
        containerClass: TINTS.indigo.containerClass,
        iconClass: TINTS.indigo.iconClass,
      };
    }
  }

  return {
    icon: Wallet,
    iconName: 'Wallet',
    containerClass: TINTS.slate.containerClass,
    iconClass: TINTS.slate.iconClass,
  };
}

const INCOME_PREFERRED_KEYWORDS = [
  'sueldo',
  'salario',
  'ingreso',
  'ingresos',
  'trabajo',
  'haberes',
  'honorarios',
  'freelance',
  'cobro',
  'cobros',
  'mi negocio',
  'reventa',
  'venta',
  'ventas',
  'inversion',
  'dividendos',
];

const NEUTRAL_CATEGORY_KEYWORDS = ['general', 'otros', 'varios', 'sin categoria'];

const EXPENSE_ONLY_KEYWORDS = [
  'comida',
  'alimentacion',
  'almuerzo',
  'cena',
  'restaurante',
  'supermercado',
  'transporte',
  'nafta',
  'combustible',
  'servicios',
  'admin/hogar',
  'hogar',
  'alquiler',
  'streaming',
  'suscripciones',
  'gimnasio',
  'salud',
  'farmacia',
  'ocio',
  'compras',
  'prestamos',
  'deudas',
  'estudio',
  'educacion',
];

export interface CategoryOptionLike {
  id: string;
  name: string;
  active?: boolean;
}

/**
 * Returns whether a category is strongly associated with food/everyday expenses
 * (and therefore should not be auto-preselected when switching to Ingreso).
 */
export function isExpenseBiasedCategory(categoryNameOrId?: string | null): boolean {
  const norm = normalizeFinanceLabel(categoryNameOrId);
  if (!norm) return false;
  return EXPENSE_ONLY_KEYWORDS.some((kw) => matchesKeyword(norm, kw));
}

/**
 * Picks a coherent default category when opening or switching between Gasto and Ingreso.
 * Crucially, Ingreso avoids preselecting food/expense categories like "Comida".
 */
export function resolveDefaultCategoryForType(
  type: 'gasto' | 'ingreso',
  categories: CategoryOptionLike[]
): string {
  const active = categories.filter((c) => c.active !== false);
  const pool = active.length > 0 ? active : categories;

  if (pool.length === 0) {
    return type === 'ingreso' ? 'Otros' : 'Comida';
  }

  if (type === 'gasto') {
    const nonIncome = pool.find((c) => {
      const norm = normalizeFinanceLabel(c.name || c.id);
      return !['sueldo', 'salario', 'ingreso', 'ingresos', 'haberes'].some((kw) => matchesKeyword(norm, kw));
    });
    return (nonIncome || pool[0]).id;
  }

  // Type === 'ingreso':
  // 1. Prefer explicit income-oriented categories in priority order
  for (const kw of INCOME_PREFERRED_KEYWORDS) {
    const match = pool.find((c) => {
      const norm = normalizeFinanceLabel(c.name || c.id);
      return matchesKeyword(norm, kw);
    });
    if (match) return match.id;
  }

  // 2. Otherwise prefer neutral/general categories (General, Otros, Varios)
  for (const kw of NEUTRAL_CATEGORY_KEYWORDS) {
    const match = pool.find((c) => {
      const norm = normalizeFinanceLabel(c.name || c.id);
      return matchesKeyword(norm, kw);
    });
    if (match) return match.id;
  }

  // 3. Otherwise pick the first category not strongly biased toward food/expenses
  const nonExpense = pool.find((c) => !isExpenseBiasedCategory(c.name || c.id));
  if (nonExpense) return nonExpense.id;

  // 4. Last resort: avoid "Comida" if another category exists
  const nonFood = pool.find((c) => {
    const norm = normalizeFinanceLabel(c.name || c.id);
    return !matchesKeyword(norm, 'comida');
  });
  return (nonFood || pool[0]).id;
}
