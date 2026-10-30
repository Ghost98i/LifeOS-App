# LifeOS — rendimiento y experiencia, 29/10/2026

## Alcance y método

Continuación de `AUDITORIA-INTEGRAL-2026-10-28.md`, trabajando sobre el árbol principal existente, con 295 entradas de Git ya modificadas o sin seguimiento. No se hicieron commits, push, deploy, cambios de dependencias, servicios productivos ni datos personales. No se modificaron los contratos de cifrado, sincronización, almacenamiento o libro mayor.

Se midió un build de producción anterior a las correcciones y se guardaron sus tamaños, recursos y tiempos en `artifacts/optimization-2026-10-29/before.json`. Las mediciones posteriores y la comparación reproducible están en `after.json` y `comparison.json`, en el mismo directorio.

Condiciones: Chrome headless en Windows, perfiles nuevos, datos sintéticos, Montevideo, reloj fijo, gzip para texto/WASM, CPU limitada a 4×, latencia de 40 ms y 1.500.000 bytes/s (12 Mbit/s). Se bloquearon peticiones externas. El Service Worker está desactivado en el benchmark para separar arranque de instalación offline. Hay tres repeticiones por ancho en la comparación principal: 375×812, 768×812 y 1920×1080. Ante variabilidad en escritorio se añadieron cinco repeticiones posteriores: la comparación de 1920 combina **todas las ocho**, sin descartar las lentas. `desktop-probe.json` conserva esa ampliación; el generador comprueba que build y condiciones coincidan antes de combinar. Las comprobaciones visuales también incluyen tablet de 768×1024 y ambos temas.

El fixture de rendimiento mantiene el mismo snapshot en ambas fases: 500 notas, 200 movimientos, una cuenta y una rutina. Sirve para comparar carga y operaciones de interfaz; la exactitud del libro mayor se comprueba con otros fixtures y suites. «Hero listo» espera imagen decodificada, saludo visible y fuentes listas; «interfaz visible» espera el saludo. Los tiempos de navegación incluyen interacción, montaje y dos frames. La operación de búsqueda filtra por una nota fuera del bloque inicial.

Los recursos y contadores de CPU proceden de CDP: el reloj fijo de Playwright reemplaza la API Performance de recursos. Los JSON conservan las muestras individuales. El presupuesto de archivos solicitados se calcula por URL única con gzip donde corresponde; **no es una afirmación de bytes efectivamente descargados**: las peticiones especulativas pueden cancelarse y el tráfico de workers no queda íntegramente en el target del documento. No son métricas de usuarios productivos, Lighthouse ni una medición física de batería/temperatura.

## Problemas priorizados y cambios

| Problema y evidencia | Intervención | Impacto/riesgo |
| --- | --- | --- |
| Hoy creaba cinco `Image` al montar, compitiendo con la escena activa; los PNG sumaban 11.710.828 bytes. | Se solicita únicamente la escena que se muestra. Las cinco siguen en precache. Se generaron WebP **sin pérdida** por 8.172.208 bytes, conservando PNG originales, dimensiones, metadatos disponibles y píxeles. | Frecuencia: cada apertura de Hoy. Riesgo visual bajo: comparación RGBA exacta de las cinco imágenes y decodificación offline en Chrome. |
| El motor dotLottie se importaba al montar los checks, antes de completar nada. | La preparación ligera de SVG/JSON sigue disponible; el runtime se carga al reproducir la primera confirmación. | Menos JS inicial. La primera animación real se verificó con canvas, sin forzar reducción de movimiento. |
| `App` importaba la búsqueda, onboarding, cierre del día y conflicto aunque no se utilizaran. | Componentes diferidos con estados de carga explícitos y límites de Suspense locales. No se difirió la captura móvil que conserva borradores. | Reducción medida del chunk inicial. Todos los chunks nuevos permanecen offline. |
| Notas renderizaba 500 tarjetas: 8.533 nodos, incluso antes de interactuar. | Primer bloque de 50, cargar 50 más o ver todas. Búsqueda, orden, filtros y contadores consideran el historial completo. La selección global de una nota fuera del bloque inicial revela y enfoca su tarjeta. Se memoriza el ordenado mientras sus entradas no cambian. | Menor DOM y navegación más ligera en el caso medido. Sin modificación de notas ni del borrador de un editor abierto. |
| El diálogo de gasto dejaba salir el foco, no cerraba con Escape y devolvía el foco al body; había comportamientos similares en transferencias y búsqueda. | Gestión compartida de foco, Tab/Shift+Tab, Escape, bloqueo de scroll y retorno al disparador. Respeta diálogos anidados y eventos ya consumidos. | Recorrido completo de teclado en seis combinaciones de ancho/tema. |
| Los atajos globales podían navegar detrás de un diálogo y sobreescribían la intención de Escape de la búsqueda. | Se respetan `defaultPrevented` y los diálogos modales activos. Ctrl/Cmd+K conserva su entrada explícita. | Evita navegación accidental mientras se completa un formulario; no altera transacciones ni guardado. |
| En tablet, «Ctrl K» se partía en dos líneas y los estados de Configuración quedaban truncados. | Se impide el ajuste de línea del atajo. Tablet utiliza la franja de estados existente para móvil; escritorio conserva sus tarjetas. | Ajustes de presentación localizados, con capturas antes/después y comprobación de texto completo. |
| Los formularios necesitan seguir accesibles cuando disminuye la altura útil. | Gastos/transferencias usan altura máxima basada en `100dvh - 2rem`, con scroll interno. | Botón de guardar accesible a 375×430; es una simulación de altura, no una certificación de teclado iOS/Android. |

Los cambios no sustituyen el Cervino, la paleta, las fuentes, los iconos ni la composición de los módulos. La compilación portable también se comprobó en un directorio de artefactos, sin sobrescribir el `LifeOS.html` local existente.

## Mediciones comparativas

Medianas, redondeadas a milisegundos:

| Ancho | Muestras antes/después | Hero antes → después | Notas primera visita | Notas ya cargadas | Buscar una nota |
| --- | --- | --- | --- | --- | --- |
| 375 | 3 / 3 | 7.067 → 2.077 ms | 1.231 → 866 ms | 968 → 488 ms | 136 → 109 ms |
| 768 | 3 / 3 | 6.995 → 2.096 ms | 1.212 → 887 ms | 1.053 → 463 ms | 181 → 98 ms |
| 1920 | 3 / 8 | 7.111 → 2.078 ms | 976 → 586 ms | 674 → 193 ms | 140 → 107 ms |

El Hero mejora aproximadamente un 70% en este escenario. La primera apertura de Notas mejora en mediana un 30%, 27% y 40%, respectivamente. **No fue uniforme:** en 1920 las tres primeras muestras posteriores fueron 1.532, 1.266 y 549 ms; las cinco adicionales fueron 574, 553, 598, 565 y 670 ms. El rango completo posterior es 549–1.532 ms frente a 968–977 ms antes. No se demostró la causa de esas dos muestras lentas ni se las eliminó. Una mejora de la mediana no garantiza mejor latencia en cada visita.

La interfaz visible pasó de 1.690 → 1.604 ms en 375, 1.705 → 1.520 ms en 768 y 1.701 → 1.604 ms en 1920. Se registran esos valores, pero la muestra y variación del equipo no permiten una conclusión fuerte comparable a la reducción del Hero o del DOM.

Tamaños y reducciones estructurales:

| Recurso | Antes | Después |
| --- | ---: | ---: |
| Cinco escenas, bytes de archivos | 11.710.828 | 8.172.208 |
| Presupuesto de archivos solicitados al abrir Hoy | 12.338.706 bytes | 2.270.082 bytes |
| Chunk inicial de aplicación, sin comprimir | 818.883 bytes | 760.737 bytes |
| Chunk inicial de aplicación, gzip | 225.297 bytes | 211.267 bytes |
| JavaScript total distribuido, sin comprimir | 3.438.125 bytes | 3.443.267 bytes |
| Precache informado por Workbox | 16.688,63 KiB | 13.237,96 KiB |
| Nodos de Notas, antes de expandir | 8.533 | 887 |

Las escenas bajan un 30,2%; el precache, un 20,7%; el DOM inicial de Notas, un 89,6%. El manifiesto de Workbox reporta 75 → 80 entradas al agregar chunks diferidos; hay cinco entradas de iconos repetidas por la configuración existente, deduplicadas por Workbox. El tamaño de cache de la tabla usa el cálculo de Workbox, no la suma con duplicados del JSON del benchmark.

El presupuesto inicial de archivos solicitados baja un 81,6%; el chunk principal baja un 7,1% sin comprimir y un 6,2% en gzip. El JavaScript total crece 5.142 bytes por la interacción, accesibilidad y separación de chunks: se reduce trabajo inicial, no la capacidad distribuida.

El paquete de Firebase sigue alrededor de 796 kB y el de gráficos alrededor de 432 kB, sin cambios de contenido. Continúa el aviso de chunks mayores de 500 kB. No se cambió el límite para esconderlo.

## Archivos afectados

- `src/App.tsx`: importación diferida y entrega del destino de notas a la vista.
- `src/components/visual/AlpineDayCycleBackdrop.tsx`: WebP y eliminación de precarga indiscriminada.
- `src/components/visual/CompletionCheckMark.tsx`: runtime de animación al utilizarlo.
- `assets/hero/alpine-day-cicle/*.webp`: cinco derivados sin pérdida; PNG fuente intactos.
- `vite.config.ts`: WebP incluido en precache, con las capacidades offline anteriores.
- `src/components/NotasView.tsx`: bloques progresivos, búsqueda completa y foco de resultados.
- `src/hooks/useDialogFocus.ts`, `src/hooks/useKeyboardShortcuts.ts`: teclado y contención de foco.
- `src/components/FinanceTransactionModal.tsx`, `FinanceTransferModal.tsx`, `FinanceHero.tsx`, `GlobalSearchModal.tsx`: aplicación del comportamiento de diálogo y disparador estable.
- `src/components/Topbar.tsx`, `ConfigView.tsx`: legibilidad de tablet.
- `src/lib/notesRenderingPerformance.test.ts`, `scripts/register-test-assets.mjs`: regresión de renderizado y soporte WebP en el runner.
- `scripts/measure-experience.mjs`, `report-experience.mjs`, `validate-experience.mjs`, `encode-cervino-lossless.py`: mediciones, interacción y comparación exacta de imágenes.
- `scripts/audit-integral-browser.mjs`, `audit-contact-sheets.py`: WebP, ancho 768, búsqueda diferida offline, salida de evidencia configurable y lectura del archivo antes de enviar cabeceras HTTP.

## Pruebas y evidencia

| Verificación | Resultado |
| --- | --- |
| `npm test` | 1.217 aprobadas; cero fallos y omisiones. Incluye la nueva prueba de 500 notas y apertura directa de una nota fuera del primer bloque. |
| `npm run lint` | ESLint sin errores/avisos y TypeScript correcto. |
| `npm run build` | Correcto, con el aviso conocido de chunks grandes. |
| Build portable | Correcto en `artifacts/optimization-2026-10-29/portable-build`; no se regeneró el archivo portable personal. |
| Regresión integral de navegador | 165 comprobaciones: diez recorridos, PWA y 154 combinaciones de pantalla. Sin errores JavaScript. |
| Interacción específica | 30 escenarios aprobados: cinco por cada ancho/tema, además del control del atajo en una línea. |
| Navegador existente | 44 escenarios aprobados. |
| Auth/Firestore/Rules, emuladores | 46 pruebas aprobadas, ninguna omitida. |
| Comercio autenticado | Compra, fallo/reintento local, pagos parciales, venta, cobro, segundo cliente, devolución, reembolso, corrección y rechazo de revisiones/operaciones inválidas: aprobado. |

La prueba PWA decodifica las cinco escenas sin red, conserva fuentes y animaciones y recorre los once módulos; abre la búsqueda por primera vez estando offline. No se validó solamente la presencia de nombres en una lista de cache.

Se inspeccionaron capturas reales de Notas con 500 registros, sus controles finales, gastos, altura reducida, animación y Configuración en claro/oscuro, además de las hojas de contacto de la regresión, especialmente tablet. Esa inspección detectó los dos defectos de tablet que los checks de ancho no encontraban. Se conservan originales y hojas de contacto; no se inyectó CSS para ocultar elementos.

Evidencia: `artifacts/optimization-2026-10-29/` contiene `before.json`, `after.json`, `comparison.json`, logs de build/lint/unitarias/emuladores/comercio, `ux/results.json`, capturas de interacción y `regression/results.json`. Una ejecución intermedia del servidor de pruebas quedó invalidada por reconstruir `dist` mientras se servía; se corrigió su manejo de archivos ausentes y se repitió tras finalizar el build. Esa ejecución fallida no se cuenta como aprobación.

## Mejoras descartadas

- Separar Firebase en varios archivos para eliminar el aviso: Auth y Firestore se usan en el arranque actual; partir nombres no reduce por sí solo bytes o ejecución. Una carga realmente condicional exigiría investigar sus estados y recuperación, fuera de una optimización segura sin cambiar contratos.
- Comprimir con pérdida o reducir resolución del Cervino: el ahorro elegido conserva exactamente sus píxeles. El repositorio suma derivados; el build entrega menos bytes.
- Quitar escenas, fuentes, WASM o chunks del precache: dañaría los recorridos offline comprobados. No se retrasó indefinidamente la disponibilidad offline para mejorar una métrica de primera carga.
- Debounce del guardado local o cambios de sincronización: podrían perder confirmaciones o durabilidad. Se conserva el guardado vigente.
- Memorizar globalmente todo el árbol o introducir una biblioteca de virtualización: no se demostró esa necesidad; los bloques progresivos resuelven el caso medido y mantienen la opción de ver todo.
- Diferir la captura móvil desmontándola al cerrar: podría eliminar sus borradores pendientes. Se conservó su ciclo de vida.

## Limitaciones y pendientes

- Las mediciones son sintéticas en un mismo equipo. Hay variabilidad entre muestras, especialmente en una primera visita; no equivalen a percentiles productivos ni a una mejora uniforme de todas las operaciones.
- El tiempo en que aparece la interfaz se mantiene en el orden de 1,5–1,7 segundos bajo estas condiciones; no se presenta como una mejora concluyente. La mejora más clara de arranque es la disponibilidad de la imagen principal y la reducción de recursos solicitados.
- No se midieron dispositivos físicos, batería, redes 3G reales, lectores de pantalla completos, Safari/Firefox ni el teclado real de un móvil. La ventana de 430 px prueba geometría y alcance del botón, no políticas del sistema operativo.
- Se compiló la versión portable, pero no se hizo un recorrido E2E completo desde `file://` ni se sustituyó el artefacto portable existente.
- Los 500 apuntes/200 movimientos no representan todo historial posible. Pedir «Ver todas» o revelar un resultado lejano puede montar un listado grande por decisión explícita; no se eliminó esa capacidad.
- Siguen los chunks grandes y un cache inicial de unos 12,9 MiB. Se requiere evidencia adicional antes de alterar el arranque de Firebase o la durabilidad local.
- No se utilizó una cuenta productiva ni se volvió a auditar formalmente el cifrado. Sus contratos se conservaron y se ejecutaron las regresiones relevantes.

## Reproducción

```powershell
npm run build
node --import tsx scripts/measure-experience.mjs after
node scripts/report-experience.mjs
node --import tsx scripts/validate-experience.mjs
$env:LIFEOS_AUDIT_OUTPUT = 'artifacts/optimization-2026-10-29/regression'
node --import tsx scripts/audit-integral-browser.mjs --pwa
```

No hay cambios productivos publicados. El repositorio mantiene su identidad y capacidades; las conclusiones de rendimiento se limitan a las mediciones documentadas.
