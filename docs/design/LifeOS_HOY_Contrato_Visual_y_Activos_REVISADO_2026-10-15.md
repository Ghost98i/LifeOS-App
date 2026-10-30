# LifeOS — Hoy: contrato de producto, identidad y activos

**Fecha:** 15 de octubre de 2026. **Estado:** contrato operativo consolidado y actualizado con las últimas observaciones de Hoy; no equivale a aprobación final de la interfaz. **Autoridad de producto:** nuestras decisiones expresas, con prioridad de las más recientes. **Objetivo:** que ningún agente pierda ideas, recursos, preferencias ni compromisos ya establecidos. **Voz de las instrucciones:** primera persona: «quiero», «necesitamos», «conservá». No hablar sobre nosotros como terceros.


## 0. Cómo leer este contrato y qué cubre realmente

Esta es **la fuente operativa del diseño de HOY**, no una especificación completa de todos los módulos de LifeOS ni una promesa de haber recuperado literalmente cada mensaje histórico. Se ha contrastado con nuestras decisiones disponibles en la conversación, los cuatro textos maestros de LifeOS y el inventario del ZIP de motion. Si aparece una referencia visual, elección o conversación no documentada aquí, no inventar detalles: incorporar evidencia y resolverla con nosotros.

**Jerarquía de autoridad:** decisión expresa y más reciente > decisión expresa anterior no revocada > hipótesis/propuesta por evaluar > referencia visual inspiracional > documentación antigua. Una maqueta o la interpretación autónoma de un agente **nunca** equivale a nuestra aprobación. Las afirmaciones del reporte del agente deben distinguirse de pruebas reales vistas en nuestro localhost.

**Estado del alcance:** estructura Opción C aprobada; funcionamiento base de Agenda/Notas/Quick Capture/Estado conservado; **dirección de identidad, motion, iconos, gráfico y Cervino todavía no aprobada como resultado terminado**. «Cerrar Hoy» exige revisar uso y apariencia con datos reales; no un reporte de tests satisfactorios.

**Responsabilidad al pasar esto a agentes:** la dirección, los detalles y recursos los definimos juntos; los prompts deben transmitirlos sin omisiones. Usar «quiero», «necesitamos» y órdenes directas; nada de narrarnos como terceras personas.

## 1. Identidad y propósito que NO se renegocian

LifeOS existe para encargarse de la complejidad y exigirnos menos mantenimiento. **Hoy** debe permitir comprender el día, completar algo, registrar información rápida y volver a la vida. Debe sentirse como un cuaderno personal cuidado, no un panel corporativo/SaaS con métricas inventadas. Interfaz agradable, cálida, sobria, distinguible, con densidad intencional; sin sobrecarga, repeticiones ni interminables desplazamientos.

- **Color de identidad aprobado más recientemente:** violeta `#4F46E5` para navegación activa y CTA global. Semánticos aparte (p. ej. verde al completar una acción real). Paleta neutra agradable; modos claro y oscuro con la misma calidad. El viejo documento maestro que menciona *sapphire* es anterior y **NO debe prevalecer sobre esta decisión nueva**.
- Tipografía: legible y con jerarquía; evitar texto secundario microscópico, abuso de mayúsculas, etiquetitas redundantes. Inspiración tipográfica/iconográfica Raycast; no clonación.
- Iconografía: familia coherente de trazos, tamaños y pesos. Aprovechar biblioteca específica cuando su función semántica sea correcta; no colocar iconos genéricos arbitrarios ni Lotties por decoración. Atender iconografía compatible con ambos temas y licencia de distribución.
- Superficies: alternar cards suaves y secciones abiertas; menos bordes repetidos, menos sombra gratuita, nada de glassmorphism/gradientes artificiosos/carditis. No sacrificar accesibilidad por «minimalismo».
- Movimiento: transiciones cortas, suaves y con sentido, accionadas por hechos reales o gestos manuales; no autoplay de carruseles. `prefers-reduced-motion` y alternativa estática. La confirmación de una tarea debe sentirse viva: tick positivo visible y coherente, **sólo tras éxito persistido**, no feedback falso.
- Referencias visuales seleccionadas durante el proceso: Nexus, Donezo, ACRU, Shopeers, Skymetrics; Raycast para acabado tipográfico/iconográfico. Referencias antiguas de Linear/Refero/Steep pueden orientar, pero no reemplazan la selección más reciente que hicimos.

## 2. Composición de Hoy aprobada: OPCIÓN C

**No volver a debatir distribución A/B/C sin una decisión expresa nuestra de reabrirla.**

**Escritorio, en el orden aprobado:**

1. Hero compacto: saludo y fecha; estado real de Cerrar día. Ancho útil completo.
2. Quick Capture: franja horizontal de ancho útil completo, muy compacta.
3. Notas (mitad izquierda) y Estado (mitad derecha), alineados arriba. **No forzar alturas iguales de contenido**: la igualdad de la huella visual no justifica un Estado con un vacío gigantesco. Al rediseñar la vista, preferir contenido útil del propio Estado antes que decorar el hueco.
4. Una única Agenda de hoy, ancho útil completo; grupos de hasta 4 actividades y páginas manuales.
5. Actividad reciente, franja breve, sin importes ni saldos.

**Móvil:** hero compacto, Quick Capture mediante `+` flotante/inferior (sin input permanente), Notas, Estado, Agenda y Actividad reciente según el orden C que acordamos conservar. Priorizar visibilidad operativa y evitar tarjetas altas; no alterar unilateralmente el orden. Las 3–4 actividades visibles son **filas breves dentro de una superficie**, no tarjetas altas separadas. Gestos manuales accesibles, sin autoplay. Barra de navegación preservada.

**Ancho de escritorio:** nuestro monitor principal es **2560×1440** y también probamos en una TV **1920×1080**. QA debe incluir ambos viewports reales, además de 1440/1366 de compatibilidad y 390/320 en móvil. Inspeccionar ancho útil, sidebar, padding y límites CSS. Los topes `max-w-6xl` (1152 px) y `max-w-7xl` (1280 px) reportados en implementaciones recientes pueden seguir dejando Hoy innecesariamente angosto en 2560; **no asumir que pasar de uno al otro resolvió el problema**. Usar contenedor fluido con crecimiento acotado por composición y espacio útil: orientativamente ~1500–1650 px de contenido en 1920 y ~1750–1900 px en 2560, *a validar con medidas reales y legibilidad*, nunca como números sagrados. Evitar la solución opuesta de estirar filas/controles sin sentido. Aire debajo de la última sección es normal; **huecos dentro de tarjetas y texto/controles demasiado pequeños sí son defectos**. No inventar más datos, tarjetas o widgets para rellenar.

## 3. Especificaciones funcionales aprobadas que hay que preservar

### Hero
Saludo personal, fecha local, Cerrar día con reglas reales. **Eliminar la pastilla «DÍA» / «NOCHE» del hero por redundante**: el saludo ya indica el período y el ciclo horario sigue existiendo internamente para elegir la imagen. Dirección artística aprobada: fotografía auténtica/reconocible del **Cervino/Matterhorn**, a la derecha para dejar espacio al texto, cuatro variantes locales (amanecer, día, atardecer y noche) **independientes de tema claro/oscuro**. Pendiente: encontrar/verificar recursos y derechos. No sustituir por montañas genéricas ni fingir licencias. El hero actual con fallback sigue sin cumplir la identidad final.

### Agenda
Una sola Agenda de hoy (NO Foco de hoy + Tareas de hoy + Agenda). Proyectar hoy desde las entidades habilitadas que correspondan sin duplicar. Prioridad diferenciada dentro del elemento, nunca otra lista. Check real sólo para completables; evento/recordatorio/calendario/Gym informativo no debe mutar como tarea. Preservar persistencia, recurrencia, fecha local, Module Visibility y apertura de origen. Manual swipe / teclado y botones secundarios para pasar páginas de hasta cuatro actividades. Evitar etiquetas `FLEXIBLE`, `RUTINA`, `COMPLETAR` repetidas por tarjeta. No esconder prioridades importantes en páginas invisibles sin indicio. **Un solo indicador «1 / 2» o «Página 1 de 2» junto a las flechas superiores**, no otro texto aislado abajo y puntos redundantes. La última página con una sola actividad conserva altura natural: nada de caja enorme con tres espacios ficticios. Queremos poder ver la actividad pendiente vs la completada, sin ocultar inesperadamente historial del día; tras completar, la prioridad puede perder prominencia visual sin eliminar el dato. Los checks completados deben seguir legibles (el gris tenue actual es demasiado débil).

### Captura
Entrada única natural para notas/tareas/gastos/ingresos/exámenes. **No acumular atajos de teclado crípticos o redundantes; comprobar que el atajo mostrado corresponda a la acción real y al sistema operativo.** Atajos útiles, sin transformarla en chatbot ni duplicarla en móvil. Preservar borradores, validación y confirmación. Acceso móvil `+` bien visible y funcional.

### Notas
Exactamente **una fijada visible a la vez**, navegación manual horizontal con transición sutil entre varias; si sólo hay una, sin controles redundantes. Debajo hasta **dos recientes resumidas**, evitando repetir las fijadas. Tap abre esa nota específica en Notas, no sólo el módulo genérico. Contenido y contenedores compactos; nada de tarjetas gigantes por dos líneas.

### Estado
Tres métricas principales **energía, sueño, ánimo**. No usar «Contexto / En persona» como etiqueta principal (ese dato social existe, debe conservarse en datos). Edición real de hoy y últimos siete días; faltar dato ≠ cero. Evitar comparar sueño en horas con energía en escala 1–5 como si fueran la misma unidad. Actualmente se ha mostrado una vista de siete mini casillas y un espacio inferior desaprovechado. **Dirección visual más reciente para aprobar al verla funcionando:** conservar **energía, sueño y ánimo arriba** y aprovechar el espacio inferior de Estado con un **gráfico semanal útil** en lugar de limitar la tendencia a siete casilleros y dejar un hueco enorme. Alternar la serie de energía / sueño / ánimo, con cada escala correcta; tocar días debe permitir consulta y edición histórica. Esto modifica la presentación, no el registro ni la semántica de los datos. **No está aprobada todavía la apariencia exacta del gráfico ni si «Hoy/7 días» seguirá como conmutador o se integrará de otra forma**: resolver sin perder ninguna función anterior y validar visualmente. Con sólo un día, mostrar un punto y NO inventar una curva; sin datos, comunicarlo sobriamente y sin ocupar un vacío gigantesco. **La fecha seleccionada NO es automáticamente «Hoy»: en capturas apareció «mar · Hoy» mientras el hero indicaba jueves; verificar el flujo real y corregir la etiqueta cuando sea histórica, sin borrar su capacidad de edición.** En valores positivos/negativos, dar significado al color según la escala *real* del registro: la energía 1–5 puede usar rojo → naranja → amarillo → verde claro → verde. No usar un único naranja para toda energía. La leyenda, el número y la forma siguen siendo necesarios: no comunicar sólo mediante color. Para ánimo, investigar los valores reales antes de asignar colores; para sueño, horas ≠ bienestar: usar unidad neutral o metas existentes explícitas, nunca marcar 12 h como automáticamente «mejor» que 8 h. **No inventar una puntuación global 1–10 de bienestar**, aunque hayamos conversado sobre colores apropiados para 8/9/10 como inspiración.

### Actividad reciente
Resumir hechos reales: «Gasto en DirecTV», «Ingreso de arbitraje», «Nueva nota», etc.; **3 vistas previas por defecto, hasta 4 en monitores anchos cuando quepan sin truncar inútilmente los títulos**. Cada elemento seleccionable debe abrir **ese registro específico** (transacción, nota, entrenamiento, etc.) en su módulo, si existe infraestructura de navegación directa; no simular enlaces ni abrir genéricamente un módulo pretendiendo haber abierto el registro. Auditar rutas reales antes de implementarlo. **Nunca importes/saldos en Hoy**, ni en etiquetas secundarias o tooltip. Quitar cartel permanente «Sin montos privados». Revisar privacidad semántica de nombres de eventos cuando corresponda. No quitar todas las actividades financieras si existe una forma discreta de representarlas.


### Calidad visual e interacciones todavía pendientes (no fingir que están listas)

En las capturas reales posteriores al refinamiento, seguimos viendo **texto secundario demasiado pequeño, iconos poco expresivos/inconsistentes, colores y superficies sin suficiente carácter y ausencia del tick visible animado al completar**. Mejorar esto como **sistema coherente**, no como una sucesión de parches o una lluvia de efectos. No encoger texto para compactar; privilegiar tamaños cómodos y controles táctiles accesibles. El feedback de confirmación debe usar los recursos disponibles tras QA visual. La transición entre notas fijadas y grupos de Agenda ha de ser perceptible y suave, respetando movimiento reducido. Ninguna microanimación puede anticipar un guardado.

**Estado como ejemplo:** en el localhost real, incluso al registrar 4/5 de energía, 12 h de sueño y ánimo bajo, quedó media tarjeta vacía en escritorio; la vista de «7 días» mostraba sólo siete mini casillas y seguía dejando vacío. Esto justifica la propuesta del gráfico inferior útil, pero **no justifica estadísticas fingidas ni una línea trazada sobre días sin registros**.

**Pendiente transversal:** acordar reglas de tamaño de texto, familias tipográficas, radios, bordes, espaciados, iconos y motion y aplicarlas de manera consistente a Hoy; no hay autorización para retematizar todo LifeOS en una intervención sobre Hoy. La identidad global debe quedar documentada para reutilización posterior, sin divergencias entre módulos.

## 4. Activos recopilados que NO deben volver a perderse

**Biblioteca que recopilamos para LifeOS:** `LifeOS_Motion_44_Fuentes_Originales.zip` (verificado: **43 JSON + 1 `.lottie`**, más inventario, dictamen, README y hashes). No son 44 ideas abstractas: son recursos concretos recopilados y auditados preliminarmente. **No hay garantía de que estos archivos estén en el repositorio local de Windows**, por lo que el agente debe verificar acceso y pedirlos si faltan.

Candidatos con nombre exacto y aplicación propuesta, sin integrarlos ciegamente:

| Recurso aportado | Candidato en Hoy | Disparador correcto |
|---|---|---|
| `check violeta rápido.json` | Agenda: completación real | Reproducir una vez **después del guardado real**, contrastar visualmente con `check violeta.json`. Para el estado completado final, el color semántico puede ser verde; no recolorear la fuente sin probar ni alterar su integridad. |
| `check violeta.json` | Variante a comparar con check rápido | Seleccionar una sola variante, no duplicar efectos. |
| `lapiz revelacion para notas.json` | Creación o guardado explícito de nota | Nunca por cada pulsación de teclado. |
| `lista violeta - agenda de cosas a realizar.json` | Aparición contextual de agenda | Sólo si mejora orientación, no en cada navegación. |
| `calendario revelandose violeta.json` | Acción de calendario verificada | No animar cada fila ni cada evento. |
| `micrófono violeta.json` | Captura de voz si existe | Sólo cuando haya grabación real, no simular capacidades. |
| `Success Check.lottie` | Gym: sesión completada (no sustituye la animación de Hoy automáticamente) | Revisar transparencia y reproducción real. |

La biblioteca tiene también recursos de finanzas, reloj, alarma, banco, tarjeta, confeti y otros. **No introducirlos todos en el bundle ni improvisar nuevas funciones para poder utilizarlos**. Trofeo PR y llama de Gym existentes no deben sustituirse automáticamente; revisar si están dejando de animar. Verificar `prefers-reduced-motion`, peso lazy-load, compatibilidad temas y licencias/procedencia para distribución.

**Otras colecciones concretas que tenemos:** `LifeOS_Gym_SVG_encuadres_ajustados_V1.zip` con originales y ajustados, además de múltiples referencias visuales aportadas (Apple Fitness, Garmin, Gentler Streak, Oura, Revolut, etc.). Los SVG de Gym son una biblioteca específica de Gym, **no deben usarse de forma indiscriminada como identidad de Hoy**. Contamos con guías `guía_de_iconografía_para_lifeos_gym.png` y `sistema_de_iconografía_gym_lifeos.png`. Auditar autoría/licencias antes de publicar.


### Fuentes visuales e inspiración: distinguir evidencia de decisión

También compartimos referencias de interfaces y aplicaciones como **Apple Fitness, Gentler Streak, Garmin Connect, Oura, Revolut, Airbnb y Copilot**, además de referencias seleccionadas de Nexus/Donezo/ACRU/Shopeers/Skymetrics y dirección de Raycast. Cada una sirve como referencia de **jerarquía, claridad, gráficos, densidad, tipografía o interacción**, **no** como instrucción para copiar diseños ni importar funciones ajenas a Hoy. El material de Gym y Finanzas sigue perteneciendo principalmente a esos módulos. Validar concretamente qué pantalla o principio se reutiliza antes de afirmar que una referencia fue incorporada.

### Inventario accesible y limitaciones

El ZIP de motion incluye `inventario.csv`, `DICTAMEN_LIFEOS.md`, `LEEME.txt` y `SHA256SUMS.txt`. El dictamen **no comprobó reproducción visual real de todas las animaciones** y advierte que la procedencia/licencia de cada archivo no se puede inferir sólo de JSON. Por tanto, **44 recursos disponibles ≠ 44 animaciones seleccionadas o licenciadas para producción**. Distinguir pruebas locales de permisos de distribución futura; no anunciar conformidad comercial.

### Recursos que pertenecen a otros módulos o al futuro

La biblioteca de SVG de Gym y los posibles iconos para ejercicios **no deben convertirse en iconografía genérica de Hoy**. El trofeo para récord personal y la llama de racha que dejaron de animarse son problemas de Gym por revisar **por separado**. También son ideas futuras las sugerencias contextuales basadas en descanso/ejercicio, la edición retroactiva de entrenamientos y una asociación estructural inequívoca de prioridades con actividades. No agregarlas de contrabando para embellecer Hoy.

## 5. Lo que YA NO debe ocurrir

- **No** entregar un prompt que ignore la existencia de los recursos originales y proponga «agregar un tick animado» genérico sin comprobar la biblioteca disponible. La última intervención **reportó** la integración de `CompletionCheckMark` / `lifeos-micro-check-violet.json`; antes de reescribirla hay que comprobar en navegador que se reproduzca, que corresponda a una confirmación persistida y que respete movimiento reducido.
- **No** reemplazar criterios recientes por documentos maestros antiguos sin conciliar decisiones y fechas.
- **No** aprobar un diseño porque `npm test`, eslint o build pasaron. La captura en un mock con datos inventados no sustituye pruebas con la app local y datos reales.
- **No** modificar 1000 líneas antes de verificar la composición y el resultado a tamaños reales; el agente debe autoauditar capturas y corregir desviaciones de alcance antes de informar completado.
- **No** hacer commit, push o deploy sin autorización. Proteger cambios locales de otras sesiones. No cambiar E2EE, sincronización, finanzas o modelos de dominio durante un trabajo visual.
- **No** prometer un «cierre definitivo» si las interacciones, assets, densidad, tipografía, tema oscuro/claro y motion siguen sin comprobarse. Tampoco abrir una iteración infinita: registrar explicitamente lo que se aprobó, lo que falta y los bloqueos.

## 6. Protocolo obligatorio para futuras intervenciones

1. **Partir de este contrato y del estado real del repositorio**; anotar cualquier conflicto entre documentación histórica y decisión nueva, y resolver a favor de la decisión expresa más reciente que tomamos.
2. **Inventariar activos efectivamente disponibles** y documentar qué animaciones/iconos ya existen, cuáles funcionan, cuáles faltan, y dónde hay incertidumbre legal o técnica.
3. Para cada sección de Hoy, indicar **qué ya cumple / qué incumple / qué se quiere conseguir**. No iniciar otro rediseño de arquitectura.
4. Producir evidencia de Desktop 2560×1440, TV 1920×1080 y móvil 390×844 (además compatibilidad 320), en ambos temas, con datos reales si los hay y pruebas separadas claramente marcadas.
5. Validar microinteracción real con eventos reales: guardado de tarea, navegación de notas, selección de día y edición histórica. El estado vacío también tiene que funcionar, pero no es un motivo para falsear contenido.
6. Entregar un informe conciso: lo que quedó implementado, assets utilizados o descartados con motivo, tests y capturas, riesgos y pendientes; **la aprobación final la hacemos nosotros al evaluar el resultado real, no el agente**.

**Regla de memoria del proyecto:** una decisión aprobada o un recurso que reunimos no puede desaparecer silenciosamente al cambiar de agente o abrir un nuevo chat. Este archivo puede guardarse en el repo para que los agentes lo lean, pero no debe incluirse en un commit sin nuestra autorización expresa.


## 7. Criterios de cierre verificables, no de apariencia fingida

- **Escritorio real:** comparar 2560×1440 y 1920×1080; registrar ancho de viewport, ancho disponible tras sidebar y ancho usado por Hoy. Un límite central estrecho no se justifica por pruebas exclusivas de 1280×900. Tampoco estirar actividades hasta que parezcan barras interminables. Un vacío **debajo de la última sección** puede ser normal; el vacío masivo **dentro de Estado** no lo es.
- **Móvil real:** probar 390×844 y 320×640 **desde el inicio de la página**, no capturas desplazadas que se presentan como primer viewport. Ver si Agenda es accesible pronto, con sus cuatro filas compactas, sin violar tamaños táctiles ni ocultar contenido bajo la barra inferior.
- **Estado:** valores reales arriba, propuesta de visualización semanal abajo sin datos falsos; métricas independientes, selección/edición histórica conservada, diferencia clara entre sin dato y cero; rendimiento y legibilidad con 0, 1 o 7 fechas pobladas.
- **Agenda:** comprobar que el tick animado corresponde a un guardado efectivo, reabrir sincroniza; completables vs eventos correctamente distinguidos; ningún duplicado; página final de un solo elemento no genera un gran agujero; texto largo no rompe el layout; ni prioridad ficticia ni check decorativo.
- **Notas:** una fijada, dos recientes, apertura exacta y swipe real; el carrusel no rota solo y tiene alternativa para teclado.
- **Actividad:** sin montos/saldos por ningún canal de presentación, incluido accesibilidad, título y tooltip; textos de acción legibles sin rotular constantemente «Sin montos privados».
- **Visual/motion:** comparar en claro y oscuro con nuestros recursos; registrar qué fuente Lottie/icono se usó realmente, su disparador, carga y fallback reduced motion; fotografías verificables del Cervino o bloqueo documentado, nunca fingir que el fondo plano es la identidad definitiva.
- **Protección:** preservar estado local no confirmado, no deshacer cambios ajenos, no commit/push/deploy, no tocar integridad, E2EE ni sincronización durante pulido visual. Tests, lint, typecheck y build respaldan la implementación, pero **no sustituyen estas comprobaciones**.

## 8. Cosas que NO sabemos con certeza y no debemos completar a ojo

- Cuál combinación exacta de fuentes, grosores, tamaños, pictogramas y motion aprobamos visualmente en funcionamiento: **hay dirección de arte, aún no aprobación final de sistema tipográfico/iconográfico**.
- Qué animación de check se ve mejor reproducida en **nuestra interfaz** y en ambos temas; decidir después de comparar originales visualmente.
- Si la presentación de Estado con gráfico inferior debe conservar el conmutador «Hoy / 7 días», reformularlo o permitir alternar series con otra interacción: mantener funciones y solicitar revisión visual antes de darla por cerrada.
- Licencias de los recursos fotográficos y motion para futura distribución: **pendiente de verificación**.

## 9. Decisiones adicionales de nuestra última revisión visual — vinculantes para el siguiente trabajo de Codex

Estas decisiones provienen de las capturas reales 1920×1080/2560×1440 y la captura anotada. Son **más recientes** que las pautas generales anteriores; si alguna formulación antigua se contradice con ellas, aplicar estas precisiones. **No son una autorización para cambiar la estructura C.**

| Zona | Defecto que observamos | Resultado requerido |
|---|---|---|
| Hero | Pastilla «DÍA»/«NOCHE» que repite lo que ya dice el saludo | Ocultarla; preservar selección interna de fase para las futuras 4 fotografías verificadas del Cervino |
| Estado: fecha | Puede verse «mar · Hoy» mientras el día actual es jueves | Etiqueta de día seleccionado coherente con su fecha real; si es histórico, mostrar fecha correcta sin llamarlo Hoy. Mantener edición histórica |
| Estado: gráfico | Barras mínimas casi idénticas y del mismo naranja, sin comunicar escala ni estado | Gráfico semanal claro, con una serie seleccionable, magnitudes y colores semánticos por valor cuando proceda, días tocables y edición histórica; faltantes como ausencia, nunca como 0; colores acompañados por texto/valor |
| Estado: color | Queremos rojos, amarillos, verdes y transiciones entre estados, no un único acento monótono | Energía 1–5 con escala cromática ordenada; mapear ánimo sólo después de inspeccionar su dominio real; horas de sueño no equivalen automáticamente a calidad de descanso; no inventar score global 1–10 |
| Agenda | «Página 1 de 2» separada abajo + dots y flechas en otro lado | Integrar paginación única junto a flechas en la cabecera, eliminar duplicaciones y conservar swipe/táctil/teclado |
| Agenda: estado | Tareas completadas demasiado apagadas y etiquetas de prioridad aún dominantes | Mantener texto legible y reducir énfasis visual de prioridad ya completada; no borrar ni ocultar inesperadamente actividades |
| Actividad reciente | Demasiado truncado, ítems rígidos y sin destino exacto claro | Franja con 3 elementos típicos y 4 si hay espacio útil; anchos según contenido, truncamiento sensato, acceso al registro correspondiente si el dominio lo soporta, nunca datos financieros numéricos en Hoy |
| Economía informativa | Subtítulos «A mano cuando importa», «Energía, sueño y ánimo», indicadores duplicados, etiquetas crípticas | Eliminar elementos redundantes o puramente ornamentales; **no** eliminar labels necesarios para comprender, operar, distinguir fechas o accesibilidad |
| Identidad visual | Tipografía secundaria pequeña, iconos genéricos, contraste débil, ausencia de motion perceptible | Sistema coherente de tamaños, grosor iconográfico, color semántico, luz/oscuridad y movimiento sobrio. Comprobar los assets originales y lo ya integrado antes de sumar código |
| Escritorio grande | Hoy queda demasiado concentrado en el centro de 2560×1440 | Contenedor realmente fluido, con límites razonables por sección, manteniendo la misma opción C, sin estirar filas a lo absurdo ni rellenar con contenido falso |
| Evidencia | Capturas preparadas pueden ocultar problemas con datos cotidianos; tests verdes no prueban calidad | Capturas y mediciones comparables en 2560×1440 y 1920×1080, 390 y 320; ambos temas; 0/1/varios datos; inicio móvil sin scroll artificial; QA visual y funcional |

### Entrega única con Codex: cómo evitar el ciclo de prompts

- Darle **este contrato completo**, `docs/hoy-v1.md`, los assets e inventarios existentes, y las capturas actuales anotadas. Leer instrucciones vigentes y hacer `git status` antes de editar. Los antiguos prompts no deben usarse como órdenes nuevas.
- Pedir una **sola intervención** con diagnóstico de causa, implementación acotada y **autoverificación de capturas en el navegador**, con oportunidad de autocorregir defectos obvios durante la misma ejecución. No confundir «plan» con otro ciclo de autorización: todo lo que aquí figura como aprobado puede implementarse sin nuevas preguntas; los bloqueos irreversibles o que exijan cambios de dominio sí deben documentarse.
- Preservar toda modificación local preexistente y no tocar E2EE/sync, Gym, Finanzas ni registros reales para generar capturas. No commit, push ni deploy. Probar funcionalidades, types, lint, tests y `npm run build` al final.
- Inspeccionar y **verificar, no rehacer a ciegas**, el Lottie reportado de tick, el selector semanal, las rutas directas desde Actividad y el ancho CSS. Diferenciar comprobación de implementación nueva.
- **No considerar completado** si hay confusiones de fecha («mar · Hoy»), malas visualizaciones, datos privados visibles, navegación falsa, contraste insuficiente, excesos de texto, o Hoy inútilmente angosto en 2560.
- El hero fotográfico definitivo depende de encontrar **cuatro imágenes auténticas y con derechos de uso verificables**. Si los recursos no existen, no inventar fotos/licencias ni paralizar las otras correcciones. Registrar un pendiente específico, no fingir cumplimiento.

**Conclusión vinculante:** La estructura de Hoy no necesita otra reconstrucción. Lo que tenemos que terminar es **la expresión visual real y coherente de la opción C**, el gráfico útil de Estado, navegación correcta, motion original, economía informativa y adaptación fluida a 2560. La revisión manual final sigue siendo nuestra; no volver a declarar terminado algo que todavía no vimos funcionar bien.
