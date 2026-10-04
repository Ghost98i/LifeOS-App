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

export function normalizeTextForComparison(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function parseStrictPositiveNumber(value: unknown, fieldName: string): number {
  if (value === undefined || value === null) {
    throw new Error(`El campo numérico "${fieldName}" es obligatorio.`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      throw new Error(`El campo "${fieldName}" contiene un número inválido.`);
    }
    if (value < 0) {
      throw new Error(`El campo "${fieldName}" no puede ser negativo.`);
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`El campo "${fieldName}" está vacío.`);
    }
    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      throw new Error(`El campo "${fieldName}" contiene un valor no numérico: "${trimmed}".`);
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      throw new Error(`El campo "${fieldName}" contiene un número inválido.`);
    }
    if (parsed < 0) {
      throw new Error(`El campo "${fieldName}" no puede ser negativo.`);
    }
    return parsed;
  }
  throw new Error(`El campo "${fieldName}" debe ser un valor numérico.`);
}

export function parseStrictRating(value: unknown, fieldName = 'rating'): number {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return 3;
  }
  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
      throw new Error(`El campo "${fieldName}" contiene un valor no numérico: "${trimmed}".`);
    }
    num = Number(trimmed);
  } else {
    throw new Error(`El campo "${fieldName}" debe ser un valor numérico.`);
  }
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`El campo "${fieldName}" contiene un número inválido.`);
  }
  return Math.min(5, Math.max(1, Math.round(num)));
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
      rating: parseStrictRating(item.rating, 'rating'),
      link: text(item.link),
      nota: text(item.nota),
    }))
    .filter((item) => item.empresa);

  const reventa = (Array.isArray(parsed.reventa) ? parsed.reventa : [])
    .filter(isRecord)
    .map((item) => ({
      item: text(item.item),
      buyPrice: parseStrictPositiveNumber(item.buyPrice, 'buyPrice'),
      marketPrice: parseStrictPositiveNumber(item.marketPrice, 'marketPrice'),
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
  let addedCount = 0;

  if (!state.jobs) state.jobs = { applications: [], opportunities: [] };
  if (!state.jobs.opportunities) state.jobs.opportunities = [];
  if (!state.resale) state.resale = { inventory: [], opportunities: [] };
  if (!state.resale.opportunities) state.resale.opportunities = [];
  if (!state.ideas) state.ideas = [];

  payload.empleo.forEach((opportunity) => {
    const normEmpresa = normalizeTextForComparison(opportunity.empresa);
    const normPuesto = normalizeTextForComparison(opportunity.puesto);
    const isDuplicate = state.jobs.opportunities.some(
      (existing) =>
        normalizeTextForComparison(existing.empresa) === normEmpresa &&
        normalizeTextForComparison(existing.puesto || '') === normPuesto
    );

    if (!isDuplicate) {
      state.jobs.opportunities.push({
        id: uid(),
        ...opportunity,
        fecha: date,
        status: 'nueva',
      });
      addedCount++;
    }
  });

  payload.reventa.forEach((opportunity) => {
    const normItem = normalizeTextForComparison(opportunity.item);
    const isDuplicate = state.resale.opportunities.some(
      (existing) =>
        normalizeTextForComparison(existing.item) === normItem &&
        existing.buyPrice === opportunity.buyPrice
    );

    if (!isDuplicate) {
      state.resale.opportunities.push({
        id: uid(),
        ...opportunity,
        fecha: date,
        status: 'nueva',
      });
      addedCount++;
    }
  });

  payload.ideas.forEach((idea) => {
    const normIdea = normalizeTextForComparison(idea);
    const isDuplicate = state.ideas.some(
      (existing) => normalizeTextForComparison(existing.text) === normIdea
    );

    if (!isDuplicate) {
      state.ideas.push({ id: uid(), text: idea.trim(), date, source: 'ia' });
      addedCount++;
    }
  });

  return addedCount;
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
