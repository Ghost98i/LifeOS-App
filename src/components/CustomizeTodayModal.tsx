import React from 'react';
import { AppIcon } from './AppIcon';
import { TodayCustomization } from '../lib/viewCustomization';

interface CustomizeTodayModalProps {
  isOpen: boolean;
  onClose: () => void;
  customization?: TodayCustomization;
  config?: TodayCustomization;
  onChange?: (updated: TodayCustomization) => void;
  onSave?: (updated: TodayCustomization) => void;
}

const WIDGET_LABELS: Record<string, { label: string; desc: string }> = {
  focus: { label: 'Foco del Día (3 Claves)', desc: 'Prioridades esenciales con cumbre visual' },
  timeline: { label: 'Ahora y Siguiente (Agenda)', desc: 'Bloque activo y próximo compromiso' },
  gym: { label: 'Entrenamiento & Racha', desc: 'Progreso físico o descanso activo' },
  finance: { label: 'Liquidez y Compromisos', desc: 'Saldo actual y disponible a 30 días' },
  context: { label: 'Contexto Personal & Ritmo', desc: 'Sueño, energía y balance' },
  checklist: { label: 'Tareas y Rutinas de Hoy', desc: 'Checklist operativo del día' },
  notes: { label: 'Notas Rápidas', desc: 'Acceso a recordatorios y apuntes breves' },
  review: { label: 'Revisión Semanal', desc: 'Señales por excepción de los últimos 7 días' },
  activity: { label: 'Actividad Reciente', desc: 'Historial cruzado entre módulos' },
};

export const CustomizeTodayModal: React.FC<CustomizeTodayModalProps> = ({
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

  const handleUpdate = (updated: TodayCustomization) => {
    if (onChangeProp) onChangeProp(updated);
    if (onSave) onSave(updated);
  };

  const toggleWidget = (key: keyof TodayCustomization['visibleWidgets']) => {
    handleUpdate({
      ...currentCustomization,
      visibleWidgets: {
        ...currentCustomization.visibleWidgets,
        [key]: !currentCustomization.visibleWidgets[key],
      },
    });
  };

  const moveWidget = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...currentCustomization.widgetOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    handleUpdate({
      ...currentCustomization,
      widgetOrder: newOrder,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-today-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-2xl transition-all space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <AppIcon name="settings" className="h-5 w-5" />
            </div>
            <div>
              <h2 id="customize-today-title" className="text-base font-black text-[var(--text)]">
                Personalizar Hoy
              </h2>
              <p className="text-xs text-[var(--text-soft)]">
                Configurá qué bloques querés ver y en qué orden dentro de tu día
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

        {/* Widgets Visibles y Reordenables */}
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)] block">
            Bloques de Información & Orden
          </span>
          <div className="divide-y divide-[var(--border)]/60 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card-subtle)]">
            {currentCustomization.widgetOrder.map((widgetKey, idx) => {
              const meta = WIDGET_LABELS[widgetKey];
              if (!meta) return null;
              const isVisible = currentCustomization.visibleWidgets[widgetKey as keyof TodayCustomization['visibleWidgets']] !== false;

              return (
                <div key={widgetKey} className="p-2.5 sm:px-3 flex items-center justify-between gap-3 text-xs bg-[var(--card)]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      id={`w-vis-${widgetKey}`}
                      checked={isVisible}
                      onChange={() => toggleWidget(widgetKey as keyof TodayCustomization['visibleWidgets'])}
                      className="rounded accent-indigo-600 cursor-pointer h-4 w-4"
                    />
                    <label htmlFor={`w-vis-${widgetKey}`} className="min-w-0 cursor-pointer">
                      <span className={`block font-bold truncate ${isVisible ? 'text-[var(--text)]' : 'text-[var(--text-faint)] line-through'}`}>
                        {meta.label}
                      </span>
                      <span className="block text-[10px] text-[var(--text-faint)] truncate">
                        {meta.desc}
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveWidget(idx, 'up')}
                      className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-20 cursor-pointer"
                      title="Mover arriba"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === currentCustomization.widgetOrder.length - 1}
                      onClick={() => moveWidget(idx, 'down')}
                      className="p-1 rounded hover:bg-[var(--surface-muted)] text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-20 cursor-pointer"
                      title="Mover abajo"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer shadow-xs"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
