# Finanzas: revisión agrupada de posibles duplicados

Fecha: 2026-10-30. Implementación y pruebas locales, rama actual `review/lifeos-estado-2026-10-04`.

Actualización posterior: se reprodujo y corrigió el bloqueo intermitente de reconexión mencionado en este informe. Ampliar a 45 segundos no lo resolvía. El diagnóstico demostrado y las pruebas posteriores con límite de 20 segundos están en `docs/FINANZAS-RECONEXION-COLA-REVISIONES.md`.

## Comportamiento implementado

La detección anterior producía un aviso por transacción y elegía la primera coincidencia. Así, A apuntaba a B y B a A, con dos tarjetas y tres acciones que confundían revisar con contabilizar.

Ahora `deriveFinanceDuplicateGroups` construye relaciones entre IDs distintos, únicos y existentes. Cada relación exige mismo tipo, cuenta existente y moneda, importes positivos finitos con diferencia inferior a 0,001 y fechas separadas como máximo un día civil. La descripción y la categoría pueden coincidir o estar vacías; no identifican operaciones. Se excluyen movimientos protegidos por el circuito existente de conciliaciones, Reventa y Mi negocio. Los IDs repetidos corruptos se excluyen de la agrupación y se rechazan al intentar actuar sobre ellos; no se reparan.

Cada componente conectado de esas relaciones genera una tarjeta. Una cadena A–B–C puede ser un grupo aunque A y C estén separados dos días: se conservan las relaciones comprobadas y no se afirma que todos sean duplicados entre sí. La agrupación y su identificador se derivan en memoria, sin persistir un nuevo contrato. No se fusionan transacciones. Los elementos originales de `items` siguen disponibles para sus consumidores; la bandeja representa sus señales de similitud una sola vez.

La tarjeta ofrece exclusivamente **Conservar ambos** o **Eliminar uno**. Para N > 2, el primer texto es **Conservar los N movimientos**. Los otros avisos y sus correcciones continúan disponibles, pero los controles genéricos Revisado/Ocultar no aparecen como vías alternativas de cierre para los movimientos de un grupo pendiente.

### Conservar

`keepFinanceDuplicateGroup` valida todos los IDs y el contenido de las transacciones mostradas antes de efectuar cambios. Una edición remota, una desaparición o una identidad ambigua obliga a volver a revisar, sin mutaciones parciales.

La acción solo establece los campos existentes `reviewStatus`, `reviewed` y `revisionOrder` de los movimientos elegidos pendientes. No vuelve a ejecutar `addTransaction`, no materializa importes, no cambia cuentas, fechas, categorías o notas. Los movimientos ya revisados/ignorados conservan incluso sus metadatos históricos tal como estaban.

El contrato histórico de revisión es por movimiento completo, no por motivo. Por compatibilidad, conservar cierra la revisión de los IDs mostrados, incluyendo los avisos de esos mismos movimientos. El texto lo explica: «Conservarlos cierra la revisión de estos movimientos». No cambia revisiones de otras operaciones ni descarta sus avisos. No se introdujeron marcas persistidas de aceptación por pareja/motivo.

Si una nueva operación llega mientras se conserva una selección anterior, solo se revisan los IDs elegidos. La nueva operación sigue pendiente. Después de resolver todos los miembros, no reaparecen tarjetas simétricas. Una compra nueva semejante sí puede originar un nuevo aviso, mostrando las anteriores como contexto.

### Eliminar

Primero se abre un selector sin elección predeterminada. Se muestran descripción o «Sin descripción», importe, categoría, cuenta, fecha, hora de operación si existe, fecha/hora de registro si es válida y el ID completo. No se infieren artículos comprados ni horas ausentes. Si estos datos no permiten distinguir las compras, la interfaz indica cancelar y conservarlas.

Después de elegir un ID se requiere una segunda confirmación, con el movimiento exacto y el aviso de reversión en el saldo y los resúmenes. Cancelar en cualquiera de los dos pasos no modifica nada. `deleteFinanceDuplicate` vuelve a validar el contenido vigente y llama exclusivamente a `deleteTransaction`. No marca automáticamente como revisados a los supervivientes. Continúan vigentes las restricciones de conciliaciones, Reventa y Mi negocio; las obligaciones y acuerdos siguen su circuito contable de desvinculación existente.

Cuando falla la persistencia local, conservar no oculta el grupo; eliminar mantiene abierta la confirmación y conserva los datos previos. La sincronización posterior utiliza el circuito existente de revisiones, tombstones y estados pendientes/error/conflicto.

### Formulario

La descripción aparece en el formulario principal: «¿En qué gastaste? (opcional)» o «¿De dónde proviene? (opcional)». Fecha, hora y naturaleza quedan en Más detalles. La descripción sigue siendo opcional y usa el mismo campo `note`; los IDs estables para reintentos permanecen intactos.

## Evidencia numérica

Los casos usan cuentas y perfiles sintéticos aislados. Se contrastan transacciones persistidas, IDs únicos, sumas de ingresos/gastos y saldo reconstruido del ledger. El navegador comprueba también Saldo real y Neto del historial; no se usa una captura como demostración contable.

| Paso | Movimientos | Gasto acumulado | Ingreso acumulado | Saldo real UYU |
|---|---:|---:|---:|---:|
| Inicial | 0 | 0 | 0 | 1.000 |
| Primera compra sin descripción | 1 | 200 | 0 | 800 |
| Segunda compra idéntica | 2 | 400 | 0 | 600 |
| Tercera compra idéntica | 3 | 600 | 0 | 400 |
| Conservar los tres | 3 | 600 | 0 | 400 |
| Recargar | 3 | 600 | 0 | 400 |
| Eliminar explícitamente un gasto | 2 | 400 | 0 | 600 |
| Añadir dos ingresos de 200 | 4 | 400 | 400 | 1.000 |
| Conservar ambos ingresos | 4 | 400 | 400 | 1.000 |
| Añadir tercer ingreso de 200 | 5 | 400 | 600 | 1.200 |
| Elegir y eliminar ese ingreso | 4 | 400 | 400 | 1.000 |
| Gasto 700: fallo y reintento exitoso único | 5 | 1.100 | 400 | 300 |
| Recarga final | 5 | 1.100 | 400 | 300 |

Se comparan íntegramente los dos gastos supervivientes con sus versiones previas al borrar el tercero. En la prueba aislada de ingresos: 1.000 → 1.200 → 1.400, conservar mantiene 1.400 y eliminar uno deja 1.200. Patrimonio y saldo actual de la proyección también se comprueban según su contrato, con fixtures sin deuda/inversiones; no se confunden con flujo mensual o reserva mínima.

## Pruebas ejecutadas

- `npm test`: **1.301 aprobadas**, ninguna omitida. Incluye nueve regresiones nuevas: compras/ingresos, tres o más, cadenas por fecha, monedas/cuentas/tipos distintos, estados históricos mezclados, grupo independiente, revisión de dos clientes, diálogos obsoletos, obligaciones/protecciones comerciales e identidades corruptas.
- `npm run lint`: aprobado, incluye TypeScript. `npm run build`: aprobado; mantiene el aviso de tamaño de chunks del proyecto.
- Firestore/Auth Emulator, proyecto **demo-lifeos**, suite financiera/comercial/sincronización: **56 aprobadas**, ninguna omitida. Incluye una regresión nueva del grupo cifrado: 800 → 600 → 400; conservar y recibir en segundo cliente deja 400; borrar un ID y publicar tombstone deja 600 en recarga y fusión; publicación obsoleta rechazada y copia local intacta. También pasan las pruebas preexistentes de la versión archivada `a6834e05b0a17cff`, límites de Rules y operaciones comerciales.
- `scripts/test-finance-repeated-integrity.mjs`: aplicación compilada, **13 puntos numéricos**, cancelación en selector y confirmación, descripción principal opcional, fallo de conservación, fallo de eliminación, reintento de creación y borrado exacto. Se ejecuta la selección/eliminación de ingresos en viewport móvil y los gastos en escritorio. Los fallos se verifican comparando el estado persistido completo antes/después.
- `scripts/test-finance-simon-e2e.mjs`: **19 puntos de control** con dos contextos de navegador y libro remoto cifrado real en emulador. Alterna clientes para las tres compras sin descripción, recarga antes/después de conservar, compara contenido completo/revisión remota y local, rechaza publicador obsoleto y escritura directa con padre viejo. Gasto offline local: cuatro movimientos, saldo 200, servidor tres/saldo 400, interfaz Sin conexión. Otro gasto independiente en cliente online: tras reconexión ambos convergen a **cinco IDs y saldo 0**, también tras recarga.

El primer intento de esta última prueba agotó su límite de 20 segundos en reconexión. Su diagnóstico conserva cinco movimientos/saldo 0 en el cliente que fusionó y cuatro/saldo 200 en servidor/otro cliente; no mostró pérdida del gasto local. La repetición con espera máxima de 45 segundos solo para reconexión pasó los 19 controles y confirmó el estado del servidor, sin forzar publicaciones ni cambiar código de sincronización. La causa exacta de la demora no quedó demostrada. Se conservan ambos diagnósticos; el aumento de tiempo no convierte una espera en éxito.

## Compatibilidad y límites

`reviewStatus: reviewed`, `reviewStatus: ignored` y el campo legado `reviewed: true` mantienen su semántica. No se reescriben automáticamente al leer o agrupar. La prueba incluye registros antiguos sin uno de esos campos y recarga/normalización JSON. La revisión recibida en un segundo cliente resuelve el mismo grupo sin nuevos importes ni avisos simétricos.

Dos clientes que revisan exactamente los mismos IDs simultáneamente pueden generar el conflicto de edición existente (distintos `revisionOrder`). Se prueba que se conserva cada estado local y saldo 400; no se modificó la política de fusión para ocultar ese conflicto. La recepción secuencial y la conservación/sincronización normal sí convergen automáticamente.

La heurística sigue admitiendo falsos positivos: igualdad de importe y proximidad no prueba una duplicación. Un grupo grande puede contener una cadena de fechas. El registro histórico sin hora/descripcion puede no permitir reconocer la compra real más allá de su ID; no se inventan datos. Conservar usa revisión global por operación, por el contrato existente. La matriz sintética no demuestra que datos personales históricos estén correctos; no fueron accedidos ni reparados.

## Revisión visual

Capturas reales del navegador a 1440, 768 y 390 px, antes/después, más formulario y selector. Se conservó el diseño de Celestian. Referencia de habilidad: Pastel consumer, semilla 267096390, conservando paleta y tipografía; se aplicó al componente de lista y a acciones, sin rediseñar el shell. Pregunta de la bandeja: «¿Son operaciones legítimas o cuál quiero retirar?». El rasgo propio son las filas con datos reales de registro e identificación y una única decisión para conservar el grupo.

El inspector automático del DOM/CSS capturado detectó contraste insuficiente del nuevo botón verde; se corrigió y desapareció ese hallazgo. Permanecen tres categorías de fallo preexistentes del shell (símbolos, sombras y textos inferiores a 11 px) y dos advertencias (bordes/márgenes). No se afirma que esa auditoría global esté aprobada. El monoespaciado se limita al ID literal; la sombra nueva corresponde al diálogo superpuesto. No se alteraron los estilos globales para corregir hallazgos fuera del alcance.

| Evidencia | Archivo en artifacts/finance-duplicates |
|---|---|
| Antes, escritorio / móvil | before-desktop.png / before-mobile.png |
| Después, escritorio / móvil | after-desktop.png / after-mobile.png |
| Selector, escritorio / móvil | selection-desktop.png / selection-mobile.png |
| Formulario, antes/después | before-form-desktop.png / after-form-desktop.png; before-form-mobile.png / after-form-mobile.png |
| Tablet | before-tablet.png / after-tablet.png / selection-tablet.png |
| Regresiones | unit-tests.log / lint.log / build.log / browser.log / emulator.log |
| Primer intento de reconexión | emulator-first-attempt.log / reconnect-first-attempt.json |
| Inspector | design-inspection/report.json / design-inspection.log / design-lint.log |

El detalle de IDs por punto del navegador está en `artifacts/finance-integrity/browser-results.json`; el de ambos clientes, transacciones y revisiones en `artifacts/finance-integrity/simon-trace.json`. Todos los datos son sintéticos.

## Alcance preservado

No se cambió `firestore.rules` durante esta intervención. SHA-256 antes/después: `E96D08BF9E619F8173A98D9469F5EB0DC1C8DC68429099E0DF75EC790A745526`. Permanecen las Rules endurecidas locales sin publicar. Sin cambios de E2EE, tipos persistidos, migraciones, reparaciones históricas, commits, push, tags ni deploys. Se conservaron los cambios locales previos de Gimnasio, Agenda y Finanzas. No se accedió a datos personales de Simón ni Christian.
