# Finanzas: política de monedas no confirmadas y compatibilidad

Implementación local del 1 de noviembre de 2026. Sin publicación, migraciones, cambios de rama, dependencias nuevas ni operaciones sobre datos reales. Se conservó la corrección previa de currency; no se modificaron sus normalizadores, guardas de integridad, cifrado, Rules ni protocolo.

## Política implementada

Una moneda de compromiso/cobro sólo se considera confirmada si el campo es exactamente `UYU` o `USD`. Ausencia, vacío, espacios, minúsculas y otros códigos permanecen no confirmados. No se deducen desde importe, nombre, categoría, cuenta o transacciones parecidas. Los códigos originales string siguen conservándose en almacenamiento y backups por el mecanismo ya implementado.

Las proyecciones suman sólo los compromisos/cobros de moneda confirmada en sus subtotales UYU/USD. Mantienen por separado las ocurrencias ambiguas y su importe original: **no se convierten en cero ni se presentan como una proyección completa**. Esos registros siguen en las listas existentes, con fechas, acciones e identidad. Las advertencias indican que las cifras, hitos y gráfico son parciales. El saldo real de las cuentas sigue representando dinero existente, sin descontar ni sumar importes de moneda desconocida.

No se implementó una selección de moneda para reparar históricos ni un flujo de revisión nuevo. Resolver la moneda original de un registro ambiguo sigue requiriendo evidencia o una decisión de producto separada; no es necesario fingir esa recuperación para mostrar los límites del cálculo correctamente.

## Consumidores: comportamiento anterior y actual

| Consumidor | UYU/USD explícito | Ausente/vacío antes | Desconocido/malformado antes | Comportamiento corregido |
|---|---|---|---|---|
| `financeCashflow` | Agrupaba por moneda | Lo agrupaba como UYU | Convertía a mayúsculas; códigos arbitrarios podían crear grupos propios | Conserva las ocurrencias sin atribuirles una moneda confirmada; no las suma a UYU/USD y expone `unconfirmedCurrencyEvents`. |
| `calculations.cashFlowProjection` | Seleccionaba la moneda | Lo incluía en UYU | Convertía minúsculas; otros códigos podían quedar fuera sin advertencia | Sólo suma códigos confirmados y devuelve `unconfirmedCurrencyItems` con IDs, fechas e importes; no inventa una suma multimoneda. |
| `financeMatching` | Comprobaba compatibilidad | Podía sugerir coincidencias UYU | Normalizaba a mayúsculas; un código arbitrario igual podía pasar el filtro | No sugiere coincidencias para objetivos sin moneda confirmada. No declara que una obligación desapareció: sus listas y la proyección parcial la conservan. |
| `financeFlows`: pagar/cobrar/vincular | Valida contra cuenta/movimiento | Podía confirmar como UYU | Recortaba espacios y convertía a mayúsculas antes de comparar | Rechaza nuevas operaciones dependientes de esa identidad antes de modificar movimientos, saldo, fecha o vínculos. No anuncia éxito. |
| Edición de movimiento vinculado | Conserva sus validaciones | Validaba el objetivo como UYU | Podía aceptar un código normalizado | Permite corregir nota/categoría si no cambian hechos financieros. Cambiar importe, cuenta, moneda, tipo o fecha necesita moneda del objetivo confirmada. |
| Formularios de compromisos/cobros | Edición conservaba campo, pero las etiquetas decían UYU | Creación podía guardar un registro nuevo sin campo, aun mostrando “Monto (UYU)” | Edición no explicaba el código no certificado | Sólo las **creaciones nuevas** del formulario UYU escriben UYU explícito. Editar un histórico conserva su campo; muestra “moneda sin confirmar”. Un registro USD muestra USD. No se asigna moneda al histórico al guardar otros campos. |
| Creación por helper | Default de creación UYU | Mantenía ese default | Un string vacío también se convertía en UYU | Conserva el contrato de creación sin argumento; un código suministrado inválido se rechaza sin modificar el estado. No es una regla de migración. |
| `FinanceHero` | Saldo real y disponible por moneda | Podía mostrar disponible completo, “Sin compromisos” o liquidez saludable con una clasificación falsa | Podía formar un selector de código no soportado por el formateador | Saldo real intacto; aviso y disponible **parciales** si hay ocurrencias ambiguas dentro de su ventana. No afirma ausencia de compromisos ni un estado saludable completo. |
| `FinanceFutureView` | Moneda seleccionada en resumen/gráfico | Incorporaba importes ambiguos a UYU | Podía usar el código como selector y el formateador como si fuera válido | Selector de compromisos/cobros sólo con códigos confirmados; listas completas con importes sin símbolo y “moneda sin confirmar”; aviso de proyección parcial y estado accesible. |
| Revisión de movimientos y avisos de Hoy | Conservan vencimientos y navegación | Rotulaban el importe como UYU | El formateador no validaba códigos | Presentan el importe como no confirmado; Stream Guard oculta números y conserva la información de estado. No se cambiaron descartes, urgencias ni navegación. |
| Cuentas y Análisis | Cuentas/acuerdos y movimientos reales tienen contratos propios | No consumen directamente estos dos campos para saldos/historial | No corresponden a esta política de planificación | No se alteraron sus sumas contables ni comparaciones mensuales. La cabecera compartida comunica el límite de planificación. |
| Almacenamiento, copias y módulos | Conservación explícita ya corregida | Se conserva la ausencia | Strings inválidos se conservan exactamente | Sin cambios en esta intervención. Las guardas previas de pérdida de moneda siguen vigentes. Leer/restaurar no completa ni migra históricos. |

Suscripciones, deudas heredadas, cuentas y acuerdos no se reclasificaron por semejanza de nombres. Sus contratos y fallbacks propios quedan fuera de esta intervención. La metadata de proyección nueva es un resultado derivado en memoria, **no un campo de Finance persistido o sincronizado**.

## Operaciones disponibles y precauciones

Se evaluó el alcance antes de restringir: el formato histórico y el formulario anterior podían producir ambos tipos de registro sin campo. No se puede cuantificar cuántos usuarios están afectados sin inspeccionar datos reales, cosa que no se hizo. Por eso no se bloqueó todo Finanzas, la consulta, edición de planificación ni las copias.

- Siguen disponibles consulta, navegación, fechas, exportación/restauración, pausar/reanudar, edición y eliminación con los mecanismos existentes. Editar un registro no confirma implícitamente su moneda.
- Los movimientos reales independientes se pueden registrar normalmente en sus cuentas. Eso no prueba ni liquida automáticamente una obligación ambigua.
- Las operaciones UYU/USD confirmadas mantienen sus validaciones, IDs deterministas, idempotencia, vínculos y materialización contable.
- Nuevos pagos/cobros y vínculos contra un objetivo ambiguo se detienen con “La moneda de este compromiso/cobro previsto no está confirmada. La operación no se realizó.” No se abre un formulario que aparente poder certificar el dato. Las APIs de dominio también validan, para cubrir otras entradas.
- El formulario de pago conserva su estado si la capa de actualización rechaza la operación. Los mensajes y la confirmación USD usan la moneda original; en privacidad no se inventa un símbolo UYU.
- Editar notas/categorías de un movimiento vinculado sigue disponible si conserva sus hechos financieros. La guarda no reasigna moneda a la obligación ni reescribe su historial.

La alternativa de permitir un pago y tomar la moneda de la cuenta liquidaría una obligación cuya unidad no está demostrada. No se adoptó. Una nueva experiencia para confirmar moneda o recuperar históricos requiere autorización separada y **no se construyó**. Los registros ambiguos permanecen pendientes; no se marcan pagados ni revisados automáticamente.

## Integridad, persistencia y límites de recuperación

Los motores no mutan el estado al derivar importes ni eliminan ocurrencias ambiguas. En las proyecciones mixtas del fixture, cada moneda incluye sólo 23,45 confirmados; los 777,77 de pago y 888,88 de cobro permanecen como dos ocurrencias no certificadas. La ausencia de datos no se reemplaza por importes reales de cero: un subtotal conocido puede ser cero, pero la advertencia y sus ocurrencias indican expresamente que no es el total completo.

La advertencia depende del horizonte y estado: un compromiso inactivo o un cobro fuera de la ventana no fabrica incompletitud en esa ventana. Los registros siguen visibles en sus listas. No se cambiaron vencimientos, reglas de cuotas ni fechas de recurrencia.

Los strings inválidos no se normalizan a códigos aparentemente válidos. Los valores no string están fuera del contrato de tipos: los consumidores ahora los consideran no confirmados sin mutarlos, pero **el normalizador previo sigue omitiendo ese campo fuera de tipo al cargar**. No se certifica conservación literal de documentos dañados de esa clase ni se agregó un contenedor persistido de reparación. Los JSON originales/copias anteriores son la evidencia para cualquier recuperación separada. Los IDs, importes y fechas válidos del registro siguen presentes, y una ausencia resultante también se trata como no confirmada, nunca como UYU. Cambiar el contrato de almacenamiento de documentos fuera de tipo queda separado.

Para moneda ya perdida, la evidencia útil sigue siendo una copia/revisión anterior con código explícito, misma identidad y una secuencia de cambios verificable. No se buscó ni reparó esa evidencia en producción. Ninguna guarda convierte una hipótesis histórica en un hecho financiero.

## Compatibilidad de clientes

Se revisaron `syncProtocolVersion`, revisiones padre, publicación cifrada, guardas de lectura/escritura, snapshots y PWA. Los clientes actuales y los anteriores a esta política declaran 2; el protocolo comercial 3 tiene un contrato adicional. No hay metadato que autentique el binario productor. El servidor no ve currency en el cifrado.

Se conserva la contención previa cuando un cliente actualizado tiene evidencia de moneda conocida: pérdidas entrantes generan conflictos en vez de reemplazos/uniones silenciosas. Sin referencia previa, un payload ambiguo ahora se lee como parcial y no puede generar pagos o vínculos falsamente certificados en el cliente actualizado. Eso **no impide** que un cliente antiguo siga interpretando o publicando mal por su cuenta.

La propuesta separada está en `docs/finance-client-currency-proposal.md`. Las Rules locales ya contienen una guarda de protocolo no decreciente que pudo demostrar contención 4→2 con parent vigente. También aceptaron una mera declaración 4 sobre un envelope existente: esto demuestra el límite de confiar en números de versión. No se activó 4 en la aplicación, no se cambió la constante ni se modificaron Rules/metadatos persistidos.

La PWA permite posponer actualización y no toma control inmediato de pestañas abiertas. Guardar localmente no implica sincronizar. La propuesta exige auditar pendientes/offline y desplegar primero lectores compatibles antes de cualquier activación. Un rollback a un writer antiguo después de activar un head superior no sería seguro: necesitaría corrección hacia adelante. No se ejecutó ese despliegue.

## Cambios y protección del trabajo previo

Código nuevo: `src/lib/financeCurrencyPolicy.ts`, `src/lib/financeCurrencyPolicy.test.ts`, `src/lib/financeCurrencyPolicy.emulator.test.ts`, `scripts/run-finance-policy-emulators.mjs` y `scripts/test-finance-currency-policy.mjs`.

Código existente modificado: `src/lib/financeCashflow.ts`, `src/lib/calculations.ts`, `src/lib/financeMatching.ts`, `src/lib/financeFlows.ts`, `src/types.ts` (sólo resultados derivados), `src/components/FinanceHero.tsx`, `FinanceFutureView.tsx`, `FinanceReviewInbox.tsx`, `FinanzasView.tsx` y `src/lib/todayAttention.ts`.

Fixtures/pruebas existentes ajustados: `cashFlowProjection.test.ts`, `financeFlows.test.ts`, `financeDuplicateReview.test.ts`, `financeMatching.test.ts`, `financialCommitments.test.ts`, `financePresentation.test.ts`, `releaseCandidateF5.test.ts`, `financeRepeatedIntegrity.test.ts` y `financeMonetary12.test.ts`. Los escenarios sintéticos de operaciones UYU ahora declaran su moneda, conservando sus expectativas financieras. La prueba expresamente histórica ahora comprueba ausencia de coincidencia y conservación del registro. Dos pruebas tenían reloj implícito: la comparación mensual con movimientos de octubre y el retroactivo al día 1 dejaban de representar su escenario el 1 de noviembre. Se controló su reloj; no se modificaron fechas financieras de producción ni expectativas monetarias para ocultar fallos.

Los normalizadores previos de currency, las guardas de sincronización, Rules, cifrado, Quick Capture, monthLabel, App y estilos no se cambiaron. Se compararon los 57 archivos preexistentes: 52 idénticos byte por byte; los cinco restantes contienen las ediciones acotadas indicadas aquí, con un diff contra el snapshot inicial. No se hizo ningún commit/reset/cambio de rama.

## Validación ejecutada

- Reproducción previa: 11 pruebas iniciales, **10 fallidas y 1 aprobada**; evidencia `artifacts/finance-currency-policy/before.log`.
- Regresiones nuevas: **15/15**, casos UYU/USD, ausencias, vacío, minúsculas, espacios, EUR, valores no string, ventanas, no mutación, bloqueo de pago/cobro/vinculación, edición no financiera y conservación/restauración sin defaults.
- Suite general: **1.381/1.381**, 0 fallidas y 0 omitidas; incluye conservación previa de currency, cuotas, saldos, sincronización, Hoy, Quick Capture y meses calendario.
- Auth/Firestore locales `demo-lifeos`, sin cambios de Rules: **5/5**, ninguna omitida. Rechazo de protocolo inferior con parent correcto y preservación del estado al bloquear publicación; los logs de `permission-denied` de esa prueba son esperados.
- Navegador de esta política: **7 escenarios**, 1440×900, 390×844, 375×812, claro/oscuro, privacidad DOM/atributos, recarga, obligaciones ambiguas visibles, intentos sin mutación; creación de ambos registros UYU y pago USD mediante formularios existentes. **0 errores de página y 0 solicitudes externas**.
- Navegador Finanzas anterior: **11/11**, incluyendo Stream Guard, fallo/reintento de conciliación, Futuro y Análisis.
- Navegador Hoy anterior: **17/17**, captura, estados vacíos/historial, móvil/escritorio, claro/oscuro; ejecutado con tsx y Brave instalado, sin descargar dependencias.
- Suite de navegador general: **44/44**, service workers bloqueados, configuración demo, contextos temporales y solicitudes no locales abortadas.
- `npm run lint` y TypeScript: aprobados. `npm run build`: aprobado, con advertencia existente de chunks mayores a 500 kB. `git diff --check`: aprobado.

Los servidores de las pruebas específicas se ejecutaron en modo portable con Firebase deshabilitado. La suite general de navegador recompila con configuración demo y bloquea solicitudes externas. Los emuladores exigieron endpoints 127.0.0.1 y proyecto demo antes de operar. No hubo acceso a Firebase real.

Evidencia local ignorada por Git: `artifacts/finance-currency-policy/`: logs, `browser.json`, capturas, snapshot inicial y comparación del trabajo previo. El primer intento de Hoy sin el cargador TS y luego sin navegador explícito falló por el entorno de ejecución; se corrigió la invocación usando tsx y Brave existente y pasó 17/17. No se instaló nada.

## Dictámenes separados

| Ámbito | Dictamen |
|---|---|
| Registros con UYU/USD explícito | **GO.** Conservación anterior intacta y uso normal protegido por regresiones, incluido pago USD real sintético. |
| Interpretación de históricos ambiguos | **GO para lectura honesta y cálculo parcial**, con guardas en operaciones que necesitan moneda. **Moneda original sin resolver**, sin promesa de recuperación. No requiere prolongar una certificación imposible: el límite se comunica. Documentos fuera de tipo no tienen conservación literal certificada. |
| Compatibilidad de clientes antiguos | **Contención local disponible; NO-GO para garantizar coexistencia global segura.** La aplicación no distingue esos productores por metadatos actuales. El contrato candidato está probado parcialmente en emuladores y no activado; requiere decisión y despliegue separado. |
| Continuación del refinamiento visual de Finanzas | **GO acotado.** Se puede mejorar presentación manteniendo esta distinción y las guardas, sin hacer pasar históricos por conocidos. La reparación manual, el contrato de protocolo y su activación siguen fuera de ese refinamiento. |

Riesgos residuales: pérdida histórica irrecuperable sin evidencia; usuarios con obligaciones ambiguas no podrán liquidarlas desde esos objetivos hasta una decisión de revisión separada; clientes antiguos pueden seguir degradando su copia o un head con protocolo anterior; el servidor no valida semántica de moneda dentro del cifrado. No hay conversión, migración ni recuperación automática que oculte esos límites.
