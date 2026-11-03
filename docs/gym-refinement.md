# Gimnasio: auditoría y refinamiento

> La versión visual descrita en este informe fue rechazada por el usuario (NO-GO). El dictamen visual anterior queda sustituido por [Refinamiento visual V2](gym-visual-v2.md). Este documento conserva la evidencia funcional de la primera intervención; no representa aprobación del diseño rechazado.

Fecha: 2 de noviembre de 2026. Base verificada: `e97e8c5da8bf4d5cd8b0966f565cdc59e45021f3`. Rama conservada: `feat/gimnasio-refinement-2026-11`.

## 1. Estado inicial y contratos

Gimnasio ya tenía un workspace único para registrar una sesión, rutinas semanales, entrenamiento libre, reanudación, historial editable, calendario, récords, evolución, calculadora de discos y mediciones corporales. No se reconstruyeron esas capacidades.

- `GymSession` contiene snapshots de ejercicios y series, independientes de la plantilla. `status`, `completed` y las marcas temporales determinan el trabajo realizado.
- `gymFlows` gestiona inicio, reanudación, finalización, descarte y correcciones. Las rutinas vacías ya estaban bloqueadas en la interfaz y el inicio reanuda una sesión existente.
- `gymMetrics` distingue series de aproximación/efectivas, última ejecución/mejor serie, datos heredados y trabajo pendiente. El volumen efectivo excluye aproximaciones; los récords requieren trabajo realizado y mejora real.
- `GymActiveTimer` utiliza `endsAt`, origen de sesión/ejercicio/serie y referencias de pausa. El temporizador es local; `syncModel` lo excluye del módulo publicado y conserva el temporizador del dispositivo al aplicar datos remotos.
- `App.updateState` prepara un borrador, valida y guarda. Devuelve `false` si rechaza la operación. Solo después de guardar confirma el estado y prepara sincronización. No se modificó ese contrato.
- `gymSync`, tombstones, revisiones, conflictos, normalización, copias y restauración ya tenían pruebas. Se conservaron sus implementaciones; en `gymMigration.ts` cambiaron únicamente cinco etiquetas de selectores.

Estado inicial de Git: solo `.taste-skill/` y `docs/finance-parent-revision-proposal.patch` estaban sin seguimiento. No se escribieron ni restauraron esas rutas. El commit base y la rama permanecen iguales.

## 2. Problemas comprobados y evidencia

| Hallazgo | Clasificación y evidencia | Resolución |
|---|---|---|
| La referencia anterior y «Copiar» quedaban recortados en móvil | Observado en capturas y geometría. La página podía no tener overflow global y aun así recortar esa fila | Referencia con ancho flexible, texto multilínea y acción con ancho mínimo de 44 px |
| Paginación y herramientas medían 28 px de alto; los paginadores se estrechaban a unos 25 px a 375 px | Medición real. Las clases `min-h-11` no alcanzaban porque el CSS específico imponía 28 px | Dimensiones efectivas de 44 × 44 px, sin encoger; etiqueta de paginación adaptada al ancho |
| Nombres de rutinas y sesiones se truncaban; la carga se repetía en cabecera y editor | Observación visual; reducir duplicación es una decisión UX | Nombres completos, carga en un solo contexto y próximo ejercicio en el resumen existente |
| «Primera sesión» se deducía de no tener una referencia para una serie concreta | Condición confirmada en código | «Sin referencia para esta serie». La mejor serie anterior se conserva aunque no haya referencia para ese índice |
| Palabras aisladas asignaban equipamiento incorrecto | Reproducción ejecutando el registro original del release | Coincidencias completas y conservadoras; equipo estructurado compatible y fallback neutral |
| El título de la rutina prevalecía sobre sus grupos musculares registrados | Condición confirmada en código | Contenido estructurado primero; empate o falta de evidencia: identidad neutral; personalización explícita sigue prevaleciendo |
| Una finalización inválida borraba el descanso | Reproducción en copia del release: la sesión seguía `active` pero el temporizador quedaba `null` | Se eliminó el borrado redundante de la vista. La función existente limpia únicamente el temporizador de una finalización válida de esa sesión |
| Guardados rechazados podían anunciar éxito y limpiar formularios | Reproducción: rutina inexistente con «Plantilla creada»; medición no guardada con «Guardado» y formulario cerrado | Se respeta el resultado booleano antes de anunciar éxito, cerrar o avanzar. Se conservaron campos para reintento |
| Stream Guard desenfocaba composición corporal pero dejaba sus cifras en el DOM; otros resúmenes corporales tampoco las protegían | Reproducción: valores presentes con `filter: blur(8px)` | Reutilización de `PrivacyAmount`, `PrivacyInput` y contexto existentes. Sin cifras en DOM/atributos mientras están ocultas; gráfico corporal no renderizado con privacidad activa |
| Los diálogos no encerraban el foco y algunos cierres/interruptores eran pequeños | Código y navegación por teclado | Hook compartido `useDialogFocus`, controles de 44 px, nombres accesibles y retorno de foco |
| La barra real de móvil podía cubrir la acción de serie a 375 px | Descubierto en la prueba de la aplicación completa, no en el fixture aislado | Menor espaciado del editor y márgenes de desplazamiento para sus controles; navegación global intacta |
| El aviso global de fallo cubría parte del modal de ajustes | Captura real con rechazo sintético de almacenamiento | Los modales de Gimnasio usan la misma capa 130 que otros diálogos bloqueantes existentes; el error permanece visible dentro del modal |

Evidencia reproducible: `artifacts/gym-refinement/before/defects.json`, `icon-policy-comparison.json`, `before/results.json`, `after/results.json`, `comparison.json` y `app/results.json`.

Los ajustes de bordes, sombras y distribución son decisiones de diseño sustentadas por esas capturas; no constituyen una evaluación con usuarios reales.

## 3. Cambios implementados

### Sesión activa

- Se conserva un único editor y una única acción principal para la serie seleccionada.
- Peso y repeticiones mantienen unidades, steppers y valores existentes. Se quitaron dos contenedores interiores, sin ocultar sus controles.
- Se mantiene la diferencia entre referencia/sugerencia y ejecución: consultar o copiar valores no completa la serie.
- Las series anuncian selección mediante `aria-pressed`; realizada/pendiente y aproximación/efectiva conservan su significado.
- Se muestra el nombre completo de sesión y ejercicio. La lista existente permite navegar sin truncar los nombres.
- El descanso conserva pausa, ajustes, salto, origen y continuación. Los ajustes rápidos respetan ahora la preferencia existente también dentro del workspace activo.
- El contador activo usa semántica `timer` sin anunciar cada segundo como una nueva notificación. El motor temporal no cambió.
- La barra minimizada queda en el flujo del editor y sus controles mantienen 44 px; no tapa los campos.
- Una serie cuyo guardado falla no se marca, no crea descanso y no adelanta la selección a la siguiente serie.

### Rutinas, historial y recuperación

- Rutinas largas legibles; acciones separadas de la selección en móvil. Rutina vacía, elegida y asignada para hoy siguen diferenciadas.
- Selector de íconos con superficies de 44 px, selección anunciada y navegación con flechas, Inicio y Fin.
- Creación y duplicación no anuncian éxito si falla el guardado. Un reintento crea una única rutina. El agregado de ejercicios conserva el texto cuando se rechaza.
- También se revisó la confirmación de eliminación, descarte, guardado desde sesión, peso y mantenimiento explícito del historial: sus mensajes de éxito dependen de guardar.
- El historial conserva sus resúmenes y editor existentes. Se corrigió el uso ambiguo de `k` por `kg`, sin cambiar cifras.
- Historial, resumen final, calculadora y ajustes reutilizan el foco de diálogo existente. El resumen vuelve al selector cuando la acción de finalizar ya desapareció.

### Peso y composición

- Misma fórmula de RFM, masa grasa/magra, FFMI e IMC; mismas fechas y registros. Sigue la aclaración de que son estimaciones, no mediciones clínicas.
- Si faltan datos, se conserva la explicación de qué falta. No se crean valores ni curvas nuevas.
- Stream Guard protege peso, cintura, IMC, clasificación y estimaciones corporales, incluidos resúmenes y campos. Conserva revelado voluntario donde corresponde y recupera los valores al desactivarlo.
- Un fallo de guardado de medición o ajustes conserva campos y muestra un error local. El reintento se verificó sin duplicados.

## 4. Sistema de íconos encontrado y decisiones

El catálogo existente contiene **22 SVG locales y un fallback neutral**, definidos en `gymIconRegistry.ts` y renderizados por `GymIcon` mediante máscaras. `GymExerciseArtwork` ya era un wrapper de ese catálogo. Las acciones utilizan `AppIcon`; se mantuvo esa separación entre pictogramas de equipamiento y controles de interfaz.

No se añadió ninguna biblioteca, SVG ni descarga externa. No se modificaron geometrías ni archivos del catálogo. Se reutilizaron los recursos existentes para rutinas, ejercicios, historial y lanzamiento; el botón de inicio refleja ahora el ícono automático o personalizado de la rutina elegida.

Ejemplos ejecutados contra el registro del release y el corregido:

| Nombre / información | Antes | Ahora |
|---|---|---|
| Bicicleta abdominal, sin equipo registrado | Bicicleta | Neutral |
| Cinta elástica | Caminadora | Neutral |
| Extensión de tríceps en polea alta, equipo `polea` | Jalón al pecho | Polea |
| Sentadilla búlgara, sin equipo registrado | Rack | Neutral |
| Fondos entre bancos | Paralelas | Neutral |
| Press banca, equipo `barra` | Press banca | Press banca |
| Curl de bíceps, equipo `mancuerna` | Mancuerna | Mancuerna |

La mayoría muscular registrada puede orientar el ícono automático de una rutina; no representa una afirmación sobre el equipamiento de todos sus ejercicios. Un empate o nombre ambiguo no genera una categoría específica. Tener equipo conocido tampoco habilita inferencias musculares débiles por palabras sueltas. Una elección personalizada gana, volver a automático elimina la personalización y duplicar mantiene una copia independiente. Los identificadores antiguos siguen soportados. Un identificador desconocido, incluso uno similar a propiedades de prototipo, no rompe la vista. Un SVG que no carga muestra el fallback.

**Licencias:** el README y el registro del catálogo preexistente todavía marcan verificación pendiente. `adjustable-bench.svg` conserva atribución incorporada y `pull-ups.svg` requiere revisión específica. No se certificó esa licencia ni se incorporaron recursos nuevos. Es una deuda preexistente que debe quedar visible en la revisión.

## 5. Textos principales

| Antes | Ahora | Significado preservado |
|---|---|---|
| PRs | Historial | Abre ejecuciones anteriores y marcas, no solamente récords |
| Primera sesión | Sin referencia para esta serie. | Ausencia de referencia para ese índice, sin negar historial existente |
| Plantilla creada. | Rutina creada. | Confirmación solo después de guardar |
| Plantilla duplicada con identidad independiente. | Rutina duplicada. | Copia independiente, sin explicación técnica permanente |
| Entrenamiento iniciado con tu historial más reciente. | Entrenamiento iniciado. Las cargas son sugeridas hasta que completes cada serie. | Inicio no equivale a trabajo realizado y también puede ser libre |
| El tiempo se mantiene sincronizado aunque salgas de Gimnasio. | El descanso sigue en este dispositivo aunque salgas de Gimnasio. | Persistencia local, sin afirmar sincronización del temporizador |
| Define el tiempo restante. El deadline se actualizará desde ahora. | Elegí cuánto descanso queda. El tiempo se contará desde ahora. | Ajusta el tiempo restante desde el momento actual |
| 70k / volumen en k | 70 kg / volumen en kg | Misma cantidad, unidad inequívoca |

Se sustituyeron emojis en controles/opciones visibles por los íconos existentes o texto. Los campos históricos, cálculos, identificadores y preferencias no se reescribieron para conseguir estos textos.

## 6. Escritorio y móvil

Instrument Sans, índigo `#4F46E5` y temas existentes conservados. Se quitaron sombras y fondos interiores que competían con el registro, sin crear tarjetas, pestañas ni métricas.

Medidas del fixture comparable, tema claro, redondeadas a un decimal:

| Ancho | Cabecera del ejercicio antes → después | Editor de registro antes → después | Bloque de descanso antes → después |
|---|---:|---:|---:|
| 1440 | 215,5 → 233,9 px | 349,3 → 328,3 px | 487,4 → 447,4 px |
| 390 | 285,8 → 233,9 px | 349,3 → 328,3 px | 487,4 → 447,4 px |
| 375 | 283,3 → 231,4 px | 349,3 → 328,3 px | 487,4 → 447,4 px |

En escritorio la cabecera crece para alojar controles efectivos de 44 px. En móvil se reduce unos 52 px. La posición de la acción de registro queda prácticamente igual en el fixture largo, pero ahora se leen tanto el título como la referencia completa. No se presenta como una reducción de toda la pantalla: preservar información puede requerir más líneas.

No hubo overflow horizontal de página en los casos comprobados. La tira de muchas series y la tabla del editor histórico conservan desplazamiento interno deliberado. No se impusieron alturas rígidas para ocultar texto.

Además del fixture se probó la aplicación completa a los tres tamaños, con la barra real presente. Se verificó el centro y los cuatro bordes de la acción de serie mediante hit-testing, recarga de la serie realizada y restauración exacta de un descanso pausado. Se reprodujo un rechazo real de `localStorage` sintético en ajustes y se comprobó que los controles y el reintento siguieran operables.

El contraste medido en texto de los controles principales revisados superó 4,5:1 en ambos temas; en los casos registrados el mínimo fue superior a 6:1. Esto no equivale a certificar toda la aplicación ni todos los estados de accesibilidad.

## 7. Capturas y evidencia

Los originales se capturaron antes de editar y se repitieron con una copia aislada del código del release y los mismos datos sintéticos. La copia está en `artifacts/gym-refinement/release-before`; no se restauró ningún archivo del workspace.

| Superficie | Antes | Después |
|---|---|---|
| Sesión activa, escritorio claro | [Antes](../artifacts/gym-refinement/before/1440-light-active.png) | [Después](../artifacts/gym-refinement/after/1440-light-active.png) |
| Sesión activa, móvil claro | [Antes](../artifacts/gym-refinement/before/375-light-active.png) | [Después](../artifacts/gym-refinement/after/375-light-active.png) |
| Descanso, móvil oscuro | [Antes](../artifacts/gym-refinement/before/390-dark-rest.png) | [Después](../artifacts/gym-refinement/after/390-dark-rest.png) |
| Rutinas | [Antes](../artifacts/gym-refinement/before/375-light-routines.png) | [Después](../artifacts/gym-refinement/after/375-light-routines.png) |
| Historial | [Antes](../artifacts/gym-refinement/before/1440-dark-history.png) | [Después](../artifacts/gym-refinement/after/1440-dark-history.png) |
| Progreso | [Antes](../artifacts/gym-refinement/before/390-dark-progress.png) | [Después](../artifacts/gym-refinement/after/390-dark-progress.png) |

Todas las rutas de esta tabla parten de `artifacts/gym-refinement/`. Allí también están `after/*-exercise-history.png`, `after/*-routine-editor.png`, `after/*-completed.png`, `after/*-body-composition.png` y `after/*-icons.png`.

La prueba con navegación real añade `app/*-active.png`, `app/*-hit-test.png`, `app/*-rest-source.png` y `app/375-dark-settings-error.png`. `before/app-375-footer-overlap.png` documenta el solapamiento detectado durante QA antes del último ajuste; no se lo presenta como una captura del release original.

## 8. Archivos modificados

Producción:

- `src/components/ActiveWorkoutView.tsx`: jerarquía operativa, referencias, nombres, selección accesible y preferencia de ajustes rápidos.
- `src/components/GimnasioView.tsx`: adaptación de rutinas/historial, privacidad corporal, nombres de campos y confirmaciones dependientes del guardado.
- `src/components/GymWorkoutLauncher.tsx`: ícono de la rutina elegida usando el registro existente.
- `src/components/visual/GymIcon.tsx`: fallback ante identificador o recurso inexistente.
- `src/components/ExerciseHistoryModal.tsx`: lectura, unidades, cierre y foco.
- `src/components/WorkoutSummaryModal.tsx`: foco y capa de diálogo.
- `src/components/GymPlateCalculator.tsx`: cierre, foco y capa, sin modificar cálculo de discos.
- `src/components/GymRestSettingsModal.tsx`: foco, controles y recuperación del guardado.
- `src/components/GymRestTimerBar.tsx`: microcopy local, foco del editor existente y capa.
- `src/components/BodyCompositionCard.tsx`: privacidad, recuperación y cabecera móvil.
- `src/lib/gymIconRegistry.ts`: reconocimiento conservador y lookup seguro.
- `src/lib/gymAppearance.ts`: identidad automática sustentada en contenido, sin escritura de datos.
- `src/lib/gymMigration.ts`: solo etiquetas visibles de cinco opciones; funciones de migración intactas.
- `src/styles/gymCockpit.css`: estilos locales de sesión, controles, foco y márgenes de desplazamiento.

Pruebas y documentación:

- Nuevo `src/lib/gymRefinement.test.ts`: diez regresiones de presentación, identidad, recursos y privacidad.
- `src/lib/gymAppearance.test.ts` y `src/lib/gymCockpitUnified.test.ts`: expectativas de identidad neutral y texto veraz; ninguna expectativa numérica cambiada.
- Nuevos `tests/gym-refinement/browser.html` y `fixture.tsx`.
- Nuevos `scripts/test-gym-refinement.mjs` y `scripts/test-gym-refinement-app.mjs`.
- Este informe. Logs, capturas, copia comparativa y scripts de orquestación quedan en `artifacts/gym-refinement/`.

No cambiaron `App.tsx`, `types.ts`, `storage.ts`, `gymFlows`, `gymMetrics`, `gymSync`, `syncModel`, cifrado, Rules, Finanzas, Hoy, Quick Capture ni las utilidades de meses calendario. Tampoco se modificaron dependencias ni archivos de íconos.

## 9. Pruebas y resultados

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Baseline general | 1.383 aprobadas, 0 fallidas | `baseline-unit.log` |
| `npm test` final | **1.393 aprobadas, 0 fallidas, 0 omitidas** | `npm-test.log` |
| Gimnasio y composición corporal dirigidas | **234 aprobadas, 0 fallidas** | `gym-unit.log` |
| Matriz nueva del fixture | **48 casos aprobados**: 42 estados visuales y seis recorridos de interacción | `after-run.log`, `after/results.json` |
| Aplicación completa | **6 casos aprobados**; barra fija, recarga, timer pausado y modal con fallo/reintento | `app-browser.log`, `app/results.json` |
| Launcher existente | **10 combinaciones responsive/tema + 14 casos de día**; medianoche/zona horaria y cero escrituras automáticas | `launcher-browser.log` |
| Calendario existente | **8 casos aprobados** | `calendar-browser.log` |
| PWA: inicio y reanudación offline | **4 casos aprobados** | `offline-launcher.log` |
| PWA: calendario e historial offline | **10 casos aprobados** | `offline-calendar.log` |
| Hoy y Quick Capture | **17 casos aprobados**, sin solicitudes externas ni errores de página | `today-browser.log` |
| Suite general de navegador | **44 aprobadas, 0 fallidas**, incluido rechazo de build desactualizado | `general-browser.log` |
| Firestore/Auth emulados | **1 aprobada, 0 fallidas, 0 omitidas**: concurrencia, conflicto y reintento conservando ambas sesiones | `emulator-workspace-temp.log` |
| `npm run lint` | ESLint sin advertencias y `tsc --noEmit` aprobados | `lint.log` |
| `npm run build` | Aprobado; permanece el aviso existente de chunks mayores de 500 kB | `build.log` |
| `git diff --check` | Exit 0 | `validation.json` |

La matriz incluye edición, copia, completar/corregir/desmarcar series, descanso pausado y ajustes, navegación conservando origen, finalización inválida/válida, fallos de guardado después de preparar el borrador, reintentos únicos, duplicación/automático/personalizado, SVG faltante, privacidad DOM/atributos/revelado/desactivación y formularios corporales.

Se usaron Chromium/Brave, escritorio 1440 × 900 y móviles 390 × 844 y 375 × 812, ambos temas. Los fixtures nuevos se ejecutan con movimiento reducido; las pruebas de aplicación y PWA también ejercitan el comportamiento normal.

## 10. Integridad, persistencia y sincronización

- Los snapshots históricos de los fixtures se compararon antes/después de registrar, corregir, duplicar y cambiar apariencia: sin alteraciones.
- Guardados rechazados no crearon series realizadas ni nuevas rutinas; el reintento no duplicó registros. La finalización válida conserva las series pendientes como pendientes.
- El build real restauró una serie realizada y un temporizador pausado con el mismo `endsAt`, origen y tiempo restante. Navegar a otro ejercicio no reasignó el descanso.
- El emulador verificó que solo una publicación concurrente gana y que la perdedora reconcilia sin perder la sesión ganadora.
- La suite conserva pruebas de migración heredada, respaldos, métricas, empates de récords, sincronización, revisiones y tombstones. No se creó una migración ni se alteraron cálculos para acomodar la presentación.
- Las protecciones financieras y las regresiones de Hoy, Quick Capture y meses calendario siguen incluidas en la suite general.

## 11. Aislamiento y dificultades de validación

El fixture monta `GimnasioView` directamente, con almacenamiento de prueba en memoria y `storageUserId: null`. Vite portable desactiva Firebase; cada caso comprueba `cloudSyncConfigured === false`. Contextos nuevos, service workers bloqueados y toda solicitud ajena al origen local abortada. Las matrices comparables registraron cero solicitudes externas y cero errores de página.

Las pruebas de aplicación/PWA usan un build con variables explícitas del proyecto ficticio `demo-lifeos`, perfiles sintéticos y red externa bloqueada. El harness de aplicación verifica la configuración demo dentro del bundle y que no se empaqueten los fixtures. No se usaron sesiones ni datos reales.

Los emuladores usan únicamente Auth/Firestore locales y `--project demo-lifeos`. Java inicialmente no pudo establecer su socket loopback dentro del directorio temporal largo del sandbox de Windows. La prueba finalmente se ejecutó con un directorio temporal corto dentro de `artifacts/gym-jdk`, mediante una variable de entorno limitada al proceso. No se instaló software ni se modificó configuración persistente. El aviso de IndexedDB no disponible corresponde al SDK en Node y su fallback de caché en memoria, no a un fallo de la prueba.

## 12. Límites y riesgos pendientes

- Licencias del catálogo preexistente pendientes de verificar según su propia documentación. No se atribuyeron permisos nuevos.
- Los nombres deliberadamente no reconocidos usan el símbolo general de entrenamiento. Puede haber menos coincidencias específicas; no cambia el equipamiento registrado ni sus cálculos.
- La edición manual del descanso continúa en la barra existente fuera del workspace activo. No se creó un editor paralelo; el workspace mantiene pausa, ajustes rápidos y salto. Unificar ese acceso queda como oportunidad posterior.
- Los inputs que editan directamente una serie mantienen el contrato de autoguardado: un rechazo conserva el último valor guardado. No se añadió un sistema de borradores ni una nueva cola de persistencia.
- El editor histórico mantiene una tabla con scroll interno en móvil. Se ampliaron sus controles, sin reemplazarlo por otro editor.
- No se refactorizó el gran componente `GimnasioView`. La intervención no certifica todos los posibles cruces entre herramientas de mantenimiento ni recupera datos históricos dañados.
- No hubo estudio con personas, lector de pantalla real, teclado móvil físico ni pruebas en Safari/Firefox. No se afirma una mejora medida de velocidad de entrenamiento ni una certificación clínica o WCAG global.
- El aviso de tamaño de chunks sigue fuera de alcance.

## 13. Evaluación final

**GO para revisión funcional y visual local.** Las mejoras principales quedan implementadas y las pruebas ejecutadas no muestran regresiones. Conviene revisar especialmente una sesión con la rutina propia, las referencias anteriores, la selección de íconos y el descanso en móvil, manteniendo visible la deuda de licencias del catálogo.

No se hicieron commits, cambios de rama, publicaciones, operaciones sobre Firebase real ni reparaciones de datos. No se prepararon comandos de publicación.
