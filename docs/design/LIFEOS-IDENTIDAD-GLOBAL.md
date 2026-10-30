# Identidad global de LifeOS

Guía compartida para Hoy, Gimnasio, Finanzas y Organización. Documenta la dirección aprobada; Hoy es la primera aplicación visual. No autoriza una migración de los otros módulos.

- **Identidad:** sapphire `#2563EB` en claro y `#3B82F6` en oscuro para navegación activa y CTA principal. Los tokens vigentes son `--accent` y `--blue` en `src/index.css`. Verde, rojo, ámbar y otros colores indican hechos o dominios concretos, sin sustituir la identidad de la app.
- **Tipo:** una familia sobria y consistente, sin descargas externas: Segoe UI Variable / SF Pro / Inter / sistema. Cuerpo de 14–16 px, metadata desde 13 px y títulos de sección de 16–18 px. No compactar mediante texto de 9–10 px ni mayúsculas sistemáticas.
- **Iconos:** `AppIcon` es la familia de trazo vigente. Alinear tamaño, peso y posición; reservar SVG de aparatos y músculos para Gym. Animaciones sólo cuando aportan información del evento.
- **Superficies:** tarjetas suaves combinadas con zonas abiertas, jerarquía por espaciado y contraste. Evitar contornos repetidos, sombras pesadas, glassmorphism y degradados de relleno.
- **Motion:** breve, manual o posterior a un hecho guardado. Sin autoplay de carruseles ni loops decorativos. Respetar `prefers-reduced-motion`, foco visible y estado final estático legible. `LifeOSLottie` hace carga diferida; el recurso usado debe conservar licencia y procedencia verificadas antes de distribución.
- **Claro y oscuro:** evaluar contraste de texto secundario, estados, gráfico y foco en ambos temas. No asumir que invertir colores preserva jerarquía.
- **Privacidad:** Hoy no presenta importes ni saldos por texto, tooltip, `title`, `aria-label` o atributos auxiliares. Los nombres contextuales requieren la misma prudencia que el módulo de origen.

Las cinco fotografías locales del Cervino están integradas desde `assets/hero/alpine-day-cicle/`. Fueron aportadas para esta intervención; el repositorio todavía no incluye autor, fuente ni licencia, por lo que esa acreditación debe resolverse antes de una distribución pública. El hero conserva un fallback sobrio ante error de carga. Los derechos de los Lotties también siguen pendientes de verificación.
