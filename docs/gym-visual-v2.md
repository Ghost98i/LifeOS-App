# Gimnasio: refinamiento visual V2

Seguimiento: [revisión final de calidad visual](gym-visual-final.md), con CTA de escritorio contenido, etiquetas de volumen aclaradas, ajustes del panel lateral y nuevas capturas. Este informe conserva la evidencia previa a esa revisión puntual.

Fecha: 2 de noviembre de 2026. Base: `e97e8c5da8bf4d5cd8b0966f565cdc59e45021f3`. Rama conservada: `feat/gimnasio-refinement-2026-11`.

La versión visual anterior fue rechazada por el usuario: **NO-GO**. Este informe describe la segunda intervención y sustituye el dictamen visual anterior de `gym-refinement.md`. No implica aprobación del usuario ni autorización de publicación.

## Diagnóstico y criterio aplicado

El problema no era únicamente el color. La cabecera, el editor, el descanso y el resumen estaban tratados como tarjetas igualmente protagonistas. Dentro del descanso se repetía esa competencia: cifra de 42 px, aro grueso, controles separados y otra tarjeta para el próximo esfuerzo. El resultado era alto y fragmentado. Además, las series completadas y las confirmaciones verdes contradecían el progreso violeta.

La nueva composición concentra el trabajo en una superficie continua. La sesión queda como contexto; el ejercicio domina el encabezado; las series muestran selección y finalización con señales diferentes; el descanso acompaña la operación en lugar de ocupar su centro. El panel lateral queda subordinado mediante separadores y tipografía, sin otra sucesión de tarjetas.

En la entrada, el calendario vacío se reducía a una columna de 554 px en escritorio, mientras el launcher ocupaba el ancho completo. Ahora ambos comparten un lienzo de 1120 px: mes a la izquierda y contexto del día a la derecha. En móvil se mantiene el apilado. El contenido vacío sigue siendo verdadero; no se agregaron métricas, ilustraciones ni entrenamientos ficticios.

## Cambios implementados

- Descanso: dial de 84 px en escritorio y 76 px en móvil; cifra de 23/22 px; trazo SVG de 2,25 unidades. Etiqueta y acciones quedan al lado. En móvil, las cuatro acciones forman dos filas con superficies de al menos 44 px.
- Próximo esfuerzo: separación por una línea, sin una tarjeta interna adicional. Permanecen ejercicio, serie, peso, repeticiones, inicio y acceso a corregir la serie anterior.
- Feedback: aro, check, serie completada, acción registrada, finalización e historial usan la familia violeta. El recurso Lottie existente ya era violeta; el check estático ahora utiliza el mismo lenguaje. No se agregaron assets ni bibliotecas.
- Series: etiquetas «Serie N» y «Aprox.»; selección con contorno y finalización con fondo tenue y check. Se conserva la distinción cuando una serie completada está seleccionada para corregirla.
- Registro: posición explícita «Serie N de M» y estado «Por registrar»/«Registrada», derivados del estado existente. Los campos de peso y repeticiones siguen dominando sobre el reloj. No se cambió cómo se registran ni completan las series.
- Jerarquía: cabecera operativa plana, título del ejercicio de mayor escala, herramientas discretas, CTA sólido sin glow ni gradiente y resumen/configuración con separadores.
- Entrada: tabs subrayadas, alineación compartida entre cabecera, launcher y calendario, días de 48 px y contexto de fecha estable al navegar.
- Se mantienen el verde de comparaciones favorables, el dorado de récords y el naranja de continuidad donde ya representan significados distintos. No se usan para confirmar el flujo ordinario de descanso/serie/sesión.

## Comparación medida

Mediciones del DOM con los mismos fixtures y fecha controlada. «Bloque de descanso» incluye reloj, controles, próximo esfuerzo y acciones; no es la altura de toda la sesión. Valores en px, salvo trazo SVG.

| Elemento | 1440 × 900: antes → después | 390 × 844: antes → después | 375 × 812: antes → después |
|---|---:|---:|---:|
| Bloque de descanso | 447,4 → 330,0 | 447,4 → 349,3 | 447,4 → 349,3 |
| Dial | 112 → 84 | 112 → 76 | 112 → 76 |
| Tamaño del tiempo | 42 → 23 | 42 → 22 | 42 → 22 |
| Trazo SVG | 5 → 2,25 | 5 → 2,25 | 5 → 2,25 |
| Altura del calendario | 650,5 → 505,5 | 654,5 → 617,0 | 654,5 → 617,0 |
| Ancho del calendario | 554 → 1120 | 358 → 358 | 343 → 343 |
| Altura del launcher | 184,2 → 186,7 | 328,7 → 334,8 | 328,7 → 334,8 |

El descanso baja aproximadamente un 26 % en escritorio y un 22 % en móvil. El launcher crece 2,5/6,1 px: no se forzaron alturas ni se recortó el texto para afirmar una compactación universal.

Valores completos: [comparison.json](../artifacts/gym-visual-v2/comparison.json). Matrices originales: [antes](../artifacts/gym-visual-v2/before/results.json) y [después](../artifacts/gym-visual-v2/after/results.json).

## Capturas antes/después

Capturas reales del navegador, sin edición de contenido. Hay 36 estados antes y 36 después: tres viewports, ambos temas y registro/descanso/entrada/vacío/pausa/minimizado. Los ejemplos siguientes comparan exactamente el mismo fixture.

| Superficie | Antes | Después |
|---|---|---|
| Entrenamiento activo, registro, escritorio claro | [PNG](../artifacts/gym-visual-v2/before/1440-light-active.png) | [PNG](../artifacts/gym-visual-v2/after/1440-light-active.png) |
| Entrenamiento activo, registro, móvil claro | [PNG](../artifacts/gym-visual-v2/before/375-light-active.png) | [PNG](../artifacts/gym-visual-v2/after/375-light-active.png) |
| Entrenamiento activo, descanso, escritorio oscuro | [PNG](../artifacts/gym-visual-v2/before/1440-dark-rest.png) | [PNG](../artifacts/gym-visual-v2/after/1440-dark-rest.png) |
| Entrenamiento activo, descanso, móvil claro | [PNG](../artifacts/gym-visual-v2/before/375-light-rest.png) | [PNG](../artifacts/gym-visual-v2/after/375-light-rest.png) |
| Principal, escritorio claro | [PNG](../artifacts/gym-visual-v2/before/1440-light-idle.png) | [PNG](../artifacts/gym-visual-v2/after/1440-light-idle.png) |
| Principal, móvil oscuro | [PNG](../artifacts/gym-visual-v2/before/375-dark-idle.png) | [PNG](../artifacts/gym-visual-v2/after/375-dark-idle.png) |

[Galería comparativa](../artifacts/gym-visual-v2/comparison.html). También puede abrirse con el servidor local de revisión: <http://127.0.0.1:5341/artifacts/gym-visual-v2/comparison.html>.

## Archivos modificados en esta segunda intervención

Código de producto:

- `src/components/ActiveWorkoutView.tsx`: estructura visual, etiquetas y clases; mismos callbacks y condiciones de registro/descanso.
- `src/components/GimnasioView.tsx`: contenedores y clases de presentación; coherencia de confirmaciones e historial.
- `src/components/WorkoutSummaryModal.tsx`: color de confirmación y volumen.
- `src/styles/gymCockpit.css`: composición integral del workspace, descanso, controles y panel auxiliar; reglas acotadas a Gimnasio.
- `src/styles/gymLauncher.css`: launcher y jerarquía responsive.
- `src/styles/gymActivityCalendar.css`: densidad, alineación y ancho estable del calendario.

Pruebas y evidencia:

- `src/lib/gymCockpitUnified.test.ts`: expectativa de la etiqueta «Aprox.» en lugar de «Apx»; no cambian expectativas de entrenamiento.
- `scripts/test-gym-activity-calendar.mjs`: comprueba ancho estable al seleccionar un día sin sesión, sustituyendo la expectativa visual anterior de encoger a 554 px. Conserva pruebas de navegación, foco, guardado, fechas, asistencia y ausencia de escrituras por visitar.
- `scripts/test-gym-refinement.mjs`: salida/puerto configurables; espera al commit real del DOM al desactivar privacidad antes de comprobar las cifras. No se eliminaron aserciones de privacidad.
- `scripts/test-gym-refinement-app.mjs`: directorio de evidencia configurable.
- `scripts/test-gym-visual-v2.mjs`: nueva matriz visual y geométrica antes/después, aislamiento de red, tamaños, color y ausencia de escrituras por renderizar.
- `docs/gym-visual-v2.md` y nota de supersesión en `docs/gym-refinement.md`.

Los demás archivos de Gimnasio que aparecen en `git status` pertenecen a la intervención anterior y se preservaron. Un snapshot completo al comenzar V2 permite distinguirlas: [source-preservation.json](../artifacts/gym-visual-v2/source-preservation.json) y [diff desde el comienzo de V2](../artifacts/gym-visual-v2/source-v2.diff). Todos los archivos `src` fuera de los siete indicados permanecen idénticos al inicio de V2. No cambiaron Finanzas, Hoy, almacenamiento, modelos, cálculos, sincronización ni el motor temporal en esta ronda.

## Validación ejecutada

| Comprobación | Resultado real | Evidencia |
|---|---|---|
| Pruebas específicas de Gimnasio y composición corporal | 234 aprobadas, 0 fallidas | `artifacts/gym-visual-v2/gym-unit.log` |
| `npm test` completo, repetido con el código final | 1393 aprobadas, 0 fallidas, 0 omitidas | `artifacts/gym-visual-v2/npm-test.log` |
| Matriz visual final | 36/36: tres tamaños, claro/oscuro, seis estados | `artifacts/gym-visual-v2/after/results.json` |
| Interacciones de Gimnasio | 48/48; 0 errores de página, 0 solicitudes externas | `artifacts/gym-visual-v2/interactions.log` |
| App compilada con configuración demo verificable | 6/6; recarga de serie y descanso pausado, origen del descanso, guardado fallido/reintento y controles fijos | `artifacts/gym-visual-v2/app.log` |
| Launcher | 10 escenarios responsive/tema y 14 casos de día semanal aprobados; selección manual, inicio, descanso, reanudación y medianoche/zona horaria | `artifacts/gym-refinement/launcher-browser.log` |
| Calendario | 8 escenarios aprobados; foco de historial, navegación offline sin escrituras, finalización/fallo y cambio de día | `artifacts/gym-refinement/calendar-browser.log` |
| Regresiones generales de navegador | 44 aprobadas, 0 fallidas | `artifacts/gym-visual-v2/browser-general.log` |
| `npm run lint` | Salida 0; ESLint sin advertencias | `artifacts/gym-visual-v2/lint.log` |
| TypeScript, incluido en lint | `tsc --noEmit`, salida 0 | mismo log |
| `npm run build` final normal | Salida 0; Vite y PWA completados | `artifacts/gym-visual-v2/build.log` |
| `git diff --check` | Salida 0; sin errores de whitespace | `artifacts/gym-visual-v2/diff-check.log` |

La matriz final comprueba geometría de controles importantes (mínimo 44 × 44), ausencia de overflow de página, ausencia de mutaciones por visualizar estados y coincidencia de color del check estático con el progreso. Se inspeccionaron capturas finales de registro y descanso, escritorio/móvil, claro/oscuro. Las pruebas de interacción cubren foco de modales, cierre y retorno, completar/corregir/desmarcar, pausa/ajuste, guardado fallido/reintento y privacidad corporal activada/desactivada.

Los entornos visuales usan `--mode portable`, fixtures en memoria y `gymRefinementCloudConfigured === false`. Los casos de app compilada exigen un build identificable como `demo-lifeos`. Los contextos bloquean solicitudes externas y no usan cuentas reales; los fixtures de app están en contextos efímeros. El build normal final no se ejecutó contra Firebase. No se hicieron operaciones sobre datos reales.

## Integridad y límites

Se preservaron callbacks, condiciones, IDs, snapshots, peso/repeticiones, finalización, referencias anteriores, récords, marcas temporales, persistencia y origen de los descansos. Las pruebas unitarias incluyen contratos de merges, historial y temporizadores; no se reejecutó el emulador en V2 porque no cambió código de sincronización, protocolo ni Rules. No debe presentarse la verificación de emulador de la intervención anterior como una ejecución nueva.

Dos expectativas de pruebas detectaron los cambios intencionales de presentación: etiqueta «Apx» y encogimiento del calendario vacío. Se actualizaron para comprobar el diseño solicitado, manteniendo los contratos funcionales. Un primer pase de privacidad del harness encontró una carrera al leer el DOM inmediatamente después de apagar privacidad; se corrigió la espera del test, conservando las verificaciones de importes y atributos.

El build conserva la advertencia de chunks superiores a 500 kB. `git diff --check` informa advertencias de conversión LF/CRLF en Windows, con salida 0 y sin errores de whitespace. No se modificó la configuración de build o finales de línea para ocultarlas.

Las capturas y pruebas no certifican comodidad durante una sesión física real ni sustituyen la evaluación visual del usuario. El carrusel de series conserva su scroll interno cuando hay más series que ancho; la página no adquiere scroll horizontal. El selector nativo de rutina puede abreviar nombres largos dentro de su campo; el CTA conserva el nombre completo. No se creó un selector nuevo para resolverlo.

La rama y HEAD siguen iguales. No se tocaron `.taste-skill/` ni `docs/finance-parent-revision-proposal.patch`. No se ejecutaron commits, merges, cambios de rama, migraciones ni despliegues.

## Dictamen

**GO para revisión local de esta V2.** Hay una corrección visible de composición, tamaño y coherencia, con regresiones funcionales aprobadas. La aprobación visual corresponde al usuario; no se declara aprobación para integrar ni publicar.

Revisión interactiva aislada: <http://127.0.0.1:5341/tests/gym-refinement/browser.html?state=rest&theme=dark>. Entrada: <http://127.0.0.1:5341/tests/gym-refinement/browser.html?state=idle&theme=light>. Los datos son sintéticos y se reinician al recargar; no hay conexión de nube configurada.
