import React, { useState, useMemo } from 'react';
import { Transaction, Account } from '../types';
import { fmtDate, fmtMoney } from '../lib/storage';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceTransactionTableProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: string[];
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
  onEdit,
  onDelete,
  totalGastadoAnio,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [pageSize, setPageSize] = useState<number>(30);
  const [page, setPage] = useState<number>(1);

  // Quick account counts
  const accountCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      const accId = t.accountId || 'unknown';
      map[accId] = (map[accId] || 0) + 1;
    }
    return map;
  }, [transactions]);

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Account filter
      if (selectedAccount !== 'all' && t.accountId !== selectedAccount) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && t.category !== selectedCategory) {
        return false;
      }
      // Type filter
      if (selectedType !== 'all' && t.type !== selectedType) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const accountName = accounts.find((a) => a.id === t.accountId)?.name?.toLowerCase() || '';
        const note = (t.note || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        const amountStr = String(t.amount);
        const match =
          note.includes(query) ||
          category.includes(query) ||
          accountName.includes(query) ||
          amountStr.includes(query);
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, selectedAccount, selectedCategory, selectedType, searchQuery, accounts]);

  // Sort logic
  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    list.sort((a, b) => {
      if (sortBy === 'date_desc') return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
      if (sortBy === 'date_asc') return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
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

  // Totals for filtered transactions
  const totals = useMemo(() => {
    let gastos = 0;
    let ingresos = 0;
    for (const t of filteredTransactions) {
      if (t.type === 'gasto') gastos += Number(t.amount || 0);
      else if (t.type === 'ingreso') ingresos += Number(t.amount || 0);
    }
    return { gastos, ingresos, balance: ingresos - gastos };
  }, [filteredTransactions]);

  const hasActiveFilters =
    selectedAccount !== 'all' ||
    selectedCategory !== 'all' ||
    selectedType !== 'all' ||
    searchQuery.trim() !== '';

  const clearFilters = () => {
    setSelectedAccount('all');
    setSelectedCategory('all');
    setSelectedType('all');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text)]">
              Tabla de Movimientos
            </h2>
            <span className="rounded-full bg-[var(--surface-muted)] border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold font-mono text-[var(--text-soft)]">
              {filteredTransactions.length} {filteredTransactions.length === 1 ? 'movimiento' : 'movimientos'}
            </span>
          </div>
          {typeof totalGastadoAnio === 'number' && (
            <p className="mt-0.5 text-xs text-[var(--text-soft)]">
              Gastado este año: <strong className="font-mono text-[var(--text)]">{fmtMoney(totalGastadoAnio)}</strong>
            </p>
          )}
        </div>

        {/* Search bar & Sorting */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:w-64">
            <AppIcon
              name="search"
              className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-faint)] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar en movimientos..."
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text)] placeholder-[var(--text-faint)] outline-hidden focus:border-[var(--blue)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-xs text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] outline-hidden focus:border-[var(--blue)] cursor-pointer"
          >
            <option value="date_desc">Más recientes primero</option>
            <option value="date_asc">Más antiguos primero</option>
            <option value="amount_desc">Mayor monto</option>
            <option value="amount_asc">Menor monto</option>
          </select>
        </div>
      </div>

      {/* Notion-style Filter Controls: 1-Click Filters */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-4 space-y-3 shadow-xs">
        {/* Row 1: Account 1-Click Filter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Filtrar por Cuenta
            </span>
            {selectedAccount !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedAccount('all');
                  setPage(1);
                }}
                className="text-[10px] font-semibold text-[var(--blue)] hover:underline"
              >
                Restablecer cuenta
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedAccount('all');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedAccount === 'all'
                  ? 'bg-[var(--text)] text-[var(--bg)] font-bold shadow-xs'
                  : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
              }`}
            >
              <span>Todas las cuentas</span>
              <span className="text-[10px] opacity-70">({transactions.length})</span>
            </button>
            {accounts.map((acc) => {
              const count = accountCounts[acc.id] || 0;
              const isSelected = selectedAccount === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setSelectedAccount(acc.id);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-[var(--text)] text-[var(--bg)] font-bold shadow-xs'
                      : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
                  }`}
                >
                  <span>{acc.name}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Category 1-Click Filter */}
        <div className="space-y-1.5 border-t border-[var(--border)]/60 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Filtrar por Categoría
            </span>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setPage(1);
                }}
                className="text-[10px] font-semibold text-[var(--blue)] hover:underline"
              >
                Restablecer categoría
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setPage(1);
              }}
              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-[var(--blue)] text-white font-bold shadow-xs'
                  : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
              }`}
            >
              Todas las categorías
            </button>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setPage(1);
                  }}
                  className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-[var(--blue)] text-white font-bold shadow-xs'
                      : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Type Filter & Active Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/60 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--text-faint)] mr-1">Tipo:</span>
            <button
              type="button"
              onClick={() => {
                setSelectedType('all');
                setPage(1);
              }}
              className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                selectedType === 'all'
                  ? 'bg-[var(--text)] text-[var(--bg)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
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
              className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                selectedType === 'gasto'
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-bold'
                  : 'text-[var(--text-soft)] hover:text-red-500'
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
              className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                selectedType === 'ingreso'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-[var(--text-soft)] hover:text-emerald-500'
              }`}
            >
              Ingresos
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:underline"
            >
              <span>✕ Limpiar todos los filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Filtered Balance Summary Bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-center">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Total Gastos
          </span>
          <p className="font-mono text-xs sm:text-sm font-bold text-red-500 mt-0.5">
            − <PrivacyAmount>{fmtMoney(totals.gastos)}</PrivacyAmount>
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Total Ingresos
          </span>
          <p className="font-mono text-xs sm:text-sm font-bold text-emerald-500 mt-0.5">
            + <PrivacyAmount>{fmtMoney(totals.ingresos)}</PrivacyAmount>
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Neto Filtrado
          </span>
          <p
            className={`font-mono text-xs sm:text-sm font-bold mt-0.5 ${
              totals.balance >= 0 ? 'text-emerald-500' : 'text-red-500'
            }`}
          >
            {totals.balance >= 0 ? '+' : ''}
            <PrivacyAmount>{fmtMoney(totals.balance)}</PrivacyAmount>
          </p>
        </div>
      </div>

      {/* Transactions Clean Table */}
      {sortedTransactions.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm font-semibold text-[var(--text)]">No se encontraron movimientos</p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            {hasActiveFilters
              ? 'Probá ajustando o limpiando los filtros seleccionados.'
              : 'Todavía no cargaste ningún movimiento.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--blue)] hover:text-white transition-colors"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-xs">
          {/* Mobile Card List */}
          <div className="divide-y divide-[var(--border)] md:hidden">
            {paginatedTransactions.map((t) => {
              const account = accounts.find((a) => a.id === t.accountId);
              const isExpense = t.type === 'gasto';
              return (
                <article key={t.id} className="p-3.5 space-y-2 hover:bg-[var(--surface-muted)]/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isExpense
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isExpense ? 'Gasto' : 'Ingreso'}
                        </span>
                        <span className="rounded-md bg-[var(--surface-muted)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-soft)]">
                          {t.category}
                        </span>
                        {account && (
                          <span className="text-[10px] text-[var(--text-faint)]">
                            · {account.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-[var(--text)] truncate">
                        {t.note || t.category}
                      </p>
                      <p className="text-[11px] text-[var(--text-faint)] font-mono">
                        {fmtDate(t.date)}
                        {t.fixed && ` · ${t.fixed}`}
                        {t.origin === 'adjustment' && ' · Conciliación'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <PrivacyAmount
                        as="strong"
                        className={`font-mono text-sm font-extrabold block ${
                          isExpense ? 'text-red-500' : 'text-emerald-500'
                        }`}
                      >
                        {isExpense ? '−' : '+'} {fmtMoney(t.amount)}
                      </PrivacyAmount>
                      <div className="mt-1.5 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(t)}
                          className="rounded-md px-2 py-1 text-[11px] font-bold text-[var(--blue)] hover:bg-[var(--blue-soft)]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Eliminar movimiento "${t.note || t.category}"?`)) {
                              onDelete(t.id);
                            }
                          }}
                          className="rounded-md px-1.5 py-1 text-[11px] text-[var(--text-faint)] hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Clean Notion-style Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-faint)] uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-2.5 px-3.5">Fecha</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3.5">Categoría</th>
                  <th className="py-2.5 px-3.5">Cuenta</th>
                  <th className="py-2.5 px-3.5">Nota / Detalle</th>
                  <th className="py-2.5 px-3">Marca</th>
                  <th className="py-2.5 px-4 text-right">Monto</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedTransactions.map((t) => {
                  const account = accounts.find((a) => a.id === t.accountId);
                  const isExpense = t.type === 'gasto';
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-[var(--surface-muted)]/50 transition-colors group"
                    >
                      <td className="py-2.5 px-3.5 font-mono text-[var(--text-soft)] whitespace-nowrap">
                        {fmtDate(t.date)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isExpense
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isExpense ? 'Gasto' : 'Ingreso'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-[var(--text)] whitespace-nowrap">
                        <span className="inline-block rounded-md bg-[var(--surface-muted)] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text)]">
                          {t.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-[var(--text-soft)] whitespace-nowrap">
                        {account?.name ? (
                          <span className="inline-flex items-center gap-1 font-medium text-[var(--text-soft)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]" />
                            {account.name}
                          </span>
                        ) : (
                          <span className="text-[var(--text-faint)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-[var(--text)] max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">
                            {t.note || <span className="text-[var(--text-faint)] italic">Sin nota</span>}
                          </span>
                          {t.origin === 'adjustment' && (
                            <span className="shrink-0 rounded-sm bg-blue-500/10 px-1.5 py-0.2 text-[9px] font-bold text-blue-500">
                              conciliación
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="rounded-full bg-[var(--surface-muted)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-faint)]">
                          {t.fixed || 'variable'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-right whitespace-nowrap">
                        <PrivacyAmount className={isExpense ? 'text-red-500' : 'text-emerald-500'}>
                          {isExpense ? '−' : '+'} {fmtMoney(t.amount)}
                        </PrivacyAmount>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onEdit(t)}
                            className="rounded-md px-2 py-1 text-[11px] font-bold text-[var(--blue)] hover:bg-[var(--blue-soft)]"
                            title="Editar movimiento"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`¿Eliminar movimiento "${t.note || t.category}"?`)) {
                                onDelete(t.id);
                              }
                            }}
                            className="rounded-md p-1 text-[var(--text-faint)] hover:text-red-500 hover:bg-red-500/10"
                            title="Eliminar movimiento"
                          >
                            <AppIcon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination & Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-soft)]">
            <div className="flex items-center gap-2">
              <span>
                Mostrando {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, sortedTransactions.length)} de{' '}
                {sortedTransactions.length}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-xs text-[var(--text)] outline-hidden"
              >
                <option value={15}>15 por pág.</option>
                <option value={30}>30 por pág.</option>
                <option value={50}>50 por pág.</option>
                <option value={100}>100 por pág.</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold disabled:opacity-40 hover:bg-[var(--bg)]"
                >
                  Anterior
                </button>
                <span className="px-2 font-mono text-xs">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold disabled:opacity-40 hover:bg-[var(--bg)]"
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
