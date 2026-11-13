import React from 'react';
import type { LifeOSState, DailyPriority } from '../types';
import { TodayFocus } from './TodayFocus';
import { todayISO, uid } from '../lib/storage';
import { adoptSmartDailyPriorities } from '../lib/smartPriorities';
import { showToast } from '../lib/toast';
import { playSound } from '../lib/audio';

export interface PrioritiesWidgetProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  className?: string;
  title?: string;
}

export const PrioritiesWidget: React.FC<PrioritiesWidgetProps> = ({
  state,
  onUpdateState,
  className = '',
  title = 'Prioridades del día',
}) => {
  const todayIso = todayISO();
  const todayPriorities = (state.dailyPriorities || []).filter(
    (p) => p.date === todayIso
  );

  const handleToggle = (item: DailyPriority) => {
    const nextCompleted = !item.done;
    const saved = onUpdateState((draft) => {
      const target = (draft.dailyPriorities || []).find((p) => p.id === item.id);
      if (target) {
        target.done = nextCompleted;
      }
    });
    if (saved && nextCompleted) {
      playSound('success');
    }
  };

  const handleAdd = (text: string) => {
    onUpdateState((draft) => {
      if (!draft.dailyPriorities) draft.dailyPriorities = [];
      const existing = draft.dailyPriorities.filter((p) => p.date === todayIso);
      const usedRanks = existing.map((p) => p.rank || 0);
      const nextRank = [1, 2, 3].find((rank) => !usedRanks.includes(rank)) || existing.length + 1;
      draft.dailyPriorities.push({
        id: uid(),
        date: todayIso,
        text: text.trim(),
        done: false,
        rank: nextRank,
      });
    });
    showToast('Prioridad agregada para hoy.', 'success');
  };

  const handleRemove = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.dailyPriorities) return;
      draft.dailyPriorities = draft.dailyPriorities.filter((p) => p.id !== id);
    });
    showToast('Prioridad eliminada.', 'info');
  };

  const handleSmartSuggest = () => {
    onUpdateState((draft) => {
      const added = adoptSmartDailyPriorities(draft, 3);
      if (added > 0) {
        showToast(`${added} prioridad(es) sugeridas según tu día.`, 'success');
      } else {
        showToast('No encontramos nuevas prioridades para sugerir.', 'info');
      }
    });
  };

  const motivosVisibles = state.settings?.motivosPrioridadesVisibles !== false;

  const handleToggleMotivos = () => {
    onUpdateState((draft) => {
      if (!draft.settings) return;
      const currentlyVisible = draft.settings.motivosPrioridadesVisibles !== false;
      draft.settings.motivosPrioridadesVisibles = !currentlyVisible;
    });
  };

  return (
    <section
      className={`today-primary-surface rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-5 shadow-[var(--card-shadow)] ${className}`}
      aria-label={title}
    >
      <TodayFocus
        priorities={todayPriorities}
        onAdd={handleAdd}
        onToggle={handleToggle}
        onRemove={handleRemove}
        onSmartSuggest={handleSmartSuggest}
        motivosVisibles={motivosVisibles}
        onToggleMotivos={handleToggleMotivos}
        title={title}
      />
    </section>
  );
};
