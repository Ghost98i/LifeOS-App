import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { computeResaleMarginPct, computeResalePriority } from '../lib/calculations';
import { fmtMoney, stars, todayISO, uid } from '../lib/storage';
import {
  AIImportPreview,
  applyAIImport,
  applyJobOpportunity,
  buyResaleOpportunity,
  parseAIImport,
} from '../lib/aiImport';
import { PageHeader } from './PageHeader';

interface IAViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
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

export const IAView: React.FC<IAViewProps> = ({ state, onUpdateState }) => {
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

  const jobOpportunities = state.jobs.opportunities.filter((item) => item.status === 'nueva');
  const resaleOpportunities = state.resale.opportunities.filter((item) => item.status === 'nueva');

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
    onUpdateState((draft) => applyAIImport(draft, preview.payload));
    setMessage(`Se importaron ${preview.total} elemento(s). Revisalos antes de actuar.`);
    setRawImport('');
    setPreview(null);
  };

  const handleApplyJob = (id: string) => {
    onUpdateState((draft) => applyJobOpportunity(draft, id));
  };

  const handleDiscardJob = (id: string) => {
    onUpdateState((draft) => {
      const opportunity = draft.jobs.opportunities.find((item) => item.id === id);
      if (opportunity) opportunity.status = 'descartada';
    });
  };

  const handleBuyResale = (id: string) => {
    onUpdateState((draft) => buyResaleOpportunity(draft, id));
  };

  const handleDiscardResale = (id: string) => {
    onUpdateState((draft) => {
      const opportunity = draft.resale.opportunities.find((item) => item.id === id);
      if (opportunity) opportunity.status = 'descartada';
    });
  };

  const handleAddJob = (event: React.FormEvent) => {
    event.preventDefault();
    if (!jobCompany.trim()) return;
    onUpdateState((draft) => {
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
    setJobCompany('');
    setJobRole('');
    setJobLink('');
  };

  const handleAddResale = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resaleItem.trim()) return;
    onUpdateState((draft) => {
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
    setResaleItem('');
    setResaleBuy('');
    setResaleMarket('');
  };

  const handleAddIdea = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ideaText.trim()) return;
    onUpdateState((draft) => {
      draft.ideas.push({ id: uid(), text: ideaText.trim(), date: todayISO(), source: 'manual' });
    });
    setIdeaText('');
  };

  const handleDeleteIdea = (id: string) => {
    onUpdateState((draft) => {
      draft.ideas = draft.ideas.filter((idea) => idea.id !== id);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        category="Asistente & Automatización"
        title="IA bajo demanda"
        subtitle="LifeOS prepara el trabajo; vos elegís la IA, revisás el resultado y decidís qué importar."
      />

      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-blue-500/10 p-5">
        <h2 className="text-sm font-extrabold text-[var(--text)]">Sin API, servidor ni suscripción obligatoria</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
          La app funciona completa de forma manual. La IA solamente acelera investigaciones mediante un contrato JSON visible y verificable.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">1. Copiar prompt</h2>
            <p className="text-xs text-[var(--text-soft)]">Pegalo en ChatGPT, Claude, Gemini o la IA que prefieras.</p>
          </div>
          <textarea readOnly value={AI_PROMPT} rows={10} className="w-full p-3 text-xs leading-relaxed rounded-xl bg-[var(--bg)] border border-[var(--border)] font-mono" />
          <button onClick={() => copyText('prompt', AI_PROMPT)} className="px-3.5 py-2 text-xs font-bold rounded-xl bg-[var(--text)] text-[var(--bg-elevated)] cursor-pointer">
            {copied === 'prompt' ? '✓ Copiado' : '📋 Copiar prompt'}
          </button>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">2. Contrato de datos</h2>
            <p className="text-xs text-[var(--text-soft)]">Este formato mantiene LifeOS independiente del proveedor.</p>
          </div>
          <textarea readOnly value={AI_SCHEMA} rows={10} className="w-full p-3 text-xs leading-relaxed rounded-xl bg-[var(--bg)] border border-[var(--border)] font-mono" />
          <button onClick={() => copyText('schema', AI_SCHEMA)} className="px-3.5 py-2 text-xs font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] cursor-pointer">
            {copied === 'schema' ? '✓ Copiado' : '📋 Copiar formato'}
          </button>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">3. Revisar e importar</h2>
          <p className="text-xs text-[var(--text-soft)]">Nada se guarda hasta que LifeOS valide el JSON y vos confirmes.</p>
        </div>
        <textarea value={rawImport} onChange={(event) => { setRawImport(event.target.value); setPreview(null); setMessage(''); }} rows={7} placeholder='Pegá aquí la respuesta JSON…' className="w-full p-3 text-xs leading-relaxed rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] font-mono" />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handlePreview} className="px-4 py-2 bg-[var(--blue)] text-white text-xs font-bold rounded-xl cursor-pointer">Validar y previsualizar</button>
          {message && <span className="text-xs font-medium text-[var(--text-soft)]">{message}</span>}
        </div>

        {preview && (
          <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 text-xs text-[var(--text)]">
              <strong>Listo para importar:</strong> {preview.payload.empleo.length} empleo(s), {preview.payload.reventa.length} reventa(s) y {preview.payload.ideas.length} idea(s).
            </div>
            <button onClick={handleConfirmImport} className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer">Confirmar importación</button>
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text)]">💼 Oportunidades laborales</h2>
          <p className="text-xs text-[var(--text-soft)]">Aplicar crea la postulación conservando empresa, puesto, link y nota.</p>
        </div>
        <form onSubmit={handleAddJob} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <input value={jobCompany} onChange={(event) => setJobCompany(event.target.value)} placeholder="Empresa" className="flex-1 min-w-32 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input value={jobRole} onChange={(event) => setJobRole(event.target.value)} placeholder="Puesto" className="flex-1 min-w-32 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input value={jobLink} onChange={(event) => setJobLink(event.target.value)} placeholder="Link opcional" className="flex-1 min-w-40 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <button type="submit" className="px-3.5 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer">＋ Manual</button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobOpportunities.length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay oportunidades pendientes.</p> : jobOpportunities.sort((a, b) => (b.rating || 0) - (a.rating || 0)).map((opportunity) => (
            <article key={opportunity.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
              <div className="font-bold text-sm text-[var(--text)]">{opportunity.empresa}</div>
              <div className="text-xs text-[var(--text-soft)]">{opportunity.puesto || 'Puesto sin especificar'}</div>
              <div className="text-amber-500 text-xs tracking-wider">{stars(opportunity.rating)}</div>
              {opportunity.nota && <p className="text-xs text-[var(--text-soft)]">{opportunity.nota}</p>}
              {opportunity.link && <a href={opportunity.link} target="_blank" rel="noreferrer" className="block text-xs font-bold text-[var(--blue)] hover:underline">Ver oferta ↗</a>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleApplyJob(opportunity.id)} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-lg cursor-pointer">Aplicar</button>
                <button onClick={() => handleDiscardJob(opportunity.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 text-xs font-bold rounded-lg cursor-pointer">Descartar</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text)]">🔁 Oportunidades de reventa</h2>
          <p className="text-xs text-[var(--text-soft)]">Comprar mueve la oportunidad al inventario sin volver a escribirla.</p>
        </div>
        <form onSubmit={handleAddResale} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <input value={resaleItem} onChange={(event) => setResaleItem(event.target.value)} placeholder="Producto" className="flex-1 min-w-36 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input type="number" value={resaleBuy} onChange={(event) => setResaleBuy(event.target.value)} placeholder="Compra" className="w-28 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <input type="number" value={resaleMarket} onChange={(event) => setResaleMarket(event.target.value)} placeholder="Mercado" className="w-28 px-3 py-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <button type="submit" className="px-3.5 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer">＋ Manual</button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {resaleOpportunities.length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay oportunidades pendientes.</p> : resaleOpportunities.sort((a, b) => computeResalePriority(b) - computeResalePriority(a)).map((opportunity) => {
            const profit = opportunity.marketPrice - opportunity.buyPrice;
            return (
              <article key={opportunity.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
                <div className="font-bold text-sm text-[var(--text)]">{opportunity.item}</div>
                <div className="text-amber-500 text-xs tracking-wider">{stars(computeResalePriority(opportunity))}</div>
                <p className="text-xs text-[var(--text-soft)]">Compra {fmtMoney(opportunity.buyPrice)} · Mercado {fmtMoney(opportunity.marketPrice)}</p>
                <p className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Margen estimado: {fmtMoney(profit)} ({computeResaleMarginPct(opportunity).toFixed(0)}%)</p>
                {opportunity.nota && <p className="text-xs text-[var(--text-soft)]">{opportunity.nota}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleBuyResale(opportunity.id)} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-lg cursor-pointer">Comprar</button>
                  <button onClick={() => handleDiscardResale(opportunity.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 text-xs font-bold rounded-lg cursor-pointer">Descartar</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-[var(--text)]">💡 Ideas</h2>
        <form onSubmit={handleAddIdea} className="flex gap-2">
          <input value={ideaText} onChange={(event) => setIdeaText(event.target.value)} placeholder="Guardar una idea manual…" className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]" />
          <button type="submit" className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl cursor-pointer">＋</button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.ideas.length === 0 ? <p className="text-xs text-[var(--text-faint)]">No hay ideas guardadas.</p> : state.ideas.map((idea) => (
            <article key={idea.id} className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 pr-9">
              <button onClick={() => handleDeleteIdea(idea.id)} className="absolute right-3 top-3 text-xs text-[var(--text-faint)] hover:text-red-500 cursor-pointer">✕</button>
              <p className="text-xs font-medium text-[var(--text)]">{idea.text}</p>
              <span className="block mt-2 text-[10px] text-[var(--text-faint)]">{idea.source === 'ia' ? '🤖 IA' : '✏️ Manual'} · {idea.date}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
