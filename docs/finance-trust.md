# Finanzas: privacidad, confirmaciones y coherencia

Fecha: 31 de octubre de 2026. Trabajo local, sin publicar.

## Resultado y límite de integración

Se corrigieron privacidad, confirmación de conciliación y comparación mensual. En Futuro se corrigió el enlace entre moneda/horizonte seleccionados y resumen, gráfico, hitos y cronograma; también la presentación del colchón UYU en USD.

La certificación de Futuro queda **parcial**: la pérdida de `currency` en compromisos/cobros al normalizar se confirmó y no se modificó. No se pueden certificar registros cuya moneda original ya no está disponible. No se infirió moneda desde importe, nombre o cuenta, no se convirtió dinero y no se repararon registros.

**NO-GO para iniciar el refinamiento visual de Finanzas antes de resolver esa compatibilidad.** Los cambios seguros de esta intervención quedan implementados y verificados; la suite verde no demuestra que el defecto independiente de normalización esté resuelto.

## Reproducción anterior al cambio

Evidencia sintética: `artifacts/finance-trust/before.json`, `before.log` y `reproduce.mjs`.

| Defecto | Observación anterior |
| --- | --- |
| Privacidad | Selector `UYU (67.530,88)` y nombre accesible `button "$U 67.530,88"` con Stream Guard activo. |
| Conciliación | `setItem` rechazado: 0 conciliaciones, modal cerrado y dos avisos: error de guardado seguido de éxito con ajuste de $U 20. |
| Futuro | Seleccionar USD conservaba hitos de electricidad/alquiler UYU y mostraba, por ejemplo, `−US$ 8.765,43`. |
| Análisis | Setiembre mostraba $U 1.500 junto a 65% de variación: era la comparación de octubre ($U 2.469,12) contra setiembre, no setiembre contra agosto ($U 500). El porcentaje cambia según el fixture; la causa coincide con la auditoría. |

Las cuatro reproducciones se completaron antes de editar producción. No hubo errores de página ni solicitudes externas.

## Causas y correcciones

### 1. Stream Guard

`PrivacyAmount` mantenía sus hijos reales en el DOM y aplicaba desenfoque mediante CSS. Su `role="button"` exponía el importe como nombre accesible. Además, selectores, subtotales, desgloses, explicaciones de coincidencia y gráficos tenían rutas de renderizado sin protección.

Se extendió el componente existente con un proveedor React, conectado sincrónicamente a `state.settings.privacyMode` en App:

- Un importe oculto renderiza `••••`, sin número real en texto, título o nombre accesible.
- El revelado voluntario por clic/Enter/Espacio se conserva. Un nuevo período de privacidad invalida revelados anteriores sin desmontar formularios.
- Con privacidad desactivada se renderiza el contenido original y los importes dejan de ser controles de revelado sin efecto visible.
- Selectores y explicaciones se enmascaran en presentación. El texto libre reconoce importes calificados por moneda; conserva fechas, identificadores y cantidades de cuotas.
- Los campos precargados no incluyen su importe real en `value` hasta revelado deliberado por clic o Enter. Los valores originales siguen en estado React, sin reescribirlos con puntos. Las notas sin importes calificados conservan su texto.
- Los gráficos financieros no se montan mientras la privacidad está activa: no quedan ejes, tooltips o contenido accesible que revele sus cifras. Su espacio se conserva y reaparecen al desactivar Stream Guard.
- Los avisos transitorios también protegen importes calificados por moneda.

No se cambió cifrado, almacenamiento o formato de los registros. Esto protege la interfaz; no convierte Stream Guard en un sistema de cifrado de datos locales.

### 2. Conciliación

La cadena real ya dispone de resultado: `saveStoredState` verifica la escritura local y devuelve booleano; `App.updateState` devuelve ese resultado y detiene actualización/publicación si falla. El modal ignoraba el resultado y tipaba el callback solo como `void`.

El modal acepta el contrato existente `boolean | void` y comprueba `false` antes de sonido, éxito y cierre. En el flujo de App el retorno es booleano. El formulario conserva cuenta, importe, fecha y nota cuando falla. La eliminación de una conciliación tampoco anuncia éxito si recibe `false`.

El éxito dice expresamente **«guardada en este dispositivo»**. No afirma sincronización remota; el estado remoto sigue a cargo de la infraestructura existente. No se modificaron `reconcileAccount`, `updateReconciliation`, `deleteReconciliation`, ledger o sincronización.

La prueba de navegador rechazó la escritura local, comprobó ausencia de éxito y conservación del formulario/estado, restauró el almacenamiento y reintentó: una conciliación, un ajuste, saldo esperado y una conciliación tras recargar.

### 3. Futuro

Resumen/gráfico usaban `activeProj`, mientras hitos y cronograma usaban `projection`, recibida como proyección general. Su formateador aplicaba la moneda seleccionada a esos importes de otro ámbito.

Hitos y cronograma ahora usan `activeProj`, con el mismo horizonte y moneda del gráfico. El selector reconoce también monedas de acuerdos activos. El aviso de colchón se presenta solo para UYU; no se cambió `cashFlowProjection` ni se convirtió el umbral a dólares.

Matriz verificada:

- UYU y USD por separado: cuotas vencidas/próximas, abono parcial, importes restantes y eventos con IDs distintos; consultas sin mutar registros.
- Mixto en navegador: acuerdo USD de tres cuotas de US$ 400, con abono de US$ 100. El horizonte próximo contiene US$ 300 pendientes, saldo estimado US$ 1.945,67 y el concepto USD en hitos/cronograma. No aparecen allí alquiler/electricidad UYU.
- Al volver a UYU reaparecen sus conceptos. Cambiar a 60 días conserva el estado financiero.

**Parte detenida:** no se corrigió ni certificó la clasificación monetaria de compromisos/cobros que hayan perdido `currency`. Los fallbacks históricos de esas rutas no se alteraron ni se presentan como solución. No se añadió un bloqueo automático de registros: esas rutas conservan su comportamiento previo y siguen sin estar certificadas. La matriz anterior no demuestra la moneda original de esos registros ambiguos.

### 4. Análisis

La cifra principal respetaba `selectedMonth`, pero la comparación llamaba a `calcMonthComparison(state, currency)`, que siempre compara mes actual/anterior. También usaba gasto operativo aunque la lectura principal fuera dinero pagado o compras realizadas.

`financeMonthComparison` compara el mismo desplazamiento mensual, moneda y modo del importe principal. Reutiliza `calcCashOutflowMonth` y `calcTotalAcquisitionsMonth`; ambas usan las utilidades de meses calendario existentes. No cambia saldos, transacciones, fechas, cuotas o adquisiciones.

Los períodos con importe cero no reciben un porcentaje inventado ni infinito: se informa ausencia de pagos/compras en el mes seleccionado o anterior. La igualdad de importes positivos conserva una comparación plana.

También se corrigió la identidad de la memoización al cruzar de mes con la pantalla abierta. Un desplazamiento numérico idéntico puede referirse a otro mes si cambió el mes base; ahora ese cambio invalida los valores derivados.

Casos: días 1/28/29/30/31; setiembre/agosto = +200%; navegación consecutiva; enero/diciembre entre años; moneda USD; meses vacíos; base cero; efectivo frente a compras financiadas; cambio de octubre a noviembre con la pantalla abierta. Los estados consultados permanecen idénticos.

## Diagnóstico independiente de currency

Evidencia: `artifacts/finance-trust/currency-diagnosis.json`, obtenida con almacenamiento Map en memoria y funciones puras, sin Firebase.

| Etapa | Compromiso | Cobro previsto |
| --- | --- | --- |
| Memoria, entrada explícita | USD | USD |
| JSON escrito por saveStoredState | USD | USD |
| loadStoredState | Campo ausente | Campo ausente |
| Lectura de copia con parseBackupJSON | Campo ausente | Campo ausente |
| Aplicación de módulo con applySyncModule | Campo ausente | Campo ausente |
| normalizeStoredState directamente | Campo ausente | Campo ausente |

La escritura serializa el estado completo. La lectura reconstruye ambos objetos mediante listas de campos que omiten `currency`. Los mismos normalizadores participan en lectura de copias y aplicación de módulos. Una escritura posterior del estado normalizado puede dejar de conservar el campo que todavía figuraba en el JSON anterior.

El código actual incluye altas manuales UYU y helpers que admiten moneda explícita. La ausencia del campo no permite distinguir por sí sola un registro histórico UYU de uno USD cuyo campo se perdió. No se puede deducir con seguridad a partir de la cuenta de pago ni inventar una conversión.

No se modificaron `storage.ts`, modelos, migraciones, merge o sincronización en esta intervención. `storage.ts` ya tenía el cambio local previo de `monthLabel`, preservado íntegramente.

La intervención separada deberá definir compatibilidad para ausencias, conservar monedas explícitas, estudiar recuperación solo desde evidencia verificable y cubrir lecturas locales/copias/módulos. No se incorporó un test que trate la pérdida del campo como comportamiento deseado.

## Archivos de esta intervención

Infraestructura/presentación:

- `src/App.tsx`
- `src/index.css` (solo regla para contenido ya enmascarado)
- `src/components/PrivacyAmount.tsx`
- `src/components/ToastViewport.tsx`
- `src/lib/financialPrivacy.ts` (nuevo)
- `src/lib/financeMonthComparison.ts` (nuevo)

Superficies de Finanzas:

- `FinanceHero.tsx`
- `FinanceReconcileModal.tsx`
- `FinanceFutureView.tsx`
- `FinanceAnalyticsView.tsx`
- `FinanceAccountsView.tsx`
- `FinanceAgreementsSection.tsx`
- `FinanceCategoryModal.tsx`
- `FinanceDuplicateGroups.tsx`
- `FinanceReviewInbox.tsx`
- `FinanceTransactionModal.tsx`
- `FinanceTransactionTable.tsx`
- `FinanceTransferModal.tsx`
- `FinanzasView.tsx`

Los trece anteriores están en `src/components/`. Las modificaciones adicionales al alcance principal son exclusivamente para cerrar rutas de exposición de importes, notas, selectores y campos precargados. No cambian las acciones contables.

Pruebas/documentación nuevas:

- `src/lib/financeTrust.test.tsx`
- `scripts/test-finance-trust.mjs`
- `docs/finance-trust.md`

## Validación

| Comprobación | Resultado |
| --- | --- |
| Regresiones nuevas unitarias/componentes | 11 aprobadas |
| Regresiones relacionadas de Finanzas, Hoy, Quick Capture y calendario | 162 aprobadas, 0 fallidas |
| npm test | 1.349 aprobadas, 0 fallidas, 0 omitidas; 3 suites |
| Navegador específico de Finanzas | 11 comprobaciones aprobadas; 0 errores de página; 0 solicitudes externas |
| Navegador de Hoy | 17 escenarios aprobados; 0 fallidos; 0 solicitudes externas |
| npm run test:browser | 44 aprobadas, 0 fallidas |
| npm run lint, incluido tsc --noEmit | Salida 0 |
| npm run build | Salida 0; permanece aviso de chunks mayores a 500 kB |
| git diff --check | Salida 0 |

Los logs están en `artifacts/finance-trust/`: `unit.log`, `related-tests.log`, `npm-test.log`, `browser.log`, `hoy-browser.log`, `general-browser.log`, `lint.log`, `build.log`, `diff-check.log`. Los tests nuevos se incluyen en la suite general.

El navegador financiero verifica Firebase deshabilitado en runtime, usa perfiles nuevos, bloquea service workers y toda solicitud ajena al origen local. Comprueba texto —incluso oculto—, atributos accesibles/títulos/valores y nombres accesibles. Excluye geometría SVG y clases CSS del reconocimiento de números, porque no son importes. El navegador heredado usa perfiles sintéticos y bloqueo de conexiones externas; no certifica sincronización real.

Los tamaños cubiertos son 1440×900, 390×844 y 375×812, en ambos temas. Capturas: `private-1440-false.png`, `private-375-true.png`, `future-desktop.png`, `analysis-mobile.png` y restantes variantes dentro de `artifacts/finance-trust/`.

`preservation-check.txt` verifica por hash los 29 archivos preexistentes. En CSS se comprueba el contenido previo quitando únicamente la regla añadida. No se modificaron Hoy, Quick Capture, monthLabel ni los archivos de integridad, modelos, sincronización, cifrado o reglas. No hubo instalaciones, commits, cambios de rama ni publicaciones.
