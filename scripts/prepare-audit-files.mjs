import fs from 'node:fs';
import path from 'node:path';

const AUDIT_DIR = path.resolve('artifacts', 'auditorias', 'finanzas-cobros');
const CODIGO_DIR = path.join(AUDIT_DIR, 'codigo');
const TESTS_DIR = path.join(AUDIT_DIR, 'tests');
const EVIDENCIA_DIR = path.join(AUDIT_DIR, 'evidencia');

for (const d of [AUDIT_DIR, CODIGO_DIR, TESTS_DIR, EVIDENCIA_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// 1. Copiar archivos de producción
fs.copyFileSync('src/lib/financeFlows.ts', path.join(CODIGO_DIR, 'financeFlows.ts'));
fs.copyFileSync('src/lib/financeMatching.ts', path.join(CODIGO_DIR, 'financeMatching.ts'));
fs.copyFileSync('src/lib/financialCommitments.ts', path.join(CODIGO_DIR, 'financialCommitments.ts'));
fs.copyFileSync('src/types.ts', path.join(CODIGO_DIR, 'types.ts'));
fs.copyFileSync('src/components/FinanzasView.tsx', path.join(CODIGO_DIR, 'FinanzasView.tsx'));

// 2. Extraer fragmentos relevantes de syncMerge.ts
const syncMergeFull = fs.readFileSync('src/lib/syncMerge.ts', 'utf-8');
const syncLines = syncMergeFull.split('\n');

// Fragmento 1: Fusión de eventos financieros (transacciones con ID determinista y revisionOrder)
const eventMergeFragment = syncLines.slice(527, 605).join('\n');
// Fragmento 2: Fusión de entidades (ExpectedIncome / collections)
const entityMergeFragment = syncLines.slice(264, 375).join('\n');
// Fragmento 3: Invocación en mergeFinanceModule para expectedIncomes
const financeModuleFragment = syncLines.slice(863, 874).join('\n');

const syncMergeDoc = `/**
 * FRAGMENTOS RELEVANTES DE src/lib/syncMerge.ts
 * Participación en la reconciliación de transacciones y ExpectedIncomes entre réplicas.
 */

/* =========================================================================
   1. FUSIÓN DE TRANSACCIONES (ID DETERMINISTA + REVISION ORDER)
   L528-L605: Cómo mergeFinanceEventCollection reconcilia colisiones de Transaction.
   Si dos dispositivos confirman el mismo ciclo, ambos generan el mismo ID determinista
   (settle-inc-\${id}-\${cycle}). El algoritmo selecciona la versión con mayor revisionOrder
   y deduplica por ID unívoco en el libro diario.
   ========================================================================= */

${eventMergeFragment}

/* =========================================================================
   2. FUSIÓN DE ENTIDADES GENÉRICAS (EXPECTED INCOMES)
   L265-L375: Cómo mergeEntityCollection combina colecciones de ExpectedIncome.
   Reconcilia startDate, settledTxIds y lastSettledTxId ante cambios concurrentes.
   ========================================================================= */

${entityMergeFragment}

/* =========================================================================
   3. INVOCACIÓN EN mergeFinanceModule
   L864-L874: Invocación directa para expectedIncomes.
   ========================================================================= */

${financeModuleFragment}
`;

fs.writeFileSync(path.join(CODIGO_DIR, 'syncMerge-fragmentos.ts'), syncMergeDoc, 'utf-8');
fs.writeFileSync(path.join(CODIGO_DIR, 'syncMerge-fragmentos.md'), '# Fragmentos de syncMerge.ts\n\n```typescript\n' + syncMergeDoc + '\n```\n', 'utf-8');

// 3. Copiar tests pertinentes
fs.copyFileSync('src/lib/expectedIncomeDuplicationAudit.test.ts', path.join(TESTS_DIR, 'expectedIncomeDuplicationAudit.test.ts'));
fs.copyFileSync('src/lib/expectedIncomeFlowCompatibility.test.ts', path.join(TESTS_DIR, 'expectedIncomeFlowCompatibility.test.ts'));
fs.copyFileSync('src/lib/expectedIncomesAudit.test.ts', path.join(TESTS_DIR, 'expectedIncomesAudit.test.ts'));
fs.copyFileSync('src/lib/commitmentRecurrenceAudit.test.ts', path.join(TESTS_DIR, 'commitmentRecurrenceAudit.test.ts'));

// 4. Limpiar evidencia visual para cumplir con la restricción de auditoría de código
// "No incluir capturas de Hero, prototipos HTML ni documentos de diseño."
if (fs.existsSync(EVIDENCIA_DIR)) {
  fs.rmSync(EVIDENCIA_DIR, { recursive: true, force: true });
}
const oldCap = path.join(AUDIT_DIR, 'futuro-ingresos-previstos-cobro.png');
if (fs.existsSync(oldCap)) {
  fs.unlinkSync(oldCap);
}

console.log('Todos los archivos del paquete de auditoría han sido organizados.');
