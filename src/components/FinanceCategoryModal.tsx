import React, { useState, useEffect, useRef } from 'react';
import { FinanceCategory, LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import {
  getAllCategories,
  countTransactionsByCategory,
  validateCategoryName,
  addCategory,
  renameCategory,
  archiveCategory,
  reactivateCategory,
  deleteCategory,
} from '../lib/financeCategories';

interface FinanceCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const FinanceCategoryModal: React.FC<FinanceCategoryModalProps> = ({
  isOpen,
  onClose,
  state,
  onUpdateState,
  showToast,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Archive confirmation dialog state
  const [archiveTarget, setArchiveTarget] = useState<FinanceCategory | null>(null);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<FinanceCategory | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation & accessibility
  useEffect(() => {
    if (!isOpen) {
      setIsAdding(false);
      setNewName('');
      setAddError(null);
      setEditingId(null);
      setEditName('');
      setEditError(null);
      setArchiveTarget(null);
      setDeleteTarget(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (archiveTarget) {
          setArchiveTarget(null);
        } else if (deleteTarget) {
          setDeleteTarget(null);
        } else if (editingId) {
          setEditingId(null);
        } else if (isAdding) {
          setIsAdding(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, archiveTarget, deleteTarget, editingId, isAdding, onClose]);

  // Focus input when adding
  useEffect(() => {
    if (isAdding) {
      setTimeout(() => newNameInputRef.current?.focus(), 50);
    }
  }, [isAdding]);

  if (!isOpen) return null;

  const categories = getAllCategories(state.finance?.categories);
  const txCounts = countTransactionsByCategory(
    state.finance?.transactions,
    state.finance?.categories
  );

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewName('');
    setAddError(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCategoryName(newName, categories);
    if (!validation.valid) {
      setAddError(validation.error || 'Nombre inválido.');
      return;
    }

    try {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        addCategory(draft.finance, newName);
      });
      showToast?.(`Categoría "${newName.trim()}" creada.`, 'success');
      setIsAdding(false);
      setNewName('');
      setAddError(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Error al crear la categoría.');
    }
  };

  const handleStartEdit = (cat: FinanceCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditError(null);
  };

  const handleSaveRename = (catId: string) => {
    const validation = validateCategoryName(editName, categories, catId);
    if (!validation.valid) {
      setEditError(validation.error || 'Nombre inválido.');
      return;
    }

    try {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        renameCategory(draft.finance, catId, editName);
      });
      showToast?.(`Categoría renombrada a "${editName.trim()}".`, 'success');
      setEditingId(null);
      setEditName('');
      setEditError(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al renombrar la categoría.');
    }
  };

  const handleArchiveConfirm = () => {
    if (!archiveTarget) return;
    try {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        archiveCategory(draft.finance, archiveTarget.id);
      });
      showToast?.(`Categoría "${archiveTarget.name}" archivada.`, 'info');
      setArchiveTarget(null);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Error al archivar la categoría.', 'error');
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    try {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        deleteCategory(draft.finance, deleteTarget.id);
      });
      showToast?.(`Categoría "${deleteTarget.name}" eliminada.`, 'info');
      setDeleteTarget(null);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Error al eliminar la categoría.', 'error');
    }
  };

  const handleReactivate = (cat: FinanceCategory) => {
    try {
      onUpdateState((draft) => {
        if (!draft.finance) return;
        reactivateCategory(draft.finance, cat.id);
      });
      showToast?.(`Categoría "${cat.name}" reactivada.`, 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Error al reactivar la categoría.', 'error');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-category-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 id="finance-category-modal-title" className="text-base font-bold text-[var(--text)]">
              Categorías de Finanzas
            </h2>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">
              Administrá tus categorías, renombralas o archivalas sin afectar tu historial.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
          >
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar: + Nueva categoría */}
        <div className="px-5 py-3 border-b border-[var(--border)]/70 bg-[var(--surface-muted)]/40 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-[var(--text-soft)]">
            {categories.length} categoría{categories.length === 1 ? '' : 's'} registrada{categories.length === 1 ? '' : 's'}
          </span>
          {!isAdding && (
            <button
              type="button"
              onClick={handleStartAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold hover:opacity-90 transition cursor-pointer"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Nueva categoría</span>
            </button>
          )}
        </div>

        {/* Inline Create Form */}
        {isAdding && (
          <form onSubmit={handleCreate} className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-muted)]/70 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={newNameInputRef}
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setAddError(null);
                }}
                maxLength={40}
                placeholder="Nombre de la categoría..."
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden font-medium"
              />
              <button
                type="submit"
                disabled={!newName.trim()}
                className="px-3.5 py-2 rounded-xl bg-[var(--blue)] text-white text-xs font-bold hover:bg-[var(--blue-hover)] transition disabled:opacity-40 cursor-pointer shrink-0"
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewName('');
                  setAddError(null);
                }}
                className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] text-xs font-medium hover:text-[var(--text)] transition cursor-pointer shrink-0"
              >
                Cancelar
              </button>
            </div>
            {addError && (
              <p className="text-[11px] font-semibold text-rose-500">
                {addError}
              </p>
            )}
          </form>
        )}

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/60 p-2 sm:p-3">
          {categories.map((cat) => {
            const count = txCounts[cat.id] || txCounts[cat.name] || 0;
            const isEditing = editingId === cat.id;

            return (
              <div
                key={cat.id}
                className="p-2.5 sm:p-3 rounded-xl transition-colors hover:bg-[var(--surface-muted)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                {/* Left: Category info or edit input */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            setEditError(null);
                          }}
                          maxLength={40}
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(cat.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--blue)] text-white text-xs font-bold hover:bg-[var(--blue-hover)] transition cursor-pointer"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                            setEditError(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-soft)] text-xs font-medium hover:text-[var(--text)] transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                      {editError && (
                        <p className="text-[11px] font-semibold text-rose-500">
                          {editError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`text-xs sm:text-sm font-semibold ${cat.active ? 'text-[var(--text)]' : 'text-[var(--text-faint)] line-through'}`}>
                        {cat.name}
                      </span>
                      {cat.active ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Archivada
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--text-faint)] tabular-nums">
                        ·{' '}
                        <PrivacyAmount as="span">
                          {count} movimiento{count === 1 ? '' : 's'}
                        </PrivacyAmount>
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                {!isEditing && (
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* Rename */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(cat)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition cursor-pointer"
                    >
                      Renombrar
                    </button>

                    {/* Archive / Reactivate / Delete */}
                    {cat.active ? (
                      count > 0 ? (
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(cat)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                        >
                          Archivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(cat)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          Eliminar
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(cat)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                      >
                        Reactivar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)]/70 bg-[var(--surface-muted)]/30 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)]/40 transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>

      {/* Confirmation Modal: Archiving category with movements */}
      {archiveTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[var(--text)]">
                ¿Archivar categoría "{archiveTarget.name}"?
              </h3>
              <p className="text-xs text-[var(--text-soft)] leading-relaxed">
                Esta categoría tiene{' '}
                <strong className="text-[var(--text)] font-semibold tabular-nums">
                  <PrivacyAmount as="span">
                    {txCounts[archiveTarget.id] || txCounts[archiveTarget.name] || 0} movimientos
                  </PrivacyAmount>
                </strong>
                . Al archivarla, dejará de aparecer al registrar nuevos movimientos, pero los movimientos existentes conservarán esta categoría en el historial, filtros y reportes.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleArchiveConfirm}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition cursor-pointer"
              >
                Archivar categoría
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Deleting category without movements */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[var(--text)]">
                ¿Eliminar categoría "{deleteTarget.name}"?
              </h3>
              <p className="text-xs text-[var(--text-soft)] leading-relaxed">
                Como esta categoría no tiene movimientos históricos registrados, se borrará definitivamente de tus categorías de Finanzas.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
