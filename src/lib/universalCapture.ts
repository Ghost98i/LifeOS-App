import type { LifeOSState, Account, Subject, FinanceCategoryInput } from '../types';
import { parseQuickFinance } from '../utils/quickFinanceParser';
import { addQuickTask, addQuickNote, addQuickTransaction, addQuickInbox } from './quickCapture';
import { addFinancialCommitment } from './financeFlows';
import { todayISO, uid } from './storage';
import { isModuleEnabled } from './moduleVisibility';

export type UniversalCaptureIntent =
  | {
      kind: 'finance';
      type: 'gasto' | 'ingreso';
      destination?: 'transaction' | 'commitment';
      amount: number;
      category: string;
      accountId?: string;
      accountName?: string;
      note?: string;
      date?: string;
      currentInstallment?: number;
      totalInstallments?: number;
    }
  | {
      kind: 'study';
      subjectName?: string;
      subjectId?: string;
      minutes: number;
      note: string;
    }
  | {
      kind: 'idea';
      text: string;
    }
  | {
      kind: 'note';
      text: string;
    }
  | {
      kind: 'task';
      text: string;
      priority: 'alta' | 'media' | 'baja';
      dueDate?: string;
    }
  | {
      kind: 'inbox';
      text: string;
    };

export function parseUniversalIntent(
  rawInput: string,
  context: {
    accounts: Account[];
    categories: FinanceCategoryInput[];
    subjects?: Subject[];
  }
): UniversalCaptureIntent {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { kind: 'inbox', text: '' };
  }

  const lower = trimmed.toLowerCase();

  // 1. Explicit Inbox prefix
  if (lower.startsWith('inbox:')) {
    const text = trimmed.replace(/^inbox:\s*/i, '').trim();
    return { kind: 'inbox', text };
  }

  // 2. Ideas: Priority for idea prefixes / keywords ("idea:", "ideas:", "idea de ...", "ideas para ...", starts with "idea")
  if (/^ideas?:\s*/i.test(trimmed)) {
    const text = trimmed.replace(/^ideas?:\s*/i, '').trim();
    return { kind: 'idea', text };
  }
  if (/^ideas?\b/i.test(trimmed)) {
    return { kind: 'idea', text: trimmed };
  }

  // 3. Notes / Reminders: Priority for prefixes / keywords ("nota:", "recordar:", "pensar:", or starting with them)
  if (/^(?:nota|note|recordar|recordatorio|pensar):\s*/i.test(trimmed)) {
    const text = trimmed.replace(/^(?:nota|note|recordar|recordatorio|pensar):\s*/i, '').trim();
    return { kind: 'note', text };
  }
  if (/^(?:nota|note|recordar|recordatorio|pensar)\b/i.test(trimmed)) {
    return { kind: 'note', text: trimmed };
  }

  // 4. Study pattern ("estudiar TypeScript 1 hora", "estudiar 45 min de bases de datos")
  const studyMatch = trimmed.match(/^estudiar\s+(.+)$/i);
  if (studyMatch) {
    const rest = studyMatch[1].trim();
    // Check for minutes or hours
    const hourMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:horas?|h\b)/i);
    const minMatch = rest.match(/(\d+)\s*(?:minutos?|mins?\b|m\b)/i);

    let minutes = 45; // sensible default study block
    if (hourMatch) {
      minutes = Math.round(parseFloat(hourMatch[1]) * 60);
    } else if (minMatch) {
      minutes = parseInt(minMatch[1], 10);
    }

    // Clean subject name by removing the time part
    const cleanSubject = rest
      .replace(/(\d+(?:\.\d+)?)\s*(?:horas?|h\b|minutos?|mins?\b|m\b)/gi, '')
      .replace(/\b(?:durante|por)\b/gi, '')
      .trim();

    // Check if matching an existing subject
    const matchedSubject = (context.subjects || []).find((s) =>
      cleanSubject.toLowerCase().includes(s.name.toLowerCase()) ||
      s.name.toLowerCase().includes(cleanSubject.toLowerCase())
    );

    return {
      kind: 'study',
      subjectName: matchedSubject?.name || cleanSubject || 'Estudio general',
      subjectId: matchedSubject?.id,
      minutes,
      note: `Sesión de ${minutes} min de ${cleanSubject || 'estudio'}`,
    };
  }

  // 5. Check keywords / patterns that explicitly veto finance:
  // - Contains "idea", "ideas", "nota", "recordar", "pensar"
  // - OR contains a number with a time unit (e.g. 23 horas, 45 minutos, 3 días) or other measurement units
  // Unless there is an explicit currency symbol ($ / $U / USD / EUR / UYU) or transactional verb (gasté / compré / etc.)
  const hasCurrencySign = /(?:\$|\$U\b|USD\b|EUR\b|UYU\b)/i.test(trimmed);
  const hasTransactionalKeyword =
    /(?:^|\s|\b)(?:gaste|gasté|gasto|pague|pagué|pago|pagar|compre|compré|compra|compras|costo|costó|ingreso|cobro|cobre|cobré|sueldo|salario|ganancia|honorarios|cuota|cuotas)(?:\s|$|\b)/i.test(trimmed) ||
    /^(?:\+|-)\s*\d+/i.test(trimmed);

  const containsNoteOrIdeaWord = /(?:^|\s|\b)(?:idea|ideas|nota|notas|recordar|recordatorio|pensar)(?:\s|$|\b)/i.test(trimmed);
  const containsMeasurementUnit =
    /\b\d+(?:\.\d+)?\s*(?:horas?|hs?\b|h\b|minutos?|mins?\b|min\b|segundos?|segs?\b|dias?|días?|semanas?|meses|anos?|años?|km\b|kms?\b|kilometros?|kilómetros?|metros?|cm\b|centimetros?|centímetros?|mm\b|millas?|kg\b|kgs?\b|kilos?|kilogramos?|gramos?|lbs?\b|libras?|reps?\b|repeticiones|series?\b|sets?\b|vueltas?|flexiones|caps?\b|capsulas?|cápsulas?|pastillas?|gotas?|dosis|gb\b|mb\b|tb\b|kb\b|fps\b|%|pts?\b|puntos|paginas?|páginas?|pags?\b|págs?\b|capitulos?|capítulos?|episodios?|canciones?|articulos?|artículos?|videos?)(?:\s|$|\b|[^a-záéíóúüñ])/i.test(trimmed);

  // If vetoed and not explicitly financial, route to note/idea/task
  if ((containsNoteOrIdeaWord || containsMeasurementUnit) && !hasCurrencySign && !hasTransactionalKeyword) {
    if (/\b(?:idea|ideas)\b/i.test(trimmed)) {
      return { kind: 'idea', text: trimmed };
    }
    if (/\b(?:nota|notas|recordar|pensar)\b/i.test(trimmed)) {
      return { kind: 'note', text: trimmed };
    }
    return parseTaskIntent(trimmed);
  }

  // 6. Financial Expression Parsing (STRICT CRITERIA)
  // To infer finance, we require:
  // - An explicit currency sign ($ / $U / USD / EUR / UYU)
  // - OR a transactional verb/keyword (gasté, compré, pagué, costó, ingreso, cobro, +, -)
  // - OR a number AND a category that strictly matches existing categories in context (or known account in context)
  let isFinanceCandidate = false;
  if (hasCurrencySign || hasTransactionalKeyword) {
    isFinanceCandidate = true;
  } else {
    // Check if any word in trimmed matches a known category or account
    const words = trimmed.toLowerCase().split(/\s+/);
    const matchesKnownCategory = (context.categories || []).some((c) => {
      const catName = typeof c === 'string' ? c : c.name;
      return words.some((w) => w === catName.toLowerCase() || (catName.toLowerCase().includes(w) && w.length >= 4));
    });
    const matchesKnownAccount = (context.accounts || []).some((a) =>
      words.some((w) => w === a.name.toLowerCase() || (a.name.toLowerCase().includes(w) && w.length >= 4))
    );
    if (matchesKnownCategory || matchesKnownAccount) {
      isFinanceCandidate = true;
    }
  }

  if (isFinanceCandidate) {
    let financeCandidate = trimmed;
    if (/^(?:gast[eé]|pagu[eé]|compr[eé])\s+/i.test(trimmed)) {
      financeCandidate = trimmed.replace(/^(?:gast[eé]|pagu[eé]|compr[eé])\s+/i, '');
    }

    const parsedFinance = parseQuickFinance(financeCandidate, {
      accounts: context.accounts || [],
      categories: context.categories || [],
    });

    if (parsedFinance.isValid && parsedFinance.amount && parsedFinance.amount > 0) {
      return {
        kind: 'finance',
        type: parsedFinance.type,
        destination: parsedFinance.destination,
        amount: parsedFinance.amount,
        category: parsedFinance.category || 'Varios',
        accountId: parsedFinance.accountId || undefined,
        accountName: parsedFinance.accountName || undefined,
        note: parsedFinance.note || '',
        date: parsedFinance.date,
        currentInstallment: parsedFinance.currentInstallment,
        totalInstallments: parsedFinance.totalInstallments,
      };
    }
  }

  // 7. Fallback: Task with Urgency detection (never money)
  return parseTaskIntent(trimmed);
}

function parseTaskIntent(trimmed: string): UniversalCaptureIntent {
  let priority: 'alta' | 'media' | 'baja' = 'media';
  let taskText = trimmed;

  if (/^(?:urgente|prioridad alta|importante):\s*/i.test(trimmed)) {
    priority = 'alta';
    taskText = trimmed.replace(/^(?:urgente|prioridad alta|importante):\s*/i, '');
  } else if (/^(?:baja prioridad|cuando pueda):\s*/i.test(trimmed)) {
    priority = 'baja';
    taskText = trimmed.replace(/^(?:baja prioridad|cuando pueda):\s*/i, '');
  }

  return {
    kind: 'task',
    text: taskText,
    priority,
  };
}

export function executeUniversalCapture(
  draft: LifeOSState,
  intent: UniversalCaptureIntent
): { message: string; sound: 'coins' | 'success' | 'click' } {
  switch (intent.kind) {
    case 'finance': {
      if (!isModuleEnabled(draft, 'finanzas')) {
        return {
          message: 'El módulo Finanzas está desactivado. No se registró el movimiento.',
          sound: 'click',
        };
      }
      if (intent.destination === 'commitment') {
        const com = addFinancialCommitment(draft, {
          name: intent.note?.trim() || intent.category || 'Compromiso',
          amount: intent.amount,
          category: intent.category,
          nextDueDate: intent.date,
          accountId: intent.accountId,
          currentInstallment: intent.currentInstallment,
          totalInstallments: intent.totalInstallments,
        });
        const instLabel = com.totalInstallments ? ` (Cuota ${com.currentInstallment}/${com.totalInstallments})` : '';
        return {
          message: `Compromiso de $${intent.amount} registrado para el ${intent.date || 'vencimiento'}${instLabel}.`,
          sound: 'coins',
        };
      }
      addQuickTransaction(draft, {
        type: intent.type,
        amount: intent.amount,
        category: intent.category,
        accountId: intent.accountId,
        note: intent.note,
        date: intent.date,
      });
      return {
        message: `${intent.type === 'ingreso' ? 'Ingreso' : 'Gasto'} de $${intent.amount} registrado en ${intent.category}.`,
        sound: 'coins',
      };
    }

    case 'study': {
      if (!isModuleEnabled(draft, 'estudios')) {
        return {
          message: 'El módulo Estudios está desactivado. No se registró la sesión.',
          sound: 'click',
        };
      }
      if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
      if (!draft.study.studyLog) draft.study.studyLog = [];

      let subjectId = intent.subjectId;
      if (!subjectId && intent.subjectName) {
        // Find or create subject
        const existing = draft.study.subjects.find(
          (s) => s.name.toLowerCase() === intent.subjectName!.toLowerCase()
        );
        if (existing) {
          subjectId = existing.id;
        } else {
          const newSub = { id: uid(), name: intent.subjectName };
          draft.study.subjects.push(newSub);
          subjectId = newSub.id;
        }
      }

      draft.study.studyLog.push({
        id: uid(),
        date: todayISO(),
        minutes: intent.minutes,
        subjectId: subjectId || null,
      });

      return {
        message: `Registrada sesión de estudio: ${intent.minutes} min en ${intent.subjectName || 'general'}.`,
        sound: 'success',
      };
    }

    case 'idea': {
      if (!isModuleEnabled(draft, 'ia')) {
        return {
          message: 'El módulo IA & Proyectos está desactivado. No se guardó la idea.',
          sound: 'click',
        };
      }
      if (!draft.ideas) draft.ideas = [];
      draft.ideas.push({
        id: uid(),
        text: intent.text,
        date: todayISO(),
        source: 'manual',
      });
      return {
        message: 'Idea registrada en tu banco de ideas.',
        sound: 'success',
      };
    }

    case 'note': {
      if (!isModuleEnabled(draft, 'notas')) {
        return {
          message: 'El módulo Notas está desactivado. No se guardó la nota.',
          sound: 'click',
        };
      }
      addQuickNote(draft, intent.text);
      return {
        message: 'Nota agregada a tus apuntes.',
        sound: 'success',
      };
    }

    case 'inbox': {
      addQuickInbox(draft, intent.text);
      return {
        message: 'Elemento guardado en tu Bandeja de Entrada.',
        sound: 'click',
      };
    }

    case 'task':
    default: {
      addQuickTask(draft, intent.text, intent.priority);
      return {
        message: `Tarea agregada para hoy (${intent.priority === 'alta' ? 'Alta prioridad' : 'Normal'}).`,
        sound: 'success',
      };
    }
  }
}
