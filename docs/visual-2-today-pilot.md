# LifeOS Visual 2.0 — piloto de Hoy

Estado: implementado para evaluación del usuario; no constituye aprobación visual.

## Reglas aplicadas

- El violeta `#4F46E5` identifica acciones y foco. Los estados de éxito, aviso y riesgo conservan sus colores semánticos.
- Hoy usa superficies neutras, bordes discretos, tipografía compacta y una combinación deliberada de secciones abiertas con tarjetas sólo donde aportan agrupación.
- En escritorio la primera franja de contenido separa Foco/Tareas, Agenda/Estado y Notas. En móvil el orden es Foco, Tareas, Agenda, Notas y Estado.
- El formulario permanente de tarea rápida se oculta en móvil. La captura móvil entra por el botón `+` existente.
- Los bloques de Agenda conservan el mismo `taskLog` y la misma confirmación de dependencias que usaba la lista de tareas de Hoy; sólo cambia su presentación.
- Agenda muestra bloques horarios y eventos/calendario reales. Se excluyen explícitamente compromisos financieros e importes.
- El hero conserva saludo, fecha y acceso a Cerrar día. Su altura es compacta y su ciclo visual depende de la hora local, nunca del tema.
- Claro y oscuro comparten jerarquía, no una inversión automática: cada tema usa sus propios tokens de superficie, borde, texto y control.

## Ciclos del hero

La lógica existente se mantiene:

- Amanecer: 06:00–11:59.
- Día: 12:00–17:59.
- Atardecer: 18:00–19:59.
- Noche: 20:00–05:59.

Los cuatro slots fotográficos están preparados en `AlpineDayCycleBackdrop`. Los JPG existentes no representan de forma verificable al Matterhorn/Cervino y, por lo tanto, no se presentan como si lo hicieran. Hasta contar con cuatro fotografías definitivas, coherentes y con licencia/procedencia aprobada, el hero usa el fallback atmosférico neutro del ciclo horario.

## Pendientes de validación visual

- Seleccionar y aprobar cuatro fotografías del Matterhorn con encuadre consistente y espacio negativo para el saludo.
- Validar la densidad de las tres columnas con los datos reales del usuario y en resoluciones intermedias.
- Confirmar con uso cotidiano si Actividad reciente debe conservarse desplegada al final de Hoy.
- La aprobación final de claro y oscuro corresponde al usuario después de utilizar la pantalla.
