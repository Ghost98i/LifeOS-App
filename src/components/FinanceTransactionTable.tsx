import React, { useState, useMemo } from 'react';
import { Transaction, Account, FinanceCategoryInput } from '../types';
import type { CommercialSet } from '../lib/commercialContract';
import { resolveCommercialTransactionPresentation } from '../lib/commercialFinanceBridge';
import { fmtDate, formatMoney, sumMoney, diffMoney } from '../lib/storage';
import { resolveTransactionCurrency } from '../lib/calculations';
import { getCategoryName, getAllCategories } from '../lib/financeCategories';
import { identifyMerchant } from '../lib/merchantIdentity';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
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
      // Account filter
      if (selectedAccount !== 'all' && t.accountId !== selectedAccount) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all') {
        const selName = getCategoryName(categories, selectedCategory).toLowerCase();
        const txCatName = getCategoryName(categories, t.category).toLowerCase();
        if (t.category !== selectedCategory && txCatName !== selName) {
          return false;
        }
      }
      // Type filter
      if (selectedType !== 'all' && t.type !== selectedType) {
        return false;
      }
      // Search query
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
      {/* Monarch-Style Clean Action Header: Search + On-Demand Filter Popover */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search bar */}
        <div className="relative min-w-[220px] flex-1 sm:max-w-md">
          <AppIcon
            name="search"
            className="finance-text-muted absolute left-3 top-2.5 h-4 w-4 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por comercio, categoría, cuenta..."
            className="finance-control w-full rounded-xl border py-2 pl-9 pr-8 text-xs placeholder:text-[var(--finance-text-muted)] outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="finance-text-muted absolute right-2.5 top-2 text-xs hover:text-[var(--finance-text-primary)] cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Toggle Button & Sort Selector */}
        <div className="flex items-center gap-2 relative">
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              activeFiltersCount > 0 || isFiltersOpen
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 font-bold shadow-2xs'
                : 'finance-control'
            }`}
          >
            <AppIcon name="settings" className="h-3.5 w-3.5 opacity-80" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums bg-indigo-600 text-white font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="finance-control rounded-xl border px-3 py-2 text-xs font-medium outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="date_desc">Más recientes</option>
            <option value="date_asc">Más antiguos</option>
            <option value="amount_desc">Mayor monto</option>
            <option value="amount_asc">Menor monto</option>
          </select>

          {/* On-demand Filter Dropdown / Popover */}
          {isFiltersOpen && (
            <div className="finance-surface-raised absolute right-0 top-12 z-30 w-80 sm:w-96 p-4 rounded-2xl space-y-3.5 animate-in fade-in slide-in-from-top-2">
              <div className="finance-divider flex items-center justify-between pb-2 border-b">
                <span className="finance-text-primary text-xs font-bold">Filtros de Movimientos</span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Restablecer
                  </button>
                )}
              </div>

              {/* Cuenta */}
              <div className="space-y-1">
                <label className="finance-text-muted text-[10px] font-bold uppercase tracking-wider">
                  Cuenta
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => {
                    setSelectedAccount(e.target.value);
                    setPage(1);
                  }}
                  className="finance-control w-full rounded-xl border px-3 py-1.5 text-xs outline-none"
                >
                  <option value="all">Todas las cuentas ({transactions.length})</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Categoría */}
              <div className="space-y-1">
                <label className="finance-text-muted text-[10px] font-bold uppercase tracking-wider">
                  Categoría
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPage(1);
                  }}
                  className="finance-control w-full rounded-xl border px-3 py-1.5 text-xs outline-none"
                >
                  <option value="all">Todas las categorías</option>
                  {allCats.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {!cat.active ? '(archivada)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo */}
              <div className="space-y-1">
                <label className="finance-text-muted text-[10px] font-bold uppercase tracking-wider">
                  Tipo
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedType('all');
                      setPage(1);
                    }}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      selectedType === 'all'
                        ? 'bg-[var(--accent)] text-white font-bold'
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
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      selectedType === 'gasto'
                        ? 'bg-rose-500 text-white font-bold'
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
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      selectedType === 'ingreso'
                        ? 'bg-emerald-600 text-white font-bold'
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
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer hover:bg-indigo-500"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Filter Chips Rail (Only appears when active filters exist) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="finance-text-muted text-[10px] font-bold uppercase">
            Filtros activos:
          </span>

          {selectedAccount !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[11px] font-medium">
              <span>Cuenta: {selectedAccountObj?.name || selectedAccount}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedAccount('all');
                  setPage(1);
                }}
                className="hover:text-rose-500 cursor-pointer font-bold"
              >
                ✕
              </button>
            </span>
          )}

          {selectedCategory !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[11px] font-medium">
              <span>Categoría: {selectedCategoryName}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setPage(1);
                }}
                className="hover:text-rose-500 cursor-pointer font-bold"
              >
                ✕
              </button>
            </span>
          )}

          {selectedType !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[11px] font-medium">
              <span>Tipo: {selectedType === 'gasto' ? 'Gastos' : 'Ingresos'}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('all');
                  setPage(1);
                }}
                className="hover:text-rose-500 cursor-pointer font-bold"
              >
                ✕
              </button>
            </span>
          )}

          {searchQuery.trim() !== '' && (
            <span className="finance-surface-subtle finance-text-secondary inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium">
              <span>Búsqueda: &ldquo;{searchQuery}&rdquo;</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="hover:text-rose-500 cursor-pointer font-bold"
              >
                ✕
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-1"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Main Transactions Surface: Open, Clean Monarch-Inspired Table */}
      {sortedTransactions.length === 0 ? (
        <div className="finance-surface rounded-2xl p-8 text-center">
          <p className="finance-text-primary text-sm font-semibold">No se encontraron movimientos</p>
          <p className="finance-text-secondary mt-1 text-xs">
            {hasActiveFilters
              ? 'Probá ajustando o limpiando los filtros seleccionados.'
              : 'Todavía no registraste ningún movimiento financiero.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <div className="finance-surface rounded-2xl overflow-hidden">
          {/* Mobile Card List */}
          <div className="divide-y divide-[var(--finance-border)] md:hidden">
            {paginatedTransactions.map((t) => {
              const account = accounts.find((a) => a.id === t.accountId);
              const txCurrency = resolveTransactionCurrency(t, accounts);
              const isExpense = t.type === 'gasto';
              const commercialMeta = resolveCommercialTransactionPresentation(t, commercial);
              const merchant = commercialMeta.isCommercial ? null : identifyMerchant(t.note);
              const displayLabel = commercialMeta.displayNote || getCategoryName(categories, t.category);
              return (
                <article key={t.id} className="p-3.5 space-y-2 hover:bg-[var(--finance-surface-hover)] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {commercialMeta.isCommercial ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25"
                            title="Origen: Mi negocio"
                          >
                            <span>🏪</span>
                            <span>{commercialMeta.originBadge}</span>
                          </span>
                        ) : merchant ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border shrink-0"
                            style={{
                              backgroundColor: merchant.badgeBg,
                              color: merchant.badgeColor,
                              borderColor: merchant.badgeBorder,
                            }}
                          >
                            <span>{merchant.icon}</span>
                            <span>{merchant.name}</span>
                          </span>
                        ) : (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isExpense
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {isExpense ? 'Gasto' : 'Ingreso'}
                          </span>
                        )}
                        <span className="finance-text-secondary text-[11px] font-medium">
                          {getCategoryName(categories, t.category)}
                        </span>
                        {account && (
                          <span className="finance-text-muted text-[10px]">
                            · {account.name}
                          </span>
                        )}
                      </div>
                      <p className="finance-text-primary mt-1 text-sm font-semibold leading-snug break-words [overflow-wrap:anywhere]">
                        {displayLabel}
                      </p>
                      <p className="finance-text-muted text-[11px] tabular-nums">
                        {fmtDate(t.date)}
                        {transactionTimeLabel(t) && ` · ${transactionTimeLabel(t)}`}
                        {t.fixed && ` · ${t.fixed}`}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <PrivacyAmount
                        as="strong"
                        className={`tabular-nums text-sm font-extrabold block ${
                          isExpense ? 'finance-text-primary' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isExpense ? '−' : '+'} {formatMoney(t.amount, txCurrency)}
                      </PrivacyAmount>
                      <div className="mt-1.5 flex items-center justify-end gap-1">
                        {commercialMeta.isCommercial ? (
                          onOpenCommercial ? (
                            <button
                              type="button"
                              onClick={onOpenCommercial}
                              title="Movimiento comercial protegido. Para corregir, devolver o reembolsar, abrí Mi negocio."
                              className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                            >
                              Mi negocio →
                            </button>
                          ) : (
                            <span
                              title="Movimiento comercial protegido. Gestioná devoluciones, correcciones o reembolsos desde Mi negocio."
                              className="finance-text-muted rounded-md px-2 py-0.5 text-[10px] font-semibold"
                            >
                              En Mi negocio
                            </span>
                          )
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onEdit(t)}
                              className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`¿Eliminar movimiento "${displayLabel}"?`)) {
                                  onDelete(t.id);
                                }
                              }}
                              className="finance-text-muted rounded-md px-1.5 py-0.5 text-[11px] hover:text-rose-500 cursor-pointer"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Clean Monarch Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="finance-divider finance-text-muted bg-[var(--finance-surface-subtle)] border-b uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-4">Comercio / Descripción</th>
                  <th className="py-3 px-3.5">Categoría</th>
                  <th className="py-3 px-3.5">Cuenta</th>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-4 text-right">Monto</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedTransactions.map((t) => {
                  const account = accounts.find((a) => a.id === t.accountId);
                  const txCurrency = resolveTransactionCurrency(t, accounts);
                  const isExpense = t.type === 'gasto';
                  const commercialMeta = resolveCommercialTransactionPresentation(t, commercial);
                  const merchant = commercialMeta.isCommercial ? null : identifyMerchant(t.note);
                  const displayLabel = commercialMeta.displayNote || getCategoryName(categories, t.category);
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-[var(--finance-surface-hover)] transition-colors group"
                    >
                      {/* Column 1: Merchant / Description */}
                      <td className="py-3 px-4 max-w-[280px]">
                        <div className="flex items-center gap-2">
                          {commercialMeta.isCommercial ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25"
                              title="Origen: Mi negocio"
                            >
                              <span>🏪</span>
                              <span>{commercialMeta.originBadge}</span>
                            </span>
                          ) : (
                            merchant && (
                              <span
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border shrink-0"
                                style={{
                                  backgroundColor: merchant.badgeBg,
                                  color: merchant.badgeColor,
                                  borderColor: merchant.badgeBorder,
                                }}
                              >
                                <span>{merchant.icon}</span>
                                <span>{merchant.name}</span>
                              </span>
                            )
                          )}
                          <span className="finance-text-primary min-w-0 font-semibold leading-snug break-words [overflow-wrap:anywhere]">
                            {displayLabel}
                          </span>
                        </div>
                      </td>

                      {/* Column 2: Categoría */}
                      <td className="finance-text-secondary py-3 px-3.5 whitespace-nowrap">
                        <span className="finance-surface-subtle finance-text-secondary inline-block px-2 py-0.5 rounded-md text-[11px] font-medium">
                          {getCategoryName(categories, t.category)}
                        </span>
                      </td>

                      {/* Column 3: Cuenta */}
                      <td className="finance-text-secondary py-3 px-3.5 whitespace-nowrap">
                        {account?.name ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            <span>{account.name}</span>
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>

                      {/* Column 4: Fecha */}
                      <td className="finance-text-secondary py-3 px-3 tabular-nums whitespace-nowrap">
                        {fmtDate(t.date)}
                        {transactionTimeLabel(t) && (
                          <span className="finance-text-muted block text-[10px]">{transactionTimeLabel(t)}</span>
                        )}
                      </td>

                      {/* Column 5: Tipo */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isExpense
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isExpense ? 'Gasto' : 'Ingreso'}
                        </span>
                      </td>

                      {/* Column 6: Monto */}
                      <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                        <PrivacyAmount
                          as="span"
                          className={`font-black text-xs sm:text-sm ${
                            isExpense ? 'finance-text-primary' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isExpense ? '−' : '+'} {formatMoney(t.amount, txCurrency)}
                        </PrivacyAmount>
                      </td>

                      {/* Column 7: Acciones */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          {commercialMeta.isCommercial ? (
                            onOpenCommercial ? (
                              <button
                                type="button"
                                onClick={onOpenCommercial}
                                title="Movimiento comercial protegido. Para corregir, devolver o reembolsar, abrí Mi negocio."
                                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                              >
                                Mi negocio →
                              </button>
                            ) : (
                              <span
                                title="Movimiento comercial protegido. Gestioná devoluciones, correcciones o reembolsos desde Mi negocio."
                                className="finance-text-muted rounded-lg px-2 py-1 text-[10px] font-semibold"
                              >
                                En Mi negocio
                              </span>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onEdit(t)}
                                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`¿Eliminar movimiento "${displayLabel}"?`)) {
                                    onDelete(t.id);
                                  }
                                }}
                                className="finance-text-muted rounded-lg px-1.5 py-1 text-[11px] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                title="Eliminar movimiento"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Clean Footer with Filtered Totals & Pagination */}
          <div className="finance-divider bg-[var(--finance-surface-subtle)] p-3 sm:px-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="finance-text-secondary flex flex-wrap items-center gap-2 sm:gap-3">
              <span>
                {filteredTransactions.length} {filteredTransactions.length === 1 ? 'movimiento' : 'movimientos'}
              </span>
              <span>·</span>
              <span>Neto:</span>
              {Object.keys(totalsByCurrency).length === 0 ? (
                <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatMoney(0, 'UYU')}
                </strong>
              ) : (
                (Object.entries(totalsByCurrency) as [string, { gastos: number; ingresos: number; balance: number }][]).map(([cur, data], idx) => (
                  <span key={cur} className="inline-flex items-center gap-1">
                    {idx > 0 && <span>|</span>}
                    <strong className={data.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400 tabular-nums' : 'text-rose-500 tabular-nums'}>
                      {data.balance >= 0 ? '+' : ''}{formatMoney(data.balance, cur)}
                    </strong>
                  </span>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="finance-control px-2.5 py-1 rounded-lg border disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-xs"
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
                  className="finance-control px-2.5 py-1 rounded-lg border disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-xs"
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
