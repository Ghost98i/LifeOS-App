import React from 'react';
import type { LifeOSState } from '../types';
import { canConfirmDraft, type CaptureDraft } from '../lib/quickCaptureDrafts';
import { fmtMoney, formatMoney } from '../lib/storage';
import { AppIcon, type AppIconName } from './AppIcon';
import { PrivacyAmount, PrivateFinancialText } from './PrivacyAmount';

export interface LiveCapturePreviewProps {
  drafts: CaptureDraft[];
  state: LifeOSState;
  enterHint?: string;
}

function getDraftTypeBadge(draft: CaptureDraft): {
  label: string;
  icon: AppIconName;
  toneClass: string;
} {
  switch (draft.kind) {
    case 'finance':
      return draft.type === 'ingreso'
        ? {
            label: 'Ingreso',
            icon: 'wallet',
            toneClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          }
        : {
            label: 'Gasto',
            icon: 'wallet',
            toneClass: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
          };
    case 'study':
      return {
        label: 'Estudio',
        icon: 'book',
        toneClass: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
      };
    case 'task':
      return {
        label: 'Tarea',
        icon: 'check',
        toneClass: 'border-[#4F46E5]/30 bg-[#4F46E5]/10 text-[#4F46E5] dark:border-[#818CF8]/30 dark:bg-indigo-500/15 dark:text-[#818CF8]',
      };
    case 'note':
      return {
        label: 'Nota',
        icon: 'note',
        toneClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      };
    case 'idea':
      return {
        label: 'Idea',
        icon: 'lightbulb',
        toneClass: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
      };
    case 'agenda':
      return {
        label: 'Agenda',
        icon: 'calendar',
        toneClass: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
      };
    case 'work':
      return {
        label: 'Trabajo',
        icon: 'briefcase',
        toneClass: 'border-[#4F46E5]/30 bg-[#4F46E5]/10 text-[#4F46E5] dark:border-[#818CF8]/30 dark:bg-indigo-500/15 dark:text-[#818CF8]',
      };
    case 'resale':
      return {
        label: draft.type === 'venta' ? 'Venta' : 'Compra',
        icon: 'store',
        toneClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
      };
    default:
      return {
        label: 'Bandeja',
        icon: 'inbox',
        toneClass: 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)]',
      };
  }
}

const SingleDraftChips: React.FC<{ draft: CaptureDraft }> = ({ draft }) => {
  const pillBase =
    'inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--text)]';

  if (draft.kind === 'finance') {
    return (
      <>
        {draft.amount !== undefined ? (
          <span className={`${pillBase} font-bold tabular-nums`}>
            <PrivacyAmount>{formatMoney(draft.amount, draft.currency || 'UYU')}</PrivacyAmount>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Falta monto
          </span>
        )}
        {(draft.categoryMatched || draft.category) && (
          <span className={pillBase}>{draft.categoryMatched || draft.category}</span>
        )}
        {draft.accountName && (
          <span className={`${pillBase} text-[var(--text-soft)]`}>
            <PrivateFinancialText>{draft.accountName}</PrivateFinancialText>
          </span>
        )}
        {draft.dateLabel && (
          <span className={`${pillBase} text-[var(--text-soft)] tabular-nums`}>{draft.dateLabel}</span>
        )}
        {draft.installments && draft.installments > 1 && (
          <span className={pillBase}>{draft.installments} cuotas</span>
        )}
      </>
    );
  }

  if (draft.kind === 'study') {
    return (
      <>
        <span className={`${pillBase} font-bold tabular-nums`}>{draft.minutes} min</span>
        <span className={pillBase}>{draft.subjectName || 'General'}</span>
        {draft.dateLabel && <span className={`${pillBase} text-[var(--text-soft)]`}>{draft.dateLabel}</span>}
      </>
    );
  }

  if (draft.kind === 'task') {
    return (
      <>
        <span className="text-xs font-semibold text-[var(--text)] truncate max-w-[240px]">
          {draft.text}
        </span>
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold capitalize ${
            draft.priority === 'alta'
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
              : draft.priority === 'baja'
              ? 'bg-[var(--bg-elevated)] text-[var(--text-soft)] border border-[var(--border)]'
              : 'bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-indigo-500/15 dark:text-[#818CF8]'
          }`}
        >
          {draft.priority}
        </span>
        {draft.dueDateLabel && <span className={`${pillBase} text-[var(--text-soft)]`}>{draft.dueDateLabel}</span>}
        {draft.time && <span className={`${pillBase} tabular-nums`}>{draft.time}</span>}
      </>
    );
  }

  if (draft.kind === 'note') {
    return (
      <>
        <span className="text-xs font-semibold text-[var(--text)] truncate max-w-[240px]">
          {draft.title || draft.text}
        </span>
        {draft.tags &&
          draft.tags.slice(0, 2).map((tag) => (
            <span key={tag} className={`${pillBase} text-[var(--text-soft)]`}>
              #{tag}
            </span>
          ))}
      </>
    );
  }

  if (draft.kind === 'agenda') {
    return (
      <>
        <span className="text-xs font-semibold text-[var(--text)] truncate max-w-[220px]">
          {draft.activity}
        </span>
        {draft.dateLabel && <span className={`${pillBase} text-[var(--text-soft)]`}>{draft.dateLabel}</span>}
        {draft.time && <span className={`${pillBase} tabular-nums`}>{draft.time}</span>}
      </>
    );
  }

  if (draft.kind === 'work') {
    return (
      <>
        {draft.company && <span className={`${pillBase} font-bold`}>{draft.company}</span>}
        <span className="text-xs text-[var(--text)] truncate max-w-[200px]">{draft.action}</span>
      </>
    );
  }

  if (draft.kind === 'resale') {
    return (
      <>
        <span className="text-xs font-semibold text-[var(--text)] truncate max-w-[200px]">
          {draft.title}
        </span>
        {draft.price !== undefined && (
          <span className={`${pillBase} font-bold tabular-nums`}>
            <PrivacyAmount>{fmtMoney(draft.price)}</PrivacyAmount>
          </span>
        )}
      </>
    );
  }

  return (
    <span className="text-xs text-[var(--text)] truncate max-w-[260px]">
      {draft.text}
    </span>
  );
};

export const LiveCapturePreview: React.FC<LiveCapturePreviewProps> = ({
  drafts,
  state,
  enterHint = 'Enter',
}) => {
  if (drafts.length === 0) return null;

  if (drafts.length === 1) {
    const draft = drafts[0];
    const badge = getDraftTypeBadge(draft);
    const validation = canConfirmDraft(state, draft);
    const warningText = !draft.isModuleEnabled
      ? 'Módulo desactivado'
      : !validation.valid
      ? validation.reason || 'Completar datos'
      : draft.ambiguityWarning || null;

    return (
      <div
        data-live-capture-preview="single"
        className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs flex-wrap"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold shrink-0 ${badge.toneClass}`}
          >
            <AppIcon name={badge.icon} className="h-3.5 w-3.5" />
            <span>{badge.label}</span>
          </span>
          <SingleDraftChips draft={draft} />
        </div>

        {warningText ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 shrink-0">
            <AppIcon name="alertCircle" className="h-3 w-3" />
            <span>{warningText}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
            <AppIcon name="check" className="h-3 w-3" />
            <span>Listo · {enterHint}</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      data-live-capture-preview="multi"
      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs flex-wrap"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 font-bold text-[var(--text)]">
          <AppIcon name="sparkles" className="h-3.5 w-3.5 text-[#4F46E5] dark:text-[#818CF8]" />
          <span>{drafts.length} capturas:</span>
        </span>
        {drafts.slice(0, 4).map((d) => {
          const b = getDraftTypeBadge(d);
          return (
            <span
              key={d.id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${b.toneClass}`}
            >
              <AppIcon name={b.icon} className="h-3 w-3" />
              <span>{b.label}</span>
            </span>
          );
        })}
      </div>
      <span className="text-[10px] font-semibold text-[var(--text-soft)]">
        Revisar · {enterHint}
      </span>
    </div>
  );
};
