import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  Check,
  Copy,
  ExternalLink,
  FileJson,
  Lightbulb,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { LifeOSState } from '../types';
import { computeResaleMarginPct, computeResalePriority } from '../lib/calculations';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { fmtMoney, todayISO, uid } from '../lib/storage';
import {
  AIImportPreview,
  applyAIImport,
  applyJobOpportunity,
  buyResaleOpportunity,
  parseAIImport,
} from '../lib/aiImport';
import { PageHeader } from './PageHeader';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';

function safeExternalLink(value: string): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

interface IAViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onOpenBusiness?: () => void;
}

export const AI_JSON_CONTRACT = `Respondé ÚNICAMENTE con JSON válido, sin explicaciones ni bloques Markdown:
{"empleo":[{"empresa":"","puesto":"","rating":1,"link":"","nota":""}],"reventa":[{"item":"","buyPrice":0,"marketPrice":0,"nota":""}],"ideas":[""]}`;

export function buildDefaultAIInstructions(state: LifeOSState): string {
  const jobsVisible = isModuleEnabled(state, 'trabajo');
  const resaleVisible = isModuleEnabled(state, 'reventa');
  const items: string[] = [];

  if (jobsVisible) {
    items.push('Oportunidades laborales o proyectos acordes a mi perfil, con requisitos claros y fuente verificable.');
  }
  if (resaleVisible) {
    items.push('Productos o insumos con buen margen para mi negocio o reventa, indicando precio de compra y referencia de mercado.');
  }
  items.push('Becas, cursos, descuentos o ideas realistas para generar ingresos o mejorar mi productividad.');

  const numbered = items.map((line, index) => `${index + 1}. ${line}`).join('\n');
  return `Actuá como mi asistente de oportunidades. Buscá:\n${numbered}`;
}

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
  const defaultInstructions = buildDefaultAIInstructions(state);
  const savedCustomInstructions = typeof state.settings?.aiCustomInstructions === 'string'
    ? state.settings.aiCustomInstructions
    : '';
  const hasCustomInstructions = savedCustomInstructions.trim().length > 0;

  const [instructionsDraft, setInstructionsDraft] = useState(
    hasCustomInstructions ? savedCustomInstructions : defaultInstructions
  );
  const [rawImport, setRawImport] = useState('');
  const [preview, setPreview] = useState<AIImportPreview | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'prompt' | 'schema' | null>(null);

  useEffect(() => {
    setInstructionsDraft(hasCustomInstructions ? savedCustomInstructions : defaultInstructions);
  }, [hasCustomInstructions, savedCustomInstructions, defaultInstructions]);

  const effectiveInstructions = instructionsDraft.trim() || defaultInstructions;
  const fullPromptToCopy = `${effectiveInstructions}\n\n${AI_JSON_CONTRACT}`;

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

  const handleSaveInstructions = (value: string) => {
    const trimmed = value.trim();
    const nextStored = trimmed && trimmed !== defaultInstructions.trim() ? value : null;
    if ((state.settings?.aiCustomInstructions ?? null) === nextStored) return;
    saveAIChange((draft) => {
      if (!draft.settings) draft.settings = { darkMode: false, hiddenTabs: [] } as any;
      draft.settings.aiCustomInstructions = nextStored;
    });
  };

  const handleResetInstructions = () => {
    setInstructionsDraft(defaultInstructions);
    saveAIChange((draft) => {
      if (!draft.settings) draft.settings = { darkMode: false, hiddenTabs: [] } as any;
      draft.settings.aiCustomInstructions = null;
    });
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

  const fieldClass =
    'w-full min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500';
  const primaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const secondaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer';

  return (
    <div className="ai-refinement space-y-5 sm:space-y-6">
      <PageHeader title="IA · Oportunidades e ideas" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SurfaceCard className="p-4 sm:p-5 space-y-3.5" aria-label="Preparar búsqueda externa">
          <SectionHeader
            icon={<Sparkles size={16} strokeWidth={1.75} />}
            title="1. Prepará la búsqueda"
          />
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Personalizá qué querés buscar y copiá las instrucciones en la IA que uses; Celestian no le envía tus datos.
          </p>
          <label className="block space-y-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Criterios de búsqueda (editables)</span>
            <textarea
              aria-label="Instrucciones para la IA externa"
              value={instructionsDraft}
              onChange={(event) => setInstructionsDraft(event.target.value)}
              onBlur={(event) => handleSaveInstructions(event.target.value)}
              rows={5}
              className="block w-full rounded-xl border border-slate-200/80 bg-white p-3 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => copyText('prompt', fullPromptToCopy)} className={primaryBtnClass}>
              {copied === 'prompt' ? <Check size={15} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
              <span>{copied === 'prompt' ? 'Copiado' : 'Copiar instrucciones'}</span>
            </button>
            {(hasCustomInstructions || instructionsDraft.trim() !== defaultInstructions.trim()) && (
              <button type="button" onClick={handleResetInstructions} className={secondaryBtnClass}>
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Restablecer por defecto</span>
              </button>
            )}
          </div>
          <details className="border-t border-slate-100 pt-2.5 text-sm text-slate-600 dark:border-white/[0.06] dark:text-slate-400">
            <summary className="flex min-h-10 cursor-pointer items-center font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
              Ver contrato JSON fijo (se adjunta automáticamente)
            </summary>
            <div className="space-y-3 pt-2">
              <label className="block space-y-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Contrato JSON (no editable)</span>
                <textarea aria-label="Contrato JSON fijo" readOnly value={AI_JSON_CONTRACT} rows={3} className="block w-full rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 font-mono text-xs text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200" />
              </label>
              <label className="block space-y-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Formato JSON de ejemplo</span>
                <textarea aria-label="Formato JSON" readOnly value={AI_SCHEMA} rows={6} className="block w-full rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 font-mono text-xs text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200" />
              </label>
              <button type="button" onClick={() => copyText('schema', AI_SCHEMA)} className={secondaryBtnClass}>
                {copied === 'schema' ? <Check size={15} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
                <span>{copied === 'schema' ? 'Copiado' : 'Copiar formato'}</span>
              </button>
            </div>
          </details>
        </SurfaceCard>

        <SurfaceCard className="p-4 sm:p-5 space-y-3.5" aria-label="Revisar respuesta externa">
          <SectionHeader
            icon={<FileJson size={16} strokeWidth={1.75} />}
            title="2. Traé la respuesta"
          />
          <label className="block space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Respuesta de la IA (JSON)</span>
            <textarea
              aria-label="Respuesta de la IA (JSON)"
              value={rawImport}
              onChange={(event) => { setRawImport(event.target.value); setPreview(null); setMessage(''); }}
              rows={5}
              placeholder="Pegá la respuesta para revisarla…"
              className="block w-full rounded-xl border border-slate-200/80 bg-white p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handlePreview} className={primaryBtnClass}>
              Revisar resultados
            </button>
          </div>
          {message && <p role="status" className="text-sm font-medium text-slate-800 dark:text-slate-200">{message}</p>}
          {preview && (
            <div className="border-t border-slate-100 pt-4 space-y-3 dark:border-white/[0.06]" aria-label="Vista previa de la importación">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">3. Revisá antes de guardar</h3>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  Guardarlos no crea postulaciones ni registra compras. Verificá las fuentes y los precios antes de actuar.
                </p>
              </div>
              {invalidImportLink && (
                <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
                  Hay un enlace no utilizable. Corregilo o quitá su dirección antes de guardar; solo se admiten enlaces http o https.
                </p>
              )}
              <div className="max-h-[60dvh] overflow-y-auto space-y-3 text-sm text-slate-900 dark:text-slate-100">
                {preview.payload.empleo.length > 0 && (
                  <section>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Empleos ({preview.payload.empleo.length})</h4>
                    <ListDivider className="mt-1">
                      {preview.payload.empleo.map((item, index) => (
                        <div key={index} className="py-2 break-words">
                          <strong>{item.empresa}</strong> · {item.puesto}
                          {item.nota && <p className="text-slate-600 dark:text-slate-400">{item.nota}</p>}
                          {item.link && (
                            <p className="break-all text-slate-500 dark:text-slate-400">
                              {item.link}
                              {!safeExternalLink(item.link) && ' · Enlace no utilizable'}
                            </p>
                          )}
                        </div>
                      ))}
                    </ListDivider>
                  </section>
                )}
                {preview.payload.reventa.length > 0 && (
                  <section>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Posibles compras ({preview.payload.reventa.length})</h4>
                    <ListDivider className="mt-1">
                      {preview.payload.reventa.map((item, index) => (
                        <div key={index} className="py-2 break-words">
                          <strong>{item.item}</strong> · Compra {fmtMoney(item.buyPrice)} · Mercado {fmtMoney(item.marketPrice)}
                          {item.nota && <p className="text-slate-600 dark:text-slate-400">{item.nota}</p>}
                        </div>
                      ))}
                    </ListDivider>
                  </section>
                )}
                {preview.payload.ideas.length > 0 && (
                  <section>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Ideas ({preview.payload.ideas.length})</h4>
                    <ListDivider className="mt-1">
                      {preview.payload.ideas.map((item, index) => (
                        <div key={index} className="py-2 break-words">{item}</div>
                      ))}
                    </ListDivider>
                  </section>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(invalidImportLink)} onClick={handleConfirmImport} className={primaryBtnClass}>
                  Confirmar importación
                </button>
                <button type="button" onClick={() => { setPreview(null); setMessage(''); }} className={secondaryBtnClass}>
                  Cancelar revisión
                </button>
              </div>
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Bandeja 1: Empleos para revisar */}
      <SurfaceCard className="p-4 sm:p-5 space-y-3.5">
        <div>
          <SectionHeader
            icon={<Briefcase size={16} strokeWidth={1.75} />}
            title="Empleos para revisar"
            count={jobOpportunities.length > 0 ? jobOpportunities.length : null}
          />
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Creá una postulación cuando decidas seguir una oportunidad.
          </p>
        </div>

        <details className="border-t border-slate-100 pt-2 dark:border-white/[0.06]">
          <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-medium text-[#4F46E5] dark:text-indigo-400">
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Agregar empleo manualmente</span>
          </summary>
          <form onSubmit={handleAddJob} className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
            <input aria-label="Empresa" value={jobCompany} onChange={(event) => setJobCompany(event.target.value)} placeholder="Empresa" className={fieldClass} />
            <input aria-label="Puesto" value={jobRole} onChange={(event) => setJobRole(event.target.value)} placeholder="Puesto" className={fieldClass} />
            <input aria-label="Enlace del empleo" value={jobLink} onChange={(event) => setJobLink(event.target.value)} placeholder="Link opcional" className={fieldClass} />
            <button type="submit" className={primaryBtnClass}>Agregar</button>
          </form>
        </details>

        {jobOpportunities.length === 0 ? (
          <div className="border-t border-slate-100 py-5 text-center dark:border-white/[0.06]">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No hay oportunidades pendientes.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Importá una respuesta JSON arriba o agregá una búsqueda manualmente para evaluarla antes de postularte.
            </p>
          </div>
        ) : (
          <ListDivider className="border-t border-slate-100 dark:border-white/[0.06]">
            {jobOpportunities
              .slice()
              .sort((a, b) => (b.rating || 0) - (a.rating || 0))
              .map((opportunity) => {
                const safeLink = safeExternalLink(opportunity.link);
                return (
                  <article key={opportunity.id} className="py-3.5 first:pt-3 last:pb-0 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{opportunity.empresa}</h3>
                        <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                          Valoración: {opportunity.rating}/5
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{opportunity.puesto || 'Puesto sin especificar'}</p>
                      {opportunity.nota && <p className="text-sm text-slate-500 dark:text-slate-400">{opportunity.nota}</p>}
                      {safeLink && (
                        <a
                          href={safeLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#4F46E5] hover:underline dark:text-indigo-400"
                        >
                          <span>Ver oferta</span>
                          <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApplyJob(opportunity.id)}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer"
                      >
                        Crear postulación
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscardJob(opportunity.id)}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200/80 px-3.5 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 dark:border-white/[0.08] dark:text-rose-400 cursor-pointer"
                      >
                        Descartar
                      </button>
                    </div>
                  </article>
                );
              })}
          </ListDivider>
        )}
      </SurfaceCard>

      {/* Bandeja 2: Posibles compras para reventa */}
      <SurfaceCard className="p-4 sm:p-5 space-y-3.5">
        <div>
          <SectionHeader
            icon={<ShoppingBag size={16} strokeWidth={1.75} />}
            title="Posibles compras para reventa"
            count={resaleOpportunities.length > 0 ? resaleOpportunities.length : null}
          />
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registrá la compra en Mi negocio eligiendo su cuenta, categoría y forma de pago. La oportunidad se conserva para consultar sus datos.
          </p>
        </div>

        <details className="border-t border-slate-100 pt-2 dark:border-white/[0.06]">
          <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-medium text-[#4F46E5] dark:text-indigo-400">
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Agregar posible compra manualmente</span>
          </summary>
          <form onSubmit={handleAddResale} className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_auto]">
            <input aria-label="Producto" value={resaleItem} onChange={(event) => setResaleItem(event.target.value)} placeholder="Producto" className={fieldClass} />
            <input type="number" aria-label="Costo de compra estimado" value={resaleBuy} onChange={(event) => setResaleBuy(event.target.value)} placeholder="Compra" className={fieldClass} />
            <input type="number" aria-label="Precio de mercado estimado" value={resaleMarket} onChange={(event) => setResaleMarket(event.target.value)} placeholder="Mercado" className={fieldClass} />
            <button type="submit" className={primaryBtnClass}>Agregar</button>
          </form>
        </details>

        {resaleOpportunities.length === 0 ? (
          <div className="border-t border-slate-100 py-5 text-center dark:border-white/[0.06]">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No hay oportunidades pendientes.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Traé hallazgos desde tu IA o cargá un producto manualmente para comparar margen antes de comprar.
            </p>
          </div>
        ) : (
          <ListDivider className="border-t border-slate-100 dark:border-white/[0.06]">
            {resaleOpportunities
              .slice()
              .sort((a, b) => computeResalePriority(b) - computeResalePriority(a))
              .map((opportunity) => {
                const profit = opportunity.marketPrice - opportunity.buyPrice;
                return (
                  <article key={opportunity.id} className="py-3.5 first:pt-3 last:pb-0 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{opportunity.item}</h3>
                        <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                          Prioridad: {computeResalePriority(opportunity)}/5
                        </span>
                      </div>
                      <p className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                        Compra {fmtMoney(opportunity.buyPrice)} · Mercado {fmtMoney(opportunity.marketPrice)}
                      </p>
                      <p className={`text-sm font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        Margen estimado: {fmtMoney(profit)} ({computeResaleMarginPct(opportunity).toFixed(0)}%)
                      </p>
                      {opportunity.nota && <p className="text-sm text-slate-500 dark:text-slate-400">{opportunity.nota}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleBuyResale(opportunity.id)}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4F46E5] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer"
                      >
                        {onOpenBusiness ? 'Registrar en Mi negocio' : 'Comprar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscardResale(opportunity.id)}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200/80 px-3.5 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 dark:border-white/[0.08] dark:text-rose-400 cursor-pointer"
                      >
                        Descartar
                      </button>
                    </div>
                  </article>
                );
              })}
          </ListDivider>
        )}
      </SurfaceCard>

      {/* Bandeja 3: Ideas guardadas */}
      <SurfaceCard className="p-4 sm:p-5 space-y-3.5">
        <SectionHeader
          icon={<Lightbulb size={16} strokeWidth={1.75} />}
          title="Ideas guardadas"
          count={(state.ideas || []).length > 0 ? (state.ideas || []).length : null}
        />

        <details className="border-t border-slate-100 pt-2 dark:border-white/[0.06]">
          <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-medium text-[#4F46E5] dark:text-indigo-400">
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Agregar idea manualmente</span>
          </summary>
          <form onSubmit={handleAddIdea} className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
            <input aria-label="Idea" value={ideaText} onChange={(event) => setIdeaText(event.target.value)} placeholder="Guardar una idea manual…" className={`${fieldClass} flex-1`} />
            <button type="submit" className={`${primaryBtnClass} shrink-0`}>Guardar idea</button>
          </form>
        </details>

        {(state.ideas || []).length === 0 ? (
          <div className="border-t border-slate-100 py-5 text-center dark:border-white/[0.06]">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No hay ideas guardadas.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Guardá becas, descuentos o propuestas de ingreso para revisarlas más adelante.
            </p>
          </div>
        ) : (
          <ListDivider className="border-t border-slate-100 dark:border-white/[0.06]">
            {(state.ideas || []).map((idea) => (
              <article key={idea.id} className="py-3 first:pt-2.5 last:pb-0 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900 dark:text-slate-100 break-words">{idea.text}</p>
                  <span className="mt-1 block text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    {idea.source === 'ia' ? 'IA externa' : 'Manual'} · {idea.date}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Eliminar idea"
                  onClick={() => handleDeleteIdea(idea.id)}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 cursor-pointer"
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </article>
            ))}
          </ListDivider>
        )}
      </SurfaceCard>
    </div>
  );
};
