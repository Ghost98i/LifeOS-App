import React from 'react';
import { AppIcon } from './AppIcon';
import { FinanceCustomization } from '../lib/viewCustomization';

interface CustomizeFinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  customization?: FinanceCustomization;
  config?: FinanceCustomization;
  onChange?: (updated: FinanceCustomization) => void;
  onSave?: (updated: FinanceCustomization) => void;
}

export const CustomizeFinanceModal: React.FC<CustomizeFinanceModalProps> = ({
  isOpen,
  onClose,
  customization: customizationProp,
  config,
  onChange: onChangeProp,
  onSave,
}) => {
  if (!isOpen) return null;

  const currentCustomization = customizationProp || config;
  if (!currentCustomization) return null;

  const handleUpdate = (updated: FinanceCustomization) => {
    if (onChangeProp) onChangeProp(updated);
    if (onSave) onSave(updated);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-fin-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-2xl transition-all space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-[var(--blue)]">
              <AppIcon name="settings" className="h-5 w-5" />
            </div>
            <div>
              <h2 id="customize-fin-title" className="text-base font-black text-[var(--text)]">
                Personalizar Finanzas
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                Ajustá la jerarquía métrica y nivel de detalle del hero
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Hero Mode Selection (Monarch-style Protagonist Metric) */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)] block">
            Métrica Protagonista del Hero
          </label>
          <div className="space-y-1.5">
            {[
              {
                id: 'actual_balance',
                title: 'Saldo Actual (Recomendado)',
                desc: 'Muestra el dinero total en cuentas hoy como protagonista.',
              },
              {
                id: 'real_available',
                title: 'Disponible Real (Cushion-adjusted)',
                desc: 'Muestra el saldo tras restar compromisos fijos.',
              },
              {
                id: 'both',
                title: 'Balance Dual',
                desc: 'Muestra Saldo Actual y Disponible con igual peso visual.',
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  currentCustomization.heroDisplayMode === opt.id
                    ? 'border-[var(--blue)] bg-[var(--blue)]/5 text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--card-subtle)] text-[var(--text-soft)] hover:text-[var(--text)]'
                }`}
              >
                <input
                  type="radio"
                  name="heroDisplayMode"
                  value={opt.id}
                  checked={currentCustomization.heroDisplayMode === opt.id}
                  onChange={() =>
                    handleUpdate({
                      ...currentCustomization,
                      heroDisplayMode: opt.id as any,
                    })
                  }
                  className="mt-1 accent-[var(--blue)] cursor-pointer"
                />
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--text)]">{opt.title}</span>
                  <span className="block text-[11px] text-[var(--text-soft)]">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Commitments Strip Toggle */}
        <div className="pt-2 border-t border-[var(--border)]">
          <label className="flex items-center justify-between gap-3 cursor-pointer p-2 rounded-xl hover:bg-[var(--surface-muted)] transition-colors">
            <div>
              <span className="text-xs font-bold text-[var(--text)] block">
                Fila de Compromisos Próximos
              </span>
              <span className="text-[11px] text-[var(--text-soft)] block">
                Mostrar accesos rápidos a próximos pagos bajo el hero
              </span>
            </div>
            <input
              type="checkbox"
              checked={currentCustomization.showCommitmentsStrip}
              onChange={(e) =>
                handleUpdate({
                  ...currentCustomization,
                  showCommitmentsStrip: e.target.checked,
                })
              }
              className="rounded accent-[var(--blue)] cursor-pointer h-4 w-4"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--blue)] hover:brightness-110 text-white transition-all cursor-pointer shadow-xs"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};
