import React, { useState } from 'react';
import type { FinancialCommitment, LifeOSState } from '../types';
import {
  deriveFinanceReviewInbox,
  ReviewReason,
} from '../lib/financeReview';
import { fmtDate, fmtMoney, todayISO } from '../lib/storage';
import { getActiveCategories } from '../lib/financeCategories';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';

interface FinanceReviewInboxProps {
  state: LifeOSState;
  onMarkReviewed: (txId: string) => void;
  onBulkReview: (txIds: string[]) => void;
  onIgnore: (txId: string) => void;
  onResolveDuplicate: (duplicateTxId: string, keepTxId?: string) => void;
  onLinkCommitment: (txId: string, commitmentId: string, targetType?: 'commitment' | 'expected_income') => void;
  onRejectMatch?: (txId: string, candidateId: string, cycleKey?: string) => void;
  onUpdateTx: (txId: string, updates: { category?: string; note?: string; date?: string }) => void;
  onPayCommitment: (commitment: FinancialCommitment) => void;
}

export const FinanceReviewInbox: React.FC<FinanceReviewInboxProps> = ({
  state,
  onMarkReviewed,
  onBulkReview,
  onIgnore,
  onResolveDuplicate,
  onLinkCommitment,
  onRejectMatch,
  onUpdateTx,
  onPayCommitment,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingCategoryTxId, setEditingCategoryTxId] = useState<string | null>(null);

  const reviewInbox = deriveFinanceReviewInbox(state);
  const activeCategories = getActiveCategories(state.finance?.categories);

  const totalItems = reviewInbox.items.length;
  const attentionCount = totalItems + reviewInbox.attentionCommitments.length;

  if (attentionCount === 0) {
    return null;
  }

  return (
    <div className="finance-surface border border-[var(--finance-border)] rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-xs shrink-0">
            <AppIcon name="inbox" className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-[var(--finance-text-primary)]">
                Atención requerida
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                {attentionCount} pendiente{attentionCount === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs text-[var(--finance-text-muted)]">
              Movimientos o compromisos que requieren confirmación manual
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {reviewInbox.canBulkReviewAll && (
            <button
              type="button"
              onClick={() => onBulkReview(reviewInbox.items.map((it) => it.transaction.id))}
              className="secondary-button py-1 px-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
              title="Aprobar todos los movimientos seguros"
            >
              ✓ Marcar todos revisados ({totalItems})
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
            title={isExpanded ? 'Colapsar' : 'Expandir'}
          >
            <AppIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-1">
          {/* Attention Signals: Commitments (Section 6) */}
          {reviewInbox.attentionCommitments.map((att) => (
            <div
              key={att.commitment.id}
              className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                att.kind === 'overdue'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
                  : att.kind === 'compatible_movement'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold">
                  {att.kind === 'overdue' ? '⚠️ Vencido:' : att.kind === 'compatible_movement' ? '🔗 Compatible:' : '⏰ Próximo:'}
                </span>
                <span className="font-semibold">{att.commitment.name}</span>
                <PrivacyAmount as="span" className="font-mono font-bold">({fmtMoney(att.commitment.amount)})</PrivacyAmount>
                <span className="text-[11px] opacity-80">· {att.label}</span>
              </div>

              <div className="flex items-center gap-2">
                {att.compatibleTxId ? (
                  <button
                    type="button"
                    onClick={() => onLinkCommitment(att.compatibleTxId!, att.commitment.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
                  >
                    Vincular a movimiento
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPayCommitment(att.commitment)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--card)] hover:bg-[var(--surface-muted)] text-[var(--text)] border border-[var(--border)] cursor-pointer"
                  >
                    Pagar ahora
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Pending Movements Items */}
          {reviewInbox.items.map((item) => {
            const tx = item.transaction;
            const account = state.finance.accounts.find((a) => a.id === tx.accountId);

            return (
              <div
                key={tx.id}
                className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/30 space-y-2.5"
              >
                {/* Top Row: Movement Meta */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        tx.type === 'ingreso'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.type}
                    </span>

                    <PrivacyAmount as="span" className="font-mono font-black text-sm text-[var(--text)]">
                      {tx.type === 'ingreso' ? '+' : '−'}{fmtMoney(tx.amount)}
                    </PrivacyAmount>

                    <span className="text-[var(--text-faint)]">·</span>
                    <span className="font-semibold text-[var(--text)]">
                      {tx.note || tx.category}
                    </span>

                    <span className="text-[var(--text-faint)]">·</span>
                    <span className="text-[var(--text-soft)]">{fmtDate(tx.date)}</span>

                    {account && (
                      <>
                        <span className="text-[var(--text-faint)]">·</span>
                        <span className="text-[var(--text-soft)]">{account.name}</span>
                      </>
                    )}
                  </div>

                  {/* Actions for this item */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onMarkReviewed(tx.id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-2xs"
                      title="Marcar como revisado"
                    >
                      ✓ Revisado
                    </button>

                    <button
                      type="button"
                      onClick={() => onIgnore(tx.id)}
                      className="px-2 py-1 rounded-lg text-xs font-medium text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer"
                      title="Excluir o ignorar de la bandeja"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>

                {/* Reasons Badges and Descriptions */}
                <div className="space-y-1.5 pt-1 border-t border-[var(--border)]/50">
                  {item.reasons.map((r: ReviewReason, idx: number) => (
                    <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.code === 'possible_duplicate' || r.code === 'missing_account' || r.code === 'suspicious_amount'
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : r.code === 'compatible_commitment'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {r.label}
                        </span>
                        <span className="text-[var(--text-soft)] text-[11px]">{r.description}</span>
                      </div>

                      {/* Targeted One-Click Quick Fixes */}
                      <div className="flex items-center gap-1">
                        {r.suggestedCategory && (
                          <button
                            type="button"
                            onClick={() => onUpdateTx(tx.id, { category: r.suggestedCategory })}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 cursor-pointer"
                          >
                            Asignar &quot;{r.suggestedCategory}&quot;
                          </button>
                        )}

                        {r.suggestedValue && r.code === 'unnormalized_merchant' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTx(tx.id, { note: r.suggestedValue })}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 cursor-pointer"
                          >
                            Normalizar a &quot;{r.suggestedValue}&quot;
                          </button>
                        )}

                        {r.code === 'suspicious_date' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTx(tx.id, { date: todayISO() })}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                          >
                            Ajustar a Hoy
                          </button>
                        )}

                        {r.duplicateTransactionId && (
                          <button
                            type="button"
                            onClick={() => onResolveDuplicate(tx.id, r.duplicateTransactionId)}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 cursor-pointer"
                            title="Elimina este movimiento y conserva el otro"
                          >
                            Eliminar este duplicado
                          </button>
                        )}

                        {r.compatibleCommitmentId && (
                          <button
                            type="button"
                            onClick={() => onLinkCommitment(tx.id, r.compatibleCommitmentId!)}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            Vincular a compromiso
                          </button>
                        )}

                        {(r.code === 'missing_category' || r.code === 'doubtful_category') && !r.suggestedCategory && (
                          <button
                            type="button"
                            onClick={() => setEditingCategoryTxId(editingCategoryTxId === tx.id ? null : tx.id)}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                          >
                            Elegir categoría
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Finance 2.3 Match Candidates Card */}
                {item.matchResult && item.matchResult.candidates.length > 0 && (
                  <div className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-2 mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-700 dark:text-indigo-300">
                        <span>🔗</span>
                        <span>
                          {item.matchResult.confidence === 'strong'
                            ? 'Coincidencia detectada'
                            : item.matchResult.confidence === 'ambiguous'
                            ? 'Coincidencia ambigua (elegí cuál corresponde)'
                            : 'Posible coincidencia'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-faint)]">
                        {item.matchResult.candidates.length} candidato{item.matchResult.candidates.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {item.matchResult.candidates.map((cand) => (
                        <div
                          key={cand.targetId}
                          className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[var(--text)]">{cand.name}</span>
                              <span className="text-[var(--text-faint)]">·</span>
                              <PrivacyAmount as="span" className="font-mono font-bold text-[var(--text)]">
                                {cand.currency === 'USD' ? 'U$S ' : '$U '}{fmtMoney(cand.amount)}
                              </PrivacyAmount>
                              <span className="text-[var(--text-faint)]">·</span>
                              <span className="text-[11px] text-[var(--text-soft)]">{cand.cycleLabel}</span>
                            </div>
                            {cand.reasons.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap text-[10px] text-[var(--text-soft)]">
                                {cand.reasons.map((r, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--text-soft)]">
                                    {r}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onLinkCommitment(tx.id, cand.targetId, cand.targetType)}
                              className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-colors shadow-2xs"
                            >
                              Vincular
                            </button>
                            {onRejectMatch && (
                              <button
                                type="button"
                                onClick={() => onRejectMatch(tx.id, cand.targetId, cand.cycleKey)}
                                className="px-2 py-1 rounded-md text-xs font-medium text-[var(--text-soft)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                                title="Descartar esta sugerencia para este movimiento"
                              >
                                No corresponde
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inline Category Dropdown Selector if opened */}
                {editingCategoryTxId === tx.id && (
                  <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] flex flex-wrap gap-1.5 text-xs animate-in fade-in">
                    <span className="text-[11px] text-[var(--text-soft)] w-full block">Seleccioná categoría:</span>
                    {activeCategories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onUpdateTx(tx.id, { category: c.name });
                          setEditingCategoryTxId(null);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-medium border cursor-pointer ${
                          tx.category === c.name || tx.category === c.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-[var(--surface-muted)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-muted)]/80'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
