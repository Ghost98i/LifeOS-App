# Gimnasio: anchura global y distribución de página

Base comprobada antes de editar: `codex/lifeos-preview-evaluation-2026-11`, HEAD `90abc68eb8c8ceca77de852cfc50159d47d93d01`. El worktree estaba limpio. Este ajuste mantiene el NO-GO financiero y sólo puede actualizar la Preview demo.

## Causa comprobada

Hoy (`.today-shell`) y Finanzas (`.finance-workspace`) ocupan el contenido de `App.tsx > main`: ancho completo con máximo global de 1952 px, incluido su padding de 14/20/32 px según breakpoint. El sidebar ocupa 232 px en escritorio. Ninguna de esas dos superficies añade otro máximo de página.

Gimnasio imponía `max-width:1120px; margin-inline:auto` en `.gym-page`, afectando encabezado, pestañas y todas las vistas. El workspace activo repetía ese máximo mediante `.gym-page .gym-workout-shell`, por encima de un `max-w-[1240px]` heredado en JSX. Su grid tenía además una regla de columna auxiliar fija de 280 px y otra declaración heredada en JSX. El panel del ejercicio medía 816 px dentro de la página de 1120 px; no era el ancho de la página completa.

Las aproximaciones del reporte del propietario se contrastaron con medidas CSS reales, sin confundir viewport, página y panel operativo.

| Viewport | Hoy y Finanzas | Gimnasio antes | Gimnasio después | x antes → después |
|---|---:|---:|---:|---:|
| 2560 | 1888 px | 1120 px | 1888 px | 836 → 452 |
| 1920 | 1624 px | 1120 px | 1624 px | 516 → 264 |
| 1600 | 1304 px | 1120 px | 1304 px | 356 → 264 |
| 1440 | 1144 px | 1120 px | 1144 px | 276 → 264 |
| 1280 | 984 px | 984 px | 984 px | 264 → 264 |
| 1024 | 728 px | 728 px | 728 px | 264 → 264 |
| 768 | 728 px | 728 px | 728 px | 20 → 20 |
| 390 | 362 px | 362 px | 362 px | 14 → 14 |
| 375 | 347 px | 347 px | 347 px | 14 → 14 |

Mismos resultados en claro y oscuro. Las medidas de panel, aside, timer y CTA móviles coinciden con V2. No se fijó un nuevo ancho arbitrario para Gimnasio: el propietario del ancho sigue siendo el contenedor global existente, sin modificarlo.

## Implementación

- `.gym-page` ocupa el ancho de su padre y establece un contenedor de consulta `gym-page`. Se retiraron los máximos anidados del workspace y el grid de JSX que competía con CSS.
- Launcher, calendario y sesión activa se organizan según **ancho de contenido disponible**, no sólo viewport. Con menos de 960 px se apilan; ese umbral permite reservar unos 640 px operativos, 280 px auxiliares y separación. Evita forzar dos columnas en los 728 px que quedan cuando aparece el sidebar a 1024 px.
- Launcher: selector flexible y bloque de acciones acotado; el CTA no se estira indefinidamente. Calendario/detalle: proporción 1.05:1 y separación de 28 px. A 1920 px el calendario tiene aproximadamente 796 px y el detalle 758 px.
- Sesión activa: ejercicio dominante y aside entre 280 y 400 px, proporcional al contenido. Campos de carga con medida máxima de 720 px; series con ancho intrínseco y mínimo operable, sin ocupar fracciones enormes por tener pocas. CTA de registro con ancho de contenido y mínimo de 320 px en escritorio; el CTA de próximo esfuerzo conserva su medida compacta V2. Timer de 84 px en escritorio y 76 px en móvil.
- Rutinas: dos columnas a partir de 1200 px de contenido. Abrir el editor expande ese mismo artículo a la fila completa; no se crea otro editor. Los estados vacíos ocupan toda la fila.
- Historial: conserva una columna cronológica, agrupación semanal, métricas y edición existentes; ahora aprovecha todo el ancho global. No se cambió el orden de lectura para llenar espacio con tarjetas.
- Progreso: resumen y gráfico existentes lado a lado a partir de 1200 px, con selector a ancho completo. Los estados insuficientes siguen sin fabricar gráficos ni tendencias.

## Alcance e integridad

Archivos de ejecución modificados: `ActiveWorkoutView.tsx`, `GimnasioView.tsx`, `gymCockpit.css`, `gymLauncher.css`, `gymActivityCalendar.css`. Sólo clases, atributos de presentación y CSS. Se añade `scripts/test-gym-page-layout.mjs` y este informe.

Hoy, Finanzas, `App.tsx`, el contenedor global, modelos, cálculos, `gymMigration.ts`, timer, persistencia, E2EE, sincronización y Rules permanecen sin cambios respecto de 90abc68. Se conserva su corrección de pausa tras recarga. No se modifican íconos, SVG, Lottie, animaciones ni créditos. No se investigan licencias ni se declaran cerrados sus pendientes.

## Verificación

El nuevo harness usa el build real de aplicación con SDK demo, perfiles sintéticos, APIs externas bloqueadas y sin inyectar CSS de producto. Mide contra los límites reales de Hoy y verifica Finanzas, las cuatro pestañas de Gimnasio, edición de rutinas, registro y descanso: **162 estados en nueve anchos y ambos temas**, más **18 configuraciones de interacción**. Comprueba hit testing del CTA, pausa efectiva tras recarga y origen del descanso al navegar. Los overlays de guías sólo se añaden a capturas comparativas y se retiran inmediatamente.

La validación local aprobó 1458 pruebas generales, 44 regresiones de navegador, 36 estados V2 y cuatro casos móviles de teclado, seis recorridos funcionales completos y seis casos de controles/descanso del build real. Lint incluye TypeScript. Las ejecuciones y verificaciones adicionales del artefacto final y Preview quedan registradas en la carpeta de evidencias, junto con el commit, versión Hosting y hashes; no se identifica un artefacto sólo por el éxito del deploy.

Evidencia local: `artifacts/gym-page-width-20261103/` en el repositorio original. `before/` y `after/` contienen las mismas vistas/viewports, capturas con guías y medidas JSON. `comparativa-escritorio.html` permite comparar Hoy/Finanzas/Gimnasio. El manifiesto final y `hosting-after.json` identifican la versión efectivamente servida. La publicación se limita a `consolidated-review-20261103`, configuración `demo-lifeos`, sin dominios Auth nuevos y sin acceso a cuentas reales.

**Dictamen de alcance: corrección visual apta para revisión en Preview. Live continúa NO-GO por Finanzas.**
