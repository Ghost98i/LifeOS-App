import React, { useState, useMemo } from 'react';
import { Pencil, SlidersHorizontal, Store, Trash2 } from 'lucide-react';
import { Transaction, Account, FinanceCategoryInput } from '../types';
import type { CommercialSet } from '../lib/commercialContract';
import { resolveCommercialTransactionPresentation } from '../lib/commercialFinanceBridge';
import { fmtDate, formatMoney, sumMoney, diffMoney } from '../lib/storage';
import { resolveTransactionCurrency } from '../lib/calculations';
import { getCategoryName, getAllCategories } from '../lib/financeCategories';
import { getFinanceAccountIcon, getFinanceCategoryIcon } from '../lib/financeIcons';
import { identifyMerchant } from '../lib/merchantIdentity';
import { AppIcon } from './AppIcon';
import { PrivateFinancialText, PrivacyAmount } from './PrivacyAmount';
import { compareTransactionsChronologically, transactionTimeLabel } from '../lib/financeTransactionChronology';

interface FinanceTransactionTableProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: FinanceCategoryInput[];
  commercial?: CommercialSet | null;
  onOpenCommercial?: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
  totalGastadoAnio?: number;
}

type TypeFilter = 'all' | 'gasto' | 'ingreso';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const CLEAN_FOCUS_RING =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

export const FinanceTransactionTable: React.FC<FinanceTransactionTableProps> = ({
  transactions,
  accounts,
  categories,
  commercial,
  onOpenCommercial,
  onEdit,
  onDelete,
  totalGastadoAnio: _totalGastadoAnio,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [pageSize] = useState<number>(30);
  const [page, setPage] = useState<number>(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const allCats = useMemo(() => getAllCategories(categories), [categories]);

  // Active filter count
  const activeFiltersCount =
    (selectedAccount !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedType !== 'all' ? 1 : 0);

  const hasActiveFilters = activeFiltersCount > 0 || searchQuery.trim() !== '';

  const clearFilters = () => {
    setSelectedAccount('all');
    setSelectedCategory('all');
    setSelectedType('all');
    setSearchQuery('');
    setPage(1);
  };

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedAccount !== 'all' && t.accountId !== selectedAccount) {
        return false;
      }
      if (selectedCategory !== 'all') {
        const selName = getCategoryName(categories, selectedCategory).toLowerCase();
        const txCatName = getCategoryName(categories, t.category).toLowerCase();
        if (t.category !== selectedCategory && txCatName !== selName) {
          return false;
        }
      }
      if (selectedType !== 'all' && t.type !== selectedType) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const accountName = accounts.find((a) => a.id === t.accountId)?.name?.toLowerCase() || '';
        const commercialMeta = resolveCommercialTransactionPresentation(t, commercial);
        const note = (t.note || '').toLowerCase();
        const displayNote = commercialMeta.displayNote.toLowerCase();
        const originBadge = (commercialMeta.originBadge || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        const categoryDisplayName = getCategoryName(categories, t.category).toLowerCase();
        const amountStr = String(t.amount);
        const match =
          note.includes(query) ||
          displayNote.includes(query) ||
          originBadge.includes(query) ||
          category.includes(query) ||
          categoryDisplayName.includes(query) ||
          accountName.includes(query) ||
          amountStr.includes(query);
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, selectedAccount, selectedCategory, selectedType, searchQuery, accounts, categories, commercial]);

  // Sort logic
  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    list.sort((a, b) => {
      if (sortBy === 'date_desc') return compareTransactionsChronologically(b, a);
      if (sortBy === 'date_asc') return compareTransactionsChronologically(a, b);
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      return 0;
    });
    return list;
  }, [filteredTransactions, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, currentPage, pageSize]);

  // Totals for filtered transactions segregated by currency
  const totalsByCurrency = useMemo(() => {
    const result: Record<string, { gastos: number; ingresos: number; balance: number }> = {};
    for (const t of filteredTransactions) {
      const cur = resolveTransactionCurrency(t, accounts);
      if (!result[cur]) {
        result[cur] = { gastos: 0, ingresos: 0, balance: 0 };
      }
      if (t.type === 'gasto') {
        result[cur].gastos = sumMoney(result[cur].gastos, Number(t.amount || 0));
      } else if (t.type === 'ingreso') {
        result[cur].ingresos = sumMoney(result[cur].ingresos, Number(t.amount || 0));
      }
    }
    for (const cur of Object.keys(result)) {
      result[cur].balance = diffMoney(result[cur].ingresos, result[cur].gastos);
    }
    return result;
  }, [filteredTransactions, accounts]);

  const selectedAccountObj = accounts.find((a) => a.id === selectedAccount);
  const selectedCategoryName = selectedCategory !== 'all' ? getCategoryName(categories, selectedCategory) : null;

  return (
    <div className="space-y-3">
      {/* Clean Fintech Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Search bar */}
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <AppIcon
            name="search"
            className="finance-text-muted absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por comercio, categoría, cuenta..."
            className="finance-control w-full min-h-10 rounded-xl border py-2 pl-9 pr-8 text-xs placeholder:text-[var(--finance-text-muted)] outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
              className={`finance-text-muted absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md hover:text-[var(--finance-text-primary)] cursor-pointer ${CLEAN_FOCUS_RING}`}
            >
              <AppIcon name="x" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Toggle Button & Sort Selector */}
        <div className="flex items-center gap-2 relative">
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            aria-expanded={isFiltersOpen}
            className={`min-h-10 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${CLEAN_FOCUS_RING} ${
              activeFiltersCount > 0 || isFiltersOpen
                ? 'bg-indigo-500/10 border-indigo-500/35 text-indigo-700 dark:text-indigo-300'
                : 'finance-control'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 opacity-80 shrink-0" aria-hidden="true" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] leading-none tabular-nums bg-[#4F46E5] text-white font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Ordenar movimientos"
            className="finance-control min-h-10 flex-1 sm:flex-initial rounded-xl border px-3 py-2 text-xs font-medium outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="date_desc">Más recientes</option>
            <option value="date_asc">Más antiguos</option>
            <option value="amount_desc">Mayor monto</option>
            <option value="amount_asc">Menor monto</option>
          </select>

          {/* On-demand Filter Dropdown / Popover */}
          {isFiltersOpen && (
            <div className="finance-surface-raised absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] sm:w-96 p-4 rounded-2xl space-y-3.5 animate-in fade-in slide-in-from-top-2">
              <div className="finance-divider flex items-center justify-between pb-2 border-b">
                <span className="finance-text-primary text-xs font-bold">Filtros de Movimientos</span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ${CLEAN_FOCUS_RING}`}
                  >
                    Restablecer
                  </button>
                )}
              </div>

              {/* Cuenta */}
              <div className="space-y-1">
                <label className="finance-text-muted text-xs font-semibold block">
                  Cuenta
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => {
                    setSelectedAccount(e.target.value);
                    setPage(1);
                  }}
                  className="finance-control w-full rounded-xl border px-3 py-2 text-xs outline-none"
                >
                  <option value="all">Todas las cuentas ({transactions.length})</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      <PrivateFinancialText>{acc.name}</PrivateFinancialText>
                    </option>
                  ))}
                </select>
              </div>

              {/* Categoría */}
              <div className="space-y-1">
                <label className="finance-text-muted text-xs font-semibold block">
                  Categoría
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPage(1);
                  }}
                  className="finance-control w-full rounded-xl border px-3 py-2 text-xs outline-none"
                >
                  <option value="all">Todas las categorías</option>
                  {allCats.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      <PrivateFinancialText>{cat.name}</PrivateFinancialText> {!cat.active ? '(archivada)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo */}
              <div className="space-y-1">
                <label className="finance-text-muted text-xs font-semibold block">
                  Tipo
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedType('all');
                      setPage(1);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${CLEAN_FOCUS_RING} ${
                      selectedType === 'all'
                        ? 'bg-[#4F46E5] text-white'
                        : 'finance-surface-subtle finance-text-secondary'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedType('gasto');
                      setPage(1);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${CLEAN_FOCUS_RING} ${
                      selectedType === 'gasto'
                        ? 'bg-rose-600 text-white'
                        : 'finance-surface-subtle finance-text-secondary'
                    }`}
                  >
                    Gastos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedType('ingreso');
                      setPage(1);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${CLEAN_FOCUS_RING} ${
                      selectedType === 'ingreso'
                        ? 'bg-emerald-600 text-white'
                        : 'finance-surface-subtle finance-text-secondary'
                    }`}
                  >
                    Ingresos
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen(false)}
                  className={`px-3.5 py-1.5 rounded-lg bg-[#4F46E5] text-white text-xs font-semibold cursor-pointer hover:bg-[#4338CA] ${CLEAN_FOCUS_RING}`}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Filter Chips Rail */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
          <span className="finance-text-muted text-xs font-semibold">
            Filtros activos:
          </span>

          {selectedAccount !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-xs font-medium">
              <span>Cuenta: {selectedAccountObj?.name || selectedAccount}</span>
              <button
                type="button"
                aria-label="Quitar filtro de cuenta"
                onClick={() => {
                  setSelectedAccount('all');
                  setPage(1);
                }}
                className={`hover:text-rose-500 cursor-pointer inline-flex items-center ${CLEAN_FOCUS_RING}`}
              >
                <AppIcon name="x" className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedCategory !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-xs font-medium">
              <span>Categoría: <PrivateFinancialText>{selectedCategoryName || ''}</PrivateFinancialText></span>
              <button
                type="button"
                aria-label="Quitar filtro de categoría"
                onClick={() => {
                  setSelectedCategory('all');
                  setPage(1);
                }}
                className={`hover:text-rose-500 cursor-pointer inline-flex items-center ${CLEAN_FOCUS_RING}`}
              >
                <AppIcon name="x" className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedType !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-xs font-medium">
              <span>Tipo: {selectedType === 'gasto' ? 'Gastos' : 'Ingresos'}</span>
              <button
                type="button"
                aria-label="Quitar filtro de tipo"
                onClick={() => {
                  setSelectedType('all');
                  setPage(1);
                }}
                className={`hover:text-rose-500 cursor-pointer inline-flex items-center ${CLEAN_FOCUS_RING}`}
              >
                <AppIcon name="x" className="h-3 w-3" />
              </button>
            </span>
          )}

          {searchQuery.trim() !== '' && (
            <span className="finance-surface-subtle finance-text-secondary inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium">
              <span>Búsqueda: &ldquo;{searchQuery}&rdquo;</span>
              <button
                type="button"
                aria-label="Quitar búsqueda"
                onClick={() => setSearchQuery('')}
                className={`hover:text-rose-500 cursor-pointer inline-flex items-center ${CLEAN_FOCUS_RING}`}
              >
                <AppIcon name="x" className="h-3 w-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={clearFilters}
            className={`text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-1 ${CLEAN_FOCUS_RING}`}
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Main Fintech Transaction Feed */}
      {sortedTransactions.length === 0 ? (
        <div className="finance-surface rounded-2xl p-6 text-center">
          <p className="finance-text-primary text-sm font-semibold">
            {hasActiveFilters ? 'Sin resultados para estos filtros' : 'Sin movimientos registrados'}
          </p>
          <p className="finance-text-secondary mt-1 text-xs">
            {hasActiveFilters
              ? 'Probá ajustando o limpiando los filtros seleccionados.'
              : 'Todavía no registraste ningún movimiento financiero.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className={`mt-3 rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 px-3.5 py-1.5 text-xs font-semibold hover:bg-[#4F46E5] hover:text-white transition-colors cursor-pointer ${CLEAN_FOCUS_RING}`}
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <div className="finance-surface rounded-2xl overflow-hidden">
          <div
            role="list"
            aria-label="Listado de movimientos"
            data-finance-feed="true"
            className="divide-y divide-[var(--finance-border)]"
          >
            {paginatedTransactions.map((t) => {
              const account = accounts.find((a) => a.id === t.accountId);
              const txCurrency = resolveTransactionCurrency(t, accounts);
              const isExpense = t.type === 'gasto';
              const commercialMeta = resolveCommercialTransactionPresentation(t, commercial);
              const merchant = commercialMeta.isCommercial ? null : identifyMerchant(t.note);
              const categoryName = getCategoryName(categories, t.category);
              const displayLabel = commercialMeta.displayNote || categoryName || 'Movimiento';
              const categoryIconMeta = getFinanceCategoryIcon(
                commercialMeta.isCommercial ? 'Mi negocio' : categoryName
              );
              const CategoryIcon = categoryIconMeta.icon;
              const accountIconMeta = account ? getFinanceAccountIcon(account.name) : null;
              const AccountIcon = accountIconMeta?.icon;
              const timeLabel = transactionTimeLabel(t);

              return (
                <article
                  key={t.id}
                  role="listitem"
                  className="group flex items-start sm:items-center justify-between gap-2.5 sm:gap-4 px-3.5 py-3 sm:px-4 sm:py-3.5 hover:bg-[var(--finance-surface-hover)] transition-colors min-w-0"
                >
                  {/* Left: Squircle Category/Origin Icon + Description & Compact Metadata */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div
                      data-finance-category-icon={categoryIconMeta.iconName}
                      className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${categoryIconMeta.containerClass}`}
                      aria-hidden="true"
                    >
                      <CategoryIcon className={`h-4 w-4 sm:h-[18px] sm:w-[18px] ${categoryIconMeta.iconClass}`} strokeWidth={1.85} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <p className="finance-text-primary min-w-0 max-w-full text-sm font-medium leading-snug break-words [overflow-wrap:anywhere]">
                          <PrivateFinancialText>{displayLabel}</PrivateFinancialText>
                        </p>
                        {commercialMeta.isCommercial && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold border shrink-0 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25"
                            title="Origen: Mi negocio"
                          >
                            <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{commercialMeta.originBadge}</span>
                          </span>
                        )}
                        {merchant && !commercialMeta.isCommercial && (
                          <span
                            className="hidden sm:inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium border shrink-0"
                            style={{
                              backgroundColor: merchant.badgeBg,
                              color: merchant.badgeColor,
                              borderColor: merchant.badgeBorder,
                            }}
                          >
                            {merchant.name}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--finance-text-muted)] min-w-0">
                        <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-[var(--finance-text-secondary)]">
                          <PrivateFinancialText>{categoryName}</PrivateFinancialText>
                        </span>

                        {account?.name && AccountIcon && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              data-finance-account-icon={accountIconMeta.iconName}
                              className="inline-flex items-center gap-1 min-w-0"
                            >
                              <AccountIcon className="h-3.5 w-3.5 shrink-0 opacity-75" strokeWidth={1.75} aria-hidden="true" />
                              <span className="truncate max-w-[140px] sm:max-w-[180px]">
                                <PrivateFinancialText>{account.name}</PrivateFinancialText>
                              </span>
                            </span>
                          </>
                        )}

                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums whitespace-nowrap">
                          {fmtDate(t.date)}
                          {timeLabel && ` · ${timeLabel}`}
                        </span>

                        {t.fixed === 'fijo' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[var(--finance-text-muted)]">Fijo</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Signed Amount + Consistent Icon Actions */}
                  <div className="flex flex-col items-end sm:flex-row sm:items-center gap-1.5 sm:gap-3 shrink-0">
                    <PrivacyAmount
                      as="span"
                      className={`text-sm sm:text-[15px] font-semibold tabular-nums whitespace-nowrap text-right ${
                        isExpense
                          ? 'finance-text-primary'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isExpense ? '−' : '+'}
                      {formatMoney(t.amount, txCurrency)}
                    </PrivacyAmount>

                    <div className="flex items-center justify-end gap-1 sm:opacity-75 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      {commercialMeta.isCommercial ? (
                        onOpenCommercial ? (
                          <button
                            type="button"
                            onClick={onOpenCommercial}
                            title="Movimiento comercial protegido. Para corregir, devolver o reembolsar, abrí Mi negocio."
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 transition-colors cursor-pointer whitespace-nowrap ${CLEAN_FOCUS_RING}`}
                          >
                            <span>Mi negocio</span>
                            <AppIcon name="externalLink" className="h-3.5 w-3.5 shrink-0" />
                          </button>
                        ) : (
                          <span
                            title="Movimiento comercial protegido. Gestioná devoluciones, correcciones o reembolsos desde Mi negocio."
                            className="finance-text-muted rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap"
                          >
                            En Mi negocio
                          </span>
                        )
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(t)}
                            aria-label={`Editar movimiento ${displayLabel}`}
                            title="Editar movimiento"
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--finance-text-muted)] hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors cursor-pointer ${CLEAN_FOCUS_RING}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(t.id)}
                            aria-label={`Eliminar movimiento ${displayLabel}`}
                            title="Eliminar movimiento"
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--finance-text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer ${CLEAN_FOCUS_RING}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Clean Footer with Filtered Totals & Pagination */}
          <div className="finance-divider bg-[var(--finance-surface-subtle)] p-3 sm:px-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
            <div className="finance-text-secondary flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="tabular-nums">
                {filteredTransactions.length} {filteredTransactions.length === 1 ? 'movimiento' : 'movimientos'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Neto de la lista (ingresos − gastos):</span>
              {Object.keys(totalsByCurrency).length === 0 ? (
                <PrivacyAmount as="strong" className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatMoney(0, 'UYU')}
                </PrivacyAmount>
              ) : (
                (Object.entries(totalsByCurrency) as [string, { gastos: number; ingresos: number; balance: number }][]).map(([cur, data], idx) => (
                  <span key={cur} className="inline-flex items-center gap-1">
                    {idx > 0 && <span>|</span>}
                    <PrivacyAmount
                      as="strong"
                      className={
                        data.balance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400 tabular-nums'
                          : 'text-rose-600 dark:text-rose-400 tabular-nums'
                      }
                    >
                      {data.balance >= 0 ? '+' : ''}
                      {formatMoney(data.balance, cur)}
                    </PrivacyAmount>
                  </span>
                ))
              )}
              <span className="text-[var(--finance-text-muted)]">No es el saldo de las cuentas.</span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={`finance-control px-2.5 py-1 rounded-lg border disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-xs ${CLEAN_FOCUS_RING}`}
                >
                  Anterior
                </button>
                <span className="finance-text-secondary tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={`finance-control px-2.5 py-1 rounded-lg border disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-xs ${CLEAN_FOCUS_RING}`}
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
