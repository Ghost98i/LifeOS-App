import React, { useMemo, useRef } from 'react';
import {
  Activity,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Dumbbell,
  FileText,
  History,
  Moon,
  ShoppingBag,
  Wallet,
  X,
} from 'lucide-react';
import type { LifeOSState, ViewType } from '../types';
import {
  formatRelativeTime,
  getActivityTimeline,
  type ActivityTimelineItem,
} from '../lib/activityTimeline';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { ListDivider } from './ui/SurfacePrimitives';

export interface RecentActivityModalProps {
  open: boolean;
  onClose: () => void;
  state: LifeOSState;
  onNavigate: (view: ViewType) => void;
  onOpenNote?: (noteId: string) => void;
}

const moduleToView: Record<string, ViewType> = {
  finance: 'finanzas',
  gym: 'gimnasio',
  study: 'estudios',
  resale: 'reventa',
  task: 'agenda',
  inbox: 'notas',
  note: 'notas',
  jobs: 'trabajo',
};

const moduleLabel: Record<ActivityTimelineItem['module'], string> = {
  finance: 'Finanzas',
  gym: 'Gimnasio',
  study: 'Estudios',
  task: 'Agenda',
  resale: 'Reventa',
  inbox: 'Notas',
  checkout: 'Cierre',
  note: 'Nota',
  jobs: 'Trabajo',
};

function renderActivityIcon(module: ActivityTimelineItem['module']) {
  const cls = 'h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500';
  switch (module) {
    case 'finance':
      return <Wallet className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'gym':
      return <Dumbbell className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'study':
      return <BookOpen className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'jobs':
      return <Briefcase className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'resale':
      return <ShoppingBag className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'note':
    case 'inbox':
      return <FileText className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'checkout':
      return <Moon className={cls} strokeWidth={1.75} aria-hidden="true" />;
    case 'task':
      return <CheckCircle2 className={cls} strokeWidth={1.75} aria-hidden="true" />;
    default:
      return <Activity className={cls} strokeWidth={1.75} aria-hidden="true" />;
  }
}

export const RecentActivityModal: React.FC<RecentActivityModalProps> = ({
  open,
  onClose,
  state,
  onNavigate,
  onOpenNote,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  const items = useMemo(() => {
    if (!open) return [];
    return getActivityTimeline(state, Number.MAX_SAFE_INTEGER, {
      hideAmounts: true,
      privacyMode: state.settings.privacyMode,
    })
      .filter((activity) => {
        const view = moduleToView[activity.module];
        return !view || isModuleEnabled(state, view);
      })
      .slice(0, 15);
  }, [open, state]);

  if (!open) return null;

  const handleSelect = (item: ActivityTimelineItem) => {
    onClose();
    if (item.module === 'note' && item.recordId && onOpenNote) {
      onOpenNote(item.recordId);
    } else {
      onNavigate(moduleToView[item.module] || 'dashboard');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recent-activity-modal-title"
      className="celestian-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="celestian-modal-panel relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-2xl sm:rounded-2xl dark:border-white/[0.08] dark:bg-[#0D111A]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden="true" />
            <h2
              id="recent-activity-modal-title"
              className="text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100"
            >
              Actividad reciente
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar historial de actividad"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay actividad registrada.
            </p>
          ) : (
            <ListDivider>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="group flex w-full items-start gap-3 py-3 text-left transition hover:opacity-90 cursor-pointer"
                >
                  <span className="mt-0.5">{renderActivityIcon(item.module)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{item.badgeText === 'Gym' ? 'Gimnasio' : item.badgeText || moduleLabel[item.module]}</span>
                      {item.subtitle && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{item.subtitle}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <time dateTime={item.timestamp}>{formatRelativeTime(item.timestamp)}</time>
                    </span>
                  </span>
                </button>
              ))}
            </ListDivider>
          )}
        </div>
      </div>
    </div>
  );
};
