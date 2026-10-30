# Celestian LifeOS — auditoría y correcciones, 28/10/2026

## Estado y alcance

Trabajo realizado directamente sobre el repositorio principal y su árbol local existente, con numerosos cambios previos sin confirmar. Se inspeccionaron `git status`, diferencias, historial reciente, configuración, contratos y pruebas; no se reconstruyó la aplicación ni se revirtieron cambios de otros agentes. Referencia inicial: `9283612` y las iteraciones recientes de gimnasio, sincronización, diseño y operaciones comerciales.

No se desplegó, confirmó ni publicó código. No se cambiaron Rules ni capacidades productivas, claves personales, historiales reales o identificadores de Firebase. Todas las operaciones de prueba fueron sintéticas y locales. Los navegadores usan perfiles nuevos y bloquean tráfico externo. Un test legado intentaba conectar al Firebase público con un UID sintético; su conexión falló y fue sustituido por una prueba en emuladores y una barrera contra esa configuración en Node.

La aplicación mejoró en fallos reproducidos; este documento **no certifica cobertura exhaustiva de cada control, combinación de datos, dispositivo o texto**.

## Mapa de la implementación vigente

| Capa | Implementación y límites observados |
| --- | --- |
| Entrada y navegación | `App.tsx`, Hoy, vistas diferidas, navegación lateral/móvil, búsqueda global, captura, cierre del día y overlays de sesiones. Agenda y Calendario siguen separados. |
| Estado | Estado compartido de React y referencias para callbacks; `updateState` trabaja sobre una copia, valida operaciones comerciales, guarda localmente y después encola módulos modificados. Formularios y temporizadores mantienen estado de interacción local. |
| Persistencia | `storage.ts`: normalización compatible, almacenamiento por usuario, respaldo de recuperación, importación/exportación y aislamiento de datos comerciales. Las sesiones de estudio y el temporizador activo no se convierten en sesiones remotas compartidas. |
| Dominio | Funciones de finanzas/libro mayor, compromisos, compras/ventas comerciales, gimnasio, estudios, notas, captura, búsqueda, avisos y contexto; no hay servidor de IA obligatorio. |
| Sincronización | Los 15 módulos de `SYNC_MODULES`, enumerados debajo. Documentos por usuario con revisiones, bases, tombstones y copias de conflicto. |
| E2EE | Cifrado de módulos en cliente, clave de datos en sesión, envelope envuelto, recuperación y confianza de dispositivo. Migración reanudable y protocolo cifrado 2; publicación comercial bajo protocolo 3. |
| Comercio | `CommercialWorkspace` usa componentes con nombres históricos de sandbox, pero su vía de producción persiste y valida mediante el contrato comercial. El sandbox de desarrollo conserva una entrada separada y limitada a DEV; no se eliminó código activo por su nombre. |
| Publicación | Transacciones de hasta cinco módulos por presupuesto de Rules; `resale` y `finance` permanecen en el mismo grupo atómico. La publicación de todos los módulos no constituye una única transacción global. |
| PWA y visual | Vite/Workbox, recursos locales y cinco escenas del Cervino; contenedor adaptable compartido, temas, iconos existentes y violeta de marca conservados. |

Lista literal de los 15 módulos: `profile`, `agenda`, `tasks`, `context`, `finance`, `gym`, `study`, `streaming`, `jobs`, `resale`, `ideas`, `calendar`, `goals`, `notes`, `checkout`.

Streaming, metas, ideas y contexto participan en estado, búsqueda o sincronización aunque no todos tengan una pantalla principal independiente. No se inventaron pantallas para completar una lista de módulos.

## Defectos confirmados y reparados

| Prioridad | Síntoma, causa y consecuencia | Corrección y evidencia |
| --- | --- | --- |
| P0, riesgo de pérdida | La migración E2EE podía continuar con el estado local después de no poder leer/descifrar un módulo remoto; también confiaba en un checkpoint sin volver a comprobarlo. Podía sustituir datos remotos que no había recuperado. No se afirma que haya ocurrido en una cuenta real. | Detención ante errores, ciphertext ilegible, copia preventiva fallida o diferencias remotas. Relectura de checkpoints y escritura transaccional con revisión esperada y clave explícita. Tests de interrupción/corrupción/cuota y migración real de 15 módulos en emuladores. |
| P1 | Lecturas frescas podían servirse desde caché y algunos encabezados incompatibles no se rechazaban antes de hidratar. Un cliente podía tratar como válido un estado remoto que no podía interpretar. | Lecturas de servidor para recuperación/capacidades; validación de revisión, cifrado y protocolo en lectura y publicación. Emulador rechaza protocolo futuro, revisión obsoleta y lectura sin red; no utiliza caché como confirmación. |
| P1 | Callbacks asíncronos de sincronización/desbloqueo podían terminar después de cambiar de usuario o suscripción. | Generación de sesión y verificaciones de UID antes de aplicar resultados, escuchar snapshots o desbloquear. Limpieza de listeners y claves de sesión anteriores. Inspección del recorrido y regresiones generales; no se afirma una prueba exhaustiva de todas las permutaciones de cambio de cuenta. |
| P1 | Mi negocio podía bloquear compras posteriores por un falso conflicto: validaba diferencias comerciales antes de reconocer una revisión conocida o la confirmación de su propia escritura. | Primero se reconocen revisiones y confirmaciones; la barrera comercial se aplica a cambios entrantes efectivos. Reproducido en Playwright autenticado con emuladores; el mismo circuito vuelve a pasar manteniendo el rechazo de revisiones obsoletas. |
| P1 | Una confirmación remota podía mostrar «Sincronizado» aunque quedaran cambios locales en cola, revisiones pendientes o conflictos de gimnasio. | El estado visible combina confirmación remota y trabajo local pendiente. Tests de prioridades de estados y circuito comercial completo en navegador. |
| P1 | Formularios cerrados, contenido descartado o avisos de éxito aunque `updateState` devolviera `false`. Finanzas ignoraba el resultado en 29 acciones; el patrón también aparecía en otros accesos. | Se comprueba el resultado en Finanzas, transferencias, Trabajo, Agenda, IA, búsqueda global, Configuración, avisos de Hoy y venta histórica. Importar/restaurar/reiniciar propagan su resultado; reparar saldos requiere copia preventiva. Inyección de fallo de almacenamiento, reintento y recarga en navegador. |
| P1 | Editar una rutina y aplicar/limpiar una plantilla en Agenda cambiaban estados de UI sin renderizar sus diálogos. | Diálogos funcionales con confirmación, formularios que conservan borradores y separación de actividades semanales, rutinas y acontecimientos. Prueba completa de editar/aplicar/limpiar conservando los otros datos. |
| P1 | El descanso de gimnasio pausado podía desaparecer al navegar fuera del módulo porque el overlay seguía calculando contra el vencimiento anterior. | Overlay consciente de pausa, ajustes y reanudación; no borra un temporizador distinto. Regresión de componente y recorrido móvil con avance de reloj de tres minutos en Hoy. |
| P1 | La racha sumaba descansos como días asistidos y podía incluir fechas futuras; el cálculo semanal usaba una conversión UTC impropia. | Cuenta fechas únicas de entrenamientos, excluye futuro y usa fechas locales. Conserva tolerancias de continuidad anteriores y todo el historial. Texto «días entrenados en continuidad». Cuatro regresiones, incluyendo zona al este de UTC y duplicados del mismo día. |
| P1 | Un compromiso de hoy podía aparecer vencido de noche en Uruguay; el horizonte de revisión perdía un día al este de UTC. | Comparación y suma por fecha local. Regresiones con reloj en 23:30 de Montevideo y límite del tercer día en Auckland. |
| P1 | «Comprar» en IA usaba la compra histórica con cuenta financiera implícita, en paralelo al circuito comercial vigente. | Desde la aplicación abre Mi negocio, donde se eligen cuenta, categoría y pago. Conserva la oportunidad y no crea stock ni movimientos al navegar. La transferencia automática de todos sus campos no se implementó. Regresión de navegador comprueba que finance/resale no cambian. |
| P1 | El espacio de Estudios omitía evaluaciones históricas sin `status`, aunque sus métricas y listado las consideraban pendientes. También discrepaba en ordenamiento. | Reutiliza `categorizeExams`, sin modificar datos históricos. Prueba de datos heredados y aserción de su presencia en el espacio de estudio en todos los tamaños/temas poblados. |
| P2 | Una clave guardada localmente activaba una presentación de cobertura cifrada sin comprobar la nube. Estados locked/offline y el aviso de actualización también podían inducir a error. | Se distingue sesión E2EE de cobertura remota; estado de nube desconocido explícito, errores capturados y navegación con estados reales. La actualización pide terminar de guardar formularios. Regresiones de render. |
| P2 | Una preferencia `privacyMode` ausente alternaba la clase CSS, en lugar de desactivarla; saldos borrosos sin activar privacidad. | Conversión explícita a booleano. Comprobación DOM en cada contexto sintético y capturas inspeccionadas con importes visibles. |
| P2 | La cabecera financiera ignoraba la preferencia de disponible tras pagos y mostraba una alarma de reserva en cuentas nuevas sin cuentas financieras. | Respeta importe/etiqueta elegidos y evita alarma de reserva sin cuentas. Tests del componente real, conservando el llamado a crear cuenta y alertas válidas. |
| P2 | Fuentes, escenas y animación local quedaban fuera del precache; pequeñas etiquetas y enlaces violetas tenían contraste insuficiente. | Cache de recursos con límite de 3 MiB por archivo, texto secundario más legible y tinta violeta clara en oscuro sin cambiar el relleno de marca. Navegación offline por 11 vistas; contraste medido en DOM y capturas inspeccionadas. |
| P2 | Estudios vacío añadía tres tarjetas de métricas sin datos; algunos textos exponían jerga o afirmaciones incorrectas. | Oculta métricas vacías, mantiene primeros pasos y gestión académica; texto de búsqueda laboral natural y explicación del dato corporal coherente con su exportación en backups. Pruebas de render y navegador. |
| P1/P2, herramientas | El descubrimiento de tests incluía emuladores en la ejecución ordinaria; pruebas Firebase podían intentar conexión externa; scripts con `npx` podían dejar servidores y reutilizar un puerto equivocado. | Runner portable de unit tests separado de emuladores, barrera demo/loopback en Node, servidores Vite directos y puerto exclusivo/verificación de servidor comercial. Prueba real de revisiones cifradas trasladada a emuladores. No se relajaron contratos de aplicación para obtener tests verdes. |

Las pruebas históricas de navegador tenían selectores/textos y fechas envejecidos. Se contrastaron con la implementación actual y se actualizaron sus interacciones, manteniendo las comprobaciones de persistencia, duración, filtros, recuperación, importación y navegación. Un test concurrente de gimnasio asumía qué dispositivo debía ganar; ahora exige exactamente un ganador, un conflicto de revisión y una recuperación segura del perdedor.

## Dependencias

Se actualizaron Vite 6.4.3 → 6.4.5, RE2JS 2.8.6 → 2.9.1, source-map-js 1.2.1 → 1.2.2, fast-uri 3.1.8 → 3.1.9, serialize-javascript 7.1.1 → 7.1.4 y Zod 4.6.5 → 4.6.7. Firestore fijaba gRPC en una rama vulnerable; un override acotado usa `@grpc/grpc-js` 1.13.6. Se conserva Firebase 12.19.0 y sus contratos. La nueva dependencia ordered-map es transitiva de gRPC, no una funcionalidad agregada.

Avisos verificados: [gRPC](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [RE2JS](https://github.com/advisories/GHSA-gg6h-894w-4m9c), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) y [Vite/Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm). La presencia de un paquete vulnerable no demuestra explotación ni que todas sus condiciones sean alcanzables desde esta SPA.

Resultado: `npm audit --omit=dev` sin avisos conocidos. El análisis completo conserva cuatro entradas bajas originadas en un único aviso de [deepmerge sin parche publicado](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), a través de Workbox/Rollup durante la compilación. No se aplicó la degradación de PWA sugerida por npm ni se creó un fork de la dependencia. La configuración de compilación inspeccionada es código local; no se demostró una vía de explotación desde datos personales de la aplicación.

## Verificación reproducible

| Comprobación | Resultado y evidencia local |
| --- | --- |
| Unitarias/integración | `npm test`: 1216 pruebas, sin fallos ni omisiones. `artifacts/integral-unit-tests.log`. |
| ESLint y TypeScript | `npm run lint` incluye `tsc --noEmit`, cero errores/avisos de ESLint. `artifacts/integral-lint.log`. |
| Build PWA | `npm run build`, correcto; aviso previo de chunks >500 kB. 75 recursos en precache, aproximadamente 16,3 MiB. `artifacts/integral-build.log`. |
| Emuladores | 46 pruebas reales de Auth/Firestore/Rules, sin omisiones. `artifacts/integral-emulators.log`. |
| Navegador existente | 44 escenarios aprobados sobre build recién generado. `artifacts/integral-existing-browser.log`. |
| Estudios | 17 escenarios aprobados: sesión persistida, pausas, recarga, subminuto, suspensión, descarte, audio al desmontar, geometría, materias y evaluaciones. `artifacts/integral-studies-browser.log`. |
| Auditoría de navegador | 121 comprobaciones: diez recorridos con mutaciones sintéticas, PWA offline y 110 combinaciones de pantalla. `artifacts/integral-browser.log` y `artifacts/integral/browser/results.json`. |
| Comercio completo | Playwright autenticado: compra, fallo de disco/reintento, pago parcial, venta, cobro parcial, cifrado, segundo cliente, devolución, reembolso y anulación por evento compensatorio; rechazos de edición inválida/revisión obsoleta y capacidad apagada solo en emulador. También se comprobó la vista autenticada a 375×812 en ambos temas, con cambio de tema desde el menú real. `artifacts/commercial-production/result.json`. |
| Seguridad de dependencias | JSON separados de audit productivo y completo en `artifacts/integral-dependency-audit*.json`; paquetes actualizados en lockfile. |

Para reproducir emuladores en este Windows se usó `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp`, por la longitud del directorio temporal del entorno:

```powershell
firebase emulators:exec --project demo-lifeos --only auth,firestore "node scripts/run-all-emulator-tests.mjs"
firebase emulators:exec --project demo-lifeos --only auth,firestore "node scripts/run-commercial-e2e-with-vite.mjs"
node --import tsx scripts/audit-integral-browser.mjs --pwa
```

Los emuladores comprueban creación y actualización de 15 módulos, dos clientes, conflictos concurrentes, interrupción entre lotes y reintento, recuperación preventiva, migración cifrada interrumpida/reanudada, recuperación de clave desde otro cliente, protocolos y aislamiento/reglas. La atomicidad comercial se comprueba conjuntamente con el libro mayor, no solamente con funciones aisladas.

La matriz visual usa datos poblados a **1920×1080, 2560×1440 y 375×812**, y módulos sin registros a 1920×1080 y 375×812, en claro y oscuro. Estos últimos conservan las rutinas base de `defaultState`; no son 15 módulos arbitrariamente borrados. Se inspeccionaron las hojas de contacto de los once módulos, originales de gimnasio/descanso/resumen y operaciones comerciales, además de capturas focales de las correcciones. Se midieron ancho, imágenes rotas y contraste de tokens; no se aplicó CSS de prueba para esconder defectos. Las hojas de contacto muestran el primer viewport; no equivalen a haber leído cada píxel de todas las páginas largas.

Quick Capture conserva las correcciones previas de moneda duplicada, fecha explícita y pagos/cuotas: se ejecutaron sus regresiones existentes y la confirmación real de un gasto con fecha explícita en navegador. Los arreglos previos de duración, PRs y activación del descanso histórico se conservaron y volvieron a probar; no se declararon nuevamente como fallos abiertos sin reproducción.

## Decisiones y límites pendientes

1. **Continuidad del gimnasio:** se conserva la tolerancia vigente a descansos, pero el número visible cuenta solo días entrenados. Propuesta para acordar: calendario con mancuerna rellena en una fecha completada, contorno para planificada y descanso neutro; objetivo semanal configurable de días entrenados y progreso `hechos/objetivo`. La continuidad y el objetivo semanal deben presentarse por separado. Falta decidir descansos permitidos, excepciones y si el objetivo cuenta días o sesiones. No se implementó una política nueva ni se reescribió historial.
2. **Dispositivo físico:** suspensión y avance de reloj se simularon en Chrome, con recarga, navegación y reanudación. No se certificaron bloqueo de pantalla real, políticas de ahorro Android/iOS, notificaciones del SO, volumen/salida sonora ni háptica en hardware.
3. **Alcance funcional:** contexto, metas, streaming, herramientas secundarias y sus estados sincronizados tienen inspección/contratos y pruebas existentes, pero no cada operación secundaria recibió un recorrido E2E manual independiente. OAuth real de Google, proveedores externos y cuentas personales no se ejercitaron. No se comparó funcionalmente la cuenta pública desplegada con el código local.
4. **Seguridad residual:** aviso bajo de deepmerge en herramientas de build sin parche upstream. El override de gRPC debe retirarse cuando Firebase adopte una rama corregida compatible. No se auditó de forma independiente el diseño criptográfico como una revisión formal de criptografía.
5. **Rendimiento:** continúan chunks grandes de Firebase/aplicación y un cache inicial de unos 16,3 MiB al incluir los recursos visuales offline. No se hicieron mediciones físicas en red lenta ni pruebas de estrés con historiales de años. No se comprimieron las escenas originales para alterar la identidad visual.

## Estado de publicación

El repositorio construye y supera las comprobaciones indicadas. Está preparado para una revisión de publicación, con los límites y el aviso de build anteriores expresos; no constituye una certificación universal. No se ejecutó Hosting, migración real, cambio de Rules/capacidades productivas, commit o push. Los archivos y cambios locales anteriores se conservaron.
