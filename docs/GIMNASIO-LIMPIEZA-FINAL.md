# Gimnasio: limpieza final de interfaz

Implementada localmente el 30/10/2026. Misma rama `review/lifeos-estado-2026-10-04` y HEAD `c37f7d6939367a70194be164ca720d8aabc34a2d`. Sin commit, push ni deploy.

## Cambios

1. **Rutina alternativa:** «Pecho está en tu plan de hoy; elegiste otra opción» pasa a **«Rutina de hoy: Pecho · Usar»**. Aparece solo tras una elección manual diferente, cuando existe una sugerencia única sin conflicto de descanso. «Usar» selecciona Pecho por el mismo circuito del selector y enfoca ese control. No inicia ni guarda una sesión. El acceso desaparece cuando la sugerencia queda seleccionada.
2. **Entrenamiento libre:** se eliminó «Agregá los ejercicios durante la sesión». Selector y botón siguen funcionando, sin una referencia accesible a una ayuda inexistente.
3. **Historial:** se eliminó «Ver historial» del bloque Actividad. Se conservan la pestaña principal Historial y todos los accesos **Ver sesión** del calendario.
4. **Ayuda:** se sustituyó el pie explicativo por **Ayuda** junto al total semanal. Solo al abrirla muestra: «Se cuentan los días con entrenamientos finalizados. Varias sesiones en un mismo día cuentan como uno. Los descansos no suman.» Se abre con teclado y se cierra con Escape, al volver a pulsarla o al mover el foco. Los avisos de fechas inválidas y futuras siguen visibles cuando corresponden.
5. **Fecha sin sesiones:** en escritorio el panel se ajusta al ancho del calendario y coloca el mensaje vacío debajo. Con sesiones recupera las dos columnas. Las celdas mantienen su ancho y altura, por lo que la selección no desplaza horizontalmente las fechas. En móvil se conserva la composición vertical. En la captura de escritorio vacía, el ancho del panel baja de 1418 a 554 px: un 59% menos de superficie, sin reducir la tipografía ni los controles.

No se añadieron métricas, imágenes, tarjetas ficticias, colores de estado ni mensajes motivacionales.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Pruebas pertinentes de lanzador, calendario, historial, rachas, flujos y sesión activa | **84/84**, sin omitidas |
| Lanzador en navegador | **10/10** combinaciones responsive/tema, más 14 casos semanales y cambios de día/zona horaria; incluye «Usar» desde libre y otra rutina, ausencia de escrituras, foco y posterior inicio correcto |
| Calendario en navegador | **8/8**; ayuda cerrada/abierta, Enter/Escape, límites de la ayuda en pantalla, composición adaptable, celdas estables, consulta de sesiones e historial, finalización y guardado fallido |
| ESLint y TypeScript | Aprobados mediante `npm run lint`, que incluye `tsc --noEmit` |
| Build | Aprobado; conserva la advertencia informativa de chunks mayores a 500 kB |
| Inspección visual | Rutina alternativa, entrenamiento libre, historial vacío y día con dos sesiones; 1920 y 390 px, claro/oscuro, más cuatro capturas con la ayuda abierta. Recorridos adicionales en 2560, 768 y 375 px |
| Medición visual | **0 FAIL / 0 WARN**, sin desbordamientos |
| Integridad | **526/533 archivos previos idénticos**. Los siete cambios son cinco archivos de presentación y dos scripts de regresión. AST: **37 manejadores y 39 llamadas de guardado idénticos**; selección contextual, cancelación de descanso, cálculos, fechas y contratos conservados |
| Git | Índice, rama y HEAD sin cambios; `git diff --check` sin errores |

La suite general y los emuladores no se repitieron: el alcance es de presentación y se verificaron los recorridos afectados. La validación móvil se realizó en Chrome emulado, no en hardware Safari/iOS. No se tocaron datos personales ni servicios productivos.

## Evidencia

- [Comparaciones antes/después](../artifacts/gimnasio-limpieza-20261030/comparaciones.html).
- [Lanzador](../artifacts/gimnasio-limpieza-20261030/launcher-flows/results.json).
- [Calendario](../artifacts/gimnasio-limpieza-20261030/calendar-flows/results.json).
- [Integridad y dimensiones](../artifacts/gimnasio-limpieza-20261030/preservation.json).
- Logs: `tests.log`, `lint.log`, `build-final.log`, `launcher-browser.log` y `calendar-browser-final.log` en la misma carpeta de evidencia.

**Listo para revisión local.** No hay decisiones de producto pendientes dentro de este alcance.
