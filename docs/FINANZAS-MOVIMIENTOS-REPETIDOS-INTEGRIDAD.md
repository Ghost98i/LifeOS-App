# Finanzas: movimientos repetidos e integridad histórica

Fecha: 30 de octubre de 2026. Repositorio principal, rama `review/lifeos-estado-2026-10-04`.

Estado local posterior: con autorización explícita se aplicaron las dos condiciones preparadas de Rules. Consultar [parche aplicado y preparación de despliegue](FINANZAS-RULES-PARCHE-LOCAL-DESPLIEGUE.md). Las referencias siguientes a Rules sin modificar describen la investigación inicial. No hubo cambios en Firebase de producción.

Ampliación con el caso preciso de Simón: [tres gastos de $U 200 sin descripción](FINANZAS-SIMON-SECUENCIA-200.md). Demuestra y corrige una fusión que infería borrados por ausencia, incorpora protección de instantáneas recibidas y prueba dos perfiles de navegador cifrados. El informe siguiente conserva la investigación inicial; sus cifras de pruebas corresponden a esa primera etapa. La validación ampliada alcanza 1.292 pruebas unitarias, 4 de emulador y 16 puntos E2E. Las Rules reales siguen sin modificarse; existe una propuesta aislada comprobada.

## Resultado y límite de la investigación

Se corrigieron defectos reproducibles de identidad y reintento, un falso mensaje de guardado exitoso y la ambigüedad de la revisión. Las operaciones legítimas idénticas conservan IDs independientes y se contabilizan por separado.

**La garantía frente a cualquier escritor antiguo todavía no está cerrada.** Se demostró en Firestore Emulator que las Rules actuales permiten reemplazar un módulo financiero cifrado con una revisión obsoleta cuando no hay datos comerciales protegidos y el escritor evita `writeCloudModulesGuarded`. Cambiar esto requiere modificar las Rules y evaluar compatibilidad con clientes antiguos. No se modificaron: se respeta la instrucción de detenerse e informar antes de hacerlo.

No se accedió a los datos de Christian ni de Simón. No se reparó, migró, eliminó ni reseteó información real. No hubo commit, push, tag ni deploy. Se conservaron los cambios locales de Gimnasio y Agenda; en `quickCaptureDrafts.ts`, que ya tenía cambios de Agenda, solo se agregó la identidad del movimiento financiero.

## Observación A: advertencia y «Revisado»

La causa demostrada de la ambigüedad es la interfaz: presentaba como «confirmación» una revisión posterior al registro. En este checkout no aparece el literal «Valor repetido»; el aviso implementado se llama «Posible duplicado». No se presume qué versión utilizó el usuario.

`deriveFinanceReviewInbox` compara tipo, monto con tolerancia menor a 0,001, cuenta y fechas separadas por hasta un día. No necesita coincidencia de nombre o categoría. Esta es una advertencia heurística; no es la identidad de una operación ni un filtro contable.

`addTransaction` inserta el movimiento y reconstruye el saldo antes de que aparezca la bandeja. Ni el ledger ni los totales excluyen movimientos por `reviewStatus`. `markTransactionReviewed` cambia `reviewStatus`, `reviewed` y `revisionOrder`; no crea un movimiento ni vuelve a aplicar el importe. `ignoreTransactionReview` oculta la advertencia y también conserva el efecto contable.

Por tanto, que el saldo no cambie al pulsar «Revisado» es correcto bajo el contrato existente: ya cambió al guardar. **No se reprodujo que dos gastos independientes desaparezcan o dejen de contabilizarse por revisar el aviso.**

Cambios de interfaz:

- Para posibles duplicados, la acción ahora dice «Conservar operación».
- Se explica que el movimiento ya está contabilizado.
- «Ignorar» pasa a «Ocultar aviso», con su significado explícito.
- Eliminar un posible duplicado exige confirmar que se quitará su efecto contable. Cancelar no modifica el estado.
- Las importaciones se describen como revisión de datos ya contabilizados, manteniendo el código persistido `pending_confirmation`.

## Observación B: hallazgos y atribución

No se reprodujo que registrar un gasto normal con otro ID modifique el importe, fecha, tipo o identidad de un movimiento previo. Se compararon los objetos completos, no solo el saldo visible. Tampoco se dispone de evidencia para atribuir el caso concreto de Simón a una causa determinada.

Sí se demostraron estos defectos independientes:

1. **Repetición del mismo ID técnico.** Antes, `addTransaction` siempre hacía `push`, incluso si `input.id` ya existía. El ledger contaba las dos entradas. `mergeFinanceEventCollection` construía un `Map` por ID y conservaba una sola: la misma información pasaba de dos movimientos y $U 9.000 a uno y $U 9.500 después de fusionar. Este camino produce una inconsistencia real sin modificar el importe de los objetos originales.
2. **Reconfirmación de un borrador.** `confirmCaptureDraft` descartaba su ID al crear la transacción. Reconfirmar el mismo borrador producía dos movimientos con IDs distintos, indistinguibles de dos operaciones legítimas para el motor. Ahora se utiliza `capture-${draft.id}`. Dos capturas nuevas, aunque tengan el mismo texto, reciben IDs diferentes.
3. **Fallo local presentado como éxito.** Las ramas manual y con parser de la pestaña Gasto en `MobileQuickCapture` ignoraban el retorno `false` de `onUpdateState`. Anunciaban éxito, limpiaban el texto y cerraban aunque no se hubiera persistido el gasto. Ahora conservan el contenido, muestran el fallo y permiten reintentar.
4. **Sobrescritura remota obsoleta.** Las Rules exigen la revisión padre de Finanzas de manera condicional a la protección comercial. El cliente actual hace el control dentro de una transacción atómica, pero un escritor directo compatible con el protocolo cifrado puede evitarlo. El emulador aceptó volver de una transacción de $U 700 y saldo $U 9.300 a una instantánea vieja con dos transacciones de $U 500 y saldo $U 9.000, resucitando además una operación eliminada. Esto demuestra una vía para alterar el historial persistido; no demuestra que haya ocurrido a Simón.

## Correcciones aplicadas

`addTransaction` ahora trata el ID como identidad técnica. Si el ID y los datos de la operación coinciden, devuelve el movimiento existente sin cambiar saldo, revisión ni orden. Si el ID coincide pero los datos difieren, rechaza el intento en vez de sobrescribirlo. Un reintento de creación tampoco revierte una edición histórica posterior. No hay deduplicación por nombre, monto, fecha o categoría.

El formulario de Finanzas, el microformulario de búsqueda y el formulario rápido conservan un ID durante los reintentos de esa operación. Abrir una operación nueva genera otra identidad. Los movimientos nuevos sin ID explícito usan UUID cuando está disponible. Los IDs históricos no se regeneran.

Una colección que ya contiene IDs repetidos se considera ambigua: las nuevas mutaciones contables se bloquean antes de modificar el libro, y la fusión informa un conflicto. El acceso que devuelve solamente datos lanza un error; el acceso con conflictos conserva el estado local completo cuando hay colisiones de identidad. No se intenta decidir automáticamente qué entrada histórica eliminar o renombrar.

La protección heurística de posibles duplicados permanece activa. Los acuerdos, compromisos y cobros previstos conservan sus claves de liquidación por ciclo. Las operaciones comerciales siguen sujetas a sus bloqueos existentes.

## Recorrido auditado y contratos

| Tramo | Código y comportamiento verificado |
| --- | --- |
| Registro manual | `FinanceTransactionModal` → `FinanzasView.handleSubmitTx` → `addTransaction` |
| Búsqueda global | `GlobalSearchModal.handleSaveExpense` → `addTransaction` |
| Captura rápida | `MobileQuickCapture`, `BentoCommandBar` → `confirmCaptureDraft` / `addQuickTransaction` → `addTransaction` |
| Biblioteca de captura anterior | `executeUniversalCapture` también delega en `addQuickTransaction`; no se encontró un consumidor de producción de ese ejecutor |
| Otros orígenes | Confirmaciones de compromisos, ingresos esperados, pagos de acuerdos, Reventa y puente comercial delegan en el ledger; conservan contratos y pruebas existentes |
| Revisión | `financeReview.ts` deriva avisos; las acciones de revisión en `financeFlows.ts` no liquidan otra vez |
| Mutación y guardado | `App.updateState` clona el estado vigente, aplica la operación, verifica `saveStoredState` y solo entonces publica el estado React y encola sincronización |
| Persistencia local | `saveStoredState` verifica el contenido guardado; la representación local existente es JSON en localStorage. No se modificó ese contrato |
| Persistencia cifrada remota | `encodeCloudModuleData` / `decodeCloudModuleData` y `cryptoCore` conservan el sobre AES-GCM y su AAD; se probaron roundtrips y lecturas reales del emulador |
| Sincronización | `writeCloudModulesGuarded` comprueba y escribe revisiones atómicamente; `mergeFinanceModule` fusiona por identidad y reconstruye saldos. Los conflictos se detienen en la app y tienen copias de recuperación |
| Historial | La tabla ordena una copia de los movimientos. No guarda un saldo acumulado dentro de cada transacción. Su «Neto» es el neto de los filtros, no el saldo actual de las cuentas |
| Retroactividad | El ledger ordena por fecha civil y `effectiveOrder`; las conciliaciones son anclas de saldo absoluto. Una operación anterior al ancla puede cambiar el flujo histórico sin cambiar el saldo declarado por esa conciliación |

Las definiciones se verificaron separadamente:

- **Saldo real:** saldos de cuentas, por moneda, derivados del ledger tras la mutación o fusión.
- **Ingresos y gastos del mes:** movimientos del mes y moneda correspondientes; se respetan exclusiones de ajustes y clasificaciones operativas existentes.
- **Disponible tras pagos:** saldo real menos compromisos de la ventana.
- **Proyectado:** saldo real más ingresos previstos menos compromisos de la ventana.
- **Patrimonio:** cuentas más inversiones menos pasivos, conforme al tratamiento de monedas existente.

Con $U 9.000 reales, $U 2.000 pendientes, $U 3.000 previstos y $U 4.000 de inversiones, las pruebas obtienen disponible $U 7.000, proyectado $U 10.000 y patrimonio $U 13.000. Esos valores no son intercambiables.

`reviewStatus: pending` significa revisión pendiente de un movimiento ya registrado. Un borrador sin confirmar, una validación fallida o un guardado local fallido no son movimientos efectivos. Rechazar una sugerencia de vinculación tampoco elimina un pago existente; la prueba verifica que no liquida el compromiso sugerido.

## Comparaciones numéricas

Todos los casos usan datos sintéticos. Cuando no se indica lo contrario, saldo inicial $U 10.000, movimientos de $U 500, sin deudas, transferencias ni conciliaciones.

| Escenario | Antes de la corrección | Después |
| --- | --- | --- |
| Dos gastos independientes iguales | 2 movimientos, gasto 1.000, saldo 9.000 | Igual; dos IDs distintos |
| Dos ingresos independientes iguales | 2 movimientos, ingreso 1.000, saldo 11.000 | Igual; dos IDs distintos |
| Marcar gasto legítimo revisado | Saldo 9.000 → 9.000 | Igual; ahora el texto explica que ya se contabilizó |
| Reintentar el mismo ID | 2 entradas, saldo 9.000; al fusionar 1 entrada, 9.500 | 1 entrada, saldo 9.500 antes y después de fusionar |
| Reconfirmar el mismo borrador | 2 movimientos, gasto 1.000, saldo 9.000 | 1 movimiento, gasto 500, saldo 9.500 |
| Captura rápida con guardado fallido | Sin movimiento durable, saldo sin cambio, pero mensaje de éxito y contenido perdido | Sin movimiento ni cambio de saldo; conserva contenido; reintento guarda exactamente uno |
| Dos gastos sucesivos | 10.000 → 9.500 → 9.000 | Igual; primer objeto intacto |
| Agregar gasto retroactivo en el mismo mes, sin ancla | 3 movimientos, gasto 1.500, saldo 8.500 | Igual; los dos movimientos previos conservan sus datos |
| Editar ese retroactivo de 500 a 700 | 3 movimientos, gasto 1.700, saldo 8.300 | Igual; solo cambia el movimiento elegido |
| Eliminar el retroactivo y repetir eliminación | 2 movimientos, gasto 1.000, saldo 9.000 | Igual; la segunda eliminación no vuelve a aplicar nada |
| Misma descripción e importe, un movimiento en enero de 2020 y otro hoy | 2 movimientos, saldo 9.000; gasto del mes actual 500 | Igual; sin alerta por proximidad de fecha |
| Retroactivo anterior a conciliación de 9.000 | Saldo declarado 9.000 | Igual; no cambia importes ajenos ni desplaza el ancla |
| Dos clientes actuales desde la misma revisión | Una publicación gana y la obsoleta se rechaza | Fusionar y republicar conserva ambos IDs: 2 movimientos, gasto 1.000, saldo 9.000 |
| Escritor directo cifrado obsoleto, sin protección comercial | Rules permiten reemplazar instantánea | **Riesgo pendiente, demostrado:** de 1 movimiento de 700/saldo 9.300 a 2 de 500/saldo 9.000 |

La prueba E2E del build final compara también cantidades persistidas con saldo y neto renderizados:

| Paso E2E | Movimientos | Gastos | Ingresos | Saldo |
| --- | ---: | ---: | ---: | ---: |
| Inicio | 0 | 0 | 0 | 10.000 |
| Primer gasto | 1 | 500 | 0 | 9.500 |
| Segundo gasto igual | 2 | 1.000 | 0 | 9.000 |
| Conservar, recargar, cancelar eliminación | 2 | 1.000 | 0 | 9.000 |
| Confirmar eliminación de uno | 1 | 500 | 0 | 9.500 |
| Agregar dos ingresos iguales | 3 | 500 | 1.000 | 10.500 |
| Guardado de gasto de 700 fallido | 3 | 500 | 1.000 | 10.500 |
| Reintentar y recargar | 4 | 1.200 | 1.000 | 9.800 |

## Pruebas y evidencias

- `npm test`: **1.287 pruebas aprobadas**, incluyendo 15 escenarios financieros nuevos y una regresión montada de fallo local en captura rápida.
- `npm run lint`: aprobado, incluye TypeScript.
- `npm run build`: aprobado; permanece el aviso existente de tamaño de chunks.
- `scripts/test-finance-repeated-integrity.mjs`: E2E aprobado sobre el build local, navegador con perfil nuevo, service workers bloqueados y conexiones externas abortadas. Verifica transacciones persistidas, IDs, sumas independientes, saldo y neto mostrados; la captura de pantalla no se utiliza como prueba de integridad.
- Firestore/Auth Emulator: **3 pruebas aprobadas, 0 omitidas**, incluyendo la subprueba que caracteriza el riesgo pendiente de las Rules. Se usan dos instantáneas lógicas de clientes sobre una cuenta anónima sintética y el SDK de producción; no equivale a una prueba de dos dispositivos físicos.
- `scripts/audit-finance-baseline.mjs`: compara código financiero de `HEAD` con el árbol actual mediante bundles aislados, sin checkout ni escrituras reales. Demuestra los resultados anteriores de reintentos y borradores.

Salidas locales reproducibles:

- `artifacts/finance-unit-tests.log`
- `artifacts/finance-lint.log`
- `artifacts/finance-build.log`
- `artifacts/finance-emulator-tests.log`
- `artifacts/finance-e2e.log`
- `artifacts/finance-integrity/before-after.json`
- `artifacts/finance-integrity/browser-results.json`

Comandos:

```powershell
npm test
npm run lint
npm run build
node scripts/audit-finance-baseline.mjs
node --import tsx scripts/test-finance-repeated-integrity.mjs

$env:VITE_FIREBASE_PROJECT_ID = 'demo-lifeos'
# Este Windows requiere el fallback TCP de Java. La ruta debe ser inexistente:
$financeSocketDisabled = Join-Path (Get-Location) 'artifacts\no-unix-sockets'
if (Test-Path -LiteralPath $financeSocketDisabled) { throw 'Usar una ruta inexistente' }
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$financeSocketDisabled"
firebase emulators:exec --project demo-lifeos --only firestore,auth "node --import tsx --test src/lib/financeRepeatedIntegrity.emulator.test.ts src/lib/cloudWriteRevision.emulator.test.ts"
```

El ajuste de Java solo afecta al proceso de pruebas: la ruta inexistente hace que el código instalado de `PipeImpl` utilice TCP en vez de los sockets Unix que fallan en este entorno. No modifica la instalación de Java ni la configuración de Firebase.

## Compatibilidad histórica, riesgos y trabajo pendiente

Se probaron movimientos históricos sin `createdAt`, `effectiveOrder`, `revisionOrder` ni estado de revisión, y cuentas sin `initialBalance`. La normalización conserva los objetos transacción, infiere el saldo inicial con el contrato existente y mantiene coherencia al registrar otra operación. El roundtrip cifrado conserva exactamente IDs e importes. No se cambió el esquema persistido, los códigos de revisión, el cifrado, las Rules ni las políticas de conciliación.

La cobertura sintética no demuestra que los datos reales estén sanos ni corruptos. Hay evidencia de mecanismos que podían contabilizar reintentos dos veces, colapsar entradas con un mismo ID o reemplazar una instantánea por otra obsoleta. No hay evidencia de su incidencia en registros reales, ni se puede reconstruir intención legítima comparando solamente nombre y monto.

Para completar la garantía del servidor es necesario exigir la revisión padre vigente en las escrituras de Finanzas también sin protección comercial. Las condiciones hoy presentes para ese caso comercial tendrían que extenderse a todo el módulo, conservando validaciones de cifrado y protocolo. Esto bloquearía escritores antiguos que omiten o envían mal la revisión padre; requiere una evaluación y pruebas de compatibilidad antes de aplicarlo. **Ese cambio no se implementó ni publicó.**

Una colisión histórica de IDs requiere revisión específica y copias de ambas versiones; el parche la bloquea, no la repara. Dos ediciones concurrentes del mismo movimiento, o una revisión obsoleta frente a una modificación monetaria, continúan requiriendo resolver un conflicto; la app conserva las versiones en vez de aceptar silenciosamente la fusión. Reabrir un formulario constituye una intención nueva: la identidad de reintento no se infiere por similitud de contenido.

El criterio de éxito se cumple para operaciones legítimas independientes, reintentos de los puntos de entrada corregidos, recarga y sincronización mediante el cliente actual en los casos probados. **No se declara cumplido frente a escritores obsoletos que evitan la comprobación atómica del cliente, ni se declara resuelto el caso específico de Simón sin sus evidencias.**
