# Hoy V1 — decisiones funcionales

Estado: piloto implementado para evaluación manual. No implica aprobación visual ni de producto.

## Responsabilidades de Hoy

Hoy sigue la Opción C del contrato revisado del 15 de octubre de 2026: hero compacto, captura en escritorio (botón + en móvil), Notas y Estado en dos columnas de escritorio, Agenda unificada y Actividad reciente. Foco y Tareas dejaron de existir como secciones independientes.

## Agenda unificada

- La proyección `getTodayAgendaEntries` es sólo de presentación; no crea ni migra entidades.
- Incluye bloques de Agenda, rutinas recurrentes, tareas de Hoy, tareas de proyecto con vencimiento hoy, seguimientos de Trabajo, eventos de Calendario, exámenes y una rutina de Gym realmente programada.
- Respeta `Module Visibility` antes de incluir información de Agenda, Calendario, Estudios, Notas/Proyectos, Trabajo o Gimnasio.
- Las prioridades manuales existentes se muestran como una distinción `Prioridad` dentro de la actividad correspondiente. Las prioridades sin coincidencia conservan su propia operación existente.
- La deduplicación es conservadora y sólo elimina coincidencias exactas de presentación. No fusiona modelos ni cambia la semántica de vínculos de Agenda.
- Sólo las fuentes con operación real de completación muestran check: bloques, rutinas, tareas, tareas de proyecto, seguimientos y prioridades heredadas. Eventos, exámenes y la rutina programada de Gym abren su módulo y no reciben un check artificial.
- El orden conserva todo el día, horario, prioridad manual y estado de completación. No hay priorización por IA ni ocultamiento algorítmico.
- La interfaz presenta una lista vertical de ancho completo. Cinco actividades se muestran directamente; los días más cargados crecen con altura natural, sin paginación ni scroll interno.
- La hora se conserva como dato estructurado y ordena primero las actividades programadas. Las actividades sin hora aparecen después sin inventar una.

## Estado

- La vista principal muestra energía, sueño y ánimo. El antiguo campo `connection` significa contacto social (`solo`, `mensaje`, `encuentro`). Se retiró del resumen porque su etiqueta anterior era ambigua, pero permanece almacenado sin cambios.
- La vista de siete días usa tres escalas separadas: energía y ánimo sobre 5, sueño en horas. Un valor ausente se muestra como `—`, no como cero.
- Seleccionar un día permite completar o editar ese registro usando `upsertDailyContext`; los demás campos históricos de la entrada se preservan.
- No hay rotación automática.

## Notas y actividad

- Se muestra una nota fijada por vez. Varias fijadas se recorren manualmente con gesto, controles o indicadores; no existe temporizador.
- Se muestran como máximo dos notas recientes y nunca se repite una nota fijada.
- Seleccionar una nota abre directamente su editor en Notas mediante su identificador existente.
- Actividad reciente muestra hechos cronológicos reales sin importes financieros. Las notas abren el registro exacto; los demás módulos sólo se abren de forma genérica hasta contar con rutas fiables por identificador.
- Las sesiones de Gym usan el nombre histórico de rutina cuando la sesión lo conserva. Los descansos aparecen únicamente cuando existe un registro explícito y no duplican un entrenamiento de la misma fecha.

## Hero, tema y recursos visuales

- El ciclo madrugada/mañana/día/atardecer/noche depende de la hora local y es independiente del tema claro/oscuro. El saludo usa sus propios tres intervalos horarios.
- Las cinco imágenes locales de `assets/hero/alpine-day-cicle/` muestran el Cervino y se empaquetan para uso offline. Su autoría, procedencia original y licencia siguen pendientes de documentación antes de distribuirlas.
- Si una imagen no carga, el encabezado conserva un fallback neutro y legible.
- Cerrar día se ofrece mientras el registro actual no contiene `closedAt`; después se muestra el estado cerrado.

## Pendientes fuera de alcance

- Completar la ficha de autoría, procedencia y licencia de las cinco fotografías del Cervino antes de distribuirlas.
- Registrar entrenamientos y descansos de Gym en fechas pasadas requiere diseño dentro de Gym y no se implementa en Hoy V1.
- Una relación explícita entre `dailyPriorities` y las entidades de tareas permitiría eliminar la deduplicación textual conservadora. Requiere una decisión de dominio y una estrategia de migración.
