# Finanzas: refinamiento visual, jerarquía y claridad

Intervención local del 1 de noviembre de 2026. Rama actual conservada: `review/lifeos-estado-2026-10-04`. No hubo commits, publicación, migraciones, dependencias nuevas ni acceso a datos reales.

Se mantuvieron Instrument Sans, el índigo principal `#4F46E5`, los temas claro/oscuro y los patrones compartidos de LifeOS. No se sustituyó la identidad por una nueva dirección visual.

## Cambios implementados

**Cabecera.** Se conservaron el saldo y moneda seleccionados, Nuevo movimiento, personalización, selector de moneda, referencia del colchón y acceso a los movimientos mensuales. El saldo real sigue siendo la cifra principal en la configuración predeterminada; se respeta la preferencia explícita previa de mostrar el saldo tras pagos como principal, con el saldo real todavía visible. No se cambió esa capacidad ni su cálculo.

Se redujeron separaciones, contenedores anidados y competencia de cifras secundarias. Los ingresos/gastos mensuales conservan el desplegable existente, inicialmente cerrado y sin un bloque vacío permanente cuando ambos son cero. El selector muestra códigos de moneda, sin repetir los saldos que ya se consultan en la cifra principal y en Cuentas. Los valores siguen disponibles al seleccionar cada moneda. No hay altura fija ni recorte de cantidades largas.

**Colchón mínimo.** Se presenta como referencia configurable para avisos, con su importe visible y aclaración en la configuración. No se restó dinero ni se cambió el motor del colchón. Una cuenta inicial con saldo cero, sin actividad ni obligaciones, no recibe la advertencia de colchón bajo. Las condiciones con información financiera real siguen mostrando avisos; USD no toma el colchón UYU como propio.

**Movimientos y atención.** Las advertencias conservan su origen y acciones; su concepto, estado e importe dejaron de competir en columnas demasiado estrechas. “Registrar pago” describe un registro contable, sin sugerir una transferencia bancaria. Se distingue ausencia de movimientos de ausencia de resultados filtrados. El neto se identifica como ingresos menos gastos de la lista, separado del saldo de cuentas. Las confirmaciones de eliminación explican consecuencias sin prometer que un movimiento histórico conciliado cambie necesariamente el saldo actual.

**Formularios.** La fecha efectiva se muestra aun cuando los detalles están cerrados, incluyendo que hoy es el valor por defecto al crear. Las etiquetas de fijo/variable distinguen ingreso y gasto. Editar explica que modifica el movimiento existente y su efecto en el saldo. No se tocaron validaciones, IDs de operación ni lógica de guardado.

**Futuro móvil.** El concepto y vencimiento ocupan el ancho disponible. El importe y las acciones aparecen en líneas propias cuando hace falta. Las acciones de pausar, editar, eliminar, registrar pago y confirmar cobro tienen superficies de al menos 44×44 px; los iconos siguen siendo discretos. Se retiró el límite de scroll interno de esos listados sólo en móvil, para que una fila larga no deje sus acciones cortadas. En escritorio se conserva la lista acotada. Con descripciones extensas, Futuro puede ser más largo: es el espacio necesario para leer y operar, sin ocultar contenido.

**Estados vacíos.** Se retiraron contenedores interiores y accesos duplicados en acuerdos, inversiones, otras deudas, compromisos y cobros; los controles de creación existentes en las cabeceras permanecen. Análisis conserva presupuesto global y por categoría, pero deja de repetir tres mensajes de presupuesto ausente y de dibujar evolución sin movimientos. Los detalles patrimoniales no se ocultan cuando existen datos de cuentas, inversiones o deudas.

**Conciliación.** Se reutilizó `useDialogFocus`: semántica de diálogo, título/descripción asociados, cuatro etiquetas vinculadas a campos, foco contenido, Escape y retorno al control de apertura. El modal puede desplazarse dentro del viewport y queda por encima de avisos globales para que no tapen sus controles. Los errores se anuncian dentro del formulario con `role="alert"`, conservan los valores y no añaden un segundo aviso flotante del modal. Se mantiene el rechazo de guardado y la confirmación exclusivamente local ya implementados. No se alteraron conciliaciones, ajustes ni saldos.

## Antes y después medidos

Medición en navegador real, mismo reloj, fixtures y tamaños. El código previo se ejecutó en un snapshot separado dentro de `artifacts`; no se revirtieron archivos de la rama. Las medidas son de estas muestras, no una promesa de altura para cualquier dato.

| Viewport / estado, tema claro | Hero antes | Hero después | Espacio recuperado |
|---|---:|---:|---:|
| 1440×900, vacío | 382 px | 249 px | 133 px |
| 1440×900, actividad | 407 px | 285 px | 122 px |
| 1440×900, proyección parcial | 443 px | 293 px | 150 px |
| 390×844, vacío | 477 px | 243 px | 234 px |
| 390×844, actividad | 525 px | 355 px | 170 px |
| 390×844, proyección parcial | 601 px | 403 px | 198 px |
| 375×812, vacío | 474 px | 242 px | 232 px |
| 375×812, actividad | 522 px | 354 px | 168 px |
| 375×812, proyección parcial | 598 px | 402 px | 196 px |

En 375 px, el estado vacío pasó de 950 a 677 px hasta el mensaje de la lista: **273 px recuperados**. Con actividad y un aviso real, la primera descripción visible de movimiento pasó de 1383 a 1157 px: **226 px recuperados**. En 390 px fueron 228 px. La coordenada mide la descripción del primer registro, no el inicio del contenedor ni una copia oculta para otro viewport. La lista con avisos todavía puede comenzar debajo del primer viewport; no se ocultaron advertencias para hacerla entrar artificialmente.

En vacío, Cuentas redujo 94 px de altura en móvil y 84 px en escritorio. Análisis redujo 328 px a 375 px, 288 px a 390 px y 220 px en escritorio. Son alturas del contenido completo de cada pestaña, incluida su cabecera. No se eliminaron accesos de configuración de presupuestos, cuentas, acuerdos, inversiones o deudas.

Capturas originales, sin retoque:

- Escritorio con actividad: `artifacts/finance-refinement/before/active-1440-light-movimientos.png` y `after/active-1440-light-movimientos.png`.
- Móvil con actividad: `before/active-375-light-movimientos.png` y `after/active-375-light-movimientos.png`.
- Futuro móvil: `before/active-375-dark-futuro.png` y `after/active-375-dark-futuro.png`.
- Moneda no confirmada: `after/partial-375-dark-futuro.png`.
- Conciliación fallida, viewport real: `after/active-375-dark-conciliacion-error.png`.
- La matriz completa está en `before/results.json`, `after/results.json` y `comparison.json` bajo `artifacts/finance-refinement`.

## Textos principales

| Antes | Después | Significado conservado |
|---|---|---|
| “Colchón: …” | “Colchón mínimo: …” | Referencia de avisos, con importe configurable. |
| “Disponible bajo reserva de …” | “El saldo tras pagos pendientes está por debajo del colchón de …” | Comparación con el umbral; no una resta adicional. |
| Sin aclaración junto al formulario del colchón | “Es una referencia para los avisos; no modifica tu saldo.” | No es cuenta ni deuda. |
| “Pagos del mes cubiertos” | “Saldo cubre los pagos pendientes” | Fondos suficientes, no pagos ya realizados. |
| “Disponible tras pagos” | “Saldo tras pagos pendientes” | Mismo saldo menos pagos de la ventana. Los avisos parciales se conservan. |
| “Otros pasivos registrados” | “Otras deudas registradas” | Mismos registros, sin consolidar deuda y cuotas. |
| “Subtotal computado UYU” | “Deudas sin acuerdo vinculado (UYU)” | Mismo subtotal que excluye deudas ya vinculadas. |
| “No se encontraron movimientos” | “Sin movimientos registrados” / “Sin resultados para estos filtros” | Ausencia real frente a búsqueda/filtrado. |
| “Neto:” | “Neto de la lista (ingresos − gastos):” y “No es el saldo de las cuentas.” | Total de movimientos filtrados, manteniendo separación de monedas. |
| “Pagar” / “Pagar ahora” en acciones de registro | “Registrar pago” | Abre el registro contable existente; no ejecuta un pago bancario. |
| “Naturaleza del Gasto” al registrar ingresos | “Tipo de ingreso” / “Tipo de gasto” | Mismos valores fijo/variable. |
| Fecha visible sólo al expandir | “Fecha: hoy (por defecto). Podés cambiarla en «Más detalles».” | Fecha efectiva del formulario, sin modificarla. Si cambió, se muestra su fecha. |

## Monedas, cifras y privacidad

No se cambiaron `financeCashflow`, `calculations`, `financeFlows`, `financeMatching`, tipos, normalizadores ni guardas de sincronización respecto del estado inicial de esta intervención. No se asignaron monedas ni se repararon históricos.

Los registros sin moneda confirmada siguen visibles con su importe original y la advertencia de proyección parcial. El subtotal conocido no se presenta como total completo. Sus pagos/cobros/vínculos continúan bloqueados por las mismas funciones de dominio. La prueba de política conservó sus expectativas financieras; sólo se adaptaron dos selectores a “Registrar pago”. La propuesta de protocolo 4 permanece sin activar.

Las cifras no se validaron por su apariencia: la suite conserva las regresiones contables previas y se comprobó que navegar por todas las pestañas no modifica los datos sintéticos. En el fixture activo, 76.765,44 − 27.266,18 = 49.499,26 UYU tras pagos; el colchón de 5.000 no se descuenta otra vez. El saldo USD largo de 1.234.567,89 se comprueba en cada viewport y tema, sin desbordamiento ni aviso UYU atribuido a USD.

Stream Guard se verificó en texto, atributos y nombres accesibles de las cuatro pestañas. Se conservan el revelado voluntario, la moneda y los estados no sensibles. La política monetaria también se probó con privacidad activa, incluido el estado de moneda no confirmada.

## Archivos de esta intervención

Producción, exclusivamente presentación/interacción:

- `src/components/FinanceHero.tsx`
- `src/components/FinanceAccountsView.tsx`
- `src/components/FinanceAgreementsSection.tsx`
- `src/components/FinanceAnalyticsView.tsx`
- `src/components/FinanceFutureView.tsx`
- `src/components/FinanceReviewInbox.tsx`
- `src/components/FinanceTransactionTable.tsx`
- `src/components/FinanceTransactionModal.tsx`
- `src/components/FinanceReconcileModal.tsx`
- `src/components/FinanzasView.tsx`
- `src/index.css`: reglas nuevas acotadas a `.finance-refinement`; el contenido previo se conserva como prefijo idéntico.

Pruebas/documentación:

- `src/components/FinanceRefinement.test.tsx`: dos regresiones de presentación vacía y advertencias legítimas.
- `src/lib/presentationAudit.test.ts` y `src/lib/financeAgreements13.test.ts`: sólo textos esperados nuevos; importes y aserciones contables intactos.
- `scripts/test-finance-refinement.mjs`: comparación y matriz sintética de navegador.
- `scripts/test-finance-currency-policy.mjs`: dos nombres de botón actualizados, sin cambiar expectativas monetarias.
- `docs/finance-refinement.md`: este informe.

Se compararon los **78 archivos preexistentes**: **66 idénticos byte por byte**, 12 editados dentro del alcance, 0 cambios inesperados. Los cálculos, modelos, sincronización, Rules, App, Hoy, Quick Capture, monthLabel y políticas monetarias previas conservaron su contenido. Evidencia: `preservation.json` y `changes-from-start.diff` en la carpeta de artefactos.

## Verificación

| Comprobación | Resultado |
|---|---|
| Matriz antes/después | 18 escenarios por versión: 1440×900, 390×844, 375×812; claro/oscuro; vacío, actividad, moneda no confirmada. |
| Interacciones adicionales | Escritorio claro y 375 oscuro: filtros, fecha predeterminada, guardado fallido de movimiento con formulario conservado, diálogo/etiquetas, Tab/Shift+Tab, Escape y retorno de foco. |
| Conciliación fallida/reintento | Valores conservados y error accesible; ningún éxito ni cambio financiero al fallar. Reintento: una conciliación, un ajuste y saldo esperado; sin duplicación. |
| Privacidad y geometría | Cuatro pestañas, importes/atributos, saldos USD largos, conceptos completos, controles 44×44 y sin overflow horizontal. Hit-testing de campos y confirmación de conciliación tras fallar: ningún control tapado. |
| Navegador de Finanzas anterior | 11/11: privacidad, revelado, fallo/reintento de conciliación, Futuro y Análisis. |
| Navegador de política monetaria | 7/7: parciales, registros ambiguos, bloqueos, recarga, privacidad y operaciones válidas. |
| Navegador Hoy/Quick Capture | 17/17. |
| Navegador general | 44/44, incluida verificación de build fresco. |
| Pruebas dirigidas | 18/18 de presentación, privacidad y preferencias. |
| `npm test` | **1.383/1.383**, 0 fallidas y 0 omitidas. |
| `npm run lint` | ESLint y `tsc --noEmit` aprobados. |
| `npm run build` | Aprobado; conserva la advertencia de chunks mayores a 500 kB. |
| `git diff --check` | Aprobado. |

Las pruebas específicas y sus snapshots se ejecutaron en Vite portable, con `cloudSyncConfigured === false`, perfiles temporales, service workers bloqueados y solicitudes externas abortadas. Registraron **0 errores de página y 0 solicitudes externas**. La suite general de navegador usa configuración demo y bloqueo de toda solicitud no local. No se ejecutaron emuladores adicionales: no cambió código de sincronización ni reglas en esta etapa.

Durante la validación se corrigieron una medición que tomaba la copia oculta de la fila móvil y un error de codificación introducido al editar el Hero. La comparación final mide sólo el concepto visible y el navegador comprueba el microcopy acentuado. El snapshot previo conserva los archivos originales; no se usó un reset ni cambio de rama.

## Límites y decisiones fuera de alcance

- No se ocultaron advertencias para forzar todos los movimientos sobre el primer viewport. Con asuntos reales pendientes, todavía hay contenido por desplazar.
- No se forzó el saldo real sobre una preferencia explícita previa de disponible como principal. Se conservó esa configuración y la separación de las dos cifras.
- Los hitos compactos siguen siendo resúmenes; las filas donde se registra un pago muestran concepto y vencimiento completos. No se rediseñó el gráfico ni la navegación.
- Se mantienen los límites históricos y de clientes antiguos documentados en `finance-currency-policy.md`. La interfaz no los certifica ni activa un protocolo nuevo.
- El tratamiento técnico de errores de abonos en Acuerdos no se amplió; esta etapa no certifica ese flujo mediante una prueba de fallo de almacenamiento específica. Sí se verificaron el movimiento normal y la conciliación solicitados. No se modificaron sus reglas contables.
- No se hicieron pruebas con personas reales, Firebase real, otros motores de navegador ni teclado móvil virtual real. La evidencia acredita los escenarios sintéticos ejecutados, no una certificación universal de usabilidad.

Resultado: refinamiento local implementado y listo para revisión. Precisión, privacidad y estados parciales conservados; ninguna publicación realizada.
