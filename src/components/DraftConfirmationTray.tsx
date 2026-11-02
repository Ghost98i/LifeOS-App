import React, { useState } from 'react';
import type { LifeOSState } from '../types';
import {
  CaptureDraft,
  FinanceDraft,
  TaskDraft,
  StudyDraft,
  canConfirmDraft,
} from '../lib/quickCaptureDrafts';
import { fmtMoney, formatMoney, todayISO } from '../lib/storage';
import { MODULE_NAV_METADATA, isModuleEnabled } from '../lib/moduleVisibility';
import { AppIcon, AppIconName } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

export interface DraftConfirmationTrayProps {
  drafts: CaptureDraft[];
  state: LifeOSState;
  confirmingDraftIds?: Set<string>;
  isConfirmingAll?: boolean;
  onUpdateDraft: (updated: CaptureDraft) => void;
  onConfirmDraft: (draft: CaptureDraft) => void;
  onConfirmAll?: () => void;
  onDiscardDraft: (draftId: string) => void;
  onDiscardAll?: () => void;
  onEnableModule: (draft: CaptureDraft) => void;
  onConvertToNote: (draft: CaptureDraft) => void;
  onConvertToInbox?: (draft: CaptureDraft) => void;
}

export const DraftConfirmationTray: React.FC<DraftConfirmationTrayProps> = ({
  drafts,
  state,
  confirmingDraftIds,
  isConfirmingAll,
  onUpdateDraft,
  onConfirmDraft,
  onConfirmAll,
  onDiscardDraft,
  onDiscardAll,
  onEnableModule,
  onConvertToNote,
  onConvertToInbox,
}) => {
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  if (!drafts || drafts.length === 0) return null;

  const validDraftsCount = drafts.filter((d) => canConfirmDraft(state, d).valid).length;
  const allValid = drafts.length > 0 && validDraftsCount === drafts.length;

  return (
    <div className="w-full flex flex-col gap-2.5 p-3 sm:p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-md animate-fadeIn transition-all">
      {/* Tray Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]/60">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--accent)] shrink-0">
            <AppIcon name="sparkles" className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-[var(--text)]">
            Borradores para revisar
          </span>
          <span className="px-1.5 py-0.5 text-[11px] tabular-nums font-bold rounded-full bg-[var(--surface-muted)] text-[var(--text-soft)] border border-[var(--border)]">
            {drafts.length}
          </span>
          {!allValid && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium hidden sm:inline">
              ({validDraftsCount} de {drafts.length} listos)
            </span>
          )}
        </div>

        {/* Global actions if multiple drafts */}
        {drafts.length > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onConfirmAll && (
              <button
                type="button"
                onClick={onConfirmAll}
                disabled={!allValid || isConfirmingAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title={allValid ? 'Guardar todos los borradores' : 'Hay borradores incompletos que requieren revisión antes de guardar'}
              >
                <AppIcon name="check" className="h-3 w-3" />
                <span>{isConfirmingAll ? 'Guardando…' : 'Guardar todos'}</span>
              </button>
            )}
            {onDiscardAll && (
              <button
                type="button"
                onClick={onDiscardAll}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-soft)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
                title="Descartar todos los borradores pendientes"
              >
                Descartar todos
              </button>
            )}
          </div>
        )}
      </div>

      {/* List of Draft Cards */}
      <div className="flex flex-col gap-2">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            state={state}
            isEditing={editingDraftId === draft.id}
            isConfirming={confirmingDraftIds?.has(draft.id)}
            onToggleEdit={() =>
              setEditingDraftId((prev) => (prev === draft.id ? null : draft.id))
            }
            onUpdateDraft={onUpdateDraft}
            onConfirm={() => onConfirmDraft(draft)}
            onDiscard={() => onDiscardDraft(draft.id)}
            onEnableModule={() => onEnableModule(draft)}
            onConvertToNote={() => onConvertToNote(draft)}
            onConvertToInbox={onConvertToInbox ? () => onConvertToInbox(draft) : undefined}
          />
        ))}
      </div>
    </div>
  );
};

interface DraftCardProps {
  draft: CaptureDraft;
  state: LifeOSState;
  isEditing: boolean;
  isConfirming?: boolean;
  onToggleEdit: () => void;
  onUpdateDraft: (updated: CaptureDraft) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  onEnableModule: () => void;
  onConvertToNote: () => void;
  onConvertToInbox?: () => void;
}

const DraftCard: React.FC<DraftCardProps> = ({
  draft,
  state,
  isEditing,
  isConfirming,
  onToggleEdit,
  onUpdateDraft,
  onConfirm,
  onDiscard,
  onEnableModule,
  onConvertToNote,
  onConvertToInbox,
}) => {
  const meta = getDraftMeta(draft);
  const isMissingAmount = draft.missingFields?.includes('amount');
  const isMissingCategory = draft.missingFields?.includes('category');

  const isFinance = draft.kind === 'finance';
  const finDraft = isFinance ? (draft as FinanceDraft) : null;
  const draftCurrency = (finDraft?.currency || 'UYU').toUpperCase();
  const accounts = state.finance?.accounts || [];
  const hasUsdAccount = accounts.some((a) => (a.currency || 'UYU').toUpperCase() === 'USD');
  const selectedAccount = finDraft?.accountId ? accounts.find((a) => a.id === finDraft.accountId) : null;
  const selectedAccCurrency = (selectedAccount?.currency || 'UYU').toUpperCase();

  const isInstallmentBlocked = isFinance && Boolean(finDraft?.installments && finDraft.installments > 1);
  const isForeignUnsupported = isFinance && draftCurrency !== 'UYU' && draftCurrency !== 'USD';
  const isMissingUsdAccount = isFinance && draftCurrency === 'USD' && !hasUsdAccount;
  const isCurrencyMismatch = isFinance && !isMissingUsdAccount && !isForeignUnsupported && Boolean(selectedAccount && draftCurrency !== selectedAccCurrency);
  const isFinanceCurrencyBlocked = isForeignUnsupported || isMissingUsdAccount || isCurrencyMismatch;

  const validation = canConfirmDraft(state, draft);
  const canConfirm = validation.valid;
  const accountDeleted = isFinance && !canConfirm && validation.reason === 'Cuenta inexistente';
  const categoryArchived = isFinance && !canConfirm && validation.reason === 'Categoría archivada';

  const targetModuleMeta = MODULE_NAV_METADATA[draft.targetModule];
  const moduleName = targetModuleMeta?.label || draft.targetModule;
  const isNotasEnabled = isModuleEnabled(state, 'notas');

  return (
    <div className="p-2.5 sm:p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)] transition-all flex flex-col gap-2">
      {/* Main unified row: Badge + Content on Left/Center, Action Cluster on Right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          {/* Badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold shrink-0 ${meta.badgeClass}`}
          >
            <AppIcon name={meta.icon} className="h-3 w-3" />
            <span>{meta.label}</span>
          </span>

          {/* Warning: Module Disabled */}
          {!draft.isModuleEnabled && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
              <AppIcon name="eyeOff" className="h-3 w-3" />
              <span>Módulo {moduleName} desactivado</span>
            </span>
          )}

          {/* Warning: Installment purchase */}
          {isInstallmentBlocked && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
              <span>Compra en cuotas</span>
            </span>
          )}

          {/* Warning: Requires USD account (Caso A) */}
          {isMissingUsdAccount && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
              <span>Requiere cuenta USD</span>
            </span>
          )}

          {/* Warning: Currency mismatch (Caso B) */}
          {isCurrencyMismatch && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
              <span>Moneda incompatible ({draftCurrency} vs {selectedAccCurrency})</span>
            </span>
          )}

          {/* Warning: Foreign unsupported */}
          {isForeignUnsupported && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
              <span>Moneda no soportada ({draftCurrency})</span>
            </span>
          )}

          {/* Warning: Account Deleted */}
          {accountDeleted && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
              <span>Cuenta inexistente</span>
            </span>
          )}

          {/* Warning: Category Archived */}
          {categoryArchived && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
              <span>Categoría archivada</span>
            </span>
          )}

          {/* Warning: Missing amount */}
          {isMissingAmount && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 shrink-0">
              <span>Importe requerido</span>
            </span>
          )}

          {/* Warning: Missing category */}
          {isMissingCategory && !categoryArchived && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
              <span>Categoría pendiente</span>
            </span>
          )}

          {/* Inline Content Summary */}
          {!isEditing && (
            <div className="text-xs sm:text-sm text-[var(--text)] font-medium flex items-center gap-1.5 flex-wrap min-w-0">
              {draft.kind === 'finance' && (
                <>
                  <span className="font-bold text-sm sm:text-base">
                    {draft.amount !== undefined ? (
                      <PrivacyAmount>
                        {formatMoney(draft.amount, draft.currency || 'UYU')}
                      </PrivacyAmount>
                    ) : (
                      <span className="text-rose-500 font-bold">{draft.currency === 'USD' ? 'US$ ?' : '$U ?'}</span>
                    )}
                  </span>
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-[var(--text-soft)]">
                    {draft.categoryMatched || draft.category || 'Sin categoría'}
                  </span>
                  {draft.accountName && (
                    <>
                      <span className="text-[var(--text-faint)]">·</span>
                      <PrivacyAmount as="span" className="text-[var(--text-faint)]">
                        {draft.accountName}
                        {draft.isAccountSuggested ? ' (sugerida)' : ''}
                      </PrivacyAmount>
                    </>
                  )}
                  {draft.installments && (
                    <>
                      <span className="text-[var(--text-faint)]">·</span>
                      <span className="text-blue-500 font-semibold">{draft.installments} cuotas</span>
                    </>
                  )}
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-[var(--text-faint)]">{draft.dateLabel || draft.date}</span>
                </>
              )}

              {draft.kind === 'task' && (
                <>
                  <span className="text-[var(--text)] font-semibold">{draft.text}</span>
                  {draft.time && (
                    <>
                      <span className="text-[var(--text-faint)]">·</span>
                      <span className="tabular-nums text-blue-500 font-bold">{draft.time}</span>
                    </>
                  )}
                  <span className="text-[var(--text-faint)]">·</span>
                  <span
                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                      draft.priority === 'alta'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : draft.priority === 'media'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {draft.priority}
                  </span>
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-[var(--text-faint)]">{draft.dueDateLabel || draft.dueDate || 'Sin fecha'}</span>
                </>
              )}

              {draft.kind === 'study' && (
                <>
                  <span className="text-[var(--text)] font-semibold">{draft.subjectName}</span>
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-indigo-500 font-bold">{draft.minutes} min</span>
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-[var(--text-faint)]">{draft.dateLabel || draft.date}</span>
                </>
              )}

              {draft.kind === 'resale' && (
                <>
                  <span className="text-[var(--text)] font-semibold">{draft.title}</span>
                  {draft.price !== undefined && (
                    <>
                      <span className="text-[var(--text-faint)]">·</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        <PrivacyAmount>{fmtMoney(draft.price)}</PrivacyAmount>
                      </span>
                    </>
                  )}
                </>
              )}

              {(draft.kind === 'note' || draft.kind === 'idea' || draft.kind === 'inbox' || draft.kind === 'work') && (
                <span className="text-[var(--text)]">
                  {'text' in draft ? (draft as any).text : draft.rawText}
                </span>
              )}

              {draft.kind === 'agenda' && (
                <>
                  <span className="text-[var(--text)] font-semibold">{draft.activity}</span>
                  {draft.time && (
                    <>
                      <span className="text-[var(--text-faint)]">·</span>
                      <span className="tabular-nums text-blue-500 font-bold">{draft.time}</span>
                    </>
                  )}
                  <span className="text-[var(--text-faint)]">·</span>
                  <span className="text-[var(--text-faint)]">{draft.dateLabel || draft.date}</span>
                </>
              )}

              {draft.notes && (
                <span className="text-[11px] text-[var(--text-faint)] italic">({draft.notes})</span>
              )}
            </div>
          )}
        </div>

        {/* Action Cluster (aligned together: Edit, Discard, Confirm) */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto ml-auto">
          <button
            type="button"
            onClick={onToggleEdit}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
              isEditing
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)]'
            }`}
            title={isEditing ? 'Cerrar edición' : 'Editar borrador'}
          >
            <AppIcon name="edit" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="p-1.5 rounded-lg text-xs text-[var(--text-faint)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
            title="Descartar borrador"
          >
            <AppIcon name="trash" className="h-3.5 w-3.5" />
          </button>
          {draft.isModuleEnabled && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm || isConfirming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              title={canConfirm ? 'Guardar este borrador' : validation.reason || 'Completá los campos requeridos'}
            >
              <AppIcon name="check" className="h-3.5 w-3.5" />
              <span>{isConfirming ? 'Guardando…' : 'Guardar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Editor */}
      {isEditing && (
        <InlineDraftEditor
          draft={draft}
          state={state}
          onUpdateDraft={onUpdateDraft}
          onDone={onToggleEdit}
        />
      )}

      {/* Contextual Guidance Banner for Blocked or Warning States (Single, Non-redundant) */}
      {!canConfirm ? (
        <div className={`mt-1 p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
          isFinanceCurrencyBlocked || accountDeleted || categoryArchived
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-200'
            : 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-200'
        }`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AppIcon
              name={!draft.isModuleEnabled ? 'eyeOff' : 'alertCircle'}
              className="h-3.5 w-3.5 shrink-0 opacity-80"
            />
            <span className="text-[11px] leading-snug">
              {isInstallmentBlocked
                ? `Compra financiada en ${finDraft?.installments} cuotas. Para proteger tu saldo real, Celestian LifeOS no descuenta el total en un único gasto inmediato.`
                : isMissingUsdAccount
                ? 'Necesitás una cuenta en dólares para registrar este movimiento. Podés crearla en Finanzas o guardarlo en tu Bandeja de Entrada.'
                : isCurrencyMismatch
                ? `El movimiento es en ${draftCurrency} pero la cuenta seleccionada opera en ${selectedAccCurrency}. Elegí una cuenta en ${draftCurrency} para confirmar.`
                : isForeignUnsupported
                ? `Moneda extranjera no soportada (${draftCurrency}). Guardalo en tu Bandeja de Entrada para conservarlo.`
                : !draft.isModuleEnabled
                ? `Para registrar en ${moduleName}, activá el módulo o guardalo ${isNotasEnabled ? 'como nota o en bandeja.' : 'en tu bandeja de entrada.'}`
                : accountDeleted
                ? 'La cuenta asignada fue eliminada. Elegí otra cuenta para confirmar.'
                : categoryArchived
                ? 'La categoría asignada está archivada. Elegí otra categoría para confirmar.'
                : draft.ambiguityWarning || validation.reason || 'Revisá los datos antes de confirmar.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            {!draft.isModuleEnabled && (
              <button
                type="button"
                onClick={onEnableModule}
                className="px-2 py-1 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer"
              >
                Activar {moduleName}
              </button>
            )}
            {isCurrencyMismatch && !isEditing && (
              <button
                type="button"
                onClick={onToggleEdit}
                className="px-2 py-1 rounded text-xs font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
              >
                Elegir cuenta {draftCurrency}
              </button>
            )}
            {!draft.isModuleEnabled && isNotasEnabled && onConvertToNote && (
              <button
                type="button"
                onClick={onConvertToNote}
                className="px-2 py-1 rounded text-xs font-semibold bg-[var(--surface-muted)] text-[var(--text)] hover:bg-[var(--border)] transition cursor-pointer"
              >
                Guardar como nota
              </button>
            )}
            {onConvertToInbox && (
              <button
                type="button"
                onClick={onConvertToInbox}
                className="px-2.5 py-1 rounded text-xs font-semibold bg-[var(--text)] text-[var(--bg-elevated)] hover:opacity-90 transition cursor-pointer"
              >
                Guardar en Bandeja
              </button>
            )}
          </div>
        </div>
      ) : draft.ambiguityWarning ? (
        <div className="mt-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs">
          {draft.ambiguityWarning}
        </div>
      ) : null}
    </div>
  );
};

/* =========================================================================
   INLINE FAST DRAFT EDITORS
   ========================================================================= */

interface InlineDraftEditorProps {
  draft: CaptureDraft;
  state: LifeOSState;
  onUpdateDraft: (updated: CaptureDraft) => void;
  onDone: () => void;
}

const InlineDraftEditor: React.FC<InlineDraftEditorProps> = ({
  draft,
  state,
  onUpdateDraft,
  onDone,
}) => {
  if (draft.kind === 'finance') {
    const categories = state.finance?.categories || [];
    const accounts = state.finance?.accounts || [];

    return (
      <div className="p-2.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] flex flex-col gap-2.5 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Amount */}
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Importe ({draft.currency === 'USD' ? 'US$' : '$U'}):
            </label>
            <input
              type="number"
              value={draft.amount !== undefined ? draft.amount : ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                const newAmount = !isNaN(val) ? val : undefined;
                const newMissing = (draft.missingFields || []).filter((f) => f !== 'amount');
                if (newAmount === undefined) newMissing.push('amount');
                onUpdateDraft({
                  ...draft,
                  amount: newAmount,
                  missingFields: newMissing.length > 0 ? newMissing : undefined,
                } as FinanceDraft);
              }}
              placeholder="0.00"
              className={`px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold outline-none ${
                state.settings.privacyMode ? 'privacy-sensitive' : ''
              }`}
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Categoría:
            </label>
            <select
              value={draft.category || ''}
              onChange={(e) => {
                const catId = e.target.value;
                const catObj = categories.find((c) => (typeof c === 'string' ? c === catId : c.id === catId));
                const catName = typeof catObj === 'string' ? catObj : catObj?.name || catId;
                const newMissing = (draft.missingFields || []).filter((f) => f !== 'category');
                onUpdateDraft({
                  ...draft,
                  category: catId,
                  categoryMatched: catName,
                  missingFields: newMissing.length > 0 ? newMissing : undefined,
                } as FinanceDraft);
              }}
              className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-medium outline-none"
            >
              <option value="">Seleccionar categoría...</option>
              {categories
                .filter((c) => (typeof c === 'string' ? true : c.active !== false))
                .map((c) => {
                  const id = typeof c === 'string' ? c : c.id;
                  const name = typeof c === 'string' ? c : c.name;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
            </select>
          </div>

          {/* Account */}
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Cuenta:
            </label>
            <select
              value={draft.accountId || ''}
              onChange={(e) => {
                const accId = e.target.value;
                const acc = accounts.find((a) => a.id === accId);
                onUpdateDraft({
                  ...draft,
                  accountId: accId,
                  accountName: acc?.name,
                } as FinanceDraft);
              }}
              className={`px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-medium outline-none ${
                state.settings.privacyMode ? 'privacy-sensitive' : ''
              }`}
            >
              <option value="">Sin especificar...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency || 'UYU'}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Fecha:
            </label>
            <input
              type="date"
              value={draft.date || todayISO()}
              onChange={(e) => {
                const newDate = e.target.value;
                onUpdateDraft({
                  ...draft,
                  date: newDate,
                  dateLabel: newDate === todayISO() ? 'Hoy' : newDate,
                } as FinanceDraft);
              }}
              className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-medium outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="px-2.5 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] font-semibold hover:border-[var(--border-hover)] transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  if (draft.kind === 'task') {
    return (
      <div className="p-2.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] flex flex-col gap-2.5 text-xs">
        <div className="flex flex-col gap-1">
          <label className="font-semibold text-[var(--text-soft)] text-[11px]">
            Texto de la tarea:
          </label>
          <input
            type="text"
            value={draft.text}
            onChange={(e) =>
              onUpdateDraft({ ...draft, text: e.target.value } as TaskDraft)
            }
            className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Prioridad:
            </label>
            <select
              value={draft.priority}
              onChange={(e) =>
                onUpdateDraft({
                  ...draft,
                  priority: e.target.value as 'alta' | 'media' | 'baja',
                } as TaskDraft)
              }
              className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-medium outline-none"
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Fecha límite:
            </label>
            <input
              type="date"
              value={draft.dueDate || ''}
              onChange={(e) => {
                const d = e.target.value;
                onUpdateDraft({
                  ...draft,
                  dueDate: d || undefined,
                  dueDateLabel: d ? (d === todayISO() ? 'Hoy' : d) : undefined,
                  ambiguityWarning: undefined,
                } as TaskDraft);
              }}
              className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-medium outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="px-2.5 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] font-semibold hover:border-[var(--border-hover)] transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  if (draft.kind === 'study') {
    return (
      <div className="p-2.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] flex flex-col gap-2.5 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Materia:
            </label>
            <input
              type="text"
              value={draft.subjectName}
              onChange={(e) =>
                onUpdateDraft({ ...draft, subjectName: e.target.value } as StudyDraft)
              }
              className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-semibold text-[var(--text-soft)] text-[11px]">
              Minutos:
            </label>
            <input
              type="number"
              value={draft.minutes}
              onChange={(e) =>
                onUpdateDraft({
                  ...draft,
                  minutes: parseInt(e.target.value, 10) || 30,
                } as StudyDraft)
              }
              className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="px-2.5 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] font-semibold hover:border-[var(--border-hover)] transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  // Fallback for note/idea/inbox
  return (
    <div className="p-2.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] flex flex-col gap-2.5 text-xs">
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-[var(--text-soft)] text-[11px]">
          Contenido:
        </label>
        <textarea
          rows={2}
          value={'text' in draft ? (draft as any).text : ''}
          onChange={(e) =>
            onUpdateDraft({ ...draft, text: e.target.value } as any)
          }
          className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-xs font-medium outline-none resize-none"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="px-2.5 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] font-semibold hover:border-[var(--border-hover)] transition cursor-pointer"
        >
          Listo
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   METADATA HELPERS
   ========================================================================= */

function getDraftMeta(draft: CaptureDraft): {
  label: string;
  icon: AppIconName;
  badgeClass: string;
} {
  switch (draft.kind) {
    case 'finance':
      return draft.type === 'ingreso'
        ? {
            label: 'Ingreso',
            icon: 'wallet',
            badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          }
        : {
            label: 'Gasto',
            icon: 'wallet',
            badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
          };
    case 'task':
      return {
        label: 'Tarea',
        icon: 'check',
        badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
      };
    case 'study':
      return {
        label: 'Estudio',
        icon: 'book',
        badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
      };
    case 'note':
      return {
        label: 'Nota',
        icon: 'note',
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      };
    case 'idea':
      return {
        label: 'Idea',
        icon: 'zap',
        badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
      };
    case 'resale':
      return {
        label: 'Reventa',
        icon: 'repeat',
        badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
      };
    case 'agenda':
      return {
        label: 'Agenda',
        icon: 'calendar',
        badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
      };
    case 'inbox':
    default:
      return {
        label: 'Bandeja',
        icon: 'note',
        badgeClass: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
      };
  }
}
