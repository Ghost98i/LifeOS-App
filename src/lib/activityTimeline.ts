import { LifeOSState } from '../types';
import { AppIconName } from '../components/AppIcon';
import { getCategoryName } from './financeCategories';

export type ActivityModule = 'finance' | 'gym' | 'study' | 'task' | 'resale' | 'inbox' | 'checkout';

export interface ActivityTimelineItem {
  id: string;
  module: ActivityModule;
  title: string;
  subtitle?: string;
  timestamp: string; // ISO date string or YYYY-MM-DD
  badgeText?: string;
  badgeVariant?: 'blue' | 'green' | 'amber' | 'purple' | 'red';
  iconName: AppIconName;
}

export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // If timestamp has no time component (length <= 10 like YYYY-MM-DD)
  if (dateStr.length <= 10) {
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toISOString().slice(0, 10);

    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === yestStr) return 'Ayer';
    return date.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
  }

  if (diffHours < 1) {
    const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `Hace ${diffMins} min`;
  }
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return `Hoy ${date.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Ayer ${date.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
}

export function getActivityTimeline(state: LifeOSState, limit: number = 8): ActivityTimelineItem[] {
  const items: ActivityTimelineItem[] = [];

  // 1. Transactions
  if (state.finance?.transactions) {
    for (const tx of state.finance.transactions) {
      if (!tx.date) continue;
      const isIncome = tx.type === 'ingreso';
      const formattedAmount = `$${Math.abs(tx.amount).toLocaleString('es-UY')}`;
      const resolvedCategory = getCategoryName(state.finance?.categories, tx.category);
      // Guard against dangling raw IDs like 'cat_xyz' or empty category
      const displayCategory = resolvedCategory && !resolvedCategory.startsWith('cat_')
        ? resolvedCategory
        : 'Sin categoría';

      items.push({
        id: `fin-${tx.id}`,
        module: 'finance',
        title: `${isIncome ? '+' : '-'}${formattedAmount} · ${displayCategory}`,
        subtitle: tx.note || (isIncome ? 'Ingreso registrado' : 'Gasto registrado'),
        timestamp: tx.date,
        badgeText: isIncome ? 'Ingreso' : 'Gasto',
        badgeVariant: isIncome ? 'green' : 'amber',
        iconName: 'wallet',
      });
    }
  }

  // 2. Gym Sessions
  if (state.gym?.sessions) {
    for (const s of state.gym.sessions) {
      if (!s.date) continue;
      const isCompleted = s.status === 'completed';
      const exercisesCount = s.exercises?.length ?? 0;
      items.push({
        id: `gym-${s.id}`,
        module: 'gym',
        title: isCompleted ? 'Entrenamiento completado' : 'Sesión de entrenamiento',
        subtitle: `${exercisesCount} ejercicio(s) registrados`,
        timestamp: s.finishedAt || s.startedAt || s.date,
        badgeText: 'Gym',
        badgeVariant: 'purple',
        iconName: 'dumbbell',
      });
    }
  }

  // 3. Study Logs
  if (state.study?.studyLog) {
    const subjectsMap = new Map((state.study.subjects || []).map(s => [s.id, s.name]));
    for (const log of state.study.studyLog) {
      if (!log.date) continue;
      const subjName = (log.subjectId && subjectsMap.get(log.subjectId)) || 'General';
      items.push({
        id: `study-${log.id}`,
        module: 'study',
        title: `Estudio: ${log.minutes} min`,
        subtitle: subjName,
        timestamp: log.date,
        badgeText: 'Estudio',
        badgeVariant: 'blue',
        iconName: 'book',
      });
    }
  }

  // 4. Completed Today Extras
  if (state.todayExtras) {
    for (const extra of state.todayExtras) {
      if (extra.done && extra.date) {
        items.push({
          id: `task-${extra.id}`,
          module: 'task',
          title: extra.text,
          subtitle: 'Tarea completada',
          timestamp: extra.date,
          badgeText: 'Tarea',
          badgeVariant: 'green',
          iconName: 'check',
        });
      }
    }
  }

  // 5. Resale Inventory Updates
  if (state.resale?.inventory) {
    for (const res of state.resale.inventory) {
      if (res.status === 'vendido' && res.sellDate) {
        items.push({
          id: `resale-sold-${res.id}`,
          module: 'resale',
          title: `Venta: ${res.item}`,
          subtitle: `Vendido por $${(res.sellPrice ?? 0).toLocaleString('es-UY')}`,
          timestamp: res.sellDate,
          badgeText: 'Reventa',
          badgeVariant: 'green',
          iconName: 'trendingUp',
        });
      } else if (res.buyDate) {
        items.push({
          id: `resale-buy-${res.id}`,
          module: 'resale',
          title: `Compra: ${res.item}`,
          subtitle: `Costo $${res.buyPrice.toLocaleString('es-UY')}`,
          timestamp: res.buyDate,
          badgeText: 'Reventa',
          badgeVariant: 'amber',
          iconName: 'trendingUp',
        });
      }
    }
  }

  // 6. Inbox Items
  if (state.inbox) {
    for (const inboxItem of state.inbox) {
      if (!inboxItem.createdAt) continue;
      items.push({
        id: `inbox-${inboxItem.id}`,
        module: 'inbox',
        title: inboxItem.text,
        subtitle: 'Capturado en bandeja',
        timestamp: inboxItem.createdAt,
        badgeText: 'Inbox',
        badgeVariant: 'blue',
        iconName: 'note',
      });
    }
  }

  // Sort descending by timestamp
  const parseTs = (ts: string) => {
    // If it's pure YYYY-MM-DD, set mid-day to avoid TZ boundary shift
    const clean = ts.length === 10 ? `${ts}T12:00:00` : ts;
    const time = new Date(clean).getTime();
    return isNaN(time) ? 0 : time;
  };

  items.sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp));

  return items.slice(0, limit);
}
