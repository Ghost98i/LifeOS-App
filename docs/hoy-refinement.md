# Refinamiento acotado de Hoy

## Estado inicial y alcance

Rama de trabajo: `review/lifeos-estado-2026-10-04`. Sin cambios de rama ni operaciones Git de escritura. Se preservan `.taste-skill/` y `docs/finance-parent-revision-proposal.patch`, preexistentes y sin seguimiento.

Se verificaron las fuentes actuales: DashboardView, TodayAgendaSection, PersonalContextCard, todayAttention, review, WeeklyReviewCard, captura y avisos descartados. La cuenta inicial sin actividad emitía mantenimiento; el selector incorporaba importes en texto sin enmascarar; el orden visual de captura precedía a un DOM que la situaba después de Atención.

## Clasificación de cambios

- Visuales: proporciones de cabecera y reloj; acciones móviles y superficies táctiles; espacios, foco, legibilidad y skeleton. Se conservan las cinco fotografías, sus focos y su ciclo.
- Presentación condicional: omitir mantenimiento sin contenido propio; distinguir copia nunca registrada de antigüedad conocida; excluir cuentas sin uso de conciliaciones atrasadas; mostrar invitación a primera revisión con actividad; enmascarar importes antes de construir texto; sustituir el gráfico vacío por las mismas siete fechas seleccionables.
- Texto y accesibilidad: copia de seguridad, fechas programadas, captura/revisión/guardado, Ahora no y Gimnasio; orden DOM consistente; explicación contextual sin duplicados.

No se escriben fechas ni se cambia el motor de recomendaciones, el modelo financiero, sincronización, cifrado, reglas de Firestore, rutinas iniciales ni semántica de ocultar Agenda.

## Protección y validación

Pruebas existentes relevantes: todayAttention, todayOverview, todayIntegration, todayExtrasRecovery, review, contextInsights y scripts/test-browser-e2e.mjs. Pruebas nuevas: todayMaintenance.test.ts, TodayRefinement.test.tsx y escenarios de navegador del refinamiento. Los resultados ejecutados se registran al terminar la validación.

## Resultado implementado

- Los avisos financieros usan el enmascarado textual `••••` ya empleado por Finanzas. Los importes se sustituyen antes de construir el aviso; los textos libres financieros también ocultan sus números bajo privacidad. Así, el HTML y los nombres accesibles de avisos activos y descartados no reciben el importe. Se conservan vencimiento, asunto no sensible, navegación y claves de descarte.
- Onboarding, tema y módulos habilitados no se consideran actividad. Las cuentas con saldo cero, sin movimientos, saldo inicial ni conciliaciones conocidas dejan de contarse como atrasadas. Saldos iniciales, movimientos, transferencias e historial de conciliación siguen habilitando su revisión.
- Sin contenido propio no se muestra mantenimiento. Con contenido se distingue una primera copia de una copia con antigüedad conocida. Una primera revisión se ofrece como invitación; una revisión con fecha previa conserva el ciclo existente. No se completa ninguna revisión ni se escribe fecha alguna al evaluar avisos.
- La cabecera conserva las cinco fotografías del Cervino y su configuración de ciclo/foco. Su altura mínima es 248 px en móvil, 288 px desde 640 px y 320 px desde 1280 px; puede crecer con el contenido. El skeleton comparte esas proporciones.
- La barra de captura precede a Atención también en el DOM. Los avisos móviles permiten leer el detalle sin truncarlo y sus acciones y descartes tienen 44 px de alto. Las tareas futuras se muestran después de las actividades de hoy; los pendientes anteriores conservan su ubicación y comportamiento.
- Estado vacío mantiene la pregunta, el registro y siete fechas seleccionables, sin indicadores ni gráfico sin mediciones. Se comprobó completar el día anterior con cero horas: el cero sigue siendo un registro y activa el gráfico con sus huecos. Con historial, los valores y cálculos se mantienen.
- La explicación contextual muestra el contexto y la opción una sola vez. La expansión conserva la observación que fundamenta la sugerencia y su límite orientativo. El motor no cambió.
- Se corrigió un defecto de presentación adicional: los errores de captura automática existían en el estado del componente pero solo se renderizaban en el formulario estándar. Ahora son visibles en la captura automática; el borrador permanece y puede reintentarse. La prueba montada comprueba conservación, mensaje y ausencia de duplicación al reintentar.

## Textos principales

| Antes | Después |
| --- | --- |
| Backup pendiente, sin copia previa | Copia de seguridad |
| Todavía no exportaste una copia local | No hay una copia de seguridad registrada. |
| Exportar | Descargar copia |
| Revisión semanal pendiente, sin revisión previa | Revisá tu semana, cuando hay actividad |
| 2 señales requieren tu revisión | 2 asuntos para revisar |
| Marcar hecha | Ya revisé la semana |
| Tu día está libre. | No hay actividades para hoy. |
| Omitir por hoy | Ahora no |
| Prog: 30-oct. | Programada el 30-oct. |
| Gym | Gimnasio, en Hoy |
| Universal / Interpretar | Automática / Revisar captura |
| Borradores detectados / Confirmar | Borradores para revisar / Guardar |
| Error al persistir localmente. | No se pudo guardar en este dispositivo. El borrador sigue disponible. |
| Sin dato previo / Matutino preservado | Sin registro ayer / Registro de la mañana |

La frase sobre conservar el borrador se utiliza en las ramas que retornan antes de retirarlo cuando falla el guardado. Los errores no se presentan como confirmaciones verdes.

## Evidencia visual

Medidas del escenario vacío mínimo. El antes proviene de la auditoría previa sobre esta misma base; el después se obtuvo con fixtures sintéticos y el código final. Las capturas no comparten la hora del reloj.

| Medida | Antes | Después |
| --- | ---: | ---: |
| Cabecera, 1440 × 900 | 430 px | 320 px |
| Inicio de Agenda, escritorio vacío | 750,5 px | 514 px |
| Estado vacío, escritorio | 677,3 px | 267,4 px |
| Cabecera, móvil | 310 px | 248 px |
| Inicio de Agenda, 390 px vacío | 531,5 px | 338 px |
| Estado vacío, 390 px | 723,9 px | 316,9 px |

Los avisos con información larga necesitan más espacio que sus versiones truncadas anteriores. La distribución conserva el detalle y limita el crecimiento al espacio requerido por lectura y acciones táctiles.

Capturas finales y mediciones: `artifacts/hoy-refinement/`. Incluyen vacío e historial, claro y oscuro, 1440 × 900, 390 × 844 y 375 × 812, además de importes visibles/enmascarados en móvil. También se inspeccionó la instancia portable en el navegador integrado.

## Pruebas ejecutadas y resultados

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Unitarias y componentes afectados: atención, agenda, revisión, contexto, recuperación y captura | 147 aprobadas; 0 fallidas | `artifacts/hoy-affected-tests.log` |
| `npm test` | 1320 pruebas: 1318 aprobadas y 2 fallidas preexistentes | `artifacts/hoy-npm-test.log` |
| `npm run lint` (incluye TypeScript) | Correcto | `artifacts/hoy-lint.log` |
| `npm run build` | Correcto; también repetido por la suite de navegador final | `artifacts/browser-evidence/build.log` |
| `node --import tsx scripts/test-today-refinement.mjs` | 17 escenarios aprobados; 0 fallidos; 0 solicitudes externas; 0 errores de página | `artifacts/hoy-browser.log` |
| `node scripts/test-browser-e2e.mjs` | 44 aprobadas; 0 fallidas | `artifacts/hoy-existing-browser.log` |
| `git diff --check` | Salida 0; sin errores de whitespace | `artifacts/hoy-diff-check.log` |

El navegador del refinamiento comprueba en ejecución que `cloudSyncConfigured` es falso, usa perfiles nuevos, bloquea service workers y rechaza solicitudes fuera del servidor local. La suite existente usa perfiles sintéticos y bloqueo de solicitudes externas y service workers. No se probaron sincronización real ni registro real del service worker.

Las pruebas de privacidad verifican contenido y HTML/atributos con Stream Guard activado y desactivado, avisos descartados, restauración, vencimiento y navegación. Las pruebas de interfaz comprueban ausencia de overflow y truncado, superficies de avisos de 44 px, teclado, registro histórico y acceso a Guardar estado sin quedar tapado por la navegación móvil. El tacto fue emulado; no se usó un dispositivo físico.

## Fallos preexistentes y límites

Se reprodujeron las dos fallas financieras en una copia de los archivos de `HEAD`, archivada bajo `artifacts/hoy-baseline/`, sin reemplazar archivos del espacio de trabajo. Evidencia: `artifacts/hoy-baseline-finance-tests.log`.

- `financeAgreementsInstallments.test.ts:532`: 0 frente a 2000 esperados en pagos del mes siguiente.
- `financeAgreementsInstallments.test.ts:712`: 0 frente a 12000 esperados al mover la adquisición al mes anterior.

El origen observado es `monthLabel` en `storage.ts`: al ejecutar `setMonth` desde el 31 de octubre, el mes anterior resulta 1 de octubre y el siguiente 1 de diciembre. No se cambió ese cálculo, no se congeló una fecha alternativa para ocultar las fallas y no se alteraron sus pruebas. Finanzas está expresamente fuera del alcance. Por ello la suite general no queda completamente verde, aunque las pruebas del refinamiento sí pasan.

Se conservan también las rutinas predeterminadas, la semántica de ocultar Agenda y sus vencimientos, las reglas de descarte por ocurrencia, las fechas existentes, el modelo financiero y el motor de contexto. El build mantiene avisos de chunks superiores a 500 kB; no se amplió esta intervención a la partición del bundle.

## Archivos cambiados

Presentación e interacción:

- `src/components/DashboardView.tsx`
- `src/components/TodayAgendaSection.tsx`
- `src/components/PersonalContextCard.tsx`
- `src/components/WeeklyReviewCard.tsx`
- `src/components/BentoCommandBar.tsx`
- `src/components/MobileQuickCapture.tsx`
- `src/components/DraftConfirmationTray.tsx`
- `src/components/DismissedAttentionModal.tsx`
- `src/index.css`

Condiciones de presentación:

- `src/lib/todayMaintenance.ts` (nuevo; selectores puros)
- `src/lib/todayAttention.ts`
- `src/lib/review.ts`

Pruebas y documentación:

- `src/lib/todayMaintenance.test.ts` (nuevo)
- `src/components/TodayRefinement.test.tsx` (nuevo)
- `src/lib/mobileQuickCaptureMounted.test.ts`
- `scripts/test-today-refinement.mjs` (nuevo)
- `scripts/test-browser-e2e.mjs`
- `docs/hoy-refinement.md` (este informe)

Sin dependencias nuevas, migraciones, commits, push, merges ni despliegues. No se modificaron datos reales de Firebase.
