# Consistencia de Hoy, Agenda y Calendario

Fecha de verificación: 30/10/2026. Cambios locales, sin commit ni publicación.

## Causa demostrada

El registro observado es una tarea canónica `TodayExtra`, pendiente, con fecha local `2026-10-30` y sin hora. Hoy mostraba esa entidad directamente. Calendario generaba una proyección `scheduled-extra-<id>` y la presentaba genéricamente como «Elemento programado» / «Acontecimiento». No era un movimiento financiero ni un `CalendarEvent` independiente.

`agendaWeek` reutilizaba `getTodayAgendaCalendarItems`. Este filtro excluye las proyecciones de tareas de Calendario deliberadamente: Hoy ya incorpora las tareas por su fuente original. Agenda semanal reutilizaba el filtro sin incorporar esa fuente. La omisión no dependía de UTC ni del mes visible.

La identidad real y los detalles mínimos de la observación permanecen únicamente en `artifacts/agenda-consistencia-20261030/observacion-local.json`, excluido de Git. No se exportó el perfil ni se editaron datos personales.

## Corrección implementada

- `getDatedAgendaTasks` deriva tareas de la lista canónica unificada. Incluye su fecha programada y/o vencimiento exactos; una sola fila por identidad y fecha, aunque ambas fechas coincidan. No infiere fechas del texto ni transforma gastos en tareas.
- Agenda semanal incorpora esas tareas sin sustituir actividades, rutinas ni acontecimientos. Las tareas sin hora aparecen en «Sin horario», conservan estado y tipo, y ofrecen abrir el original. Una fecha programada y un vencimiento distintos conservan cada referencia en su día correspondiente.
- Hoy dirige a la fecha y tarea concretas. El acceso al original también funciona para una tarea histórica completada, fuera de las listas habituales de pendientes, mediante un detalle de lectura mostrado solo al navegar a ese registro.
- Calendario conserva sus tipos internos y cálculos; agrega una referencia de presentación a la entidad original. Muestra «Tarea programada» o «Tarea · vencimiento», pendiente/completada y «Abrir tarea original». Una hora programada solo se presenta en la fecha a la que pertenece.
- Los nombres iguales con IDs distintos permanecen separados. No se fusionan actividades con tareas vinculadas: son entidades distintas. Las tareas se deduplican por identidad, no por título.
- La cuadrícula y la vista móvil de Agenda ya no se montan simultáneamente con IDs duplicados. Las referencias DOM de tareas incluyen la fecha para distinguir programación y vencimiento en días diferentes.

No se agregaron escrituras al navegar o proyectar. Las completaciones siguen realizándose en su origen. Se respetan las reglas vigentes de módulos visibles y tareas de proyectos: la proyección no inventa un estado cancelado para `TodayExtra` ni cambia el tratamiento que Hoy y Calendario dan a los proyectos cancelados.

## Quick Capture: problema independiente

«gasté 5000 en la medusa» y «gaste 5000 en la medusa» ya se reconocían como gasto. Siguen requiriendo categoría y revisión; no hay prueba de que el registro histórico haya sido creado por esa vía. `TodayExtra` no guarda procedencia y también puede crearse manualmente como tarea.

Se reprodujo otro defecto: «tarea: gasté 5000…» / «crear tarea: revisar el gasto de 5000…» podían clasificarse como gasto. Ahora el prefijo explícito prevalece, tanto en el clasificador actual como en el legado. Los prefijos `gasto:` / `ingreso:` mantienen la revisión financiera existente, y `evento:` / `acontecimiento:` conservan el borrador de Agenda frente a palabras financieras en el título.

No se cambió la ejecución ni el contrato de los borradores: actualmente el borrador de tipo `agenda` de Quick Capture se confirma como `TodayExtra` mediante `addQuickTask`, con su representación de hora existente. No se convirtió en un nuevo creador de `CalendarEvent`. Cambiar esa persistencia requeriría otra decisión de producto. No se convirtió, eliminó ni duplicó ningún movimiento retrospectivamente.

## Verificación

- Suite general final: **1.271/1.271 aprobadas**, sin omitidas. Incluye 11 regresiones nuevas: identidad, ausencia de escrituras, fechas/vencimientos, fechas locales cercanas a medianoche, semanas entre meses y años, tipos coexistentes, IDs iguales/diferentes, estados y clasificación explícita.
- ESLint con cero advertencias y TypeScript: aprobados.
- Build: aprobado; advertencia habitual de tamaño de chunk. PWA: 81 entradas de precache. Sin nuevas dependencias.
- Chrome: **6 escenarios** (1920, 768 y 390 px, ambos temas), navegación y foco Hoy → Agenda → original, Calendario → original, estado completado compartido, original histórico accesible, sin escrituras por navegación y sin errores críticos. Verificados cambio de tamaño y IDs únicos para fecha/vencimiento diferentes.
- Build real: **2 escenarios** (1920 y 390 px), callbacks de App, Service Worker controlador, recarga/navegación offline y estado persistido completo idéntico antes/después. Perfiles aislados, datos sintéticos y solicitudes externas bloqueadas. Las fixtures y sus datos no están en `dist`.
- 12 capturas anteriores y 12 posteriores, inspeccionadas en ambos temas y tamaños; sin desborde horizontal. Comparador local: `artifacts/agenda-consistencia-20261030/comparaciones.html`.
- Integridad: 524 de 534 archivos preexistentes idénticos byte a byte; solo los 10 archivos previstos cambiaron. Todos los archivos de Gimnasio, su CSS, pruebas y documentación siguen idénticos. Las 79 funciones de dominio/ejecución comprobadas permanecen idénticas, salvo los selectores/clasificadores expresamente modificados. HEAD, rama e índice conservados; `git diff --check` aprobado.

La causa se comprobó en la interfaz con el registro real en modo lectura. La verificación posterior se hizo con datos sintéticos equivalentes y el build real: la conexión al navegador del usuario dejó de estar disponible. Queda la revisión visual del mismo registro en su cuenta al volver a abrir la versión local. No hay publicación de esta corrección.

Reproducción local: `npm test`, `npm run lint`, `npm run build`; con Vite en loopback 5244, `node scripts/test-agenda-consistency.mjs`; para el build, `node --import tsx scripts/test-agenda-consistency-build.mjs`.
