# Finanzas: conservación de currency y límites de compatibilidad

Intervención local, sin publicación. Rama `review/lifeos-estado-2026-10-04` sin cambios de rama. Sólo datos sintéticos, almacenamiento Map y emuladores `demo-lifeos` en loopback. No se consultaron ni repararon registros reales.

## Resultado

La conservación de monedas explícitas UYU/USD está corregida. También se bloquea la pérdida automática de una moneda conocida cuando hay evidencia local, remota o en la base de una unión. No se migraron registros ni se dedujeron monedas.

**GO para la corrección acotada con clientes actualizados y datos explícitos. NO-GO para certificar compatibilidad histórica completa, operación segura con clientes antiguos o comenzar el refinamiento visual de Finanzas como si la identidad monetaria ya estuviera resuelta.** Los consumidores que aún interpretan una ausencia como UYU y los datos ambiguos requieren una intervención separada. No se cambió su comportamiento ni se los considera certificados.

## Causa raíz y reproducción previa

`ExpectedIncome.currency` y `FinancialCommitment.currency` admiten un string opcional. `saveStoredState` serializa el objeto completo, pero las dos listas de campos de `normalizeStoredState` omitían `currency` al reconstruir compromisos y cobros. Cada lectura podía perder información que sí estaba en el JSON. Un guardado posterior podía hacer permanente esa pérdida.

Antes de editar el normalizador, seis regresiones deterministas fallaron: normalización, dos recargas, backups/recuperación, aplicación/unión de módulos, cifrado seguido de aplicación y proyecciones por moneda. Evidencia: `artifacts/finance-currency/before.log`, **0/6 aprobadas**. Por ejemplo, UYU acumulaba 220,75 de compromisos en vez de 200,50 porque los 20,25 USD habían perdido la moneda y entraban en el fallback UYU.

También se reprodujo por separado que una unión con un registro remoto más reciente sin moneda podía ganar sin conflicto frente a un registro local con moneda explícita. `artifacts/finance-currency/before-old-client.log`: **0/1 aprobada** antes de la guarda.

## Contratos y rutas revisadas

- Tipos: ambos campos siguen siendo opcionales y string. No se cambió el modelo, el esquema ni se agregó un default.
- Creación: `addFinancialCommitment` escribe `input.currency || 'UYU'`; su edición conserva el campo salvo cambio explícito. Los formularios actuales de compromisos/cobros de `FinanzasView` pueden crear registros sin campo. La asociación a una cuenta no demuestra por sí sola la moneda histórica. No se modificaron esos formularios.
- Transformaciones: edición, avance de ocurrencias y vinculación no reconstruyen estos registros con una nueva lista que descarte currency; la pérdida común confirmada estaba en el normalizador. Los eventos derivados usan su propia lectura de moneda; no son una reparación de los registros originales.
- Carga local: `loadStoredState` → `normalizeStoredState`.
- Backups: exportación JSON completa → `parseBackupJSON` → `normalizeStoredState`, tanto JSON plano como envoltorio con `state`. Las copias de recuperación normalizan también al leer.
- Sincronización: `syncModuleData` prepara el objeto completo; cifrado/descifrado conservan su contenido. `applySyncModule`, construcción desde módulos, lectura de snapshots y uniones terminan normalizando. Las copias de recuperación de sincronización también utilizan el normalizador.
- Escrituras posteriores: actualizaciones de estado, guardado local, nueva exportación y publicación de módulos pueden serializar un estado ya normalizado. Conservar el campo en la lectura evita que esas escrituras vuelvan a borrarlo en clientes actualizados.
- Consumidores: `financeCashflow`, `calculations`, `financeMatching` y confirmaciones de pagos/cobros en `financeFlows` usan currency, con fallbacks históricos a UYU. `formatMoney` tampoco constituye validación de códigos desconocidos. Estas rutas no certifican la moneda de registros ambiguos.

## Cambios implementados

| Archivo | Cambio |
|---|---|
| `src/lib/storage.ts` | Tres líneas: conservar el string recibido en ambos normalizadores; no completar ausencias, convertir códigos ni modificar otros campos. La corrección previa de monthLabel queda intacta. |
| `src/lib/financeCurrencyIntegrity.ts` | Detectar, por colección e ID exacto, que una moneda conocida UYU/USD pasa a faltar o a ser desconocida. No recupera ni asigna valores. |
| `src/lib/financeSnapshotIntegrity.ts` | Incorporar esa evidencia al bloqueo existente de reemplazos automáticos de snapshots financieros. |
| `src/lib/syncMerge.ts` | Comprobar el resultado contra versiones local/remota/base; si borraría una moneda conocida, conservar el estado local y devolver el conflicto existente con los candidatos completos. Las APIs de unión sin resultado de conflictos rechazan la operación. |
| `src/lib/financeCurrencyPersistence.test.ts` | 17 regresiones de persistencia, monedas, históricos, proyecciones y pagos. |
| `src/lib/financeCurrencyPersistence.emulator.test.ts` | Publicación/lectura cifrada, revisiones y cliente antiguo con pérdida de campo, exclusivamente en emuladores. |
| `scripts/run-finance-currency-emulators.mjs` | Ejecutor que exige proyecto demo y endpoints locales; incorpora tres regresiones existentes de sincronización/integridad. |
| `docs/finance-currency.md` | Este informe. |

Las guardas no equiparan eliminación completa de un registro con pérdida de un campo. No cambian tombstones, revisiones, reglas de conflictos contables ni elecciones manuales de restauración. La aplicación pura de módulos conserva el contrato de normalización; son las guardas existentes de la aplicación las que bloquean reemplazos automáticos con regresión. Una restauración explícita puede seguir trayendo registros ambiguos: no se inventa moneda para ellos.

## Compatibilidad histórica: clasificación y límites

| Clase | Tratamiento implementado y evidencia necesaria |
|---|---|
| A. UYU/USD explícito válido | Se conserva exactamente en memoria, JSON, normalización, recargas, backups, recuperación y módulos cifrados. |
| B. Ausencia de un formato histórico demostrado | No se asigna automáticamente moneda. El commit `b592a9b` no tenía currency en estos tipos; `3580a45` ya lo admitía. Ambos usaban `CURRENT_SCHEMA_VERSION = 2`. Por eso un schemaVersion 2, 1 o ausente no acredita por sí solo un productor con semántica monetaria inequívoca. No se identificó un conjunto de registros certificable sólo a partir de esos metadatos. |
| C. Moneda que pudo perderse | Sigue ausente. No se reconstruye desde nombre, importe, categoría, cuenta ni similitudes. Si hay una versión conocida del mismo registro durante una unión o reemplazo automático, la pérdida produce conflicto, sin sustituir silenciosamente el valor. Sin referencia confiable, no hay recuperación automática. |
| D. Código inválido/desconocido | Los strings `EUR`, `usd`, vacío y ` UYU ` se conservan literalmente, sin convertirlos en UYU/USD. No se consideran códigos certificados. Un valor no string está fuera del contrato y conserva el comportamiento anterior de omisión, sin default agregado. La presentación/cálculo posterior de valores inválidos o ausentes sigue pendiente de una política explícita. |

Preservar un string desconocido conserva evidencia; **no demuestra que las pantallas existentes lo presenten correctamente**. Algunos consumidores normalizan mayúsculas o usan fallbacks. Cambiarlos indiscriminadamente modificaría proyecciones, pagos y criterios existentes: no se hizo como reparación automática de históricos.

Para una recuperación separada harían falta, por ejemplo, el JSON anterior a la pérdida, una copia local exportada con moneda explícita o una revisión cifrada descifrable que identifique el mismo registro y el momento anterior a la regresión. Debe comprobarse también que no hubo un cambio monetario legítimo posterior. Si no hay esa evidencia, hace falta revisión y confirmación específica; no se puede certificar una moneda original con estos datos. No se inspeccionaron registros reales para estimar cuántos están afectados.

## Sincronización y clientes de versiones diferentes

No se cambiaron envelopes cifrados, MDEK, protocolo, Firestore Rules ni versiones de esquema. El campo es parte del payload JSON ya existente. Las revisiones y el rechazo de un parent obsoleto siguen funcionando.

El emulador confirmó que un cliente antiguo con revisión padre vigente **puede publicar** un payload cifrado que omite currency. El servidor no verifica campos dentro del contenido cifrado. Un cliente actualizado con referencia conocida conserva su estado y devuelve cuatro conflictos, sin autorizar una nueva publicación automática. Una unión que incorpora explícitamente una moneda válida a una fila antes ausente sigue funcionando si no pierde evidencia conocida.

Un dispositivo nuevo sin una copia/base confiable no puede distinguir el payload antiguo de un histórico legítimo sin moneda. Tampoco esta corrección actualiza clientes ya desplegados ni recupera revisiones sobrescritas. No se considera seguro un cliente antiguo. Certificar coexistencia total requeriría una decisión separada de compatibilidad/versiones y recuperación; no se improvisó una migración ni se modificaron reglas de producción.

## Verificación ejecutada

| Comprobación | Resultado |
|---|---|
| Regresiones nuevas | **17/17**; veinte normalizaciones, dos recargas/re-escrituras, JSON plano/envelope, recuperación, preparación/aplicación/unión, cifrado, históricos e inválidos. |
| Proyecciones mixtas | UYU: saldo 10.000, compromisos 200,50, cobros 3.000,25. USD: saldo 1.000, compromisos 20,25, cobros 100,75. Dos eventos distintos por moneda, sin mutar el estado. |
| Pago/cobro después de recargar | Cuatro movimientos, monedas originales conservadas. Segunda recarga y reintentos mantienen los mismos cuatro movimientos y saldos 12.799,75 UYU / 1.080,50 USD. Obligaciones liquidadas no se suman nuevamente como futuras. |
| Regresiones dirigidas de almacenamiento/finanzas/backups/Futuro/Análisis/meses | **117/117**. |
| Auth/Firestore locales, proyecto demo-lifeos | **4/4**, ninguna omitida: moneda cifrada, revisión de publicación, revisión de duplicados y reconexión financiera. |
| Navegador Finanzas previo | **11/11**: privacidad y revelado en 1440/390/375, claro/oscuro; conciliación fallida/reintento, Futuro y Análisis. **0 errores de página, 0 solicitudes externas**; portable y perfiles temporales. |
| `npm test` | **1.366/1.366**, 0 fallidas, 0 omitidas. Incluye Hoy, Quick Capture y meses calendario. |
| `npm run lint` | ESLint y `tsc --noEmit` aprobados. |
| `npm run build` | Aprobado; conserva advertencia de chunk mayor a 500 kB. |
| `git diff --check` | Aprobado. |
| Trabajo preexistente | 50 archivos comparados: 49 idénticos byte por byte; storage sólo agrega las tres líneas de currency. Ningún cambio inesperado. |

Logs y evidencia: `artifacts/finance-currency/{before,before-old-client,after,focused,npm-test,lint,build,emulators,browser-finance,diff-check}.log`, `preservation.json` y `baseline.json`. Son artefactos locales ignorados por Git. El primer arranque del emulador falló por sockets Unix de Java en Windows; el ajuste TCP ya documentado en el repositorio permitió ejecutar las cuatro pruebas reales. El SDK usa caché en memoria en Node por ausencia de IndexedDB; las operaciones Auth/Firestore se verificaron en los emuladores.

## Dictamen

La parte segura queda implementada y verificada localmente: conservación explícita y conflictos ante pérdida demostrable. Los cálculos, importes, IDs, fechas, movimientos y la apariencia no se modificaron. No se publicaron cambios ni se accedió a Firebase real.

Se mantiene **NO-GO para dar por resuelta toda la compatibilidad monetaria y avanzar al refinamiento visual bajo esa premisa**. Antes conviene definir el tratamiento de ausencias/códigos inválidos en los consumidores y la política frente a clientes antiguos, y revisar por separado los registros que realmente tengan evidencia de pérdida. Esta intervención no certifica ni repara históricos ambiguos.
