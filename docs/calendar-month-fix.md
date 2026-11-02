# Corrección de meses calendario y regresiones financieras

## Dictamen

**GO para integrar localmente con el refinamiento de Hoy.** Suite general: 1338 aprobadas, 0 fallidas, 0 omitidas. No se publicaron cambios ni se hicieron operaciones Git de escritura sobre la rama o el índice.

## Causa raíz demostrada antes de modificar producción

`monthLabel(offset)` creaba una fecha con el instante actual y aplicaba `Date.setMonth()` conservando su día. El 31 de octubre de 2026, desplazar -1 mes intentaba representar el 31 de septiembre y terminaba en el 1 de octubre; desplazar +1 intentaba representar el 31 de noviembre y terminaba en el 1 de diciembre.

Se reprodujeron las dos pruebas originales: pagos del mes siguiente devolvían 0 en lugar de 2000; adquisiciones del mes anterior devolvían 0 en lugar de 12000. También se repitió la reproducción después de controlar su reloj al **31/10/2026 a las 12:00 locales**, antes de modificar `monthLabel`. Ninguna expectativa financiera se cambió.

Evidencias previas: `artifacts/calendar-month-fix/before-finance.log` y `before-controlled-finance.log`. La suite nueva, ejecutada antes de la corrección, produjo 9 aprobadas y 9 fallidas: los casos de fechas reales y proyecciones ya eran correctos, mientras que los casos de meses calendario detectaban el desbordamiento.

## Contrato y rutas revisadas

### A. Identificación de meses calendario

Los únicos consumidores directos de la función exportada son:

1. `txInMonth`, en `calculations.ts`: agrupa movimientos por año y mes. Sus derivados calculan gastos, ingresos, gastos fijos, categorías, comparación mensual, pagos de deuda y salidas de caja.
2. `calcFinancedAcquisitionsMonth`: agrupa adquisiciones por su fecha real. Alimenta consumo adquirido y categorías de adquisiciones.
3. `streamSessionsInMonth`: agrupa sesiones por mes; su uso actual en Notas consulta el mes presente.

Todos consumen la referencia a través de `sameMonth`, que solo utiliza año y mes locales. No usan el día ni la hora devueltos como una fecha contractual. Los resultados financieros aparecen en Finanzas, su cabecera y Analítica. No existe una ruta que escriba conciliaciones, cronogramas o fechas de pagos a partir de `monthLabel`.

### B. Desplazamiento de fechas reales

Se inspeccionaron `calculateInstallmentDate`, `advanceCommitmentDueDate`, `advanceExpectedIncomeDate`, la generación de obligaciones en `financeCashflow` y la proyección de `calculations`. Estas rutas tienen reglas propias para anclas y meses cortos. **No se modificaron.**

También se revisó el otro `setMonth` de la aplicación: `shiftGymActivityMonth` parte explícitamente del día 1 a mediodía, por lo que no presenta esta causa. Los desplazamientos de meses de Analítica y Presupuestos construyen fechas UTC con día 1. Los rótulos locales llamados `monthLabel` en componentes no son llamadas a esta utilidad. No se hicieron sustituciones masivas.

## Corrección mínima

`monthLabel` captura una sola vez la fecha actual y construye:

```ts
new Date(now.getFullYear(), now.getMonth() + offset, 1, 12)
```

El día 1 elimina la dependencia accidental del día 29, 30 o 31. El constructor normaliza el índice de mes y el año. Se conserva la interpretación local del mes usada por `sameMonth`; el mediodía evita depender de una transición de horario de verano a medianoche. Esta función identifica un mes y no representa un vencimiento ni una duración.

| Referencia local | Offset | Antes | Después |
| --- | ---: | --- | --- |
| 2026-10-31 | -1 | 2026-10-01, mes equivocado | 2026-09-01 |
| 2026-10-31 | +1 | 2026-12-01, mes equivocado | 2026-11-01 |
| 2026-01-31 | +1 | 2026-03-03, mes equivocado | 2026-02-01 |
| 2024-01-31 | +1 | 2024-03-02, mes equivocado | 2024-02-01 |
| 2026-12-31 | +1 | Enero de 2027 | 2027-01-01 |
| 2026-01-31 | -1 | Diciembre de 2025 | 2025-12-01 |

El día y la hora del resultado quedan normalizados por contrato. No se modifican los registros que se filtran, sus importes, IDs, estados ni fechas.

## Pruebas incorporadas

`calendarMonths.test.ts` agrega 18 pruebas:

- Matriz de todos los días válidos 1, 28, 29, 30 y 31 de cada mes de 2024, 2025 y 2026; offsets -13, -2, -1, 0, +1, +2 y +13; horas 00:45, 12:45 y 23:45.
- Seis zonas horarias: UTC, Montevideo, Nueva York, Berlín, Kiritimati y Katmandú. Se confirmó que el runtime aplica sus distintos offsets. Son **20160 combinaciones** de referencia, offset, hora y zona.
- Normalización al primer día del mes a mediodía.
- Agregaciones financieras desde los cinco días solicitados: selección única de movimientos, pagos, ingresos, adquisiciones, categorías y comparación mensual, sin mutar el estado.
- Cronogramas con ancla 31: febrero de 2024, 2025 y 2026; octubre/noviembre y diciembre/enero. Conservan fechas, importes y cantidad de cuotas.
- Proyecciones actuales y heredadas: el pago realizado sale de obligaciones pendientes; las cuotas siguientes permanecen y no se duplican; las consultas no modifican el libro contable ni el cronograma.
- El consumidor compartido de sesiones conserva la agrupación mensual cerca de medianoche.

Las dos pruebas originales ahora controlan el reloj en el día que reveló el defecto. Ambas fallaban con ese reloj antes de corregir producción y pasaron después. Además se ejecutaron correctamente en las seis zonas horarias (2 de 2 en cada una).

## Validación final ejecutada

| Comprobación | Resultado | Log en `artifacts/calendar-month-fix/` |
| --- | --- | --- |
| Dos pruebas originales, reloj controlado al 31/10/2026 | 2 aprobadas, 0 fallidas | `after-original-finance.log` |
| Repetición de las originales en seis zonas | 2/2 en cada zona | `originals-*.log` |
| Pruebas nuevas | 18 aprobadas, 0 fallidas | `after-calendar.log` |
| Regresiones financieras, almacenamiento y calendario relacionadas | 112 aprobadas, 0 fallidas | `related-finance.log` |
| `npm test`, incluidas las regresiones de Hoy | 1338 aprobadas, 0 fallidas, 0 omitidas | `npm-test.log` |
| `npm run lint`, incluido `tsc --noEmit` | Correcto | `lint.log` |
| `npm run build` | Correcto | `build.log` |
| `git diff --check` | Salida 0 | `diff-check.log` |

El build conserva el aviso de tamaño de chunks superior a 500 kB. No se amplió esta corrección a la división del bundle. No se identificaron regresiones residuales en las rutas cubiertas. El contrato sigue siendo el mes calendario **local**, no un mes UTC global ni una fecha de vencimiento.

## Archivos de esta corrección y protección de Hoy

- `src/lib/storage.ts`: único archivo de producción modificado; solo cambia `monthLabel`.
- `src/lib/financeAgreementsInstallments.test.ts`: reloj controlado en las dos pruebas originales, sin cambiar sus expectativas.
- `src/lib/calendarMonths.test.ts`: regresiones nuevas.
- `docs/calendar-month-fix.md`: este diagnóstico.

Al comenzar se registraron hashes SHA-256 de los 20 archivos preexistentes modificados o sin seguimiento. Al terminar se comprobó que los 20 permanecen idénticos byte por byte, incluyendo todos los cambios de Hoy y su documentación. Manifiesto: `artifacts/calendar-month-fix/preserved-files.json`.

Se mantuvo la rama `review/lifeos-estado-2026-10-04`. Sin cambios de diseño, Stream Guard, Quick Capture, recomendaciones, sincronización, cifrado, Firestore Rules o modelos. Sin datos reales de Firebase, migraciones, dependencias nuevas, commits, push, merges, resets, cambios de rama ni despliegues.
