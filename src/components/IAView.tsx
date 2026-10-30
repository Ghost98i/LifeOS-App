import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { computeResaleMarginPct, computeResalePriority } from '../lib/calculations';
import { fmtMoney, todayISO, uid } from '../lib/storage';
import {
  AIImportPreview,
  applyAIImport,
  applyJobOpportunity,
  buyResaleOpportunity,
  parseAIImport,
} from '../lib/aiImport';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';

function safeExternalLink(value: string): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

interface IAViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onOpenBusiness?: () => void;
}

const AI_PROMPT = `Actuá como mi motor de oportunidades. Buscá:
1. Empleos junior o de soporte técnico con requisitos claros y una fuente verificable.
2. Hardware o tecnología usada con margen de reventa atractivo.
3. Becas, descuentos o ideas realistas para generar ingresos.

Respondé ÚNICAMENTE con JSON válido, sin explicaciones ni bloques Markdown:
{"empleo":[{"empresa":"","puesto":"","rating":1,"link":"","nota":""}],"reventa":[{"item":"","buyPrice":0,"marketPrice":0,"nota":""}],"ideas":[""]}`;

const AI_SCHEMA = `{
  "empleo": [{
    "empresa": "texto",
    "puesto": "texto",
    "rating": 1,
    "link": "url opcional",
    "nota": "texto opcional"
  }],
  "reventa": [{
    "item": "texto",
    "buyPrice": 0,
    "marketPrice": 0,
    "nota": "texto opcional"
  }],
  "ideas": ["texto"]
}`;

export const IAView: React.FC<IAViewProps> = ({ state, onUpdateState, onOpenBusiness }) => {
  const [rawImport, setRawImport] = useState('');
  const [preview, setPreview] = useState<AIImportPreview | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'prompt' | 'schema' | null>(null);

  const [jobCompany, setJobCompany] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [jobLink, setJobLink] = useState('');
  const [resaleItem, setResaleItem] = useState('');
  const [resaleBuy, setResaleBuy] = useState('');
  const [resaleMarket, setResaleMarket] = useState('');
  const [ideaText, setIdeaText] = useState('');

  const jobOpportunities = (state.jobs?.opportunities || []).filter((item) => item.status === 'nueva');
  const resaleOpportunities = (state.resale?.opportunities || []).filter((item) => item.status === 'nueva');
  const invalidImportLink = preview?.payload.empleo.some(item => item.link && !safeExternalLink(item.link));

  const copyText = async (kind: 'prompt' | 'schema', content: string) => {
    let copiedSuccessfully = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        copiedSuccessfully = true;
      }
    } catch {
      // file:// can block the modern Clipboard API. Use the local fallback below.
    }

    if (!copiedSuccessfully) {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      copiedSuccessfully = document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (copiedSuccessfully) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1400);
    } else {
      setMessage('No pude copiar automáticamente. Seleccioná el texto y usá Ctrl+C.');
    }
  };

  const saveAIChange = (updater: (draft: LifeOSState) => void) => {
    try { if (onUpdateState(updater) !== false) return true; }
    catch { /* Keep imported data and manual drafts on a failed save. */ }
    setMessage('No se pudo guardar. El contenido sigue disponible para reintentar.');
    return false;
  };

  const handlePreview = () => {
    try {
      setPreview(parseAIImport(rawImport));
      setMessage('');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : 'No se pudo leer la respuesta.');
    }
  };

  const handleConfirmImport = () => {
    if (!preview) return;
    if (invalidImportLink) { setMessage('Revisá los enlaces antes de guardar: solo se admiten direcciones http o https.'); return; }
    let added = 0;
    const saved = saveAIChange((draft) => {
      added = applyAIImport(draft, preview.payload);
    });
    if (saved === false) { setMessage('No se pudo guardar. La revisión sigue disponible para reintentar.'); return; }
    const skipped = preview.total - added;
    if (skipped > 0) {
      setMessage(`Se importaron ${added} elemento(s). (${skipped} duplicado(s) omitido(s)). Revisalos antes de actuar.`);
    } else {
      setMessage(`Se importaron ${added} elemento(s). Revisalos antes de actuar.`);
    }
    setRawImport('');
    setPreview(null);
  };

  const handleApplyJob = (id: string) => {
    saveAIChange((draft) => applyJobOpportunity(draft, id));
  };

  const handleDiscardJob = (id: string) => {
    saveAIChange((draft) => {
      if (!draft.jobs) draft.jobs = { applications: [], opportunities: [] } as any;
      if (!draft.jobs.opportunities) draft.jobs.opportunities = [];
      const opportunity = draft.jobs.opportunities.find((item) => item.id === id);
      if (opportunity) opportunity.status = 'descartada';
    });
  };

  const handleBuyResale = (id: string) => {
    if (onOpenBusiness) { onOpenBusiness(); return; }
    try { saveAIChange((draft) => buyResaleOpportunity(draft, id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar la compra.'); }
  };

  const handleDiscardResale = (id: string) => {
    saveAIChange((draft) => {
      if (!draft.resale) draft.resale = { inventory: [], opportunities: [] } as any;
      if (!draft.resale.opportunities) draft.resale.opportunities = [];
      const opportunity = draft.resale.opportunities.find((item) => item.id === id);
      if (opportunity) opportunity.status = 'descartada';
    });
  };

  const handleAddJob = (event: React.FormEvent) => {
    event.preventDefault();
    if (!jobCompany.trim()) return;
    const saved = saveAIChange((draft) => {
      if (!draft.jobs) draft.jobs = { applications: [], opportunities: [] } as any;
      if (!draft.jobs.opportunities) draft.jobs.opportunities = [];
      draft.jobs.opportunities.push({
        id: uid(),
        empresa: jobCompany.trim(),
        puesto: jobRole.trim(),
        rating: 3,
        link: jobLink.trim(),
        nota: '',
        fecha: todayISO(),
        status: 'nueva',
      });
    });
    if (saved === false) return;
    setJobCompany('');
    setJobRole('');
    setJobLink('');
  };

  const handleAddResale = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resaleItem.trim()) return;
    const saved = saveAIChange((draft) => {
      if (!draft.resale) draft.resale = { inventory: [], opportunities: [] } as any;
      if (!draft.resale.opportunities) draft.resale.opportunities = [];
      draft.resale.opportunities.push({
        id: uid(),
        item: resaleItem.trim(),
        buyPrice: Number(resaleBuy) || 0,
        marketPrice: Number(resaleMarket) || 0,
        nota: '',
        fecha: todayISO(),
        status: 'nueva',
      });
    });
    if (saved === false) return;
    setResaleItem('');
    setResaleBuy('');
    setResaleMarket('');
  };

  const handleAddIdea = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ideaText.trim()) return;
    const saved = saveAIChange((draft) => {
      if (!draft.ideas) draft.ideas = [];
      draft.ideas.push({ id: uid(), text: ideaText.trim(), date: todayISO(), source: 'manual' });
    });
    if (saved === false) return;
    setIdeaText('');
  };

  const handleDeleteIdea = (id: string) => {
    saveAIChange((draft) => {
      draft.ideas = (draft.ideas || []).filter((idea) => idea.id !== id);
    });
  };

  return (
    <div className="ai-refinement space-y-6">
      <PageHeader title="IA · Oportunidades e ideas" subtitle="Usá una IA externa para investigar y traé los resultados para revisarlos acá." />
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3" aria-label="Preparar búsqueda externa">
        <h2 className="text-base font-bold text-[var(--text)]">1. Prepará la búsqueda</h2>
        <p className="text-sm text-[var(--text-soft)]">Buscá empleos, posibles compras para reventa e ideas. Copiá las instrucciones en la IA que uses; Celestian no le envía tus datos.</p>
        <button type="button" onClick={() => copyText('prompt', AI_PROMPT)} className="min-h-11 px-4 rounded-xl bg-[var(--blue)] text-white text-sm font-semibold">{copied === 'prompt' ? 'Copiado' : 'Copiar instrucciones'}</button>
        <details className="text-sm text-[var(--text-soft)]">
          <summary className="min-h-9 cursor-pointer">Ver instrucciones y formato de respuesta</summary>
          <label className="block space-y-1 pt-3">Instrucciones<textarea aria-label="Instrucciones para la IA externa" readOnly value={AI_PROMPT} rows={7} className="block w-full p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] font-mono" /></label>
          <label className="block space-y-1 pt-3">Formato JSON<textarea aria-label="Formato JSON" readOnly value={AI_SCHEMA} rows={7} className="block w-full p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] font-mono" /></label>
          <button type="button" onClick={() => copyText('schema', AI_SCHEMA)} className="min-h-11 mt-2 px-3 border border-[var(--border)] rounded-xl">{copied === 'schema' ? 'Copiado' : 'Copiar formato'}</button>
        </details>
      </section>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3" aria-label="Revisar respuesta externa">
        <h2 className="text-base font-bold text-[var(--text)]">2. Traé la respuesta</h2>
        <label className="block space-y-2 text-sm text-[var(--text-soft)]">Respuesta de la IA (JSON)
          <textarea aria-label="Respuesta de la IA (JSON)" value={rawImport} onChange={event => { setRawImport(event.target.value); setPreview(null); setMessage(''); }} rows={5} placeholder="Pegá la respuesta para revisarla…" className="block w-full p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] font-mono" />
        </label>
        <button type="button" onClick={handlePreview} className="min-h-11 px-4 bg-[var(--blue)] text-white text-sm font-semibold rounded-xl">Revisar resultados</button>
        {message && <p role="status" className="text-sm font-medium text-[var(--text)]">{message}</p>}
        {preview && <div className="border-t border-[var(--border)] pt-4 space-y-3" aria-label="Vista previa de la importación">
          <h3 className="text-base font-bold text-[var(--text)]">3. Revisá antes de guardar</h3>
          <p className="text-sm text-[var(--text-soft)]">Guardarlos no crea postulaciones ni registra compras. Verificá las fuentes y los precios antes de actuar.</p>
          {invalidImportLink && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">Hay un enlace no utilizable. Corregilo o quitá su dirección antes de guardar; solo se admiten enlaces http o https.</p>}
          <div className="max-h-[60vh] overflow-y-auto space-y-3 text-sm text-[var(--text)]">
            {preview.payload.empleo.length > 0 && <section><h4 className="font-semibold">Empleos ({preview.payload.empleo.length})</h4><ul className="divide-y divide-[var(--border)]">{preview.payload.empleo.map((item,index) => <li key={index} className="py-2 break-words"><strong>{item.empresa}</strong> · {item.puesto}<p>{item.nota}</p>{item.link && <p className="break-all">{item.link}{!safeExternalLink(item.link) && ' · Enlace no utilizable'}</p>}</li>)}</ul></section>}
            {preview.payload.reventa.length > 0 && <section><h4 className="font-semibold">Posibles compras ({preview.payload.reventa.length})</h4><ul>{preview.payload.reventa.map((item,index) => <li key={index} className="py-2 break-words"><strong>{item.item}</strong> · Compra {fmtMoney(item.buyPrice)} · Mercado {fmtMoney(item.marketPrice)}<p>{item.nota}</p></li>)}</ul></section>}
            {preview.payload.ideas.length > 0 && <section><h4 className="font-semibold">Ideas ({preview.payload.ideas.length})</h4><ul>{preview.payload.ideas.map((item,index) => <li key={index} className="py-2 break-words">{item}</li>)}</ul></section>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(invalidImportLink)} onClick={handleConfirmImport} className="min-h-11 px-4 bg-[var(--blue)] text-white text-sm font-semibold rounded-xl disabled:opacity-50">Confirmar importación</button>
            <button type="button" onClick={() => { setPreview(null); setMessage(''); }} className="min-h-11 px-4 border border-[var(--border)] text-[var(--text)] text-sm rounded-xl">Cancelar revisión</button>
          </div>
        </div>}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text)]">Empleos para revisar</h2>
          <p className="text-xs text-[var(--text-soft)]">Creá una postulación cuando decidas seguir una oportunidad.</p>
        </div>
        <details><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[var(--text-soft)]">Agregar empleo manualmente</summary><form onSubmit={handleAddJob} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <input aria-label="Empresa" value={jobCompany} onChange={(event) => setJobCompany(event.target.value)} placeholder="Empresa" className="flex-1 min-w-32 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input aria-label="Puesto" value={jobRole} onChange={(event) => setJobRole(event.target.value)} placeholder="Puesto" className="flex-1 min-w-32 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input aria-label="Enlace del empleo" value={jobLink} onChange={(event) => setJobLink(event.target.value)} placeholder="Link opcional" className="flex-1 min-w-40 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <button type="submit" className="px-3.5 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer">Agregar</button>
        </form></details>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobOpportunities.length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay oportunidades pendientes.</p> : jobOpportunities.sort((a, b) => (b.rating || 0) - (a.rating || 0)).map((opportunity) => (
            <article key={opportunity.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
              <div className="font-bold text-sm text-[var(--text)]">{opportunity.empresa}</div>
              <div className="text-xs text-[var(--text-soft)]">{opportunity.puesto || 'Puesto sin especificar'}</div>
              <div className="text-[var(--text-soft)] text-sm">Valoración: {opportunity.rating}/5</div>
              {opportunity.nota && <p className="text-xs text-[var(--text-soft)]">{opportunity.nota}</p>}
              {safeExternalLink(opportunity.link) && <a href={safeExternalLink(opportunity.link)} target="_blank" rel="noreferrer" className="block text-xs font-bold text-[var(--blue)] hover:underline">Ver oferta ↗</a>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleApplyJob(opportunity.id)} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-lg cursor-pointer">Crear postulación</button>
                <button onClick={() => handleDiscardJob(opportunity.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 text-xs font-bold rounded-lg cursor-pointer">Descartar</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text)]">Posibles compras para reventa</h2>
          <p className="text-xs text-[var(--text-soft)]">Registrá la compra en Mi negocio eligiendo su cuenta, categoría y forma de pago. La oportunidad se conserva para consultar sus datos.</p>
        </div>
        <details><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[var(--text-soft)]">Agregar posible compra manualmente</summary><form onSubmit={handleAddResale} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <input aria-label="Producto" value={resaleItem} onChange={(event) => setResaleItem(event.target.value)} placeholder="Producto" className="flex-1 min-w-36 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input type="number" aria-label="Costo de compra estimado" value={resaleBuy} onChange={(event) => setResaleBuy(event.target.value)} placeholder="Compra" className="w-28 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input type="number" aria-label="Precio de mercado estimado" value={resaleMarket} onChange={(event) => setResaleMarket(event.target.value)} placeholder="Mercado" className="w-28 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <button type="submit" className="px-3.5 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer">Agregar</button>
        </form></details>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {resaleOpportunities.length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay oportunidades pendientes.</p> : resaleOpportunities.sort((a, b) => computeResalePriority(b) - computeResalePriority(a)).map((opportunity) => {
            const profit = opportunity.marketPrice - opportunity.buyPrice;
            return (
              <article key={opportunity.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
                <div className="font-bold text-sm text-[var(--text)]">{opportunity.item}</div>
                <div className="text-[var(--text-soft)] text-sm">Prioridad: {computeResalePriority(opportunity)}/5</div>
                <p className="text-xs text-[var(--text-soft)]">Compra {fmtMoney(opportunity.buyPrice)} · Mercado {fmtMoney(opportunity.marketPrice)}</p>
                <p className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Margen estimado: {fmtMoney(profit)} ({computeResaleMarginPct(opportunity).toFixed(0)}%)</p>
                {opportunity.nota && <p className="text-xs text-[var(--text-soft)]">{opportunity.nota}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleBuyResale(opportunity.id)} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-lg cursor-pointer">{onOpenBusiness ? 'Registrar en Mi negocio' : 'Comprar'}</button>
                  <button onClick={() => handleDiscardResale(opportunity.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 text-xs font-bold rounded-lg cursor-pointer">Descartar</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-[var(--text)]">Ideas guardadas</h2>
        <details><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[var(--text-soft)]">Agregar idea manualmente</summary><form onSubmit={handleAddIdea} className="flex gap-2">
          <input aria-label="Idea" value={ideaText} onChange={(event) => setIdeaText(event.target.value)} placeholder="Guardar una idea manual…" className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <button type="submit" className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl cursor-pointer">Guardar idea</button>
        </form></details>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(state.ideas || []).length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay ideas guardadas.</p> : (state.ideas || []).map((idea) => (
            <article key={idea.id} className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 pr-9">
              <button aria-label="Eliminar idea" onClick={() => handleDeleteIdea(idea.id)} className="absolute right-3 top-3 min-h-9 min-w-9 flex items-center justify-center text-[var(--text-faint)] hover:text-red-500 cursor-pointer"><AppIcon name="x" className="h-4 w-4" /></button>
              <p className="text-xs font-medium text-[var(--text)]">{idea.text}</p>
              <span className="block mt-2 text-[10px] text-[var(--text-faint)]">{idea.source === 'ia' ? 'IA externa' : 'Manual'} · {idea.date}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
