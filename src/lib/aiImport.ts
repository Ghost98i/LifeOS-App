import { LifeOSState } from '../types';
import { recordResalePurchase } from './resaleFlows';
import { todayISO, uid } from './storage';

export interface ImportedJobOpportunity {
  empresa: string;
  puesto: string;
  rating: number;
  link: string;
  nota: string;
}

export interface ImportedResaleOpportunity {
  item: string;
  buyPrice: number;
  marketPrice: number;
  nota: string;
}

export interface AIImportPayload {
  empleo: ImportedJobOpportunity[];
  reventa: ImportedResaleOpportunity[];
  ideas: string[];
}

export interface AIImportPreview {
  payload: AIImportPayload;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripCodeFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function daysAfter(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseAIImport(raw: string): AIImportPreview {
  if (!raw.trim()) throw new Error('Pegá primero la respuesta de la IA.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new Error('La respuesta no contiene un JSON válido.');
  }

  if (!isRecord(parsed)) throw new Error('El JSON debe contener un objeto.');

  for (const key of ['empleo', 'reventa', 'ideas']) {
    if (key in parsed && !Array.isArray(parsed[key])) {
      throw new Error(`La clave “${key}” debe contener una lista.`);
    }
  }

  const empleo = (Array.isArray(parsed.empleo) ? parsed.empleo : [])
    .filter(isRecord)
    .map((item) => ({
      empresa: text(item.empresa),
      puesto: text(item.puesto),
      rating: Math.min(5, Math.max(1, Math.round(finiteNumber(item.rating) || 3))),
      link: text(item.link),
      nota: text(item.nota),
    }))
    .filter((item) => item.empresa);

  const reventa = (Array.isArray(parsed.reventa) ? parsed.reventa : [])
    .filter(isRecord)
    .map((item) => ({
      item: text(item.item),
      buyPrice: Math.max(0, finiteNumber(item.buyPrice)),
      marketPrice: Math.max(0, finiteNumber(item.marketPrice)),
      nota: text(item.nota),
    }))
    .filter((item) => item.item);

  const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : []).map(text).filter(Boolean);
  const payload = { empleo, reventa, ideas };
  const total = empleo.length + reventa.length + ideas.length;

  if (total === 0) throw new Error('El JSON no contiene elementos importables.');
  return { payload, total };
}

export function applyAIImport(state: LifeOSState, payload: AIImportPayload, date = todayISO()): number {
  payload.empleo.forEach((opportunity) => {
    state.jobs.opportunities.push({
      id: uid(),
      ...opportunity,
      fecha: date,
      status: 'nueva',
    });
  });

  payload.reventa.forEach((opportunity) => {
    state.resale.opportunities.push({
      id: uid(),
      ...opportunity,
      fecha: date,
      status: 'nueva',
    });
  });

  payload.ideas.forEach((idea) => {
    state.ideas.push({ id: uid(), text: idea, date, source: 'ia' });
  });

  return payload.empleo.length + payload.reventa.length + payload.ideas.length;
}

export function applyJobOpportunity(state: LifeOSState, opportunityId: string, date = todayISO()): boolean {
  const opportunity = state.jobs.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity || opportunity.status !== 'nueva') return false;

  state.jobs.applications.push({
    id: uid(),
    empresa: opportunity.empresa,
    puesto: opportunity.puesto || '',
    estado: 'cv_enviado',
    fecha: date,
    reclutador: '',
    notas: opportunity.nota || '',
    link: opportunity.link || '',
    nextAction: 'Revisar respuesta o hacer seguimiento',
    nextActionDate: daysAfter(date, 7),
    sourceOpportunityId: opportunity.id,
  });
  opportunity.status = 'aplicada';
  return true;
}

export function buyResaleOpportunity(state: LifeOSState, opportunityId: string, date = todayISO(), accountId?: string | null): boolean {
  const opportunity = state.resale.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity || opportunity.status !== 'nueva') return false;

  recordResalePurchase(state, {
    item: opportunity.item,
    buyPrice: opportunity.buyPrice,
    buyDate: date,
    accountId,
    note: opportunity.nota || '',
    sourceOpportunityId: opportunity.id,
  });
  opportunity.status = 'comprada';
  return true;
}
