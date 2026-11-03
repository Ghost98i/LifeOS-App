# Gimnasio: cierre funcional y experiencia completa

Fecha: 2 de noviembre de 2026. Rama conservada: `feat/gimnasio-refinement-2026-11`. HEAD: `e97e8c5da8bf4d5cd8b0966f565cdc59e45021f3`.

## Resultado

Se recorrió la aplicación compilada con datos sintéticos en 1440 × 900, 390 × 844 y 375 × 812, en claro y oscuro. Se corrigieron fallos de conservación de planificación, referencias históricas y confirmación de guardados. La V2 se conserva: no se editaron estilos, imágenes, SVG, Lottie, animaciones, recursos compartidos o créditos.

No se accedió a información privada ni a Firebase de producción. No se modificó Finanzas, su worktree, modelos globales, persistencia, cifrado, Rules ni protocolo de sincronización. No se hicieron commits, merges, cambios de rama ni despliegues.

## Defectos encontrados y corregidos

| Defecto y reproducción | Corrección | Protección |
|---|---|---|
| Eliminar un ejercicio de una rutina mostraba «Ejercicio eliminado de la plantilla» aunque localStorage rechazara la escritura. El registro seguía existiendo. | El mensaje requiere guardado confirmado y eliminación efectiva. | Rechazo/reintento en la app real, en seis combinaciones de viewport/tema. |
| Cambiar solo la cantidad de series de un plan heterogéneo sobrescribía cargas y repeticiones con las de la primera serie y eliminaba `type: 'warmup'`. | `configureGymTemplateExercise` admite cambios parciales. La interfaz envía solo el campo editado; se conservan objetivos, tipos e IDs de las series existentes. Las series nuevas reciben sus propios IDs y siguen pendientes. | Pruebas unitarias de edición parcial, edición conjunta y roundtrip; caso real 20 × 12 de aproximación / 60 × 8 efectiva. |
| «Guardar como plantilla» eliminaba las aproximaciones y forzaba `timerEnabled: true`. | Se copian el tipo de serie y la preferencia de descanso existentes. No se copia trabajo completado como si ya estuviera realizado en la plantilla. | App real: estado original intacto, nuevas series pendientes, descanso personalizado conservado. |
| La misma acción asignaba una identidad nueva a un ejercicio conocido y cortaba su referencia anterior. El consumidor histórico compara IDs cuando ambos registros los tienen. | El ejercicio reutiliza `ex.id` como ya hace «Duplicar rutina». Solo un ejercicio heredado sin ID recibe uno. La plantilla y sus series siguen teniendo IDs nuevos y objetos independientes. | Reproducción adicional previa: `before-identity.json` registra ID diferente y referencia ausente. Después, finalizar la sesión fuente e iniciar la plantilla guardada muestra «Última vez» con sus valores reales. No se fusionan ejercicios por nombre. |
| Una carga explícita de cero se interpretaba como ausencia y se sugerían 20 kg al iniciar la rutina o agregar la primera serie a un ejercicio sin series. | Se distingue cero finito de dato ausente/no finito en los fallbacks de cargas planificadas. | Tres reproducciones unitarias previas; carga corporal cero en el ciclo real y pruebas de conservación del fallback de 20 cuando falta información. |
| Reducir un descanso de 20 s a cero ejecutaba dos actualizaciones anidadas: la segunda restauraba el timer anterior. Un salto rechazado también cambiaba de ejercicio antes de guardar. | Ajuste y limpieza usan una sola actualización. La navegación ocurre después de un resultado positivo. | App real: una escritura, timer eliminado, serie pendiente intacta. Rechazo/reintento sin avance prematuro. |
| Un descanso vencido perdía su superficie de acción aunque su eliminación no se hubiera guardado. La finalización automática podía anunciar éxito pese al rechazo. La edición manual del tiempo cerraba el diálogo al fallar. | El timer pendiente de limpiar conserva su acción existente a 00:00. No se anuncia éxito ante `false`. Se permite reintento manual sin repetir escrituras automáticamente en cada tick. El diálogo y su valor permanecen ante rechazo; minimizar también respeta el resultado del guardado. | App real: expiración con fallo, ausencia de éxito falso, reintento sin completar una serie y edición manual 47 s rechazada/recuperada. |
| Duplicar una rutina dejaba abierto el menú original, que interceptaba clics sobre las acciones de la copia. | Tras duplicación confirmada se cierra ese menú y se devuelve el foco a su summary. Ante rechazo no se finge una duplicación. | Intercepción observada durante el recorrido; ciclo final sin clics forzados y aserción de foco/menú cerrado. |
| El resumen de una sesión con solo aproximaciones mostraba cero volumen pero felicitaba por «acumular volumen». | Se identifica «Volumen efectivo» y se confirma el registro de series sin atribuir un logro numérico inexistente. | SSR de sesión con aproximación realizada y serie efectiva pendiente; resumen real en ambos temas y tamaños. No cambia el valor calculado. |

No se modificaron fórmulas de volumen, récords, progreso o composición corporal. El cambio en `gymMetrics.ts` está limitado a construir sugerencias/cargas iniciales: conserva el cero que ya figuraba en la planificación. No cambia registros históricos ni sus cifras.

## Flujos existentes comprobados

| Área | Comprobación y resultado |
|---|---|
| Rutinas | Creación con rechazo y reintento, conservación del nombre, edición de objetivos, incorporación de ejercicios con borrador retenido, orden, duplicación independiente, cancelación y confirmación de eliminación. No se creó otro editor. |
| Planificación | Las pruebas existentes de launcher/calendario y las regresiones offline preservan selección manual, rutina contextual y ausencia de escrituras automáticas al navegar. No se cambiaron días ni rutinas predeterminadas. |
| Inicio y continuación | Carga cero conservada, sesión activa única, «Continuar entrenamiento», salida sin finalizar, recarga y reanudación con el mismo ID. Una rutina o sus cambios no sustituyen el snapshot de la sesión. |
| Series | Registro, cambio a aproximación, corrección, desmarcado con limpieza de `completedAt`, nuevo registro offline y posterior recarga. Una carga sugerida sigue pendiente hasta completarla. |
| Descansos | Pausa/recarga exacta en la regresión previa de app; ajustes, origen al navegar, salto con fallo/reintento, limpieza a cero y tiempo manual con conservación del formulario. No se modificó el motor de referencias temporales. |
| Finalización | Una sesión sin trabajo no se finaliza. Una sesión con trabajo real se finaliza según el contrato existente, conserva sus pendientes y muestra el resumen solo después de guardar. Su timer se limpia sin completar otras series. |
| Historial | Sesión terminada visible, ejercicios y series preservados, IDs independientes de la plantilla. Eliminar la rutina durante la sesión no modifica su snapshot. |
| Récords y progreso | Pruebas de `gymMetrics`, `gymHistory`, `gymStreakAudit`, `gymIncident` y relacionadas: trabajo efectivo, aproximaciones, empates, pendientes, legado, recuento por sesión, referencias y períodos insuficientes. En la app se verificó además una evolución real sintética de 50 a 65 kg en dos períodos; el panel existente de récords excluyó valores mayores procedentes de aproximaciones, series pendientes y una sesión futura. Consultarlo no escribió cambios en el historial. |
| Composición corporal | Registro pareado de peso/cintura, fallo con formulario retenido y reintento; visualizaciones existentes con perfil sintético. Regresiones de cálculo, ausencia de datos y privacidad corporal en la suite del módulo. No se añadieron diagnósticos ni recomendaciones. |
| Persistencia y recuperación | Edición offline sobre la app abierta, recarga sin duplicar la sesión ni perder el registro; arranque offline con SW/caché en las suites existentes; normalización, backup y aplicación del módulo con tipos/carga cero preservados. |
| Sincronización | Suite de merges/tombstones/revisiones y emulador de dos escritores: un ganador, rechazo del competidor y reintento reconciliado conservando ambas sesiones. El timer sigue siendo local y queda fuera del módulo publicado. |
| Accesibilidad | Nombres accesibles existentes, foco de diálogos y tras duplicar, teclado móvil, controles críticos de 44 px y ausencia de overflow. La regresión de app comprueba que los controles fijos no cubran el CTA o el formulario de descanso. |

## Evidencia y resultados reales

Reproducción anterior a las primeras correcciones:

- [Tres fallos unitarios iniciales](../artifacts/gym-functional-closure/before-unit.log).
- [Observaciones del build previo](../artifacts/gym-functional-closure/before/results.json): falsa eliminación, tipos/permisos de descanso perdidos, objetivos sobrescritos, dos escrituras y avance pese al rechazo.
- [Corte de identidad histórica antes de corregirlo](../artifacts/gym-functional-closure/before-identity.json) y [aserción fallida correspondiente](../artifacts/gym-functional-closure/before-identity.log).

| Validación | Resultado final | Evidencia |
|---|---|---|
| Nuevas regresiones unitarias | 6 aprobadas | `artifacts/gym-functional-closure/targeted.log` |
| Suite específica de Gimnasio y composición corporal | 242 aprobadas, 0 fallidas | `artifacts/gym-functional-closure/gym-unit.log` |
| `npm test` completo | 1401 aprobadas, 0 fallidas, 0 omitidas | `artifacts/gym-functional-closure/npm-test.log` |
| Flujos completos sobre app compilada | 6/6 combinaciones: 1440/390/375 × claro/oscuro; múltiples operaciones y verificaciones por combinación | `artifacts/gym-functional-closure/after/results.json` y `browser.log` |
| Progreso histórico y panel de récords sobre app compilada | 6/6, mismos tamaños/temas; comparación por período y exclusión de datos no elegibles | `artifacts/gym-functional-closure/progress/results.json` y `progress.log` |
| Regresiones previas sobre app compilada | 6/6 | `artifacts/gym-functional-closure/app-regressions.log` |
| Launcher offline | 4/4 | `artifacts/gym-functional-closure/offline-launcher.log` |
| Actividad/historial offline y SW | 10/10 | `artifacts/gym-functional-closure/offline-calendar.log` |
| Matriz visual V2 y teclado | 36 estados y 4 casos móviles aprobados | `artifacts/gym-functional-closure/visual/results.json` |
| Concurrencia Auth/Firestore Emulator | 1 aprobada, 0 omitidas | `artifacts/gym-functional-closure/emulator.log` |
| Lint y TypeScript | Salida 0; `eslint --max-warnings 0` y `tsc --noEmit` | `artifacts/gym-functional-closure/lint.log` |
| Build | Salida 0, Vite y PWA completados | `artifacts/gym-functional-closure/build.log` |
| `git diff --check` | Salida 0 | `artifacts/gym-functional-closure/diff-check.log` |

El build mantiene su advertencia de chunks superiores a 500 kB. El emulador de Node informa que no dispone de IndexedDB y utiliza caché en memoria; su prueba terminó aprobada. Un intento inicial con puertos alternativos fue rechazado por el guard existente: se respetó ese guard, se verificó que los puertos requeridos estaban libres y se ejecutó allí. No se modificó la protección para aceptar otra configuración.

La prueba antigua de cockpit esperaba volver al registro apenas venciera el timestamp, incluso si aún existía el timer. Se actualizó para proteger el reintento pendiente a 00:00 y la ausencia de finalización automática de series. La prueba siguiente continúa comprobando el registro después de una limpieza confirmada. No se cambiaron expectativas numéricas para ocultar errores.

Los nuevos tests de navegador usan contextos efímeros, almacenamiento sintético, un build verificable como `demo-lifeos` y bloqueo de toda petición externa. Los fixtures visuales usan modo portable con nube desactivada. No se usaron cuentas reales. Las capturas del recorrido están en `artifacts/gym-functional-closure/after/`: resumen, historial, mediciones y ajuste de descanso para cada viewport/tema.

La dirección visual se conserva: los 36 PNG del fixture V2 comparados con la revisión visual final previa son idénticos byte a byte. [Comparación](../artifacts/gym-functional-closure/visual-preservation.json). El resumen incorpora únicamente las aclaraciones textuales descritas; no se retocaron superficies, colores ni recursos.

## Archivos modificados en esta intervención

- `src/components/GimnasioView.tsx`: resultados de guardado, avance posterior al commit, edición parcial de objetivos, copia de tipos/descanso/identidad lógica y cierre del menú de duplicación.
- `src/components/ActiveWorkoutView.tsx`: contrato booleano compatible para finalización del descanso, ausencia de éxito falso y acción de reintento cuando la limpieza no se guardó.
- `src/components/GymRestTimerBar.tsx`: actualización sin anidar guardados, reintento y conservación de edición/minimización ante fallo.
- `src/components/WorkoutSummaryModal.tsx`: dos textos que distinguen volumen efectivo y trabajo registrado.
- `src/lib/gymFlows.ts`: configuración parcial de series y preservación de carga cero al agregar la primera.
- `src/lib/gymMetrics.ts`: fallback de carga inicial que distingue cero de ausencia.
- `src/lib/gymCockpitUnified.test.ts`: contrato de descanso vencido todavía pendiente de limpiar.
- `src/lib/gymFunctionalClosure.test.ts`: seis regresiones nuevas de integridad/presentación y roundtrip.
- `scripts/test-gym-functional-app.mjs`: recorrido real completo y reproducciones con fallos sintéticos.
- `docs/gym-functional-closure.md`: este informe.

El resto de los cambios que figuran en Git ya existían al comenzar y se preservaron. La comparación SHA-256 de todo `src` lo distingue: [source-preservation.json](../artifacts/gym-functional-closure/source-preservation.json). No se editaron `.taste-skill/` ni `docs/finance-parent-revision-proposal.patch`.

## Límites y decisiones de producto separadas

- El editor actual aplica repeticiones/carga como objetivos generales del ejercicio. Ahora editar otra propiedad conserva los objetivos heterogéneos que ya existían. Un editor individual por serie sería una capacidad nueva; no se agregó.
- Las plantillas antiguas que ya quedaron con una identidad distinta no se reparan ni se vinculan al historial por coincidencia de nombre. Una recuperación o vinculación manual requiere una decisión posterior y evidencia suficiente. La corrección evita nuevos cortes al guardar una sesión como plantilla.

Se conserva también la política existente de recuperación de rutinas heredadas con todos los flags de timer en falso y sin un modo explícito de descanso desactivado; sus pruebas permanecen vigentes. No se introdujo una migración ni otra interpretación de esos históricos.

Los formularios con borrador comprobados conservan sus entradas ante rechazo. Los controles de guardado inmediato siguen el contrato existente: ante fallo conservan el último valor confirmado; no se creó un sistema adicional de borradores para cada campo inline. Los datos ya guardados localmente permanecen disponibles para reconexión.

No se certificó el comportamiento de una sesión física prolongada con suspensión del sistema operativo en dispositivos reales ni un ensayo de interfaz simultáneo en dos teléfonos. Se verificaron referencias temporales/recarga y concurrencia por pruebas automatizadas y emuladores, sin atribuirles ese alcance mayor.

## Dictamen

**GO funcional para revisión local y validación cotidiana.** Los defectos reproducidos tienen correcciones y regresiones; no quedan fallos funcionales sin explicar en las rutas verificadas. Gimnasio conserva la V2 y sus capacidades existentes.

La restauración de vínculos históricos ya perdidos y las capacidades nuevas descritas quedan fuera de esta intervención. No bloquean el funcionamiento normal comprobado ni autorizan modificaciones automáticas de datos. No se publica nada.
