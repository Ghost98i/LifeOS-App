import type { Finance } from '../types';
import React, { useEffect, useRef, useState } from 'react';
import type { StockUnit } from '../lib/commercialInventory';
import { addSandboxExit, addSandboxItem, addSandboxReceipt, emptySandboxInventory, sandboxStockEntries } from '../lib/commercialInventorySandbox';
import { fmtMoney } from '../lib/storage';
import { CommercialRecipesSandbox } from './CommercialRecipesSandbox';
import { confirmSandboxSale, type SandboxSaleRequest } from '../lib/commercialSaleSandbox';
import { confirmSandboxFinishedWaste, confirmSandboxPreparedSale, confirmSandboxProduction, type SandboxFinishedWasteRequest, type SandboxProductionRequest, type SandboxProductionSession } from '../lib/commercialProductionSandbox';
import { parseDirectSaleUnitPrice, previewSandboxDirectSale } from '../lib/commercialDirectSaleSandbox';
import { confirmSandboxDirectSaleWithReceipt, confirmSandboxPurchaseWithPayment, type ImmediateChoice } from '../lib/commercialImmediateSandbox';
import { confirmSandboxSaleAdjustment, confirmSandboxPurchaseAdjustment, type SandboxSaleAdjustmentRequest, type SandboxPurchaseAdjustmentRequest } from '../lib/commercialCorrectionSandbox';
import { confirmSandboxMoneyEvent, sandboxMoneySummary, sandboxSaleBalance, type SandboxMoneyRequest } from '../lib/commercialMoneySandbox';
import { CommercialMoneySandbox } from './CommercialMoneySandbox';
import { ContextualHelp } from './ContextualHelp';
import { advanceCommercialPilot, COMMERCIAL_PILOT_CURRENCY, loadCommercialPilot, saveCommercialPilot,
  type CommercialPilotLoad, type CommercialPilotSnapshot } from '../lib/commercialPilot';
import type { SandboxRecipe } from '../lib/commercialRecipeSandbox';
import { connectCommercialPilotEmulator, ResaleRevisionConflict, type CommercialPilotEmulatorClient } from '../lib/cloudSync';
import { captureDurableCommercial } from '../lib/commercialDurable';

const COMMERCIAL_PILOT_REVISION_KEY = 'celestea:dev-commercial-pilot:emulator-revision:v1';

type ItemAction = 'receipt' | 'consumption' | 'waste';
const units: StockUnit[] = ['unit', 'kg', 'g'];
const unitLabel: Record<StockUnit, string> = { unit: 'unid.', kg: 'kg', g: 'g' };
const actionPrimary = 'rounded-lg bg-[var(--blue)] px-3 py-2 text-sm font-bold text-white hover:bg-[var(--blue-hover)] transition-colors';
const actionSecondary = 'rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-bold text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors';
const fieldClass = 'min-w-0 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]';
const labelClass = 'space-y-1 text-sm font-semibold text-[var(--text-soft)]';
const formatQuantity = (value: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 }).format(value);

function parseNumber(text: string): number {
  if (!text.trim()) return NaN;
  return Number(text.replace(',', '.'));
}

const emptySession = (): SandboxProductionSession => ({ inventory: emptySandboxInventory(), sales: [],
  finished: emptySandboxInventory(), productions: [], finishedWastes: [], saleCorrections: [], purchases: [], moneyEvents: [] });
const maxIdSuffix = (ids: string[], pattern: RegExp) => Math.max(0, ...ids.map((id) => Number(id.match(pattern)?.[1] ?? 0)));

export const CommercialInventorySandbox: React.FC<{ onClose: () => void; pilotEnabled: boolean; production?: {
    snapshot?: CommercialPilotSnapshot; accounts: Finance['accounts']; financeFields?: (inheritCategory?: boolean) => React.ReactNode;
    commit: (snapshot: CommercialPilotSnapshot) => CommercialPilotSnapshot;
  } }> = ({ onClose, pilotEnabled, production }) => {
  const pilotSyncEnabled = pilotEnabled
    && (import.meta as ImportMeta & { env?: ImportMetaEnv }).env?.VITE_COMMERCIAL_PILOT_SYNC === '1';
  const [pilotSetup] = useState<{ storage: Storage | null; load: CommercialPilotLoad } | null>(() => {
    if (production?.snapshot) {
      const captured = captureDurableCommercial(production.snapshot);
      if (captured.status !== 'valid') return { storage: null, load: { status: 'blocked', raw: JSON.stringify(production.snapshot), issues: captured.issues.map(issue => issue.code) } };
      return { storage: null, load: { status: 'ready', raw: captured.json, snapshot: production.snapshot, reconstructed: captured.reconstructed } };
    }
    if (!pilotEnabled) return null;
    try {
      const storage = window.sessionStorage;
      const load = loadCommercialPilot(storage);
      if (load.status === 'ready' && load.snapshot.currency !== COMMERCIAL_PILOT_CURRENCY) return {
        storage, load: { status: 'blocked', raw: load.raw,
          issues: ['Esta interfaz de prueba admite UYU. El historial en otra moneda se conserva sin reinterpretarlo.'] },
      };
      return { storage, load };
    }
    catch { return { storage: null, load: { status: 'blocked', raw: null, issues: ['El almacenamiento de prueba no está disponible.'] } }; }
  });
  const [session, setSession] = useState<SandboxProductionSession>(() => pilotSetup?.load.status === 'ready'
    ? pilotSetup.load.snapshot.session : emptySession());
  const [recipes, setRecipes] = useState<SandboxRecipe[]>(() => pilotSetup?.load.status === 'ready'
    ? pilotSetup.load.snapshot.recipes : []);
  const recipesRef = useRef(recipes);
  const pilotSnapshotRef = useRef<CommercialPilotSnapshot>({ currency: pilotSetup?.load.status === 'ready'
    ? pilotSetup.load.snapshot.currency : COMMERCIAL_PILOT_CURRENCY, session,
    recipes, eventOrder: pilotSetup?.load.status === 'ready' ? pilotSetup.load.snapshot.eventOrder : [],
    refundSources: pilotSetup?.load.status === 'ready' ? pilotSetup.load.snapshot.refundSources : [],
    ...(pilotSetup?.load.status === 'ready' && pilotSetup.load.snapshot.financeLinks
      ? { financeLinks: pilotSetup.load.snapshot.financeLinks } : {}) });
  const pilotRawRef = useRef<string | null>(pilotSetup?.load.status === 'ready' ? pilotSetup.load.raw : null);
  const [pilotError, setPilotError] = useState('');
  const [emulatorMessage, setEmulatorMessage] = useState('');
  const [emulatorBusy, setEmulatorBusy] = useState(false);
  const [emulatorClient, setEmulatorClient] = useState<CommercialPilotEmulatorClient | null>(null);
  const emulatorClientRef = useRef<CommercialPilotEmulatorClient | null>(null);
  const [baseRevision, setBaseRevision] = useState<string | null | undefined>(() => {
    if (!pilotEnabled || !pilotSetup?.storage) return undefined;
    try {
      const raw = pilotSetup.storage.getItem(COMMERCIAL_PILOT_REVISION_KEY);
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return parsed === null || typeof parsed === 'string' ? parsed : undefined;
    } catch { return undefined; }
  });
  const baseRevisionRef = useRef<string | null | undefined>(baseRevision);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const persistFailureRef = useRef('');
  const sessionRef = useRef(session);
  useEffect(() => () => { void emulatorClientRef.current?.close().catch(() => undefined); }, []);
  useEffect(() => {
    if (!production?.snapshot) return;
    const captured = captureDurableCommercial(production.snapshot);
    if (captured.status === 'valid') {
      setSession(production.snapshot.session);
      setRecipes(production.snapshot.recipes);
      recipesRef.current = production.snapshot.recipes;
      sessionRef.current = production.snapshot.session;
      pilotSnapshotRef.current = production.snapshot;
      pilotRawRef.current = captured.json;
    }
  }, [production?.snapshot]);
  const directCounter = useRef(maxIdSuffix(session.sales.map((sale) => sale.id), /^sandbox-direct-(\d+)$/));
  const entrySubmitted = useRef(false);
  const [pendingDirect, setPendingDirect] = useState<{ id: string; itemId: string; unitsText: string; priceText: string } | null>(null);
  const [directTiming, setDirectTiming] = useState<'now' | 'later'>('later');
  const [directAccount, setDirectAccount] = useState('');
  const [recentDirectSaleId, setRecentDirectSaleId] = useState<string | null>(null);
  const [directError, setDirectError] = useState('');
  const inventory = session.inventory;
  const pendingMoney = sandboxMoneySummary(session);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [newUnit, setNewUnit] = useState<StockUnit>('unit');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCost, setNewCost] = useState('');
  const [active, setActive] = useState<{ itemId: string; kind: ItemAction } | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<StockUnit>('unit');
  const [cost, setCost] = useState('');
  const [entryTiming, setEntryTiming] = useState<'now' | 'later'>('later');
  const [entryAccount, setEntryAccount] = useState('');
  const [error, setError] = useState('');
  const [stockView, setStockView] = useState<'available' | 'empty'>('available');
  const stockEntries = sandboxStockEntries(inventory);
  const availableCount = stockEntries.filter(({ summary }) => summary.quantity > 0).length;
  const shownEntries = stockEntries.filter(({ summary }) => stockView === 'available' ? summary.quantity > 0 : summary.quantity === 0);
  const entryPaymentFields = <div className="col-span-full space-y-1">
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text)]">
      <legend className="font-semibold text-[var(--text-soft)]">Pago de esta compra</legend>
      <label className="inline-flex items-center gap-1.5"><input type="radio" name="entry-payment" checked={entryTiming === 'later'} onChange={() => setEntryTiming('later')} />Pagar después</label>
      <label className="inline-flex items-center gap-1.5"><input type="radio" name="entry-payment" checked={entryTiming === 'now'} onChange={() => setEntryTiming('now')} />Pagado ahora</label>
    </fieldset>
    {entryTiming === 'now' && <><label className={`${labelClass} block max-w-xs`}>{production ? 'Cuenta' : 'Cuenta simulada'}{production ? <select required value={entryAccount} onChange={e => setEntryAccount(e.target.value)} className={fieldClass}><option value="">Seleccionar cuenta</option>{production.accounts.filter(a => (a.currency || 'UYU') === 'UYU').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : <input required value={entryAccount} onChange={(event) => setEntryAccount(event.target.value)} placeholder="Ej.: caja de prueba" className={fieldClass} />}</label>{production?.financeFields?.()}</>}
  </div>;

  const persistPilot = (next: SandboxProductionSession, nextRecipes: SandboxRecipe[]): boolean => {
    if (production) {
      try {
        const nextSnapshot = advanceCommercialPilot(pilotSnapshotRef.current, next, nextRecipes);
        pilotSnapshotRef.current = production.commit(nextSnapshot);
        persistFailureRef.current = ''; setPilotError(''); return true;
      } catch (cause) {
        persistFailureRef.current = cause instanceof Error ? cause.message : 'Error de guardado.';
        setPilotError(persistFailureRef.current); return false;
      }
    }
    if (!pilotEnabled) return true;
    if (!pilotSetup?.storage || pilotSetup.load.status === 'blocked') return false;
    try {
      const snapshot = advanceCommercialPilot(pilotSnapshotRef.current, next, nextRecipes);
      const saved = saveCommercialPilot(pilotSetup.storage, pilotRawRef.current, snapshot);
      if (saved.status === 'blocked') throw new Error(saved.issues.join(' '));
      pilotSnapshotRef.current = snapshot;
      pilotRawRef.current = saved.raw;
      persistFailureRef.current = '';
      setPilotError('');
      return true;
    } catch (cause) {
      persistFailureRef.current = cause instanceof Error ? cause.message : 'No se pudo conservar la operación de prueba.';
      setPilotError(persistFailureRef.current);
      return false;
    }
  };
  const commitSession = (next: SandboxProductionSession): boolean => {
    if (!persistPilot(next, recipesRef.current)) return false;
    sessionRef.current = next; setSession(next); return true;
  };
  const commitRecipes = (next: SandboxRecipe[]): boolean => {
    if (!persistPilot(sessionRef.current, next)) return false;
    recipesRef.current = next; setRecipes(next); return true;
  };
  const rememberEmulatorRevision = (revision: string | null): boolean => {
    if (!pilotSetup?.storage) return false;
    try {
      pilotSetup.storage.setItem(COMMERCIAL_PILOT_REVISION_KEY, JSON.stringify(revision));
      baseRevisionRef.current = revision; setBaseRevision(revision); return true;
    } catch {
      baseRevisionRef.current = undefined; setBaseRevision(undefined); return false;
    }
  };
  const hasLocalPilotData = () => Boolean(sessionRef.current.inventory.items.length
    || sessionRef.current.inventory.operations.length || sessionRef.current.inventory.movements.length
    || sessionRef.current.finished?.items.length || sessionRef.current.finished?.operations.length
    || sessionRef.current.finished?.movements.length || sessionRef.current.sales.length
    || sessionRef.current.purchases?.length || sessionRef.current.productions?.length
    || sessionRef.current.moneyEvents?.length || recipesRef.current.length);
  const connectEmulator = async () => {
    setEmulatorBusy(true); setEmulatorMessage('');
    let candidate: CommercialPilotEmulatorClient | null = null;
    try {
      candidate = await connectCommercialPilotEmulator('ui');
      const remote = await candidate.read();
      emulatorClientRef.current?.close().catch(() => undefined);
      emulatorClientRef.current = candidate; setEmulatorClient(candidate);
      if (baseRevisionRef.current !== undefined) {
        if (remote.revision !== baseRevisionRef.current) setRemoteChanged(true);
        else setRemoteChanged(false);
      } else if (remote.revision === null) {
        if (!rememberEmulatorRevision(null)) throw new Error('Conexión lista, pero no se pudo conservar la revisión base en esta pestaña.');
        setRemoteChanged(false);
      } else if (!hasLocalPilotData()) {
        setRemoteChanged(true);
      } else {
        setRemoteChanged(true);
      }
      setEmulatorMessage('Conectado al proyecto demo-lifeos mediante Auth y Firestore Emulator.');
    } catch (cause) {
      if (candidate && candidate !== emulatorClientRef.current) await candidate.close().catch(() => undefined);
      setEmulatorMessage(cause instanceof Error ? cause.message : 'No se pudo conectar con los emuladores locales.');
    } finally { setEmulatorBusy(false); }
  };
  const refreshFromEmulator = async () => {
    if (!emulatorClient) return;
    setEmulatorBusy(true); setEmulatorMessage('');
    try {
      const remote = await emulatorClient.read();
      if (remote.revision === null || !remote.snapshot) {
        if (hasLocalPilotData()) {
          setRemoteChanged(baseRevisionRef.current !== null);
          if (baseRevisionRef.current !== null) throw new Error('El documento remoto ya no existe; se conserva el estado local y no se restablece una base vacía.');
        }
        if (!rememberEmulatorRevision(null)) throw new Error('No se pudo guardar la revisión base en esta pestaña.');
        setRemoteChanged(false); setEmulatorMessage('El emulador todavía no tiene una versión comercial.'); return;
      }
      const local = captureDurableCommercial(pilotSnapshotRef.current);
      const remoteSet = captureDurableCommercial(remote.snapshot);
      const identical = local.status === 'valid' && remoteSet.status === 'valid'
        && JSON.stringify(local.set) === JSON.stringify(remoteSet.set);
      if (!hasLocalPilotData() && pilotRawRef.current === null) {
        const saved = saveCommercialPilot(pilotSetup!.storage!, null, remote.snapshot);
        if (saved.status !== 'saved') throw new Error(saved.issues.join(' '));
        pilotSnapshotRef.current = saved.snapshot; pilotRawRef.current = saved.raw;
        sessionRef.current = saved.snapshot.session; recipesRef.current = saved.snapshot.recipes;
        setSession(saved.snapshot.session); setRecipes(saved.snapshot.recipes);
      } else if (!identical) {
        setRemoteChanged(true);
        throw new Error('La versión local y la remota difieren. Se conservan ambas; no se mezclan automáticamente. Abrí otra pestaña limpia para recuperar la remota.');
      }
      if (!rememberEmulatorRevision(remote.revision)) throw new Error('La versión se recuperó, pero no se pudo guardar su revisión base en esta pestaña.');
      setRemoteChanged(false); setEmulatorMessage('Versión remota validada y recuperada en esta pestaña.');
    } catch (cause) {
      setEmulatorMessage(cause instanceof Error ? cause.message : 'No se pudo actualizar desde el emulador.');
    } finally { setEmulatorBusy(false); }
  };
  const publishToEmulator = async () => {
    if (!emulatorClient || baseRevisionRef.current === undefined) {
      setEmulatorMessage('Actualizá desde el emulador para establecer una revisión base antes de publicar.'); return;
    }
    setEmulatorBusy(true); setEmulatorMessage('');
    try {
      const revision = await emulatorClient.publish(pilotSnapshotRef.current, baseRevisionRef.current);
      if (!rememberEmulatorRevision(revision)) {
        setEmulatorMessage('Firestore confirmó la publicación, pero la pestaña no pudo guardar la nueva revisión. Actualizá desde el emulador antes de continuar.');
        setRemoteChanged(true); return;
      }
      setRemoteChanged(false); setEmulatorMessage('Operación publicada en demo-lifeos.');
    } catch (cause) {
      if (cause instanceof ResaleRevisionConflict) setRemoteChanged(true);
      setEmulatorMessage(cause instanceof Error ? cause.message : 'La publicación fue rechazada; el estado local sigue conservado.');
    } finally { setEmulatorBusy(false); }
  };
  const storageBlocked = () => ({ status: 'blocked' as const, session: sessionRef.current,
    issues: [persistFailureRef.current || 'No se pudo guardar la operación.'] });
  const confirmSale = (request: SandboxSaleRequest) => {
    const result = confirmSandboxSale(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const confirmProduction = (request: SandboxProductionRequest) => {
    const result = confirmSandboxProduction(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const confirmPreparedSale = (request: SandboxProductionRequest) => {
    const result = confirmSandboxPreparedSale(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const confirmFinishedWaste = (request: SandboxFinishedWasteRequest) => {
    const result = confirmSandboxFinishedWaste(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const confirmPurchaseAdjustment = (request: SandboxPurchaseAdjustmentRequest) => {
    const result = confirmSandboxPurchaseAdjustment(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const confirmAdjustment = (request: SandboxSaleAdjustmentRequest) => {
    const result = confirmSandboxSaleAdjustment(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const confirmMoney = (request: SandboxMoneyRequest) => {
    if (pilotEnabled && request.finance.mode === 'existing') return { status: 'blocked' as const,
      session: sessionRef.current, issues: ['El piloto aislado no vincula movimientos de Finanzas.'] };
    if (pilotEnabled && request.purpose === 'customer_refund') return { status: 'blocked' as const,
      session: sessionRef.current, issues: ['Este piloto todavía no conserva qué cobros respaldan un reembolso.'] };
    const result = confirmSandboxMoneyEvent(sessionRef.current, request);
    if (result.status === 'confirmed' && !commitSession(result.session)) return storageBlocked();
    return result;
  };
  const directRequest = pendingDirect ? { id: pendingDirect.id, itemId: pendingDirect.itemId,
    units: parseNumber(pendingDirect.unitsText), unitPriceCents: parseDirectSaleUnitPrice(pendingDirect.priceText) ?? NaN } : null;
  const directPreview = directRequest ? previewSandboxDirectSale(session, directRequest) : null;
  const confirmDirect = () => {
    if (!directRequest || !directPreview?.valid) return;
    const choice: ImmediateChoice = directTiming === 'now'
      ? { timing: 'now', accountRef: directAccount } : { timing: 'later' };
    const result = confirmSandboxDirectSaleWithReceipt(sessionRef.current, directRequest, choice);
    if (result.status === 'blocked') setDirectError(result.issues.join(' '));
    else { if (result.status === 'confirmed') { if (!commitSession(result.session)) { setDirectError(persistFailureRef.current); return; } setRecentDirectSaleId(result.sale.id); } setPendingDirect(null); setDirectError(''); }
  };

  const createItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (entrySubmitted.current) return;
    try {
      const current = sessionRef.current;
      const inventory = addSandboxItem(current.inventory, name, newUnit, parseNumber(newQuantity), parseNumber(newCost));
      const choice: ImmediateChoice = entryTiming === 'now'
        ? { timing: 'now', accountRef: entryAccount } : { timing: 'later' };
      const result = confirmSandboxPurchaseWithPayment(current, inventory, choice);
      if (result.status === 'blocked') { setError(result.issues.join(' ')); return; }
      if (!commitSession(result.session)) { setError(persistFailureRef.current); return; }
      entrySubmitted.current = true;
      setStockView('available');
      setName(''); setNewQuantity(''); setNewCost(''); setShowNew(false); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la entrada.'); }
  };
  const openAction = (itemId: string, kind: ItemAction, itemUnit: StockUnit) => {
    setActive({ itemId, kind }); setUnit(itemUnit); setQuantity(''); setCost(''); setError(''); setShowNew(false);
    setEntryTiming('later'); setEntryAccount(''); entrySubmitted.current = false;
  };
  const applyAction = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || entrySubmitted.current) return;
    try {
      const current = sessionRef.current;
      const next = active.kind === 'receipt'
        ? addSandboxReceipt(current.inventory, active.itemId, parseNumber(quantity), unit, parseNumber(cost))
        : addSandboxExit(current.inventory, active.itemId, active.kind, parseNumber(quantity), unit);
      const choice: ImmediateChoice = entryTiming === 'now'
        ? { timing: 'now', accountRef: entryAccount } : { timing: 'later' };
      const result = active.kind === 'receipt'
        ? confirmSandboxPurchaseWithPayment(current, next, choice)
        : { status: 'confirmed' as const, session: { ...current, inventory: next } };
      if (result.status === 'blocked') { setError(result.issues.join(' ')); return; }
      if (!commitSession(result.session)) { setError(persistFailureRef.current); return; }
      entrySubmitted.current = true;
      setActive(null); setError('');
      if (active.kind === 'receipt') setStockView('available');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la operación.'); }
  };

  if (pilotSetup?.load.status === 'blocked') return <section id="commercial-inventory-sandbox" role="alert" className="space-y-2 rounded-2xl border border-amber-500/50 bg-[var(--card)] p-4 text-sm text-[var(--text)]">
    <strong>El piloto local necesita revisión.</strong>
    <p>{pilotSetup.load.raw !== null
      ? 'Los datos originales siguen en el espacio de esta pestaña. No se iniciaron operaciones ni se reemplazó el historial.'
      : 'No se pudo verificar el almacenamiento de esta pestaña. No se iniciaron operaciones.'}</p>
    <p className="text-sm text-[var(--text-soft)]">{pilotSetup.load.issues.join(' ')}</p>
    {pilotSetup.load.raw !== null && <button type="button" onClick={() => {
      const url = URL.createObjectURL(new Blob([pilotSetup.load.raw!], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'celestea-piloto-comercial-bloqueado.json'; link.click();
      URL.revokeObjectURL(url);
    }} className={actionSecondary}>Descargar copia original</button>}
    <button type="button" onClick={onClose} className={actionSecondary}>{production ? 'Volver' : 'Cerrar prueba'}</button>
  </section>;

  return <section id="commercial-inventory-sandbox" className={production ? 'space-y-5' : 'space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5'} aria-label={production ? 'Inventario comercial' : 'Inventario de prueba'}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {!production && <p className="text-sm font-bold text-amber-600">{pilotEnabled ? 'Piloto local · guardado solo en esta pestaña · sin Finanzas ni nube' : 'Modo de prueba · los datos no se guardan'}</p>}
        <h2 className="text-base font-bold text-[var(--text)]">{production ? 'Inventario' : 'Inventario de prueba'}{production && <span className="ml-3 text-sm font-normal text-[var(--text-soft)]">UYU</span>}</h2>
      </div>
      {inventory.items.length > 0 && !showNew && <button type="button" onClick={() => { setShowNew(true); setActive(null); setError(''); setEntryTiming('later'); setEntryAccount(''); entrySubmitted.current = false; }} className="min-h-11 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold text-[var(--text)]">Agregar otro artículo</button>}
      {!production && <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-sm font-bold text-[var(--text-soft)]">Cerrar prueba</button>}
    </div>

    {pilotError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">No se confirmó la operación: {pilotError}</p>}
    {pilotSyncEnabled && <section className="space-y-2 rounded-xl border border-[var(--border)] p-3" aria-label="Sincronización con emuladores de prueba">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-bold text-[var(--text)]">Emulador Firebase · demo-lifeos</h3><p className="text-sm text-[var(--text-soft)]">Solo datos de prueba. Abrí otra pestaña para simular el segundo cliente.</p></div>
        <div className="flex flex-wrap gap-2">
          {!emulatorClient && <button type="button" disabled={emulatorBusy || !pilotSetup?.storage || pilotSetup.load.status === 'blocked'} onClick={() => void connectEmulator()} className={actionSecondary}>{emulatorBusy ? 'Conectando…' : 'Conectar cliente'}</button>}
          {emulatorClient && <><button type="button" disabled={emulatorBusy} onClick={() => void refreshFromEmulator()} className={actionSecondary}>{emulatorBusy ? 'Consultando…' : 'Actualizar desde emulador'}</button><button type="button" disabled={emulatorBusy || baseRevision === undefined || remoteChanged} onClick={() => void publishToEmulator()} className={actionPrimary}>{emulatorBusy ? 'Publicando…' : 'Publicar en emulador'}</button></>}
        </div>
      </div>
      {emulatorMessage && <p role="status" className="text-sm text-[var(--text-soft)]">{emulatorMessage}</p>}
      {remoteChanged && <p role="alert" className="text-sm font-semibold text-amber-700 dark:text-amber-400">La revisión remota cambió o requiere recuperación. Se conserva esta copia local; no se fusionan operaciones automáticamente.</p>}
    </section>}
    {(pendingMoney.receivableCents > 0 || pendingMoney.payableCents > 0 || pendingMoney.refundableCents > 0) && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border)] pb-3 text-sm text-[var(--text)]">
      <span>{pendingMoney.receivableCents > 0 && <>Por cobrar <strong className="tabular-nums">{fmtMoney(pendingMoney.receivableCents / 100)}</strong></>}{pendingMoney.receivableCents > 0 && (pendingMoney.payableCents > 0 || pendingMoney.refundableCents > 0) && ' · '}{pendingMoney.payableCents > 0 && <>Por pagar <strong className="tabular-nums">{fmtMoney(pendingMoney.payableCents / 100)}</strong></>}{pendingMoney.payableCents > 0 && pendingMoney.refundableCents > 0 && ' · '}{pendingMoney.refundableCents > 0 && <>Por reembolsar <strong className="tabular-nums">{fmtMoney(pendingMoney.refundableCents / 100)}</strong></>}</span>
      <a href="#commercial-money-sandbox" className="font-bold text-[var(--blue)] underline-offset-2 hover:underline">Ir a cobros y pagos</a>
    </div>}

    {inventory.items.length === 0 && !showNew && <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-[var(--blue)]/25 bg-[var(--blue)]/5 p-4 sm:flex-row sm:items-center">
      <div><h3 className="text-base font-bold text-[var(--text)]">Sin artículos registrados</h3><p className="mt-1 text-sm text-[var(--text-soft)]">Agregá un artículo o insumo con su cantidad y costo de compra.</p></div>
      <button type="button" onClick={() => { setShowNew(true); setActive(null); setError(''); setEntryTiming('later'); setEntryAccount(''); entrySubmitted.current = false; }} className="min-h-10 w-full shrink-0 rounded-xl bg-[var(--blue)] px-4 py-2.5 text-sm font-bold text-white sm:w-auto">Agregar artículo o insumo</button>
    </div>}
    {showNew && <form onSubmit={createItem} className="grid grid-cols-2 gap-2.5 rounded-xl bg-[var(--bg-elevated)] p-3 sm:grid-cols-4">
      <label className={`${labelClass} col-span-full sm:col-span-1`}>Artículo o insumo<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: panes" className={fieldClass} /></label>
      <label className={labelClass}>Cantidad que ingresa<input required type="number" min="0" step="any" value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} className={fieldClass} /></label>
      <label className={labelClass}>Unidad<select value={newUnit} onChange={(event) => setNewUnit(event.target.value as StockUnit)} className={fieldClass}>{units.map((candidate) => <option key={candidate} value={candidate}>{unitLabel[candidate]}</option>)}</select></label>
      <label className={`${labelClass} col-span-full sm:col-span-1`}>Costo total ($U)<input required type="number" min="0" step="0.01" value={newCost} onChange={(event) => setNewCost(event.target.value)} className={fieldClass} /></label>
      {entryPaymentFields}
      <div className="col-span-full flex gap-2"><button className="rounded-xl bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white">Guardar entrada</button><button type="button" onClick={() => { setShowNew(false); setError(''); }} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-soft)]">Cancelar</button></div>
    </form>}
    {inventory.items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="Ver insumos por existencias" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={stockView === 'available'} onClick={() => setStockView('available')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${stockView === 'available' ? 'border-[var(--blue)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>Con stock ({availableCount})</button>
        <button type="button" aria-pressed={stockView === 'empty'} onClick={() => setStockView('empty')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${stockView === 'empty' ? 'border-[var(--blue)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>Sin stock ({stockEntries.length - availableCount})</button>
      </div>
    </div>}
    {inventory.items.length > 0 && shownEntries.length === 0 && <p className="text-sm text-[var(--text-soft)]">{stockView === 'available' ? 'Sin stock disponible. Elegí «Sin stock» para reponer artículos.' : 'No hay artículos agotados.'}</p>}
    {shownEntries.length > 0 && <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {shownEntries.map(({ item, summary }) => {
        const isActive = active?.itemId === item.id;
        const history = inventory.movements.filter((movement) => movement.itemId === item.id).slice().reverse();
        return <article key={item.id} className={"@container min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 " + (shownEntries.length === 1 ? "sm:col-span-2 lg:col-span-3" : "")}>
          <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-extrabold text-[var(--text)]">{item.name}</h3><span className="shrink-0 text-sm text-[var(--text-faint)]">{unitLabel[item.unit]}</span></div>
          <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 @md:grid-cols-4">
            <div className="min-w-0"><span className="block text-sm font-bold text-[var(--text-faint)]">Disponible</span><strong className="block break-words text-lg tabular-nums text-[var(--text)]">{formatQuantity(summary.quantity)} {unitLabel[item.unit]}</strong></div>
            <div className="min-w-0"><span className="flex flex-wrap items-center gap-1 text-sm font-bold text-[var(--text-faint)]">Valor disponible<ContextualHelp label="Valor disponible">Valor estimado de la cantidad que queda, calculado con el costo promedio de las entradas. No representa dinero en caja.</ContextualHelp></span><strong className="block break-words text-sm tabular-nums text-[var(--text)]">{fmtMoney(summary.valueCents / 100)}</strong></div>
            <div className="min-w-0"><span className="flex flex-wrap items-center gap-1 text-sm font-bold text-[var(--text-faint)]">Costo / {unitLabel[item.unit]}<ContextualHelp label="Costo por unidad">Costo promedio actual por unidad de medida, según las entradas registradas.</ContextualHelp></span><strong className="block break-words text-sm tabular-nums text-[var(--text)]">{fmtMoney(summary.averageUnitCost)}</strong></div>
            <div className="min-w-0 text-sm text-[var(--text-soft)]"><span className="block">Utilizado: <b className="tabular-nums">{formatQuantity(summary.consumed)} {unitLabel[item.unit]}</b></span><span className="block">Pérdidas: <b className="tabular-nums">{formatQuantity(summary.discarded)} {unitLabel[item.unit]}</b></span></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => openAction(item.id, 'receipt', item.unit)} className={actionPrimary}>Reponer stock</button>
            {summary.quantity > 0 && <button type="button" onClick={() => openAction(item.id, 'consumption', item.unit)} className={actionSecondary}>Registrar uso</button>}
            {summary.quantity > 0 && <button type="button" onClick={() => openAction(item.id, 'waste', item.unit)} className={actionSecondary}>Registrar pérdida</button>}
            {summary.quantity > 0 && item.unit === 'unit' && <button type="button" onClick={() => { directCounter.current = Math.max(directCounter.current, maxIdSuffix(sessionRef.current.sales.map((sale) => sale.id), /^sandbox-direct-(\d+)$/)) + 1; setPendingDirect({ id: `sandbox-direct-${directCounter.current}`, itemId: item.id, unitsText: '1', priceText: '' }); setDirectTiming('later'); setDirectAccount(''); setDirectError(''); setActive(null); setShowNew(false); }} className="rounded-lg border border-emerald-500/40 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors">Vender artículo</button>}
          </div>
          {isActive && <form onSubmit={applyAction} className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-3">
            <label className={labelClass}>Cantidad<input autoFocus required type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={fieldClass} /></label>
            <label className={labelClass}>Unidad<select value={unit} onChange={(event) => setUnit(event.target.value as StockUnit)} className={fieldClass}>{(item.unit === 'unit' ? ['unit'] : ['kg', 'g']).map((candidate) => <option key={candidate} value={candidate}>{unitLabel[candidate as StockUnit]}</option>)}</select></label>
            {active.kind === 'receipt' && <label className={`${labelClass} col-span-full sm:col-span-1`}>Costo total ($U)<input required type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} className={fieldClass} /></label>}
            {active.kind === 'receipt' && entryPaymentFields}
            {active.kind !== 'receipt' && <p className="col-span-full inline-flex items-center gap-1 text-sm text-[var(--text-soft)]">{active.kind === 'waste' ? 'Registrar pérdida' : 'Registrar uso'}<ContextualHelp label={active.kind === 'waste' ? 'Pérdida de insumos' : 'Uso de insumos'}>{active.kind === 'waste' ? 'Mercadería que se dañó, venció o no pudo aprovecharse.' : 'Materiales utilizados para preparar o fabricar otro producto. No registra una venta ni crea un producto terminado.'}</ContextualHelp></p>}
            <div className="col-span-full flex items-end gap-2"><button className="rounded-xl bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white">{active.kind === 'receipt' ? 'Guardar entrada' : active.kind === 'waste' ? 'Confirmar pérdida' : 'Confirmar uso'}</button><button type="button" onClick={() => { setActive(null); setError(''); }} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-soft)]">Cancelar</button></div>
          </form>}
          <details className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--text-soft)]">
            <summary className="cursor-pointer font-bold">Historial de movimientos ({history.length})</summary>
            <ol className="mt-2 max-h-40 space-y-1 overflow-y-auto">{history.map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-x-2 border-b border-[var(--border)] py-1 last:border-0"><span>{movement.kind === 'receipt' ? 'Entrada' : movement.kind === 'consumption' ? 'Uso' : movement.kind === 'waste' ? 'Pérdida' : 'Venta'} · {formatQuantity(movement.quantity)} {unitLabel[movement.unit]}</span><span className="tabular-nums">Costo histórico {fmtMoney((movement.costCents || 0) / 100)}</span></li>)}</ol>
          </details>
        </article>;
      })}
    </div>}
    {pendingDirect && directPreview && <section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" aria-label="Vista previa de venta directa">
      <div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-sm font-extrabold text-[var(--text)]">Venta directa · {directPreview.item?.name || 'Artículo'}</h3><p className="text-sm text-[var(--text-soft)]">Se descuenta este artículo sin receta. {production ? 'El cobro inmediato se registra en la cuenta seleccionada de Finanzas.' : 'El cobro es simulado y no modifica Finanzas.'}</p></div><button type="button" onClick={() => { setPendingDirect(null); setDirectError(''); }} className="text-sm font-bold text-[var(--text-soft)]">Cancelar</button></div>
      <div className="grid gap-2 sm:grid-cols-2"><label className={labelClass}>Unidades a vender<input type="number" min="1" step="1" value={pendingDirect.unitsText} onChange={(event) => { setPendingDirect({ ...pendingDirect, unitsText: event.target.value }); setDirectError(''); }} className={fieldClass} /></label><label className={labelClass}>Precio por unidad ($U)<input type="text" inputMode="decimal" value={pendingDirect.priceText} onChange={(event) => { setPendingDirect({ ...pendingDirect, priceText: event.target.value }); setDirectError(''); }} className={fieldClass} /></label></div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text)]"><legend className="mb-1 font-semibold text-[var(--text-soft)]">Cobro de esta venta</legend>
        <label className="inline-flex items-center gap-1.5"><input type="radio" name="direct-collection" checked={directTiming === 'later'} onChange={() => setDirectTiming('later')} />Cobrar después</label>
        <label className="inline-flex items-center gap-1.5"><input type="radio" name="direct-collection" checked={directTiming === 'now'} onChange={() => setDirectTiming('now')} />Cobrado ahora</label>
      </fieldset>
      {directTiming === 'now' && <label className={`${labelClass} block max-w-xs`}>{production ? 'Cuenta' : 'Cuenta simulada'}{production ? <select required value={directAccount} onChange={e => setDirectAccount(e.target.value)} className={fieldClass}><option value="">Seleccionar cuenta</option>{production.accounts.filter(a => (a.currency || 'UYU') === 'UYU').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : <input required value={directAccount} onChange={(event) => setDirectAccount(event.target.value)} placeholder="Ej.: caja de prueba" className={fieldClass} />}</label>}
      {directTiming === 'now' && production?.financeFields?.()}
      <p className="text-sm text-[var(--text-soft)]">Disponibles: {directPreview.available} · Quedarían: {directPreview.remaining == null ? '—' : directPreview.remaining}</p>
      {directPreview.totals && <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><span>Venta comercial <b className="block">{fmtMoney(directPreview.totals.revenueCents / 100)}</b></span><span>Costo histórico <b className="block">{fmtMoney(directPreview.totals.totalCostCents / 100)}</b></span><span>Ganancia bruta <b className="block">{fmtMoney(directPreview.totals.grossProfitCents / 100)}</b></span><span>Margen bruto <b className="block">{directPreview.totals.grossMarginPercent.toFixed(2)} %</b></span></div>}
      {directPreview.issues.map((issue, index) => <p key={index} className="text-sm font-semibold text-rose-600">{issue}</p>)}{directError && <p role="alert" className="text-sm font-semibold text-rose-600">{directError}</p>}
      <button type="button" disabled={!directPreview.valid} onClick={confirmDirect} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Confirmar venta directa</button>
    </section>}
    {recentDirectSaleId && (sandboxSaleBalance(session, recentDirectSaleId)?.pendingCents ?? 0) > 0 && <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-soft)]">Venta registrada · pendiente de cobro {fmtMoney(sandboxSaleBalance(session, recentDirectSaleId)!.pendingCents / 100)} <a href="#commercial-money-sandbox" className="font-bold text-[var(--blue)] underline-offset-2 hover:underline">Ir al cobro</a></p>}
    {error && <p role="alert" className="text-sm font-bold text-rose-600">{error}</p>}
    <CommercialMoneySandbox accounts={production?.accounts} financeFields={production?.financeFields} session={session} onConfirm={confirmMoney} onConfirmPurchaseAdjustment={confirmPurchaseAdjustment} />
    {(inventory.items.length > 0 || session.sales.length > 0 || (session.productions?.length ?? 0) > 0 || (session.finishedWastes?.length ?? 0) > 0 || (session.finished?.items.length ?? 0) > 0 || recipes.length > 0) && <CommercialRecipesSandbox production={Boolean(production)} inventory={inventory} session={session} sales={session.sales} recipes={recipes} onRecipesChange={commitRecipes} onConfirmSale={confirmSale} onConfirmProduction={confirmProduction} onConfirmPreparedSale={confirmPreparedSale} onConfirmFinishedWaste={confirmFinishedWaste} onConfirmAdjustment={confirmAdjustment} />}
  </section>;
};
