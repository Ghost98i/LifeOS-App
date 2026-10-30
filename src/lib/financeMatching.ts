import type { ExpectedIncome, FinancialCommitment, LifeOSState, Transaction } from '../types';
import { isCommercialFinanceTransaction } from './financeFlows';
import { identifyMerchant } from './merchantIdentity';

export type MatchConfidence = 'strong' | 'possible' | 'ambiguous' | 'none';
export type MatchTargetType = 'commitment' | 'expected_income';

export interface MatchCandidate {
  targetId: string;
  targetType: MatchTargetType;
  name: string;
  amount: number;
  currency: string;
  dueDate: string;
  cycleKey: string;
  cycleLabel: string;
  score: number;
  confidence: 'strong' | 'possible';
  reasons: string[];
  rawTarget: FinancialCommitment | ExpectedIncome;
}

export interface TransactionMatchResult {
  transactionId: string;
  confidence: MatchConfidence;
  bestCandidate?: MatchCandidate;
  candidates: MatchCandidate[];
  explanation?: string;
}

export function daysDiff(isoA: string, isoB: string): number {
  const msA = new Date(`${isoA}T00:00:00`).getTime();
  const msB = new Date(`${isoB}T00:00:00`).getTime();
  return Math.round((msA - msB) / (1000 * 60 * 60 * 24));
}

export function normalizeText(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether text and target name refer to the same merchant or business identity.
 * Reuses identifyMerchant and robust fuzzy/substring matching on normalized text.
 */
export function areMerchantsCompatible(textA?: string | null, textB?: string | null): boolean {
  if (!textA || !textB) return false;

  const merchA = identifyMerchant(textA);
  const merchB = identifyMerchant(textB);
  if (merchA && merchB && merchA.name.toLowerCase() === merchB.name.toLowerCase()) {
    return true;
  }
  if (merchA && textB.toLowerCase().includes(merchA.name.toLowerCase())) {
    return true;
  }
  if (merchB && textA.toLowerCase().includes(merchB.name.toLowerCase())) {
    return true;
  }

  const cleanA = normalizeText(textA);
  const cleanB = normalizeText(textB);
  if (!cleanA || !cleanB) return false;

  if (cleanA === cleanB) return true;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;

  // Check significant word token overlap (tokens of length >= 4)
  const STOP_WORDS = new Set(['pago', 'cuota', 'para', 'este', 'esta', 'cobro', 'mensual', 'anual', 'servicio']);
  const wordsA = cleanA.split(' ').filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const wordsB = new Set(cleanB.split(' ').filter((w) => w.length >= 4 && !STOP_WORDS.has(w)));
  for (const w of wordsA) {
    if (wordsB.has(w)) return true;
  }

  return false;
}

/**
 * Extracts installment reference from notes like "cuota 3", "3/12", "cuota 3 de 12", "c3".
 */
export function extractInstallmentNumber(note?: string | null): number | null {
  if (!note) return null;
  const clean = note.toLowerCase();

  // Pattern: cuota 3 de 12 or cuota 3/12
  const matchCuotaOf = /cuota\s*([0-9]+)\s*(?:de|\/)\s*[0-9]+/i.exec(clean);
  if (matchCuotaOf) return Number.parseInt(matchCuotaOf[1], 10);

  // Pattern: 3/12 or 3 de 12
  const matchSlash = /\b([0-9]{1,2})\s*(?:\/|\s+de\s+)\s*([0-9]{1,2})\b/i.exec(clean);
  if (matchSlash) return Number.parseInt(matchSlash[1], 10);

  // Pattern: cuota 3
  const matchCuota = /\bcuota\s*([0-9]{1,2})\b/i.exec(clean);
  if (matchCuota) return Number.parseInt(matchCuota[1], 10);

  return null;
}

/**
 * Derives cycle logical key and human readable label for a commitment or expected income.
 */
export function deriveCycleIdentity(
  target: FinancialCommitment | ExpectedIncome,
  targetType: MatchTargetType,
): { cycleKey: string; cycleLabel: string } {
  if (targetType === 'commitment') {
    const com = target as FinancialCommitment;
    const total = com.totalInstallments || com.totalOccurrences || null;
    const curInst = com.currentInstallment || 1;

    if (total && total > 1) {
      return {
        cycleKey: `inst-${curInst}`,
        cycleLabel: `Cuota ${curInst}/${total}`,
      };
    }
    if (com.frequency === 'once') {
      return {
        cycleKey: 'once',
        cycleLabel: `Pago único (${com.nextDueDate})`,
      };
    }
    return {
      cycleKey: `cycle-${com.nextDueDate}`,
      cycleLabel: `Ciclo ${com.nextDueDate}`,
    };
  }

  const inc = target as ExpectedIncome;
  if (inc.frequency === 'once') {
    return {
      cycleKey: 'once',
      cycleLabel: `Previsión única (${inc.startDate})`,
    };
  }
  return {
    cycleKey: `cycle-${inc.startDate}`,
    cycleLabel: `Ciclo ${inc.startDate}`,
  };
}

/**
 * Evaluates candidate compatibility and deterministic score.
 */
export function scoreCandidate(
  tx: Transaction,
  target: FinancialCommitment | ExpectedIncome,
  targetType: MatchTargetType,
): {
  score: number;
  confidence: 'strong' | 'possible';
  reasons: string[];
  cycleKey: string;
  cycleLabel: string;
} | null {
  // 1. Mandatory hard gates
  if (tx.commitmentId || tx.expectedIncomeId) return null;

  // Derive stable cycle identity
  const { cycleKey, cycleLabel } = deriveCycleIdentity(target, targetType);

  // Rejection check scoped to logical cycle (or legacy targetId)
  const isRejected = tx.rejectedMatchIds?.some(
    (id) => id === target.id || id === `${target.id}:${cycleKey}`
  );
  if (isRejected) return null;

  if (targetType === 'commitment') {
    if (tx.type !== 'gasto') return null;
    const com = target as FinancialCommitment;
    if (com.active === false || com.status === 'paid' || com.status === 'cancelled') return null;
    if (com.settledTxIds?.includes(tx.id)) return null;
  } else {
    if (tx.type !== 'ingreso') return null;
    const inc = target as ExpectedIncome;
    if (inc.active === false) return null;
    if (inc.settledTxIds?.includes(tx.id)) return null;
  }

  // 2. Currency Compatibility
  const txCur = (tx.currency || 'UYU').toUpperCase();
  const targetCur = ((target as any).currency || 'UYU').toUpperCase();
  if (txCur !== targetCur) return null;

  // 3. Amount Compatibility
  const diffAmt = Math.abs(tx.amount - target.amount);
  if (diffAmt > 0.001) return null;

  // 4. Date Proximity Window (tolerance <= 14 days)
  const targetDueDate = targetType === 'commitment'
    ? (target as FinancialCommitment).nextDueDate
    : (target as ExpectedIncome).startDate;

  const diffDays = Math.abs(daysDiff(tx.date, targetDueDate));
  if (diffDays > 14) return null;

  let score = 3; // Base score for exact amount match
  const reasons: string[] = [`Mismo importe ($${target.amount})`];

  // Date proximity points
  if (diffDays <= 3) {
    score += 3;
    reasons.push(diffDays === 0 ? 'Mismo día' : `Vence a ${diffDays} día${diffDays === 1 ? '' : 's'}`);
  } else if (diffDays <= 7) {
    score += 2;
    reasons.push(`Vence a ${diffDays} días`);
  } else {
    score += 1;
    reasons.push(`Ventana de ${diffDays} días`);
  }

  // Currency match signal
  score += 1;

  let hasSemanticMatch = false;

  // 5. Merchant / Description Match
  const merchantCompatible = areMerchantsCompatible(tx.note, target.name);
  if (merchantCompatible) {
    score += 4;
    hasSemanticMatch = true;
    const identified = identifyMerchant(tx.note) || identifyMerchant(target.name);
    reasons.push(identified ? `Comercio identificado (${identified.name})` : `Descripción coincide (${target.name})`);
  }

  // 6. Installment specificity (cuotas)
  if (targetType === 'commitment') {
    const com = target as FinancialCommitment;
    const curInst = com.currentInstallment || 1;
    const noteInst = extractInstallmentNumber(tx.note);

    if (noteInst !== null) {
      if (noteInst === curInst) {
        score += 4;
        hasSemanticMatch = true;
        reasons.push(`Cuota especificada coincide (${curInst}/${com.totalInstallments || '?'})`);
      } else {
        // Explicitly mentions a DIFFERENT installment! Penalty
        score -= 5;
        reasons.push(`Nota indica cuota ${noteInst}, compromiso en cuota ${curInst}`);
      }
    }
  }

  // 7. Category match
  if (tx.category && target.category && tx.category.toLowerCase() === target.category.toLowerCase()) {
    score += 1;
    reasons.push(`Misma categoría (${tx.category})`);
  }

  // 8. Account match
  if (tx.accountId && target.accountId && tx.accountId === target.accountId) {
    score += 1;
  }

  // 9. Historical associations: was this commitment previously settled by transactions with similar note?
  if (targetType === 'commitment') {
    const com = target as FinancialCommitment;
    if (com.settledTxIds && com.settledTxIds.length > 0) {
      score += 1;
    }
  }

  // Classification principle:
  // Strong requires: high score (>= 8), close date (<= 7 days), AND explicit semantic identity
  // (merchant, name match, or explicit installment match). Same amount alone is NEVER strong.
  const isStrong = score >= 8 && diffDays <= 7 && hasSemanticMatch;

  return {
    score,
    confidence: isStrong ? 'strong' : 'possible',
    reasons,
    cycleKey,
    cycleLabel,
  };
}

/**
 * Finds all match candidates for a single transaction against state commitments & expected incomes.
 */
export function findMatchCandidates(
  tx: Transaction,
  state: LifeOSState,
): TransactionMatchResult {
  const result: TransactionMatchResult = {
    transactionId: tx.id,
    confidence: 'none',
    candidates: [],
  };

  // Skip already reviewed, ignored, or linked transactions
  if (tx.reviewStatus === 'reviewed' || tx.reviewed || tx.reviewStatus === 'ignored') {
    return result;
  }
  if (tx.commitmentId || tx.expectedIncomeId) {
    return result;
  }
  if (tx.origin === 'adjustment' || tx.origin === 'resale_purchase' || tx.origin === 'resale_sale') {
    return result;
  }
  if (isCommercialFinanceTransaction(state, tx)) {
    return result;
  }

  const rawCandidates: MatchCandidate[] = [];

  // 1. Evaluate commitments for gasto
  if (tx.type === 'gasto') {
    const commitments = state.finance?.commitments || [];
    for (const com of commitments) {
      const evaluation = scoreCandidate(tx, com, 'commitment');
      if (evaluation) {
        rawCandidates.push({
          targetId: com.id,
          targetType: 'commitment',
          name: com.name,
          amount: com.amount,
          currency: com.currency || 'UYU',
          dueDate: com.nextDueDate,
          cycleKey: evaluation.cycleKey,
          cycleLabel: evaluation.cycleLabel,
          score: evaluation.score,
          confidence: evaluation.confidence,
          reasons: evaluation.reasons,
          rawTarget: com,
        });
      }
    }
  }

  // 2. Evaluate expected incomes for ingreso
  if (tx.type === 'ingreso') {
    const incomes = state.finance?.expectedIncomes || [];
    for (const inc of incomes) {
      const evaluation = scoreCandidate(tx, inc, 'expected_income');
      if (evaluation) {
        rawCandidates.push({
          targetId: inc.id,
          targetType: 'expected_income',
          name: inc.name,
          amount: inc.amount,
          currency: inc.currency || 'UYU',
          dueDate: inc.startDate,
          cycleKey: evaluation.cycleKey,
          cycleLabel: evaluation.cycleLabel,
          score: evaluation.score,
          confidence: evaluation.confidence,
          reasons: evaluation.reasons,
          rawTarget: inc,
        });
      }
    }
  }

  if (rawCandidates.length === 0) {
    return result;
  }

  // Sort descending by score, deterministic tie-break by targetId
  rawCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.targetId.localeCompare(b.targetId);
  });

  result.candidates = rawCandidates;

  if (rawCandidates.length === 1) {
    result.bestCandidate = rawCandidates[0];
    result.confidence = rawCandidates[0].confidence;
    return result;
  }

  // Multiple candidates: check ambiguity
  const top1 = rawCandidates[0];
  const top2 = rawCandidates[1];

  // If top candidates are within a conservative margin (score difference <= 2),
  // they are too close to declare an automatic strong winner safely without user review.
  if (Math.abs(top1.score - top2.score) <= 2) {
    result.confidence = 'ambiguous';
    result.explanation = `Existen ${rawCandidates.length} candidatos compatibles con condiciones similares.`;
    return result;
  }

  // Clear winner
  result.bestCandidate = top1;
  result.confidence = top1.confidence;
  return result;
}

/**
 * Derives matches for all unlinked transactions in the current state.
 */
export function deriveAllFinanceMatches(
  state: LifeOSState,
): Map<string, TransactionMatchResult> {
  const matches = new Map<string, TransactionMatchResult>();
  const txs = state.finance?.transactions || [];

  for (const tx of txs) {
    const res = findMatchCandidates(tx, state);
    if (res.confidence !== 'none') {
      matches.set(tx.id, res);
    }
  }

  return matches;
}
