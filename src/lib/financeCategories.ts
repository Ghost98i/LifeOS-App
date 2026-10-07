import { Finance, FinanceCategory, FinanceCategoryInput, Transaction } from '../types';
import { uid } from './storage';

export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 'Comida', name: 'Comida', active: true },
  { id: 'Gimnasio', name: 'Gimnasio', active: true },
  { id: 'Estudio', name: 'Estudio', active: true },
  { id: 'Ocio', name: 'Ocio', active: true },
  { id: 'Streaming', name: 'Streaming', active: true },
  { id: 'Admin/Hogar', name: 'Admin/Hogar', active: true },
  { id: 'Transporte', name: 'Transporte', active: true },
  { id: 'Suscripciones', name: 'Suscripciones', active: true },
  { id: 'Reventa', name: 'Reventa', active: true },
  { id: 'Otros', name: 'Otros', active: true },
];

/**
 * Normalizes any category input (legacy string[], FinanceCategory[], or mixed)
 * into a valid, deduplicated array of FinanceCategory objects.
 * Also discovers historical categories present in transactions.
 */
export function normalizeCategories(
  raw: unknown,
  transactions?: Transaction[]
): FinanceCategory[] {
  const result: FinanceCategory[] = [];
  const seenIds = new Set<string>();
  const seenNormalizedNames = new Set<string>();

  const registerCategory = (
    id: string,
    name: string,
    active = true,
    createdAt?: string,
    updatedAt?: string
  ) => {
    const cleanId = id.trim();
    const cleanName = name.trim();
    if (!cleanId || !cleanName) return;

    const normName = cleanName.toLowerCase();
    if (seenIds.has(cleanId)) return;

    seenIds.add(cleanId);
    seenNormalizedNames.add(normName);
    result.push({
      id: cleanId,
      name: cleanName,
      active,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        registerCategory(item, item, true);
      } else if (item && typeof item === 'object') {
        const cat = item as Partial<FinanceCategory>;
        const rawId = typeof cat.id === 'string' ? cat.id : '';
        const rawName = typeof cat.name === 'string' ? cat.name : rawId;
        const active = cat.active !== false;
        registerCategory(rawId || rawName, rawName, active, cat.createdAt, cat.updatedAt);
      }
    }
  }

  // Discover categories from historical transactions that may have been omitted
  if (Array.isArray(transactions)) {
    for (const tx of transactions) {
      if (typeof tx?.category === 'string' && tx.category.trim()) {
        const catValue = tx.category.trim();
        if (!seenIds.has(catValue)) {
          // If a category with the same name already exists under a different ID, don't invent a duplicate name
          const norm = catValue.toLowerCase();
          if (!seenNormalizedNames.has(norm)) {
            registerCategory(catValue, catValue, true);
          }
        }
      }
    }
  }

  // If no categories were extracted, populate with defaults
  if (result.length === 0) {
    for (const def of DEFAULT_FINANCE_CATEGORIES) {
      registerCategory(def.id, def.name, def.active);
    }
  }

  // Invariant: 'Reventa' must always exist in LifeOS
  const hasReventa = result.some(
    (c) => c.name.toLowerCase() === 'reventa' || c.id === 'Reventa'
  );
  if (!hasReventa) {
    registerCategory('Reventa', 'Reventa', true);
  }

  return result;
}

/**
 * Returns only active categories available for new movements.
 */
export function getActiveCategories(
  categories?: FinanceCategoryInput[] | null
): FinanceCategory[] {
  if (!Array.isArray(categories)) return DEFAULT_FINANCE_CATEGORIES;
  return categories
    .map((c) => (typeof c === 'string' ? { id: c, name: c, active: true } : c))
    .filter((c) => c.active !== false);
}

/**
 * Returns all categories normalized.
 */
export function getAllCategories(
  categories?: FinanceCategoryInput[] | null
): FinanceCategory[] {
  if (!Array.isArray(categories)) return DEFAULT_FINANCE_CATEGORIES;
  return categories.map((c) =>
    typeof c === 'string' ? { id: c, name: c, active: true } : c
  );
}

/**
 * Finds a category by its stable ID.
 */
export function getCategoryById(
  categories?: FinanceCategoryInput[] | null,
  id?: string | null
): FinanceCategory | undefined {
  if (!id || !Array.isArray(categories)) return undefined;
  for (const c of categories) {
    if (typeof c === 'string') {
      if (c === id) return { id: c, name: c, active: true };
    } else if (c.id === id) {
      return c;
    }
  }
  return undefined;
}

/**
 * Gets the current display name of a category by ID or historical name.
 * If the category was renamed, this resolves the new name.
 * If not found, falls back gracefully to the provided string.
 */
export function getCategoryName(
  categories?: FinanceCategoryInput[] | null,
  idOrName?: string | null
): string {
  if (!idOrName) return '';
  if (!Array.isArray(categories)) return idOrName;

  // 1. Direct ID match
  const byId = categories.find((c) => (typeof c === 'string' ? c === idOrName : c.id === idOrName));
  if (byId) {
    return typeof byId === 'string' ? byId : byId.name;
  }

  // 2. Direct name match (for legacy data where name was used)
  const byName = categories.find((c) =>
    typeof c === 'string' ? c.toLowerCase() === idOrName.toLowerCase() : c.name.toLowerCase() === idOrName.toLowerCase()
  );
  if (byName) {
    return typeof byName === 'string' ? byName : byName.name;
  }

  return idOrName;
}

/**
 * Counts how many transactions are associated with each category.
 * Returns a map of categoryId -> count.
 */
export function countTransactionsByCategory(
  transactions?: Transaction[] | null,
  categories?: FinanceCategoryInput[] | null
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(transactions)) return counts;

  const catList = Array.isArray(categories) ? getAllCategories(categories) : [];
  const nameToIdMap = new Map<string, string>();
  for (const cat of catList) {
    nameToIdMap.set(cat.name.toLowerCase(), cat.id);
  }

  for (const tx of transactions) {
    const rawCat = tx.category || '';
    if (!rawCat) continue;

    // Match exact ID first
    let resolvedId = rawCat;
    if (nameToIdMap.has(rawCat.toLowerCase())) {
      resolvedId = nameToIdMap.get(rawCat.toLowerCase())!;
    }

    counts[resolvedId] = (counts[resolvedId] || 0) + 1;
    // Also record under rawCat if different to support lookup by raw string
    if (resolvedId !== rawCat) {
      counts[rawCat] = (counts[rawCat] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Validates a category name:
 * - Not empty after trim
 * - Max length 40 chars
 * - No case-insensitive / whitespace-insensitive duplicate with another category
 */
export function validateCategoryName(
  name: string,
  existingCategories: FinanceCategory[],
  currentCategoryId?: string
): { valid: boolean; error?: string } {
  const trimmed = (name || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { valid: false, error: 'El nombre de la categoría no puede estar vacío.' };
  }
  if (trimmed.length > 40) {
    return { valid: false, error: 'El nombre no puede superar los 40 caracteres.' };
  }

  const normalized = trimmed.toLowerCase();
  const duplicate = existingCategories.find(
    (c) => c.id !== currentCategoryId && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === normalized
  );

  if (duplicate) {
    return { valid: false, error: `Ya existe una categoría con el nombre "${duplicate.name}".` };
  }

  return { valid: true };
}

/**
 * Domain mutation: Add a new category to Finance state.
 */
export function addCategory(finance: Finance, name: string): FinanceCategory {
  const validation = validateCategoryName(name, finance.categories || []);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanName = name.trim().replace(/\s+/g, ' ');
  const newCat: FinanceCategory = {
    id: `cat_${uid()}`,
    name: cleanName,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!Array.isArray(finance.categories)) {
    finance.categories = [];
  }
  finance.categories.push(newCat);
  return newCat;
}

/**
 * Domain mutation: Rename an existing category.
 * Crucially, only the name and updatedAt are modified. The ID remains unchanged,
 * and historical transactions and budgets keep their stable association.
 */
export function renameCategory(
  finance: Finance,
  categoryId: string,
  newName: string
): FinanceCategory {
  const categories = finance.categories || [];
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    throw new Error('Categoría no encontrada.');
  }

  const validation = validateCategoryName(newName, categories, categoryId);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanName = newName.trim().replace(/\s+/g, ' ');
  category.name = cleanName;
  category.updatedAt = new Date().toISOString();
  return category;
}

/** Persist a category budget against its stable identity, never its display name. */
export function setCategoryBudget(finance: Finance, categoryId: string, amount: number): void {
  const category = (finance.categories || []).find((item) => item.id === categoryId);
  if (!category) throw new Error('Categoría no encontrada.');

  finance.budgets ||= {};
  finance.budgets[categoryId] = Number.isFinite(amount) ? amount : 0;
}

/**
 * Domain mutation: Archive a category.
 * The category is marked active: false. It is preserved for historical transactions,
 * but hidden from new transaction selectors.
 */
export function archiveCategory(finance: Finance, categoryId: string): void {
  const category = (finance.categories || []).find((c) => c.id === categoryId);
  if (!category) {
    throw new Error('Categoría no encontrada.');
  }
  category.active = false;
  category.updatedAt = new Date().toISOString();
}

/**
 * Domain mutation: Reactivate an archived category.
 */
export function reactivateCategory(finance: Finance, categoryId: string): void {
  const category = (finance.categories || []).find((c) => c.id === categoryId);
  if (!category) {
    throw new Error('Categoría no encontrada.');
  }
  category.active = true;
  category.updatedAt = new Date().toISOString();
}

/**
 * Domain mutation: Delete a category physically.
 * STRICT INVARIANT: Only allowed if the category has 0 historical transactions.
 */
export function deleteCategory(finance: Finance, categoryId: string): void {
  const categoryIndex = (finance.categories || []).findIndex((c) => c.id === categoryId);
  if (categoryIndex === -1) {
    throw new Error('Categoría no encontrada.');
  }

  const targetCategory = finance.categories[categoryIndex];
  const txCount = (finance.transactions || []).filter(
    (tx) => tx.category === targetCategory.id || tx.category === targetCategory.name
  ).length;

  if (txCount > 0) {
    throw new Error(
      `No se puede eliminar una categoría con ${txCount} movimiento(s) histórico(s). Archivá la categoría en su lugar para preservar la integridad financiera.`
    );
  }

  // Remove the category
  finance.categories.splice(categoryIndex, 1);

  // Clean up any budget for this category if exists
  if (finance.budgets) {
    delete finance.budgets[categoryId];
    delete finance.budgets[targetCategory.name];
  }
}
