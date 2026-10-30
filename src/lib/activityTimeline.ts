import { LifeOSState } from '../types';
import { AppIconName } from '../components/AppIcon';
import { getCategoryName } from './financeCategories';

export type ActivityModule = 'finance' | 'gym' | 'study' | 'task' | 'resale' | 'inbox' | 'checkout' | 'note' | 'jobs';

export interface ActivityTimelineItem {
  id: string;
  recordId?: string;
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
  const date = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // If timestamp has no time component (length <= 10 like YYYY-MM-DD)
  if (dateStr.length <= 10) {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

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

export interface ActivityTimelineOptions {
  hideAmounts?: boolean;
  privacyMode?: boolean;
}

export function getActivityTimeline(
  state: LifeOSState,
  limit: number = 8,
  options?: ActivityTimelineOptions
): ActivityTimelineItem[] {
  const items: ActivityTimelineItem[] = [];
  const hideAmounts = Boolean(options?.hideAmounts);
  const privacyMode = Boolean(options?.privacyMode);

  // 1. Transactions
  if (state.finance?.transactions) {
    for (const tx of state.finance.transactions) {
      if (!tx.date) continue;
      const isIncome = tx.type === 'ingreso';
      const resolvedCategory = getCategoryName(state.finance?.categories, tx.category);
      // Guard against dangling raw IDs like 'cat_xyz' or empty category
      const displayCategory = resolvedCategory && !resolvedCategory.startsWith('cat_')
        ? (hideAmounts ? resolvedCategory.replace(/(?:[$€£]|USD|UYU)\s*[-+]?\d[\d.,]*/gi, '').replace(/\b\d[\d.,]*\b/g, '').trim() : resolvedCategory)
        : (hideAmounts ? '' : 'Sin categoría');

      let title: string;
      let subtitle: string | undefined;

      if (hideAmounts) {
        if (tx.note) {
          const safeNote = tx.note.replace(/(?:[$€£]|USD|UYU)\s*[-+]?\d[\d.,]*/gi, '').replace(/\b\d[\d.,]*\b/g, '').replace(/\s{2,}/g, ' ').trim().replace(/[,:;.-]+$/, '');
          const lower = safeNote.toLowerCase();
          if (isIncome) {
            title = safeNote ? (lower.includes('ingreso') ? safeNote : `Ingreso de ${safeNote}`) : 'Ingreso registrado';
          } else {
            title = safeNote ? (lower.includes('gasto') ? safeNote : `Gasto en ${safeNote}`) : 'Gasto registrado';
          }
          subtitle = displayCategory || (isIncome ? 'Ingreso registrado' : 'Gasto registrado');
        } else if (displayCategory) {
          title = isIncome ? `Ingreso: ${displayCategory}` : `Gasto en ${displayCategory}`;
          subtitle = isIncome ? 'Ingreso registrado' : 'Gasto registrado';
        } else {
          title = isIncome ? 'Ingreso registrado' : 'Gasto registrado';
          subtitle = undefined;
        }
      } else {
        const formattedAmount = `$${Math.abs(tx.amount).toLocaleString('es-UY')}`;
        title = `${isIncome ? '+' : '-'}${formattedAmount} · ${displayCategory}`;
        subtitle = tx.note || (isIncome ? 'Ingreso registrado' : 'Gasto registrado');
      }

      items.push({
        id: `fin-${tx.id}`,
        module: 'finance',
        title,
        subtitle,
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
      const routineLabel = !privacyMode ? s.weekLabel?.trim() : '';
      items.push({
        id: `gym-${s.id}`,
        recordId: s.id,
        module: 'gym',
        title: `Gimnasio · ${isCompleted ? routineLabel || 'Entrenamiento completado' : 'Sesión en curso'}`,
        subtitle: isCompleted ? `${exercisesCount} ejercicio(s) registrados` : 'Entrenamiento activo',
        timestamp: s.finishedAt || s.startedAt || s.date,
        badgeText: 'Gym',
        badgeVariant: 'purple',
        iconName: 'dumbbell',
      });
    }

    const performedDates = new Set(state.gym.sessions.filter((session) => session.status === 'completed').map((session) => session.date));
    for (const date of new Set(state.gym.restDays || [])) {
      if (!date || performedDates.has(date)) continue;
      items.push({
        id: `gym-rest-${date}`,
        module: 'gym',
        title: 'Gimnasio · Descanso',
        subtitle: 'Descanso registrado',
        timestamp: date,
        badgeText: 'Descanso',
        badgeVariant: 'blue',
        iconName: 'moon',
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
          title: privacyMode ? 'Tarea completada' : extra.text,
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
          subtitle: hideAmounts ? 'Artículo vendido' : `Vendido por $${(res.sellPrice ?? 0).toLocaleString('es-UY')}`,
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
          subtitle: hideAmounts ? 'Artículo en inventario' : `Costo $${res.buyPrice.toLocaleString('es-UY')}`,
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

  // Notes have an existing exact-ID editor route in Hoy.
  for (const note of state.notes?.postits || []) {
    const timestamp = note.createdAt || note.updatedAt || note.date;
    if (!timestamp) continue;
    items.push({
      id: `note-${note.id}`,
      recordId: note.id,
      module: 'note',
      title: 'Nota creada',
      timestamp,
      iconName: 'note',
    });
  }

  // 7. Job Applications & Opportunities (Trabajo)
  if (state.jobs?.applications) {
    for (const app of state.jobs.applications) {
      if (!app.fecha) continue;
      items.push({
        id: `job-app-${app.id}`,
        recordId: app.id,
        module: 'jobs',
        title: privacyMode ? 'Postulación laboral' : `Postulación: ${app.empresa}`,
        subtitle: app.puesto ? `${app.puesto}` : 'Postulación registrada',
        timestamp: app.fecha,
        badgeText: 'Trabajo',
        badgeVariant: 'blue',
        iconName: 'briefcase',
      });
    }
  }

  if (state.jobs?.opportunities) {
    for (const opp of state.jobs.opportunities) {
      if (!opp.fecha) continue;
      items.push({
        id: `job-opp-${opp.id}`,
        recordId: opp.id,
        module: 'jobs',
        title: privacyMode ? 'Oportunidad laboral' : `Oportunidad: ${opp.empresa}`,
        subtitle: opp.puesto ? `${opp.puesto}` : 'Oportunidad registrada',
        timestamp: opp.fecha,
        badgeText: 'Trabajo',
        badgeVariant: 'blue',
        iconName: 'briefcase',
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

  const now = Date.now();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const seen = new Set<string>();
  return items
    .filter((item) => item.timestamp.length === 10 ? item.timestamp <= todayIso : parseTs(item.timestamp) <= now)
    .sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp) || a.id.localeCompare(b.id))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}
