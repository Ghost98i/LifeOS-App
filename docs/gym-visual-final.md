# Gimnasio V2: revisión final de calidad visual

2 de noviembre de 2026. Rama comprobada y conservada: `feat/gimnasio-refinement-2026-11`. Base sin cambios: `e97e8c5da8bf4d5cd8b0966f565cdc59e45021f3`.

## Ajustes realizados

Se conserva la dirección de V2: superficie continua, reloj compacto, coherencia violeta, título de ejercicio dominante y resumen sin tarjetas adicionales. Esta revisión es puntual.

1. **Inicio de la próxima serie en escritorio:** el botón conserva el relleno índigo, texto, callback y altura de 48 px, pero pasa de 774 a 260 px de ancho en el fixture de 1440 px. Queda alineado con el contenido del próximo esfuerzo. La menor superficie coloreada reduce su competencia con el ejercicio. La reducción se aplica desde 1024 px; el botón para registrar una serie mantiene su presentación anterior.
2. **Series frente a volumen:** «1/6 series» pasa a «1/6 series realizadas». «0 kg realizados» pasa a «Volumen efectivo: 0 kg (sin aproximaciones)». El contador sigue incluyendo las aproximaciones completadas; el volumen sigue utilizando `getPerformedGymVolume`, que solo incluye trabajo efectivo completado. No se alteró esa función ni se sumaron aproximaciones al volumen para evitar mostrar un cero.
3. **Panel auxiliar:** el próximo ejercicio ocupa una línea de contenido independiente de la fila de título/contador/«Siguiente». Se ajustaron interlineado, separación y títulos de 13 px; en escritorio se alinea el panel con el contenido interior de la superficie de trabajo. Siguen existiendo las mismas acciones, lista y configuración, sin tarjetas nuevas.
4. **Móvil:** se conserva el CTA de ancho completo: 328 × 48 px en 390 y 313 × 48 px en 375. Se mantienen contorno para selección, fondo tenue/check para serie realizada y scroll interno del carrusel. No se encontró motivo para modificar el registro o el descanso compactos de V2. La línea secundaria de inicio/volumen continúa oculta en móvil por la regla preexistente; no se introdujo esa ocultación en esta revisión.

Las etiquetas de serie y el texto de volumen son presentación del estado existente. No se tocaron cálculos, funciones de cronómetro, persistencia, sincronización, privacidad ni confirmaciones de guardado.

## Capturas finales

[Galería de 12 capturas solicitadas](../artifacts/gym-visual-final/index.html): registro y descanso, claro/oscuro, en los tres viewports. Se generaron además los estados vacío, entrada, pausa y minimizado para completar la matriz de 36.

| Viewport y tema | Registro | Descanso |
|---|---|---|
| 1440 × 900, claro | [PNG](../artifacts/gym-visual-final/screenshots/1440-light-active.png) | [PNG](../artifacts/gym-visual-final/screenshots/1440-light-rest.png) |
| 1440 × 900, oscuro | [PNG](../artifacts/gym-visual-final/screenshots/1440-dark-active.png) | [PNG](../artifacts/gym-visual-final/screenshots/1440-dark-rest.png) |
| 390 × 844, claro | [PNG](../artifacts/gym-visual-final/screenshots/390-light-active.png) | [PNG](../artifacts/gym-visual-final/screenshots/390-light-rest.png) |
| 390 × 844, oscuro | [PNG](../artifacts/gym-visual-final/screenshots/390-dark-active.png) | [PNG](../artifacts/gym-visual-final/screenshots/390-dark-rest.png) |
| 375 × 812, claro | [PNG](../artifacts/gym-visual-final/screenshots/375-light-active.png) | [PNG](../artifacts/gym-visual-final/screenshots/375-light-rest.png) |
| 375 × 812, oscuro | [PNG](../artifacts/gym-visual-final/screenshots/375-dark-active.png) | [PNG](../artifacts/gym-visual-final/screenshots/375-dark-rest.png) |

Se inspeccionaron capturas finales representativas de ambos estados, ambos temas y ambos anchos móviles. La matriz automatizada mide las 36 combinaciones; inspeccionar capturas no sustituye la aprobación visual del usuario.

En el ejemplo con una aproximación completada, el escritorio muestra «1/6 series realizadas» junto a «Volumen efectivo: 0 kg (sin aproximaciones)». Es un cero real del volumen efectivo, no una afirmación de que la persona no realizó trabajo.

Comparación con la V2 previa: [antes](../artifacts/gym-visual-v2/after/1440-light-rest.png), [ahora](../artifacts/gym-visual-final/screenshots/1440-light-rest.png). Geometría completa en [comparison.json](../artifacts/gym-visual-final/comparison.json). Los diámetros del reloj permanecen en 84 px en escritorio y 76 px en móvil.

## Regresiones y comprobaciones

| Ejecución | Resultado | Evidencia |
|---|---|---|
| Pruebas de Gimnasio y composición corporal | 236 aprobadas, 0 fallidas | `artifacts/gym-visual-final/gym-unit.log` |
| `npm test`, con el fixture final tipado correctamente | 1395 aprobadas, 0 fallidas, 0 omitidas | `artifacts/gym-visual-final/npm-test.log` |
| Matriz visual | 36/36: 1440/390/375, ambos temas, seis estados | `artifacts/gym-visual-final/screenshots/results.json` |
| Selección e inicio por teclado en móvil | 4/4: 375/390, ambos temas; chip seleccionado visible, selección sin escritura y comenzar sin completar automáticamente | mismo JSON, `keyboardResults` |
| Interacciones de Gimnasio | 48/48, 0 errores de página, 0 solicitudes externas | `artifacts/gym-visual-final/interactions.log` |
| App compilada aislada | 6/6, tres viewports y ambos temas | `artifacts/gym-visual-final/app.log` |
| `npm run lint` | Salida 0, sin advertencias de ESLint | `artifacts/gym-visual-final/lint.log` |
| TypeScript, ejecutado por lint | `tsc --noEmit`, salida 0 | mismo log |
| `npm run build` | Salida 0, Vite/PWA completados; entorno demo explícito | `artifacts/gym-visual-final/build.log` |
| `git diff --check` | Salida 0 | `artifacts/gym-visual-final/diff-check.log` |

Se agregaron dos regresiones de presentación: solo aproximación completada y aproximación más serie efectiva completadas. Comprueban cantidad de series, volumen esperado, ausencia del ambiguo «kg realizados» y que el render no modifica la sesión. El fixture usa el contrato real `type: 'normal'` para las series efectivas y `type: 'warmup'` para aproximaciones.

El navegador verifica tamaño/foco visible del CTA contenido en escritorio y ancho completo en móvil, controles importantes de al menos 44 × 44, ausencia de overflow de página y ausencia de escrituras por renderizar estados. La suite de interacción conserva registro, edición y desmarcado, origen/pausa/ajuste del descanso, privacidad corporal, foco de modales, fallos de guardado y reintento. La app compilada comprueba además recarga de series/temporizador pausado y que la navegación fija no cubra los controles.

Los fixtures visuales funcionan en modo portable sin nube configurada; los de la app compilada exigen `demo-lifeos`. Todos los contextos son efímeros, bloquean solicitudes externas y no usan cuentas reales. No se accedió a Firebase real. No se reejecutó el emulador: esta ronda no modifica código ni contratos de sincronización.

El primer pase de TypeScript detectó una denominación incorrecta en el fixture nuevo (`effective`); se corrigió a `normal` y se repitieron lint/TypeScript y la suite completa. No se cambiaron expectativas financieras ni de entrenamiento para obtener resultados verdes. El build mantiene la advertencia de chunks superiores a 500 kB; no se modificó su configuración para ocultarla.

## Archivos de esta revisión

- `src/components/ActiveWorkoutView.tsx`: etiquetas de progreso/volumen, clase específica del CTA y distribución del próximo ejercicio en el panel.
- `src/styles/gymCockpit.css`: ancho responsive del CTA e integración tipográfica/espacial del panel.
- `src/lib/gymRefinement.test.ts`: dos regresiones para series realizadas y volumen efectivo.
- `scripts/test-gym-visual-v2.mjs`: salida configurable, geometría responsive y foco del CTA.
- `public/gym-icons/v1/README.md`: referencia al resultado de la investigación de licencias; estados pendientes conservados.
- `docs/gym-icon-licenses.md`, este informe y referencia de seguimiento en `docs/gym-visual-v2.md`.

Se comparó por SHA-256 todo `src` con un snapshot al comenzar esta revisión: solo cambiaron el componente, el CSS y el test indicados. [Evidencia de conservación](../artifacts/gym-visual-final/source-preservation.json). El resto de las mejoras preexistentes sigue intacto; no se modificó Finanzas ni su worktree. Tampoco `.taste-skill/` o `docs/finance-parent-revision-proposal.patch`.

## Licencias y dictamen

La investigación se documenta por separado en [gym-icon-licenses.md](gym-icon-licenses.md). Se verificaron las condiciones oficiales y la presencia de créditos existentes. Solo el banco tiene autor identificable dentro del catálogo SVG; las fichas de Trophy y Fire Streak Orange publican su licencia. Faltan pruebas específicas de procedencia/permiso para el catálogo de ejercicios y para el check/success sin fuente. No se inventó una licencia genérica, no se borraron atribuciones y no se cambiaron recursos para ocultar el pendiente.

**GO para aprobación visual local de esta revisión de V2.** Recomiendo revisar las capturas y el fixture interactivo conservando esta dirección. La aprobación estética final corresponde al usuario.

**NO-GO para considerar cerrada la habilitación de derechos de los recursos pendientes.** La revisión visual y la certificación de licencias no son el mismo dictamen. No se hizo commit, merge, cambio de rama, preparación de despliegue ni publicación.

Revisión local disponible y comprobada: [galería final](http://127.0.0.1:5341/artifacts/gym-visual-final/index.html) y [fixture de descanso](http://127.0.0.1:5341/tests/gym-refinement/browser.html?state=rest&theme=dark). Se verificó que las doce capturas responden y que el fixture no tiene nube configurada. La disponibilidad de estos enlaces depende de mantener el servidor local abierto; los PNG y la galería permanecen en `artifacts/gym-visual-final/`.
