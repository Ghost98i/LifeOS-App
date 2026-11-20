import React, { useState } from 'react';
import { Check, Wallet } from 'lucide-react';
import {
  FINANCE_QUICK_ACCOUNT_PRESETS,
  type QuickAccountSetupItem,
} from '../lib/financeQuickSetup';
import { SurfaceCard, SectionHeader } from './ui/SurfacePrimitives';

interface FinanceQuickAccountsCardProps {
  onConfirm: (items: QuickAccountSetupItem[]) => void;
  onDismiss: () => void;
}

export const FinanceQuickAccountsCard: React.FC<FinanceQuickAccountsCardProps> = ({
  onConfirm,
  onDismiss,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () =>
      new Set(
        FINANCE_QUICK_ACCOUNT_PRESETS.filter((p) => p.defaultSelected).map((p) => p.id)
      )
  );
  const [balances, setBalances] = useState<Record<string, string>>({});

  const togglePreset = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedPresets = FINANCE_QUICK_ACCOUNT_PRESETS.filter((p) =>
    selectedIds.has(p.id)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPresets.length === 0) return;
    onConfirm(
      selectedPresets.map((preset) => ({
        name: preset.name,
        currency: preset.currency,
        initialBalanceInput: balances[preset.id] ?? '',
      }))
    );
  };

  return (
    <SurfaceCard
      data-finance-quick-setup
      className="p-5 sm:p-6 space-y-4"
      aria-label="Configurá tus cuentas en 10 segundos"
    >
      <SectionHeader
        icon={<Wallet size={17} strokeWidth={1.75} />}
        title="Configurá tus cuentas en 10 segundos"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Toggleable account chips */}
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Cuentas frecuentes"
        >
          {FINANCE_QUICK_ACCOUNT_PRESETS.map((preset) => {
            const isSelected = selectedIds.has(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => togglePreset(preset.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-indigo-300'
                    : 'border-slate-200/80 bg-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:text-slate-400 dark:hover:border-white/[0.16] dark:hover:text-slate-200'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-colors ${
                    isSelected
                      ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                      : 'border-slate-300 dark:border-white/20'
                  }`}
                >
                  {isSelected && <Check size={10} strokeWidth={2.5} />}
                </span>
                <span>{preset.name}</span>
                {preset.hint && (
                  <span className="text-[10px] font-medium opacity-65">
                    · {preset.hint}
                  </span>
                )}
                <span className="text-[10px] font-medium opacity-70">
                  {preset.currency}
                </span>
              </button>
            );
          })}
        </div>

        {/* Optional initial balances for selected accounts */}
        {selectedPresets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
            {selectedPresets.map((preset) => (
              <label
                key={preset.id}
                className="flex flex-col gap-1 text-xs"
              >
                <span className="flex items-center justify-between gap-2 font-medium text-slate-700 dark:text-slate-300">
                  <span className="truncate">{preset.name}</span>
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    {preset.currency}
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Saldo inicial de ${preset.name} (${preset.currency})`}
                  value={balances[preset.id] ?? ''}
                  onChange={(e) =>
                    setBalances((prev) => ({ ...prev, [preset.id]: e.target.value }))
                  }
                  placeholder="0 · opcional"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-hidden focus:ring-2 focus:ring-[#4F46E5]/20 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            Seguir con las cuentas por defecto
          </button>

          <button
            type="submit"
            disabled={selectedPresets.length === 0}
            className="rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar cuentas
          </button>
        </div>
      </form>
    </SurfaceCard>
  );
};
