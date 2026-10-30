# Gimnasio: calendario de actividad real

Implementado localmente el 29/10/2026 sobre `c37f7d6939367a70194be164ca720d8aabc34a2d`, en `review/lifeos-estado-2026-10-04`. Sin commit, push, tag ni publicación.

## Criterio de las marcas

La fuente sigue siendo `state.gym.sessions`. El calendario es una vista derivada, sin escrituras ni modelo persistido nuevo.

- Mancuerna violeta: sesión finalizada con trabajo válido según `isPerformedGymSession` / `gymMetrics`. Se excluyen estados activos o desconocidos, sesiones vacías y series sin completar. Los registros heredados sin `status` se leen con el mismo criterio de trabajo del historial.
- Se utiliza exclusivamente `session.date`, fecha local registrada, validada como `YYYY-MM-DD`. No se deduce una fecha de horas, timestamps ni UTC. Una sesión que termina después de medianoche conserva su día registrado.
- Varias sesiones el mismo día producen una marca y un día entrenado; el detalle conserva todas las sesiones individuales.
- Fechas ausentes o imposibles quedan fuera, con un aviso explícito. Registros finalizados con fecha futura tampoco cuentan como asistencia. Ningún registro se modifica ni elimina.
- «Esta semana» cuenta fechas distintas desde el lunes local hasta hoy. No cuenta sesiones ni descansos.

## Integración y límites

El calendario aparece en **Entrenar**, después de la acción principal. Durante un entrenamiento activo permanece fuera de la vista para conservar el espacio operativo. Hay mes anterior/siguiente, selector directo de mes, Hoy, fecha actual diferenciada y selección de fecha. El teclado permite flechas, Home/End y PageUp/PageDown, con foco visible.

«Ver sesión» abre el resumen existente en Historial, expande el mes archivado cuando corresponde y enfoca la sesión. Volver a Entrenar conserva el mes y la fecha seleccionados mientras no se inicia otra sesión. Finalizar por el circuito vigente actualiza las marcas; un guardado fallido no crea asistencia.

**No se agregaron marcas programadas.** `RoutineTemplate.days` expresa preferencias semanales; no contiene fechas de ejecución, períodos de vigencia ni excepciones que permitan afirmar que existe una sesión programada para un día concreto. Convertir esas preferencias en programación fechada requeriría otra decisión de producto. No es necesario para esta entrega.

Los descansos mantienen apariencia neutra; al seleccionarlos se aclara que no suman un día entrenado. Se respetan `gym.restDays` y `checkoutLog[fecha].trainedSkipped`. El algoritmo y la presentación de rachas existentes no cambiaron: continuidad y días entrenados de esta semana siguen siendo métricas separadas. Tampoco cambió la programación semanal existente del lanzador.

## Antes y después

Antes, Entrenar mostraba el lanzador y la última sesión; reconocer fechas anteriores requería recorrer Historial. Ahora se ven los días entrenados del mes y el total semanal, y se puede abrir una sesión archivada desde su fecha.

La evidencia usa datos sintéticos idénticos antes/después, reloj fijo 29/10/2026 y la tipografía local de Celestian. No se utilizaron datos personales.

- [Comparador visual](../artifacts/gimnasio-calendario-20261029/comparaciones.html): 16 capturas anteriores y 16 posteriores, estados vacío/poblado, claro/oscuro, 1920×1080, 2560×1440, 768×1024 y 390×844.
- [Resultados visuales](../artifacts/gimnasio-calendario-20261029/after/results.json): sin desbordamiento horizontal ni errores de página.
- [Recorridos y errores](../artifacts/gimnasio-calendario-20261029/flows/results.json): ocho escenarios, con capturas tras finalizar y con fechas inválidas.
- [Aplicación compilada sin conexión](../artifacts/gimnasio-calendario-20261029/offline/results.json): diez escenarios, agregando móvil de 375×812, con shell real, ambos temas y almacenamiento sintético aislado.
- [Medición visual](../artifacts/gimnasio-calendario-20261029/design/inspect/report.json): 0 FAIL y 0 WARN. Se inspeccionaron las capturas, no solo sus medidas.

La inspección confirma que iniciar entrenamiento conserva prioridad, las mancuernas distinguen actividad sin penalizar descansos y la selección mantiene todas las sesiones. Las celdas miden 54 px de alto; en el shell móvil de 375 px superan 44 px de ancho. No se redujo la tipografía existente. Los tamaños responsive se probaron en Chrome; no equivalen a una prueba física en Safari/iOS.

## Pruebas y resultados

| Verificación | Resultado |
| --- | --- |
| Suite general `npm test` | **1239/1239**, sin omitidos; incluye 13 regresiones nuevas del calendario y las existentes de rachas, historial, operaciones, sincronización y cifrado |
| `npm run lint` | Aprobado, ESLint sin advertencias; incluye TypeScript `tsc --noEmit` |
| `npm run build` | Aprobado; advertencia informativa de chunks mayores a 500 kB |
| Navegador sobre componente real | **8/8**, cuatro tamaños × dos temas |
| Aplicación compilada offline | **10/10**, cinco tamaños × dos temas; recarga controlada por Service Worker, consulta de historial archivado y datos de Gimnasio guardados sin cambios |
| Integridad de archivos existentes | **512/514 idénticos**; solo cambian `GimnasioView.tsx` e `index.css` |
| Integridad de operaciones | AST: **37 manejadores y 39 llamadas a `onUpdateState` idénticos**; índice, HEAD y rama conservados |
| `git diff --check` | Sin errores |

Las regresiones nuevas cubren sesión completada/incompleta/vacía/abandonada, varias sesiones por fecha, semana entre meses, año nuevo, medianoche en Uruguay y Nueva Zelanda, fin de sesión después de medianoche, mes vacío/bisiesto, formatos heredados, fechas inválidas/futuras, finalización real, separación de descansos/rachas, teclado y 10.000 sesiones congeladas sin mutaciones.

Los recorridos de navegador comprueban selección, archivo histórico, vuelta a Entrenar, cero guardados al navegar, finalización y fallo de guardado, actualización del día local, accesibilidad por teclado y ambos temas. El test offline comprueba el build servido contra su SHA-256, presencia de JS de Gimnasio/CSS en precache y recarga sin red con datos locales existentes. `dist` conserva 79 archivos públicos, sin fixtures ni evidencia de pruebas.

No se ejecutaron emuladores: esta intervención no introduce persistencia remota ni cambia contratos. No se modificaron Rules, E2EE, sincronización, tipos persistidos, cálculo de rachas, datos históricos ni otros módulos. No se agregaron dependencias ni recursos de audio.

## Repetir las pruebas

```powershell
npm test
npm run lint
npm run build
```

Con Vite local en ejecución (sin conectar una cuenta real):

```powershell
# Terminal 1
npm run dev -- --host 127.0.0.1 --port 5244 --strictPort
# Terminal 2
node scripts/test-gym-activity-calendar.mjs
node --import tsx scripts/test-gym-activity-offline.mjs
```

El segundo script sirve `dist` temporalmente en loopback y comprueba que sea el build de disco; no publica nada. Ambos usan contextos aislados, datos sintéticos y bloquean conexiones externas. `TEST_ORIGIN`, `CHROME_PATH` y `GYM_CALENDAR_OUTPUT` permiten adaptar URL de Vite, navegador y carpeta de evidencia. La prueba offline siempre levanta su propio servidor local.

**Estado: listo para revisión local.** No hay decisiones bloqueantes. Una programación fechada y una comprobación física en otros navegadores quedan fuera de lo implementado.
