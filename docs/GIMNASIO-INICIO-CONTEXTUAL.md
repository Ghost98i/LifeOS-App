# Gimnasio: inicio contextual

Implementado localmente el 30/10/2026 en `review/lifeos-estado-2026-10-04`, conservando HEAD `c37f7d6939367a70194be164ca720d8aabc34a2d` y los cambios del calendario. Sin commit, push, tag ni deploy.

## Problema comprobado

Las rutinas guardan preferencias semanales en `RoutineTemplate.days`. El lanzador inicializaba `sessionTemplate` con una cadena vacía; solo el selector, la tarjeta de Rutinas o «Usar esta rutina» cambiaban ese estado local. «Plan de hoy» venía de otra función que buscaba la primera rutina no vacía con un día asignado, sin resolver coincidencias múltiples ni preparar el selector.

«Descanso hoy» era una **acción para marcar descanso**, no un estado automático. Los descansos reales proceden de `gym.restDays` o `checkoutLog[fecha].trainedSkipped`. No existía una regla del lanzador que declarara sábado y domingo como descansos. La continuidad de rachas utiliza sus propias reglas y no se modificó.

Además, el panel derecho tenía `lg:w-72` dentro de una columna de ancho flexible: el control ocupaba 288 px aunque su columna fuera mucho mayor. La rutina elegida se repetía en el resumen y en el selector.

## Comportamiento implementado

| Situación | Preparación y acción |
| --- | --- |
| Una rutina para hoy, sin descanso explícito | Se selecciona al entrar. Pecho aparece preparado y el botón dice **Iniciar Pecho**. No se crea ni guarda una sesión. |
| Ninguna rutina asignada | Entrenamiento libre; siempre se puede elegir cualquier rutina guardada. |
| Varias rutinas para hoy | Selector sin elección y botón de inicio deshabilitado hasta decidir. Las opciones distinguen **Rutinas de hoy** de **Otras rutinas**, sin elegir la primera arbitrariamente. |
| Descanso explícito sin rutina de hoy | Se informa el descanso y se permite iniciar libre u otra rutina con la confirmación existente. |
| Descanso y rutina coincidentes | Un único contexto explica la superposición. No se impone una rutina: se requiere elegir; iniciar conserva la confirmación y no elimina el descanso. |
| Elección manual libre u otra rutina | Se conserva en rerenders y al salir/volver a Entrenar, incluso si cambia la planificación del día. |
| Cambio de día local | Se recalcula la sugerencia para la nueva fecha. Se detecta a medianoche, al recuperar foco, al entrar en otra pestaña y mediante una comprobación periódica de zona horaria. |
| Sesión activa, incluso de una fecha anterior | Se abre la sesión existente con sus series, datos y fecha intactos. Desde otras pestañas, **Continuar** vuelve a ella; su nombre accesible es «Continuar entrenamiento». |
| Rutina única sin ejercicios | Se identifica, se impide iniciar y se ofrece abrir su editor para agregar ejercicios. |
| Rutina elegida que dejó de existir | Se pide otra elección; nunca se inicia libre silenciosamente. |

La elección manual es estado de interfaz para la fecha local actual. Se mantiene entre pestañas; al recargar o desmontar Gimnasio se vuelve a preparar el lanzador según el día. No se introdujo una preferencia persistida.

## Presentación e integridad

El resumen, el selector y el inicio comparten una composición responsive sin la columna de ancho fijo ni el resplandor decorativo anterior. En escritorio los controles llenan la derecha; en tablet se colocan bajo el contexto y en móvil se apilan. Se mantienen Instrument Sans, el color principal, ambos temas, foco visible y controles de al menos 44 px. El selector usa 16 px para su lectura móvil.

El caso **«Plan de hoy: Pecho / Entrenamiento en blanco / Descanso hoy»** pasa a **«Viernes · rutina de hoy / Pecho / Iniciar Pecho / Marcar descanso para hoy»**. La última frase identifica inequívocamente una acción. Si hay descanso real, se muestra el conflicto y se espera una decisión.

Se corrigió también un fallo del botón **Cancelar descanso**: cuando el único origen era el cierre diario, antes agregaba un descanso a `restDays` en vez de cancelarlo. Ahora la acción explícita reconoce ambas fuentes y limpia la marca correspondiente. Se conservan campos, modelo y circuito existentes; no hay cancelación automática.

El inicio sigue llamando a `startGymSession`, que reutiliza sesiones activas y aplica las rutinas con su historial. La recuperación sigue usando `getActiveGymSession`. No cambiaron esas funciones, las series, los formatos persistidos, el algoritmo de rachas, E2EE, sincronización ni Firestore. Preparar el lanzador no modifica preferencias semanales ni crea programación fechada.

El calendario conserva su implementación y sigue derivando marcas exclusivamente del historial realizado. Una rutina sugerida nunca aparece como asistencia ni como futura sesión programada.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Suite general | **1260/1260**; 21 regresiones nuevas del lanzador, además de calendario, historial y rachas existentes |
| ESLint y TypeScript | `npm run lint` aprobado, sin advertencias; incluye `tsc --noEmit` |
| Build | Aprobado; mantiene la advertencia informativa de chunks superiores a 500 kB |
| Lanzador en navegador | **10/10** combinaciones: 1920, 2560, 768, 390 y 375 px, claro y oscuro |
| Siete días | **14/14** casos con y sin rutina; mismas reglas de lunes a domingo |
| Cambios temporales | Medianoche con foco, temporizador de medianoche sin foco y cambio real de zona emulada Montevideo ↔ Honolulu, con la aplicación montada |
| Build real offline: lanzador | **4/4**, escritorio/móvil y ambos temas: recarga, selección automática sin escrituras, elección manual entre pestañas, inicio de Pecho, historial conservado y recuperación de sesión activa tras recargar sin conexión |
| Calendario: navegador | **8/8**, conserva selección, archivo histórico, finalización, errores de guardado y cero escrituras de navegación |
| Calendario: build offline | **10/10**, incluidos 375 px y ambos temas |
| Inspección visual | 16 capturas antes y 16 después; ambos temas, 1920×1080, 2560×1440, 768×1024 y 390×844. Inspección adicional de estados múltiples, completados y shell real offline |
| Medición visual | **0 FAIL / 0 WARN**, sin desbordamientos; controles de al menos 44 px, fuente local correcta y sin el espacio derecho residual |
| Preservación | **521/523 archivos previos idénticos**. Solo cambian `GimnasioView.tsx` e `index.css`; los archivos nuevos del calendario permanecen idénticos. AST: 36 de 37 manejadores y 38 de 39 llamadas de guardado idénticos; la única diferencia operativa es cancelar el descanso del cierre diario |
| Git | Misma rama y HEAD; índice sin cambios; `git diff --check` sin errores |

Se probaron además cancelación de la confirmación de descanso, aceptación conservando la marca, fallo de guardado, cambio manual libre/otra rutina, selección desde Rutinas y apertura del editor de una rutina vacía. Las pruebas usan datos sintéticos y bloquean conexiones externas; no se modificaron datos productivos.

Las dificultades iniciales del harness fueron selectores de navegación con contadores, la comparación de propiedades `undefined` que JSON omite y una colisión entre dos emulaciones de zona horaria de Chrome. Están resueltas en los scripts; los resultados finales de abajo son los vigentes. No requirieron cambiar contratos de la aplicación.

## Evidencia y repetición

- [Comparador antes/después](../artifacts/gimnasio-inicio-contextual-20261030/comparaciones.html).
- [Resultados del lanzador](../artifacts/gimnasio-inicio-contextual-20261030/flows/results.json).
- [Resultados del inicio offline](../artifacts/gimnasio-inicio-contextual-20261030/offline/results.json), con SHA-256 del build servido.
- [Resultados del calendario offline](../artifacts/gimnasio-inicio-contextual-20261030/calendar-offline/results.json).
- [Integridad del trabajo anterior](../artifacts/gimnasio-inicio-contextual-20261030/preservation.json).
- Logs de `tests-final.log`, `lint-final.log`, `build-final.log` y `browser-final.log` en la misma carpeta de evidencia.

```powershell
npm test
npm run lint
npm run build
# Con Vite local en otra terminal:
# npm run dev -- --host 127.0.0.1 --port 5244 --strictPort
node scripts/test-gym-launcher.mjs
node scripts/test-gym-activity-calendar.mjs
node --import tsx scripts/test-gym-launcher-offline.mjs
node --import tsx scripts/test-gym-activity-offline.mjs
```

Los scripts offline sirven `dist` solo en loopback, verifican su huella y utilizan almacenamiento aislado. El build excluye fixtures y evidencia. `TEST_ORIGIN`, `CHROME_PATH`, `GYM_LAUNCHER_OUTPUT` y `GYM_CALENDAR_OUTPUT` permiten adaptar el entorno.

**Listo para revisión local.** No hay decisiones de producto bloqueantes. La validación móvil usa Chrome con tamaños emulados; no sustituye una comprobación física en Safari/iOS. No se ejecutaron emuladores ni se modificó infraestructura remota, porque esta intervención conserva los contratos de persistencia existentes.
